// =============================================================================
// EHR SMART launch routes
// Standalone plugin for SMART launch initiation and callback handling.
// =============================================================================

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  completeSmartLaunchCallback,
  consumeSmartLaunchHandoff,
  createSmartLaunchHandoff,
  createSmartLaunchState,
  findSmartLaunchSessionByState,
  loadSmartLaunchConfig,
} from '../../services/ehr/smartLaunch.js';
import type { SmartLaunchConfig } from '../../services/ehr/smartLaunch.js';

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

interface CompleteBody {
  smart_handoff?: string;
}

interface RequestUserRef {
  sub?: string;
  org_id?: string;
  session_id?: string;
}

const SMART_LAUNCH_RATE_LIMIT = { max: 30, timeWindow: '1 minute' } as const;
const SMART_CALLBACK_RATE_LIMIT = { max: 20, timeWindow: '1 minute' } as const;
const SMART_HANDOFF_RATE_LIMIT = { max: 20, timeWindow: '1 minute' } as const;

export default async function ehrSmartLaunchRoutes(fastify: FastifyInstance): Promise<void> {
  const optionalAuth = typeof fastify.optionalAuth === 'function'
    ? fastify.optionalAuth
    : async () => undefined;
  const requiredAuth = typeof fastify.authenticate === 'function'
    ? fastify.authenticate
    : async (_request: FastifyRequest, reply: FastifyReply) => {
      await sendError(reply, 401, 'UNAUTHORIZED', 'Authentication is required');
    };

  fastify.get<{ Querystring: CallbackQuery }>(
    '/callback',
    { config: { rateLimit: SMART_CALLBACK_RATE_LIMIT } },
    async (request, reply) => {
      const { code, state, error, error_description: errorDescription } = request.query;

      if (error) {
        await auditSmartLaunch(request, 'ehr_smart_callback_failed', 'ehr_smart_launch', undefined, {
          status: 400,
          code: 'SMART_LAUNCH_DENIED',
          smartError: error,
        });
        return sendError(reply, 400, 'SMART_LAUNCH_DENIED', errorDescription ?? error);
      }
      if (!code || !state) {
        await auditSmartLaunch(request, 'ehr_smart_callback_failed', 'ehr_smart_launch', undefined, {
          status: 400,
          code: 'VALIDATION_ERROR',
        });
        return sendError(reply, 400, 'VALIDATION_ERROR', 'SMART callback requires code and state');
      }

      const consumed = await completeLaunchWithConfig(state, code);
      if ('error' in consumed) {
        await auditSmartLaunch(request, 'ehr_smart_callback_failed', 'ehr_smart_launch', undefined, {
          status: consumed.status,
          code: consumed.code,
        });
        return sendError(reply, consumed.status, consumed.code, consumed.message);
      }

      const handoff = await createSmartLaunchHandoff(consumed.session.id);
      await auditSmartLaunch(request, 'ehr_smart_callback_success', 'ehr_smart_launch_session', consumed.session.id, {
        ehrTenantId: consumed.session.ehrTenantId,
        orgId: consumed.session.orgId,
        userBound: Boolean(consumed.session.userId),
        hasPatientContext: Boolean(consumed.launchContext.patient),
        handoffCreated: true,
        appRedirect: Boolean(consumed.session.appRedirectUrl),
      });
      if (consumed.session.appRedirectUrl) {
        return reply.redirect(appendHandoffCode(consumed.session.appRedirectUrl, handoff.handoffCode));
      }

      return reply.send({
        success: true,
        data: {
          smart_handoff: handoff.handoffCode,
          handoff_expires_at: handoff.expiresAt,
          ehr_tenant_id: consumed.session.ehrTenantId,
          patient_sync: consumed.session.launchContext['patientSync'] ?? null,
          launch_context: consumed.launchContext,
        },
      });
    },
  );

  fastify.post<{ Body: CompleteBody }>(
    '/complete',
    { config: { rateLimit: SMART_HANDOFF_RATE_LIMIT }, preHandler: [requiredAuth] },
    async (request, reply) => {
      const smartHandoff = typeof request.body?.smart_handoff === 'string'
        ? request.body.smart_handoff.trim()
        : '';
      if (!smartHandoff) {
        await auditSmartLaunch(request, 'ehr_smart_handoff_failed', 'ehr_smart_launch', undefined, {
          status: 400,
          code: 'VALIDATION_ERROR',
        });
        return sendError(reply, 400, 'VALIDATION_ERROR', 'smart_handoff is required');
      }

      const user = request.user as RequestUserRef | undefined;
      if (!user?.sub) {
        await auditSmartLaunch(request, 'ehr_smart_handoff_failed', 'ehr_smart_launch', undefined, {
          status: 401,
          code: 'UNAUTHORIZED',
        });
        return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication is required');
      }

      const completed = await consumeSmartLaunchHandoff({
        handoffCode: smartHandoff,
        userId: user.sub,
        orgId: parseOrgId(user.org_id),
        appSessionId: user.session_id ?? null,
      });
      if (!completed) {
        await auditSmartLaunch(request, 'ehr_smart_handoff_failed', 'ehr_smart_launch', undefined, {
          status: 404,
          code: 'SMART_HANDOFF_INVALID',
          userBound: true,
        });
        return sendError(reply, 404, 'SMART_HANDOFF_INVALID', 'SMART launch handoff is invalid or expired');
      }

      await auditSmartLaunch(request, 'ehr_smart_handoff_complete', 'ehr_smart_launch_session', completed.session.id, {
        ehrTenantId: completed.session.ehrTenantId,
        orgId: completed.session.orgId,
        userBound: true,
        appSessionBound: Boolean(user.session_id),
        patientResolved: completed.patientId !== null,
      });
      return reply.send({
        success: true,
        data: {
          smart_session_id: completed.session.id,
          ehr_tenant_id: completed.session.ehrTenantId,
          patient_id: completed.patientId,
          patient_sync: completed.session.launchContext['patientSync'] ?? null,
          launch_context: completed.session.launchContext,
        },
      });
    },
  );

  fastify.get<{ Params: LaunchParams; Querystring: LaunchQuery }>(
    '/standalone/:tenantId',
    { config: { rateLimit: SMART_LAUNCH_RATE_LIMIT }, preHandler: [optionalAuth] },
    async (request, reply) => startLaunch(request, reply, {
      launchMode: 'standalone',
      user: request.user as RequestUserRef | undefined,
    }),
  );

  fastify.get<{ Params: LaunchParams; Querystring: LaunchQuery }>(
    '/:tenantId',
    { config: { rateLimit: SMART_LAUNCH_RATE_LIMIT }, preHandler: [optionalAuth] },
    async (request, reply) => startLaunch(request, reply, {
      launchMode: 'ehr',
      user: request.user as RequestUserRef | undefined,
    }),
  );

  async function startLaunch(
    request: FastifyRequest<{ Params: LaunchParams; Querystring: LaunchQuery }>,
    reply: FastifyReply,
    options: { launchMode: 'ehr' | 'standalone'; user: RequestUserRef | undefined },
  ) {
    const query = request.query;
    const tenantId = positiveInt(request.params.tenantId);
    if (!tenantId) {
      await auditLaunchDenied(request, null, options.launchMode, 400, 'VALIDATION_ERROR', {
        reason: 'invalid_tenant_id',
      });
      return sendError(reply, 400, 'VALIDATION_ERROR', 'tenantId must be a positive integer');
    }

    const config = await loadSmartLaunchConfig(tenantId);
    if (!config) {
      await auditLaunchDenied(request, tenantId, options.launchMode, 404, 'EHR_TENANT_NOT_FOUND');
      return sendError(reply, 404, 'EHR_TENANT_NOT_FOUND', 'No enabled SMART launch client exists for this EHR tenant');
    }

    const redirectUriResult = selectRedirectUri(query.redirect_uri, config.redirectUris);
    if ('error' in redirectUriResult) {
      await auditLaunchDenied(
        request,
        tenantId,
        options.launchMode,
        redirectUriResult.status,
        redirectUriResult.code,
      );
      return sendError(reply, redirectUriResult.status, redirectUriResult.code, redirectUriResult.message);
    }

    const appRedirectUrl = validateReturnTo(query.return_to);
    if (appRedirectUrl === false) {
      await auditLaunchDenied(request, tenantId, options.launchMode, 400, 'VALIDATION_ERROR', {
        reason: 'invalid_return_to',
      });
      return sendError(reply, 400, 'VALIDATION_ERROR', 'return_to must be a same-origin relative URL');
    }

    const userOrgId = parseOrgId(options.user?.org_id);
    if (userOrgId && config.tenant.orgId && userOrgId !== config.tenant.orgId) {
      await auditLaunchDenied(request, tenantId, options.launchMode, 403, 'EHR_TENANT_ORG_MISMATCH', {
        authenticated: true,
      });
      return sendError(reply, 403, 'EHR_TENANT_ORG_MISMATCH', 'Authenticated user cannot launch this EHR tenant');
    }
    const launchContextResult = validateLaunchIssuerAndContext(query, config, options.launchMode);
    if ('error' in launchContextResult) {
      await auditLaunchDenied(
        request,
        tenantId,
        options.launchMode,
        launchContextResult.status,
        launchContextResult.code,
      );
      return sendError(
        reply,
        launchContextResult.status,
        launchContextResult.code,
        launchContextResult.message,
      );
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
      issuer: launchContextResult.issuer,
      launch: launchContextResult.launch,
      scope,
    });

    await auditSmartLaunch(request, 'ehr_smart_launch_start', 'ehr_tenant', String(config.tenant.id), {
      launchMode: options.launchMode,
      smartSessionId: created.session.id,
      orgId,
      userBound: Boolean(options.user?.sub),
      clientRegistrationId: config.clientRegistrationId,
      hasAppRedirectUrl: Boolean(appRedirectUrl),
      issuerValidated: Boolean(launchContextResult.issuer),
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
    if (session.clientRegistrationId !== null && session.clientRegistrationId !== config.clientRegistrationId) {
      throw Object.assign(new Error('SMART launch client registration changed before callback completion'), {
        code: 'smart_client_registration_mismatch',
        status: 409,
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
      issuer: config.issuer,
      idTokenJwksUrl: config.idTokenJwksUrl,
    };
  }
}

async function auditLaunchDenied(
  request: FastifyRequest,
  tenantId: number | null,
  launchMode: 'ehr' | 'standalone',
  status: number,
  code: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await auditSmartLaunch(
    request,
    'ehr_smart_launch_denied',
    'ehr_tenant',
    tenantId === null ? undefined : String(tenantId),
    {
      launchMode,
      status,
      code,
      ...details,
    },
  );
}

async function auditSmartLaunch(
  request: FastifyRequest,
  action: string,
  resourceType: string,
  resourceId: string | undefined,
  details: Record<string, unknown>,
): Promise<void> {
  const auditLog = (request as FastifyRequest & {
    auditLog?: (
      action: string,
      resourceType: string,
      resourceId?: string,
      details?: Record<string, unknown>,
    ) => Promise<void>;
  }).auditLog;
  if (typeof auditLog !== 'function') return;

  try {
    await auditLog(action, resourceType, resourceId, details);
  } catch (err) {
    request.log.error({ err, action }, 'Failed to audit SMART launch route event');
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

function validateLaunchIssuerAndContext(
  query: LaunchQuery,
  config: SmartLaunchConfig,
  launchMode: 'ehr' | 'standalone',
): { issuer: string | null; launch: string | null } | { error: true; status: number; code: string; message: string } {
  const expectedIssuers = expectedLaunchIssuers(config);
  if (launchMode === 'ehr') {
    if (!query.iss) {
      return {
        error: true,
        status: 400,
        code: 'SMART_ISSUER_REQUIRED',
        message: 'EHR-launched SMART requests require iss',
      };
    }
    if (!smartIssuerAllowed(query.iss, expectedIssuers)) {
      return {
        error: true,
        status: 400,
        code: 'SMART_ISSUER_MISMATCH',
        message: 'SMART launch issuer is not registered for this EHR tenant',
      };
    }
    if (!query.launch) {
      return {
        error: true,
        status: 400,
        code: 'SMART_LAUNCH_REQUIRED',
        message: 'EHR-launched SMART requests require launch',
      };
    }
    return { issuer: query.iss, launch: query.launch };
  }

  if (query.iss && !smartIssuerAllowed(query.iss, expectedIssuers)) {
    return {
      error: true,
      status: 400,
      code: 'SMART_ISSUER_MISMATCH',
      message: 'SMART launch issuer is not registered for this EHR tenant',
    };
  }
  return { issuer: query.iss ?? null, launch: null };
}

function expectedLaunchIssuers(config: SmartLaunchConfig): string[] {
  const metadataIssuer = stringMetadataValue(config.tenant.metadata, 'issuer');
  const metadataAudience = stringMetadataValue(config.tenant.metadata, 'audience');
  return uniqueStrings([
    config.issuer,
    metadataIssuer,
    metadataAudience,
    config.tenant.fhirBaseUrl,
  ]);
}

function stringMetadataValue(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

function smartIssuerAllowed(candidate: string, expectedIssuers: string[]): boolean {
  const normalizedCandidate = normalizeIssuerForComparison(candidate);
  if (!normalizedCandidate) return false;
  return expectedIssuers.some((expected) => normalizeIssuerForComparison(expected) === normalizedCandidate);
}

function normalizeIssuerForComparison(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.replace(/\/$/, '') : null;
  }
}

function appendHandoffCode(url: string, handoffCode: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}smart_handoff=${encodeURIComponent(handoffCode)}`;
}
