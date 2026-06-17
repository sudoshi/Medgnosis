import { getTenant, type EhrTenant } from './tenantRegistry.js';
import {
  discoverSmartConfiguration,
  type SmartDiscoveryResult,
} from './smartDiscovery.js';
import {
  loadSmartLaunchConfig,
  type SmartLaunchConfig,
} from './smartLaunch.js';
import {
  loadBackendServicesConfig,
  requestBackendServiceToken,
  resolvePrivateKeyFromEnvironment,
  type BackendPrivateKeyMaterial,
  type BackendServicesConfig,
} from './backendServices.js';
import {
  loadBackendPublicJwksFromEnvironment,
  type PublicJwks,
} from './backendJwks.js';
import { readResource } from './fhirClient.js';
import type {
  EhrTenantRef,
  FetchLike,
  FhirAccessTokenRef,
  FhirReadResult,
  FhirResource,
} from './types.js';

export type SmokeStepStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface SmokeStep {
  id: string;
  label: string;
  status: SmokeStepStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface EhrOnboardingSmokeInput {
  tenantId: number;
  apiBaseUrl?: string;
  backendScope?: string;
  requestBackendToken?: boolean;
  fhirAccessToken?: string;
  fhirTokenType?: string;
  fhirRead?: {
    resourceType: string;
    id: string;
  };
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  deps?: Partial<EhrOnboardingSmokeDeps>;
}

export interface EhrOnboardingSmokeReport {
  ok: boolean;
  checkedAt: string;
  tenantId: number;
  tenant?: {
    id: number;
    name: string;
    vendor: string;
    environment: string;
    fhirBaseUrl: string;
    status: string;
  };
  summary: Record<SmokeStepStatus, number>;
  steps: SmokeStep[];
}

export interface EhrOnboardingSmokeDeps {
  getTenant: (tenantId: number) => Promise<EhrTenant | null>;
  discoverSmartConfiguration: (
    tenant: EhrTenant,
    options?: { fetchImpl?: FetchLike },
  ) => Promise<SmartDiscoveryResult>;
  loadSmartLaunchConfig: (
    tenantId: number,
    fetchImpl?: FetchLike,
  ) => Promise<SmartLaunchConfig | null>;
  loadBackendServicesConfig: (
    tenantId: number,
    fetchImpl?: FetchLike,
  ) => Promise<BackendServicesConfig | null>;
  loadBackendPublicJwksFromEnvironment: (env?: NodeJS.ProcessEnv) => PublicJwks | null;
  resolvePrivateKeyFromEnvironment: (privateKeyRef: string) => Promise<BackendPrivateKeyMaterial>;
  requestBackendServiceToken: typeof requestBackendServiceToken;
  readResource: (
    tenant: EhrTenant,
    token: FhirAccessTokenRef,
    resourceType: string,
    id: string,
  ) => Promise<FhirReadResult<FhirResource>>;
  fetchImpl: FetchLike;
}

interface BackendReadiness {
  config: BackendServicesConfig;
  needsPublicJwks: boolean;
}

const defaultDeps: EhrOnboardingSmokeDeps = {
  getTenant,
  discoverSmartConfiguration,
  loadSmartLaunchConfig,
  loadBackendServicesConfig,
  loadBackendPublicJwksFromEnvironment,
  resolvePrivateKeyFromEnvironment,
  requestBackendServiceToken,
  readResource: (tenant, token, resourceType, id) =>
    readResource(tenantRef(tenant), token, resourceType, id),
  fetchImpl: globalThis.fetch.bind(globalThis) as FetchLike,
};

export async function runEhrOnboardingSmoke(
  input: EhrOnboardingSmokeInput,
): Promise<EhrOnboardingSmokeReport> {
  const deps = { ...defaultDeps, ...input.deps };
  const fetchImpl = input.fetchImpl ?? deps.fetchImpl;
  const env = input.env ?? process.env;
  const steps: SmokeStep[] = [];
  const checkedAt = input.now?.() ?? new Date().toISOString();

  const tenant = await recordStep(steps, 'tenant', 'Tenant registry', async () => {
    const loaded = await deps.getTenant(input.tenantId);
    if (!loaded) {
      return {
        status: 'fail',
        message: `EHR tenant ${input.tenantId} was not found`,
      };
    }
    return {
      status: 'pass',
      message: `${loaded.name} (${loaded.vendor}/${loaded.environment}) is registered`,
      details: {
        status: loaded.status,
        orgId: loaded.orgId,
        fhirBaseUrl: loaded.fhirBaseUrl,
      },
      value: loaded,
    };
  });

  if (!tenant) {
    return buildReport(input.tenantId, checkedAt, steps);
  }

  await recordStep(steps, 'smart-discovery', 'SMART discovery', async () => {
    const discovery = await deps.discoverSmartConfiguration(tenant, { fetchImpl });
    const smartOk = discovery.smartConfiguration.ok && discovery.support.endpoints.authorization && discovery.support.endpoints.token;
    const metadataOk = discovery.capabilityStatement.ok;

    if (!smartOk) {
      return {
        status: 'fail',
        message: discovery.smartConfiguration.error ?? 'SMART configuration is missing authorization or token endpoint',
        details: {
          smartConfigurationUrl: discovery.endpoints.smartConfigurationUrl,
          status: discovery.smartConfiguration.status,
        },
      };
    }

    return {
      status: metadataOk ? 'pass' : 'warn',
      message: metadataOk
        ? 'SMART configuration and CapabilityStatement are reachable'
        : 'SMART configuration is reachable, but CapabilityStatement did not respond cleanly',
      details: {
        smartConfigurationUrl: discovery.endpoints.smartConfigurationUrl,
        capabilityStatementUrl: discovery.endpoints.capabilityStatementUrl,
        authorization: discovery.support.endpoints.authorization,
        token: discovery.support.endpoints.token,
        ehrLaunch: discovery.support.launch.ehr,
        standaloneLaunch: discovery.support.launch.standalone,
        capabilityStatus: discovery.capabilityStatement.status,
      },
    };
  });

  await recordStep(steps, 'smart-launch', 'SMART launch client', async () => {
    const config = await deps.loadSmartLaunchConfig(input.tenantId, fetchImpl);
    if (!config) {
      return {
        status: 'fail',
        message: 'No enabled SMART launch client registration exists for this tenant',
      };
    }
    if (config.redirectUris.length === 0) {
      return {
        status: 'fail',
        message: 'SMART launch client has no registered redirect URI',
        details: { clientId: config.clientId },
      };
    }
    if (!config.scopesRequested.trim()) {
      return {
        status: 'fail',
        message: 'SMART launch client has no requested scopes configured',
        details: { clientId: config.clientId },
      };
    }

    return {
      status: 'pass',
      message: 'SMART launch client is ready for redirect/callback testing',
      details: {
        clientId: config.clientId,
        authMethod: config.authMethod,
        redirectUris: config.redirectUris,
        scopesRequested: config.scopesRequested,
        authorizationEndpoint: config.authorizationEndpoint,
        tokenEndpoint: config.tokenEndpoint,
        hasClientSecretRef: Boolean(config.clientSecretRef),
      },
    };
  });

  const backendConfig = await recordStep(steps, 'backend-config', 'Backend services client', async () => {
    const config = await deps.loadBackendServicesConfig(input.tenantId, fetchImpl);
    if (!config) {
      return {
        status: 'skip',
        message: 'No enabled SMART Backend Services client registration exists for this tenant',
      };
    }

    const readiness = await backendCredentialReadiness(config, deps, env);

    if (!readiness.ok) {
      return {
        status: 'fail',
        message: 'Backend Services registration is incomplete',
        details: {
          clientId: config.clientId,
          authMethod: config.authMethod,
          credential: readiness.credential,
          jwksUrl: config.jwksUrl,
          publicJwksKeyCount: readiness.publicJwksKeyCount,
        },
      };
    }

    return {
      status: 'pass',
      message: `Backend Services registration is ready for ${config.authMethod}`,
      details: {
        clientId: config.clientId,
        authMethod: config.authMethod,
        tokenEndpoint: config.tokenEndpoint,
        scopesRequested: config.scopesRequested,
        scopesGranted: config.scopesGranted,
        jwksUrl: config.jwksUrl,
        publicJwksKeyCount: readiness.publicJwksKeyCount,
      },
      value: {
        config,
        needsPublicJwks: readiness.needsPublicJwks,
      } satisfies BackendReadiness,
    };
  });

  await recordStep(steps, 'jwks-endpoint', 'Public JWKS endpoint', async () => {
    if (!backendConfig) {
      return {
        status: 'skip',
        message: 'No backend-services client registration needs a public JWKS endpoint',
      };
    }
    if (!backendConfig.needsPublicJwks) {
      return {
        status: 'skip',
        message: `Backend auth_method ${backendConfig.config.authMethod} does not require a public JWKS endpoint`,
      };
    }
    if (!input.apiBaseUrl) {
      return {
        status: 'skip',
        message: 'Set EHR_SMOKE_API_BASE_URL or --api-base-url to verify served /.well-known/jwks.json',
      };
    }

    const url = new URL('/.well-known/jwks.json', input.apiBaseUrl).toString();
    const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' } });
    const body = await safeJson(response);
    const keyCount = jwksKeyCount(body);

    if (!response.ok || keyCount === 0) {
      return {
        status: 'fail',
        message: `JWKS endpoint did not return a usable key set (HTTP ${response.status})`,
        details: { url, status: response.status, keyCount },
      };
    }

    return {
      status: 'pass',
      message: 'JWKS endpoint is reachable and returns at least one public key',
      details: { url, status: response.status, keyCount },
    };
  });

  await recordStep(steps, 'backend-token', 'Backend token exchange', async () => {
    if (!backendConfig) {
      return {
        status: 'skip',
        message: 'No backend-services client registration to test',
      };
    }
    if (!input.requestBackendToken) {
      return {
        status: 'skip',
        message: 'Set EHR_SMOKE_REQUEST_BACKEND_TOKEN=true or --request-backend-token to call the EHR token endpoint',
      };
    }

    const result = await deps.requestBackendServiceToken({
      config: backendConfig.config,
      scope: input.backendScope,
      fetchImpl,
      persistMetadata: false,
    });

    return {
      status: 'pass',
      message: 'Backend Services token exchange succeeded',
      details: {
        tokenType: result.accessToken.tokenType,
        scope: result.accessToken.scope,
        expiresAt: result.accessToken.expiresAt,
      },
    };
  });

  await recordStep(steps, 'fhir-read', 'FHIR read smoke', async () => {
    if (!input.fhirAccessToken || !input.fhirRead) {
      return {
        status: 'skip',
        message: 'Set EHR_SMOKE_ACCESS_TOKEN plus EHR_SMOKE_FHIR_READ=Resource/id to verify an authenticated FHIR read',
      };
    }

    const token: FhirAccessTokenRef = {
      accessToken: input.fhirAccessToken,
      tokenType: input.fhirTokenType ?? 'Bearer',
    };
    const result = await deps.readResource(tenant, token, input.fhirRead.resourceType, input.fhirRead.id);

    return {
      status: result.resource.resourceType === input.fhirRead.resourceType ? 'pass' : 'fail',
      message: `${input.fhirRead.resourceType}/${input.fhirRead.id} read ${
        result.resource.resourceType === input.fhirRead.resourceType ? 'succeeded' : 'returned the wrong resource type'
      }`,
      details: {
        requested: `${input.fhirRead.resourceType}/${input.fhirRead.id}`,
        returned: `${result.resource.resourceType}/${result.resource.id ?? ''}`,
        status: result.audit.status,
      },
    };
  });

  return buildReport(input.tenantId, checkedAt, steps, tenant);
}

export function formatSmokeReport(report: EhrOnboardingSmokeReport): string {
  const lines = [
    `EHR onboarding smoke report: tenant ${report.tenantId}`,
    `Checked at: ${report.checkedAt}`,
  ];

  if (report.tenant) {
    lines.push(
      `Tenant: ${report.tenant.name} (${report.tenant.vendor}/${report.tenant.environment}, status=${report.tenant.status})`,
    );
  }

  lines.push(
    `Summary: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.skip} skip, ${report.summary.fail} fail`,
    '',
  );

  for (const step of report.steps) {
    lines.push(`${step.status.toUpperCase().padEnd(4)} ${step.label}: ${step.message}`);
    if (step.details) {
      for (const [key, value] of Object.entries(step.details)) {
        lines.push(`     ${key}: ${formatDetail(value)}`);
      }
    }
  }

  return lines.join('\n');
}

async function recordStep<TValue>(
  steps: SmokeStep[],
  id: string,
  label: string,
  run: () => Promise<(SmokeStep & { value?: TValue }) | Omit<SmokeStep, 'id' | 'label'> & { value?: TValue }>,
): Promise<TValue | undefined> {
  try {
    const result = await run();
    const step = {
      id,
      label,
      status: result.status,
      message: result.message,
      details: result.details,
    } satisfies SmokeStep;
    steps.push(step);
    return 'value' in result ? result.value : undefined;
  } catch (error) {
    steps.push({
      id,
      label,
      status: 'fail',
      message: error instanceof Error && error.message.length > 0 ? error.message : 'Smoke check failed',
    });
    return undefined;
  }
}

function buildReport(
  tenantId: number,
  checkedAt: string,
  steps: SmokeStep[],
  tenant?: EhrTenant,
): EhrOnboardingSmokeReport {
  const summary = {
    pass: steps.filter((step) => step.status === 'pass').length,
    fail: steps.filter((step) => step.status === 'fail').length,
    warn: steps.filter((step) => step.status === 'warn').length,
    skip: steps.filter((step) => step.status === 'skip').length,
  };

  return {
    ok: summary.fail === 0,
    checkedAt,
    tenantId,
    tenant: tenant
      ? {
          id: tenant.id,
          name: tenant.name,
          vendor: tenant.vendor,
          environment: tenant.environment,
          fhirBaseUrl: tenant.fhirBaseUrl,
          status: tenant.status,
        }
      : undefined,
    summary,
    steps,
  };
}

async function privateKeyCheck(
  privateKeyRef: string,
  deps: EhrOnboardingSmokeDeps,
): Promise<{ ok: boolean; message: string }> {
  try {
    const material = await deps.resolvePrivateKeyFromEnvironment(privateKeyRef);
    return {
      ok: Boolean(material.kid),
      message: material.kid ? `resolved kid=${material.kid}` : 'private key material is missing kid',
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'private key could not be resolved',
    };
  }
}

async function backendCredentialReadiness(
  config: BackendServicesConfig,
  deps: EhrOnboardingSmokeDeps,
  env: NodeJS.ProcessEnv,
): Promise<{
  ok: boolean;
  credential: string;
  needsPublicJwks: boolean;
  publicJwksKeyCount: number;
}> {
  switch (config.authMethod) {
    case 'private_key_jwt': {
      const privateKeyStatus = config.privateKeyRef
        ? await privateKeyCheck(config.privateKeyRef, deps)
        : { ok: false, message: 'client registration is missing private_key_ref' };
      const jwks = deps.loadBackendPublicJwksFromEnvironment(env);
      const hasJwksUrl = Boolean(config.jwksUrl);
      const publicJwksKeyCount = jwks?.keys.length ?? 0;

      return {
        ok: privateKeyStatus.ok && hasJwksUrl && publicJwksKeyCount > 0,
        credential: privateKeyStatus.message,
        needsPublicJwks: true,
        publicJwksKeyCount,
      };
    }
    case 'client_secret_basic':
    case 'client_secret_post': {
      const secretStatus = clientSecretCheck(config.clientSecretRef, env);
      return {
        ok: secretStatus.ok,
        credential: secretStatus.message,
        needsPublicJwks: false,
        publicJwksKeyCount: 0,
      };
    }
    case 'public_pkce':
    case 'fhir_authorization_jwt':
    case 'shared_secret':
      return {
        ok: false,
        credential: `auth_method ${config.authMethod} is not valid for SMART Backend Services token exchange`,
        needsPublicJwks: false,
        publicJwksKeyCount: 0,
      };
  }
}

function clientSecretCheck(
  clientSecretRef: string | null,
  env: NodeJS.ProcessEnv,
): { ok: boolean; message: string } {
  if (!clientSecretRef) {
    return {
      ok: false,
      message: 'client registration is missing client_secret_ref',
    };
  }

  const separator = clientSecretRef.indexOf(':');
  if (separator <= 0 || clientSecretRef.slice(0, separator) !== 'env') {
    return {
      ok: false,
      message: 'client_secret_ref must use the env: scheme',
    };
  }

  const envName = clientSecretRef.slice(separator + 1);
  const value = env[envName];
  return value
    ? { ok: true, message: `resolved ${envName}` }
    : { ok: false, message: `client secret env var is not set: ${envName}` };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function jwksKeyCount(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  const keys = (value as { keys?: unknown }).keys;
  return Array.isArray(keys) ? keys.length : 0;
}

function formatDetail(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function tenantRef(tenant: EhrTenant): EhrTenantRef {
  return {
    id: tenant.id,
    vendor: tenant.vendor,
    fhirBaseUrl: tenant.fhirBaseUrl,
    smartConfigUrl: tenant.smartConfigUrl ?? undefined,
    metadata: {
      issuer: tenant.issuer,
      audience: tenant.audience,
    },
  };
}
