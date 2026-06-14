// =============================================================================
// Unit tests — MeasureEvaluator seam
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRefresh, mockCqlRefresh } = vi.hoisted(() => ({
  mockRefresh: vi.fn(async () => ({ rowCount: 42, durationMs: 5 })),
  mockCqlRefresh: vi.fn(async () => ({ rowCount: 7, durationMs: 3 })),
}));

vi.mock('../measureCalculatorV2.js', () => ({
  refreshMeasureResults: mockRefresh,
}));

vi.mock('../cqlMeasureEvaluator.js', () => ({
  refreshCqlMeasureResults: mockCqlRefresh,
}));

import { getMeasureEvaluator, sqlMeasureEvaluator, cqlMeasureEvaluator } from '../measureEvaluator.js';

const ORIGINAL_ENV = process.env['MEASURE_EVALUATOR'];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['MEASURE_EVALUATOR'];
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env['MEASURE_EVALUATOR'];
  } else {
    process.env['MEASURE_EVALUATOR'] = ORIGINAL_ENV;
  }
});

describe('sqlMeasureEvaluator', () => {
  it('delegates to refreshMeasureResults', async () => {
    const result = await sqlMeasureEvaluator.refresh();
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(result).toEqual({ rowCount: 42, durationMs: 5 });
  });
});

describe('cqlMeasureEvaluator', () => {
  it('delegates to refreshCqlMeasureResults', async () => {
    const result = await cqlMeasureEvaluator.refresh();
    expect(mockCqlRefresh).toHaveBeenCalledOnce();
    expect(result).toEqual({ rowCount: 7, durationMs: 3 });
  });
});

describe('getMeasureEvaluator', () => {
  it('defaults to sql', () => {
    expect(getMeasureEvaluator().kind).toBe('sql');
  });

  it('selects cql when MEASURE_EVALUATOR=cql', () => {
    process.env['MEASURE_EVALUATOR'] = 'cql';
    expect(getMeasureEvaluator().kind).toBe('cql');
  });

  it('rejects unknown evaluator kinds loudly', () => {
    process.env['MEASURE_EVALUATOR'] = 'quantum';
    expect(() => getMeasureEvaluator()).toThrow(/Unknown MEASURE_EVALUATOR/);
  });
});
