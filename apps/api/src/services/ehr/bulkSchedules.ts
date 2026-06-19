// =============================================================================
// SMART Bulk Data recurring schedules
// Tenant-scoped scheduler state for recurring Bulk exports.
// =============================================================================

import { sql } from '@medgnosis/db';
import type { BulkExportLevel, JsonObject } from './bulkData.js';

export type BulkScheduleSinceMode = 'none' | 'fixed' | 'last_success';
export const MIN_BULK_SCHEDULE_INTERVAL_MINUTES = 15;
export const MAX_BULK_SCHEDULE_INTERVAL_MINUTES = 525_600;

export class BulkScheduleOwnershipError extends Error {
  constructor() {
    super('Bulk schedule not found for tenant');
    this.name = 'BulkScheduleOwnershipError';
  }
}

export interface EhrBulkSchedule {
  id: string;
  orgId: number | null;
  ehrTenantId: number;
  enabled: boolean;
  exportLevel: BulkExportLevel;
  groupId: string | null;
  patientId: string | null;
  resourceTypes: string[];
  sinceMode: BulkScheduleSinceMode;
  since: string | null;
  typeFilters: string[];
  intervalMinutes: number;
  maxResourcesPerFile: number | null;
  lastEnqueuedAt: string | null;
  lastQueueJobId: string | null;
  lastBulkJobId: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: JsonObject | null;
  nextRunAt: string;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface ListBulkSchedulesInput {
  ehrTenantId: number;
  enabled?: boolean;
}

export interface ListDueBulkSchedulesInput {
  now?: Date;
  limit?: number;
}

export interface UpsertBulkScheduleInput {
  id?: string;
  orgId?: number | null;
  ehrTenantId: number;
  enabled?: boolean;
  exportLevel: BulkExportLevel;
  groupId?: string | null;
  patientId?: string | null;
  resourceTypes: readonly string[];
  sinceMode?: BulkScheduleSinceMode;
  since?: string | Date | null;
  typeFilters?: readonly string[];
  intervalMinutes: number;
  maxResourcesPerFile?: number | null;
  nextRunAt?: string | Date | null;
  metadata?: JsonObject;
}

interface BulkScheduleRow {
  id: string;
  org_id: number | string | null;
  ehr_tenant_id: number | string;
  enabled: boolean;
  export_level: BulkExportLevel;
  group_id: string | null;
  patient_id: string | null;
  resource_types: string[];
  since_mode: BulkScheduleSinceMode;
  since: string | null;
  type_filters: unknown;
  interval_minutes: number | string;
  max_resources_per_file: number | string | null;
  last_enqueued_at: string | null;
  last_queue_job_id: string | null;
  last_bulk_job_id: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: JsonObject | null;
  next_run_at: string;
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

function mapSchedule(row: BulkScheduleRow): EhrBulkSchedule {
  return {
    id: row.id,
    orgId: mapNullableDbNumber(row.org_id),
    ehrTenantId: mapDbNumber(row.ehr_tenant_id),
    enabled: row.enabled,
    exportLevel: row.export_level,
    groupId: row.group_id,
    patientId: row.patient_id,
    resourceTypes: Array.isArray(row.resource_types) ? row.resource_types : [],
    sinceMode: row.since_mode,
    since: row.since,
    typeFilters: stringArray(row.type_filters),
    intervalMinutes: mapDbNumber(row.interval_minutes),
    maxResourcesPerFile: mapNullableDbNumber(row.max_resources_per_file),
    lastEnqueuedAt: row.last_enqueued_at,
    lastQueueJobId: row.last_queue_job_id,
    lastBulkJobId: row.last_bulk_job_id,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    lastError: row.last_error,
    nextRunAt: row.next_run_at,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeStringList(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function timestampInput(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const trimmed = value.trim();
  return trimmed ? new Date(trimmed).toISOString() : null;
}

function scheduleReturnColumns(): string {
  return `id::text AS id,
          org_id,
          ehr_tenant_id,
          enabled,
          export_level,
          group_id,
          patient_id,
          resource_types,
          since_mode,
          since::text AS since,
          type_filters,
          interval_minutes,
          max_resources_per_file,
          last_enqueued_at::text AS last_enqueued_at,
          last_queue_job_id,
          last_bulk_job_id::text AS last_bulk_job_id,
          last_success_at::text AS last_success_at,
          last_failure_at::text AS last_failure_at,
          last_error,
          next_run_at::text AS next_run_at,
          metadata,
          created_at::text AS created_at,
          updated_at::text AS updated_at`;
}

export async function listBulkSchedules(input: ListBulkSchedulesInput): Promise<EhrBulkSchedule[]> {
  const rows = await sql<BulkScheduleRow[]>`
    SELECT ${sql.unsafe(scheduleReturnColumns())}
    FROM phm_edw.ehr_bulk_schedule
    WHERE ehr_tenant_id = ${input.ehrTenantId}
      AND (${input.enabled ?? null}::boolean IS NULL OR enabled = ${input.enabled ?? null})
    ORDER BY enabled DESC, next_run_at ASC, created_at DESC
  `;
  return rows.map(mapSchedule);
}

export async function listDueBulkSchedules(input: ListDueBulkSchedulesInput = {}): Promise<EhrBulkSchedule[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 500));
  const now = input.now ?? new Date();
  const rows = await sql<BulkScheduleRow[]>`
    SELECT ${sql.unsafe(scheduleReturnColumns())}
    FROM phm_edw.ehr_bulk_schedule
    WHERE enabled = TRUE
      AND next_run_at <= ${now.toISOString()}::timestamptz
    ORDER BY next_run_at ASC, created_at ASC
    LIMIT ${limit}
  `;
  return rows.map(mapSchedule);
}

export async function upsertBulkSchedule(input: UpsertBulkScheduleInput): Promise<EhrBulkSchedule> {
  const resourceTypes = normalizeStringList(input.resourceTypes);
  const typeFilters = normalizeStringList(input.typeFilters ?? []);
  const sinceMode = input.sinceMode ?? 'last_success';
  const since = timestampInput(input.since);
  const nextRunAt = timestampInput(input.nextRunAt);
  const metadata = input.metadata ?? {};

  if (resourceTypes.length === 0) {
    throw new Error('Bulk schedule requires at least one resource type');
  }
  if (sinceMode === 'fixed' && since === null) {
    throw new Error('Bulk schedule fixed sinceMode requires since');
  }
  if (
    input.intervalMinutes < MIN_BULK_SCHEDULE_INTERVAL_MINUTES ||
    input.intervalMinutes > MAX_BULK_SCHEDULE_INTERVAL_MINUTES
  ) {
    throw new Error(
      `Bulk schedule intervalMinutes must be between ${MIN_BULK_SCHEDULE_INTERVAL_MINUTES} and ` +
        `${MAX_BULK_SCHEDULE_INTERVAL_MINUTES}`,
    );
  }

  const rows = await sql<BulkScheduleRow[]>`
    INSERT INTO phm_edw.ehr_bulk_schedule
      (id, org_id, ehr_tenant_id, enabled, export_level, group_id, patient_id,
       resource_types, since_mode, since, type_filters, interval_minutes,
       max_resources_per_file, next_run_at, metadata)
    VALUES (
      COALESCE(${input.id ?? null}::uuid, gen_random_uuid()),
      ${input.orgId ?? null},
      ${input.ehrTenantId},
      ${input.enabled ?? true},
      ${input.exportLevel},
      ${input.groupId ?? null},
      ${input.patientId ?? null},
      ${resourceTypes},
      ${sinceMode},
      ${since}::timestamptz,
      ${sql.json(asSqlJson(typeFilters))},
      ${input.intervalMinutes},
      ${input.maxResourcesPerFile ?? null},
      COALESCE(${nextRunAt}::timestamptz, NOW()),
      ${sql.json(asSqlJson(metadata))}
    )
    ON CONFLICT (id)
    DO UPDATE SET
      org_id = EXCLUDED.org_id,
      enabled = EXCLUDED.enabled,
      export_level = EXCLUDED.export_level,
      group_id = EXCLUDED.group_id,
      patient_id = EXCLUDED.patient_id,
      resource_types = EXCLUDED.resource_types,
      since_mode = EXCLUDED.since_mode,
      since = EXCLUDED.since,
      type_filters = EXCLUDED.type_filters,
      interval_minutes = EXCLUDED.interval_minutes,
      max_resources_per_file = EXCLUDED.max_resources_per_file,
      next_run_at = EXCLUDED.next_run_at,
      last_enqueued_at = CASE WHEN ${sql.unsafe(scheduleDefinitionChangedSql())} THEN NULL ELSE phm_edw.ehr_bulk_schedule.last_enqueued_at END,
      last_queue_job_id = CASE WHEN ${sql.unsafe(scheduleDefinitionChangedSql())} THEN NULL ELSE phm_edw.ehr_bulk_schedule.last_queue_job_id END,
      last_bulk_job_id = CASE WHEN ${sql.unsafe(scheduleDefinitionChangedSql())} THEN NULL ELSE phm_edw.ehr_bulk_schedule.last_bulk_job_id END,
      last_success_at = CASE WHEN ${sql.unsafe(scheduleDefinitionChangedSql())} THEN NULL ELSE phm_edw.ehr_bulk_schedule.last_success_at END,
      last_failure_at = CASE WHEN ${sql.unsafe(scheduleDefinitionChangedSql())} THEN NULL ELSE phm_edw.ehr_bulk_schedule.last_failure_at END,
      last_error = CASE WHEN ${sql.unsafe(scheduleDefinitionChangedSql())} THEN NULL ELSE phm_edw.ehr_bulk_schedule.last_error END,
      metadata = phm_edw.ehr_bulk_schedule.metadata || EXCLUDED.metadata,
      updated_at = NOW()
    WHERE phm_edw.ehr_bulk_schedule.ehr_tenant_id = EXCLUDED.ehr_tenant_id
    RETURNING ${sql.unsafe(scheduleReturnColumns())}
  `;
  if (!rows[0]) throw new BulkScheduleOwnershipError();
  return mapSchedule(rows[0]);
}

export async function markBulkScheduleEnqueued(
  id: string,
  queueJobId: string | null,
): Promise<EhrBulkSchedule | null> {
  const rows = await sql<BulkScheduleRow[]>`
    UPDATE phm_edw.ehr_bulk_schedule
    SET last_enqueued_at = NOW(),
        last_queue_job_id = ${queueJobId},
        next_run_at = NOW() + (interval_minutes * INTERVAL '1 minute'),
        updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING ${sql.unsafe(scheduleReturnColumns())}
  `;
  return rows[0] ? mapSchedule(rows[0]) : null;
}

export async function markBulkScheduleBulkJob(
  id: string,
  bulkJobId: string,
): Promise<EhrBulkSchedule | null> {
  const rows = await sql<BulkScheduleRow[]>`
    UPDATE phm_edw.ehr_bulk_schedule
    SET last_bulk_job_id = ${bulkJobId}::uuid,
        updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING ${sql.unsafe(scheduleReturnColumns())}
  `;
  return rows[0] ? mapSchedule(rows[0]) : null;
}

export async function markBulkScheduleSuccess(
  id: string,
  bulkJobId: string,
  sourceWatermark?: string | Date | null,
): Promise<EhrBulkSchedule | null> {
  const successAt = timestampInput(sourceWatermark);
  const rows = await sql<BulkScheduleRow[]>`
    UPDATE phm_edw.ehr_bulk_schedule
    SET last_bulk_job_id = ${bulkJobId}::uuid,
        last_success_at = COALESCE(${successAt}::timestamptz, NOW()),
        last_error = NULL,
        updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING ${sql.unsafe(scheduleReturnColumns())}
  `;
  return rows[0] ? mapSchedule(rows[0]) : null;
}

function scheduleDefinitionChangedSql(): string {
  return `(phm_edw.ehr_bulk_schedule.export_level IS DISTINCT FROM EXCLUDED.export_level
          OR phm_edw.ehr_bulk_schedule.group_id IS DISTINCT FROM EXCLUDED.group_id
          OR phm_edw.ehr_bulk_schedule.patient_id IS DISTINCT FROM EXCLUDED.patient_id
          OR phm_edw.ehr_bulk_schedule.resource_types IS DISTINCT FROM EXCLUDED.resource_types
          OR phm_edw.ehr_bulk_schedule.since_mode IS DISTINCT FROM EXCLUDED.since_mode
          OR phm_edw.ehr_bulk_schedule.since IS DISTINCT FROM EXCLUDED.since
          OR phm_edw.ehr_bulk_schedule.type_filters IS DISTINCT FROM EXCLUDED.type_filters
          OR phm_edw.ehr_bulk_schedule.max_resources_per_file IS DISTINCT FROM EXCLUDED.max_resources_per_file)`;
}

export async function markBulkScheduleFailure(
  id: string,
  message: string,
): Promise<EhrBulkSchedule | null> {
  const rows = await sql<BulkScheduleRow[]>`
    UPDATE phm_edw.ehr_bulk_schedule
    SET last_failure_at = NOW(),
        last_error = ${sql.json(asSqlJson({ message }))},
        updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING ${sql.unsafe(scheduleReturnColumns())}
  `;
  return rows[0] ? mapSchedule(rows[0]) : null;
}
