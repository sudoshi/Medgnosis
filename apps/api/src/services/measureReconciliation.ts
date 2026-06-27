// =============================================================================
// Medgnosis API — Measure reconciliation (CQL engine vs SQL star-schema)
// Compares the authoritative SQL rollup (phm_star.fact_measure_result) against
// the clinical-reasoning engine's $evaluate-measure for the same measure +
// period. Used to gain confidence in the CQL path before demoting SQL to a
// cache (Phase 1 Task 6). Disagreement above tolerance is a drift signal.
// =============================================================================

import { sql } from '@medgnosis/db';
import {
  evaluateMeasure,
  fetchEngineCapability,
  populationsFromReport,
  type FhirMeasureReport,
} from './fhir/cqlEngineClient.js';
import {
  promoteMeasureReportEvidenceToStarInTransaction,
  type PromoteMeasureReportEvidenceToStarResult,
} from './qdm/measureReportToStar.js';

export interface PopulationCounts {
  denominator: number;
  numerator: number;
  exclusion: number;
}

export type MeasureReconciliationScope = 'full_population' | 'scoped_subjects';

export interface ReconciliationScopeInput {
  evaluationScope?: MeasureReconciliationScope;
  patientIds?: readonly number[];
  patientRefs?: readonly string[];
  promotionEligible?: boolean;
}

interface NormalizedReconciliationScope {
  evaluationScope: MeasureReconciliationScope;
  patientIds: number[];
  patientRefs: string[];
  promotionEligible: boolean;
}

export type MeasurePromotionMode = 'sql_only' | 'cql_shadow' | 'cql_authoritative' | 'manual_hold';

export interface MeasurePromotionConfig {
  measureCode: string;
  measureArtifactId: number | null;
  promotionMode: MeasurePromotionMode;
  tolerance: number;
  evaluatorSource: string;
  authoritativeSource: string;
  requireReconciliationAgreement: boolean;
}

export interface MeasurePromotionConfigSummary extends MeasurePromotionConfig {
  enabledAt: string | null;
  updatedAt: string | null;
  metadata: Record<string, unknown>;
  latestReconciliationRun: ReconciliationRunSummary | null;
}

export interface ReconciliationRunSummary {
  id: number;
  periodStart: string;
  periodEnd: string;
  evaluationScope: MeasureReconciliationScope;
  promotionEligible: boolean;
  status: 'agree' | 'drift' | 'error' | 'skipped';
  agree: boolean;
  tolerance: number;
  deltas: PopulationCounts;
  computedAt: string;
}

export interface ReconcileResult {
  measureCode: string;
  measureArtifactId: number | null;
  reconciliationRunId: number | null;
  evaluationScope: MeasureReconciliationScope;
  promotionEligible: boolean;
  agree: boolean;
  status: 'agree' | 'drift';
  tolerance: number;
  promotionMode: MeasurePromotionMode;
  sql: PopulationCounts;
  cql: PopulationCounts;
  deltas: PopulationCounts;
  /** Engine software version captured from /metadata; null when unreachable. */
  engineVersion: string | null;
}

export interface UpdateMeasurePromotionConfigInput {
  measureCode: string;
  promotionMode?: MeasurePromotionMode;
  tolerance?: number;
  evaluatorSource?: string;
  requireReconciliationAgreement?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PromoteMeasureToCqlAuthoritativeInput {
  measureCode: string;
  reconciliationRunId: number;
  measureReportId: number;
  actorId?: string | null;
  qdmRunId?: string | null;
  dryRun?: boolean;
  requireFullPopulation?: boolean;
  statementTimeoutMs?: number;
}

export interface PromoteMeasureToCqlAuthoritativeResult {
  measureCode: string;
  measureArtifactId: number | null;
  reconciliationRunId: number;
  measureReportId: number;
  dryRun: boolean;
  rowsPromoted: number;
  coverage: {
    evidenceRowsSeen: number;
    evidenceRowsPromotable: number;
    distinctPatientKeys: number;
    distinctMeasureKeys: number;
    expectedInitialPopulation: number | null;
  };
  materialization: PromoteMeasureReportEvidenceToStarResult | null;
  config: MeasurePromotionConfig;
}

export class MeasurePromotionError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, statusCode = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = 'MeasurePromotionError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

interface PromotionConfigRow {
  measure_code?: string;
  measure_artifact_id: number | string | null;
  promotion_mode: MeasurePromotionMode;
  tolerance: number | string;
  evaluator_source: string;
  authoritative_source: string;
  require_reconciliation_agreement: boolean;
  enabled_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | string | null;
}

interface ReconciliationRunRow {
  id: number | string;
}

interface PromotionConfigListRow extends PromotionConfigRow {
  measure_code: string;
  latest_reconciliation_run_id: number | string | null;
  latest_period_start: string | null;
  latest_period_end: string | null;
  latest_evaluation_scope: MeasureReconciliationScope | null;
  latest_promotion_eligible: boolean | null;
  latest_status: 'agree' | 'drift' | 'error' | 'skipped' | null;
  latest_agree: boolean | null;
  latest_tolerance: number | string | null;
  latest_deltas: Record<string, unknown> | string | null;
  latest_computed_at: string | null;
}

interface PromotionConfigStateRow extends PromotionConfigRow {
  measure_code: string;
  latest_measure_artifact_id: number | string | null;
}

interface ReconciliationRunStateRow {
  id: number | string;
  measure_artifact_id: number | string | null;
  period_start: string;
  period_end: string;
  engine_measure_id: string | null;
  promotion_mode: MeasurePromotionMode;
  evaluation_scope: MeasureReconciliationScope;
  promotion_eligible: boolean;
  cql_measure_report_id: number | string | null;
  tolerance: number | string;
  agree: boolean;
  status: 'agree' | 'drift' | 'error' | 'skipped';
  cql_denominator: number | string;
  cql_numerator: number | string;
  cql_exclusion: number | string;
  delta_denominator: number | string;
  delta_numerator: number | string;
  delta_exclusion: number | string;
  deltas: Record<string, unknown> | string | null;
  computed_at: string;
}

interface MeasureReportStateRow {
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

interface EvidenceCoverageRow {
  evidence_rows_seen: number | string;
  evidence_rows_promotable: number | string;
  distinct_patient_keys: number | string;
  distinct_measure_keys: number | string;
}

interface RowsPromotedRow {
  rows_promoted: number | string;
}

export async function reconcile(
  measureCode: string,
  period: { start: string; end: string },
  opts: {
    engineUrl?: string;
    tolerance?: number;
    engineMeasureId?: string;
    persist?: boolean;
    scope?: ReconciliationScopeInput;
    cqlMeasureReportId?: number | null;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<ReconcileResult> {
  const config = await getMeasurePromotionConfig(measureCode);
  const tolerance = normalizeTolerance(opts.tolerance ?? config.tolerance);
  const scope = normalizeReconciliationScope(opts.scope);
  const engineUrl =
    opts.engineUrl ?? process.env['CQL_ENGINE_URL'] ?? 'http://cql-engine:8080/fhir';
  // The engine knows the measure by its FHIR Measure id (measure_artifact.ecqm_id),
  // which differs from the EDW measure_code (e.g. CMS122v12 vs CMS122FHIR...).
  const engineMeasureId = opts.engineMeasureId ?? measureCode;

  const sqlRows =
    scope.evaluationScope === 'scoped_subjects'
      ? await sql<PopulationCounts[]>`
        WITH target_snapshot AS (
          SELECT MAX(fr.date_key_period) AS date_key_period
          FROM phm_star.fact_measure_result fr
          JOIN phm_star.dim_measure dm ON dm.measure_key = fr.measure_key
          WHERE dm.measure_code = ${measureCode}
            AND fr.source = 'sql_bundle'
            AND fr.evaluation_scope = 'full_population'
            AND fr.reconciliation_status = 'authoritative'
        )
        SELECT
          COUNT(*) FILTER (WHERE fr.denominator_flag)::int AS denominator,
          COUNT(*) FILTER (WHERE fr.numerator_flag)::int   AS numerator,
          COUNT(*) FILTER (WHERE fr.exclusion_flag)::int   AS exclusion
        FROM phm_star.fact_measure_result fr
        JOIN phm_star.dim_measure dm ON dm.measure_key = fr.measure_key
        JOIN target_snapshot ts ON ts.date_key_period = fr.date_key_period
        JOIN phm_star.dim_patient dp ON dp.patient_key = fr.patient_key AND dp.is_current
        WHERE dm.measure_code = ${measureCode}
          AND fr.source = 'sql_bundle'
          AND fr.evaluation_scope = 'full_population'
          AND fr.reconciliation_status = 'authoritative'
          AND dp.patient_id = ANY(${scope.patientIds})
      `
      : await sql<PopulationCounts[]>`
        WITH target_snapshot AS (
          SELECT MAX(fr.date_key_period) AS date_key_period
          FROM phm_star.fact_measure_result fr
          JOIN phm_star.dim_measure dm ON dm.measure_key = fr.measure_key
          WHERE dm.measure_code = ${measureCode}
            AND fr.source = 'sql_bundle'
            AND fr.evaluation_scope = 'full_population'
            AND fr.reconciliation_status = 'authoritative'
        )
        SELECT
          COUNT(*) FILTER (WHERE fr.denominator_flag)::int AS denominator,
          COUNT(*) FILTER (WHERE fr.numerator_flag)::int   AS numerator,
          COUNT(*) FILTER (WHERE fr.exclusion_flag)::int   AS exclusion
        FROM phm_star.fact_measure_result fr
        JOIN phm_star.dim_measure dm ON dm.measure_key = fr.measure_key
        JOIN target_snapshot ts ON ts.date_key_period = fr.date_key_period
        WHERE dm.measure_code = ${measureCode}
          AND fr.source = 'sql_bundle'
          AND fr.evaluation_scope = 'full_population'
          AND fr.reconciliation_status = 'authoritative'
      `;
  const sqlPops: PopulationCounts = {
    denominator: sqlRows[0]?.denominator ?? 0,
    numerator: sqlRows[0]?.numerator ?? 0,
    exclusion: sqlRows[0]?.exclusion ?? 0,
  };

  // Capture the engine version null-safely (records null when unreachable)
  // alongside the evaluation so the reconciliation run is reproducible.
  const [capability, report] = await Promise.all([
    fetchEngineCapability(engineUrl),
    evaluateMeasure(engineUrl, engineMeasureId, {
      periodStart: period.start,
      periodEnd: period.end,
      reportType: 'population',
    }),
  ]);
  const engineVersion = capability.version;
  const p = populationsFromReport(report);
  const cqlPops: PopulationCounts = {
    denominator: p.denominator,
    numerator: p.numerator,
    exclusion: p.denominatorExclusion,
  };

  const deltas: PopulationCounts = {
    denominator: Math.abs(sqlPops.denominator - cqlPops.denominator),
    numerator: Math.abs(sqlPops.numerator - cqlPops.numerator),
    exclusion: Math.abs(sqlPops.exclusion - cqlPops.exclusion),
  };
  const agree =
    deltas.denominator <= tolerance &&
    deltas.numerator <= tolerance &&
    deltas.exclusion <= tolerance;
  const status = agree ? 'agree' : 'drift';
  const promotionEligible = scope.promotionEligible && agree;
  const reconciliationRunId =
    opts.persist === true
      ? await persistReconciliationRun({
          measureCode,
          measureArtifactId: config.measureArtifactId,
          period,
          engineMeasureId,
          engineUrl,
          promotionMode: config.promotionMode,
          tolerance,
          agree,
          status,
          sql: sqlPops,
          cql: cqlPops,
          deltas,
          report,
          scope: { ...scope, promotionEligible },
          cqlMeasureReportId: opts.cqlMeasureReportId ?? null,
          metadata: { ...(opts.metadata ?? {}), engineVersion },
        })
      : null;

  return {
    measureCode,
    measureArtifactId: config.measureArtifactId,
    reconciliationRunId,
    evaluationScope: scope.evaluationScope,
    promotionEligible,
    agree,
    status,
    tolerance,
    promotionMode: config.promotionMode,
    sql: sqlPops,
    cql: cqlPops,
    deltas,
    engineVersion,
  };
}

export async function getMeasurePromotionConfig(
  measureCode: string,
): Promise<MeasurePromotionConfig> {
  const rows = await sql<PromotionConfigRow[]>`
    SELECT
      ma.id AS measure_artifact_id,
      COALESCE(mpc.promotion_mode, 'sql_only') AS promotion_mode,
      COALESCE(mpc.tolerance, 0) AS tolerance,
      COALESCE(mpc.evaluator_source, 'qdm-cql') AS evaluator_source,
      COALESCE(mpc.authoritative_source, 'sql_bundle') AS authoritative_source,
      COALESCE(mpc.require_reconciliation_agreement, TRUE) AS require_reconciliation_agreement
    FROM (
      SELECT ${measureCode}::text AS measure_code
    ) target
    LEFT JOIN LATERAL (
      SELECT id
      FROM phm_edw.measure_artifact ma
      WHERE ma.measure_code = target.measure_code
      ORDER BY ma.reporting_period_start DESC NULLS LAST, ma.id DESC
      LIMIT 1
    ) ma ON TRUE
    LEFT JOIN phm_edw.measure_promotion_config mpc
      ON mpc.measure_code = target.measure_code
  `;
  const row = rows[0];
  return {
    measureCode,
    measureArtifactId: nullableNumber(row?.measure_artifact_id),
    promotionMode: row?.promotion_mode ?? 'sql_only',
    tolerance: normalizeTolerance(row?.tolerance ?? 0),
    evaluatorSource: row?.evaluator_source ?? 'qdm-cql',
    authoritativeSource: row?.authoritative_source ?? 'sql_bundle',
    requireReconciliationAgreement: row?.require_reconciliation_agreement ?? true,
  };
}

export async function listMeasurePromotionConfigs(
  opts: {
    measureCode?: string;
    limit?: number;
  } = {},
): Promise<MeasurePromotionConfigSummary[]> {
  const limit = normalizeLimit(opts.limit, 100);
  const measureCode = opts.measureCode?.trim() || null;
  const rows = await sql<PromotionConfigListRow[]>`
    SELECT
      mpc.measure_code,
      mpc.measure_artifact_id,
      mpc.promotion_mode,
      mpc.tolerance,
      mpc.evaluator_source,
      mpc.authoritative_source,
      mpc.require_reconciliation_agreement,
      mpc.enabled_at::text AS enabled_at,
      mpc.updated_at::text AS updated_at,
      mpc.metadata,
        latest.id AS latest_reconciliation_run_id,
        latest.period_start::text AS latest_period_start,
        latest.period_end::text AS latest_period_end,
        latest.evaluation_scope AS latest_evaluation_scope,
        latest.promotion_eligible AS latest_promotion_eligible,
        latest.status AS latest_status,
      latest.agree AS latest_agree,
      latest.tolerance AS latest_tolerance,
      latest.deltas AS latest_deltas,
      latest.computed_at::text AS latest_computed_at
    FROM phm_edw.measure_promotion_config mpc
    LEFT JOIN LATERAL (
        SELECT id, period_start, period_end, evaluation_scope, promotion_eligible, status, agree, tolerance, deltas, computed_at
      FROM phm_edw.measure_reconciliation_run mrr
      WHERE mrr.measure_code = mpc.measure_code
      ORDER BY mrr.computed_at DESC, mrr.id DESC
      LIMIT 1
    ) latest ON TRUE
    WHERE ${measureCode}::text IS NULL OR mpc.measure_code = ${measureCode}
    ORDER BY mpc.measure_code
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    ...promotionConfigFromRow(row.measure_code, row),
    enabledAt: row.enabled_at ?? null,
    updatedAt: row.updated_at ?? null,
    metadata: jsonObject(row.metadata),
    latestReconciliationRun:
      row.latest_reconciliation_run_id == null
        ? null
        : {
            id: Number(row.latest_reconciliation_run_id),
            periodStart: row.latest_period_start ?? '',
            periodEnd: row.latest_period_end ?? '',
            evaluationScope: row.latest_evaluation_scope ?? 'full_population',
            promotionEligible: row.latest_promotion_eligible ?? false,
            status: row.latest_status ?? 'skipped',
            agree: row.latest_agree ?? false,
            tolerance: normalizeTolerance(row.latest_tolerance ?? 0),
            deltas: populationCountsFromUnknown(row.latest_deltas),
            computedAt: row.latest_computed_at ?? '',
          },
  }));
}

export async function updateMeasurePromotionConfig(
  input: UpdateMeasurePromotionConfigInput,
): Promise<MeasurePromotionConfigSummary> {
  const measureCode = normalizeMeasureCode(input.measureCode);
  if (input.promotionMode !== undefined && !isMeasurePromotionMode(input.promotionMode)) {
    throw new MeasurePromotionError('INVALID_PROMOTION_MODE', 'Unsupported promotion mode', 400);
  }
  if (input.promotionMode === 'cql_authoritative') {
    throw new MeasurePromotionError(
      'PROMOTION_REQUIRES_ACCEPTED_RECONCILIATION',
      'Use the CQL authoritative promotion endpoint after an accepted reconciliation run',
      400,
    );
  }
  const tolerance = input.tolerance === undefined ? null : normalizeTolerance(input.tolerance);
  const evaluatorSource =
    input.evaluatorSource === undefined
      ? null
      : normalizeNonEmptyText(input.evaluatorSource, 'evaluatorSource', 30);
  const authoritativeSource = input.promotionMode === undefined ? null : 'sql_bundle';
  const metadata = input.metadata ?? {};

  const rows = await sql<PromotionConfigListRow[]>`
    WITH latest_artifact AS (
      SELECT id
      FROM phm_edw.measure_artifact
      WHERE measure_code = ${measureCode}
      ORDER BY reporting_period_start DESC NULLS LAST, id DESC
      LIMIT 1
    ),
    upserted AS (
      INSERT INTO phm_edw.measure_promotion_config (
        measure_code,
        measure_artifact_id,
        promotion_mode,
        tolerance,
        evaluator_source,
        authoritative_source,
        require_reconciliation_agreement,
        metadata,
        updated_at
      )
      SELECT
        ${measureCode},
        (SELECT id FROM latest_artifact),
        COALESCE(${input.promotionMode ?? null}, 'sql_only'),
        COALESCE(${tolerance}, 0),
        COALESCE(${evaluatorSource}, 'qdm-cql'),
        COALESCE(${authoritativeSource}, 'sql_bundle'),
        COALESCE(${input.requireReconciliationAgreement ?? null}, TRUE),
        ${sql.json(metadata as unknown as Parameters<typeof sql.json>[0])},
        NOW()
      ON CONFLICT (measure_code)
      DO UPDATE SET
        measure_artifact_id = COALESCE(EXCLUDED.measure_artifact_id, phm_edw.measure_promotion_config.measure_artifact_id),
        promotion_mode = COALESCE(${input.promotionMode ?? null}, phm_edw.measure_promotion_config.promotion_mode),
        tolerance = COALESCE(${tolerance}, phm_edw.measure_promotion_config.tolerance),
        evaluator_source = COALESCE(${evaluatorSource}, phm_edw.measure_promotion_config.evaluator_source),
        authoritative_source = COALESCE(${authoritativeSource}, phm_edw.measure_promotion_config.authoritative_source),
        require_reconciliation_agreement = COALESCE(
          ${input.requireReconciliationAgreement ?? null},
          phm_edw.measure_promotion_config.require_reconciliation_agreement
        ),
        metadata = phm_edw.measure_promotion_config.metadata || EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *
    )
    SELECT
      upserted.measure_code,
      upserted.measure_artifact_id,
      upserted.promotion_mode,
      upserted.tolerance,
      upserted.evaluator_source,
      upserted.authoritative_source,
      upserted.require_reconciliation_agreement,
      upserted.enabled_at::text AS enabled_at,
      upserted.updated_at::text AS updated_at,
      upserted.metadata,
        latest.id AS latest_reconciliation_run_id,
        latest.period_start::text AS latest_period_start,
        latest.period_end::text AS latest_period_end,
        latest.evaluation_scope AS latest_evaluation_scope,
        latest.promotion_eligible AS latest_promotion_eligible,
        latest.status AS latest_status,
      latest.agree AS latest_agree,
      latest.tolerance AS latest_tolerance,
      latest.deltas AS latest_deltas,
      latest.computed_at::text AS latest_computed_at
    FROM upserted
    LEFT JOIN LATERAL (
        SELECT id, period_start, period_end, evaluation_scope, promotion_eligible, status, agree, tolerance, deltas, computed_at
      FROM phm_edw.measure_reconciliation_run mrr
      WHERE mrr.measure_code = upserted.measure_code
      ORDER BY mrr.computed_at DESC, mrr.id DESC
      LIMIT 1
    ) latest ON TRUE
  `;

  return listRowToSummary(rows[0]!);
}

export async function promoteMeasureToCqlAuthoritative(
  input: PromoteMeasureToCqlAuthoritativeInput,
): Promise<PromoteMeasureToCqlAuthoritativeResult> {
  const measureCode = normalizeMeasureCode(input.measureCode);
  const reconciliationRunId = normalizePositiveInt(
    input.reconciliationRunId,
    'reconciliationRunId',
  );
  const measureReportId = normalizePositiveInt(input.measureReportId, 'measureReportId');
  const dryRun = input.dryRun === true;
  const requireFullPopulation = input.requireFullPopulation !== false;

  return sql.begin(async (tx) => {
    const [configRow] = await tx.unsafe<PromotionConfigStateRow[]>(
      `
      SELECT
        mpc.measure_code,
        mpc.measure_artifact_id,
        mpc.promotion_mode,
        mpc.tolerance,
        mpc.evaluator_source,
        mpc.authoritative_source,
        mpc.require_reconciliation_agreement,
        mpc.enabled_at::text AS enabled_at,
        mpc.updated_at::text AS updated_at,
        mpc.metadata,
        latest_artifact.id AS latest_measure_artifact_id
      FROM phm_edw.measure_promotion_config mpc
      LEFT JOIN LATERAL (
        SELECT id
        FROM phm_edw.measure_artifact ma
        WHERE ma.measure_code = mpc.measure_code
        ORDER BY ma.reporting_period_start DESC NULLS LAST, ma.id DESC
        LIMIT 1
      ) latest_artifact ON TRUE
      WHERE mpc.measure_code = $1
      FOR UPDATE OF mpc
      `,
      [measureCode],
    );
    if (!configRow) {
      throw new MeasurePromotionError(
        'PROMOTION_CONFIG_NOT_FOUND',
        `No promotion config exists for ${measureCode}`,
        404,
      );
    }
    const config = promotionConfigFromRow(measureCode, configRow);
    if (config.promotionMode === 'manual_hold') {
      throw new MeasurePromotionError(
        'PROMOTION_MANUAL_HOLD',
        `${measureCode} is on manual hold and cannot be promoted automatically`,
        409,
      );
    }
    if (config.promotionMode === 'sql_only') {
      throw new MeasurePromotionError(
        'PROMOTION_REQUIRES_CQL_SHADOW',
        `${measureCode} must be moved to cql_shadow before CQL can become authoritative`,
        409,
      );
    }
    if (config.evaluatorSource === 'sql_bundle') {
      throw new MeasurePromotionError(
        'INVALID_EVALUATOR_SOURCE',
        'CQL authoritative promotion requires a non-SQL evaluator source',
        409,
      );
    }

    const latestArtifactId = nullableNumber(configRow.latest_measure_artifact_id);
    if (
      latestArtifactId != null &&
      config.measureArtifactId != null &&
      latestArtifactId !== config.measureArtifactId
    ) {
      throw new MeasurePromotionError(
        'STALE_MEASURE_ARTIFACT',
        `${measureCode} promotion config does not reference the latest measure artifact`,
        409,
        { configuredArtifactId: config.measureArtifactId, latestArtifactId },
      );
    }

    const [run] = await tx.unsafe<ReconciliationRunStateRow[]>(
      `
      SELECT
        id,
        measure_artifact_id,
        period_start::text AS period_start,
        period_end::text AS period_end,
        engine_measure_id,
        promotion_mode,
        evaluation_scope,
        promotion_eligible,
        cql_measure_report_id,
        tolerance,
        agree,
        status,
        cql_denominator,
        cql_numerator,
        cql_exclusion,
        delta_denominator,
        delta_numerator,
        delta_exclusion,
        deltas,
        computed_at::text AS computed_at
      FROM phm_edw.measure_reconciliation_run
      WHERE id = $1
        AND measure_code = $2
      FOR UPDATE
      `,
      [reconciliationRunId, measureCode],
    );
    if (!run) {
      throw new MeasurePromotionError(
        'RECONCILIATION_RUN_NOT_FOUND',
        `No reconciliation run ${reconciliationRunId} exists for ${measureCode}`,
        404,
      );
    }
    if (run.evaluation_scope !== 'full_population' || !run.promotion_eligible) {
      throw new MeasurePromotionError(
        'RECONCILIATION_NOT_PROMOTION_ELIGIBLE',
        'Only full-population, promotion-eligible reconciliation runs can promote CQL results',
        409,
        { evaluationScope: run.evaluation_scope, promotionEligible: run.promotion_eligible },
      );
    }
    const runMeasureReportId = nullableNumber(run.cql_measure_report_id);
    if (runMeasureReportId != null && runMeasureReportId !== measureReportId) {
      throw new MeasurePromotionError(
        'RECONCILIATION_MEASURE_REPORT_MISMATCH',
        'Selected MeasureReport does not match the MeasureReport used by the reconciliation run',
        409,
        { reconciliationMeasureReportId: runMeasureReportId, measureReportId },
      );
    }
    const runArtifactId = nullableNumber(run.measure_artifact_id);
    if (
      config.measureArtifactId != null &&
      runArtifactId != null &&
      config.measureArtifactId !== runArtifactId
    ) {
      throw new MeasurePromotionError(
        'RECONCILIATION_ARTIFACT_MISMATCH',
        'Reconciliation run does not match the configured measure artifact',
        409,
        { configuredArtifactId: config.measureArtifactId, runArtifactId },
      );
    }
    const runDeltas = {
      denominator: Number(run.delta_denominator),
      numerator: Number(run.delta_numerator),
      exclusion: Number(run.delta_exclusion),
    };
    const runTolerance = normalizeTolerance(run.tolerance);
    const withinTolerance =
      runDeltas.denominator <= runTolerance &&
      runDeltas.numerator <= runTolerance &&
      runDeltas.exclusion <= runTolerance;
    if (!run.agree || run.status !== 'agree' || !withinTolerance) {
      throw new MeasurePromotionError(
        'RECONCILIATION_NOT_ACCEPTED',
        'Only accepted reconciliation runs can promote CQL results to authoritative analytics',
        409,
        { status: run.status, agree: run.agree, deltas: runDeltas, tolerance: runTolerance },
      );
    }

    const [report] = await tx.unsafe<MeasureReportStateRow[]>(
      `
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
      WHERE id = $1
      `,
      [measureReportId],
    );
    if (!report) {
      throw new MeasurePromotionError(
        'MEASURE_REPORT_NOT_FOUND',
        `No persisted MeasureReport ${measureReportId} exists`,
        404,
      );
    }
    if (report.measure_code !== measureCode) {
      throw new MeasurePromotionError(
        'MEASURE_REPORT_CODE_MISMATCH',
        'MeasureReport does not match the requested measure code',
        409,
        { reportMeasureCode: report.measure_code, measureCode },
      );
    }
    if (report.period_start !== run.period_start || report.period_end !== run.period_end) {
      throw new MeasurePromotionError(
        'MEASURE_REPORT_PERIOD_MISMATCH',
        'MeasureReport period does not match the accepted reconciliation run',
        409,
        {
          reportPeriod: { start: report.period_start, end: report.period_end },
          reconciliationPeriod: { start: run.period_start, end: run.period_end },
        },
      );
    }
    if (report.report_type !== 'population') {
      throw new MeasurePromotionError(
        'MEASURE_REPORT_NOT_POPULATION',
        'CQL authoritative promotion requires a population MeasureReport',
        409,
        { reportType: report.report_type },
      );
    }
    const reportCounts = {
      denominator: Number(report.denominator ?? 0),
      numerator: Number(report.numerator ?? 0),
      exclusion: Number(report.denominator_exclusion ?? 0),
    };
    const runCqlCounts = {
      denominator: Number(run.cql_denominator),
      numerator: Number(run.cql_numerator),
      exclusion: Number(run.cql_exclusion),
    };
    if (
      reportCounts.denominator !== runCqlCounts.denominator ||
      reportCounts.numerator !== runCqlCounts.numerator ||
      reportCounts.exclusion !== runCqlCounts.exclusion
    ) {
      throw new MeasurePromotionError(
        'MEASURE_REPORT_RECONCILIATION_COUNT_MISMATCH',
        'MeasureReport counts do not match the accepted reconciliation run CQL counts',
        409,
        { reportCounts, runCqlCounts },
      );
    }

    const [coverageRow] = await tx.unsafe<EvidenceCoverageRow[]>(
      `
      SELECT
        COUNT(*)::int AS evidence_rows_seen,
        COUNT(*) FILTER (
          WHERE mre.patient_key IS NOT NULL
            AND mre.measure_key IS NOT NULL
            AND dd.date_key IS NOT NULL
        )::int AS evidence_rows_promotable,
        COUNT(DISTINCT mre.patient_key)::int AS distinct_patient_keys,
        COUNT(DISTINCT mre.measure_key)::int AS distinct_measure_keys
      FROM phm_edw.measure_report_evidence mre
      LEFT JOIN phm_star.dim_date dd
        ON dd.full_date = mre.period_end
      WHERE mre.measure_report_id = $1
        AND mre.measure_code = $2
        AND mre.period_start = $3::date
        AND mre.period_end = $4::date
      `,
      [measureReportId, measureCode, run.period_start, run.period_end],
    );
    const coverage = {
      evidenceRowsSeen: Number(coverageRow?.evidence_rows_seen ?? 0),
      evidenceRowsPromotable: Number(coverageRow?.evidence_rows_promotable ?? 0),
      distinctPatientKeys: Number(coverageRow?.distinct_patient_keys ?? 0),
      distinctMeasureKeys: Number(coverageRow?.distinct_measure_keys ?? 0),
      expectedInitialPopulation: nullableNonnegativeInteger(report.initial_population),
    };
    if (coverage.evidenceRowsSeen <= 0) {
      throw new MeasurePromotionError(
        'NO_MEASURE_REPORT_EVIDENCE',
        'CQL authoritative promotion requires persisted patient-level MeasureReport evidence',
        409,
      );
    }
    if (coverage.evidenceRowsSeen !== coverage.evidenceRowsPromotable) {
      throw new MeasurePromotionError(
        'INCOMPLETE_MEASURE_REPORT_EVIDENCE',
        'All MeasureReport evidence rows must resolve patient, measure, and period dimensions before promotion',
        409,
        coverage,
      );
    }
    if (coverage.distinctMeasureKeys !== 1) {
      throw new MeasurePromotionError(
        'MEASURE_REPORT_EVIDENCE_MIXED_MEASURES',
        'MeasureReport evidence must resolve to one star-schema measure key',
        409,
        coverage,
      );
    }
    if (
      requireFullPopulation &&
      coverage.expectedInitialPopulation != null &&
      coverage.evidenceRowsSeen < coverage.expectedInitialPopulation
    ) {
      throw new MeasurePromotionError(
        'MEASURE_REPORT_EVIDENCE_NOT_FULL_POPULATION',
        'Patient-level evidence does not cover the MeasureReport initial population',
        409,
        coverage,
      );
    }

    if (dryRun) {
      return {
        measureCode,
        measureArtifactId: config.measureArtifactId,
        reconciliationRunId,
        measureReportId,
        dryRun,
        rowsPromoted: 0,
        coverage,
        materialization: null,
        config,
      };
    }

    const deltas = populationCountsFromUnknown(run.deltas);
    const materialization = await promoteMeasureReportEvidenceToStarInTransaction(tx, {
      measureReportId,
      starSource: config.evaluatorSource,
      evaluationScope: 'full_population',
      qdmRunId: input.qdmRunId ?? null,
      reconciliationStatus: 'cql_shadow',
      reconciliationDelta: deltas as unknown as Record<string, unknown>,
      statementTimeoutMs: input.statementTimeoutMs,
    });

    const [promoted] = await tx.unsafe<RowsPromotedRow[]>(
      `
      WITH promoted AS (
        UPDATE phm_star.fact_measure_result fmr
        SET
          reconciliation_status = 'authoritative',
          reconciliation_delta = $5::jsonb,
          promoted_at = NOW()
        FROM phm_star.dim_measure dm,
             phm_star.dim_date dd
        WHERE fmr.measure_key = dm.measure_key
          AND fmr.date_key_period = dd.date_key
          AND dm.measure_code = $1
          AND dd.full_date = $2::date
          AND fmr.measure_report_id = $3
          AND fmr.source = $4
          AND fmr.evaluation_scope = 'full_population'
        RETURNING 1
      )
      SELECT COUNT(*)::int AS rows_promoted FROM promoted
      `,
      [
        measureCode,
        run.period_end,
        measureReportId,
        config.evaluatorSource,
        deltas as unknown as NonNullable<Parameters<typeof tx.unsafe>[1]>[number],
      ],
    );
    const rowsPromoted = Number(promoted?.rows_promoted ?? 0);
    if (rowsPromoted <= 0) {
      throw new MeasurePromotionError(
        'NO_CQL_ROWS_PROMOTED',
        'No CQL star rows were promoted to authoritative status',
        409,
      );
    }

    const promotionMetadata = {
      reconciliationRunId,
      measureReportId,
      actorId: input.actorId ?? null,
      previousPromotionMode: config.promotionMode,
      previousAuthoritativeSource: config.authoritativeSource,
      rowsPromoted,
      coverage,
    };
    const [updatedConfigRow] = await tx.unsafe<PromotionConfigStateRow[]>(
      `
      UPDATE phm_edw.measure_promotion_config
      SET
        promotion_mode = 'cql_authoritative',
        authoritative_source = $2,
        enabled_at = COALESCE(enabled_at, NOW()),
        updated_at = NOW(),
        metadata = metadata || $3::jsonb
      WHERE measure_code = $1
      RETURNING
        measure_code,
        measure_artifact_id,
        promotion_mode,
        tolerance,
        evaluator_source,
        authoritative_source,
        require_reconciliation_agreement,
        enabled_at::text AS enabled_at,
        updated_at::text AS updated_at,
        metadata,
        measure_artifact_id AS latest_measure_artifact_id
      `,
      [
        measureCode,
        config.evaluatorSource,
        { latestPromotion: promotionMetadata } as unknown as NonNullable<
          Parameters<typeof tx.unsafe>[1]
        >[number],
      ],
    );
    await tx.unsafe(
      `
      UPDATE phm_edw.measure_reconciliation_run
      SET
        measure_report_id = $2,
        promoted_at = NOW(),
        promoted_by = $3::uuid,
        promotion_metadata = promotion_metadata || $4::jsonb
      WHERE id = $1
      `,
      [
        reconciliationRunId,
        measureReportId,
        input.actorId ?? null,
        promotionMetadata as unknown as NonNullable<Parameters<typeof tx.unsafe>[1]>[number],
      ],
    );

    return {
      measureCode,
      measureArtifactId: config.measureArtifactId,
      reconciliationRunId,
      measureReportId,
      dryRun,
      rowsPromoted,
      coverage,
      materialization,
      config: promotionConfigFromRow(measureCode, updatedConfigRow ?? configRow),
    };
  });
}

async function persistReconciliationRun(input: {
  measureCode: string;
  measureArtifactId: number | null;
  period: { start: string; end: string };
  engineMeasureId: string;
  engineUrl: string;
  promotionMode: MeasurePromotionMode;
  tolerance: number;
  agree: boolean;
  status: 'agree' | 'drift';
  sql: PopulationCounts;
  cql: PopulationCounts;
  deltas: PopulationCounts;
  report: FhirMeasureReport;
  scope: NormalizedReconciliationScope;
  cqlMeasureReportId: number | null;
  metadata: Record<string, unknown>;
}): Promise<number> {
  const rows = await sql<ReconciliationRunRow[]>`
    INSERT INTO phm_edw.measure_reconciliation_run (
      measure_code,
      measure_artifact_id,
        period_start,
        period_end,
        engine_measure_id,
        engine_url,
        promotion_mode,
        evaluation_scope,
        scope_patient_ids,
        scope_patient_refs,
        promotion_eligible,
        cql_measure_report_id,
        tolerance,
      agree,
      status,
      sql_denominator,
      sql_numerator,
      sql_exclusion,
      cql_denominator,
      cql_numerator,
      cql_exclusion,
      delta_denominator,
      delta_numerator,
      delta_exclusion,
      sql_counts,
      cql_counts,
      deltas,
      fhir_measure_report,
      metadata
    )
    VALUES (
      ${input.measureCode},
      ${input.measureArtifactId},
        ${input.period.start},
        ${input.period.end},
        ${input.engineMeasureId},
        ${input.engineUrl},
        ${input.promotionMode},
        ${input.scope.evaluationScope},
        ${input.scope.patientIds},
        ${input.scope.patientRefs},
        ${input.scope.promotionEligible},
        ${input.cqlMeasureReportId},
        ${input.tolerance},
      ${input.agree},
      ${input.status},
      ${input.sql.denominator},
      ${input.sql.numerator},
      ${input.sql.exclusion},
      ${input.cql.denominator},
      ${input.cql.numerator},
      ${input.cql.exclusion},
      ${input.deltas.denominator},
      ${input.deltas.numerator},
      ${input.deltas.exclusion},
      ${sql.json(input.sql as unknown as Parameters<typeof sql.json>[0])},
      ${sql.json(input.cql as unknown as Parameters<typeof sql.json>[0])},
      ${sql.json(input.deltas as unknown as Parameters<typeof sql.json>[0])},
      ${sql.json(input.report as unknown as Parameters<typeof sql.json>[0])},
      ${sql.json(input.metadata as unknown as Parameters<typeof sql.json>[0])}
    )
    RETURNING id
  `;
  return Number(rows[0]?.id ?? 0);
}

function normalizeTolerance(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeReconciliationScope(
  input: ReconciliationScopeInput | undefined,
): NormalizedReconciliationScope {
  const explicitScope = input?.evaluationScope;
  const patientRefs = normalizeStrings(input?.patientRefs ?? []);
  const patientIds = normalizePositiveInts([
    ...(input?.patientIds ?? []),
    ...patientRefs.flatMap((ref) => {
      const match = /^Patient\/(\d+)$/i.exec(ref.trim());
      return match ? [Number(match[1])] : [];
    }),
  ]);
  const inferredScope: MeasureReconciliationScope =
    patientIds.length > 0 || patientRefs.length > 0 ? 'scoped_subjects' : 'full_population';
  const evaluationScope = explicitScope ?? inferredScope;
  if (evaluationScope === 'scoped_subjects' && patientIds.length === 0) {
    throw new MeasurePromotionError(
      'INVALID_RECONCILIATION_SCOPE',
      'Scoped reconciliation requires patientIds or numeric Patient/{id} refs',
      400,
    );
  }
  const promotionEligible =
    evaluationScope === 'full_population' ? input?.promotionEligible === true : false;
  return { evaluationScope, patientIds, patientRefs, promotionEligible };
}

function normalizePositiveInts(values: readonly number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isSafeInteger(value) && value > 0)));
}

function normalizeStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (!Number.isSafeInteger(value) || value === undefined || value <= 0) return fallback;
  return Math.min(value, 500);
}

function normalizePositiveInt(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new MeasurePromotionError('INVALID_INPUT', `${field} must be a positive integer`, 400);
  }
  return value;
}

function normalizeMeasureCode(value: string): string {
  return normalizeNonEmptyText(value, 'measureCode', 120);
}

function normalizeNonEmptyText(value: string, field: string, maxLength: number): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new MeasurePromotionError('INVALID_INPUT', `${field} is required`, 400);
  }
  if (trimmed.length > maxLength) {
    throw new MeasurePromotionError(
      'INVALID_INPUT',
      `${field} must be ${maxLength} characters or fewer`,
      400,
    );
  }
  return trimmed;
}

function isMeasurePromotionMode(value: string): value is MeasurePromotionMode {
  return ['sql_only', 'cql_shadow', 'cql_authoritative', 'manual_hold'].includes(value);
}

function nullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nullableNonnegativeInteger(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function promotionConfigFromRow(
  measureCode: string,
  row: PromotionConfigRow,
): MeasurePromotionConfig {
  return {
    measureCode,
    measureArtifactId: nullableNumber(row.measure_artifact_id),
    promotionMode: row.promotion_mode ?? 'sql_only',
    tolerance: normalizeTolerance(row.tolerance ?? 0),
    evaluatorSource: row.evaluator_source ?? 'qdm-cql',
    authoritativeSource: row.authoritative_source ?? 'sql_bundle',
    requireReconciliationAgreement: row.require_reconciliation_agreement ?? true,
  };
}

function listRowToSummary(row: PromotionConfigListRow): MeasurePromotionConfigSummary {
  return {
    ...promotionConfigFromRow(row.measure_code, row),
    enabledAt: row.enabled_at ?? null,
    updatedAt: row.updated_at ?? null,
    metadata: jsonObject(row.metadata),
    latestReconciliationRun:
      row.latest_reconciliation_run_id == null
        ? null
        : {
            id: Number(row.latest_reconciliation_run_id),
            periodStart: row.latest_period_start ?? '',
            periodEnd: row.latest_period_end ?? '',
            evaluationScope: row.latest_evaluation_scope ?? 'full_population',
            promotionEligible: row.latest_promotion_eligible ?? false,
            status: row.latest_status ?? 'skipped',
            agree: row.latest_agree ?? false,
            tolerance: normalizeTolerance(row.latest_tolerance ?? 0),
            deltas: populationCountsFromUnknown(row.latest_deltas),
            computedAt: row.latest_computed_at ?? '',
          },
  };
}

function populationCountsFromUnknown(value: unknown): PopulationCounts {
  const object = jsonObject(value);
  return {
    denominator: Number(object.denominator ?? object.delta_denominator ?? 0),
    numerator: Number(object.numerator ?? object.delta_numerator ?? 0),
    exclusion: Number(object.exclusion ?? object.delta_exclusion ?? 0),
  };
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
  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
