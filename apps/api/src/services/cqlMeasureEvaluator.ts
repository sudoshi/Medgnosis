// =============================================================================
// Medgnosis API — CQL MeasureEvaluator (the 'cql' path behind the seam)
// Evaluates every measure that has an executable FHIR artifact binding
// (phm_edw.measure_artifact, migration 056/057) via the clinical-reasoning
// sidecar's Measure/$evaluate-measure, and PERSISTS each MeasureReport
// (phm_edw.measure_report, Phase 2). Returns a RefreshResult, matching the SQL
// evaluator's contract. SQL remains the default/authoritative path
// (MEASURE_EVALUATOR); reconciliation (measureReconciliation.ts) compares them.
//
// The engine knows a measure by its FHIR Measure id (measure_artifact.ecqm_id),
// which differs from the EDW measure_code (e.g. CMS122v12 vs CMS122FHIR...). We
// evaluate by ecqm_id and persist under the EDW measure_code.
//
// Data-feeding (loading QI-Core resources into the engine, "Mode B") is a
// separate, bounded, indexed concern (qicoreExport + cqlEngineLoader, proven by
// scripts/cql-live-reconcile.sh) — NOT auto-run here, because a full-cohort
// export against the ~1B-row phm_edw.observation must never fire unbounded in
// the nightly worker. This evaluator assumes the engine has been fed.
//
// Reading CQL_ENGINE_URL / fallback period from env (not the config module)
// keeps this service importable in unit tests without DATABASE_URL.
// =============================================================================

import { sql } from '@medgnosis/db';
import type { RefreshResult } from './measureCalculatorV2.js';
import { evaluateMeasure } from './fhir/cqlEngineClient.js';
import { persistMeasureReport } from './measureReportStore.js';

interface MeasureBinding {
  measure_code: string;
  ecqm_id: string;
  period_start: string | null;
  period_end: string | null;
}

function engineUrl(): string {
  return process.env['CQL_ENGINE_URL'] ?? 'http://cql-engine:8080/fhir';
}

// Fallback when a binding leaves the reporting period null.
function fallbackPeriod(): { start: string; end: string } {
  return {
    start: process.env['CQL_REPORTING_PERIOD_START'] ?? '2026-01-01',
    end: process.env['CQL_REPORTING_PERIOD_END'] ?? '2026-12-31',
  };
}

export async function refreshCqlMeasureResults(): Promise<RefreshResult> {
  const t0 = performance.now();

  // Only measures with an executable FHIR artifact binding can be evaluated by
  // the engine (the binding carries the engine Measure id + reporting period).
  const bindings = await sql<MeasureBinding[]>`
    SELECT measure_code, ecqm_id,
           reporting_period_start::text AS period_start,
           reporting_period_end::text   AS period_end
    FROM phm_edw.measure_artifact
    WHERE ecqm_id IS NOT NULL AND status = 'active'
    ORDER BY measure_code
  `;

  const url = engineUrl();
  const fb = fallbackPeriod();
  let rowCount = 0;
  const failures: string[] = [];

  for (const b of bindings) {
    const period = { start: b.period_start ?? fb.start, end: b.period_end ?? fb.end };
    try {
      const report = await evaluateMeasure(url, b.ecqm_id, {
        periodStart: period.start,
        periodEnd: period.end,
        reportType: 'population',
      });
      await persistMeasureReport(b.measure_code, period, report);
      rowCount += 1;
    } catch {
      failures.push(b.measure_code);
    }
  }

  // Fail loudly only on total failure (engine down / misconfigured); partial
  // failures reduce rowCount, which the caller observes. No bindings => no-op.
  if (bindings.length > 0 && rowCount === 0) {
    throw new Error(
      `CQL evaluation failed for all ${bindings.length} bound measures (engine ${url}); ` +
        `first failures: ${failures.slice(0, 3).join(', ')}`,
    );
  }

  return { rowCount, durationMs: Math.round(performance.now() - t0) };
}
