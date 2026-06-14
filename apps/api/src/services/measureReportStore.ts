// =============================================================================
// Medgnosis API — FHIR MeasureReport persistence (phm_edw.measure_report)
// Persists the FHIR MeasureReport produced by the clinical-reasoning engine
// ($evaluate-measure) keyed by measure_code + period + report type, with the
// population counts denormalized for fast rollup into fact_measure_result and
// the measure dossier. SQL remains the authoritative MEASURE_EVALUATOR; this is
// the durable record of what the CQL engine computed (Phase 2 Epic B).
// =============================================================================

import { sql } from '@medgnosis/db';
import { populationsFromReport, type FhirMeasureReport } from './fhir/cqlEngineClient.js';

export type ReportType = 'subject' | 'subject-list' | 'population';

export interface PersistedMeasureReport {
  measure_code: string;
  period_start: string;
  period_end: string;
  report_type: ReportType;
  report: FhirMeasureReport;
  measure_score: number | null;
  initial_population: number;
  denominator: number;
  numerator: number;
  denominator_exclusion: number;
  source: string;
  computed_at: string;
}

export interface PersistOptions {
  reportType?: ReportType;
  source?: string;
}

/**
 * Upsert a MeasureReport for (measure_code, period, report_type). Re-running an
 * evaluation overwrites the prior row for the same key and stamps computed_at.
 * Returns the row id.
 */
export async function persistMeasureReport(
  measureCode: string,
  period: { start: string; end: string },
  report: FhirMeasureReport,
  opts: PersistOptions = {},
): Promise<number> {
  const reportType: ReportType = opts.reportType ?? 'population';
  const source = opts.source ?? 'cql';
  const p = populationsFromReport(report);
  const score = report.group?.[0]?.measureScore?.value ?? null;

  const rows = await sql<{ id: number }[]>`
    INSERT INTO phm_edw.measure_report
      (measure_code, period_start, period_end, report_type, report, measure_score,
       initial_population, denominator, numerator, denominator_exclusion, source)
    VALUES (
      ${measureCode}, ${period.start}, ${period.end}, ${reportType},
      ${sql.json(report as unknown as Parameters<typeof sql.json>[0])}, ${score},
      ${p.initialPopulation}, ${p.denominator}, ${p.numerator}, ${p.denominatorExclusion}, ${source}
    )
    ON CONFLICT (measure_code, period_start, period_end, report_type)
    DO UPDATE SET
      report                = EXCLUDED.report,
      measure_score         = EXCLUDED.measure_score,
      initial_population    = EXCLUDED.initial_population,
      denominator           = EXCLUDED.denominator,
      numerator             = EXCLUDED.numerator,
      denominator_exclusion = EXCLUDED.denominator_exclusion,
      source                = EXCLUDED.source,
      computed_at           = NOW()
    RETURNING id
  `;
  return rows[0]!.id;
}

/** Most-recently computed MeasureReport for a measure (any period/type). */
export async function latestMeasureReport(
  measureCode: string,
): Promise<PersistedMeasureReport | null> {
  const rows = await sql<PersistedMeasureReport[]>`
    SELECT measure_code,
           period_start::text AS period_start,
           period_end::text   AS period_end,
           report_type, report, measure_score,
           initial_population, denominator, numerator, denominator_exclusion,
           source, computed_at::text AS computed_at
    FROM phm_edw.measure_report
    WHERE measure_code = ${measureCode}
    ORDER BY computed_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}
