// =============================================================================
// Medgnosis API — Measure reconciliation (CQL engine vs SQL star-schema)
// Compares the authoritative SQL rollup (phm_star.fact_measure_result) against
// the clinical-reasoning engine's $evaluate-measure for the same measure +
// period. Used to gain confidence in the CQL path before demoting SQL to a
// cache (Phase 1 Task 6). Disagreement above tolerance is a drift signal.
// =============================================================================

import { sql } from '@medgnosis/db';
import { evaluateMeasure, populationsFromReport } from './fhir/cqlEngineClient.js';

export interface PopulationCounts {
  denominator: number;
  numerator: number;
  exclusion: number;
}

export interface ReconcileResult {
  measureCode: string;
  agree: boolean;
  tolerance: number;
  sql: PopulationCounts;
  cql: PopulationCounts;
  deltas: PopulationCounts;
}

export async function reconcile(
  measureCode: string,
  period: { start: string; end: string },
  opts: { engineUrl?: string; tolerance?: number; engineMeasureId?: string } = {},
): Promise<ReconcileResult> {
  const tolerance = opts.tolerance ?? 0;
  const engineUrl =
    opts.engineUrl ?? process.env['CQL_ENGINE_URL'] ?? 'http://cql-engine:8080/fhir';
  // The engine knows the measure by its FHIR Measure id (measure_artifact.ecqm_id),
  // which differs from the EDW measure_code (e.g. CMS122v12 vs CMS122FHIR...).
  const engineMeasureId = opts.engineMeasureId ?? measureCode;

  const sqlRows = await sql<PopulationCounts[]>`
    SELECT
      COUNT(*) FILTER (WHERE fr.denominator_flag)::int AS denominator,
      COUNT(*) FILTER (WHERE fr.numerator_flag)::int   AS numerator,
      COUNT(*) FILTER (WHERE fr.exclusion_flag)::int   AS exclusion
    FROM phm_star.fact_measure_result fr
    JOIN phm_star.dim_measure dm ON dm.measure_key = fr.measure_key
    WHERE dm.measure_code = ${measureCode}
  `;
  const sqlPops: PopulationCounts = {
    denominator: sqlRows[0]?.denominator ?? 0,
    numerator: sqlRows[0]?.numerator ?? 0,
    exclusion: sqlRows[0]?.exclusion ?? 0,
  };

  const report = await evaluateMeasure(engineUrl, engineMeasureId, {
    periodStart: period.start,
    periodEnd: period.end,
    reportType: 'population',
  });
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

  return { measureCode, agree, tolerance, sql: sqlPops, cql: cqlPops, deltas };
}
