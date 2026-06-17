import { sql } from '@medgnosis/db';
import { pathToFileURL } from 'node:url';
import {
  applyEhrOnboardingRegistration,
  formatOnboardingRegistrationResult,
  type EhrOnboardingClientInput,
  type EhrOnboardingRegistrationInput,
} from '../services/ehr/onboardingRegistration.js';
import { buildEhrOnboardingProfile } from '../services/ehr/onboardingProfile.js';
import { runEhrOnboardingSmoke, formatSmokeReport } from '../services/ehr/onboardingSmoke.js';
import type {
  EhrClientApprovalStatus,
  EhrClientAuthMethod,
  EhrEnvironment,
  EhrVendor,
  JsonObject,
} from '../services/ehr/tenantRegistry.js';

interface OnboardCliOptions extends EhrOnboardingRegistrationInput {
  json: boolean;
  runSmoke: boolean;
}

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

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2), process.env);
  const result = await applyEhrOnboardingRegistration(options);

  if (options.json) {
    console.info(JSON.stringify(result, null, 2));
  } else {
    console.info(formatOnboardingRegistrationResult(result));
  }

  if (options.runSmoke) {
    const smoke = await runEhrOnboardingSmoke({
      tenantId: result.tenant.id,
      apiBaseUrl: options.apiBaseUrl,
    });
    console.info('');
    console.info(formatSmokeReport(smoke));
    process.exitCode = smoke.ok ? 0 : 1;
  }
}

export function parseCliOptions(args: string[], env: NodeJS.ProcessEnv): OnboardCliOptions {
  const values = parseArgs(args);
  const vendor = requiredEnum('vendor', value(values, env, 'vendor', 'EHR_ONBOARD_VENDOR'), VENDORS);
  const environment = requiredEnum(
    'environment',
    value(values, env, 'environment', 'EHR_ONBOARD_ENVIRONMENT'),
    ENVIRONMENTS,
  );
  const name = required('name', value(values, env, 'name', 'EHR_ONBOARD_NAME'));
  const fhirBaseUrl = required(
    'fhir-base-url',
    value(values, env, 'fhir-base-url', 'EHR_ONBOARD_FHIR_BASE_URL'),
  );
  const apiBaseUrl = value(values, env, 'api-base-url', 'EHR_ONBOARD_API_BASE_URL');
  const tenantId = positiveInt(value(values, env, 'tenant-id', 'EHR_ONBOARD_TENANT_ID')) ?? undefined;
  const orgId = positiveInt(value(values, env, 'org-id', 'EHR_ONBOARD_ORG_ID'));
  const status = value(values, env, 'status', 'EHR_ONBOARD_STATUS') ?? 'testing';
  const profile = buildEhrOnboardingProfile({
    vendor,
    environment,
    name,
    fhirBaseUrl,
    apiBaseUrl,
    tenantId,
    orgId,
    status,
  });

  return {
    tenant: {
      id: tenantId,
      orgId,
      vendor,
      name,
      environment,
      fhirBaseUrl,
      smartConfigUrl: value(values, env, 'smart-config-url', 'EHR_ONBOARD_SMART_CONFIG_URL') ?? null,
      issuer: value(values, env, 'issuer', 'EHR_ONBOARD_ISSUER') ?? null,
      audience: value(values, env, 'audience', 'EHR_ONBOARD_AUDIENCE') ?? null,
      status,
    },
    apiBaseUrl,
    smartLaunch: clientInput(values, env, 'smart', {
      defaultScopes: profile.clientRegistrations.smartLaunch.scopesRequested,
      defaultClientSlot: profile.clientRegistrations.smartLaunch.clientSlot,
      defaultAuthMethod: profile.clientRegistrations.smartLaunch.authMethod,
      defaultProfileId: profile.clientRegistrations.smartLaunch.profileId,
      defaultProfileVersion: profile.clientRegistrations.smartLaunch.profileVersion,
      defaultApprovalStatus: profile.clientRegistrations.smartLaunch.approvalStatus,
    }),
    backendServices: clientInput(values, env, 'backend', {
      defaultScopes: profile.clientRegistrations.backendServices.scopesRequested,
      defaultClientSlot: profile.clientRegistrations.backendServices.clientSlot,
      defaultAuthMethod: profile.clientRegistrations.backendServices.authMethod,
      defaultProfileId: profile.clientRegistrations.backendServices.profileId,
      defaultProfileVersion: profile.clientRegistrations.backendServices.profileVersion,
      defaultApprovalStatus: profile.clientRegistrations.backendServices.approvalStatus,
    }),
    cdsHooks: clientInput(values, env, 'cds', {
      defaultScopes: profile.clientRegistrations.cdsHooks.scopesRequested,
      defaultClientSlot: profile.clientRegistrations.cdsHooks.clientSlot,
      defaultAuthMethod: profile.clientRegistrations.cdsHooks.authMethod,
      defaultProfileId: profile.clientRegistrations.cdsHooks.profileId,
      defaultProfileVersion: profile.clientRegistrations.cdsHooks.profileVersion,
      defaultApprovalStatus: profile.clientRegistrations.cdsHooks.approvalStatus,
    }),
    json: hasFlag(values, env, 'json', 'EHR_ONBOARD_JSON'),
    runSmoke: hasFlag(values, env, 'run-smoke', 'EHR_ONBOARD_RUN_SMOKE'),
  };
}

function clientInput(
  values: Map<string, string | boolean>,
  env: NodeJS.ProcessEnv,
  prefix: 'smart' | 'backend' | 'cds',
  options: {
    defaultScopes: string;
    defaultClientSlot: string;
    defaultAuthMethod: EhrClientAuthMethod;
    defaultProfileId: string;
    defaultProfileVersion: string;
    defaultApprovalStatus: EhrClientApprovalStatus;
  },
): EhrOnboardingClientInput | null {
  const envPrefix = `EHR_ONBOARD_${prefix.toUpperCase()}`;
  const clientId = value(values, env, `${prefix}-client-id`, `${envPrefix}_CLIENT_ID`);
  if (!clientId) return null;
  const authMethod = optionalEnum(
    `${prefix}-auth-method`,
    value(values, env, `${prefix}-auth-method`, `${envPrefix}_AUTH_METHOD`),
    AUTH_METHODS,
  ) ?? options.defaultAuthMethod;
  const approvalStatus = optionalEnum(
    `${prefix}-approval-status`,
    value(values, env, `${prefix}-approval-status`, `${envPrefix}_APPROVAL_STATUS`),
    APPROVAL_STATUSES,
  ) ?? options.defaultApprovalStatus;

  return {
    clientId,
    clientSlot: value(values, env, `${prefix}-client-slot`, `${envPrefix}_CLIENT_SLOT`) ?? options.defaultClientSlot,
    clientSecretRef: value(values, env, `${prefix}-client-secret-ref`, `${envPrefix}_CLIENT_SECRET_REF`) ?? null,
    jwksUrl: value(values, env, `${prefix}-jwks-url`, `${envPrefix}_JWKS_URL`) ?? null,
    privateKeyRef: value(values, env, `${prefix}-private-key-ref`, `${envPrefix}_PRIVATE_KEY_REF`) ?? null,
    redirectUris: splitList(value(values, env, `${prefix}-redirect-uris`, `${envPrefix}_REDIRECT_URIS`)),
    launchUrl: value(values, env, `${prefix}-launch-url`, `${envPrefix}_LAUNCH_URL`) ?? null,
    scopesRequested: value(values, env, `${prefix}-scopes`, `${envPrefix}_SCOPES`) ?? options.defaultScopes,
    scopesGranted:
      value(values, env, `${prefix}-granted-scopes`, `${envPrefix}_GRANTED_SCOPES`) ??
      value(values, env, `${prefix}-scopes`, `${envPrefix}_SCOPES`) ??
      options.defaultScopes,
    authMethod,
    profileId: value(values, env, `${prefix}-profile-id`, `${envPrefix}_PROFILE_ID`) ?? options.defaultProfileId,
    profileVersion:
      value(values, env, `${prefix}-profile-version`, `${envPrefix}_PROFILE_VERSION`) ??
      options.defaultProfileVersion,
    portalAppId: value(values, env, `${prefix}-portal-app-id`, `${envPrefix}_PORTAL_APP_ID`) ?? null,
    approvalStatus,
    approvalEvidence: jsonObjectValue(
      value(values, env, `${prefix}-approval-evidence-json`, `${envPrefix}_APPROVAL_EVIDENCE_JSON`),
      `${prefix}-approval-evidence-json`,
    ),
    enabled: boolValue(value(values, env, `${prefix}-enabled`, `${envPrefix}_ENABLED`), true),
  };
}

function parseArgs(args: string[]): Map<string, string | boolean> {
  const values = new Map<string, string | boolean>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.trim();
    if (key === 'json' || key === 'run-smoke') {
      values.set(key, true);
      continue;
    }
    const next = inlineValue ?? args[i + 1];
    if (!next || next.startsWith('--')) throw new Error(`Missing value for --${key}`);
    values.set(key, next);
    if (inlineValue === undefined) i += 1;
  }
  return values;
}

function value(
  values: Map<string, string | boolean>,
  env: NodeJS.ProcessEnv,
  key: string,
  envKey: string,
): string | undefined {
  const raw = values.get(key);
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  const envValue = env[envKey]?.trim();
  return envValue || undefined;
}

function required(label: string, input: string | undefined): string {
  if (!input) throw new Error(`Provide --${label} or corresponding EHR_ONBOARD_* env var`);
  return input;
}

function requiredEnum<T extends string>(label: string, input: string | undefined, allowed: Set<T>): T {
  const selected = required(label, input);
  if (!allowed.has(selected as T)) {
    throw new Error(`Unsupported ${label}: ${selected}`);
  }
  return selected as T;
}

function optionalEnum<T extends string>(label: string, input: string | undefined, allowed: Set<T>): T | undefined {
  if (!input) return undefined;
  if (!allowed.has(input as T)) {
    throw new Error(`Unsupported ${label}: ${input}`);
  }
  return input as T;
}

function positiveInt(input: string | undefined): number | null {
  if (!input) return null;
  const parsed = Number(input);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function splitList(input: string | undefined): string[] {
  return input
    ? input.split(',').map((item) => item.trim()).filter(Boolean)
    : [];
}

function boolValue(input: string | undefined, fallback: boolean): boolean {
  if (input === undefined) return fallback;
  return input === 'true';
}

function jsonObjectValue(input: string | undefined, label: string): JsonObject | undefined {
  if (!input) return undefined;
  const parsed = JSON.parse(input) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`--${label} must be a JSON object`);
  }
  return parsed as JsonObject;
}

function hasFlag(values: Map<string, string | boolean>, env: NodeJS.ProcessEnv, key: string, envKey: string): boolean {
  return values.get(key) === true || env[envKey] === 'true';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .catch((error) => {
      console.error(
        `[ehr-onboard] ${error instanceof Error && error.message.length > 0 ? error.message : 'Onboarding failed'}`,
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await sql.end({ timeout: 5 });
    });
}
