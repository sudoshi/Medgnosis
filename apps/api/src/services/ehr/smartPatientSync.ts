// =============================================================================
// SMART launch patient-context sync
// Reads the launch Patient while the raw SMART access token is still available,
// stages bounded launch-context resources, reconciles a minimal local EDW
// patient, and records the tenant-scoped FHIR-to-local crosswalk used by
// handoff completion.
// =============================================================================

import { createHash } from 'node:crypto';
import { sql } from '@medgnosis/db';
import { FhirClient } from './fhirClient.js';
import { writeFhirRequestFailureAudit } from './fhirRequestAudit.js';
import {
  failIngestRun as failIngestRunDefault,
  finishIngestRunWithQdmBridge as finishIngestRunWithQdmBridgeDefault,
  startIngestRun as startIngestRunDefault,
  type EhrIngestRun,
  type FinishEhrIngestRunInput,
  type FinishEhrIngestRunResult,
} from './ingestRuns.js';
import {
  hydrateStagedRunToEdw as hydrateStagedRunToEdwDefault,
  type HydrateStagedRunToEdwResult,
} from './edwHydration.js';
import type { NormalizeStagedRunToQdmResult } from './qdmBridge.js';
import {
  stableFhirResourceHash,
  stageFhirResource as stageFhirResourceDefault,
} from './resourceStaging.js';
import { reconcilePatient as reconcilePatientDefault } from './identity/reconcilePatient.js';
import type {
  EhrLaunchContext,
  EhrTenantRef,
  FetchLike,
  FhirAccessTokenRef,
  FhirReadResult,
  FhirResource,
  FhirSearchParams,
} from './types.js';
import type {
  JsonObject,
  SmartLaunchSession,
  SmartTokenResponse,
} from './smartLaunch.js';

export type SmartLaunchPatientSyncStatus = 'skipped' | 'resolved' | 'imported' | 'failed';

type FinishSmartLaunchIngestRun = (
  input: FinishEhrIngestRunInput,
) => Promise<FinishEhrIngestRunResult | EhrIngestRun>;

export interface SmartLaunchPatientSyncResult {
  status: SmartLaunchPatientSyncStatus;
  patientRef: string | null;
  patientResourceId: string | null;
  localPatientId: number | null;
  contextResources?: SmartLaunchContextResourceSyncSummary;
  edwHydration?: HydrateStagedRunToEdwResult;
  qdmBridge?: NormalizeStagedRunToQdmResult;
  reason?: string;
  ingestRunId?: string;
  stagedResourceId?: number;
  errorMessage?: string;
}

export interface SyncSmartLaunchPatientContextInput {
  session: SmartLaunchSession;
  tenant: EhrTenantRef & { id: number | string; orgId?: number | null };
  tokenResponse: SmartTokenResponse;
  launchContext: EhrLaunchContext;
  fetchImpl?: FetchLike;
}

interface SyncSmartLaunchPatientContextDeps {
  fhirClient?: Pick<FhirClient, 'readResource' | 'search'>;
  startIngestRun?: typeof startIngestRunDefault;
  finishIngestRun?: FinishSmartLaunchIngestRun;
  failIngestRun?: typeof failIngestRunDefault;
  stageFhirResource?: typeof stageFhirResourceDefault;
  hydrateStagedRunToEdw?: typeof hydrateStagedRunToEdwDefault;
  reconcileLocalPatient?: (
    patient: FhirResource,
    ehrTenantId: number,
    patientResourceId: string,
    sourceSystem: string,
  ) => Promise<number>;
}

export interface SmartLaunchContextResourceSyncSummary {
  attempted: string[];
  skipped: Array<{ resourceType: string; reason: string }>;
  received: number;
  staged: number;
  errors: Array<{ resourceType: string; message: string }>;
}

interface PatientCrosswalkRow {
  patient_id: number | string | null;
  local_id?: number | string | null;
}

interface PatientIdRow {
  patient_id: number | string;
}

interface LocalPatientProfile {
  mrn: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  dateOfBirth: string;
  gender: string | null;
  primaryPhone: string | null;
  email: string | null;
}

interface FhirHumanName {
  use?: string;
  text?: string;
  family?: string;
  given?: unknown;
}

interface FhirIdentifier {
  system?: string;
  value?: string;
  use?: string;
  type?: unknown;
}

interface FhirTelecom {
  system?: string;
  value?: string;
  use?: string;
}

const LAUNCH_CONTEXT_RESOURCE_TYPES = [
  'Encounter',
  'Condition',
  'Observation',
  'MedicationRequest',
  'Procedure',
  'AllergyIntolerance',
] as const;
const LAUNCH_CONTEXT_RESOURCE_PAGE_SIZE = 10;
const LAUNCH_CONTEXT_RESOURCE_MAX_PAGES = 1;
const LAUNCH_CONTEXT_RESOURCE_TIMEOUT_MS = 10_000;
const SMART_LAUNCH_QDM_BRIDGE_LIMIT = 50;
const SMART_LAUNCH_QDM_SOURCE_SYSTEM = 'smart-launch-patient-context';
const SMART_LAUNCH_EDW_HYDRATION_LIMIT = 50;

function asSqlJson(value: unknown): Parameters<typeof sql.json>[0] {
  return value as Parameters<typeof sql.json>[0];
}

export async function syncSmartLaunchPatientContext(
  input: SyncSmartLaunchPatientContextInput,
  deps: SyncSmartLaunchPatientContextDeps = {},
): Promise<SmartLaunchPatientSyncResult> {
  const patientResourceId = patientResourceIdFromLaunchContext(input.launchContext);
  const patientRef = patientResourceId ? `Patient/${patientResourceId}` : null;
  if (!patientResourceId) {
    return {
      status: 'skipped',
      patientRef: null,
      patientResourceId: null,
      localPatientId: null,
      reason: 'missing_patient_context',
    };
  }

  let ehrTenantId: number;
  let ingestRun: EhrIngestRun | null = null;
  let resourcesReceived = 0;
  let resourcesStaged = 0;

  try {
    ehrTenantId = requiredPositiveInt(input.tenant.id, 'SMART launch EHR tenant id');
    const existingPatientId = await findMappedPatientId(ehrTenantId, patientResourceId);
    if (existingPatientId !== null) {
      const contextSync = await maybeSyncExistingPatientContextResources({
        input,
        ehrTenantId,
        patientResourceId,
        localPatientId: existingPatientId,
        deps,
      });
      return {
        status: 'resolved',
        patientRef,
        patientResourceId,
        localPatientId: existingPatientId,
        contextResources: contextSync?.contextResources,
        edwHydration: contextSync?.edwHydration,
        qdmBridge: contextSync?.qdmBridge,
        ingestRunId: contextSync?.ingestRunId,
      };
    }

    const startIngestRun = deps.startIngestRun ?? startIngestRunDefault;
    const stageFhirResource = deps.stageFhirResource ?? stageFhirResourceDefault;
    const fhirClient = deps.fhirClient ?? new FhirClient({
      fetchImpl: input.fetchImpl,
      failureAuditSink: writeFhirRequestFailureAudit,
    });
    const orgId = input.tenant.orgId ?? input.session.orgId ?? null;

    ingestRun = await startIngestRun({
      orgId,
      ehrTenantId,
      resourceType: 'Patient',
      mode: 'manual',
      metadata: {
        source: 'smart_launch_patient_context',
        smartLaunchSessionId: input.session.id,
        patientRef,
      },
    });

    const readResult = await fhirClient.readResource(input.tenant, {
      accessToken: input.tokenResponse.access_token,
      tokenType: input.tokenResponse.token_type ?? 'Bearer',
      scope: input.tokenResponse.scope,
    }, 'Patient', patientResourceId);
    const patient = requirePatientResource(readResult, patientResourceId);
    resourcesReceived = 1;
    const staged = await stageFhirResource({
      orgId,
      ehrTenantId,
      ingestRunId: ingestRun.id,
      resource: patient,
    });
    resourcesStaged = 1;
    const reconcile = deps.reconcileLocalPatient ?? reconcileLocalPatient;
    const sourceSystem = cleanString(input.tenant.vendor) ?? 'smart_launch';
    const localPatientId = await reconcile(patient, ehrTenantId, patientResourceId, sourceSystem);
    const mappedPatientId = await upsertPatientCrosswalk({
      ehrTenantId,
      patientResourceId,
      localPatientId,
      patient,
    });
    const contextResources = await syncLaunchContextResources({
      fhirClient,
      tenant: input.tenant,
      token: tokenRefFromResponse(input.tokenResponse),
      launchContext: input.launchContext,
      patientResourceId,
      orgId,
      ehrTenantId,
      ingestRunId: ingestRun.id,
      stageFhirResource,
    });
    resourcesReceived += contextResources.received;
    resourcesStaged += contextResources.staged;
    const edwHydration = await hydrateSmartLaunchContextResources(deps, {
      orgId,
      ehrTenantId,
      ingestRunId: ingestRun.id,
      resourcesStaged: contextResources.staged,
    });

    const qdmBridge = await finishSmartLaunchIngestRun(deps, {
      id: ingestRun.id,
      orgId,
      ehrTenantId,
      resourcesReceived,
      resourcesStaged,
      resourcesUpdated: 1,
      errorCount: contextResources.errors.length + (edwHydration?.resourcesFailed ?? 0),
      metadata: {
        patientRef,
        localPatientId: mappedPatientId,
        stagedResourceId: staged.id,
        contextResources,
        edwHydration,
      },
    });

    return {
      status: 'imported',
      patientRef,
      patientResourceId,
      localPatientId: mappedPatientId,
      contextResources,
      edwHydration: edwHydration ?? undefined,
      qdmBridge: qdmBridge ?? undefined,
      ingestRunId: ingestRun.id,
      stagedResourceId: staged.id,
    };
  } catch (err) {
    const errorMessage = messageFromError(err, 'SMART launch patient context sync failed');
    await failSyncRun(deps, ingestRun, errorMessage, { resourcesReceived, resourcesStaged });
    return {
      status: 'failed',
      patientRef,
      patientResourceId,
      localPatientId: null,
      ingestRunId: ingestRun?.id,
      errorMessage,
    };
  }
}

export function enrichLaunchContextWithPatientSync(
  launchContext: EhrLaunchContext,
  sync: SmartLaunchPatientSyncResult,
): EhrLaunchContext {
  const enriched: JsonObject = {
    ...launchContext,
    patientSync: compactPatientSyncResult(sync),
  };
  if (sync.localPatientId !== null) {
    enriched.localPatientId = sync.localPatientId;
  }
  return enriched as unknown as EhrLaunchContext;
}

export function patientSyncFromLaunchContext(launchContext: JsonObject): SmartLaunchPatientSyncResult | null {
  const value = launchContext['patientSync'];
  if (!isRecord(value)) return null;
  const status = value['status'];
  if (!isPatientSyncStatus(status)) return null;
  return {
    status,
    patientRef: cleanString(value['patientRef']),
    patientResourceId: cleanString(value['patientResourceId']),
    localPatientId: optionalPositiveNumber(value['localPatientId']),
    contextResources: contextResourceSummaryFromValue(value['contextResources']) ?? undefined,
    edwHydration: edwHydrationSummaryFromValue(value['edwHydration']) ?? undefined,
    qdmBridge: qdmBridgeSummaryFromValue(value['qdmBridge']) ?? undefined,
    reason: cleanString(value['reason']) ?? undefined,
    ingestRunId: cleanString(value['ingestRunId']) ?? undefined,
    stagedResourceId: optionalPositiveNumber(value['stagedResourceId']) ?? undefined,
    errorMessage: cleanString(value['errorMessage']) ?? undefined,
  };
}

export function localPatientIdFromLaunchContext(launchContext: JsonObject): number | null {
  const direct = optionalPositiveNumber(launchContext['localPatientId']);
  if (direct !== null) return direct;
  return patientSyncFromLaunchContext(launchContext)?.localPatientId ?? null;
}

export function patientResourceIdFromLaunchContext(launchContext: { patient?: unknown }): string | null {
  const patient = launchContext.patient;
  if (typeof patient !== 'string' || patient.trim().length === 0) return null;
  return patientResourceIdFromReference(patient);
}

function patientResourceIdFromReference(reference: string): string | null {
  const trimmed = reference.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return patientResourceIdFromPath(url.pathname);
  } catch {
    return patientResourceIdFromPath(trimmed);
  }
}

function patientResourceIdFromPath(path: string): string | null {
  const segments = path.split('/').filter(Boolean);
  const patientSegmentIndex = segments.lastIndexOf('Patient');
  if (patientSegmentIndex >= 0) {
    const resourceId = segments[patientSegmentIndex + 1];
    return resourceId ? decodeURIComponent(resourceId) : null;
  }
  return segments.length === 1 ? decodeURIComponent(segments[0]!) : null;
}

async function findMappedPatientId(ehrTenantId: number, patientResourceId: string): Promise<number | null> {
  const rows = await sql<PatientCrosswalkRow[]>`
    SELECT patient_id, local_id
    FROM phm_edw.ehr_resource_crosswalk
    WHERE ehr_tenant_id = ${ehrTenantId}
      AND resource_type = 'Patient'
      AND ehr_resource_id = ${patientResourceId}
      AND (patient_id IS NOT NULL OR local_id IS NOT NULL)
    ORDER BY last_seen_at DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return optionalPositiveNumber(row.patient_id) ?? optionalPositiveNumber(row.local_id);
}

async function maybeSyncExistingPatientContextResources(input: {
  input: SyncSmartLaunchPatientContextInput;
  ehrTenantId: number;
  patientResourceId: string;
  localPatientId: number;
  deps: SyncSmartLaunchPatientContextDeps;
}): Promise<{
  contextResources: SmartLaunchContextResourceSyncSummary;
  edwHydration?: HydrateStagedRunToEdwResult;
  qdmBridge?: NormalizeStagedRunToQdmResult;
  ingestRunId: string;
} | null> {
  if (!hasAnyLaunchContextResourceScope(input.input.launchContext.scopes)) {
    return null;
  }

  const startIngestRun = input.deps.startIngestRun ?? startIngestRunDefault;
  const stageFhirResource = input.deps.stageFhirResource ?? stageFhirResourceDefault;
  const fhirClient = input.deps.fhirClient ?? new FhirClient({
    fetchImpl: input.input.fetchImpl,
    failureAuditSink: writeFhirRequestFailureAudit,
  });
  const orgId = input.input.tenant.orgId ?? input.input.session.orgId ?? null;
  const ingestRun = await startIngestRun({
    orgId,
    ehrTenantId: input.ehrTenantId,
    resourceType: 'Patient',
    mode: 'manual',
    metadata: {
      source: 'smart_launch_patient_context',
      smartLaunchSessionId: input.input.session.id,
      patientRef: `Patient/${input.patientResourceId}`,
      localPatientId: input.localPatientId,
      patientMapping: 'existing_crosswalk',
    },
  });

  const contextResources = await syncLaunchContextResources({
    fhirClient,
    tenant: input.input.tenant,
    token: tokenRefFromResponse(input.input.tokenResponse),
    launchContext: input.input.launchContext,
    patientResourceId: input.patientResourceId,
    orgId,
    ehrTenantId: input.ehrTenantId,
    ingestRunId: ingestRun.id,
    stageFhirResource,
  });
  const edwHydration = await hydrateSmartLaunchContextResources(input.deps, {
    orgId,
    ehrTenantId: input.ehrTenantId,
    ingestRunId: ingestRun.id,
    resourcesStaged: contextResources.staged,
  });

  const qdmBridge = await finishSmartLaunchIngestRun(input.deps, {
    id: ingestRun.id,
    orgId,
    ehrTenantId: input.ehrTenantId,
    resourcesReceived: contextResources.received,
    resourcesStaged: contextResources.staged,
    resourcesUpdated: 0,
    errorCount: contextResources.errors.length + (edwHydration?.resourcesFailed ?? 0),
    metadata: {
      localPatientId: input.localPatientId,
      contextResources,
      edwHydration,
    },
  });

  return {
    contextResources,
    edwHydration: edwHydration ?? undefined,
    qdmBridge: qdmBridge ?? undefined,
    ingestRunId: ingestRun.id,
  };
}

async function hydrateSmartLaunchContextResources(
  deps: SyncSmartLaunchPatientContextDeps,
  input: {
    orgId: number | null;
    ehrTenantId: number;
    ingestRunId: string;
    resourcesStaged: number;
  },
): Promise<HydrateStagedRunToEdwResult | null> {
  if (input.resourcesStaged <= 0) return null;
  const hydrateStagedRunToEdw = deps.hydrateStagedRunToEdw ?? hydrateStagedRunToEdwDefault;
  return hydrateStagedRunToEdw({
    orgId: input.orgId,
    ehrTenantId: input.ehrTenantId,
    ingestRunId: input.ingestRunId,
    limit: SMART_LAUNCH_EDW_HYDRATION_LIMIT,
    resourceTypes: LAUNCH_CONTEXT_RESOURCE_TYPES,
  });
}

async function finishSmartLaunchIngestRun(
  deps: SyncSmartLaunchPatientContextDeps,
  input: FinishEhrIngestRunInput,
): Promise<NormalizeStagedRunToQdmResult | null> {
  const finishIngestRun = deps.finishIngestRun ?? finishIngestRunWithQdmBridgeDefault;
  const result = await finishIngestRun({
    ...input,
    qdmBridge: {
      enabled: true,
      limit: SMART_LAUNCH_QDM_BRIDGE_LIMIT,
      sourceSystem: SMART_LAUNCH_QDM_SOURCE_SYSTEM,
      failOnError: false,
    },
  });

  return isFinishIngestRunResult(result) ? result.qdmBridge : null;
}

async function syncLaunchContextResources(input: {
  fhirClient: Pick<FhirClient, 'search'>;
  tenant: EhrTenantRef;
  token: FhirAccessTokenRef;
  launchContext: EhrLaunchContext;
  patientResourceId: string;
  orgId: number | null;
  ehrTenantId: number;
  ingestRunId: string;
  stageFhirResource: typeof stageFhirResourceDefault;
}): Promise<SmartLaunchContextResourceSyncSummary> {
  const summary = emptyContextResourceSummary();

  for (const resourceType of LAUNCH_CONTEXT_RESOURCE_TYPES) {
    if (!scopeAllowsPatientResourceSearch(input.launchContext.scopes, resourceType)) {
      summary.skipped.push({ resourceType, reason: 'missing_patient_search_scope' });
      continue;
    }

    summary.attempted.push(resourceType);
    try {
      const searchResult = await input.fhirClient.search(
        input.tenant,
        input.token,
        resourceType,
        patientSearchParams(input.patientResourceId),
        {
          pageSize: LAUNCH_CONTEXT_RESOURCE_PAGE_SIZE,
          maxPages: LAUNCH_CONTEXT_RESOURCE_MAX_PAGES,
          timeoutMs: LAUNCH_CONTEXT_RESOURCE_TIMEOUT_MS,
          retryAttempts: 1,
        },
      );

      summary.received += searchResult.resources.length;
      for (const resource of searchResult.resources) {
        await input.stageFhirResource({
          orgId: input.orgId,
          ehrTenantId: input.ehrTenantId,
          ingestRunId: input.ingestRunId,
          resource,
        });
        summary.staged += 1;
      }
    } catch (err) {
      summary.errors.push({
        resourceType,
        message: messageFromError(err, `${resourceType} search failed`),
      });
    }
  }

  return summary;
}

function tokenRefFromResponse(tokenResponse: SmartTokenResponse): FhirAccessTokenRef {
  return {
    accessToken: tokenResponse.access_token,
    tokenType: tokenResponse.token_type ?? 'Bearer',
    scope: tokenResponse.scope,
  };
}

function patientSearchParams(patientResourceId: string): FhirSearchParams {
  return { patient: patientResourceId };
}

function hasAnyLaunchContextResourceScope(scopes: readonly string[]): boolean {
  return LAUNCH_CONTEXT_RESOURCE_TYPES.some((resourceType) =>
    scopeAllowsPatientResourceSearch(scopes, resourceType),
  );
}

function scopeAllowsPatientResourceSearch(scopes: readonly string[], resourceType: string): boolean {
  return scopes.some((scope) => {
    const normalized = scope.trim();
    const slashIndex = normalized.indexOf('/');
    const dotIndex = normalized.lastIndexOf('.');
    if (slashIndex <= 0 || dotIndex <= slashIndex + 1) return false;
    const context = normalized.slice(0, slashIndex);
    if (context !== 'patient') return false;
    const resource = normalized.slice(slashIndex + 1, dotIndex);
    if (resource !== resourceType && resource !== '*') return false;
    const access = normalized.slice(dotIndex + 1).toLowerCase();
    return access === '*' || access === 'read' || access.includes('r') || access.includes('s');
  });
}

function emptyContextResourceSummary(): SmartLaunchContextResourceSyncSummary {
  return {
    attempted: [],
    skipped: [],
    received: 0,
    staged: 0,
    errors: [],
  };
}

function contextResourceSummaryFromValue(value: unknown): SmartLaunchContextResourceSyncSummary | null {
  if (!isRecord(value)) return null;
  return {
    attempted: stringArray(value['attempted']),
    skipped: recordArray(value['skipped']).flatMap((item) => {
      const resourceType = cleanString(item['resourceType']);
      const reason = cleanString(item['reason']);
      return resourceType && reason ? [{ resourceType, reason }] : [];
    }),
    received: nonNegativeInteger(value['received']),
    staged: nonNegativeInteger(value['staged']),
    errors: recordArray(value['errors']).flatMap((item) => {
      const resourceType = cleanString(item['resourceType']);
      const message = cleanString(item['message']);
      return resourceType && message ? [{ resourceType, message }] : [];
    }),
  };
}

function qdmBridgeSummaryFromValue(value: unknown): NormalizeStagedRunToQdmResult | null {
  if (!isRecord(value)) return null;
  return {
    resourcesSeen: nonNegativeInteger(value['resourcesSeen']),
    resourcesNormalized: nonNegativeInteger(value['resourcesNormalized']),
    resourcesSkipped: nonNegativeInteger(value['resourcesSkipped']),
    resourcesFailed: nonNegativeInteger(value['resourcesFailed']),
    eventsUpserted: nonNegativeInteger(value['eventsUpserted']),
    errors: recordArray(value['errors']).flatMap((item) => {
      const stagingId = optionalPositiveNumber(item['stagingId']);
      const resourceType = cleanString(item['resourceType']);
      const resourceId = cleanString(item['resourceId']);
      const message = cleanString(item['message']);
      return stagingId !== null && resourceType && resourceId && message
        ? [{ stagingId, resourceType, resourceId, message }]
        : [];
    }),
  };
}

function edwHydrationSummaryFromValue(value: unknown): HydrateStagedRunToEdwResult | null {
  if (!isRecord(value)) return null;
  const byResourceTypeValue = value['byResourceType'];
  const byResourceType: HydrateStagedRunToEdwResult['byResourceType'] = {};
  if (isRecord(byResourceTypeValue)) {
    for (const [resourceType, summary] of Object.entries(byResourceTypeValue)) {
      if (!isRecord(summary)) continue;
      byResourceType[resourceType] = {
        seen: nonNegativeInteger(summary['seen']),
        hydrated: nonNegativeInteger(summary['hydrated']),
        skipped: nonNegativeInteger(summary['skipped']),
        failed: nonNegativeInteger(summary['failed']),
      };
    }
  }

  return {
    resourcesSeen: nonNegativeInteger(value['resourcesSeen']),
    resourcesHydrated: nonNegativeInteger(value['resourcesHydrated']),
    resourcesSkipped: nonNegativeInteger(value['resourcesSkipped']),
    resourcesFailed: nonNegativeInteger(value['resourcesFailed']),
    rowsInserted: nonNegativeInteger(value['rowsInserted']),
    rowsUpdated: nonNegativeInteger(value['rowsUpdated']),
    byResourceType,
    errors: recordArray(value['errors']).flatMap((item) => {
      const stagingId = optionalPositiveNumber(item['stagingId']);
      const resourceType = cleanString(item['resourceType']);
      const resourceId = cleanString(item['resourceId']);
      const message = cleanString(item['message']);
      return stagingId !== null && resourceType && resourceId && message
        ? [{ stagingId, resourceType, resourceId, message }]
        : [];
    }),
  };
}

function isFinishIngestRunResult(
  value: FinishEhrIngestRunResult | EhrIngestRun,
): value is FinishEhrIngestRunResult {
  return isRecord(value) && 'run' in value && 'qdmBridge' in value;
}

function requirePatientResource(
  result: FhirReadResult<FhirResource>,
  expectedResourceId: string,
): FhirResource {
  const resource = result.resource;
  if (resource.resourceType !== 'Patient') {
    throw new Error(`FHIR launch context read returned ${resource.resourceType} instead of Patient`);
  }
  const resourceId = cleanString(resource.id);
  if (!resourceId) {
    throw new Error('FHIR Patient resource is missing id');
  }
  if (resourceId !== expectedResourceId) {
    throw new Error('FHIR Patient id does not match SMART launch patient context');
  }
  return resource;
}

async function reconcileLocalPatient(
  patient: FhirResource,
  ehrTenantId: number,
  patientResourceId: string,
  sourceSystem: string,
): Promise<number> {
  // Route through enterprise identity resolution: the same person arriving from
  // another tenant/source is unified onto one phm_edw.patient row instead of
  // minting a duplicate. The legacy row is only created when the person is new.
  const result = await reconcilePatientDefault({
    patient,
    ehrTenantId,
    sourceSystem,
    insertLegacyPatient: () => insertLegacyPatientRow(patient, ehrTenantId, patientResourceId),
  });
  return result.localPatientId;
}

async function insertLegacyPatientRow(
  patient: FhirResource,
  ehrTenantId: number,
  patientResourceId: string,
): Promise<number> {
  const profile = localPatientProfileFromFhir(patient, ehrTenantId, patientResourceId);
  const rows = await sql<PatientIdRow[]>`
    INSERT INTO phm_edw.patient
      (mrn, first_name, middle_name, last_name, date_of_birth, gender,
       primary_phone, email, active_ind, created_date, updated_date)
    VALUES (
      ${profile.mrn},
      ${profile.firstName},
      ${profile.middleName},
      ${profile.lastName},
      ${profile.dateOfBirth}::date,
      ${profile.gender},
      ${profile.primaryPhone},
      ${profile.email},
      'Y',
      NOW(),
      NOW()
    )
    RETURNING patient_id
  `;
  const patientId = optionalPositiveNumber(rows[0]?.patient_id);
  if (patientId === null) {
    throw new Error('Unable to create local patient for SMART launch context');
  }
  return patientId;
}

async function upsertPatientCrosswalk(input: {
  ehrTenantId: number;
  patientResourceId: string;
  localPatientId: number;
  patient: FhirResource;
}): Promise<number> {
  const rows = await sql<PatientCrosswalkRow[]>`
    INSERT INTO phm_edw.ehr_resource_crosswalk
      (ehr_tenant_id, resource_type, ehr_resource_id, ehr_identifier,
       local_table, local_id, patient_id, source_version_id,
       source_last_updated, hash, last_seen_at)
    VALUES (
      ${input.ehrTenantId},
      'Patient',
      ${input.patientResourceId},
      ${sql.json(asSqlJson(patientIdentifierArray(input.patient)))},
      'phm_edw.patient',
      ${input.localPatientId},
      ${input.localPatientId},
      ${cleanString(input.patient.meta?.versionId)},
      ${cleanString(input.patient.meta?.lastUpdated)}::timestamptz,
      ${stableFhirResourceHash(input.patient)},
      NOW()
    )
    ON CONFLICT ON CONSTRAINT uq_ehr_resource_crosswalk_source
    DO UPDATE SET
      ehr_identifier = EXCLUDED.ehr_identifier,
      local_table = COALESCE(phm_edw.ehr_resource_crosswalk.local_table, EXCLUDED.local_table),
      local_id = COALESCE(
        phm_edw.ehr_resource_crosswalk.local_id,
        phm_edw.ehr_resource_crosswalk.patient_id,
        EXCLUDED.local_id
      ),
      patient_id = COALESCE(phm_edw.ehr_resource_crosswalk.patient_id, EXCLUDED.patient_id),
      source_version_id = EXCLUDED.source_version_id,
      source_last_updated = EXCLUDED.source_last_updated,
      hash = EXCLUDED.hash,
      last_seen_at = NOW()
    RETURNING patient_id, local_id
  `;
  const row = rows[0];
  const patientId = optionalPositiveNumber(row?.patient_id) ?? optionalPositiveNumber(row?.local_id);
  if (patientId === null) {
    throw new Error('Unable to record SMART launch Patient crosswalk');
  }
  return patientId;
}

function localPatientProfileFromFhir(
  patient: FhirResource,
  ehrTenantId: number,
  patientResourceId: string,
): LocalPatientProfile {
  const birthDate = cleanString(patient['birthDate']);
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    throw new Error('FHIR Patient.birthDate is required to create a local patient');
  }

  const name = preferredHumanName(patient['name']);
  const given = stringArray(name?.given);
  const firstName = cleanString(given[0]);
  const lastName = cleanString(name?.family);
  if (!firstName || !lastName) {
    throw new Error('FHIR Patient.name must include given and family values to create a local patient');
  }
  const middleName = truncateNullable(given.slice(1).join(' ') || null, 100);

  return {
    mrn: truncate(patientMrn(patient) ?? deterministicMrn(ehrTenantId, patientResourceId), 50),
    firstName: truncate(firstName, 100),
    middleName,
    lastName: truncate(lastName, 100),
    dateOfBirth: birthDate,
    gender: truncateNullable(cleanString(patient['gender']), 50),
    primaryPhone: truncateNullable(patientTelecom(patient, 'phone'), 20),
    email: truncateNullable(patientTelecom(patient, 'email'), 100),
  };
}

function preferredHumanName(value: unknown): FhirHumanName | null {
  const names = recordArray(value) as FhirHumanName[];
  return (
    names.find((name) => cleanString(name.use) === 'official' && hasUsableHumanName(name))
    ?? names.find((name) => cleanString(name.use) === 'usual' && hasUsableHumanName(name))
    ?? names.find(hasUsableHumanName)
    ?? null
  );
}

function hasUsableHumanName(name: FhirHumanName): boolean {
  return cleanString(name.family) !== null && cleanString(stringArray(name.given)[0]) !== null;
}

function patientMrn(patient: FhirResource): string | null {
  const identifiers = recordArray(patient['identifier']) as FhirIdentifier[];
  const mrnIdentifier = identifiers.find((identifier) => identifierTypeCodes(identifier).includes('MR'));
  return cleanString(mrnIdentifier?.value) ?? cleanString(identifiers.find((identifier) => identifier.value)?.value);
}

function deterministicMrn(ehrTenantId: number, patientResourceId: string): string {
  const digest = createHash('sha256')
    .update(`${ehrTenantId}:Patient:${patientResourceId}`)
    .digest('hex')
    .slice(0, 16);
  return `EHR${ehrTenantId}-${digest}`;
}

function identifierTypeCodes(identifier: FhirIdentifier): string[] {
  const type = identifier.type;
  if (!isRecord(type)) return [];
  const coding = recordArray(type['coding']);
  return coding.flatMap((item) => {
    const code = cleanString(item['code']);
    return code ? [code] : [];
  });
}

function patientIdentifierArray(patient: FhirResource): JsonObject[] {
  const identifiers = recordArray(patient['identifier']) as FhirIdentifier[];
  return identifiers.flatMap((identifier) => {
    const system = cleanString(identifier.system);
    const value = cleanString(identifier.value);
    if (!system && !value) return [];
    const normalized: JsonObject = {};
    if (system) normalized.system = system;
    if (value) normalized.value = value;
    const use = cleanString(identifier.use);
    if (use) normalized.use = use;
    const codes = identifierTypeCodes(identifier);
    if (codes.length > 0) normalized.typeCodes = codes;
    return [normalized];
  });
}

function patientTelecom(patient: FhirResource, system: 'email' | 'phone'): string | null {
  const telecom = recordArray(patient['telecom']) as FhirTelecom[];
  return cleanString(telecom.find((item) => item.system === system && item.use === 'mobile')?.value)
    ?? cleanString(telecom.find((item) => item.system === system && item.use === 'home')?.value)
    ?? cleanString(telecom.find((item) => item.system === system)?.value);
}

async function failSyncRun(
  deps: SyncSmartLaunchPatientContextDeps,
  ingestRun: EhrIngestRun | null,
  errorMessage: string,
  counts: { resourcesReceived: number; resourcesStaged: number },
): Promise<void> {
  if (!ingestRun) return;
  const failIngestRun = deps.failIngestRun ?? failIngestRunDefault;
  try {
    await failIngestRun({
      id: ingestRun.id,
      orgId: ingestRun.orgId,
      ehrTenantId: ingestRun.ehrTenantId,
      resourcesReceived: counts.resourcesReceived,
      resourcesStaged: counts.resourcesStaged,
      resourcesUpdated: 0,
      errorMessage,
      errors: [{ message: errorMessage }],
      metadata: { source: 'smart_launch_patient_context' },
    });
  } catch {
    // Launch completion should not fail because failure bookkeeping failed.
  }
}

function compactPatientSyncResult(sync: SmartLaunchPatientSyncResult): JsonObject {
  const compacted: JsonObject = {
    status: sync.status,
    patientRef: sync.patientRef,
    patientResourceId: sync.patientResourceId,
    localPatientId: sync.localPatientId,
  };
  if (sync.contextResources) compacted.contextResources = sync.contextResources as unknown as JsonObject;
  if (sync.edwHydration) compacted.edwHydration = sync.edwHydration as unknown as JsonObject;
  if (sync.qdmBridge) compacted.qdmBridge = sync.qdmBridge as unknown as JsonObject;
  if (sync.reason) compacted.reason = sync.reason;
  if (sync.ingestRunId) compacted.ingestRunId = sync.ingestRunId;
  if (sync.stagedResourceId !== undefined) compacted.stagedResourceId = sync.stagedResourceId;
  if (sync.errorMessage) compacted.errorMessage = sync.errorMessage;
  return compacted;
}

function isPatientSyncStatus(value: unknown): value is SmartLaunchPatientSyncStatus {
  return value === 'skipped' || value === 'resolved' || value === 'imported' || value === 'failed';
}

function requiredPositiveInt(value: unknown, label: string): number {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function optionalPositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function truncateNullable(value: string | null, maxLength: number): string | null {
  return value ? truncate(value, maxLength) : null;
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
