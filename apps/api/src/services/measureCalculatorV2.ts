// =============================================================================
// Medgnosis API — Measure Calculator v2
// Aggregates fact_patient_bundle_detail → fact_measure_result.
// Replaces the old measureEngine.ts (45 broken SQL files).
// =============================================================================

import { sql } from '@medgnosis/db';

export interface RefreshResult {
  rowCount: number;
  durationMs: number;
}

export interface MeasureSummaryRow {
  measure_key: number;
  measure_code: string;
  measure_name: string;
  eligible: number;
  met: number;
  excluded: number;
  performance_rate: number | null;
}

/**
 * Refresh fact_measure_result by aggregating fact_patient_bundle_detail.
 * Runs inside a transaction so a failed INSERT rolls back the TRUNCATE.
 * SET LOCAL scopes the statement timeout to the transaction — no pool leak.
 */
export async function refreshMeasureResults(): Promise<RefreshResult> {
  const t0 = performance.now();

  const result = await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL statement_timeout = '30s'");
    await tx.unsafe('TRUNCATE phm_star.fact_measure_result');
    return tx.unsafe(`
      INSERT INTO phm_star.fact_measure_result
        (patient_key, measure_key, date_key_period,
         denominator_flag, numerator_flag, exclusion_flag,
         measure_value, count_measure)
      SELECT
        d.patient_key,
        d.measure_key,
        (SELECT date_key FROM phm_star.dim_date WHERE full_date = CURRENT_DATE),
        LOWER(d.gap_status) IN ('open', 'closed'),
        LOWER(d.gap_status) = 'closed',
        LOWER(d.gap_status) = 'excluded',
        NULL,
        1
      FROM phm_star.fact_patient_bundle_detail d
    `);
  });

  const durationMs = Math.round(performance.now() - t0);
  const rowCount = result.count ?? 0;

  console.info(`[measure-calc-v2] Refreshed fact_measure_result: ${rowCount} rows in ${durationMs}ms`);
  return { rowCount, durationMs };
}

/**
 * Return per-measure performance summary from fact_measure_result.
 */
export async function getMeasureSummary(): Promise<MeasureSummaryRow[]> {
  return sql<MeasureSummaryRow[]>`
    SELECT
      dm.measure_key,
      dm.measure_code,
      dm.measure_name,
      COUNT(*) FILTER (WHERE fmr.denominator_flag)::int AS eligible,
      COUNT(*) FILTER (WHERE fmr.numerator_flag)::int AS met,
      COUNT(*) FILTER (WHERE fmr.exclusion_flag)::int AS excluded,
      ROUND(
        COUNT(*) FILTER (WHERE fmr.numerator_flag)::numeric /
        NULLIF(COUNT(*) FILTER (WHERE fmr.denominator_flag), 0) * 100, 1
      ) AS performance_rate
    FROM phm_star.fact_measure_result fmr
    JOIN phm_star.dim_measure dm ON dm.measure_key = fmr.measure_key
    GROUP BY dm.measure_key, dm.measure_code, dm.measure_name
    ORDER BY dm.measure_code
  `;
}
