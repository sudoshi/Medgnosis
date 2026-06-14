// =============================================================================
// Medgnosis API — CQL MeasureEvaluator (the 'cql' path behind the seam)
// Evaluates active measures via the clinical-reasoning sidecar's
// Measure/$evaluate-measure and returns a RefreshResult, matching the SQL
// evaluator's contract. SQL remains the default/authoritative path
// (MEASURE_EVALUATOR); reconciliation (Phase 1 Task 6) compares the two.
//
// NOTE: the engine Measure id is resolved from measure_code. The authoritative
// measure_code -> FHIR Measure binding lands with migration 056 (Task 8); until
// then this assumes measures are loaded into the sidecar under their measure_code.
// Reading CQL_ENGINE_URL / reporting period from env (not the config module)
// keeps this service importable in unit tests without DATABASE_URL.
// =============================================================================

import { sql } from '@medgnosis/db';
import type { RefreshResult } from './measureCalculatorV2.js';
import { evaluateMeasure, populationsFromReport } from './fhir/cqlEngineClient.js';

function engineUrl(): string {
  return process.env['CQL_ENGINE_URL'] ?? 'http://cql-engine:8080/fhir';
}

function reportingPeriod(): { start: string; end: string } {
  return {
    start: process.env['CQL_REPORTING_PERIOD_START'] ?? '2026-01-01',
    end: process.env['CQL_REPORTING_PERIOD_END'] ?? '2026-12-31',
  };
}

export async function refreshCqlMeasureResults(): Promise<RefreshResult> {
  const t0 = performance.now();

  const measures = await sql<{ measure_code: string }[]>`
    SELECT measure_code
    FROM phm_star.dim_measure
    WHERE measure_code IS NOT NULL
    ORDER BY measure_code
  `;

  const period = reportingPeriod();
  const url = engineUrl();
  let rowCount = 0;
  const failures: string[] = [];

  for (const m of measures) {
    try {
      const report = await evaluateMeasure(url, m.measure_code, {
        periodStart: period.start,
        periodEnd: period.end,
        reportType: 'population',
      });
      // Validate the report yields a population shape; persistence into the
      // star schema is handled by the reconciliation pass (Task 6).
      populationsFromReport(report);
      rowCount += 1;
    } catch {
      failures.push(m.measure_code);
    }
  }

  // Fail loudly only on total failure (engine down / misconfigured); partial
  // failures reduce rowCount, which the caller observes.
  if (measures.length > 0 && rowCount === 0) {
    throw new Error(
      `CQL evaluation failed for all ${measures.length} measures (engine ${url}); ` +
        `first failures: ${failures.slice(0, 3).join(', ')}`,
    );
  }

  return { rowCount, durationMs: Math.round(performance.now() - t0) };
}
