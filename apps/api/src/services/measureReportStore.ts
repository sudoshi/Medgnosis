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
type UnsafeParameter = NonNullable<Parameters<typeof sql.unsafe>[1]>[number];

function asUnsafeJson(value: unknown): UnsafeParameter {
  return value as UnsafeParameter;
}

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

export interface MeasureEvidenceRow {
  measureCode: string;
  patientId?: number | null;
  patientRef?: string | null;
  patientKey?: number | null;
  measureKey?: number | null;
  periodStart: string;
  periodEnd: string;
  denominatorFlag?: boolean;
  numeratorFlag?: boolean;
  exclusionFlag?: boolean;
  measureValue?: number | null;
  source?: string;
  qdmEvidence?: unknown[];
  fhirSubjectReport?: FhirMeasureReport | Record<string, unknown> | null;
}

export interface PersistMeasureEvidenceResult {
  rowCount: number;
  ids: number[];
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
  return Number(rows[0]!.id);
}

/**
 * Upsert patient-level evidence adjacent to a persisted MeasureReport. This is
 * intentionally separate from fact_measure_result so CQL/QDM evidence can be
 * reconciled against the current SQL analytics path before it drives measure
 * accounting.
 */
export async function persistMeasureEvidenceRows(
  measureReportId: number,
  rows: readonly MeasureEvidenceRow[],
): Promise<PersistMeasureEvidenceResult> {
  if (rows.length === 0) {
    return { rowCount: 0, ids: [] };
  }

  const ids: number[] = [];

  await sql.begin(async (tx) => {
    for (const row of rows) {
      if (row.patientId == null && !row.patientRef) {
        throw new Error('Measure evidence row requires patientId or patientRef');
      }

      const inserted = await tx.unsafe<{ id: number }[]>(
        `
        INSERT INTO phm_edw.measure_report_evidence
          (measure_report_id, measure_code, patient_id, patient_ref,
           patient_key, measure_key, period_start, period_end,
           denominator_flag, numerator_flag, exclusion_flag, measure_value,
           source, qdm_evidence, fhir_subject_report)
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14::jsonb,
          $15::jsonb
        )
        ON CONFLICT ON CONSTRAINT uq_measure_report_evidence_subject
        DO UPDATE SET
          measure_report_id   = EXCLUDED.measure_report_id,
          patient_key         = EXCLUDED.patient_key,
          measure_key         = EXCLUDED.measure_key,
          denominator_flag    = EXCLUDED.denominator_flag,
          numerator_flag      = EXCLUDED.numerator_flag,
          exclusion_flag      = EXCLUDED.exclusion_flag,
          measure_value       = EXCLUDED.measure_value,
          qdm_evidence        = EXCLUDED.qdm_evidence,
          fhir_subject_report = EXCLUDED.fhir_subject_report,
          computed_at         = NOW()
        RETURNING id
        `,
        [
          measureReportId,
          row.measureCode,
          row.patientId ?? null,
          row.patientRef ?? null,
          row.patientKey ?? null,
          row.measureKey ?? null,
          row.periodStart,
          row.periodEnd,
          row.denominatorFlag ?? false,
          row.numeratorFlag ?? false,
          row.exclusionFlag ?? false,
          row.measureValue ?? null,
          row.source ?? 'cql',
          asUnsafeJson(row.qdmEvidence ?? []),
          asUnsafeJson(row.fhirSubjectReport ?? null),
        ],
      );

      ids.push(Number(inserted[0]!.id));
    }
  });

  return { rowCount: ids.length, ids };
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
