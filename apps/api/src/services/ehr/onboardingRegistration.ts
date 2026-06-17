import {
  upsertClientRegistration,
  upsertTenant,
  type EhrClientApprovalStatus,
  type EhrClientAuthMethod,
  type EhrClientType,
  type EhrEnvironment,
  type EhrTenant,
  type EhrVendor,
  type JsonObject,
  type SanitizedEhrClientRegistration,
} from './tenantRegistry.js';

export interface EhrOnboardingClientInput {
  clientId: string;
  clientSlot?: string;
  clientSecretRef?: string | null;
  jwksUrl?: string | null;
  privateKeyRef?: string | null;
  redirectUris?: string[];
  launchUrl?: string | null;
  scopesRequested?: string;
  scopesGranted?: string;
  authMethod?: EhrClientAuthMethod;
  profileId?: string | null;
  profileVersion?: string | null;
  portalAppId?: string | null;
  approvalStatus?: EhrClientApprovalStatus;
  approvalEvidence?: JsonObject;
  enabled?: boolean;
}

export interface EhrOnboardingRegistrationInput {
  tenant: {
    id?: number;
    orgId?: number | null;
    vendor: EhrVendor;
    name: string;
    environment: EhrEnvironment;
    fhirBaseUrl: string;
    smartConfigUrl?: string | null;
    issuer?: string | null;
    audience?: string | null;
    status?: string;
  };
  apiBaseUrl?: string;
  smartLaunch?: EhrOnboardingClientInput | null;
  backendServices?: EhrOnboardingClientInput | null;
  cdsHooks?: EhrOnboardingClientInput | null;
}

export interface EhrOnboardingRegistrationResult {
  tenant: EhrTenant;
  clients: Array<SanitizedEhrClientRegistration & { clientType: EhrClientType }>;
}

export interface EhrOnboardingRegistrationDeps {
  upsertTenant: typeof upsertTenant;
  upsertClientRegistration: typeof upsertClientRegistration;
}

const defaultDeps: EhrOnboardingRegistrationDeps = {
  upsertTenant,
  upsertClientRegistration,
};

export async function applyEhrOnboardingRegistration(
  input: EhrOnboardingRegistrationInput,
  deps: EhrOnboardingRegistrationDeps = defaultDeps,
): Promise<EhrOnboardingRegistrationResult> {
  const tenant = await deps.upsertTenant(input.tenant);
  const clients: EhrOnboardingRegistrationResult['clients'] = [];

  if (input.smartLaunch) {
    clients.push(await upsertClient('smart_launch', tenant, applySmartDefaults(input.smartLaunch, tenant, input.apiBaseUrl), deps));
  }
  if (input.backendServices) {
    clients.push(await upsertClient('backend_services', tenant, applyBackendDefaults(input.backendServices, input.apiBaseUrl), deps));
  }
  if (input.cdsHooks) {
    clients.push(await upsertClient('cds_hooks', tenant, input.cdsHooks, deps));
  }

  return { tenant, clients };
}

export function formatOnboardingRegistrationResult(result: EhrOnboardingRegistrationResult): string {
  const lines = [
    `EHR tenant ${result.tenant.id}: ${result.tenant.name}`,
    `Vendor/environment: ${result.tenant.vendor}/${result.tenant.environment}`,
    `FHIR base URL: ${result.tenant.fhirBaseUrl}`,
    `Status: ${result.tenant.status}`,
  ];

  if (result.clients.length === 0) {
    lines.push('Client registrations: none');
    return lines.join('\n');
  }

  lines.push('Client registrations:');
  for (const client of result.clients) {
    lines.push(
      `  - ${client.clientSlot}: ${client.clientId} type=${client.clientType} auth=${client.authMethod} approval=${client.approvalStatus} enabled=${client.enabled} secretRef=${client.hasClientSecretRef} privateKeyRef=${client.hasPrivateKeyRef}`,
    );
  }
  return lines.join('\n');
}

async function upsertClient(
  clientType: EhrClientType,
  tenant: EhrTenant,
  input: EhrOnboardingClientInput,
  deps: EhrOnboardingRegistrationDeps,
) {
  return deps.upsertClientRegistration({
    ehrTenantId: tenant.id,
    clientType,
    clientSlot: input.clientSlot ?? clientType,
    clientId: input.clientId,
    clientSecretRef: input.clientSecretRef ?? null,
    jwksUrl: input.jwksUrl ?? null,
    privateKeyRef: input.privateKeyRef ?? null,
    redirectUris: input.redirectUris ?? [],
    launchUrl: input.launchUrl ?? null,
    scopesRequested: input.scopesRequested ?? '',
    scopesGranted: input.scopesGranted ?? input.scopesRequested ?? '',
    authMethod: input.authMethod,
    profileId: input.profileId ?? null,
    profileVersion: input.profileVersion ?? null,
    portalAppId: input.portalAppId ?? null,
    approvalStatus: input.approvalStatus,
    approvalEvidence: input.approvalEvidence,
    enabled: input.enabled ?? true,
  });
}

function applySmartDefaults(
  input: EhrOnboardingClientInput,
  tenant: EhrTenant,
  apiBaseUrl: string | undefined,
): EhrOnboardingClientInput {
  if (!apiBaseUrl) return input;
  const baseUrl = trimTrailingSlash(apiBaseUrl);
  return {
    ...input,
    redirectUris: input.redirectUris?.length
      ? input.redirectUris
      : [`${baseUrl}/api/v1/ehr/launch/callback`],
    launchUrl: input.launchUrl ?? `${baseUrl}/api/v1/ehr/launch/${tenant.id}`,
  };
}

function applyBackendDefaults(
  input: EhrOnboardingClientInput,
  apiBaseUrl: string | undefined,
): EhrOnboardingClientInput {
  if (!apiBaseUrl || input.jwksUrl) return input;
  return {
    ...input,
    jwksUrl: `${trimTrailingSlash(apiBaseUrl)}/.well-known/jwks.json`,
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
