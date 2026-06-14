// =============================================================================
// Medgnosis API — MeasureEvaluator seam
// One signature, swappable engines: SQL aggregation today, a CQL/cqf-ruler
// bridge later — no schema change, no caller change (Parthenon pattern, see
// docs/superpowers/specs/2026-06-12-parthenon-ecqm-handoff.md §6.3).
// Selected via MEASURE_EVALUATOR env var; defaults to 'sql'.
// =============================================================================

import { refreshMeasureResults, type RefreshResult } from './measureCalculatorV2.js';
import { refreshCqlMeasureResults } from './cqlMeasureEvaluator.js';

export type MeasureEvaluatorKind = 'sql' | 'cql';

export interface MeasureEvaluator {
  readonly kind: MeasureEvaluatorKind;
  refresh(): Promise<RefreshResult>;
}

export const sqlMeasureEvaluator: MeasureEvaluator = {
  kind: 'sql',
  refresh: refreshMeasureResults,
};

export const cqlMeasureEvaluator: MeasureEvaluator = {
  kind: 'cql',
  refresh: refreshCqlMeasureResults,
};

export function getMeasureEvaluator(): MeasureEvaluator {
  const kind = process.env['MEASURE_EVALUATOR'] ?? 'sql';
  switch (kind) {
    case 'sql':
      return sqlMeasureEvaluator;
    case 'cql':
      return cqlMeasureEvaluator;
    default:
      throw new Error(`Unknown MEASURE_EVALUATOR "${kind}" — expected "sql" or "cql"`);
  }
}
