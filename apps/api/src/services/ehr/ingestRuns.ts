// =============================================================================
// Medgnosis API — EHR ingest run tracking
// =============================================================================

import { sql } from '@medgnosis/db';
import {
  normalizeStagedRunToQdm,
  type NormalizeStagedRunToQdmResult,
} from './qdmBridge.js';

export type EhrIngestRunMode = 'incremental' | 'backfill' | 'bulk' | 'manual';
export type EhrIngestRunStatus = 'running' | 'succeeded' | 'failed' | 'canceled';
export type EhrIngestRunQdmReplayStatus = 'not_ready' | 'ready' | 'replayed' | 'failed';
export type JsonObject = Record<string, unknown>;

export interface EhrIngestRunOperationalSummary {
  source: string;
  recommendedAction: string;
  durationMs: number | null;
  hasErrors: boolean;
  completionRatio: number | null;
  updateRatio: number | null;
  bulkJobId: string | null;
  bulkOutputCount: number | null;
  contextResourceTypesAttempted: string[];
  contextResourceTypesSkipped: number;
  contextResourcesReceived: number | null;
  contextResourcesStaged: number | null;
  contextErrors: number | null;
  continuationPagesRemaining: number | null;
  edwResourcesHydrated: number | null;
  edwResourcesFailed: number | null;
  qdmReplayStatus: EhrIngestRunQdmReplayStatus;
  canReplayQdm: boolean;
  qdmResourcesSeen: number | null;
  qdmResourcesNormalized: number | null;
  qdmResourcesFailed: number | null;
  qdmEventsUpserted: number | null;
  qdmLastReplayedAt: string | null;
}

export interface EhrIngestRun {
  id: string;
  orgId: number | null;
  ehrTenantId: number;
  resourceType: string | null;
  mode: EhrIngestRunMode;
  status: EhrIngestRunStatus;
  requestedSince: string | null;
  startedAt: string;
  finishedAt: string | null;
  resourcesReceived: number;
  resourcesStaged: number;
  resourcesUpdated: number;
  errorCount: number;
  errorMessage: string | null;
  errors: unknown[];
  metadata: JsonObject;
  operationalSummary: EhrIngestRunOperationalSummary;
  createdAt: string;
  updatedAt: string;
}

type EhrIngestRunCore = Omit<EhrIngestRun, 'operationalSummary'>;

export interface StartEhrIngestRunInput {
  orgId: number | null;
  ehrTenantId: number;
  resourceType?: string | null;
  mode?: EhrIngestRunMode;
  requestedSince?: string | Date | null;
  metadata?: JsonObject;
}

export interface FinishEhrIngestRunInput {
  id: string;
  orgId?: number | null;
  ehrTenantId?: number;
  resourcesReceived?: number;
  resourcesStaged?: number;
  resourcesUpdated?: number;
  errorCount?: number;
  metadata?: JsonObject;
  qdmBridge?: FinishEhrIngestRunQdmBridgeOptions;
}

export interface FailEhrIngestRunInput extends FinishEhrIngestRunInput {
  errorMessage: string;
  errors?: unknown[];
}

export interface ListEhrIngestRunsInput {
  ehrTenantId: number;
  status?: EhrIngestRunStatus;
  mode?: EhrIngestRunMode;
  resourceType?: string;
  limit?: number;
}

export interface FinishEhrIngestRunQdmBridgeOptions {
  enabled: boolean;
  limit?: number;
  sourceSystem?: string;
  failOnError?: boolean;
}

export interface FinishEhrIngestRunResult {
  run: EhrIngestRun;
  qdmBridge: NormalizeStagedRunToQdmResult | null;
}

export interface RecordEhrIngestRunQdmReplayInput {
  id: string;
  ehrTenantId: number;
  result: NormalizeStagedRunToQdmResult;
  limit?: number;
  sourceSystem?: string;
}

interface EhrIngestRunRow {
  id: string;
  org_id: number | null;
  ehr_tenant_id: number;
  resource_type: string | null;
  mode: EhrIngestRunMode;
  status: EhrIngestRunStatus;
  requested_since: string | null;
  started_at: string;
  finished_at: string | null;
  resources_received: number;
  resources_staged: number;
  resources_updated: number;
  error_count: number;
  error_message: string | null;
  errors: unknown;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
}

function asSqlJson(value: unknown): Parameters<typeof sql.json>[0] {
  return value as Parameters<typeof sql.json>[0];
}

function mapDbNumber(value: number | string): number {
  return Number(value);
}

function mapNullableDbNumber(value: number | string | null): number | null {
  return value == null ? null : mapDbNumber(value);
}

function mapIngestRun(row: EhrIngestRunRow): EhrIngestRun {
  const run: EhrIngestRunCore = {
    id: row.id,
    orgId: mapNullableDbNumber(row.org_id),
    ehrTenantId: mapDbNumber(row.ehr_tenant_id),
    resourceType: row.resource_type,
    mode: row.mode,
    status: row.status,
    requestedSince: row.requested_since,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    resourcesReceived: row.resources_received,
    resourcesStaged: row.resources_staged,
    resourcesUpdated: row.resources_updated,
    errorCount: row.error_count,
    errorMessage: row.error_message,
    errors: Array.isArray(row.errors) ? row.errors : [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return {
    ...run,
    operationalSummary: buildIngestRunOperationalSummary(run),
  };
}

function requireReturnedRun(rows: EhrIngestRunRow[], action: string): EhrIngestRun {
  const row = rows[0];
  if (!row) {
    throw new Error(`Unable to ${action} EHR ingest run`);
  }
  return mapIngestRun(row);
}

function nonEmptyResourceType(resourceType: string | null | undefined): string | null {
  if (resourceType == null) return null;
  const trimmed = resourceType.trim();
  if (!trimmed) {
    throw new Error('EHR ingest run resourceType cannot be empty');
  }
  return trimmed;
}

function timestampInput(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function countOrNull(value: number | undefined): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('EHR ingest run counts must be non-negative integers');
  }
  return value;
}

function buildIngestRunOperationalSummary(run: EhrIngestRunCore): EhrIngestRunOperationalSummary {
  const metadata = run.metadata ?? {};
  const contextResources = metadataRecord(metadata, 'contextResources');
  const bulkImport = metadataRecord(metadata, 'bulkImport');
  const manifest = metadataRecord(metadata, 'manifest');
  const edwHydration = metadataRecord(metadata, 'edwHydration') ?? metadataRecord(bulkImport, 'edwHydration');
  const qdmBridge = metadataRecord(metadata, 'qdmBridge');
  const qdmReplay = metadataRecord(metadata, 'qdmReplay');
  const qdmResourcesFailed = metadataNumber(qdmBridge, 'resourcesFailed');
  const qdmResourcesNormalized = metadataNumber(qdmBridge, 'resourcesNormalized');
  const qdmReplayStatus = ingestRunQdmStatus({
    run,
    qdmBridge,
    qdmResourcesFailed,
    qdmResourcesNormalized,
    qdmLastReplayedAt: metadataString(qdmReplay, 'replayedAt'),
  });
  const canReplayQdm = run.status !== 'running' && run.resourcesStaged > 0;

  return {
    source: metadataString(metadata, 'source') ?? metadataString(qdmReplay, 'sourceSystem') ?? 'ehr-ingest',
    recommendedAction: ingestRunRecommendedAction({ run, qdmReplayStatus, canReplayQdm, edwHydration }),
    durationMs: durationMs(run.startedAt, run.finishedAt),
    hasErrors: run.errorCount > 0 || run.errors.length > 0 || (qdmResourcesFailed ?? 0) > 0 || (metadataNumber(edwHydration, 'resourcesFailed') ?? 0) > 0,
    completionRatio: ratio(run.resourcesStaged, run.resourcesReceived),
    updateRatio: ratio(run.resourcesUpdated, run.resourcesStaged),
    bulkJobId: metadataString(metadata, 'bulkJobId'),
    bulkOutputCount: metadataNumber(manifest, 'outputCount'),
    contextResourceTypesAttempted: metadataStringArray(contextResources, 'attempted'),
    contextResourceTypesSkipped: metadataRecordArrayLength(contextResources, 'skipped') ?? 0,
    contextResourcesReceived: metadataNumber(contextResources, 'received'),
    contextResourcesStaged: metadataNumber(contextResources, 'staged'),
    contextErrors: metadataRecordArrayLength(contextResources, 'errors'),
    continuationPagesRemaining: metadataRecordArrayLength(contextResources, 'remainingNextUrls'),
    edwResourcesHydrated: metadataNumber(edwHydration, 'resourcesHydrated'),
    edwResourcesFailed: metadataNumber(edwHydration, 'resourcesFailed'),
    qdmReplayStatus,
    canReplayQdm,
    qdmResourcesSeen: metadataNumber(qdmBridge, 'resourcesSeen'),
    qdmResourcesNormalized,
    qdmResourcesFailed,
    qdmEventsUpserted: metadataNumber(qdmBridge, 'eventsUpserted'),
    qdmLastReplayedAt: metadataString(qdmReplay, 'replayedAt'),
  };
}

function ingestRunQdmStatus(input: {
  run: EhrIngestRunCore;
  qdmBridge: JsonObject | null;
  qdmResourcesFailed: number | null;
  qdmResourcesNormalized: number | null;
  qdmLastReplayedAt: string | null;
}): EhrIngestRunQdmReplayStatus {
  if (input.run.resourcesStaged === 0) return 'not_ready';
  if ((input.qdmResourcesFailed ?? 0) > 0) return 'failed';
  if (input.qdmBridge || input.qdmLastReplayedAt || input.qdmResourcesNormalized !== null) return 'replayed';
  return 'ready';
}

function ingestRunRecommendedAction(input: {
  run: EhrIngestRunCore;
  qdmReplayStatus: EhrIngestRunQdmReplayStatus;
  canReplayQdm: boolean;
  edwHydration: JsonObject | null;
}): string {
  const edwResourcesFailed = metadataNumber(input.edwHydration, 'resourcesFailed') ?? 0;
  if (input.run.status === 'running') {
    return 'Monitor ingest progress before replaying downstream normalization.';
  }
  if (input.run.status === 'failed') {
    return input.canReplayQdm
      ? 'Review ingest errors, then replay QDM normalization if staged resources are trustworthy.'
      : 'Review ingest errors and rerun the source workflow after fixing the upstream issue.';
  }
  if (input.qdmReplayStatus === 'failed') {
    return 'Review QDM replay errors, then rerun QDM normalization for the ingest run.';
  }
  if (edwResourcesFailed > 0) {
    return 'Review EDW hydration errors before relying on downstream patient detail.';
  }
  if (input.canReplayQdm && input.qdmReplayStatus === 'ready') {
    return 'Replay QDM normalization for staged resources.';
  }
  if (input.run.resourcesReceived > 0 && input.run.resourcesStaged === 0) {
    return 'Review staging filters or upstream payload eligibility before retrying.';
  }
  if (input.run.resourcesStaged > 0 && input.qdmReplayStatus === 'replayed') {
    return 'Ingest, staging, and QDM replay have completed; review downstream evidence if needed.';
  }
  return 'No operator action is currently required.';
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function durationMs(startedAt: string, finishedAt: string | null): number | null {
  if (!finishedAt) return null;
  const started = Date.parse(startedAt);
  const finished = Date.parse(finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return null;
  return finished - started;
}

function metadataRecord(value: unknown, key: string): JsonObject | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function metadataNumber(value: unknown, key: string): number | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
  if (typeof nested === 'string' && /^\d+$/.test(nested)) return Number(nested);
  return null;
}

function metadataString(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return typeof nested === 'string' && nested.trim().length > 0 ? nested : null;
}

function metadataStringArray(value: unknown, key: string): string[] {
  if (!isRecord(value)) return [];
  const nested = value[key];
  if (!Array.isArray(nested)) return [];
  return nested.flatMap((item) => (typeof item === 'string' && item.trim().length > 0 ? [item] : []));
}

function metadataRecordArrayLength(value: unknown, key: string): number | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return Array.isArray(nested) ? nested.filter(isRecord).length : null;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function startIngestRun(input: StartEhrIngestRunInput): Promise<EhrIngestRun> {
  const resourceType = nonEmptyResourceType(input.resourceType);
  const requestedSince = timestampInput(input.requestedSince);

  const rows = await sql<EhrIngestRunRow[]>`
    INSERT INTO phm_edw.ehr_ingest_run
      (org_id, ehr_tenant_id, resource_type, mode, requested_since, metadata)
    VALUES (
      ${input.orgId},
      ${input.ehrTenantId},
      ${resourceType},
      ${input.mode ?? 'incremental'},
      ${requestedSince}::timestamptz,
      ${sql.json(asSqlJson(input.metadata ?? {}))}
    )
    RETURNING id::text AS id,
              org_id,
              ehr_tenant_id,
              resource_type,
              mode,
              status,
              requested_since::text AS requested_since,
              started_at::text AS started_at,
              finished_at::text AS finished_at,
              resources_received,
              resources_staged,
              resources_updated,
              error_count,
              error_message,
              errors,
              metadata,
              created_at::text AS created_at,
              updated_at::text AS updated_at
  `;
  return requireReturnedRun(rows, 'start');
}

export async function finishIngestRun(input: FinishEhrIngestRunInput): Promise<EhrIngestRun> {
  return finishIngestRunWithQdmBridge(input).then((result) => result.run);
}

export async function finishIngestRunWithQdmBridge(
  input: FinishEhrIngestRunInput,
): Promise<FinishEhrIngestRunResult> {
  const resourcesReceived = countOrNull(input.resourcesReceived);
  const resourcesStaged = countOrNull(input.resourcesStaged);
  const resourcesUpdated = countOrNull(input.resourcesUpdated);
  const errorCount = countOrNull(input.errorCount);
  const qdmBridgeResult = await maybeNormalizeQdm(input);
  const qdmBridgeErrorCount = qdmBridgeResult?.resourcesFailed ?? 0;
  const persistedErrorCount =
    errorCount === null
      ? (qdmBridgeErrorCount > 0 ? qdmBridgeErrorCount : null)
      : errorCount + qdmBridgeErrorCount;
  const metadata = qdmBridgeResult
    ? {
        ...(input.metadata ?? {}),
        qdmBridge: qdmBridgeResult,
      }
    : (input.metadata ?? {});

  const rows = await sql<EhrIngestRunRow[]>`
    UPDATE phm_edw.ehr_ingest_run
    SET status = 'succeeded',
        finished_at = COALESCE(finished_at, NOW()),
        resources_received = COALESCE(${resourcesReceived}::integer, resources_received),
        resources_staged = COALESCE(${resourcesStaged}::integer, resources_staged),
        resources_updated = COALESCE(${resourcesUpdated}::integer, resources_updated),
        error_count = COALESCE(${persistedErrorCount}::integer, error_count),
        error_message = NULL,
        metadata = metadata || ${sql.json(asSqlJson(metadata))},
        updated_at = NOW()
    WHERE id = ${input.id}::uuid
    RETURNING id::text AS id,
              org_id,
              ehr_tenant_id,
              resource_type,
              mode,
              status,
              requested_since::text AS requested_since,
              started_at::text AS started_at,
              finished_at::text AS finished_at,
              resources_received,
              resources_staged,
              resources_updated,
              error_count,
              error_message,
              errors,
              metadata,
              created_at::text AS created_at,
              updated_at::text AS updated_at
  `;
  return {
    run: requireReturnedRun(rows, 'finish'),
    qdmBridge: qdmBridgeResult,
  };
}

export async function failIngestRun(input: FailEhrIngestRunInput): Promise<EhrIngestRun> {
  const resourcesReceived = countOrNull(input.resourcesReceived);
  const resourcesStaged = countOrNull(input.resourcesStaged);
  const resourcesUpdated = countOrNull(input.resourcesUpdated);
  const errorPayload = input.errors ?? [{ message: input.errorMessage }];
  const errorCount = countOrNull(input.errorCount) ?? Math.max(1, errorPayload.length);

  const rows = await sql<EhrIngestRunRow[]>`
    UPDATE phm_edw.ehr_ingest_run
    SET status = 'failed',
        finished_at = COALESCE(finished_at, NOW()),
        resources_received = COALESCE(${resourcesReceived}::integer, resources_received),
        resources_staged = COALESCE(${resourcesStaged}::integer, resources_staged),
        resources_updated = COALESCE(${resourcesUpdated}::integer, resources_updated),
        error_count = ${errorCount},
        error_message = ${input.errorMessage},
        errors = errors || ${sql.json(asSqlJson(errorPayload))},
        metadata = metadata || ${sql.json(asSqlJson(input.metadata ?? {}))},
        updated_at = NOW()
    WHERE id = ${input.id}::uuid
    RETURNING id::text AS id,
              org_id,
              ehr_tenant_id,
              resource_type,
              mode,
              status,
              requested_since::text AS requested_since,
              started_at::text AS started_at,
              finished_at::text AS finished_at,
              resources_received,
              resources_staged,
              resources_updated,
              error_count,
              error_message,
              errors,
              metadata,
              created_at::text AS created_at,
              updated_at::text AS updated_at
  `;
  return requireReturnedRun(rows, 'fail');
}

export async function recordQdmReplayResult(input: RecordEhrIngestRunQdmReplayInput): Promise<EhrIngestRun> {
  const replayedAt = new Date().toISOString();
  const metadata = {
    qdmBridge: input.result,
    qdmReplay: {
      replayedAt,
      limit: input.limit ?? null,
      sourceSystem: input.sourceSystem ?? 'ehr-admin-qdm-replay',
      resourcesSeen: input.result.resourcesSeen,
      resourcesNormalized: input.result.resourcesNormalized,
      resourcesFailed: input.result.resourcesFailed,
      eventsUpserted: input.result.eventsUpserted,
    },
  };

  const rows = await sql<EhrIngestRunRow[]>`
    UPDATE phm_edw.ehr_ingest_run
    SET metadata = metadata || ${sql.json(asSqlJson(metadata))},
        updated_at = NOW()
    WHERE id = ${input.id}::uuid
      AND ehr_tenant_id = ${input.ehrTenantId}
    RETURNING id::text AS id,
              org_id,
              ehr_tenant_id,
              resource_type,
              mode,
              status,
              requested_since::text AS requested_since,
              started_at::text AS started_at,
              finished_at::text AS finished_at,
              resources_received,
              resources_staged,
              resources_updated,
              error_count,
              error_message,
              errors,
              metadata,
              created_at::text AS created_at,
              updated_at::text AS updated_at
  `;
  return requireReturnedRun(rows, 'record QDM replay');
}

export async function listIngestRuns(input: ListEhrIngestRunsInput): Promise<EhrIngestRun[]> {
  const status = input.status ?? null;
  const mode = input.mode ?? null;
  const resourceType = nonEmptyResourceType(input.resourceType);
  const limit = boundedLimit(input.limit);

  const rows = await sql<EhrIngestRunRow[]>`
    SELECT id::text AS id,
           org_id,
           ehr_tenant_id,
           resource_type,
           mode,
           status,
           requested_since::text AS requested_since,
           started_at::text AS started_at,
           finished_at::text AS finished_at,
           resources_received,
           resources_staged,
           resources_updated,
           error_count,
           error_message,
           errors,
           metadata,
           created_at::text AS created_at,
           updated_at::text AS updated_at
    FROM phm_edw.ehr_ingest_run
    WHERE ehr_tenant_id = ${input.ehrTenantId}
      AND (${status}::text IS NULL OR status = ${status})
      AND (${mode}::text IS NULL OR mode = ${mode})
      AND (${resourceType}::text IS NULL OR resource_type = ${resourceType})
    ORDER BY started_at DESC, created_at DESC
    LIMIT ${limit}
  `;

  return rows.map(mapIngestRun);
}

async function maybeNormalizeQdm(
  input: FinishEhrIngestRunInput,
): Promise<NormalizeStagedRunToQdmResult | null> {
  if (input.qdmBridge?.enabled !== true) return null;

  const result = await normalizeStagedRunToQdm({
    ingestRunId: input.id,
    ehrTenantId: input.ehrTenantId,
    orgId: input.orgId,
    limit: input.qdmBridge.limit,
    sourceSystem: input.qdmBridge.sourceSystem,
  });

  if (input.qdmBridge.failOnError === true && result.resourcesFailed > 0) {
    throw new Error(`QDM normalization failed for ${result.resourcesFailed} staged FHIR resource(s)`);
  }

  return result;
}

function boundedLimit(value: number | undefined): number {
  if (value == null) return 25;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('EHR ingest run limit must be a positive integer');
  }
  return Math.min(value, 100);
}
