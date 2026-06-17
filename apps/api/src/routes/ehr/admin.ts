import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  getLatestCapabilitySnapshot,
  getTenant,
  listClientRegistrations,
  listTenants,
  saveCapabilitySnapshot,
  type EhrClientApprovalStatus,
  type EhrClientAuthMethod,
  type EhrClientType,
  type EhrEnvironment,
  type EhrVendor,
  type JsonObject,
  type ListEhrTenantsFilter,
  type SanitizedEhrClientRegistration,
} from '../../services/ehr/tenantRegistry.js';
import { discoverSmartConfiguration } from '../../services/ehr/smartDiscovery.js';
import { buildEhrOnboardingProfile } from '../../services/ehr/onboardingProfile.js';
import {
  applyEhrOnboardingRegistration,
  type EhrOnboardingClientInput,
  type EhrOnboardingRegistrationInput,
} from '../../services/ehr/onboardingRegistration.js';

const VENDORS = new Set<EhrVendor>(['epic', 'oracle_cerner', 'smart_generic', 'hapi', 'other']);
const ENVIRONMENTS = new Set<EhrEnvironment>(['sandbox', 'staging', 'production']);
const AUTH_METHODS = new Set<EhrClientAuthMethod>([
  'public_pkce',
  'client_secret_post',
  'client_secret_basic',
  'private_key_jwt',
  'fhir_authorization_jwt',
  'shared_secret',
]);
const APPROVAL_STATUSES = new Set<EhrClientApprovalStatus>([
  'draft',
  'submitted',
  'approved',
  'rejected',
  'expired',
  'revoked',
  'unknown',
]);

interface TenantListQuery {
  vendor?: string | string[];
  environment?: string | string[];
  status?: string | string[];
}

interface OnboardingProfileQuery {
  vendor?: string | string[];
  environment?: string | string[];
  name?: string | string[];
  fhirBaseUrl?: string | string[];
  fhir_base_url?: string | string[];
  apiBaseUrl?: string | string[];
  api_base_url?: string | string[];
  tenantId?: string | string[];
  tenant_id?: string | string[];
  orgId?: string | string[];
  org_id?: string | string[];
  status?: string | string[];
  smartClientId?: string | string[];
  smart_client_id?: string | string[];
  backendClientId?: string | string[];
  backend_client_id?: string | string[];
  cdsClientId?: string | string[];
  cds_client_id?: string | string[];
}

interface UpsertTenantBody {
  tenant?: unknown;
  apiBaseUrl?: unknown;
  api_base_url?: unknown;
  smartLaunch?: unknown;
  smart_launch?: unknown;
  backendServices?: unknown;
  backend_services?: unknown;
  cdsHooks?: unknown;
  cds_hooks?: unknown;
}

interface TenantIdParams {
  id: string;
}

export default async function ehrAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireRole(['admin']));

  app.get<{ Querystring: TenantListQuery }>('/tenants', async (request, reply) => {
    const parsedFilter = parseTenantListFilter(request.query);
    if ('error' in parsedFilter) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: parsedFilter.error },
      });
    }

    const tenants = await listTenants(parsedFilter.filter);
    return reply.send({
      success: true,
      data: {
        tenants,
        count: tenants.length,
      },
    });
  });

  app.post<{ Body: UpsertTenantBody }>('/tenants', async (request, reply) => {
    const parsed = parseUpsertTenantBody(request.body);
    if ('error' in parsed) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: parsed.error },
      });
    }

    const result = await applyEhrOnboardingRegistration(parsed.input);
    return reply.status(201).send({
      success: true,
      data: result,
    });
  });

  app.get<{ Params: TenantIdParams }>('/tenants/:id', async (request, reply) => {
    const tenantId = parseTenantId(request.params.id);
    if (tenantId === undefined) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
      });
    }

    const tenant = await getTenant(tenantId);
    if (!tenant) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
      });
    }

    const [clientRegistrations, latestCapabilitySnapshot] = await Promise.all([
      listClientRegistrations(tenantId),
      getLatestCapabilitySnapshot(tenantId),
    ]);

    return reply.send({
      success: true,
      data: {
        tenant,
        clientRegistrations,
        latestCapabilitySnapshot,
        readiness: {
          clients: clientRegistrations.map((client) => buildClientReadiness(client.clientType, client)),
        },
      },
    });
  });

  app.get<{ Params: TenantIdParams }>('/tenants/:id/capabilities', async (request, reply) => {
    const tenantId = parseTenantId(request.params.id);
    if (tenantId === undefined) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
      });
    }

    const tenant = await getTenant(tenantId);
    if (!tenant) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
      });
    }

    const latestCapabilitySnapshot = await getLatestCapabilitySnapshot(tenantId);
    return reply.send({
      success: true,
      data: {
        tenant,
        latestCapabilitySnapshot,
        resourceSupport: latestCapabilitySnapshot?.resourceSupport ?? {},
      },
    });
  });

  app.get<{ Querystring: OnboardingProfileQuery }>('/onboarding-profile', async (request, reply) => {
    const parsed = parseOnboardingProfileQuery(request.query);
    if ('error' in parsed) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: parsed.error },
      });
    }

    return reply.send({
      success: true,
      data: {
        profile: buildEhrOnboardingProfile(parsed.input),
      },
    });
  });

  app.post<{ Params: TenantIdParams }>('/tenants/:id/discover', async (request, reply) =>
    sendTenantDiagnostics(request, reply),
  );

  app.post<{ Params: TenantIdParams }>('/tenants/:id/test-connection', async (request, reply) =>
    sendTenantDiagnostics(request, reply),
  );

  app.get<{ Params: TenantIdParams }>('/tenants/:id/diagnostics', async (request, reply) =>
    sendTenantDiagnostics(request, reply),
  );
}

async function sendTenantDiagnostics(
  request: FastifyRequest<{ Params: TenantIdParams }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const tenantId = parseTenantId(request.params.id);
  if (tenantId === undefined) {
    return reply.status(400).send({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Tenant id must be a positive integer' },
    });
  }

  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'EHR tenant not found' },
    });
  }

  try {
    const diagnostics = await discoverSmartConfiguration(tenant);
    const snapshot = await saveCapabilitySnapshot({
      ehrTenantId: tenant.id,
      smartConfiguration: discoveryDocumentToJson(diagnostics.smartConfiguration),
      capabilityStatement: discoveryDocumentToJson(diagnostics.capabilityStatement),
      resourceSupport: diagnostics.capabilityStatement.summary?.resourceSupport ?? {},
    });
    return reply.send({
      success: true,
      data: {
        tenant,
        diagnostics,
        snapshot,
      },
    });
  } catch (error) {
    request.log.error({ err: error, tenantId }, '[ehr-admin] SMART discovery failed');
    return reply.status(502).send({
      success: false,
      error: {
        code: 'EHR_DISCOVERY_FAILED',
        message: errorMessage(error),
      },
    });
  }
}

function parseUpsertTenantBody(
  body: UpsertTenantBody,
): { input: EhrOnboardingRegistrationInput } | { error: string } {
  if (!isRecord(body)) return { error: 'Request body must be an object' };
  if (!isRecord(body.tenant)) return { error: 'tenant is required' };

  const tenant = parseTenantPayload(body.tenant);
  if ('error' in tenant) return tenant;

  const smartLaunch = parseClientPayload('smartLaunch', body.smartLaunch ?? body.smart_launch);
  if ('error' in smartLaunch) return smartLaunch;
  const backendServices = parseClientPayload('backendServices', body.backendServices ?? body.backend_services);
  if ('error' in backendServices) return backendServices;
  const cdsHooks = parseClientPayload('cdsHooks', body.cdsHooks ?? body.cds_hooks);
  if ('error' in cdsHooks) return cdsHooks;

  const input: EhrOnboardingRegistrationInput = {
    tenant: tenant.value,
    apiBaseUrl: optionalString(body.apiBaseUrl ?? body.api_base_url),
  };
  if (smartLaunch.value !== undefined) input.smartLaunch = smartLaunch.value;
  if (backendServices.value !== undefined) input.backendServices = backendServices.value;
  if (cdsHooks.value !== undefined) input.cdsHooks = cdsHooks.value;
  return { input };
}

function parseTenantPayload(
  value: Record<string, unknown>,
): { value: EhrOnboardingRegistrationInput['tenant'] } | { error: string } {
  const vendor = requiredString(value.vendor, 'tenant.vendor');
  if ('error' in vendor) return vendor;
  if (!isEhrVendor(vendor.value)) return { error: `Unsupported EHR vendor '${vendor.value}'` };

  const environment = requiredString(value.environment, 'tenant.environment');
  if ('error' in environment) return environment;
  if (!isEhrEnvironment(environment.value)) {
    return { error: `Unsupported EHR environment '${environment.value}'` };
  }

  const name = requiredString(value.name, 'tenant.name');
  if ('error' in name) return name;
  const fhirBaseUrl = requiredString(value.fhirBaseUrl ?? value.fhir_base_url, 'tenant.fhirBaseUrl');
  if ('error' in fhirBaseUrl) return fhirBaseUrl;

  return {
    value: {
      id: optionalPositiveInt(value.id),
      orgId: optionalNullablePositiveInt(value.orgId ?? value.org_id),
      vendor: vendor.value,
      name: name.value,
      environment: environment.value,
      fhirBaseUrl: fhirBaseUrl.value,
      smartConfigUrl: optionalNullableString(value.smartConfigUrl ?? value.smart_config_url),
      issuer: optionalNullableString(value.issuer),
      audience: optionalNullableString(value.audience),
      status: optionalString(value.status),
    },
  };
}

function parseClientPayload(
  label: string,
  value: unknown,
): { value: EhrOnboardingClientInput | null | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  if (value === null) return { value: null };
  if (!isRecord(value)) return { error: `${label} must be an object or null` };

  const clientId = requiredString(value.clientId ?? value.client_id, `${label}.clientId`);
  if ('error' in clientId) return clientId;

  const authMethod = optionalString(value.authMethod ?? value.auth_method);
  let parsedAuthMethod: EhrClientAuthMethod | undefined;
  if (authMethod) {
    if (!isAuthMethod(authMethod)) {
      return { error: `Unsupported ${label}.authMethod '${authMethod}'` };
    }
    parsedAuthMethod = authMethod;
  }
  const approvalStatus = optionalString(value.approvalStatus ?? value.approval_status);
  let parsedApprovalStatus: EhrClientApprovalStatus | undefined;
  if (approvalStatus) {
    if (!isApprovalStatus(approvalStatus)) {
      return { error: `Unsupported ${label}.approvalStatus '${approvalStatus}'` };
    }
    parsedApprovalStatus = approvalStatus;
  }

  const redirectUris = optionalStringArray(value.redirectUris ?? value.redirect_uris);
  if ('error' in redirectUris) return { error: `${label}.${redirectUris.error}` };
  const approvalEvidence = optionalJsonObject(value.approvalEvidence ?? value.approval_evidence);
  if ('error' in approvalEvidence) return { error: `${label}.${approvalEvidence.error}` };

  return {
    value: {
      clientId: clientId.value,
      clientSlot: optionalString(value.clientSlot ?? value.client_slot),
      clientSecretRef: optionalNullableString(value.clientSecretRef ?? value.client_secret_ref),
      jwksUrl: optionalNullableString(value.jwksUrl ?? value.jwks_url),
      privateKeyRef: optionalNullableString(value.privateKeyRef ?? value.private_key_ref),
      redirectUris: redirectUris.value,
      launchUrl: optionalNullableString(value.launchUrl ?? value.launch_url),
      scopesRequested: optionalString(value.scopesRequested ?? value.scopes_requested),
      scopesGranted: optionalString(value.scopesGranted ?? value.scopes_granted),
      authMethod: parsedAuthMethod,
      profileId: optionalNullableString(value.profileId ?? value.profile_id),
      profileVersion: optionalNullableString(value.profileVersion ?? value.profile_version),
      portalAppId: optionalNullableString(value.portalAppId ?? value.portal_app_id),
      approvalStatus: parsedApprovalStatus,
      approvalEvidence: approvalEvidence.value,
      enabled: optionalBoolean(value.enabled),
    },
  };
}

function parseOnboardingProfileQuery(
  query: OnboardingProfileQuery,
): { input: Parameters<typeof buildEhrOnboardingProfile>[0] } | { error: string } {
  const vendor = singleQueryValue(query.vendor);
  const environment = singleQueryValue(query.environment);
  const fhirBaseUrl = singleQueryValue(query.fhirBaseUrl) ?? singleQueryValue(query.fhir_base_url);
  const tenantId = positiveQueryInt(singleQueryValue(query.tenantId) ?? singleQueryValue(query.tenant_id));
  const orgId = positiveQueryInt(singleQueryValue(query.orgId) ?? singleQueryValue(query.org_id));

  if (!vendor) return { error: 'vendor is required' };
  if (!isEhrVendor(vendor)) return { error: `Unsupported EHR vendor '${vendor}'` };
  let parsedEnvironment: EhrEnvironment | undefined;
  if (environment) {
    if (!isEhrEnvironment(environment)) {
      return { error: `Unsupported EHR environment '${environment}'` };
    }
    parsedEnvironment = environment;
  }
  if (!fhirBaseUrl) return { error: 'fhirBaseUrl is required' };

  return {
    input: {
      vendor,
      environment: parsedEnvironment,
      name: singleQueryValue(query.name),
      fhirBaseUrl,
      apiBaseUrl: singleQueryValue(query.apiBaseUrl) ?? singleQueryValue(query.api_base_url),
      tenantId: tenantId ?? undefined,
      orgId,
      status: singleQueryValue(query.status),
      smartClientId: singleQueryValue(query.smartClientId) ?? singleQueryValue(query.smart_client_id),
      backendClientId: singleQueryValue(query.backendClientId) ?? singleQueryValue(query.backend_client_id),
      cdsClientId: singleQueryValue(query.cdsClientId) ?? singleQueryValue(query.cds_client_id),
    },
  };
}

function parseTenantListFilter(
  query: TenantListQuery,
): { filter: ListEhrTenantsFilter } | { error: string } {
  const vendor = singleQueryValue(query.vendor);
  const environment = singleQueryValue(query.environment);
  const status = singleQueryValue(query.status);
  let parsedVendor: EhrVendor | undefined;
  let parsedEnvironment: EhrEnvironment | undefined;

  if (vendor) {
    if (!isEhrVendor(vendor)) {
      return { error: `Unsupported EHR vendor '${vendor}'` };
    }
    parsedVendor = vendor;
  }
  if (environment) {
    if (!isEhrEnvironment(environment)) {
      return { error: `Unsupported EHR environment '${environment}'` };
    }
    parsedEnvironment = environment;
  }

  const filter: ListEhrTenantsFilter = {};
  if (parsedVendor) filter.vendor = parsedVendor;
  if (parsedEnvironment) filter.environment = parsedEnvironment;
  if (status) filter.status = status;

  return {
    filter,
  };
}

function parseTenantId(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function positiveQueryInt(value: string | undefined): number | null {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function singleQueryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isEhrVendor(value: string): value is EhrVendor {
  return VENDORS.has(value as EhrVendor);
}

function isEhrEnvironment(value: string): value is EhrEnvironment {
  return ENVIRONMENTS.has(value as EhrEnvironment);
}

function isAuthMethod(value: string): value is EhrClientAuthMethod {
  return AUTH_METHODS.has(value as EhrClientAuthMethod);
}

function isApprovalStatus(value: string): value is EhrClientApprovalStatus {
  return APPROVAL_STATUSES.has(value as EhrClientApprovalStatus);
}

function requiredString(value: unknown, label: string): { value: string } | { error: string } {
  const parsed = optionalString(value);
  return parsed ? { value: parsed } : { error: `${label} is required` };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return optionalString(value);
}

function optionalStringArray(value: unknown): { value: string[] | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  if (!Array.isArray(value)) return { error: 'redirectUris must be an array of strings' };
  const parsed = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return { value: parsed };
}

function optionalJsonObject(value: unknown): { value: JsonObject | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  if (!isRecord(value) || Array.isArray(value)) {
    return { error: 'approvalEvidence must be an object' };
  }
  return { value: value as JsonObject };
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalPositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function optionalNullablePositiveInt(value: unknown): number | null | undefined {
  if (value === null) return null;
  return optionalPositiveInt(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildClientReadiness(
  clientType: EhrClientType,
  client: SanitizedEhrClientRegistration,
): {
  clientSlot: string;
  clientType: EhrClientType;
  clientId: string;
  authMethod: EhrClientAuthMethod;
  status: 'ready' | 'blocked';
  missing: string[];
} {
  const missing: string[] = [];
  if (!client.enabled) missing.push('enabled');
  if (!client.clientId.trim()) missing.push('clientId');
  if (!client.scopesRequested.trim()) missing.push('scopesRequested');

  if (clientType === 'smart_launch') {
    if (client.redirectUris.length === 0) missing.push('redirectUris');
    if (!client.launchUrl) missing.push('launchUrl');
    addCredentialReadiness(client, missing);
  } else if (clientType === 'backend_services') {
    addBackendCredentialReadiness(client, missing);
  } else if (clientType === 'cds_hooks') {
    addCdsCredentialReadiness(client, missing);
  }

  return {
    clientSlot: client.clientSlot,
    clientType,
    clientId: client.clientId,
    authMethod: client.authMethod,
    status: missing.length === 0 ? 'ready' : 'blocked',
    missing,
  };
}

function addCredentialReadiness(
  client: SanitizedEhrClientRegistration,
  missing: string[],
): void {
  if ((client.authMethod === 'client_secret_basic' || client.authMethod === 'client_secret_post') && !client.hasClientSecretRef) {
    missing.push('clientSecretRef');
  }
  if (client.authMethod === 'private_key_jwt') {
    if (!client.hasPrivateKeyRef) missing.push('privateKeyRef');
    if (!client.jwksUrl) missing.push('jwksUrl');
  }
}

function addBackendCredentialReadiness(
  client: SanitizedEhrClientRegistration,
  missing: string[],
): void {
  if (client.authMethod === 'private_key_jwt') {
    if (!client.hasPrivateKeyRef) missing.push('privateKeyRef');
    if (!client.jwksUrl) missing.push('jwksUrl');
    return;
  }
  if (client.authMethod === 'client_secret_basic' || client.authMethod === 'client_secret_post') {
    if (!client.hasClientSecretRef) missing.push('clientSecretRef');
    return;
  }
  missing.push(`unsupportedAuthMethod:${client.authMethod}`);
}

function addCdsCredentialReadiness(
  client: SanitizedEhrClientRegistration,
  missing: string[],
): void {
  if (client.authMethod === 'shared_secret' && !client.hasClientSecretRef) {
    missing.push('clientSecretRef');
  }
  if (client.authMethod === 'fhir_authorization_jwt' && !client.jwksUrl && !client.hasClientSecretRef) {
    missing.push('jwksUrlOrClientSecretRef');
  }
}

function discoveryDocumentToJson(document: {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
  summary?: unknown;
}): JsonObject {
  return {
    url: document.url,
    ok: document.ok,
    status: document.status,
    error: document.error,
    summary: isRecord(document.summary) ? document.summary : {},
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : 'Unable to run EHR discovery diagnostics';
}
