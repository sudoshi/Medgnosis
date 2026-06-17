// =============================================================================
// EHR SMART launch routes
// Standalone plugin for SMART launch initiation and callback handling.
// =============================================================================

import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  completeSmartLaunchCallback,
  createSmartLaunchState,
  findSmartLaunchSessionByState,
  loadSmartLaunchConfig,
} from '../../services/ehr/smartLaunch.js';

interface LaunchParams {
  tenantId: string;
}

interface LaunchQuery {
  iss?: string;
  launch?: string;
  redirect_uri?: string;
  return_to?: string;
  scope?: string;
}

interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

interface RequestUserRef {
  sub?: string;
  org_id?: string;
}

export default async function ehrSmartLaunchRoutes(fastify: FastifyInstance): Promise<void> {
  const optionalAuth = typeof fastify.optionalAuth === 'function'
    ? fastify.optionalAuth
    : async () => undefined;

  fastify.get<{ Querystring: CallbackQuery }>('/callback', async (request, reply) => {
    const { code, state, error, error_description: errorDescription } = request.query;

    if (error) {
      return sendError(reply, 400, 'SMART_LAUNCH_DENIED', errorDescription ?? error);
    }
    if (!code || !state) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'SMART callback requires code and state');
    }

    const consumed = await completeLaunchWithConfig(state, code);
    if ('error' in consumed) {
      return sendError(reply, consumed.status, consumed.code, consumed.message);
    }

    if (consumed.session.appRedirectUrl) {
      return reply.redirect(appendSessionId(consumed.session.appRedirectUrl, consumed.session.id));
    }

    return reply.send({
      success: true,
      data: {
        session_id: consumed.session.id,
        ehr_tenant_id: consumed.session.ehrTenantId,
        launch_context: consumed.launchContext,
      },
    });
  });

  fastify.get<{ Params: LaunchParams; Querystring: LaunchQuery }>(
    '/standalone/:tenantId',
    { preHandler: [optionalAuth] },
    async (request, reply) => startLaunch(request.params.tenantId, request.query, reply, {
      launchMode: 'standalone',
      user: request.user as RequestUserRef | undefined,
    }),
  );

  fastify.get<{ Params: LaunchParams; Querystring: LaunchQuery }>(
    '/:tenantId',
    { preHandler: [optionalAuth] },
    async (request, reply) => startLaunch(request.params.tenantId, request.query, reply, {
      launchMode: 'ehr',
      user: request.user as RequestUserRef | undefined,
    }),
  );

  async function startLaunch(
    tenantIdParam: string,
    query: LaunchQuery,
    reply: FastifyReply,
    options: { launchMode: 'ehr' | 'standalone'; user: RequestUserRef | undefined },
  ) {
    const tenantId = positiveInt(tenantIdParam);
    if (!tenantId) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'tenantId must be a positive integer');
    }

    const config = await loadSmartLaunchConfig(tenantId);
    if (!config) {
      return sendError(reply, 404, 'EHR_TENANT_NOT_FOUND', 'No enabled SMART launch client exists for this EHR tenant');
    }

    const redirectUriResult = selectRedirectUri(query.redirect_uri, config.redirectUris);
    if ('error' in redirectUriResult) {
      return sendError(reply, redirectUriResult.status, redirectUriResult.code, redirectUriResult.message);
    }

    const appRedirectUrl = validateReturnTo(query.return_to);
    if (appRedirectUrl === false) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'return_to must be a same-origin relative URL');
    }

    const userOrgId = parseOrgId(options.user?.org_id);
    if (userOrgId && config.tenant.orgId && userOrgId !== config.tenant.orgId) {
      return sendError(reply, 403, 'EHR_TENANT_ORG_MISMATCH', 'Authenticated user cannot launch this EHR tenant');
    }
    const orgId = config.tenant.orgId ?? userOrgId;
    const scope = query.scope ?? defaultScopeForLaunchMode(config.scopesRequested, options.launchMode);

    const created = await createSmartLaunchState({
      ehrTenantId: config.tenant.id,
      orgId,
      userId: options.user?.sub ?? null,
      clientRegistrationId: config.clientRegistrationId,
      clientId: config.clientId,
      authorizationEndpoint: config.authorizationEndpoint,
      fhirBaseUrl: config.tenant.fhirBaseUrl,
      redirectUri: redirectUriResult.redirectUri,
      appRedirectUrl,
      issuer: query.iss ?? null,
      launch: options.launchMode === 'ehr' ? query.launch ?? null : null,
      scope,
    });

    return reply.redirect(created.authorizationUrl);
  }

  async function completeLaunchWithConfig(
    state: string,
    code: string,
  ): Promise<
    | Awaited<ReturnType<typeof completeSmartLaunchCallback>>
    | { error: true; status: number; code: string; message: string }
  > {
    try {
      const consumed = await completeSmartLaunchCallback({
        state,
        code,
        config: await configForConsumedState(state),
      });
      return consumed;
    } catch (err) {
      const maybe = err as { status?: number; code?: string; message?: string };
      return {
        error: true,
        status: maybe.status ?? 500,
        code: maybe.code?.toUpperCase() ?? 'SMART_LAUNCH_FAILED',
        message: maybe.message ?? 'SMART launch callback failed',
      };
    }
  }

  async function configForConsumedState(state: string) {
    const session = await findSmartLaunchSessionByState(state);
    if (!session) {
      throw Object.assign(new Error('SMART launch state is invalid or expired'), {
        code: 'invalid_smart_launch_state',
        status: 400,
      });
    }

    const config = await loadSmartLaunchConfig(session.ehrTenantId);
    if (!config) {
      throw Object.assign(new Error('No enabled SMART launch client exists for this EHR tenant'), {
        code: 'ehr_tenant_not_found',
        status: 404,
      });
    }
    return {
      tenant: config.tenant,
      clientId: config.clientId,
      tokenEndpoint: config.tokenEndpoint,
      authMethod: config.authMethod,
      clientSecretRef: config.clientSecretRef,
      jwksUrl: config.jwksUrl,
      privateKeyRef: config.privateKeyRef,
    };
  }
}

function sendError(reply: FastifyReply, status: number, code: string, message: string): FastifyReply {
  return reply.status(status).send({
    success: false,
    error: { code, message },
  });
}

function positiveInt(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOrgId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function selectRedirectUri(
  requested: string | undefined,
  registered: string[],
): { redirectUri: string } | { error: true; status: number; code: string; message: string } {
  if (registered.length === 0) {
    return {
      error: true,
      status: 503,
      code: 'SMART_CLIENT_NOT_CONFIGURED',
      message: 'SMART launch client has no registered redirect URI',
    };
  }
  if (!requested) return { redirectUri: registered[0]! };
  if (!registered.includes(requested)) {
    return {
      error: true,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'redirect_uri is not registered for this SMART launch client',
    };
  }
  return { redirectUri: requested };
}

function validateReturnTo(value: string | undefined): string | null | false {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  return value;
}

function defaultScopeForLaunchMode(scope: string, launchMode: 'ehr' | 'standalone'): string {
  if (launchMode === 'ehr') return scope;

  const items = scope.split(/\s+/).filter(Boolean);
  const normalized = items.filter((item) => item !== 'launch');
  if (!normalized.includes('launch/patient')) {
    normalized.push('launch/patient');
  }
  return normalized.join(' ');
}

function appendSessionId(url: string, sessionId: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}smart_session_id=${encodeURIComponent(sessionId)}`;
}
