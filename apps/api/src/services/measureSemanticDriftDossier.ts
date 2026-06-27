// =============================================================================
// Medgnosis API — Measure semantic drift dossier
// Builds an auditable patient-level worklist for SQL-surrogate vs CQL/eCQM
// semantic drift. This is deliberately separate from promotion: it explains why
// a local care-gap baseline must not be treated as standards-equivalent.
// =============================================================================

import { sql } from '@medgnosis/db';

type UnsafeParameter = NonNullable<Parameters<typeof sql.unsafe>[1]>[number];

export interface GenerateMeasureSemanticDriftDossierInput {
  measureCode: string;
  reconciliationRunId?: number;
  measureReportId?: number;
  patientSampleLimit?: number;
  persist?: boolean;
  actorId?: string | null;
}

export interface DriftPopulationCounts {
  denominator: number;
  numerator: number;
  exclusion: number;
}

export interface PatientSemanticDriftRow {
  patientId: number | null;
  patientRef: string | null;
  patientKey: number | null;
  sql: {
    denominator: boolean;
    numerator: boolean;
    exclusion: boolean;
  };
  cql: {
    denominator: boolean;
    numerator: boolean;
    exclusion: boolean;
  };
  localGapStatus: string | null;
  denominatorDrift: string;
  numeratorDrift: string;
  exclusionDrift: string;
  classification: Record<string, unknown>;
  evidenceSummary: Record<string, unknown>;
}

export interface MeasureSemanticDriftDossier {
  dossierId: number | null;
  persisted: boolean;
  measureCode: string;
  sourceMeasureCode: string | null;
  reconciliationRunId: number;
  measureReportId: number;
  period: { start: string; end: string };
  semanticRelationship: string;
  authoritativePolicy: Record<string, unknown>;
  summary: Record<string, unknown>;
  classificationCounts: Record<string, unknown>;
  recommendations: Record<string, unknown>;
  patientsPersisted: number;
  patientRowsReturned: number;
  patientRowsTruncated: boolean;
  patientDriftRows: PatientSemanticDriftRow[];
  generatedAt: string;
}

export interface ListMeasureSemanticDriftWorklistInput {
  measureCode: string;
  dossierId?: number;
  denominatorDrift?: string;
  numeratorDrift?: string;
  exclusionDrift?: string;
  patientId?: number;
  limit?: number;
  offset?: number;
}

export interface MeasureSemanticDriftWorklistRow extends PatientSemanticDriftRow {
  dossierPatientId: number;
  cqlPopulationCounts: Record<string, number>;
  hasSubjectReport: boolean;
  reviewBuckets: {
    localGap: string;
    hba1c: string;
    qdmEvidenceVolume: string;
    denominatorPrerequisites: string;
    cqlSubjectPopulation: string;
  };
  reviewPriority: number;
  reviewHint: string;
  reviewState: DriftReviewState;
  assigneeUserId: string | null;
  reviewUpdatedAt: string | null;
  commentCount: number;
  createdAt: string;
}

export interface MeasureSemanticDriftWorklist {
  measureCode: string;
  dossierId: number;
  sourceMeasureCode: string | null;
  reconciliationRunId: number | null;
  measureReportId: number | null;
  period: { start: string; end: string };
  semanticRelationship: string;
  generatedAt: string;
  filters: {
    denominatorDrift: string | null;
    numeratorDrift: string | null;
    exclusionDrift: string | null;
    patientId: number | null;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
    returned: number;
    hasMore: boolean;
  };
  classificationCounts: Record<string, unknown>;
  rows: MeasureSemanticDriftWorklistRow[];
}

export interface GetMeasureSemanticDriftDetailInput {
  measureCode: string;
  dossierPatientId: number;
}

export interface MeasureSemanticDriftEvidenceDetail {
  id: number;
  measureReportId: number;
  source: string;
  period: { start: string; end: string };
  flags: {
    denominator: boolean;
    numerator: boolean;
    exclusion: boolean;
  };
  measureValue: number | null;
  computedAt: string;
  qdmEvidenceCount: number;
  fhirSubjectReportPresent: boolean;
  qdmEvidence: unknown[];
  fhirSubjectReport: Record<string, unknown> | null;
}

export interface MeasureSemanticDriftDetail {
  measureCode: string;
  dossierId: number;
  dossierPatientId: number;
  sourceMeasureCode: string | null;
  reconciliationRunId: number | null;
  measureReportId: number | null;
  period: { start: string; end: string };
  semanticRelationship: string;
  generatedAt: string;
  worklistRow: MeasureSemanticDriftWorklistRow;
  measureReportEvidence: MeasureSemanticDriftEvidenceDetail | null;
}

export const DRIFT_REVIEW_STATES = [
  'open',
  'in_review',
  'resolved',
  'accepted',
  'dismissed',
] as const;

export type DriftReviewState = (typeof DRIFT_REVIEW_STATES)[number];

export function isDriftReviewState(value: unknown): value is DriftReviewState {
  return typeof value === 'string' && (DRIFT_REVIEW_STATES as readonly string[]).includes(value);
}

export interface DriftReviewRow {
  measureCode: string;
  dossierId: number;
  dossierPatientId: number;
  patientId: number | null;
  patientRef: string | null;
  reviewState: DriftReviewState;
  assigneeUserId: string | null;
  reviewUpdatedAt: string | null;
  reviewUpdatedBy: string | null;
}

export interface DriftComment {
  id: number;
  driftPatientId: number;
  authorUserId: string | null;
  body: string;
  createdAt: string;
}

export interface SetDriftReviewStateInput {
  measureCode: string;
  dossierPatientId: number;
  reviewState: DriftReviewState;
  actorId?: string | null;
}

export interface SetDriftAssigneeInput {
  measureCode: string;
  dossierPatientId: number;
  assigneeUserId: string | null;
  actorId?: string | null;
}

export interface AddDriftCommentInput {
  measureCode: string;
  dossierPatientId: number;
  body: string;
  actorId?: string | null;
}

export interface ListDriftCommentsInput {
  measureCode: string;
  dossierPatientId: number;
  limit?: number;
}

export class MeasureSemanticDriftError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, statusCode = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = 'MeasureSemanticDriftError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

interface ReconciliationRunRow {
  id: number | string;
  measure_code: string;
  period_start: string;
  period_end: string;
  evaluation_scope: string;
  promotion_eligible: boolean;
  status: string;
  agree: boolean;
  sql_denominator: number | string;
  sql_numerator: number | string;
  sql_exclusion: number | string;
  cql_denominator: number | string;
  cql_numerator: number | string;
  cql_exclusion: number | string;
  delta_denominator: number | string;
  delta_numerator: number | string;
  delta_exclusion: number | string;
  cql_measure_report_id: number | string | null;
  computed_at: string;
}

interface MeasureReportRow {
  id: number | string;
  measure_code: string;
  period_start: string;
  period_end: string;
  report_type: string;
  initial_population: number | string | null;
  denominator: number | string | null;
  numerator: number | string | null;
  denominator_exclusion: number | string | null;
  source: string;
  computed_at: string;
}

interface BaselineAliasRow {
  source_measure_code: string;
  mapping_method: string;
  metadata: Record<string, unknown> | string | null;
}

interface PatientSourceRow {
  patient_id: number | string | null;
  patient_ref: string | null;
  patient_key: number | string | null;
  sql_denominator: boolean | null;
  sql_numerator: boolean | null;
  sql_exclusion: boolean | null;
  cql_denominator: boolean | null;
  cql_numerator: boolean | null;
  cql_exclusion: boolean | null;
  local_gap_status: string | null;
  local_gap_closed: boolean | null;
  qdm_evidence_count: number | string | null;
  initial_population_evidence_count: number | string | null;
  denominator_exclusion_evidence_count: number | string | null;
  numerator_evidence_count: number | string | null;
  has_initial_population_evidence: boolean | null;
  has_denominator_exclusion_evidence: boolean | null;
  has_diabetes_evidence: boolean | null;
  has_qualifying_encounter_evidence: boolean | null;
  has_hba1c_evidence: boolean | null;
  has_hba1c_gt9: boolean | null;
  max_hba1c_value: number | string | null;
  latest_hba1c_at: string | null;
  age_at_period_start: number | string | null;
  age_at_period_end: number | string | null;
  age_qualifies_cms122: boolean | null;
  sql_snapshot_date: string | null;
}

interface DossierInsertRow {
  id: number | string;
  generated_at: string;
}

interface InsertCountRow {
  patient_rows_inserted: number | string;
}

interface DossierStateRow {
  id: number | string;
  measure_code: string;
  source_measure_code: string | null;
  reconciliation_run_id: number | string | null;
  measure_report_id: number | string | null;
  period_start: string;
  period_end: string;
  semantic_relationship: string;
  classification_counts: Record<string, unknown> | string | null;
  generated_at: string;
}

interface WorklistCountRow {
  total_rows: number | string;
}

interface WorklistPatientRow {
  id: number | string;
  patient_id: number | string | null;
  patient_ref: string | null;
  patient_key: number | string | null;
  sql_denominator: boolean;
  sql_numerator: boolean;
  sql_exclusion: boolean;
  cql_denominator: boolean;
  cql_numerator: boolean;
  cql_exclusion: boolean;
  denominator_drift: string;
  numerator_drift: string;
  exclusion_drift: string;
  local_gap_status: string | null;
  classification: Record<string, unknown> | string | null;
  evidence_summary: Record<string, unknown> | string | null;
  cql_population_counts: Record<string, unknown> | string | null;
  has_subject_report: boolean | null;
  review_state: string | null;
  assignee_user_id: string | null;
  review_updated_at: string | null;
  comment_count: number | string | null;
  created_at: string;
}

interface DetailPatientRow extends WorklistPatientRow {
  dossier_id: number | string;
  measure_code: string;
  source_measure_code: string | null;
  reconciliation_run_id: number | string | null;
  dossier_measure_report_id: number | string | null;
  period_start: string;
  period_end: string;
  semantic_relationship: string;
  generated_at: string;
  measure_report_evidence_id: number | string | null;
  evidence_measure_report_id: number | string | null;
  evidence_period_start: string | null;
  evidence_period_end: string | null;
  evidence_denominator_flag: boolean | null;
  evidence_numerator_flag: boolean | null;
  evidence_exclusion_flag: boolean | null;
  measure_value: number | string | null;
  evidence_source: string | null;
  evidence_computed_at: string | null;
  raw_qdm_evidence: unknown;
  raw_fhir_subject_report: unknown;
}

interface DriftReviewDbRow {
  id: number | string;
  dossier_id: number | string;
  measure_code: string;
  patient_id: number | string | null;
  patient_ref: string | null;
  review_state: string;
  assignee_user_id: string | null;
  review_updated_at: string | null;
  review_updated_by: string | null;
}

interface DriftCommentDbRow {
  id: number | string;
  drift_patient_id: number | string;
  author_user_id: string | null;
  body: string;
  created_at: string;
}

const DEFAULT_PATIENT_SAMPLE_LIMIT = 100;
const MAX_PATIENT_SAMPLE_LIMIT = 1_000;
const DEFAULT_WORKLIST_LIMIT = 50;
const MAX_WORKLIST_LIMIT = 500;
const DEFAULT_COMMENT_LIMIT = 50;
const MAX_COMMENT_LIMIT = 200;
const MAX_COMMENT_BODY_LENGTH = 4_000;
const SEMANTIC_RELATIONSHIP = 'surrogate_not_equivalent';

export async function generateMeasureSemanticDriftDossier(
  input: GenerateMeasureSemanticDriftDossierInput,
): Promise<MeasureSemanticDriftDossier> {
  const measureCode = normalizeMeasureCode(input.measureCode);
  const reconciliationRunId =
    input.reconciliationRunId === undefined
      ? undefined
      : normalizePositiveInt(input.reconciliationRunId, 'reconciliationRunId');
  const requestedMeasureReportId =
    input.measureReportId === undefined
      ? undefined
      : normalizePositiveInt(input.measureReportId, 'measureReportId');
  const patientSampleLimit = normalizePatientSampleLimit(input.patientSampleLimit);
  const persist = input.persist !== false;

  const run = await selectReconciliationRun(measureCode, reconciliationRunId);
  const runId = Number(run.id);
  const runReportId = nullablePositiveInt(run.cql_measure_report_id);
  if (
    requestedMeasureReportId !== undefined &&
    runReportId !== null &&
    requestedMeasureReportId !== runReportId
  ) {
    throw new MeasureSemanticDriftError(
      'MEASURE_REPORT_RECONCILIATION_MISMATCH',
      'Requested MeasureReport does not match the selected reconciliation run',
      409,
      { reconciliationMeasureReportId: runReportId, requestedMeasureReportId },
    );
  }

  const report = await selectMeasureReport({
    measureCode,
    measureReportId: requestedMeasureReportId ?? runReportId ?? undefined,
    periodStart: run.period_start,
    periodEnd: run.period_end,
  });
  const measureReportId = Number(report.id);
  const alias = await selectBaselineAlias(measureCode);
  const sourceMeasureCode = alias?.source_measure_code ?? null;
  const patientRows = await selectPatientComparisonRows(
    measureCode,
    sourceMeasureCode ?? measureCode,
    measureReportId,
    report.source,
    report.period_start,
    report.period_end,
  );

  const classified = patientRows.map((row) =>
    classifyPatientDrift(row, {
      measureCode,
      sourceMeasureCode,
      aliasMetadata: jsonObject(alias?.metadata),
    }),
  );
  const driftRows = classified.filter(hasAnyDrift);
  const summary = buildSummary(run, report, classified);
  const classificationCounts = buildClassificationCounts(classified);
  const authoritativePolicy = buildAuthoritativePolicy(measureCode, sourceMeasureCode, alias);
  const recommendations = buildRecommendations(measureCode, sourceMeasureCode, summary);

  let dossierId: number | null = null;
  let generatedAt = new Date().toISOString();
  let patientsPersisted = 0;

  if (persist) {
    const persisted = await persistDossier({
      measureCode,
      sourceMeasureCode,
      runId,
      measureReportId,
      periodStart: run.period_start,
      periodEnd: run.period_end,
      authoritativePolicy,
      summary,
      classificationCounts,
      recommendations,
      actorId: input.actorId ?? null,
      driftRows,
    });
    dossierId = persisted.dossierId;
    generatedAt = persisted.generatedAt;
    patientsPersisted = persisted.patientsPersisted;
  }

  const returnedRows = driftRows.slice(0, patientSampleLimit);
  return {
    dossierId,
    persisted: persist,
    measureCode,
    sourceMeasureCode,
    reconciliationRunId: runId,
    measureReportId,
    period: { start: run.period_start, end: run.period_end },
    semanticRelationship: SEMANTIC_RELATIONSHIP,
    authoritativePolicy,
    summary,
    classificationCounts,
    recommendations,
    patientsPersisted,
    patientRowsReturned: returnedRows.length,
    patientRowsTruncated: driftRows.length > returnedRows.length,
    patientDriftRows: returnedRows,
    generatedAt,
  };
}

export async function listMeasureSemanticDriftWorklist(
  input: ListMeasureSemanticDriftWorklistInput,
): Promise<MeasureSemanticDriftWorklist> {
  const measureCode = normalizeMeasureCode(input.measureCode);
  const dossierId =
    input.dossierId === undefined ? undefined : normalizePositiveInt(input.dossierId, 'dossierId');
  const denominatorDrift = normalizeOptionalText(input.denominatorDrift, 'denominatorDrift', 120);
  const numeratorDrift = normalizeOptionalText(input.numeratorDrift, 'numeratorDrift', 120);
  const exclusionDrift = normalizeOptionalText(input.exclusionDrift, 'exclusionDrift', 120);
  const patientId =
    input.patientId === undefined ? undefined : normalizePositiveInt(input.patientId, 'patientId');
  const limit = normalizeWorklistLimit(input.limit);
  const offset = normalizeOffset(input.offset);

  const dossier = await selectDossierState(measureCode, dossierId);
  const [countRow] = await sql<WorklistCountRow[]>`
    SELECT COUNT(*)::int AS total_rows
    FROM phm_edw.measure_semantic_drift_patient p
    WHERE p.dossier_id = ${Number(dossier.id)}
      AND (${denominatorDrift}::text IS NULL OR p.denominator_drift = ${denominatorDrift})
      AND (${numeratorDrift}::text IS NULL OR p.numerator_drift = ${numeratorDrift})
      AND (${exclusionDrift}::text IS NULL OR p.exclusion_drift = ${exclusionDrift})
      AND (${patientId ?? null}::int IS NULL OR p.patient_id = ${patientId ?? null})
  `;
  const total = Number(countRow?.total_rows ?? 0);
  const rows = await sql<WorklistPatientRow[]>`
    SELECT
      p.id,
      p.patient_id,
      p.patient_ref,
      p.patient_key,
      p.sql_denominator,
      p.sql_numerator,
      p.sql_exclusion,
      p.cql_denominator,
      p.cql_numerator,
      p.cql_exclusion,
      p.denominator_drift,
      p.numerator_drift,
      p.exclusion_drift,
      p.local_gap_status,
      p.classification,
      p.evidence_summary,
      COALESCE(subject_pop.cql_population_counts, '{}'::jsonb) AS cql_population_counts,
      (mre.fhir_subject_report IS NOT NULL) AS has_subject_report,
      p.review_state,
      p.assignee_user_id,
      p.review_updated_at::text AS review_updated_at,
      COALESCE(comment_rollup.comment_count, 0) AS comment_count,
      p.created_at::text AS created_at
    FROM phm_edw.measure_semantic_drift_patient p
    JOIN phm_edw.measure_semantic_drift_dossier d
      ON d.id = p.dossier_id
    LEFT JOIN phm_edw.measure_report mr
      ON mr.id = d.measure_report_id
    LEFT JOIN LATERAL (
      SELECT mre.*
      FROM phm_edw.measure_report_evidence mre
      WHERE mre.measure_report_id = d.measure_report_id
        AND mre.measure_code = d.measure_code
        AND (
          (p.patient_id IS NOT NULL AND mre.patient_id = p.patient_id)
          OR (
            p.patient_id IS NULL
            AND p.patient_ref IS NOT NULL
            AND mre.patient_ref = p.patient_ref
          )
        )
      ORDER BY
        CASE
          WHEN NULLIF(mr.source, '') IS NOT NULL AND mre.source = mr.source THEN 0
          WHEN mre.source IN ('qdm-cql', 'qdm-cql-smoke', 'cql') THEN 1
          ELSE 9
        END,
        mre.computed_at DESC,
        mre.id DESC
      LIMIT 1
    ) mre ON TRUE
    LEFT JOIN LATERAL (
      SELECT jsonb_object_agg(pop_code, pop_count) AS cql_population_counts
      FROM (
        SELECT
          COALESCE(
            pop->'code'->'coding'->0->>'code',
            pop->>'id',
            'unknown'
          ) AS pop_code,
          COALESCE(NULLIF(pop->>'count', '')::int, 0) AS pop_count
        FROM jsonb_array_elements(COALESCE(mre.fhir_subject_report->'group', '[]'::jsonb)) grp
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(grp->'population', '[]'::jsonb)) pop
      ) population_counts
    ) subject_pop ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS comment_count
      FROM phm_edw.measure_drift_comment c
      WHERE c.drift_patient_id = p.id
    ) comment_rollup ON TRUE
    WHERE p.dossier_id = ${Number(dossier.id)}
      AND (${denominatorDrift}::text IS NULL OR p.denominator_drift = ${denominatorDrift})
      AND (${numeratorDrift}::text IS NULL OR p.numerator_drift = ${numeratorDrift})
      AND (${exclusionDrift}::text IS NULL OR p.exclusion_drift = ${exclusionDrift})
      AND (${patientId ?? null}::int IS NULL OR p.patient_id = ${patientId ?? null})
    ORDER BY
      CASE p.denominator_drift
        WHEN 'residual_cql_or_qicore_semantic_gap' THEN 1
        WHEN 'denominator_exclusion_evidence_present_but_not_cql_flagged' THEN 2
        WHEN 'missing_cql_diabetes_value_set_evidence' THEN 3
        WHEN 'missing_cql_qualifying_encounter_or_initial_population' THEN 4
        WHEN 'outside_cms122_age_range' THEN 5
        ELSE 9
      END,
      p.sql_numerator DESC,
      p.patient_id NULLS LAST,
      p.patient_ref
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const mappedRows = rows.map(worklistRowFromDb);
  return {
    measureCode,
    dossierId: Number(dossier.id),
    sourceMeasureCode: dossier.source_measure_code ?? null,
    reconciliationRunId: nullablePositiveInt(dossier.reconciliation_run_id),
    measureReportId: nullablePositiveInt(dossier.measure_report_id),
    period: { start: dossier.period_start, end: dossier.period_end },
    semanticRelationship: dossier.semantic_relationship,
    generatedAt: dossier.generated_at,
    filters: {
      denominatorDrift,
      numeratorDrift,
      exclusionDrift,
      patientId: patientId ?? null,
    },
    pagination: {
      limit,
      offset,
      total,
      returned: mappedRows.length,
      hasMore: offset + mappedRows.length < total,
    },
    classificationCounts: jsonObject(dossier.classification_counts),
    rows: mappedRows,
  };
}

export async function getMeasureSemanticDriftDetail(
  input: GetMeasureSemanticDriftDetailInput,
): Promise<MeasureSemanticDriftDetail> {
  const measureCode = normalizeMeasureCode(input.measureCode);
  const dossierPatientId = normalizePositiveInt(input.dossierPatientId, 'dossierPatientId');

  const [row] = await sql<DetailPatientRow[]>`
    SELECT
      d.id AS dossier_id,
      d.measure_code,
      d.source_measure_code,
      d.reconciliation_run_id,
      d.measure_report_id AS dossier_measure_report_id,
      d.period_start::text AS period_start,
      d.period_end::text AS period_end,
      d.semantic_relationship,
      d.generated_at::text AS generated_at,
      p.id,
      p.patient_id,
      p.patient_ref,
      p.patient_key,
      p.sql_denominator,
      p.sql_numerator,
      p.sql_exclusion,
      p.cql_denominator,
      p.cql_numerator,
      p.cql_exclusion,
      p.denominator_drift,
      p.numerator_drift,
      p.exclusion_drift,
      p.local_gap_status,
      p.classification,
      p.evidence_summary,
      COALESCE(subject_pop.cql_population_counts, '{}'::jsonb) AS cql_population_counts,
      (mre.fhir_subject_report IS NOT NULL) AS has_subject_report,
      p.review_state,
      p.assignee_user_id,
      p.review_updated_at::text AS review_updated_at,
      COALESCE(comment_rollup.comment_count, 0) AS comment_count,
      p.created_at::text AS created_at,
      mre.id AS measure_report_evidence_id,
      mre.measure_report_id AS evidence_measure_report_id,
      mre.period_start::text AS evidence_period_start,
      mre.period_end::text AS evidence_period_end,
      mre.denominator_flag AS evidence_denominator_flag,
      mre.numerator_flag AS evidence_numerator_flag,
      mre.exclusion_flag AS evidence_exclusion_flag,
      mre.measure_value,
      mre.source AS evidence_source,
      mre.computed_at::text AS evidence_computed_at,
      mre.qdm_evidence AS raw_qdm_evidence,
      mre.fhir_subject_report AS raw_fhir_subject_report
    FROM phm_edw.measure_semantic_drift_patient p
    JOIN phm_edw.measure_semantic_drift_dossier d
      ON d.id = p.dossier_id
    LEFT JOIN phm_edw.measure_report mr
      ON mr.id = d.measure_report_id
    LEFT JOIN LATERAL (
      SELECT mre.*
      FROM phm_edw.measure_report_evidence mre
      WHERE mre.measure_report_id = d.measure_report_id
        AND mre.measure_code = d.measure_code
        AND (
          (p.patient_id IS NOT NULL AND mre.patient_id = p.patient_id)
          OR (
            p.patient_id IS NULL
            AND p.patient_ref IS NOT NULL
            AND mre.patient_ref = p.patient_ref
          )
        )
      ORDER BY
        CASE
          WHEN NULLIF(mr.source, '') IS NOT NULL AND mre.source = mr.source THEN 0
          WHEN mre.source IN ('qdm-cql', 'qdm-cql-smoke', 'cql') THEN 1
          ELSE 9
        END,
        mre.computed_at DESC,
        mre.id DESC
      LIMIT 1
    ) mre ON TRUE
    LEFT JOIN LATERAL (
      SELECT jsonb_object_agg(pop_code, pop_count) AS cql_population_counts
      FROM (
        SELECT
          COALESCE(
            pop->'code'->'coding'->0->>'code',
            pop->>'id',
            'unknown'
          ) AS pop_code,
          COALESCE(NULLIF(pop->>'count', '')::int, 0) AS pop_count
        FROM jsonb_array_elements(COALESCE(mre.fhir_subject_report->'group', '[]'::jsonb)) grp
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(grp->'population', '[]'::jsonb)) pop
      ) population_counts
    ) subject_pop ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS comment_count
      FROM phm_edw.measure_drift_comment c
      WHERE c.drift_patient_id = p.id
    ) comment_rollup ON TRUE
    WHERE d.measure_code = ${measureCode}
      AND p.id = ${dossierPatientId}
    LIMIT 1
  `;

  if (!row) {
    throw new MeasureSemanticDriftError(
      'SEMANTIC_DRIFT_PATIENT_NOT_FOUND',
      `No semantic drift patient row ${dossierPatientId} exists for ${measureCode}`,
      404,
    );
  }

  const qdmEvidence = jsonArray(row.raw_qdm_evidence);
  const fhirSubjectReport = jsonObjectOrNull(row.raw_fhir_subject_report);
  return {
    measureCode: row.measure_code,
    dossierId: Number(row.dossier_id),
    dossierPatientId: Number(row.id),
    sourceMeasureCode: row.source_measure_code ?? null,
    reconciliationRunId: nullablePositiveInt(row.reconciliation_run_id),
    measureReportId: nullablePositiveInt(row.dossier_measure_report_id),
    period: { start: row.period_start, end: row.period_end },
    semanticRelationship: row.semantic_relationship,
    generatedAt: row.generated_at,
    worklistRow: worklistRowFromDb(row),
    measureReportEvidence:
      row.measure_report_evidence_id == null
        ? null
        : {
            id: Number(row.measure_report_evidence_id),
            measureReportId: Number(row.evidence_measure_report_id),
            source: row.evidence_source ?? 'cql',
            period: {
              start: row.evidence_period_start ?? row.period_start,
              end: row.evidence_period_end ?? row.period_end,
            },
            flags: {
              denominator: row.evidence_denominator_flag === true,
              numerator: row.evidence_numerator_flag === true,
              exclusion: row.evidence_exclusion_flag === true,
            },
            measureValue: toNullableNumber(row.measure_value),
            computedAt: row.evidence_computed_at ?? row.generated_at,
            qdmEvidenceCount: qdmEvidence.length,
            fhirSubjectReportPresent: fhirSubjectReport !== null,
            qdmEvidence,
            fhirSubjectReport,
          },
  };
}

export async function setDriftReviewState(
  input: SetDriftReviewStateInput,
): Promise<DriftReviewRow> {
  const measureCode = normalizeMeasureCode(input.measureCode);
  const dossierPatientId = normalizePositiveInt(input.dossierPatientId, 'dossierPatientId');
  if (!isDriftReviewState(input.reviewState)) {
    throw new MeasureSemanticDriftError(
      'INVALID_INPUT',
      `reviewState must be one of: ${DRIFT_REVIEW_STATES.join(', ')}`,
      400,
    );
  }
  const actorId = normalizeActorId(input.actorId);

  const rows = await sql<DriftReviewDbRow[]>`
    UPDATE phm_edw.measure_semantic_drift_patient p
    SET
      review_state = ${input.reviewState},
      review_updated_at = NOW(),
      review_updated_by = ${actorId}::uuid
    FROM phm_edw.measure_semantic_drift_dossier d
    WHERE p.dossier_id = d.id
      AND p.id = ${dossierPatientId}
      AND d.measure_code = ${measureCode}
    RETURNING
      p.id,
      p.dossier_id,
      d.measure_code,
      p.patient_id,
      p.patient_ref,
      p.review_state,
      p.assignee_user_id,
      p.review_updated_at::text AS review_updated_at,
      p.review_updated_by
  `;
  return reviewRowFromDb(requireDriftReviewRow(rows[0], measureCode, dossierPatientId));
}

export async function setDriftAssignee(input: SetDriftAssigneeInput): Promise<DriftReviewRow> {
  const measureCode = normalizeMeasureCode(input.measureCode);
  const dossierPatientId = normalizePositiveInt(input.dossierPatientId, 'dossierPatientId');
  const assigneeUserId =
    input.assigneeUserId === null ? null : normalizeUuid(input.assigneeUserId, 'assigneeUserId');
  const actorId = normalizeActorId(input.actorId);

  const rows = await sql<DriftReviewDbRow[]>`
    UPDATE phm_edw.measure_semantic_drift_patient p
    SET
      assignee_user_id = ${assigneeUserId}::uuid,
      review_updated_at = NOW(),
      review_updated_by = ${actorId}::uuid
    FROM phm_edw.measure_semantic_drift_dossier d
    WHERE p.dossier_id = d.id
      AND p.id = ${dossierPatientId}
      AND d.measure_code = ${measureCode}
    RETURNING
      p.id,
      p.dossier_id,
      d.measure_code,
      p.patient_id,
      p.patient_ref,
      p.review_state,
      p.assignee_user_id,
      p.review_updated_at::text AS review_updated_at,
      p.review_updated_by
  `;
  return reviewRowFromDb(requireDriftReviewRow(rows[0], measureCode, dossierPatientId));
}

export async function addDriftComment(input: AddDriftCommentInput): Promise<DriftComment> {
  const measureCode = normalizeMeasureCode(input.measureCode);
  const dossierPatientId = normalizePositiveInt(input.dossierPatientId, 'dossierPatientId');
  const body = normalizeCommentBody(input.body);
  const actorId = normalizeActorId(input.actorId);

  // Guard insertion to the requested measure so a comment cannot be attached to a
  // drift row belonging to a different measure via a mismatched id/measure pair.
  const rows = await sql<DriftCommentDbRow[]>`
    INSERT INTO phm_edw.measure_drift_comment (drift_patient_id, author_user_id, body)
    SELECT p.id, ${actorId}::uuid, ${body}
    FROM phm_edw.measure_semantic_drift_patient p
    JOIN phm_edw.measure_semantic_drift_dossier d ON d.id = p.dossier_id
    WHERE p.id = ${dossierPatientId}
      AND d.measure_code = ${measureCode}
    RETURNING
      id,
      drift_patient_id,
      author_user_id,
      body,
      created_at::text AS created_at
  `;
  const row = rows[0];
  if (!row) {
    throw new MeasureSemanticDriftError(
      'SEMANTIC_DRIFT_PATIENT_NOT_FOUND',
      `No semantic drift patient row ${dossierPatientId} exists for ${measureCode}`,
      404,
    );
  }
  return commentFromDb(row);
}

export async function listDriftComments(input: ListDriftCommentsInput): Promise<DriftComment[]> {
  const measureCode = normalizeMeasureCode(input.measureCode);
  const dossierPatientId = normalizePositiveInt(input.dossierPatientId, 'dossierPatientId');
  const limit = normalizeCommentLimit(input.limit);

  const rows = await sql<DriftCommentDbRow[]>`
    SELECT
      c.id,
      c.drift_patient_id,
      c.author_user_id,
      c.body,
      c.created_at::text AS created_at
    FROM phm_edw.measure_drift_comment c
    JOIN phm_edw.measure_semantic_drift_patient p ON p.id = c.drift_patient_id
    JOIN phm_edw.measure_semantic_drift_dossier d ON d.id = p.dossier_id
    WHERE c.drift_patient_id = ${dossierPatientId}
      AND d.measure_code = ${measureCode}
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT ${limit}
  `;
  return rows.map(commentFromDb);
}

function requireDriftReviewRow(
  row: DriftReviewDbRow | undefined,
  measureCode: string,
  dossierPatientId: number,
): DriftReviewDbRow {
  if (!row) {
    throw new MeasureSemanticDriftError(
      'SEMANTIC_DRIFT_PATIENT_NOT_FOUND',
      `No semantic drift patient row ${dossierPatientId} exists for ${measureCode}`,
      404,
    );
  }
  return row;
}

function reviewRowFromDb(row: DriftReviewDbRow): DriftReviewRow {
  return {
    measureCode: row.measure_code,
    dossierId: Number(row.dossier_id),
    dossierPatientId: Number(row.id),
    patientId: nullablePositiveInt(row.patient_id),
    patientRef: row.patient_ref ?? null,
    reviewState: isDriftReviewState(row.review_state) ? row.review_state : 'open',
    assigneeUserId: row.assignee_user_id ?? null,
    reviewUpdatedAt: row.review_updated_at ?? null,
    reviewUpdatedBy: row.review_updated_by ?? null,
  };
}

function commentFromDb(row: DriftCommentDbRow): DriftComment {
  return {
    id: Number(row.id),
    driftPatientId: Number(row.drift_patient_id),
    authorUserId: row.author_user_id ?? null,
    body: row.body,
    createdAt: row.created_at,
  };
}

async function selectReconciliationRun(
  measureCode: string,
  reconciliationRunId: number | undefined,
): Promise<ReconciliationRunRow> {
  const rows =
    reconciliationRunId === undefined
      ? await sql<ReconciliationRunRow[]>`
          SELECT
            id,
            measure_code,
            period_start::text AS period_start,
            period_end::text AS period_end,
            evaluation_scope,
            promotion_eligible,
            status,
            agree,
            sql_denominator,
            sql_numerator,
            sql_exclusion,
            cql_denominator,
            cql_numerator,
            cql_exclusion,
            delta_denominator,
            delta_numerator,
            delta_exclusion,
            cql_measure_report_id,
            computed_at::text AS computed_at
          FROM phm_edw.measure_reconciliation_run
          WHERE measure_code = ${measureCode}
          ORDER BY computed_at DESC, id DESC
          LIMIT 1
        `
      : await sql<ReconciliationRunRow[]>`
          SELECT
            id,
            measure_code,
            period_start::text AS period_start,
            period_end::text AS period_end,
            evaluation_scope,
            promotion_eligible,
            status,
            agree,
            sql_denominator,
            sql_numerator,
            sql_exclusion,
            cql_denominator,
            cql_numerator,
            cql_exclusion,
            delta_denominator,
            delta_numerator,
            delta_exclusion,
            cql_measure_report_id,
            computed_at::text AS computed_at
          FROM phm_edw.measure_reconciliation_run
          WHERE measure_code = ${measureCode}
            AND id = ${reconciliationRunId}
          LIMIT 1
        `;

  const row = rows[0];
  if (!row) {
    throw new MeasureSemanticDriftError(
      'RECONCILIATION_RUN_NOT_FOUND',
      reconciliationRunId === undefined
        ? `No reconciliation run exists for ${measureCode}`
        : `No reconciliation run ${reconciliationRunId} exists for ${measureCode}`,
      404,
    );
  }
  if (row.evaluation_scope !== 'full_population') {
    throw new MeasureSemanticDriftError(
      'RECONCILIATION_SCOPE_NOT_FULL_POPULATION',
      'Semantic drift dossiers require a full-population reconciliation run',
      409,
      { evaluationScope: row.evaluation_scope, reconciliationRunId: Number(row.id) },
    );
  }
  return row;
}

async function selectMeasureReport(input: {
  measureCode: string;
  measureReportId?: number;
  periodStart: string;
  periodEnd: string;
}): Promise<MeasureReportRow> {
  const rows =
    input.measureReportId === undefined
      ? await sql<MeasureReportRow[]>`
          SELECT
            id,
            measure_code,
            period_start::text AS period_start,
            period_end::text AS period_end,
            report_type,
            initial_population,
            denominator,
            numerator,
            denominator_exclusion,
            source,
            computed_at::text AS computed_at
          FROM phm_edw.measure_report
          WHERE measure_code = ${input.measureCode}
            AND period_start = ${input.periodStart}::date
            AND period_end = ${input.periodEnd}::date
            AND report_type = 'population'
          ORDER BY computed_at DESC, id DESC
          LIMIT 1
        `
      : await sql<MeasureReportRow[]>`
          SELECT
            id,
            measure_code,
            period_start::text AS period_start,
            period_end::text AS period_end,
            report_type,
            initial_population,
            denominator,
            numerator,
            denominator_exclusion,
            source,
            computed_at::text AS computed_at
          FROM phm_edw.measure_report
          WHERE id = ${input.measureReportId}
            AND measure_code = ${input.measureCode}
          LIMIT 1
        `;

  const row = rows[0];
  if (!row) {
    throw new MeasureSemanticDriftError(
      'MEASURE_REPORT_NOT_FOUND',
      input.measureReportId === undefined
        ? `No population MeasureReport exists for ${input.measureCode} ${input.periodStart}..${input.periodEnd}`
        : `No MeasureReport ${input.measureReportId} exists for ${input.measureCode}`,
      404,
    );
  }
  if (row.report_type !== 'population') {
    throw new MeasureSemanticDriftError(
      'MEASURE_REPORT_NOT_POPULATION',
      'Semantic drift dossiers require a population MeasureReport',
      409,
      { measureReportId: Number(row.id), reportType: row.report_type },
    );
  }
  return row;
}

async function selectBaselineAlias(measureCode: string): Promise<BaselineAliasRow | null> {
  const rows = await sql<BaselineAliasRow[]>`
    SELECT source_measure_code, mapping_method, metadata
    FROM phm_edw.measure_sql_baseline_alias
    WHERE target_measure_code = ${measureCode}
      AND active_ind = TRUE
    ORDER BY updated_at DESC, source_measure_code
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function selectDossierState(
  measureCode: string,
  dossierId: number | undefined,
): Promise<DossierStateRow> {
  const rows =
    dossierId === undefined
      ? await sql<DossierStateRow[]>`
          SELECT
            id,
            measure_code,
            source_measure_code,
            reconciliation_run_id,
            measure_report_id,
            period_start::text AS period_start,
            period_end::text AS period_end,
            semantic_relationship,
            classification_counts,
            generated_at::text AS generated_at
          FROM phm_edw.measure_semantic_drift_dossier
          WHERE measure_code = ${measureCode}
          ORDER BY generated_at DESC, id DESC
          LIMIT 1
        `
      : await sql<DossierStateRow[]>`
          SELECT
            id,
            measure_code,
            source_measure_code,
            reconciliation_run_id,
            measure_report_id,
            period_start::text AS period_start,
            period_end::text AS period_end,
            semantic_relationship,
            classification_counts,
            generated_at::text AS generated_at
          FROM phm_edw.measure_semantic_drift_dossier
          WHERE measure_code = ${measureCode}
            AND id = ${dossierId}
          LIMIT 1
        `;
  const row = rows[0];
  if (!row) {
    throw new MeasureSemanticDriftError(
      'SEMANTIC_DRIFT_DOSSIER_NOT_FOUND',
      dossierId === undefined
        ? `No semantic drift dossier exists for ${measureCode}`
        : `No semantic drift dossier ${dossierId} exists for ${measureCode}`,
      404,
    );
  }
  return row;
}

async function selectPatientComparisonRows(
  measureCode: string,
  sourceMeasureCode: string,
  measureReportId: number,
  measureReportSource: string,
  periodStart: string,
  periodEnd: string,
): Promise<PatientSourceRow[]> {
  return sql<PatientSourceRow[]>`
    WITH target_measure AS (
      SELECT measure_key
      FROM phm_star.dim_measure
      WHERE measure_code = ${measureCode}
      LIMIT 1
    ),
    sql_snapshot AS (
      SELECT MAX(fmr.date_key_period) AS date_key_period
      FROM phm_star.fact_measure_result fmr
      JOIN target_measure tm ON tm.measure_key = fmr.measure_key
      WHERE fmr.source = 'sql_bundle'
        AND fmr.evaluation_scope = 'full_population'
        AND fmr.reconciliation_status = 'authoritative'
    ),
    sql_rows AS (
      SELECT
        dp.patient_id,
        ('Patient/' || dp.patient_id::text) AS patient_ref,
        fmr.patient_key,
        fmr.denominator_flag,
        fmr.numerator_flag,
        fmr.exclusion_flag,
        dd.full_date::text AS sql_snapshot_date
      FROM phm_star.fact_measure_result fmr
      JOIN target_measure tm ON tm.measure_key = fmr.measure_key
      JOIN sql_snapshot ss ON ss.date_key_period = fmr.date_key_period
      JOIN phm_star.dim_date dd ON dd.date_key = fmr.date_key_period
      JOIN phm_star.dim_patient dp ON dp.patient_key = fmr.patient_key
      WHERE fmr.source = 'sql_bundle'
        AND fmr.evaluation_scope = 'full_population'
        AND fmr.reconciliation_status = 'authoritative'
    ),
    report_evidence AS (
      SELECT *
      FROM phm_edw.measure_report_evidence
      WHERE measure_report_id = ${measureReportId}
        AND measure_code = ${measureCode}
        AND source = ${measureReportSource}
    ),
    cql_rows AS (
      SELECT
        COALESCE(patient_id::text, patient_ref) AS identity_key,
        patient_id,
        patient_ref,
        MAX(patient_key)::int AS patient_key,
        BOOL_OR(denominator_flag) AS denominator_flag,
        BOOL_OR(numerator_flag) AS numerator_flag,
        BOOL_OR(exclusion_flag) AS exclusion_flag
      FROM report_evidence
      GROUP BY COALESCE(patient_id::text, patient_ref), patient_id, patient_ref
    ),
    diabetes_valuesets AS (
      SELECT DISTINCT value_set_oid
      FROM phm_edw.measure_data_criteria
      WHERE measure_code = ${measureCode}
        AND value_set_oid IS NOT NULL
        AND qdm_datatype = 'Diagnosis'
        AND criteria_name ILIKE '%diabetes%'
    ),
    qualifying_encounter_valuesets AS (
      SELECT DISTINCT value_set_oid
      FROM phm_edw.measure_data_criteria
      WHERE measure_code = ${measureCode}
        AND value_set_oid IS NOT NULL
        AND qdm_datatype = 'Encounter, Performed'
        AND population_role IN ('initial_population', 'denominator')
    ),
    hba1c_valuesets AS (
      SELECT DISTINCT value_set_oid
      FROM phm_edw.measure_data_criteria
      WHERE measure_code = ${measureCode}
        AND value_set_oid IS NOT NULL
        AND qdm_datatype = 'Laboratory Test, Performed'
        AND population_role = 'numerator'
    ),
    expanded_evidence AS (
      SELECT
        COALESCE(mre.patient_id::text, mre.patient_ref) AS identity_key,
        mre.patient_id,
        mre.patient_ref,
        mre.patient_key,
        e."qdmEventId" AS qdm_event_id,
        e."populationRole" AS population_role,
        e."valueSetOid" AS value_set_oid,
        e."qdmDatatype" AS qdm_datatype,
        e."qdmCategory" AS qdm_category,
        e."code" AS code,
        qe.value_numeric,
        COALESCE(qe.result_datetime, qe.relevant_start_at) AS evidence_at
      FROM report_evidence mre
      CROSS JOIN LATERAL jsonb_to_recordset(mre.qdm_evidence) AS e(
        "qdmEventId" BIGINT,
        "populationRole" TEXT,
        "valueSetOid" TEXT,
        "qdmDatatype" TEXT,
        "qdmCategory" TEXT,
        "code" TEXT
      )
      LEFT JOIN phm_edw.qdm_event qe
        ON qe.qdm_event_id = e."qdmEventId"
    ),
    evidence_rollup AS (
      SELECT
        identity_key,
        MAX(patient_id) AS patient_id,
        MAX(patient_ref) AS patient_ref,
        MAX(patient_key)::int AS patient_key,
        COUNT(*)::int AS qdm_evidence_count,
        COUNT(*) FILTER (WHERE population_role = 'initial_population')::int
          AS initial_population_evidence_count,
        COUNT(*) FILTER (WHERE population_role = 'denominator_exclusion')::int
          AS denominator_exclusion_evidence_count,
        COUNT(*) FILTER (WHERE population_role = 'numerator')::int
          AS numerator_evidence_count,
        BOOL_OR(population_role = 'initial_population') AS has_initial_population_evidence,
        BOOL_OR(population_role = 'denominator_exclusion') AS has_denominator_exclusion_evidence,
        BOOL_OR(
          EXISTS (
            SELECT 1 FROM diabetes_valuesets dvs
            WHERE dvs.value_set_oid = expanded_evidence.value_set_oid
          )
        ) AS has_diabetes_evidence,
        BOOL_OR(
          qdm_datatype = 'Encounter, Performed'
          AND (
            population_role = 'initial_population'
            OR EXISTS (
              SELECT 1 FROM qualifying_encounter_valuesets qev
              WHERE qev.value_set_oid = expanded_evidence.value_set_oid
            )
          )
        ) AS has_qualifying_encounter_evidence,
        BOOL_OR(
          qdm_datatype = 'Laboratory Test, Performed'
          AND (
            code = '4548-4'
            OR EXISTS (
              SELECT 1 FROM hba1c_valuesets hvs
              WHERE hvs.value_set_oid = expanded_evidence.value_set_oid
            )
          )
        ) AS has_hba1c_evidence,
        BOOL_OR(
          qdm_datatype = 'Laboratory Test, Performed'
          AND (
            code = '4548-4'
            OR EXISTS (
              SELECT 1 FROM hba1c_valuesets hvs
              WHERE hvs.value_set_oid = expanded_evidence.value_set_oid
            )
          )
          AND value_numeric > 9
        ) AS has_hba1c_gt9,
        MAX(value_numeric) FILTER (
          WHERE qdm_datatype = 'Laboratory Test, Performed'
            AND (
              code = '4548-4'
              OR EXISTS (
                SELECT 1 FROM hba1c_valuesets hvs
                WHERE hvs.value_set_oid = expanded_evidence.value_set_oid
              )
            )
        ) AS max_hba1c_value,
        (
          MAX(evidence_at) FILTER (
            WHERE qdm_datatype = 'Laboratory Test, Performed'
              AND (
                code = '4548-4'
                OR EXISTS (
                  SELECT 1 FROM hba1c_valuesets hvs
                  WHERE hvs.value_set_oid = expanded_evidence.value_set_oid
                )
              )
          )
        )::text AS latest_hba1c_at
      FROM expanded_evidence
      GROUP BY identity_key
    ),
    local_gap AS (
      SELECT
        dp.patient_id::text AS identity_key,
        string_agg(DISTINCT lower(d.gap_status), ',' ORDER BY lower(d.gap_status))
          AS local_gap_status,
        BOOL_OR(lower(d.gap_status) = 'closed') AS local_gap_closed
      FROM phm_star.fact_patient_bundle_detail d
      JOIN phm_star.dim_measure dm ON dm.measure_key = d.measure_key
      JOIN phm_star.dim_patient dp ON dp.patient_key = d.patient_key
      WHERE dm.measure_code = ${sourceMeasureCode}
      GROUP BY dp.patient_id::text
    ),
    patient_universe AS (
      SELECT patient_id::text AS identity_key FROM sql_rows
      UNION
      SELECT identity_key FROM cql_rows
      UNION
      SELECT identity_key FROM evidence_rollup
    ),
    comparison AS (
      SELECT
        COALESCE(sr.patient_id, cr.patient_id, er.patient_id)::int AS patient_id,
        COALESCE(sr.patient_ref, cr.patient_ref, er.patient_ref) AS patient_ref,
        COALESCE(sr.patient_key, cr.patient_key, er.patient_key)::int AS patient_key,
        COALESCE(sr.denominator_flag, FALSE) AS sql_denominator,
        COALESCE(sr.numerator_flag, FALSE) AS sql_numerator,
        COALESCE(sr.exclusion_flag, FALSE) AS sql_exclusion,
        COALESCE(cr.denominator_flag, FALSE) AS cql_denominator,
        COALESCE(cr.numerator_flag, FALSE) AS cql_numerator,
        COALESCE(cr.exclusion_flag, FALSE) AS cql_exclusion,
        lg.local_gap_status,
        COALESCE(lg.local_gap_closed, FALSE) AS local_gap_closed,
        COALESCE(er.qdm_evidence_count, 0)::int AS qdm_evidence_count,
        COALESCE(er.initial_population_evidence_count, 0)::int AS initial_population_evidence_count,
        COALESCE(er.denominator_exclusion_evidence_count, 0)::int
          AS denominator_exclusion_evidence_count,
        COALESCE(er.numerator_evidence_count, 0)::int AS numerator_evidence_count,
        COALESCE(er.has_initial_population_evidence, FALSE) AS has_initial_population_evidence,
        COALESCE(er.has_denominator_exclusion_evidence, FALSE)
          AS has_denominator_exclusion_evidence,
        COALESCE(er.has_diabetes_evidence, FALSE) AS has_diabetes_evidence,
        COALESCE(er.has_qualifying_encounter_evidence, FALSE)
          AS has_qualifying_encounter_evidence,
        COALESCE(er.has_hba1c_evidence, FALSE) AS has_hba1c_evidence,
        COALESCE(er.has_hba1c_gt9, FALSE) AS has_hba1c_gt9,
        er.max_hba1c_value,
        er.latest_hba1c_at,
        sr.sql_snapshot_date
      FROM patient_universe pu
      LEFT JOIN sql_rows sr ON sr.patient_id::text = pu.identity_key
      LEFT JOIN cql_rows cr ON cr.identity_key = pu.identity_key
      LEFT JOIN evidence_rollup er ON er.identity_key = pu.identity_key
      LEFT JOIN local_gap lg ON lg.identity_key = pu.identity_key
    )
    SELECT
      cmp.*,
      CASE
        WHEN dp.date_of_birth IS NULL THEN NULL
        ELSE EXTRACT(YEAR FROM age(${periodStart}::date, dp.date_of_birth))::int
      END AS age_at_period_start,
      CASE
        WHEN dp.date_of_birth IS NULL THEN NULL
        ELSE EXTRACT(YEAR FROM age(${periodEnd}::date, dp.date_of_birth))::int
      END AS age_at_period_end,
      CASE
        WHEN dp.date_of_birth IS NULL THEN NULL
        ELSE (
          EXTRACT(YEAR FROM age(${periodStart}::date, dp.date_of_birth)) >= 18
          AND EXTRACT(YEAR FROM age(${periodStart}::date, dp.date_of_birth)) < 75
        )
      END AS age_qualifies_cms122
    FROM comparison cmp
    LEFT JOIN phm_star.dim_patient dp
      ON dp.patient_key = cmp.patient_key
     AND dp.is_current
    ORDER BY cmp.patient_id NULLS LAST, cmp.patient_ref
  `;
}

function worklistRowFromDb(row: WorklistPatientRow): MeasureSemanticDriftWorklistRow {
  const sqlFlags = {
    denominator: row.sql_denominator,
    numerator: row.sql_numerator,
    exclusion: row.sql_exclusion,
  };
  const cqlFlags = {
    denominator: row.cql_denominator,
    numerator: row.cql_numerator,
    exclusion: row.cql_exclusion,
  };
  const evidenceSummary = jsonObject(row.evidence_summary);
  const cqlPopulationCounts = numberObject(row.cql_population_counts);
  const denominatorDrift = row.denominator_drift;
  const numeratorDrift = row.numerator_drift;
  return {
    dossierPatientId: Number(row.id),
    patientId: nullablePositiveInt(row.patient_id),
    patientRef: row.patient_ref ?? null,
    patientKey: nullablePositiveInt(row.patient_key),
    sql: sqlFlags,
    cql: cqlFlags,
    localGapStatus: row.local_gap_status ?? null,
    denominatorDrift,
    numeratorDrift,
    exclusionDrift: row.exclusion_drift,
    classification: jsonObject(row.classification),
    evidenceSummary,
    cqlPopulationCounts,
    hasSubjectReport: row.has_subject_report === true,
    reviewBuckets: reviewBuckets(
      row.local_gap_status,
      denominatorDrift,
      evidenceSummary,
      cqlPopulationCounts,
    ),
    reviewPriority: reviewPriority(denominatorDrift, numeratorDrift, evidenceSummary),
    reviewHint: reviewHint(denominatorDrift, numeratorDrift, evidenceSummary, cqlPopulationCounts),
    reviewState: isDriftReviewState(row.review_state) ? row.review_state : 'open',
    assigneeUserId: row.assignee_user_id ?? null,
    reviewUpdatedAt: row.review_updated_at ?? null,
    commentCount: toInteger(row.comment_count),
    createdAt: row.created_at,
  };
}

function reviewBuckets(
  localGapStatus: string | null,
  denominatorDrift: string,
  evidenceSummary: Record<string, unknown>,
  cqlPopulationCounts: Record<string, number>,
): MeasureSemanticDriftWorklistRow['reviewBuckets'] {
  const qdmEvidenceCount = numericEvidence(evidenceSummary['qdmEvidenceCount']);
  const localGap = localGapStatus?.toLowerCase().includes('closed')
    ? 'closed'
    : localGapStatus?.toLowerCase().includes('open')
      ? 'open'
      : 'unknown';
  const hba1c =
    evidenceSummary['hasHbA1cEvidence'] !== true
      ? 'missing'
      : evidenceSummary['hasHbA1cGreaterThan9'] === true
        ? 'poor_control'
        : 'controlled_or_not_poor_control';
  const denominatorPrerequisites =
    evidenceSummary['ageQualifiesCms122'] === true &&
    evidenceSummary['hasDiabetesEvidence'] === true &&
    evidenceSummary['hasQualifyingEncounterEvidence'] === true
      ? 'age_diabetes_encounter_present'
      : denominatorDrift;
  const cqlSubjectPopulation =
    (cqlPopulationCounts['initial-population'] ?? 0) === 0 &&
    (cqlPopulationCounts.denominator ?? 0) === 0
      ? 'subject_population_zero'
      : 'subject_population_nonzero';

  return {
    localGap,
    hba1c,
    qdmEvidenceVolume: evidenceVolumeBucket(qdmEvidenceCount),
    denominatorPrerequisites,
    cqlSubjectPopulation,
  };
}

function numericEvidence(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function evidenceVolumeBucket(count: number): string {
  if (count === 0) return 'none';
  if (count < 10) return 'low';
  if (count < 50) return 'medium';
  return 'high';
}

function reviewPriority(
  denominatorDrift: string,
  numeratorDrift: string,
  evidenceSummary: Record<string, unknown>,
): number {
  if (denominatorDrift === 'residual_cql_or_qicore_semantic_gap') return 100;
  if (denominatorDrift === 'denominator_exclusion_evidence_present_but_not_cql_flagged') return 90;
  if (denominatorDrift === 'missing_cql_diabetes_value_set_evidence') return 80;
  if (numeratorDrift.includes('local_gap_closed')) return 70;
  if (evidenceSummary['hasHbA1cEvidence'] === true) return 60;
  return 50;
}

function reviewHint(
  denominatorDrift: string,
  numeratorDrift: string,
  evidenceSummary: Record<string, unknown>,
  cqlPopulationCounts: Record<string, number>,
): string {
  if (denominatorDrift === 'residual_cql_or_qicore_semantic_gap') {
    const initial = cqlPopulationCounts['initial-population'] ?? 0;
    if (initial === 0) {
      return 'Evidence summary has age, diabetes, and qualifying encounter signals, but subject MeasureReport initial population is 0; inspect QI-Core projection, CQL timing, and value-set membership.';
    }
    return 'Evidence summary satisfies coarse CMS122 prerequisites; inspect CQL subject population details and QI-Core resource projection.';
  }
  if (denominatorDrift === 'denominator_exclusion_evidence_present_but_not_cql_flagged') {
    return 'Exclusion-like evidence exists but the CQL exclusion flag is false; inspect whether the evidence satisfies complete exclusion timing and criteria.';
  }
  if (denominatorDrift === 'missing_cql_qualifying_encounter_or_initial_population') {
    return 'SQL surrogate includes patient, but CQL evidence lacks a qualifying encounter or initial-population membership.';
  }
  if (denominatorDrift === 'outside_cms122_age_range') {
    return 'SQL surrogate includes patient outside the CMS122 18-74-at-period-start age range used by the artifact.';
  }
  if (numeratorDrift.includes('local_gap_closed')) {
    return 'Local gap closure should not be interpreted as CMS122 numerator evidence; CMS122 numerator is poor control or missing/not-performed assessment.';
  }
  if (evidenceSummary['hasHbA1cEvidence'] === true) {
    return 'HbA1c evidence exists, but there is no CQL poor-control numerator flag.';
  }
  return 'Review the persisted evidence summary before considering any standards-measure mapping change.';
}

function classifyPatientDrift(
  row: PatientSourceRow,
  context: {
    measureCode: string;
    sourceMeasureCode: string | null;
    aliasMetadata: Record<string, unknown>;
  },
): PatientSemanticDriftRow {
  const sqlFlags = {
    denominator: toBoolean(row.sql_denominator),
    numerator: toBoolean(row.sql_numerator),
    exclusion: toBoolean(row.sql_exclusion),
  };
  const cqlFlags = {
    denominator: toBoolean(row.cql_denominator),
    numerator: toBoolean(row.cql_numerator),
    exclusion: toBoolean(row.cql_exclusion),
  };
  const evidenceSummary = {
    qdmEvidenceCount: toInteger(row.qdm_evidence_count),
    initialPopulationEvidenceCount: toInteger(row.initial_population_evidence_count),
    denominatorExclusionEvidenceCount: toInteger(row.denominator_exclusion_evidence_count),
    numeratorEvidenceCount: toInteger(row.numerator_evidence_count),
    hasInitialPopulationEvidence: toBoolean(row.has_initial_population_evidence),
    hasDenominatorExclusionEvidence: toBoolean(row.has_denominator_exclusion_evidence),
    hasDiabetesEvidence: toBoolean(row.has_diabetes_evidence),
    hasQualifyingEncounterEvidence: toBoolean(row.has_qualifying_encounter_evidence),
    hasHbA1cEvidence: toBoolean(row.has_hba1c_evidence),
    hasHbA1cGreaterThan9: toBoolean(row.has_hba1c_gt9),
    maxHbA1cValue: toNullableNumber(row.max_hba1c_value),
    latestHbA1cAt: row.latest_hba1c_at ?? null,
    ageAtPeriodStart: nullableNonnegativeInt(row.age_at_period_start),
    ageAtPeriodEnd: nullableNonnegativeInt(row.age_at_period_end),
    ageQualifiesCms122: nullableBoolean(row.age_qualifies_cms122),
    sqlSnapshotDate: row.sql_snapshot_date ?? null,
  };
  const denominatorDrift = classifyDenominator(sqlFlags, cqlFlags, evidenceSummary);
  const numeratorDrift = classifyNumerator(sqlFlags, cqlFlags, evidenceSummary, row, context);
  const exclusionDrift = classifyExclusion(sqlFlags, cqlFlags);
  const classification = {
    semanticRelationship: SEMANTIC_RELATIONSHIP,
    denominatorDrift,
    numeratorDrift,
    exclusionDrift,
    sourceMeasureCode: context.sourceMeasureCode,
    sourceAliasSemanticRelationship: context.aliasMetadata['semanticRelationship'] ?? null,
  };

  return {
    patientId: nullablePositiveInt(row.patient_id),
    patientRef: row.patient_ref ?? null,
    patientKey: nullablePositiveInt(row.patient_key),
    sql: sqlFlags,
    cql: cqlFlags,
    localGapStatus: row.local_gap_status ?? null,
    denominatorDrift,
    numeratorDrift,
    exclusionDrift,
    classification,
    evidenceSummary,
  };
}

function classifyDenominator(
  sqlFlags: PatientSemanticDriftRow['sql'],
  cqlFlags: PatientSemanticDriftRow['cql'],
  evidence: Record<string, unknown>,
): string {
  if (sqlFlags.denominator && cqlFlags.denominator) return 'aligned_denominator';
  if (!sqlFlags.denominator && cqlFlags.denominator) return 'cql_only_denominator';
  if (!sqlFlags.denominator && !cqlFlags.denominator) return 'neither_denominator';
  if (cqlFlags.exclusion) {
    return 'cql_exclusion_removed_from_denominator';
  }
  if (evidence['ageQualifiesCms122'] === false) {
    return 'outside_cms122_age_range';
  }
  if (evidence['ageQualifiesCms122'] == null) {
    return 'missing_or_unresolved_age_evidence';
  }
  if (evidence['hasDiabetesEvidence'] !== true) {
    return 'missing_cql_diabetes_value_set_evidence';
  }
  if (evidence['hasQualifyingEncounterEvidence'] !== true) {
    return 'missing_cql_qualifying_encounter_or_initial_population';
  }
  if (evidence['hasDenominatorExclusionEvidence'] === true) {
    return 'denominator_exclusion_evidence_present_but_not_cql_flagged';
  }
  return 'residual_cql_or_qicore_semantic_gap';
}

function classifyNumerator(
  sqlFlags: PatientSemanticDriftRow['sql'],
  cqlFlags: PatientSemanticDriftRow['cql'],
  evidence: Record<string, unknown>,
  row: PatientSourceRow,
  context: {
    measureCode: string;
    sourceMeasureCode: string | null;
  },
): string {
  if (sqlFlags.numerator && cqlFlags.numerator) {
    return 'both_true_semantics_require_manual_review';
  }
  if (!sqlFlags.numerator && cqlFlags.numerator) {
    return 'cql_poor_control_not_local_gap_closed';
  }
  if (!sqlFlags.numerator && !cqlFlags.numerator) return 'neither_numerator';

  const localGapClosed = toBoolean(row.local_gap_closed) || row.local_gap_status === 'closed';
  if (
    context.measureCode === 'CMS122v12' &&
    context.sourceMeasureCode &&
    localGapClosed &&
    evidence['hasHbA1cEvidence'] === true &&
    evidence['hasHbA1cGreaterThan9'] !== true
  ) {
    return 'local_gap_closed_with_controlled_hba1c_not_cms122_poor_control';
  }
  if (
    context.measureCode === 'CMS122v12' &&
    context.sourceMeasureCode &&
    localGapClosed &&
    evidence['hasHbA1cEvidence'] !== true
  ) {
    return 'local_gap_closed_without_qdm_hba1c_or_gmi_evidence';
  }
  if (evidence['hasHbA1cEvidence'] === true && evidence['hasHbA1cGreaterThan9'] !== true) {
    return 'cql_hba1c_controlled_not_poor_control';
  }
  if (evidence['hasHbA1cEvidence'] !== true) {
    return 'no_cql_hba1c_or_gmi_numerator_evidence';
  }
  return 'sql_only_numerator';
}

function classifyExclusion(
  sqlFlags: PatientSemanticDriftRow['sql'],
  cqlFlags: PatientSemanticDriftRow['cql'],
): string {
  if (sqlFlags.exclusion && cqlFlags.exclusion) return 'aligned_exclusion';
  if (sqlFlags.exclusion && !cqlFlags.exclusion) return 'sql_only_exclusion';
  if (!sqlFlags.exclusion && cqlFlags.exclusion) return 'cql_only_exclusion';
  return 'neither_exclusion';
}

function hasAnyDrift(row: PatientSemanticDriftRow): boolean {
  return (
    row.sql.denominator !== row.cql.denominator ||
    row.sql.numerator !== row.cql.numerator ||
    row.sql.exclusion !== row.cql.exclusion
  );
}

function buildSummary(
  run: ReconciliationRunRow,
  report: MeasureReportRow,
  rows: PatientSemanticDriftRow[],
): Record<string, unknown> {
  const sqlCounts = countFlags(rows, 'sql');
  const cqlCounts = countFlags(rows, 'cql');
  const driftRows = rows.filter(hasAnyDrift);
  const evidence = rows.map((row) => row.evidenceSummary);
  return {
    comparedPatients: rows.length,
    driftPatients: driftRows.length,
    alignedPatients: rows.length - driftRows.length,
    sqlCounts,
    cqlCounts,
    deltas: {
      denominator: Math.abs(sqlCounts.denominator - cqlCounts.denominator),
      numerator: Math.abs(sqlCounts.numerator - cqlCounts.numerator),
      exclusion: Math.abs(sqlCounts.exclusion - cqlCounts.exclusion),
    },
    reconciliationRunCounts: {
      sql: {
        denominator: Number(run.sql_denominator),
        numerator: Number(run.sql_numerator),
        exclusion: Number(run.sql_exclusion),
      },
      cql: {
        denominator: Number(run.cql_denominator),
        numerator: Number(run.cql_numerator),
        exclusion: Number(run.cql_exclusion),
      },
      deltas: {
        denominator: Number(run.delta_denominator),
        numerator: Number(run.delta_numerator),
        exclusion: Number(run.delta_exclusion),
      },
      status: run.status,
      agree: run.agree,
      promotionEligible: run.promotion_eligible,
      computedAt: run.computed_at,
    },
    measureReportCounts: {
      initialPopulation: Number(report.initial_population ?? 0),
      denominator: Number(report.denominator ?? 0),
      numerator: Number(report.numerator ?? 0),
      denominatorExclusion: Number(report.denominator_exclusion ?? 0),
      source: report.source,
      computedAt: report.computed_at,
    },
    evidenceCoverage: {
      patientsWithQdmEvidence: countWhere(evidence, 'qdmEvidenceCount'),
      patientsWithInitialPopulationEvidence: countWhere(evidence, 'hasInitialPopulationEvidence'),
      patientsWithDiabetesEvidence: countWhere(evidence, 'hasDiabetesEvidence'),
      patientsWithQualifyingEncounterEvidence: countWhere(
        evidence,
        'hasQualifyingEncounterEvidence',
      ),
      patientsWithDenominatorExclusionEvidence: countWhere(
        evidence,
        'hasDenominatorExclusionEvidence',
      ),
      patientsWithHbA1cEvidence: countWhere(evidence, 'hasHbA1cEvidence'),
      patientsWithHbA1cGreaterThan9: countWhere(evidence, 'hasHbA1cGreaterThan9'),
      patientsMeetingCms122AgeBand: countWhere(evidence, 'ageQualifiesCms122'),
      maxHbA1cValue: maxNullable(evidence.map((item) => item['maxHbA1cValue'])),
    },
    sourceSnapshots: {
      sqlSnapshotDate: firstString(evidence.map((item) => item['sqlSnapshotDate'])),
      cqlPeriodStart: report.period_start,
      cqlPeriodEnd: report.period_end,
    },
  };
}

function buildClassificationCounts(rows: PatientSemanticDriftRow[]): Record<string, unknown> {
  return {
    denominator: countBy(rows.map((row) => row.denominatorDrift)),
    numerator: countBy(rows.map((row) => row.numeratorDrift)),
    exclusion: countBy(rows.map((row) => row.exclusionDrift)),
  };
}

function buildAuthoritativePolicy(
  measureCode: string,
  sourceMeasureCode: string | null,
  alias: BaselineAliasRow | null,
): Record<string, unknown> {
  return {
    measureCode,
    sourceMeasureCode,
    semanticRelationship: SEMANTIC_RELATIONSHIP,
    mappingMethod: alias?.mapping_method ?? null,
    sqlAuthority: 'local_operational_care_gap_baseline',
    standardsAuthority: 'published_ecqm_cql_qdm_qicore_artifact',
    currentAnalyticsAuthority: 'sql_bundle',
    cqlStatus: 'shadow_until_validated',
    promotionGuard:
      'CQL can become authoritative only after full-population accepted reconciliation linked to the persisted MeasureReport and validation evidence.',
    cms122NumeratorSemantics:
      'Poor control or missing HbA1c/GMI assessment; this is a lower-is-better inverse measure.',
    localSurrogateNumeratorSemantics:
      sourceMeasureCode === null ? null : 'Local gap closed or measure satisfied.',
    aliasMetadata: jsonObject(alias?.metadata),
  };
}

function buildRecommendations(
  measureCode: string,
  sourceMeasureCode: string | null,
  summary: Record<string, unknown>,
): Record<string, unknown> {
  return {
    nextActions: [
      'Keep SQL authoritative for local dashboards while CQL remains cql_shadow.',
      'Review denominator SQL-only patients for missing CQL qualifying encounter, diabetes value-set, timing, or exclusion evidence.',
      'Review numerator SQL-only patients as semantic inversion candidates before treating local gap closure as eCQM numerator evidence.',
      'Promote only after patient-level discrepancies are reconciled and validation evidence is attached to the reconciliation run.',
    ],
    targetMeasure: measureCode,
    sourceMeasure: sourceMeasureCode,
    summary,
  };
}

async function persistDossier(input: {
  measureCode: string;
  sourceMeasureCode: string | null;
  runId: number;
  measureReportId: number;
  periodStart: string;
  periodEnd: string;
  authoritativePolicy: Record<string, unknown>;
  summary: Record<string, unknown>;
  classificationCounts: Record<string, unknown>;
  recommendations: Record<string, unknown>;
  actorId: string | null;
  driftRows: PatientSemanticDriftRow[];
}): Promise<{ dossierId: number; generatedAt: string; patientsPersisted: number }> {
  return sql.begin(async (tx) => {
    const dossierRows = await tx.unsafe<DossierInsertRow[]>(
      `
      INSERT INTO phm_edw.measure_semantic_drift_dossier (
        measure_code,
        source_measure_code,
        reconciliation_run_id,
        measure_report_id,
        period_start,
        period_end,
        semantic_relationship,
        authoritative_policy,
        summary,
        classification_counts,
        recommendations,
        generated_by
      )
      VALUES (
        $1, $2, $3, $4, $5::date, $6::date, $7, $8::jsonb, $9::jsonb,
        $10::jsonb, $11::jsonb, $12::uuid
      )
      RETURNING id, generated_at::text AS generated_at
      `,
      [
        input.measureCode,
        input.sourceMeasureCode,
        input.runId,
        input.measureReportId,
        input.periodStart,
        input.periodEnd,
        SEMANTIC_RELATIONSHIP,
        input.authoritativePolicy as unknown as UnsafeParameter,
        input.summary as unknown as UnsafeParameter,
        input.classificationCounts as unknown as UnsafeParameter,
        input.recommendations as unknown as UnsafeParameter,
        input.actorId,
      ] satisfies UnsafeParameter[],
    );
    const dossier = dossierRows[0];
    if (!dossier) {
      throw new MeasureSemanticDriftError(
        'DOSSIER_PERSIST_FAILED',
        'Semantic drift dossier insert did not return an id',
        500,
      );
    }
    const dossierId = Number(dossier.id);
    const patientPayload = input.driftRows.map((row) => ({
      patientId: row.patientId,
      patientRef: row.patientRef,
      patientKey: row.patientKey,
      sqlDenominator: row.sql.denominator,
      sqlNumerator: row.sql.numerator,
      sqlExclusion: row.sql.exclusion,
      cqlDenominator: row.cql.denominator,
      cqlNumerator: row.cql.numerator,
      cqlExclusion: row.cql.exclusion,
      denominatorDrift: row.denominatorDrift,
      numeratorDrift: row.numeratorDrift,
      exclusionDrift: row.exclusionDrift,
      localGapStatus: row.localGapStatus,
      classification: row.classification,
      evidenceSummary: row.evidenceSummary,
    }));
    const insertedRows = await tx.unsafe<InsertCountRow[]>(
      `
      WITH payload AS (
        SELECT *
        FROM jsonb_to_recordset($2::jsonb) AS p(
          "patientId" INT,
          "patientRef" TEXT,
          "patientKey" INT,
          "sqlDenominator" BOOLEAN,
          "sqlNumerator" BOOLEAN,
          "sqlExclusion" BOOLEAN,
          "cqlDenominator" BOOLEAN,
          "cqlNumerator" BOOLEAN,
          "cqlExclusion" BOOLEAN,
          "denominatorDrift" TEXT,
          "numeratorDrift" TEXT,
          "exclusionDrift" TEXT,
          "localGapStatus" TEXT,
          "classification" JSONB,
          "evidenceSummary" JSONB
        )
      ),
      inserted AS (
        INSERT INTO phm_edw.measure_semantic_drift_patient (
          dossier_id,
          patient_id,
          patient_ref,
          patient_key,
          sql_denominator,
          sql_numerator,
          sql_exclusion,
          cql_denominator,
          cql_numerator,
          cql_exclusion,
          denominator_drift,
          numerator_drift,
          exclusion_drift,
          local_gap_status,
          classification,
          evidence_summary
        )
        SELECT
          $1,
          p."patientId",
          p."patientRef",
          p."patientKey",
          COALESCE(p."sqlDenominator", FALSE),
          COALESCE(p."sqlNumerator", FALSE),
          COALESCE(p."sqlExclusion", FALSE),
          COALESCE(p."cqlDenominator", FALSE),
          COALESCE(p."cqlNumerator", FALSE),
          COALESCE(p."cqlExclusion", FALSE),
          p."denominatorDrift",
          p."numeratorDrift",
          p."exclusionDrift",
          p."localGapStatus",
          COALESCE(p."classification", '{}'::jsonb),
          COALESCE(p."evidenceSummary", '{}'::jsonb)
        FROM payload p
        RETURNING 1
      )
      SELECT COUNT(*)::int AS patient_rows_inserted FROM inserted
      `,
      [dossierId, patientPayload as unknown as UnsafeParameter],
    );

    return {
      dossierId,
      generatedAt: dossier.generated_at,
      patientsPersisted: Number(insertedRows[0]?.patient_rows_inserted ?? 0),
    };
  });
}

function countFlags(
  rows: PatientSemanticDriftRow[],
  source: 'sql' | 'cql',
): DriftPopulationCounts {
  return {
    denominator: rows.filter((row) => row[source].denominator).length,
    numerator: rows.filter((row) => row[source].numerator).length,
    exclusion: rows.filter((row) => row[source].exclusion).length,
  };
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function countWhere(values: Record<string, unknown>[], field: string): number {
  return values.filter((item) => {
    const value = item[field];
    if (typeof value === 'number') return value > 0;
    return value === true;
  }).length;
}

function maxNullable(values: unknown[]): number | null {
  const numbers = values
    .map((value) => (typeof value === 'number' ? value : Number(value)))
    .filter((value) => Number.isFinite(value));
  return numbers.length === 0 ? null : Math.max(...numbers);
}

function firstString(values: unknown[]): string | null {
  const found = values.find((value): value is string => typeof value === 'string' && value.length > 0);
  return found ?? null;
}

function normalizeMeasureCode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new MeasureSemanticDriftError('INVALID_INPUT', 'measureCode is required', 400);
  }
  if (trimmed.length > 120) {
    throw new MeasureSemanticDriftError(
      'INVALID_INPUT',
      'measureCode must be 120 characters or fewer',
      400,
    );
  }
  return trimmed;
}

function normalizePositiveInt(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new MeasureSemanticDriftError('INVALID_INPUT', `${field} must be a positive integer`, 400);
  }
  return parsed;
}

function normalizePatientSampleLimit(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_PATIENT_SAMPLE_LIMIT;
  const parsed = normalizePositiveInt(value, 'patientSampleLimit');
  return Math.min(parsed, MAX_PATIENT_SAMPLE_LIMIT);
}

function normalizeWorklistLimit(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_WORKLIST_LIMIT;
  const parsed = normalizePositiveInt(value, 'limit');
  return Math.min(parsed, MAX_WORKLIST_LIMIT);
}

function normalizeOffset(value: unknown): number {
  if (value === undefined || value === null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new MeasureSemanticDriftError('INVALID_INPUT', 'offset must be a non-negative integer', 400);
  }
  return parsed;
}

function normalizeOptionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new MeasureSemanticDriftError('INVALID_INPUT', `${field} must be a string`, 400);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new MeasureSemanticDriftError(
      'INVALID_INPUT',
      `${field} must be ${maxLength} characters or fewer`,
      400,
    );
  }
  return trimmed;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeActorId(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return normalizeUuid(value, 'actorId');
}

function normalizeUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new MeasureSemanticDriftError('INVALID_INPUT', `${field} must be a valid UUID`, 400);
  }
  return value.trim();
}

function normalizeCommentBody(value: unknown): string {
  if (typeof value !== 'string') {
    throw new MeasureSemanticDriftError('INVALID_INPUT', 'comment body must be a string', 400);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new MeasureSemanticDriftError('INVALID_INPUT', 'comment body must not be empty', 400);
  }
  if (trimmed.length > MAX_COMMENT_BODY_LENGTH) {
    throw new MeasureSemanticDriftError(
      'INVALID_INPUT',
      `comment body must be ${MAX_COMMENT_BODY_LENGTH} characters or fewer`,
      400,
    );
  }
  return trimmed;
}

function normalizeCommentLimit(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_COMMENT_LIMIT;
  const parsed = normalizePositiveInt(value, 'limit');
  return Math.min(parsed, MAX_COMMENT_LIMIT);
}

function nullablePositiveInt(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nullableNonnegativeInt(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function nullableBoolean(value: unknown): boolean | null {
  if (value == null) return null;
  return toBoolean(value);
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function toInteger(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function jsonObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function jsonArray(value: unknown): unknown[] {
  if (value == null) return [];
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
}

function numberObject(value: unknown): Record<string, number> {
  const object = jsonObject(value);
  return Object.fromEntries(
    Object.entries(object)
      .map(([key, raw]) => [key, Number(raw)] as const)
      .filter(([, parsed]) => Number.isFinite(parsed)),
  );
}
