import { sql } from '@medgnosis/db';
import { pathToFileURL } from 'node:url';
import {
  formatSmokeReport,
  runEhrOnboardingSmoke,
  type EhrOnboardingSmokeInput,
} from '../services/ehr/onboardingSmoke.js';

interface CliOptions {
  tenantId: number;
  apiBaseUrl?: string;
  backendScope?: string;
  requestBackendToken: boolean;
  fhirAccessToken?: string;
  fhirTokenType?: string;
  fhirRead?: {
    resourceType: string;
    id: string;
  };
  json: boolean;
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2), process.env);
  const report = await runEhrOnboardingSmoke(toSmokeInput(options));

  if (options.json) {
    console.info(JSON.stringify(report, null, 2));
  } else {
    console.info(formatSmokeReport(report));
  }

  process.exitCode = report.ok ? 0 : 1;
}

export function parseCliOptions(args: string[], env: NodeJS.ProcessEnv): CliOptions {
  const values = new Map<string, string | boolean>();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.trim();
    if (key === 'json' || key === 'request-backend-token') {
      values.set(key, true);
      continue;
    }
    const value = inlineValue ?? args[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    values.set(key, value);
    if (inlineValue === undefined) i += 1;
  }

  const tenantId = positiveInt(stringValue(values.get('tenant-id')) ?? env['EHR_SMOKE_TENANT_ID']);
  if (!tenantId) {
    throw new Error('Provide --tenant-id or EHR_SMOKE_TENANT_ID');
  }

  return {
    tenantId,
    apiBaseUrl: stringValue(values.get('api-base-url')) ?? env['EHR_SMOKE_API_BASE_URL'],
    backendScope: stringValue(values.get('backend-scope')) ?? env['EHR_SMOKE_BACKEND_SCOPE'],
    requestBackendToken:
      values.get('request-backend-token') === true ||
      env['EHR_SMOKE_REQUEST_BACKEND_TOKEN'] === 'true',
    fhirAccessToken: stringValue(values.get('fhir-access-token')) ?? env['EHR_SMOKE_ACCESS_TOKEN'],
    fhirTokenType: stringValue(values.get('fhir-token-type')) ?? env['EHR_SMOKE_TOKEN_TYPE'],
    fhirRead: parseFhirRead(stringValue(values.get('fhir-read')) ?? env['EHR_SMOKE_FHIR_READ']),
    json: values.get('json') === true || env['EHR_SMOKE_JSON'] === 'true',
  };
}

function toSmokeInput(options: CliOptions): EhrOnboardingSmokeInput {
  return {
    tenantId: options.tenantId,
    apiBaseUrl: options.apiBaseUrl,
    backendScope: options.backendScope,
    requestBackendToken: options.requestBackendToken,
    fhirAccessToken: options.fhirAccessToken,
    fhirTokenType: options.fhirTokenType,
    fhirRead: options.fhirRead,
  };
}

function stringValue(value: string | boolean | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function positiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseFhirRead(value: string | undefined): CliOptions['fhirRead'] {
  if (!value) return undefined;
  const [resourceType, id] = value.split('/', 2);
  if (!resourceType || !id) {
    throw new Error('FHIR read target must use Resource/id form, for example Patient/123');
  }
  return { resourceType, id };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .catch((error) => {
      console.error(
        `[ehr-smoke] ${error instanceof Error && error.message.length > 0 ? error.message : 'Smoke harness failed'}`,
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await sql.end({ timeout: 5 });
    });
}
