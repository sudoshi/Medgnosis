import { pathToFileURL } from 'node:url';
import {
  buildEhrOnboardingProfile,
  formatEhrOnboardingProfile,
  type EhrOnboardingProfileInput,
} from '../services/ehr/onboardingProfile.js';
import type { EhrEnvironment, EhrVendor } from '../services/ehr/tenantRegistry.js';

interface ProfileCliOptions extends EhrOnboardingProfileInput {
  json: boolean;
}

const VENDORS = new Set<EhrVendor>(['epic', 'oracle_cerner', 'smart_generic', 'hapi', 'other']);
const ENVIRONMENTS = new Set<EhrEnvironment>(['sandbox', 'staging', 'production']);

function main(): void {
  const options = parseCliOptions(process.argv.slice(2), process.env);
  const profile = buildEhrOnboardingProfile(options);
  console.info(options.json ? JSON.stringify(profile, null, 2) : formatEhrOnboardingProfile(profile));
}

export function parseCliOptions(args: string[], env: NodeJS.ProcessEnv): ProfileCliOptions {
  const values = parseArgs(args);
  const vendor = requiredEnum('vendor', value(values, env, 'vendor', 'EHR_PROFILE_VENDOR'), VENDORS);
  const environment = optionalEnum(
    'environment',
    value(values, env, 'environment', 'EHR_PROFILE_ENVIRONMENT'),
    ENVIRONMENTS,
  ) ?? 'sandbox';
  const fhirBaseUrl = required(
    'fhir-base-url',
    value(values, env, 'fhir-base-url', 'EHR_PROFILE_FHIR_BASE_URL'),
  );

  return {
    vendor,
    environment,
    name: value(values, env, 'name', 'EHR_PROFILE_NAME'),
    fhirBaseUrl,
    apiBaseUrl: value(values, env, 'api-base-url', 'EHR_PROFILE_API_BASE_URL'),
    tenantId: positiveInt(value(values, env, 'tenant-id', 'EHR_PROFILE_TENANT_ID')) ?? undefined,
    orgId: positiveInt(value(values, env, 'org-id', 'EHR_PROFILE_ORG_ID')),
    status: value(values, env, 'status', 'EHR_PROFILE_STATUS'),
    smartClientId: value(values, env, 'smart-client-id', 'EHR_PROFILE_SMART_CLIENT_ID'),
    backendClientId: value(values, env, 'backend-client-id', 'EHR_PROFILE_BACKEND_CLIENT_ID'),
    cdsClientId: value(values, env, 'cds-client-id', 'EHR_PROFILE_CDS_CLIENT_ID'),
    json: hasFlag(values, env, 'json', 'EHR_PROFILE_JSON'),
  };
}

function parseArgs(args: string[]): Map<string, string | boolean> {
  const values = new Map<string, string | boolean>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.trim();
    if (key === 'json') {
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
  if (!input) throw new Error(`Provide --${label} or corresponding EHR_PROFILE_* env var`);
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

function hasFlag(values: Map<string, string | boolean>, env: NodeJS.ProcessEnv, key: string, envKey: string): boolean {
  return values.get(key) === true || env[envKey] === 'true';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(
      `[ehr-profile] ${error instanceof Error && error.message.length > 0 ? error.message : 'Profile generation failed'}`,
    );
    process.exitCode = 1;
  }
}
