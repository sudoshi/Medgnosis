// =============================================================================
// Medgnosis API - QDM/CQL MeasureReport evidence to star promotion
// Converts persisted patient-level CQL/QDM evidence into fact_measure_result
// rows and evidence ledgers. Promotion is explicit; SQL remains the default.
// =============================================================================

import { sql } from '@medgnosis/db';

export const QDM_CQL_STAR_PROMOTION_EVALUATOR = 'qdm-cql-star-promotion-v1';

const DEFAULT_SOURCE = 'qdm-cql';
const DEFAULT_EVALUATION_SCOPE = 'scoped_subjects';
const DEFAULT_RECONCILIATION_STATUS = 'shadow_pending';
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
const MAX_STATEMENT_TIMEOUT_MS = 300_000;

type UnsafeParameter = NonNullable<Parameters<typeof sql.unsafe>[1]>[number];
type PromotionSqlExecutor = Pick<typeof sql, 'unsafe'>;

export interface PromoteMeasureReportEvidenceToStarInput {
  measureReportId: number;
  evidenceSource?: string;
  starSource?: string;
  evaluationScope?: string;
  qdmRunId?: string | null;
  reconciliationStatus?: string | null;
  reconciliationDelta?: Record<string, unknown>;
  statementTimeoutMs?: number;
}

export interface PromoteMeasureReportEvidenceToStarResult {
  measureReportId: number;
  source: string;
  evaluationScope: string;
  evidenceRowsSeen: number;
  evidenceRowsPromoted: number;
  evidenceRowsSkipped: number;
  resultRowsUpserted: number;
  qdmEvidenceSelected: number;
  bridgeRowsUpserted: number;
  factEvidenceRowsUpserted: number;
}

interface PromotionCountsRow {
  evidence_rows_seen: number | string;
  evidence_rows_promoted: number | string;
  evidence_rows_skipped: number | string;
  result_rows_upserted: number | string;
  qdm_evidence_selected: number | string;
  bridge_rows_upserted: number | string;
  fact_evidence_rows_upserted: number | string;
}

export async function promoteMeasureReportEvidenceToStar(
  input: PromoteMeasureReportEvidenceToStarInput,
): Promise<PromoteMeasureReportEvidenceToStarResult> {
  validatePromotionInput(input);
  return sql.begin((tx) => promoteMeasureReportEvidenceToStarInTransaction(tx, input));
}

export async function promoteMeasureReportEvidenceToStarInTransaction(
  tx: PromotionSqlExecutor,
  input: PromoteMeasureReportEvidenceToStarInput,
): Promise<PromoteMeasureReportEvidenceToStarResult> {
  const measureReportId = normalizePositiveInt(input.measureReportId, 'measureReportId');
  const source = normalizeSource(input.starSource ?? DEFAULT_SOURCE, 'starSource');
  if (source === 'sql_bundle') {
    throw new Error('QDM/CQL promotion source cannot be sql_bundle');
  }
  const evaluationScope = normalizeText(
    input.evaluationScope ?? DEFAULT_EVALUATION_SCOPE,
    'evaluationScope',
    40,
  );
  const evidenceSource = input.evidenceSource
    ? normalizeSource(input.evidenceSource, 'evidenceSource')
    : null;
  const statementTimeoutMs = clampStatementTimeout(input.statementTimeoutMs);
  const reconciliationStatus = normalizeText(
    input.reconciliationStatus ?? DEFAULT_RECONCILIATION_STATUS,
    'reconciliationStatus',
    40,
  );
  const qdmRunId = normalizeOptionalUuid(input.qdmRunId);

  await tx.unsafe(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`);
  const rows = await tx.unsafe<PromotionCountsRow[]>(
    `
      WITH eligible AS (
        SELECT
          mre.id AS measure_report_evidence_id,
          mre.measure_report_id,
          mre.patient_key,
          mre.measure_key,
          dd.date_key AS date_key_period,
          mre.denominator_flag,
          mre.numerator_flag,
          mre.exclusion_flag,
          mre.measure_value,
          mre.qdm_evidence,
          mre.measure_code,
          mre.period_start,
          mre.period_end
        FROM phm_edw.measure_report_evidence mre
        LEFT JOIN phm_star.dim_date dd
          ON dd.full_date = mre.period_end
        WHERE mre.measure_report_id = $1
          AND ($2::text IS NULL OR mre.source = $2::text)
      ),
      scoped AS (
        SELECT *
        FROM eligible
        WHERE patient_key IS NOT NULL
          AND measure_key IS NOT NULL
          AND date_key_period IS NOT NULL
      ),
      upserted_results AS (
        INSERT INTO phm_star.fact_measure_result (
          patient_key,
          measure_key,
          date_key_period,
          denominator_flag,
          numerator_flag,
          exclusion_flag,
          measure_value,
          count_measure,
          source,
          evaluation_scope,
          measure_report_id,
          measure_report_evidence_id,
          qdm_run_id,
          reconciliation_status,
          reconciliation_delta,
          promoted_at
        )
        SELECT
          patient_key,
          measure_key,
          date_key_period,
          denominator_flag,
          numerator_flag,
          exclusion_flag,
          measure_value,
          1,
          $3::text,
          $4::text,
          measure_report_id,
          measure_report_evidence_id,
          $5::uuid,
          $6::text,
          $7::jsonb,
          NOW()
        FROM scoped
        ON CONFLICT (patient_key, measure_key, date_key_period, source, evaluation_scope)
          WHERE source <> 'sql_bundle'
        DO UPDATE SET
          denominator_flag = EXCLUDED.denominator_flag,
          numerator_flag = EXCLUDED.numerator_flag,
          exclusion_flag = EXCLUDED.exclusion_flag,
          measure_value = EXCLUDED.measure_value,
          count_measure = EXCLUDED.count_measure,
          measure_report_id = EXCLUDED.measure_report_id,
          measure_report_evidence_id = EXCLUDED.measure_report_evidence_id,
          evaluation_scope = EXCLUDED.evaluation_scope,
          qdm_run_id = EXCLUDED.qdm_run_id,
          reconciliation_status = EXCLUDED.reconciliation_status,
          reconciliation_delta = EXCLUDED.reconciliation_delta,
          promoted_at = NOW()
        RETURNING
          measure_result_key,
          patient_key,
          measure_key,
          measure_report_id,
          measure_report_evidence_id
      ),
      expanded_qdm_evidence AS (
        SELECT
          ur.measure_result_key,
          ur.patient_key,
          ur.measure_key,
          ur.measure_report_id,
          ur.measure_report_evidence_id,
          e."qdmEventId" AS qdm_event_id,
          CASE
            WHEN e."populationRole" IN (
              'initial_population',
              'denominator',
              'denominator_exclusion',
              'numerator',
              'supplemental',
              'unclassified'
            )
            THEN e."populationRole"
            ELSE 'unclassified'
          END AS population_role,
          NULLIF(e."valueSetOid", '') AS value_set_oid,
          NULLIF(e."codeSystem", '') AS code_system,
          NULLIF(e."code", '') AS code,
          NULLIF(e."qdmDatatype", '') AS qdm_datatype,
          NULLIF(e."qdmCategory", '') AS qdm_category,
          NULLIF(e."relevantStartAt", '') AS relevant_start_at,
          NULLIF(e."relevantEndAt", '') AS relevant_end_at,
          NULLIF(e."sourceTable", '') AS source_table,
          e."sourceId" AS source_id
        FROM upserted_results ur
        JOIN scoped s
          ON s.measure_report_evidence_id = ur.measure_report_evidence_id
        CROSS JOIN LATERAL jsonb_to_recordset(s.qdm_evidence) AS e(
          "qdmEventId" BIGINT,
          "populationRole" TEXT,
          "valueSetOid" TEXT,
          "codeSystem" TEXT,
          "code" TEXT,
          "qdmDatatype" TEXT,
          "qdmCategory" TEXT,
          "relevantStartAt" TEXT,
          "relevantEndAt" TEXT,
          "sourceTable" TEXT,
          "sourceId" BIGINT
        )
        WHERE e."qdmEventId" IS NOT NULL
      ),
      bridge_upserted AS (
        INSERT INTO phm_star.bridge_qdm_star_evidence (
          qdm_event_id,
          patient_key,
          measure_key,
          star_fact_table,
          star_fact_key,
          evidence_role,
          population_role,
          value_set_oid,
          matched_code_system,
          matched_code,
          evaluator,
          confidence,
          metadata
        )
        SELECT
          qdm_event_id,
          patient_key,
          measure_key,
          'phm_star.fact_measure_result',
          measure_result_key,
          'supporting',
          population_role,
          value_set_oid,
          code_system,
          code,
          $8::text,
          0.95,
          jsonb_strip_nulls(jsonb_build_object(
            'source', $3::text,
            'evaluationScope', $4::text,
            'measureReportId', measure_report_id,
            'measureReportEvidenceId', measure_report_evidence_id,
            'qdmRunId', $5::uuid,
            'qdmDatatype', qdm_datatype,
            'qdmCategory', qdm_category,
            'sourceTable', source_table,
            'sourceId', source_id
          ))
        FROM expanded_qdm_evidence
        ON CONFLICT ON CONSTRAINT uq_bqse_event_fact_role
        DO UPDATE SET
          patient_key = EXCLUDED.patient_key,
          measure_key = EXCLUDED.measure_key,
          value_set_oid = EXCLUDED.value_set_oid,
          matched_code_system = EXCLUDED.matched_code_system,
          matched_code = EXCLUDED.matched_code,
          evaluator = EXCLUDED.evaluator,
          confidence = EXCLUDED.confidence,
          evidence_at = NOW(),
          metadata = EXCLUDED.metadata
        RETURNING
          qdm_star_evidence_key,
          qdm_event_id,
          star_fact_key,
          population_role
      ),
      fact_evidence_upserted AS (
        INSERT INTO phm_star.fact_measure_result_evidence (
          measure_result_key,
          qdm_event_id,
          qdm_star_evidence_key,
          measure_report_id,
          measure_report_evidence_id,
          patient_key,
          measure_key,
          population_role,
          evidence_role,
          population_criteria_id,
          value_set_oid,
          decision,
          reason,
          evaluator,
          evidence
        )
        SELECT
          e.measure_result_key,
          e.qdm_event_id,
          b.qdm_star_evidence_key,
          e.measure_report_id,
          e.measure_report_evidence_id,
          e.patient_key,
          e.measure_key,
          e.population_role,
          'supporting',
          left(concat($3::text, ':', e.population_role, ':', coalesce(e.value_set_oid, 'no-valueset'), ':qdm:', e.qdm_event_id), 160),
          e.value_set_oid,
          'matched',
          NULL,
          $8::text,
          jsonb_strip_nulls(jsonb_build_object(
            'source', $3::text,
            'evaluationScope', $4::text,
            'measureReportId', e.measure_report_id,
            'measureReportEvidenceId', e.measure_report_evidence_id,
            'qdmRunId', $5::uuid,
            'qdmDatatype', e.qdm_datatype,
            'qdmCategory', e.qdm_category,
            'codeSystem', e.code_system,
            'code', e.code,
            'sourceTable', e.source_table,
            'sourceId', e.source_id,
            'relevantStartAt', e.relevant_start_at,
            'relevantEndAt', e.relevant_end_at
          ))
        FROM expanded_qdm_evidence e
        LEFT JOIN bridge_upserted b
          ON b.qdm_event_id = e.qdm_event_id
         AND b.star_fact_key = e.measure_result_key
         AND b.population_role = e.population_role
        ON CONFLICT ON CONSTRAINT uq_fmre_result_event_role
        DO UPDATE SET
          qdm_star_evidence_key = EXCLUDED.qdm_star_evidence_key,
          measure_report_id = EXCLUDED.measure_report_id,
          measure_report_evidence_id = EXCLUDED.measure_report_evidence_id,
          patient_key = EXCLUDED.patient_key,
          measure_key = EXCLUDED.measure_key,
          value_set_oid = EXCLUDED.value_set_oid,
          decision = EXCLUDED.decision,
          reason = EXCLUDED.reason,
          evaluator = EXCLUDED.evaluator,
          evaluated_at = NOW(),
          evidence = EXCLUDED.evidence
        RETURNING 1
      )
      SELECT
        (SELECT COUNT(*) FROM eligible)::int AS evidence_rows_seen,
        (SELECT COUNT(*) FROM scoped)::int AS evidence_rows_promoted,
        ((SELECT COUNT(*) FROM eligible) - (SELECT COUNT(*) FROM scoped))::int AS evidence_rows_skipped,
        (SELECT COUNT(*) FROM upserted_results)::int AS result_rows_upserted,
        (SELECT COUNT(*) FROM expanded_qdm_evidence)::int AS qdm_evidence_selected,
        (SELECT COUNT(*) FROM bridge_upserted)::int AS bridge_rows_upserted,
        (SELECT COUNT(*) FROM fact_evidence_upserted)::int AS fact_evidence_rows_upserted
      `,
    [
      measureReportId,
      evidenceSource,
      source,
      evaluationScope,
      qdmRunId,
      reconciliationStatus,
      (input.reconciliationDelta ?? {}) as unknown as UnsafeParameter,
      QDM_CQL_STAR_PROMOTION_EVALUATOR,
    ] satisfies UnsafeParameter[],
  );

  const row = rows[0] ?? {
    evidence_rows_seen: 0,
    evidence_rows_promoted: 0,
    evidence_rows_skipped: 0,
    result_rows_upserted: 0,
    qdm_evidence_selected: 0,
    bridge_rows_upserted: 0,
    fact_evidence_rows_upserted: 0,
  };

  return {
    measureReportId,
    source,
    evaluationScope,
    evidenceRowsSeen: Number(row.evidence_rows_seen),
    evidenceRowsPromoted: Number(row.evidence_rows_promoted),
    evidenceRowsSkipped: Number(row.evidence_rows_skipped),
    resultRowsUpserted: Number(row.result_rows_upserted),
    qdmEvidenceSelected: Number(row.qdm_evidence_selected),
    bridgeRowsUpserted: Number(row.bridge_rows_upserted),
    factEvidenceRowsUpserted: Number(row.fact_evidence_rows_upserted),
  };
}

function normalizePositiveInt(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function validatePromotionInput(input: PromoteMeasureReportEvidenceToStarInput): void {
  normalizePositiveInt(input.measureReportId, 'measureReportId');
  const source = normalizeSource(input.starSource ?? DEFAULT_SOURCE, 'starSource');
  if (source === 'sql_bundle') {
    throw new Error('QDM/CQL promotion source cannot be sql_bundle');
  }
  normalizeText(input.evaluationScope ?? DEFAULT_EVALUATION_SCOPE, 'evaluationScope', 40);
  if (input.evidenceSource) normalizeSource(input.evidenceSource, 'evidenceSource');
  normalizeText(
    input.reconciliationStatus ?? DEFAULT_RECONCILIATION_STATUS,
    'reconciliationStatus',
    40,
  );
  normalizeOptionalUuid(input.qdmRunId);
  clampStatementTimeout(input.statementTimeoutMs);
}

function normalizeSource(value: string, field: string): string {
  return normalizeText(value, field, 30);
}

function normalizeText(value: string, field: string, maxLength: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  if (trimmed.length > maxLength)
    throw new Error(`${field} must be ${maxLength} characters or fewer`);
  return trimmed;
}

function normalizeOptionalUuid(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  const trimmed = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    throw new Error('qdmRunId must be a valid UUID');
  }
  return trimmed;
}

function clampStatementTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_STATEMENT_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value <= 0) return DEFAULT_STATEMENT_TIMEOUT_MS;
  return Math.min(value, MAX_STATEMENT_TIMEOUT_MS);
}
