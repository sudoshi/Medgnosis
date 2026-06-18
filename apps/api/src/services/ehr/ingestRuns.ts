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
export type JsonObject = Record<string, unknown>;

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
  createdAt: string;
  updatedAt: string;
}

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
  return {
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
        error_count = COALESCE(${errorCount}::integer, error_count),
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
