// =============================================================================
// Medgnosis API - QDM bridge operational ledger
// PHI-safe run and issue tracking for FHIR/QDM/CQL bridge operations.
// =============================================================================

import { sql } from '@medgnosis/db';

export type QdmBridgeOperation =
  | 'normalization'
  | 'cql_shadow_refresh'
  | 'star_refresh'
  | 'reconciliation'
  | 'semantic_drift_dossier'
  | 'promotion_validation'
  | 'manual_review';

export type QdmBridgeRunStatus = 'running' | 'completed' | 'failed' | 'canceled';
export type QdmBridgeTriggerSource = 'manual' | 'scheduled' | 'script' | 'admin' | 'test';
export type QdmBridgeIssueSeverity = 'info' | 'warning' | 'error' | 'critical';
export type QdmBridgeIssueStatus = 'open' | 'acknowledged' | 'resolved' | 'suppressed';

export interface QdmBridgeRun {
  id: string;
  operation: QdmBridgeOperation;
  measureCode: string | null;
  period: { start: string | null; end: string | null };
  status: QdmBridgeRunStatus;
  triggerSource: QdmBridgeTriggerSource;
  startedBy: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  qdmEventsLoaded: number | null;
  patientsSelected: number | null;
  evidenceRowsPersisted: number | null;
  measureReportId: number | null;
  reconciliationRunId: number | null;
  semanticDriftDossierId: number | null;
  result: Record<string, unknown>;
  error: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export interface QdmBridgeIssue {
  id: string;
  runId: string | null;
  issueType: string;
  severity: QdmBridgeIssueSeverity;
  status: QdmBridgeIssueStatus;
  measureCode: string | null;
  patientId: number | null;
  patientRef: string | null;
  qdmEventId: number | null;
  sourceTable: string | null;
  sourceId: number | null;
  message: string;
  details: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface QdmBridgeOperationalStatus {
  operation: QdmBridgeOperation;
  measureCode: string | null;
  latestRunId: string;
  latestStatus: QdmBridgeRunStatus;
  latestStartedAt: string;
  latestCompletedAt: string | null;
  openIssueCount: number;
  openBlockingIssueCount: number;
  latestResult: Record<string, unknown>;
  latestError: Record<string, unknown> | null;
}

export interface StartQdmBridgeRunInput {
  operation: QdmBridgeOperation;
  measureCode?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  triggerSource?: QdmBridgeTriggerSource;
  startedBy?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CompleteQdmBridgeRunInput {
  id: string;
  status?: Extract<QdmBridgeRunStatus, 'completed' | 'canceled'>;
  qdmEventsLoaded?: number | null;
  patientsSelected?: number | null;
  evidenceRowsPersisted?: number | null;
  measureReportId?: number | null;
  reconciliationRunId?: number | null;
  semanticDriftDossierId?: number | null;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface FailQdmBridgeRunInput {
  id: string;
  error: unknown;
  metadata?: Record<string, unknown>;
}

export interface RecordQdmBridgeIssueInput {
  runId?: string | null;
  issueType: string;
  severity?: QdmBridgeIssueSeverity;
  status?: QdmBridgeIssueStatus;
  measureCode?: string | null;
  patientId?: number | null;
  patientRef?: string | null;
  qdmEventId?: number | null;
  sourceTable?: string | null;
  sourceId?: number | null;
  message: string;
  details?: Record<string, unknown>;
}

export interface ListQdmBridgeRunsInput {
  measureCode?: string | null;
  operation?: QdmBridgeOperation | null;
  status?: QdmBridgeRunStatus | null;
  limit?: number;
  offset?: number;
}

export interface ListQdmBridgeIssuesInput {
  measureCode?: string | null;
  runId?: string | null;
  severity?: QdmBridgeIssueSeverity | null;
  status?: QdmBridgeIssueStatus | null;
  limit?: number;
  offset?: number;
}

interface RunRow {
  id: string;
  operation: QdmBridgeOperation;
  measure_code: string | null;
  period_start: string | null;
  period_end: string | null;
  status: QdmBridgeRunStatus;
  trigger_source: QdmBridgeTriggerSource;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | string | null;
  qdm_events_loaded: number | string | null;
  patients_selected: number | string | null;
  evidence_rows_persisted: number | string | null;
  measure_report_id: number | string | null;
  reconciliation_run_id: number | string | null;
  semantic_drift_dossier_id: number | string | null;
  result: Record<string, unknown> | string | null;
  error: Record<string, unknown> | string | null;
  metadata: Record<string, unknown> | string | null;
}

interface IssueRow {
  id: string;
  run_id: string | null;
  issue_type: string;
  severity: QdmBridgeIssueSeverity;
  status: QdmBridgeIssueStatus;
  measure_code: string | null;
  patient_id: number | string | null;
  patient_ref: string | null;
  qdm_event_id: number | string | null;
  source_table: string | null;
  source_id: number | string | null;
  message: string;
  details: Record<string, unknown> | string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

interface StatusRow {
  operation: QdmBridgeOperation;
  measure_code: string | null;
  latest_run_id: string;
  latest_status: QdmBridgeRunStatus;
  latest_started_at: string;
  latest_completed_at: string | null;
  open_issue_count: number | string;
  open_blocking_issue_count: number | string;
  latest_result: Record<string, unknown> | string | null;
  latest_error: Record<string, unknown> | string | null;
}

const OPERATIONS: QdmBridgeOperation[] = [
  'normalization',
  'cql_shadow_refresh',
  'star_refresh',
  'reconciliation',
  'semantic_drift_dossier',
  'promotion_validation',
  'manual_review',
];
const RUN_STATUSES: QdmBridgeRunStatus[] = ['running', 'completed', 'failed', 'canceled'];
const TRIGGERS: QdmBridgeTriggerSource[] = ['manual', 'scheduled', 'script', 'admin', 'test'];
const SEVERITIES: QdmBridgeIssueSeverity[] = ['info', 'warning', 'error', 'critical'];
const ISSUE_STATUSES: QdmBridgeIssueStatus[] = ['open', 'acknowledged', 'resolved', 'suppressed'];
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;

export async function startQdmBridgeRun(input: StartQdmBridgeRunInput): Promise<QdmBridgeRun> {
  const operation = enumValue(input.operation, OPERATIONS, 'operation');
  const measureCode = optionalText(input.measureCode, 'measureCode', 120);
  const triggerSource = enumValue(input.triggerSource ?? 'manual', TRIGGERS, 'triggerSource');
  const startedBy = optionalUuid(input.startedBy, 'startedBy');
  validatePeriod(input.periodStart ?? null, input.periodEnd ?? null);

  const [row] = await sql<RunRow[]>`
    INSERT INTO phm_edw.qdm_bridge_run (
      operation,
      measure_code,
      period_start,
      period_end,
      trigger_source,
      started_by,
      metadata
    )
    VALUES (
      ${operation},
      ${measureCode},
      ${input.periodStart ?? null},
      ${input.periodEnd ?? null},
      ${triggerSource},
      ${startedBy},
      ${sql.json(jsonParam(input.metadata ?? {}))}
    )
    RETURNING ${runProjection()}
  `;
  return runFromRow(requiredRow(row));
}

export async function completeQdmBridgeRun(input: CompleteQdmBridgeRunInput): Promise<QdmBridgeRun> {
  const id = uuid(input.id, 'id');
  const status = enumValue(input.status ?? 'completed', ['completed', 'canceled'], 'status');
  const [row] = await sql<RunRow[]>`
    UPDATE phm_edw.qdm_bridge_run
    SET
      status = ${status},
      completed_at = NOW(),
      duration_ms = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::int),
      qdm_events_loaded = COALESCE(${nullableNonnegative(input.qdmEventsLoaded, 'qdmEventsLoaded')}::int, qdm_events_loaded),
      patients_selected = COALESCE(${nullableNonnegative(input.patientsSelected, 'patientsSelected')}::int, patients_selected),
      evidence_rows_persisted = COALESCE(${nullableNonnegative(input.evidenceRowsPersisted, 'evidenceRowsPersisted')}::int, evidence_rows_persisted),
      measure_report_id = COALESCE(${nullablePositive(input.measureReportId, 'measureReportId')}::bigint, measure_report_id),
      reconciliation_run_id = COALESCE(${nullablePositive(input.reconciliationRunId, 'reconciliationRunId')}::bigint, reconciliation_run_id),
      semantic_drift_dossier_id = COALESCE(${nullablePositive(input.semanticDriftDossierId, 'semanticDriftDossierId')}::bigint, semantic_drift_dossier_id),
      result = result || ${sql.json(jsonParam(input.result ?? {}))},
      metadata = metadata || ${sql.json(jsonParam(input.metadata ?? {}))}
    WHERE id = ${id}::uuid
    RETURNING ${runProjection()}
  `;
  if (!row) throw new Error(`QDM bridge run ${id} not found`);
  return runFromRow(row);
}

export async function failQdmBridgeRun(input: FailQdmBridgeRunInput): Promise<QdmBridgeRun> {
  const id = uuid(input.id, 'id');
  const [row] = await sql<RunRow[]>`
    UPDATE phm_edw.qdm_bridge_run
    SET
      status = 'failed',
      completed_at = NOW(),
      duration_ms = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::int),
      error = ${sql.json(jsonParam(errorObject(input.error)))},
      metadata = metadata || ${sql.json(jsonParam(input.metadata ?? {}))}
    WHERE id = ${id}::uuid
    RETURNING ${runProjection()}
  `;
  if (!row) throw new Error(`QDM bridge run ${id} not found`);
  return runFromRow(row);
}

export async function recordQdmBridgeIssue(input: RecordQdmBridgeIssueInput): Promise<QdmBridgeIssue> {
  const [row] = await sql<IssueRow[]>`
    INSERT INTO phm_edw.qdm_bridge_issue (
      run_id,
      issue_type,
      severity,
      status,
      measure_code,
      patient_id,
      patient_ref,
      qdm_event_id,
      source_table,
      source_id,
      message,
      details,
      resolved_at
    )
    VALUES (
      ${optionalUuid(input.runId, 'runId')}::uuid,
      ${text(input.issueType, 'issueType', 80)},
      ${enumValue(input.severity ?? 'warning', SEVERITIES, 'severity')},
      ${enumValue(input.status ?? 'open', ISSUE_STATUSES, 'status')},
      ${optionalText(input.measureCode, 'measureCode', 120)},
      ${nullablePositive(input.patientId, 'patientId')}::int,
      ${optionalText(input.patientRef, 'patientRef', 300)},
      ${nullablePositive(input.qdmEventId, 'qdmEventId')}::bigint,
      ${optionalText(input.sourceTable, 'sourceTable', 160)},
      ${nullablePositive(input.sourceId, 'sourceId')}::bigint,
      ${text(input.message, 'message', 2_000)},
      ${sql.json(jsonParam(input.details ?? {}))},
      CASE
        WHEN ${input.status ?? 'open'}::text IN ('resolved', 'suppressed') THEN NOW()
        ELSE NULL
      END
    )
    RETURNING ${issueProjection()}
  `;
  return issueFromRow(requiredRow(row));
}

export async function listQdmBridgeRuns(input: ListQdmBridgeRunsInput = {}): Promise<QdmBridgeRun[]> {
  const measureCode = optionalText(input.measureCode, 'measureCode', 120);
  const operation = input.operation ? enumValue(input.operation, OPERATIONS, 'operation') : null;
  const status = input.status ? enumValue(input.status, RUN_STATUSES, 'status') : null;
  const limit = boundedLimit(input.limit);
  const offset = nonnegative(input.offset ?? 0, 'offset');

  const rows = await sql<RunRow[]>`
    SELECT ${runProjection()}
    FROM phm_edw.qdm_bridge_run
    WHERE (${measureCode}::text IS NULL OR measure_code = ${measureCode})
      AND (${operation}::text IS NULL OR operation = ${operation})
      AND (${status}::text IS NULL OR status = ${status})
    ORDER BY started_at DESC, id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
  return rows.map(runFromRow);
}

export async function listQdmBridgeIssues(input: ListQdmBridgeIssuesInput = {}): Promise<QdmBridgeIssue[]> {
  const measureCode = optionalText(input.measureCode, 'measureCode', 120);
  const runId = optionalUuid(input.runId, 'runId');
  const severity = input.severity ? enumValue(input.severity, SEVERITIES, 'severity') : null;
  const status = input.status ? enumValue(input.status, ISSUE_STATUSES, 'status') : null;
  const limit = boundedLimit(input.limit);
  const offset = nonnegative(input.offset ?? 0, 'offset');

  const rows = await sql<IssueRow[]>`
    SELECT ${issueProjection()}
    FROM phm_edw.qdm_bridge_issue
    WHERE (${measureCode}::text IS NULL OR measure_code = ${measureCode})
      AND (${runId}::uuid IS NULL OR run_id = ${runId}::uuid)
      AND (${severity}::text IS NULL OR severity = ${severity})
      AND (${status}::text IS NULL OR status = ${status})
    ORDER BY
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'error' THEN 2
        WHEN 'warning' THEN 3
        ELSE 4
      END,
      created_at DESC,
      id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
  return rows.map(issueFromRow);
}

export async function getQdmBridgeOperationalStatus(
  measureCodeInput?: string | null,
): Promise<QdmBridgeOperationalStatus[]> {
  const measureCode = optionalText(measureCodeInput, 'measureCode', 120);
  const rows = await sql<StatusRow[]>`
    SELECT
      operation,
      measure_code,
      latest_run_id,
      latest_status,
      latest_started_at::text AS latest_started_at,
      latest_completed_at::text AS latest_completed_at,
      open_issue_count,
      open_blocking_issue_count,
      latest_result,
      latest_error
    FROM phm_edw.v_qdm_bridge_operational_status
    WHERE (${measureCode}::text IS NULL OR measure_code = ${measureCode})
    ORDER BY latest_started_at DESC, operation
  `;
  return rows.map((row) => ({
    operation: row.operation,
    measureCode: row.measure_code ?? null,
    latestRunId: row.latest_run_id,
    latestStatus: row.latest_status,
    latestStartedAt: row.latest_started_at,
    latestCompletedAt: row.latest_completed_at,
    openIssueCount: Number(row.open_issue_count ?? 0),
    openBlockingIssueCount: Number(row.open_blocking_issue_count ?? 0),
    latestResult: jsonObject(row.latest_result),
    latestError: jsonObjectOrNull(row.latest_error),
  }));
}

function runProjection() {
  return sql`
    id,
    operation,
    measure_code,
    period_start::text AS period_start,
    period_end::text AS period_end,
    status,
    trigger_source,
    started_by::text AS started_by,
    started_at::text AS started_at,
    completed_at::text AS completed_at,
    duration_ms,
    qdm_events_loaded,
    patients_selected,
    evidence_rows_persisted,
    measure_report_id,
    reconciliation_run_id,
    semantic_drift_dossier_id,
    result,
    error,
    metadata
  `;
}

function issueProjection() {
  return sql`
    id,
    run_id::text AS run_id,
    issue_type,
    severity,
    status,
    measure_code,
    patient_id,
    patient_ref,
    qdm_event_id,
    source_table,
    source_id,
    message,
    details,
    created_at::text AS created_at,
    resolved_at::text AS resolved_at,
    resolved_by::text AS resolved_by
  `;
}

function runFromRow(row: RunRow): QdmBridgeRun {
  return {
    id: row.id,
    operation: row.operation,
    measureCode: row.measure_code ?? null,
    period: { start: row.period_start ?? null, end: row.period_end ?? null },
    status: row.status,
    triggerSource: row.trigger_source,
    startedBy: row.started_by ?? null,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    durationMs: nullableNumber(row.duration_ms),
    qdmEventsLoaded: nullableNumber(row.qdm_events_loaded),
    patientsSelected: nullableNumber(row.patients_selected),
    evidenceRowsPersisted: nullableNumber(row.evidence_rows_persisted),
    measureReportId: nullableNumber(row.measure_report_id),
    reconciliationRunId: nullableNumber(row.reconciliation_run_id),
    semanticDriftDossierId: nullableNumber(row.semantic_drift_dossier_id),
    result: jsonObject(row.result),
    error: jsonObjectOrNull(row.error),
    metadata: jsonObject(row.metadata),
  };
}

function issueFromRow(row: IssueRow): QdmBridgeIssue {
  return {
    id: row.id,
    runId: row.run_id ?? null,
    issueType: row.issue_type,
    severity: row.severity,
    status: row.status,
    measureCode: row.measure_code ?? null,
    patientId: nullableNumber(row.patient_id),
    patientRef: row.patient_ref ?? null,
    qdmEventId: nullableNumber(row.qdm_event_id),
    sourceTable: row.source_table ?? null,
    sourceId: nullableNumber(row.source_id),
    message: row.message,
    details: jsonObject(row.details),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
    resolvedBy: row.resolved_by ?? null,
  };
}

function requiredRow<T>(row: T | undefined): T {
  if (!row) throw new Error('QDM bridge operation returned no row');
  return row;
}

function enumValue<T extends string>(value: string, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function text(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value == null || value === '') return null;
  return text(value, field, maxLength);
}

function uuid(value: unknown, field: string): string {
  const parsed = optionalUuid(value, field);
  if (!parsed) throw new Error(`${field} must be a UUID`);
  return parsed;
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${field} must be a UUID`);
  }
  return value;
}

function nullablePositive(value: unknown, field: string): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return parsed;
}

function nullableNonnegative(value: unknown, field: string): number | null {
  if (value == null) return null;
  return nonnegative(value, field);
}

function nonnegative(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${field} must be a nonnegative integer`);
  }
  return parsed;
}

function boundedLimit(value: unknown): number {
  if (value == null) return DEFAULT_LIMIT;
  const parsed = nullablePositive(value, 'limit') ?? DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function validatePeriod(start: string | null, end: string | null): void {
  if (start && end && end < start) {
    throw new Error('periodEnd must be on or after periodStart');
  }
}

function nullableNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isRecord(value) ? value : {};
}

function jsonObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  const object = jsonObject(value);
  return Object.keys(object).length > 0 ? object : null;
}

function errorObject(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 6).join('\n'),
    };
  }
  return { message: String(error) };
}

function jsonParam(value: Record<string, unknown>): Parameters<typeof sql.json>[0] {
  return value as Parameters<typeof sql.json>[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
