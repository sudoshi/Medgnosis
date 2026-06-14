// =============================================================================
// Unit tests — CQL MeasureEvaluator (refresh over active measures)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql, mockEval } = vi.hoisted(() => ({ mockSql: vi.fn(), mockEval: vi.fn() }));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('./fhir/cqlEngineClient.js', () => ({
  evaluateMeasure: mockEval,
  populationsFromReport: () => ({
    initialPopulation: 100,
    denominator: 80,
    numerator: 55,
    denominatorExclusion: 5,
  }),
}));

import { refreshCqlMeasureResults } from './cqlMeasureEvaluator.js';

const REPORT = { resourceType: 'MeasureReport', status: 'complete', measure: 'X' };

beforeEach(() => vi.clearAllMocks());

describe('refreshCqlMeasureResults', () => {
  it('evaluates each active measure and reports rowCount', async () => {
    mockSql.mockResolvedValueOnce([{ measure_code: 'CMS122v12' }, { measure_code: 'CMS165v12' }]);
    mockEval.mockResolvedValue(REPORT);
    const result = await refreshCqlMeasureResults();
    expect(mockEval).toHaveBeenCalledTimes(2);
    expect(result.rowCount).toBe(2);
    expect(typeof result.durationMs).toBe('number');
  });

  it('passes period + reportType=population to the engine', async () => {
    mockSql.mockResolvedValueOnce([{ measure_code: 'CMS122v12' }]);
    mockEval.mockResolvedValue(REPORT);
    await refreshCqlMeasureResults();
    const [, measureId, params] = mockEval.mock.calls[0]!;
    expect(measureId).toBe('CMS122v12');
    expect(params).toMatchObject({ reportType: 'population' });
    expect(params.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('counts partial successes (one measure fails)', async () => {
    mockSql.mockResolvedValueOnce([{ measure_code: 'A' }, { measure_code: 'B' }]);
    mockEval.mockResolvedValueOnce(REPORT).mockRejectedValueOnce(new Error('eval error'));
    const result = await refreshCqlMeasureResults();
    expect(result.rowCount).toBe(1);
  });

  it('throws loudly when ALL measures fail to evaluate', async () => {
    mockSql.mockResolvedValueOnce([{ measure_code: 'A' }]);
    mockEval.mockRejectedValue(new Error('engine down'));
    await expect(refreshCqlMeasureResults()).rejects.toThrow(/failed for all 1 measures/);
  });

  it('returns rowCount 0 (no throw) when there are no active measures', async () => {
    mockSql.mockResolvedValueOnce([]);
    const result = await refreshCqlMeasureResults();
    expect(result.rowCount).toBe(0);
    expect(mockEval).not.toHaveBeenCalled();
  });
});
