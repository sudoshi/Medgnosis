// =============================================================================
// Medgnosis API - SMART Backend Services patient-context refresh
// Runs after SMART launch to pull a broader, paginated patient workspace using
// a system-level backend-services token rather than retaining launch tokens.
// =============================================================================

import { FhirClient } from './fhirClient.js';
import {
  loadBackendServicesConfig as loadBackendServicesConfigDefault,
  requestBackendServiceToken as requestBackendServiceTokenDefault,
  type BackendServiceTokenResult,
  type BackendServicesConfig,
} from './backendServices.js';
import {
  failIngestRun as failIngestRunDefault,
  finishIngestRunWithQdmBridge as finishIngestRunWithQdmBridgeDefault,
  startIngestRun as startIngestRunDefault,
  type EhrIngestRun,
  type FinishEhrIngestRunResult,
} from './ingestRuns.js';
import {
  hydrateStagedRunToEdw as hydrateStagedRunToEdwDefault,
  type HydrateStagedRunToEdwResult,
} from './edwHydration.js';
import type { NormalizeStagedRunToQdmResult } from './qdmBridge.js';
import {
  stageFhirResource as stageFhirResourceDefault,
} from './resourceStaging.js';
import type {
  FetchLike,
  FhirAccessTokenRef,
  FhirResource,
  FhirSearchParams,
  FhirSearchResult,
} from './types.js';

export const SMART_PATIENT_CONTEXT_REFRESH_RESOURCE_TYPES = [
  'Encounter',
  'Condition',
  'Observation',
  'MedicationRequest',
  'Procedure',
  'AllergyIntolerance',
  'Immunization',
] as const;

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_ATTEMPTS = 2;
const DEFAULT_EDW_HYDRATION_LIMIT = 250;
const DEFAULT_QDM_BRIDGE_LIMIT = 250;
const REFRESH_SOURCE = 'smart-patient-context-refresh';

export type SmartPatientContextRefreshStatus = 'skipped' | 'succeeded' | 'failed';

export interface RefreshSmartPatientContextInput {
  ehrTenantId: number;
  orgId?: number | null;
  patientResourceId: string;
  localPatientId?: number | null;
  resourceTypes?: readonly string[];
  continuation?: readonly PatientContextRefreshContinuation[];
  continuationDepth?: number;
  requestedSince?: string | Date | null;
  pageSize?: number;
  maxPages?: number;
  fetchImpl?: FetchLike;
  smartLaunchSessionId?: string | null;
  triggeredBy?: 'smart_launch' | 'manual' | 'nightly_batch';
}

export interface PatientContextRefreshContinuation {
  resourceType: string;
  nextUrl: string;
}

export interface PatientContextRefreshSummary {
  attempted: string[];
  skipped: Array<{ resourceType: string; reason: string }>;
  received: number;
  staged: number;
  errors: Array<{ resourceType: string; message: string }>;
  remainingNextUrls: Array<{ resourceType: string; nextUrl: string }>;
}

export interface RefreshSmartPatientContextResult {
  status: SmartPatientContextRefreshStatus;
  ehrTenantId: number;
  patientResourceId: string;
  localPatientId: number | null;
  ingestRunId?: string;
  tokenMetadataId?: string;
  contextResources?: PatientContextRefreshSummary;
  edwHydration?: HydrateStagedRunToEdwResult;
  qdmBridge?: NormalizeStagedRunToQdmResult;
  reason?: string;
  errorMessage?: string;
}

interface RefreshSmartPatientContextDeps {
  loadBackendServicesConfig?: typeof loadBackendServicesConfigDefault;
  requestBackendServiceToken?: typeof requestBackendServiceTokenDefault;
  fhirClient?: Pick<FhirClient, 'search'> & Partial<Pick<FhirClient, 'searchFromUrl'>>;
  startIngestRun?: typeof startIngestRunDefault;
  finishIngestRun?: typeof finishIngestRunWithQdmBridgeDefault;
  failIngestRun?: typeof failIngestRunDefault;
  stageFhirResource?: typeof stageFhirResourceDefault;
  hydrateStagedRunToEdw?: typeof hydrateStagedRunToEdwDefault;
}

export async function refreshSmartPatientContext(
  input: RefreshSmartPatientContextInput,
  deps: RefreshSmartPatientContextDeps = {},
): Promise<RefreshSmartPatientContextResult> {
  const ehrTenantId = requiredPositiveInt(input.ehrTenantId, 'EHR tenant id');
  const patientResourceId = requiredString(input.patientResourceId, 'FHIR patient resource id');
  const localPatientId = optionalPositiveInt(input.localPatientId);
  const continuation = normalizeContinuation(input.continuation);
  const resourceTypes = supportedResourceTypes(input.resourceTypes ?? continuation.map((item) => item.resourceType));
  if (resourceTypes.length === 0) {
    return {
      status: 'skipped',
      ehrTenantId,
      patientResourceId,
      localPatientId,
      reason: 'no_supported_resource_types',
    };
  }

  const loadBackendServicesConfig = deps.loadBackendServicesConfig ?? loadBackendServicesConfigDefault;
  const backendConfig = await loadBackendServicesConfig(
    ehrTenantId,
    input.fetchImpl ?? (globalThis.fetch.bind(globalThis) as FetchLike),
  );
  if (!backendConfig) {
    return {
      status: 'skipped',
      ehrTenantId,
      patientResourceId,
      localPatientId,
      reason: 'missing_backend_services_config',
    };
  }

  const orgId = input.orgId ?? backendConfig.tenant.orgId ?? null;
  const requestedSince = timestampInput(input.requestedSince);
  const pageSize = boundedInteger(input.pageSize, DEFAULT_PAGE_SIZE, 1, 200);
  const maxPages = boundedInteger(input.maxPages, DEFAULT_MAX_PAGES, 1, 20);
  const continuationDepth = boundedInteger(input.continuationDepth, 0, 0, 100);
  const startIngestRun = deps.startIngestRun ?? startIngestRunDefault;
  const finishIngestRun = deps.finishIngestRun ?? finishIngestRunWithQdmBridgeDefault;
  const failIngestRun = deps.failIngestRun ?? failIngestRunDefault;
  const stageFhirResource = deps.stageFhirResource ?? stageFhirResourceDefault;
  const hydrateStagedRunToEdw = deps.hydrateStagedRunToEdw ?? hydrateStagedRunToEdwDefault;
  const fhirClient = deps.fhirClient ?? new FhirClient({ fetchImpl: input.fetchImpl });
  let ingestRun: EhrIngestRun | null = null;
  let summary = emptySummary();

  try {
    ingestRun = await startIngestRun({
      orgId,
      ehrTenantId,
      resourceType: null,
      mode: 'incremental',
      requestedSince,
      metadata: {
        source: REFRESH_SOURCE,
        patientRef: `Patient/${patientResourceId}`,
        patientResourceId,
        localPatientId,
        smartLaunchSessionId: input.smartLaunchSessionId ?? null,
        triggeredBy: input.triggeredBy ?? 'manual',
        resourceTypes,
        continuation,
        continuationDepth,
        pageSize,
        maxPages,
      },
    });

    const tokenResult = await requestBackendToken(backendConfig, input, deps);
    summary = await fetchAndStagePatientContextResources({
      fhirClient,
      tenant: backendConfig.tenant,
      token: tokenResult.accessToken,
      patientResourceId,
      orgId,
      ehrTenantId,
      ingestRunId: ingestRun.id,
      resourceTypes,
      continuation,
      requestedSince,
      pageSize,
      maxPages,
      stageFhirResource,
    });

    const edwHydration = summary.staged > 0
      ? await hydrateStagedRunToEdw({
          orgId,
          ehrTenantId,
          ingestRunId: ingestRun.id,
          resourceTypes,
          limit: DEFAULT_EDW_HYDRATION_LIMIT,
        })
      : null;

    const finished = await finishIngestRun({
      id: ingestRun.id,
      orgId,
      ehrTenantId,
      resourcesReceived: summary.received,
      resourcesStaged: summary.staged,
      resourcesUpdated: 0,
      errorCount: summary.errors.length + (edwHydration?.resourcesFailed ?? 0),
      metadata: {
        source: REFRESH_SOURCE,
        patientRef: `Patient/${patientResourceId}`,
        localPatientId,
        tokenMetadataId: tokenResult.tokenMetadata?.id ?? null,
        contextResources: summary,
        edwHydration,
      },
      qdmBridge: {
        enabled: true,
        limit: DEFAULT_QDM_BRIDGE_LIMIT,
        sourceSystem: REFRESH_SOURCE,
        failOnError: false,
      },
    });

    return {
      status: 'succeeded',
      ehrTenantId,
      patientResourceId,
      localPatientId,
      ingestRunId: ingestRun.id,
      tokenMetadataId: tokenResult.tokenMetadata?.id,
      contextResources: summary,
      edwHydration: edwHydration ?? undefined,
      qdmBridge: finishResultQdmBridge(finished),
    };
  } catch (err) {
    const errorMessage = messageFromError(err, 'SMART patient-context refresh failed');
    await safeFailIngestRun(failIngestRun, ingestRun, {
      orgId,
      ehrTenantId,
      resourcesReceived: summary.received,
      resourcesStaged: summary.staged,
      errorMessage,
      patientResourceId,
      localPatientId,
    });
    return {
      status: 'failed',
      ehrTenantId,
      patientResourceId,
      localPatientId,
      ingestRunId: ingestRun?.id,
      contextResources: summary,
      errorMessage,
    };
  }
}

async function requestBackendToken(
  config: BackendServicesConfig,
  input: RefreshSmartPatientContextInput,
  deps: RefreshSmartPatientContextDeps,
): Promise<BackendServiceTokenResult> {
  const requestBackendServiceToken = deps.requestBackendServiceToken ?? requestBackendServiceTokenDefault;
  return requestBackendServiceToken({
    config,
    scope: backendRefreshScope(config, input.resourceTypes),
    fetchImpl: input.fetchImpl,
  });
}

async function fetchAndStagePatientContextResources(input: {
  fhirClient: Pick<FhirClient, 'search'> & Partial<Pick<FhirClient, 'searchFromUrl'>>;
  tenant: BackendServicesConfig['tenant'];
  token: FhirAccessTokenRef;
  patientResourceId: string;
  orgId: number | null;
  ehrTenantId: number;
  ingestRunId: string;
  resourceTypes: readonly string[];
  continuation: readonly PatientContextRefreshContinuation[];
  requestedSince: string | null;
  pageSize: number;
  maxPages: number;
  stageFhirResource: typeof stageFhirResourceDefault;
}): Promise<PatientContextRefreshSummary> {
  const summary = emptySummary();
  const scope = scopeItems(input.token.scope);
  const continuationByResourceType = groupContinuationByResourceType(input.continuation);
  const isContinuationRun = input.continuation.length > 0;

  for (const resourceType of input.resourceTypes) {
    if (!scopeAllowsBackendResourceSearch(scope, resourceType)) {
      summary.skipped.push({ resourceType, reason: 'missing_backend_search_scope' });
      continue;
    }

    summary.attempted.push(resourceType);
    try {
      const continuations = continuationByResourceType.get(resourceType) ?? [];
      if (isContinuationRun) {
        for (const continuation of continuations) {
          const result = await searchContinuation(input, resourceType, continuation.nextUrl);
          await stageSearchResult(result, {
            orgId: input.orgId,
            ehrTenantId: input.ehrTenantId,
            ingestRunId: input.ingestRunId,
            stageFhirResource: input.stageFhirResource,
          });
          summary.received += result.resources.length;
          summary.staged += result.resources.length;
          if (result.nextUrl) {
            summary.remainingNextUrls.push({ resourceType, nextUrl: result.nextUrl });
          }
        }
      } else {
        const result = await input.fhirClient.search(
          input.tenant,
          input.token,
          resourceType,
          patientSearchParams(input.patientResourceId, input.requestedSince),
          {
            pageSize: input.pageSize,
            maxPages: input.maxPages,
            timeoutMs: DEFAULT_TIMEOUT_MS,
            retryAttempts: DEFAULT_RETRY_ATTEMPTS,
          },
        );
        await stageSearchResult(result, {
          orgId: input.orgId,
          ehrTenantId: input.ehrTenantId,
          ingestRunId: input.ingestRunId,
          stageFhirResource: input.stageFhirResource,
        });
        summary.received += result.resources.length;
        summary.staged += result.resources.length;
        if (result.nextUrl) {
          summary.remainingNextUrls.push({ resourceType, nextUrl: result.nextUrl });
        }
      }
    } catch (err) {
      summary.errors.push({
        resourceType,
        message: messageFromError(err, `${resourceType} refresh failed`),
      });
    }
  }

  return summary;
}

async function searchContinuation(
  input: {
    fhirClient: Pick<FhirClient, 'search'> & Partial<Pick<FhirClient, 'searchFromUrl'>>;
    tenant: BackendServicesConfig['tenant'];
    token: FhirAccessTokenRef;
    maxPages: number;
  },
  resourceType: string,
  nextUrl: string,
): Promise<FhirSearchResult<FhirResource>> {
  if (!input.fhirClient.searchFromUrl) {
    throw new Error('FHIR client does not support search continuation');
  }
  return input.fhirClient.searchFromUrl(
    input.tenant,
    input.token,
    resourceType,
    nextUrl,
    {
      maxPages: input.maxPages,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      retryAttempts: DEFAULT_RETRY_ATTEMPTS,
    },
  );
}

async function stageSearchResult(
  result: FhirSearchResult<FhirResource>,
  input: {
    orgId: number | null;
    ehrTenantId: number;
    ingestRunId: string;
    stageFhirResource: typeof stageFhirResourceDefault;
  },
): Promise<void> {
  for (const resource of result.resources) {
    await input.stageFhirResource({
      orgId: input.orgId,
      ehrTenantId: input.ehrTenantId,
      ingestRunId: input.ingestRunId,
      resource,
    });
  }
}

function patientSearchParams(patientResourceId: string, requestedSince: string | null): FhirSearchParams {
  const params: FhirSearchParams = { patient: patientResourceId };
  if (requestedSince) params['_lastUpdated'] = `ge${requestedSince}`;
  return params;
}

function emptySummary(): PatientContextRefreshSummary {
  return {
    attempted: [],
    skipped: [],
    received: 0,
    staged: 0,
    errors: [],
    remainingNextUrls: [],
  };
}

function normalizeContinuation(
  value: readonly PatientContextRefreshContinuation[] | undefined,
): PatientContextRefreshContinuation[] {
  if (!value) return [];
  const allowed = new Set<string>(SMART_PATIENT_CONTEXT_REFRESH_RESOURCE_TYPES);
  return value.flatMap((item) => {
    const resourceType = item.resourceType.trim();
    const nextUrl = item.nextUrl.trim();
    return allowed.has(resourceType) && nextUrl ? [{ resourceType, nextUrl }] : [];
  });
}

function groupContinuationByResourceType(
  continuation: readonly PatientContextRefreshContinuation[],
): Map<string, PatientContextRefreshContinuation[]> {
  const grouped = new Map<string, PatientContextRefreshContinuation[]>();
  for (const item of continuation) {
    const items = grouped.get(item.resourceType) ?? [];
    items.push(item);
    grouped.set(item.resourceType, items);
  }
  return grouped;
}

async function safeFailIngestRun(
  failIngestRun: typeof failIngestRunDefault,
  ingestRun: EhrIngestRun | null,
  input: {
    orgId: number | null;
    ehrTenantId: number;
    resourcesReceived: number;
    resourcesStaged: number;
    errorMessage: string;
    patientResourceId: string;
    localPatientId: number | null;
  },
): Promise<void> {
  if (!ingestRun) return;
  try {
    await failIngestRun({
      id: ingestRun.id,
      orgId: input.orgId,
      ehrTenantId: input.ehrTenantId,
      resourcesReceived: input.resourcesReceived,
      resourcesStaged: input.resourcesStaged,
      resourcesUpdated: 0,
      errorMessage: input.errorMessage,
      errors: [{ message: input.errorMessage }],
      metadata: {
        source: REFRESH_SOURCE,
        patientRef: `Patient/${input.patientResourceId}`,
        localPatientId: input.localPatientId,
      },
    });
  } catch {
    // Preserve the original refresh failure for the worker/job caller.
  }
}

function finishResultQdmBridge(
  result: FinishEhrIngestRunResult | EhrIngestRun,
): NormalizeStagedRunToQdmResult | undefined {
  return isFinishResult(result) ? result.qdmBridge ?? undefined : undefined;
}

function isFinishResult(value: FinishEhrIngestRunResult | EhrIngestRun): value is FinishEhrIngestRunResult {
  return typeof value === 'object' && value !== null && 'run' in value && 'qdmBridge' in value;
}

function supportedResourceTypes(value: readonly string[] | undefined): string[] {
  const candidates = value && value.length > 0
    ? value
    : SMART_PATIENT_CONTEXT_REFRESH_RESOURCE_TYPES;
  const allowed = new Set<string>(SMART_PATIENT_CONTEXT_REFRESH_RESOURCE_TYPES);
  return [...new Set(candidates.map((item) => item.trim()).filter((item) => allowed.has(item)))];
}

function scopeAllowsBackendResourceSearch(scopes: readonly string[], resourceType: string): boolean {
  return scopes.some((scope) => {
    const slashIndex = scope.indexOf('/');
    const dotIndex = scope.lastIndexOf('.');
    if (slashIndex <= 0 || dotIndex <= slashIndex + 1) return false;
    const context = scope.slice(0, slashIndex);
    if (context !== 'system') return false;
    const scopedResource = scope.slice(slashIndex + 1, dotIndex);
    if (scopedResource !== resourceType && scopedResource !== '*') return false;
    const access = scope.slice(dotIndex + 1).toLowerCase();
    return access === '*' || access === 'read' || access.includes('r') || access.includes('s');
  });
}

function scopeItems(scope: string | undefined): string[] {
  return typeof scope === 'string'
    ? scope.split(/\s+/).map((item) => item.trim()).filter(Boolean)
    : [];
}

function backendRefreshScope(config: BackendServicesConfig, resourceTypes: readonly string[] | undefined): string | undefined {
  const wantedResources = new Set(supportedResourceTypes(resourceTypes));
  if (wantedResources.size === 0) return undefined;

  const granted = scopeItems(config.scopesGranted);
  const requested = scopeItems(config.scopesRequested);
  const selected = [...requested].filter((scope) => {
    if (!granted.includes(scope)) return false;
    const resourceType = backendResourceTypeFromScope(scope);
    return resourceType !== null && wantedResources.has(resourceType);
  });
  return selected.length > 0 ? selected.join(' ') : undefined;
}

function backendResourceTypeFromScope(scope: string): string | null {
  const slashIndex = scope.indexOf('/');
  const dotIndex = scope.lastIndexOf('.');
  if (slashIndex <= 0 || dotIndex <= slashIndex + 1 || scope.slice(0, slashIndex) !== 'system') {
    return null;
  }
  const access = scope.slice(dotIndex + 1).toLowerCase();
  if (!(access === '*' || access === 'read' || access.includes('r') || access.includes('s'))) {
    return null;
  }
  const resourceType = scope.slice(slashIndex + 1, dotIndex);
  return resourceType === '*' ? null : resourceType;
}

function timestampInput(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('requestedSince must be a valid timestamp');
  }
  return date.toISOString();
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value == null) return fallback;
  if (!Number.isInteger(value)) return fallback;
  return Math.max(min, Math.min(value, max));
}

function requiredPositiveInt(value: unknown, label: string): number {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function optionalPositiveInt(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
