// =============================================================================
// Medgnosis API — EHR tenant sync status
// Read-only operational rollups across ingest runs, Bulk Data imports, and the
// FHIR-to-local resource crosswalk.
// =============================================================================

import { sql } from '@medgnosis/db';

const STALE_RESOURCE_DAYS = 30;

export type EhrSyncIssueSeverity = 'info' | 'warning' | 'critical';

export interface EhrSyncResourceStatus {
  resourceType: string;
  totalResources: number;
  localTargetResources: number;
  unmappedLocalResources: number;
  patientLinkedResources: number;
  missingPatientResources: number;
  staleResources: number;
  collisionResources: number;
  collisionTargets: number;
  lastSeenAt: string | null;
  lastIngestSucceededAt: string | null;
  lastIngestStartedAt: string | null;
  ingestResourcesReceived: number;
  ingestResourcesStaged: number;
  ingestResourcesUpdated: number;
  lastBulkExportSucceededAt: string | null;
  lastBulkImportSucceededAt: string | null;
  bulkRowsRead: number;
  bulkResourcesStaged: number;
  bulkErrorCount: number;
  bulkFailedFileCount: number;
  bulkActiveFileCount: number;
}

export interface EhrCrosswalkSummary {
  totalResources: number;
  localTargetResources: number;
  unmappedLocalResources: number;
  patientLinkedResources: number;
  missingPatientResources: number;
  staleResources: number;
  collisionResources: number;
  collisionTargets: number;
  patientCrosswalks: number;
  resourceTypes: number;
  lastSeenAt: string | null;
  staleAfterDays: number;
}

export interface EhrBulkScheduleSyncSummary {
  enabledSchedules: number;
  dueSchedules: number;
  nextBulkScheduleAt: string | null;
  lastBulkScheduleSuccessAt: string | null;
  lastBulkScheduleFailureAt: string | null;
}

export interface EhrBulkWorkerSyncSummary {
  lastEventAt: string | null;
  latestAction: string | null;
  lastFailureAt: string | null;
  failures24h: number;
  incompleteImports24h: number;
  activeOverdueJobs: number;
  oldestOverdueJobAt: string | null;
}

export interface EhrSyncIssue {
  severity: EhrSyncIssueSeverity;
  code: string;
  message: string;
  resourceType: string | null;
  count: number | null;
  lastSeenAt: string | null;
}

export interface EhrTenantSyncStatus {
  ehrTenantId: number;
  generatedAt: string;
  crosswalk: EhrCrosswalkSummary;
  resources: EhrSyncResourceStatus[];
  bulkSchedule: EhrBulkScheduleSyncSummary;
  bulkWorker: EhrBulkWorkerSyncSummary;
  lastSuccessfulIngestAt: string | null;
  lastSuccessfulBulkExportAt: string | null;
  lastSuccessfulBulkImportAt: string | null;
  lastSeenAt: string | null;
  issues: EhrSyncIssue[];
}

interface CrosswalkResourceRow {
  resource_type: string;
  total_resources: number | string;
  local_target_resources: number | string;
  unmapped_local_resources: number | string;
  patient_linked_resources: number | string;
  missing_patient_resources: number | string;
  stale_resources: number | string;
  last_seen_at: string | null;
  collision_resources: number | string | null;
  collision_targets: number | string | null;
}

interface IngestResourceRow {
  resource_type: string;
  last_ingest_succeeded_at: string | null;
  last_ingest_started_at: string | null;
  ingest_resources_received: number | string;
  ingest_resources_staged: number | string;
  ingest_resources_updated: number | string;
}

interface BulkResourceRow {
  resource_type: string;
  last_bulk_export_succeeded_at: string | null;
  last_bulk_import_succeeded_at: string | null;
  bulk_rows_read: number | string | null;
  bulk_resources_staged: number | string | null;
  bulk_error_count: number | string | null;
  bulk_failed_file_count: number | string | null;
  bulk_active_file_count: number | string | null;
}

interface BulkScheduleSummaryRow {
  enabled_schedules: number | string | null;
  due_schedules: number | string | null;
  next_bulk_schedule_at: string | null;
  last_bulk_schedule_success_at: string | null;
  last_bulk_schedule_failure_at: string | null;
}

interface BulkWorkerSummaryRow {
  last_event_at: string | null;
  latest_action: string | null;
  last_failure_at: string | null;
  failures_24h: number | string | null;
  incomplete_imports_24h: number | string | null;
  active_overdue_jobs: number | string | null;
  oldest_overdue_job_at: string | null;
}

export async function getTenantSyncStatus(ehrTenantId: number): Promise<EhrTenantSyncStatus> {
  const [crosswalkRows, ingestRows, bulkRows, scheduleRows, workerRows] = await Promise.all([
    listCrosswalkResourceRows(ehrTenantId),
    listLatestSuccessfulIngestRows(ehrTenantId),
    listBulkResourceRows(ehrTenantId),
    getBulkScheduleSummaryRow(ehrTenantId),
    getBulkWorkerSummaryRow(ehrTenantId),
  ]);

  const resources = mergeResourceStatuses(crosswalkRows, ingestRows, bulkRows);
  const crosswalk = summarizeCrosswalk(resources);
  const bulkSchedule = mapBulkScheduleSummary(scheduleRows[0]);
  const bulkWorker = mapBulkWorkerSummary(workerRows[0]);
  const issues = buildSyncIssues(resources, crosswalk, bulkSchedule, bulkWorker);

  return {
    ehrTenantId,
    generatedAt: new Date().toISOString(),
    crosswalk,
    resources,
    bulkSchedule,
    bulkWorker,
    lastSuccessfulIngestAt: maxTimestamp(resources.map((resource) => resource.lastIngestSucceededAt)),
    lastSuccessfulBulkExportAt: maxTimestamp(resources.map((resource) => resource.lastBulkExportSucceededAt)),
    lastSuccessfulBulkImportAt: maxTimestamp(resources.map((resource) => resource.lastBulkImportSucceededAt)),
    lastSeenAt: crosswalk.lastSeenAt,
    issues,
  };
}

function listCrosswalkResourceRows(ehrTenantId: number): Promise<CrosswalkResourceRow[]> {
  return sql<CrosswalkResourceRow[]>`
    WITH local_collisions AS (
      SELECT resource_type,
             local_table,
             local_id,
             COUNT(*)::integer AS row_count
      FROM phm_edw.ehr_resource_crosswalk
      WHERE ehr_tenant_id = ${ehrTenantId}
        AND local_table IS NOT NULL
        AND local_id IS NOT NULL
      GROUP BY resource_type, local_table, local_id
      HAVING COUNT(*) > 1
    ),
    collision_by_resource AS (
      SELECT resource_type,
             SUM(row_count)::integer AS collision_resources,
             COUNT(*)::integer AS collision_targets
      FROM local_collisions
      GROUP BY resource_type
    ),
    crosswalk_by_resource AS (
      SELECT cw.resource_type,
             COUNT(*)::integer AS total_resources,
             COUNT(*) FILTER (WHERE cw.local_table IS NOT NULL AND cw.local_id IS NOT NULL)::integer AS local_target_resources,
             COUNT(*) FILTER (WHERE cw.local_table IS NULL OR cw.local_id IS NULL)::integer AS unmapped_local_resources,
             COUNT(*) FILTER (WHERE cw.patient_id IS NOT NULL)::integer AS patient_linked_resources,
             COUNT(*) FILTER (WHERE cw.resource_type <> 'Patient' AND cw.patient_id IS NULL)::integer AS missing_patient_resources,
             COUNT(*) FILTER (WHERE cw.last_seen_at < NOW() - (${STALE_RESOURCE_DAYS}::integer * interval '1 day'))::integer AS stale_resources,
             MAX(cw.last_seen_at)::text AS last_seen_at
      FROM phm_edw.ehr_resource_crosswalk cw
      WHERE cw.ehr_tenant_id = ${ehrTenantId}
      GROUP BY cw.resource_type
    )
    SELECT c.resource_type,
           c.total_resources,
           c.local_target_resources,
           c.unmapped_local_resources,
           c.patient_linked_resources,
           c.missing_patient_resources,
           c.stale_resources,
           c.last_seen_at,
           COALESCE(r.collision_resources, 0)::integer AS collision_resources,
           COALESCE(r.collision_targets, 0)::integer AS collision_targets
    FROM crosswalk_by_resource c
    LEFT JOIN collision_by_resource r ON r.resource_type = c.resource_type
    ORDER BY c.resource_type
  `;
}

function listLatestSuccessfulIngestRows(ehrTenantId: number): Promise<IngestResourceRow[]> {
  return sql<IngestResourceRow[]>`
    WITH latest_ingest_by_resource AS (
      SELECT COALESCE(resource_type, 'Mixed') AS resource_type,
             finished_at,
             started_at,
             resources_received,
             resources_staged,
             resources_updated,
             ROW_NUMBER() OVER (
               PARTITION BY COALESCE(resource_type, 'Mixed')
               ORDER BY finished_at DESC NULLS LAST, started_at DESC
             ) AS rank
      FROM phm_edw.ehr_ingest_run
      WHERE ehr_tenant_id = ${ehrTenantId}
        AND status = 'succeeded'
    )
    SELECT resource_type,
           finished_at::text AS last_ingest_succeeded_at,
           started_at::text AS last_ingest_started_at,
           resources_received AS ingest_resources_received,
           resources_staged AS ingest_resources_staged,
           resources_updated AS ingest_resources_updated
    FROM latest_ingest_by_resource
    WHERE rank = 1
    ORDER BY resource_type
  `;
}

function listBulkResourceRows(ehrTenantId: number): Promise<BulkResourceRow[]> {
  return sql<BulkResourceRow[]>`
    WITH file_rollup AS (
      SELECT resource_type,
             MAX(completed_at) FILTER (WHERE status = 'completed')::text AS last_bulk_import_succeeded_at,
             COALESCE(SUM(rows_read), 0)::integer AS bulk_rows_read,
             COALESCE(SUM(resources_staged), 0)::integer AS bulk_resources_staged,
             COALESCE(SUM(error_count), 0)::integer AS bulk_error_count,
             COUNT(*) FILTER (WHERE status = 'failed')::integer AS bulk_failed_file_count,
             COUNT(*) FILTER (WHERE status IN ('pending', 'running'))::integer AS bulk_active_file_count
      FROM phm_edw.ehr_bulk_import_file
      WHERE ehr_tenant_id = ${ehrTenantId}
      GROUP BY resource_type
    ),
    bulk_job_resource AS (
      SELECT UNNEST(resource_types) AS resource_type,
             completed_at
      FROM phm_edw.ehr_bulk_job
      WHERE ehr_tenant_id = ${ehrTenantId}
        AND status = 'completed'
    ),
    job_rollup AS (
      SELECT resource_type,
             MAX(completed_at)::text AS last_bulk_export_succeeded_at
      FROM bulk_job_resource
      GROUP BY resource_type
    ),
    bulk_by_resource AS (
      SELECT COALESCE(f.resource_type, j.resource_type) AS resource_type,
             j.last_bulk_export_succeeded_at,
             f.last_bulk_import_succeeded_at,
             f.bulk_rows_read,
             f.bulk_resources_staged,
             f.bulk_error_count,
             f.bulk_failed_file_count,
             f.bulk_active_file_count
      FROM file_rollup f
      FULL OUTER JOIN job_rollup j ON j.resource_type = f.resource_type
    )
    SELECT resource_type,
           last_bulk_export_succeeded_at,
           last_bulk_import_succeeded_at,
           COALESCE(bulk_rows_read, 0)::integer AS bulk_rows_read,
           COALESCE(bulk_resources_staged, 0)::integer AS bulk_resources_staged,
           COALESCE(bulk_error_count, 0)::integer AS bulk_error_count,
           COALESCE(bulk_failed_file_count, 0)::integer AS bulk_failed_file_count,
           COALESCE(bulk_active_file_count, 0)::integer AS bulk_active_file_count
    FROM bulk_by_resource
    WHERE resource_type IS NOT NULL
    ORDER BY resource_type
  `;
}

function getBulkScheduleSummaryRow(ehrTenantId: number): Promise<BulkScheduleSummaryRow[]> {
  return sql<BulkScheduleSummaryRow[]>`
    SELECT COUNT(*) FILTER (WHERE enabled)::integer AS enabled_schedules,
           COUNT(*) FILTER (WHERE enabled AND next_run_at <= NOW())::integer AS due_schedules,
           MIN(next_run_at) FILTER (WHERE enabled)::text AS next_bulk_schedule_at,
           MAX(last_success_at)::text AS last_bulk_schedule_success_at,
           MAX(last_failure_at)::text AS last_bulk_schedule_failure_at
    FROM phm_edw.ehr_bulk_schedule
    WHERE ehr_tenant_id = ${ehrTenantId}
  `;
}

function getBulkWorkerSummaryRow(ehrTenantId: number): Promise<BulkWorkerSummaryRow[]> {
  return sql<BulkWorkerSummaryRow[]>`
    WITH worker_audit AS (
      SELECT action,
             created_at
      FROM audit_log
      WHERE action LIKE 'ehr_bulk_worker_%'
        AND details->>'tenantId' = ${String(ehrTenantId)}
    ),
    latest_worker_event AS (
      SELECT action
      FROM worker_audit
      ORDER BY created_at DESC
      LIMIT 1
    ),
    overdue_jobs AS (
      SELECT COUNT(*)::integer AS active_overdue_jobs,
             MIN(next_poll_at)::text AS oldest_overdue_job_at
      FROM phm_edw.ehr_bulk_job
      WHERE ehr_tenant_id = ${ehrTenantId}
        AND status IN ('accepted', 'in_progress')
        AND next_poll_at IS NOT NULL
        AND next_poll_at < NOW() - interval '5 minutes'
    )
    SELECT MAX(worker_audit.created_at)::text AS last_event_at,
           (SELECT action FROM latest_worker_event) AS latest_action,
           MAX(worker_audit.created_at) FILTER (
             WHERE worker_audit.action IN ('ehr_bulk_worker_failed', 'ehr_bulk_worker_import_incomplete')
           )::text AS last_failure_at,
           COUNT(*) FILTER (
             WHERE worker_audit.action IN ('ehr_bulk_worker_failed', 'ehr_bulk_worker_import_incomplete')
               AND worker_audit.created_at >= NOW() - interval '24 hours'
           )::integer AS failures_24h,
           COUNT(*) FILTER (
             WHERE worker_audit.action = 'ehr_bulk_worker_import_incomplete'
               AND worker_audit.created_at >= NOW() - interval '24 hours'
           )::integer AS incomplete_imports_24h,
           COALESCE(MAX(overdue_jobs.active_overdue_jobs), 0)::integer AS active_overdue_jobs,
           MAX(overdue_jobs.oldest_overdue_job_at) AS oldest_overdue_job_at
    FROM overdue_jobs
    LEFT JOIN worker_audit ON TRUE
  `;
}

function mergeResourceStatuses(
  crosswalkRows: CrosswalkResourceRow[],
  ingestRows: IngestResourceRow[],
  bulkRows: BulkResourceRow[],
): EhrSyncResourceStatus[] {
  const resources = new Map<string, EhrSyncResourceStatus>();
  for (const row of crosswalkRows) {
    const resource = ensureResource(resources, row.resource_type);
    resource.totalResources = toNumber(row.total_resources);
    resource.localTargetResources = toNumber(row.local_target_resources);
    resource.unmappedLocalResources = toNumber(row.unmapped_local_resources);
    resource.patientLinkedResources = toNumber(row.patient_linked_resources);
    resource.missingPatientResources = toNumber(row.missing_patient_resources);
    resource.staleResources = toNumber(row.stale_resources);
    resource.collisionResources = toNumber(row.collision_resources);
    resource.collisionTargets = toNumber(row.collision_targets);
    resource.lastSeenAt = row.last_seen_at;
  }
  for (const row of ingestRows) {
    const resource = ensureResource(resources, row.resource_type);
    resource.lastIngestSucceededAt = row.last_ingest_succeeded_at;
    resource.lastIngestStartedAt = row.last_ingest_started_at;
    resource.ingestResourcesReceived = toNumber(row.ingest_resources_received);
    resource.ingestResourcesStaged = toNumber(row.ingest_resources_staged);
    resource.ingestResourcesUpdated = toNumber(row.ingest_resources_updated);
  }
  for (const row of bulkRows) {
    const resource = ensureResource(resources, row.resource_type);
    resource.lastBulkExportSucceededAt = row.last_bulk_export_succeeded_at;
    resource.lastBulkImportSucceededAt = row.last_bulk_import_succeeded_at;
    resource.bulkRowsRead = toNumber(row.bulk_rows_read);
    resource.bulkResourcesStaged = toNumber(row.bulk_resources_staged);
    resource.bulkErrorCount = toNumber(row.bulk_error_count);
    resource.bulkFailedFileCount = toNumber(row.bulk_failed_file_count);
    resource.bulkActiveFileCount = toNumber(row.bulk_active_file_count);
  }

  return Array.from(resources.values()).sort((left, right) => {
    if (left.resourceType === 'Patient') return -1;
    if (right.resourceType === 'Patient') return 1;
    return left.resourceType.localeCompare(right.resourceType);
  });
}

function ensureResource(
  resources: Map<string, EhrSyncResourceStatus>,
  resourceType: string,
): EhrSyncResourceStatus {
  const key = resourceType.trim() || 'Mixed';
  const current = resources.get(key);
  if (current) return current;
  const created: EhrSyncResourceStatus = {
    resourceType: key,
    totalResources: 0,
    localTargetResources: 0,
    unmappedLocalResources: 0,
    patientLinkedResources: 0,
    missingPatientResources: 0,
    staleResources: 0,
    collisionResources: 0,
    collisionTargets: 0,
    lastSeenAt: null,
    lastIngestSucceededAt: null,
    lastIngestStartedAt: null,
    ingestResourcesReceived: 0,
    ingestResourcesStaged: 0,
    ingestResourcesUpdated: 0,
    lastBulkExportSucceededAt: null,
    lastBulkImportSucceededAt: null,
    bulkRowsRead: 0,
    bulkResourcesStaged: 0,
    bulkErrorCount: 0,
    bulkFailedFileCount: 0,
    bulkActiveFileCount: 0,
  };
  resources.set(key, created);
  return created;
}

function summarizeCrosswalk(resources: EhrSyncResourceStatus[]): EhrCrosswalkSummary {
  return {
    totalResources: sum(resources, 'totalResources'),
    localTargetResources: sum(resources, 'localTargetResources'),
    unmappedLocalResources: sum(resources, 'unmappedLocalResources'),
    patientLinkedResources: sum(resources, 'patientLinkedResources'),
    missingPatientResources: sum(resources, 'missingPatientResources'),
    staleResources: sum(resources, 'staleResources'),
    collisionResources: sum(resources, 'collisionResources'),
    collisionTargets: sum(resources, 'collisionTargets'),
    patientCrosswalks: resources
      .filter((resource) => resource.resourceType === 'Patient')
      .reduce((total, resource) => total + resource.localTargetResources, 0),
    resourceTypes: resources.filter((resource) => resource.totalResources > 0).length,
    lastSeenAt: maxTimestamp(resources.map((resource) => resource.lastSeenAt)),
    staleAfterDays: STALE_RESOURCE_DAYS,
  };
}

function mapBulkScheduleSummary(row: BulkScheduleSummaryRow | undefined): EhrBulkScheduleSyncSummary {
  return {
    enabledSchedules: toNumber(row?.enabled_schedules),
    dueSchedules: toNumber(row?.due_schedules),
    nextBulkScheduleAt: row?.next_bulk_schedule_at ?? null,
    lastBulkScheduleSuccessAt: row?.last_bulk_schedule_success_at ?? null,
    lastBulkScheduleFailureAt: row?.last_bulk_schedule_failure_at ?? null,
  };
}

function mapBulkWorkerSummary(row: BulkWorkerSummaryRow | undefined): EhrBulkWorkerSyncSummary {
  return {
    lastEventAt: row?.last_event_at ?? null,
    latestAction: row?.latest_action ?? null,
    lastFailureAt: row?.last_failure_at ?? null,
    failures24h: toNumber(row?.failures_24h),
    incompleteImports24h: toNumber(row?.incomplete_imports_24h),
    activeOverdueJobs: toNumber(row?.active_overdue_jobs),
    oldestOverdueJobAt: row?.oldest_overdue_job_at ?? null,
  };
}

function buildSyncIssues(
  resources: EhrSyncResourceStatus[],
  crosswalk: EhrCrosswalkSummary,
  bulkSchedule: EhrBulkScheduleSyncSummary,
  bulkWorker: EhrBulkWorkerSyncSummary,
): EhrSyncIssue[] {
  const issues: EhrSyncIssue[] = [];

  if (crosswalk.totalResources === 0) {
    issues.push({
      severity: 'info',
      code: 'no_crosswalk_resources',
      message: 'No tenant resources have been recorded in the EHR crosswalk yet.',
      resourceType: null,
      count: 0,
      lastSeenAt: null,
    });
  }

  if (!maxTimestamp(resources.map((resource) => resource.lastIngestSucceededAt))) {
    issues.push({
      severity: 'warning',
      code: 'no_successful_ingest',
      message: 'No successful ingest run has been recorded for this tenant.',
      resourceType: null,
      count: null,
      lastSeenAt: null,
    });
  }

  if (bulkSchedule.lastBulkScheduleFailureAt && (
    !bulkSchedule.lastBulkScheduleSuccessAt ||
    Date.parse(bulkSchedule.lastBulkScheduleFailureAt) > Date.parse(bulkSchedule.lastBulkScheduleSuccessAt)
  )) {
    issues.push({
      severity: 'warning',
      code: 'latest_bulk_schedule_failed',
      message: 'The latest recorded Bulk Data schedule outcome is a failure.',
      resourceType: null,
      count: null,
      lastSeenAt: bulkSchedule.lastBulkScheduleFailureAt,
    });
  }

  if (bulkWorker.failures24h > 0) {
    issues.push({
      severity: 'warning',
      code: 'bulk_worker_failures_24h',
      message: `${bulkWorker.failures24h} automated Bulk Data worker failure event(s) were recorded in the last 24 hours.`,
      resourceType: null,
      count: bulkWorker.failures24h,
      lastSeenAt: bulkWorker.lastFailureAt,
    });
  }

  if (bulkWorker.activeOverdueJobs > 0) {
    issues.push({
      severity: 'warning',
      code: 'bulk_worker_poll_overdue',
      message: `${bulkWorker.activeOverdueJobs} active Bulk Data job(s) are past their next poll time.`,
      resourceType: null,
      count: bulkWorker.activeOverdueJobs,
      lastSeenAt: bulkWorker.oldestOverdueJobAt,
    });
  }

  for (const resource of resources) {
    if (resource.collisionTargets > 0) {
      issues.push({
        severity: 'critical',
        code: 'crosswalk_local_target_collision',
        message: `${resource.collisionTargets} local ${resource.resourceType} target(s) are referenced by multiple source resources.`,
        resourceType: resource.resourceType,
        count: resource.collisionTargets,
        lastSeenAt: resource.lastSeenAt,
      });
    }
    if (resource.unmappedLocalResources > 0) {
      issues.push({
        severity: 'warning',
        code: 'crosswalk_unmapped_local_target',
        message: `${resource.unmappedLocalResources} ${resource.resourceType} source resource(s) are not linked to a normalized local row.`,
        resourceType: resource.resourceType,
        count: resource.unmappedLocalResources,
        lastSeenAt: resource.lastSeenAt,
      });
    }
    if (resource.missingPatientResources > 0) {
      issues.push({
        severity: 'warning',
        code: 'crosswalk_missing_patient',
        message: `${resource.missingPatientResources} ${resource.resourceType} resource(s) are not linked to a local patient.`,
        resourceType: resource.resourceType,
        count: resource.missingPatientResources,
        lastSeenAt: resource.lastSeenAt,
      });
    }
    if (resource.staleResources > 0) {
      issues.push({
        severity: 'warning',
        code: 'crosswalk_stale_resource',
        message: `${resource.staleResources} ${resource.resourceType} resource(s) have not been seen in ${STALE_RESOURCE_DAYS} days.`,
        resourceType: resource.resourceType,
        count: resource.staleResources,
        lastSeenAt: resource.lastSeenAt,
      });
    }
    if (resource.bulkFailedFileCount > 0 || resource.bulkErrorCount > 0) {
      issues.push({
        severity: 'warning',
        code: 'bulk_import_file_errors',
        message: `${resource.resourceType} Bulk Data import files have ${resource.bulkErrorCount} row error(s) and ${resource.bulkFailedFileCount} failed file(s).`,
        resourceType: resource.resourceType,
        count: resource.bulkFailedFileCount + resource.bulkErrorCount,
        lastSeenAt: resource.lastBulkImportSucceededAt,
      });
    }
  }

  return issues.sort((left, right) => issueSeverityRank(right.severity) - issueSeverityRank(left.severity));
}

function issueSeverityRank(severity: EhrSyncIssueSeverity): number {
  if (severity === 'critical') return 3;
  if (severity === 'warning') return 2;
  return 1;
}

function sum(
  resources: EhrSyncResourceStatus[],
  key: keyof Pick<
    EhrSyncResourceStatus,
    | 'totalResources'
    | 'localTargetResources'
    | 'unmappedLocalResources'
    | 'patientLinkedResources'
    | 'missingPatientResources'
    | 'staleResources'
    | 'collisionResources'
    | 'collisionTargets'
  >,
): number {
  return resources.reduce((total, resource) => total + resource[key], 0);
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maxTimestamp(values: Array<string | null>): string | null {
  let latest: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) continue;
    if (parsed > latestTime) {
      latest = value;
      latestTime = parsed;
    }
  }
  return latest;
}
