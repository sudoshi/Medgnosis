// =============================================================================
// Medgnosis API - QDM evidence decoration for star facts
// Adds QDM lineage to stable star fact grains without changing measure math.
// =============================================================================

import { sql } from '@medgnosis/db';

export const QDM_STAR_DECORATOR_EVALUATOR = 'qdm-star-decoration-v1';

export interface DecorateQdmBundleDetailEvidenceInput {
  periodStart: string;
  periodEnd: string;
  measureCodes?: readonly string[];
}

export interface DecorateQdmBundleDetailEvidenceResult {
  rowCount: number;
}

export async function decorateQdmBundleDetailEvidence(
  input: DecorateQdmBundleDetailEvidenceInput,
): Promise<DecorateQdmBundleDetailEvidenceResult> {
  const period = normalizePeriod(input.periodStart, input.periodEnd);
  const measureCodes = normalizeMeasureCodes(input.measureCodes);

  const rows = await sql.begin(async (tx) =>
    tx.unsafe<{ row_count: number | string }[]>(
      `
      WITH scoped_detail AS (
        SELECT
          d.detail_key,
          d.patient_key,
          d.measure_key,
          dp.patient_id,
          dm.measure_id,
          dm.measure_code
        FROM phm_star.fact_patient_bundle_detail d
        JOIN phm_star.dim_patient dp
          ON dp.patient_key = d.patient_key
         AND dp.is_current = TRUE
        JOIN phm_star.dim_measure dm
          ON dm.measure_key = d.measure_key
        WHERE lower(d.gap_status) = 'excluded'
          AND (
            $1::jsonb IS NULL
            OR dm.measure_code IN (SELECT jsonb_array_elements_text($1::jsonb))
          )
      ),
      candidate_evidence AS (
        SELECT DISTINCT
          sd.detail_key,
          sd.patient_key,
          sd.measure_key,
          qe.qdm_event_id,
          mv.value_set_oid,
          vc.code_system AS matched_code_system,
          qe.code AS matched_code
        FROM scoped_detail sd
        JOIN phm_edw.measure_value_set mv
          ON mv.measure_id = sd.measure_id
         AND mv.population_role = 'denominator_exclusion'
        JOIN phm_edw.vsac_value_set_code vc
          ON vc.value_set_oid = mv.value_set_oid
        JOIN phm_edw.qdm_event qe
          ON qe.patient_id = sd.patient_id
         AND qe.code = vc.code
         AND CASE lower(coalesce(qe.code_system, ''))
               WHEN 'http://snomed.info/sct' THEN 'SNOMEDCT'
               WHEN 'snomed' THEN 'SNOMEDCT'
               WHEN 'snomedct' THEN 'SNOMEDCT'
               WHEN 'http://loinc.org' THEN 'LOINC'
               WHEN 'loinc' THEN 'LOINC'
               WHEN 'http://www.nlm.nih.gov/research/umls/rxnorm' THEN 'RXNORM'
               WHEN 'rxnorm' THEN 'RXNORM'
               ELSE qe.code_system
             END = vc.code_system
        WHERE (qe.relevant_start_at IS NULL OR qe.relevant_start_at::date <= $3::date)
          AND (qe.relevant_end_at IS NULL OR qe.relevant_end_at::date >= $2::date)
      ),
      upserted AS (
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
          'phm_star.fact_patient_bundle_detail',
          detail_key,
          'supporting',
          'denominator_exclusion',
          value_set_oid,
          matched_code_system,
          matched_code,
          $4,
          0.95,
          jsonb_build_object(
            'periodStart', $2::date,
            'periodEnd', $3::date,
            'measureScope', COALESCE($1::jsonb, '[]'::jsonb)
          )
        FROM candidate_evidence
        ON CONFLICT ON CONSTRAINT uq_bqse_event_fact_role
        DO UPDATE SET
          value_set_oid = EXCLUDED.value_set_oid,
          matched_code_system = EXCLUDED.matched_code_system,
          matched_code = EXCLUDED.matched_code,
          confidence = EXCLUDED.confidence,
          evaluator = EXCLUDED.evaluator,
          evidence_at = NOW(),
          metadata = EXCLUDED.metadata
        RETURNING 1
      )
      SELECT COUNT(*)::int AS row_count FROM upserted
      `,
      [
        measureCodes.length > 0 ? measureCodes : null,
        period.start,
        period.end,
        QDM_STAR_DECORATOR_EVALUATOR,
      ],
    ),
  );

  return { rowCount: Number(rows[0]?.row_count ?? 0) };
}

function normalizePeriod(periodStart: string, periodEnd: string): { start: string; end: string } {
  const start = periodStart.trim();
  const end = periodEnd.trim();
  if (!start || !end) {
    throw new Error('QDM star evidence decoration requires periodStart and periodEnd');
  }
  if (Date.parse(start) > Date.parse(end)) {
    throw new Error('QDM star evidence decoration periodEnd must be on or after periodStart');
  }
  return { start, end };
}

function normalizeMeasureCodes(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}
