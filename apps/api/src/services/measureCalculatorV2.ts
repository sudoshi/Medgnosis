// =============================================================================
// Medgnosis API — Measure Calculator v2
// Aggregates fact_patient_bundle_detail → fact_measure_result + strata.
// Replaces the old measureEngine.ts (45 broken SQL files).
//
// eCQM accounting (CMS semantics — regression-gated, do not weaken):
//   denominator = gap_status IN ('open','closed')   — excluded NOT in denom
//   numerator   = gap_status = 'closed'             — subset of denominator
//   excluded    = gap_status = 'excluded'           — in NEITHER denom NOR numer
// =============================================================================

import { sql } from '@medgnosis/db';
import { wilsonCI } from './wilsonCI.js';

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
  ci_lower: number | null;
  ci_upper: number | null;
}

/**
 * Refresh fact_measure_result AND fact_measure_strata in one transaction —
 * a failed INSERT rolls back both TRUNCATEs; facts and strata never diverge.
 * SET LOCAL scopes the statement timeout to the transaction — no pool leak.
 */
export async function refreshMeasureResults(): Promise<RefreshResult> {
  const t0 = performance.now();

  const result = await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL statement_timeout = '60s'");
    await tx.unsafe('TRUNCATE phm_star.fact_measure_result');
    const inserted = await tx.unsafe(`
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

    // Single-pass stratification: GROUPING(a, b) sets a bit per UN-grouped
    // column, so () -> 3 = headline, (age_band) -> 1, (gender) -> 2.
    await tx.unsafe('TRUNCATE phm_star.fact_measure_strata');
    await tx.unsafe(`
      INSERT INTO phm_star.fact_measure_strata
        (measure_key, date_key_period, dimension, stratum,
         denominator, numerator, excluded)
      SELECT
        c.measure_key,
        c.date_key_period,
        CASE GROUPING(c.age_band, c.gender)
          WHEN 3 THEN 'all'
          WHEN 1 THEN 'age_band'
          WHEN 2 THEN 'gender'
        END,
        CASE GROUPING(c.age_band, c.gender)
          WHEN 3 THEN 'all'
          WHEN 1 THEN c.age_band
          WHEN 2 THEN c.gender
        END,
        COUNT(*) FILTER (WHERE c.denominator_flag)::int,
        COUNT(*) FILTER (WHERE c.numerator_flag)::int,
        COUNT(*) FILTER (WHERE c.exclusion_flag)::int
      FROM (
        SELECT
          fmr.measure_key,
          fmr.date_key_period,
          CASE
            WHEN dp.date_of_birth IS NULL THEN 'unknown'
            WHEN dp.date_of_birth > CURRENT_DATE - INTERVAL '18 years' THEN '<18'
            WHEN dp.date_of_birth > CURRENT_DATE - INTERVAL '40 years' THEN '18-39'
            WHEN dp.date_of_birth > CURRENT_DATE - INTERVAL '65 years' THEN '40-64'
            ELSE '65+'
          END AS age_band,
          COALESCE(NULLIF(TRIM(dp.gender), ''), 'unknown') AS gender,
          fmr.denominator_flag,
          fmr.numerator_flag,
          fmr.exclusion_flag
        FROM phm_star.fact_measure_result fmr
        JOIN phm_star.dim_patient dp
          ON dp.patient_key = fmr.patient_key AND dp.is_current
      ) c
      GROUP BY GROUPING SETS (
        (c.measure_key, c.date_key_period),
        (c.measure_key, c.date_key_period, c.age_band),
        (c.measure_key, c.date_key_period, c.gender)
      )
    `);

    return inserted;
  });

  const durationMs = Math.round(performance.now() - t0);
  const rowCount = result.count ?? 0;

  console.info(`[measure-calc-v2] Refreshed fact_measure_result: ${rowCount} rows in ${durationMs}ms`);
  return { rowCount, durationMs };
}

/**
 * Per-measure performance summary with Wilson 95% CIs (percent, 1 decimal).
 * Small panels always show the interval — never gate on population size.
 */
export async function getMeasureSummary(): Promise<MeasureSummaryRow[]> {
  const rows = await sql<Omit<MeasureSummaryRow, 'ci_lower' | 'ci_upper'>[]>`
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

  return rows.map((row) => {
    if (row.eligible <= 0) {
      return { ...row, ci_lower: null, ci_upper: null };
    }
    const ci = wilsonCI(row.met, row.eligible);
    return {
      ...row,
      ci_lower: Math.round(ci.lower * 1000) / 10,
      ci_upper: Math.round(ci.upper * 1000) / 10,
    };
  });
}
