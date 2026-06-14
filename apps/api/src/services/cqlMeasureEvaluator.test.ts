// =============================================================================
// Unit tests — CQL MeasureEvaluator (evaluate bound measures + persist reports)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql, mockEval, mockPersist } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockEval: vi.fn(),
  mockPersist: vi.fn(),
}));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('./fhir/cqlEngineClient.js', () => ({ evaluateMeasure: mockEval }));
vi.mock('./measureReportStore.js', () => ({ persistMeasureReport: mockPersist }));

import { refreshCqlMeasureResults } from './cqlMeasureEvaluator.js';

const REPORT = { resourceType: 'MeasureReport', status: 'complete', measure: 'X' };
const binding = (measure_code: string, ecqm_id: string) => ({
  measure_code,
  ecqm_id,
  period_start: '2024-01-01',
  period_end: '2024-12-31',
});

beforeEach(() => vi.clearAllMocks());

describe('refreshCqlMeasureResults', () => {
  it('evaluates each bound measure by its engine Measure id and persists the report', async () => {
    mockSql.mockResolvedValueOnce([
      binding('CMS122v12', 'CMS122FHIR'),
      binding('CMS165v12', 'CMS165FHIR'),
    ]);
    mockEval.mockResolvedValue(REPORT);
    mockPersist.mockResolvedValue(1);

    const result = await refreshCqlMeasureResults();

    expect(mockEval).toHaveBeenCalledTimes(2);
    expect(mockPersist).toHaveBeenCalledTimes(2);
    expect(result.rowCount).toBe(2);
    expect(typeof result.durationMs).toBe('number');
  });

  it('evaluates by ecqm_id (not measure_code) and persists under the EDW code', async () => {
    mockSql.mockResolvedValueOnce([binding('CMS122v12', 'CMS122FHIR')]);
    mockEval.mockResolvedValue(REPORT);
    mockPersist.mockResolvedValue(1);

    await refreshCqlMeasureResults();

    const [, measureId, params] = mockEval.mock.calls[0]!;
    expect(measureId).toBe('CMS122FHIR'); // engine id, not CMS122v12
    expect(params).toMatchObject({ reportType: 'population', periodStart: '2024-01-01' });

    const [code, period, report] = mockPersist.mock.calls[0]!;
    expect(code).toBe('CMS122v12'); // persisted under EDW code
    expect(period).toEqual({ start: '2024-01-01', end: '2024-12-31' });
    expect(report).toBe(REPORT);
  });

  it('falls back to the env period when a binding leaves it null', async () => {
    mockSql.mockResolvedValueOnce([
      { measure_code: 'CMS122v12', ecqm_id: 'CMS122FHIR', period_start: null, period_end: null },
    ]);
    mockEval.mockResolvedValue(REPORT);
    mockPersist.mockResolvedValue(1);

    await refreshCqlMeasureResults();
    const [, , params] = mockEval.mock.calls[0]!;
    expect(params.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('counts partial successes (one measure fails to evaluate)', async () => {
    mockSql.mockResolvedValueOnce([binding('A', 'AFHIR'), binding('B', 'BFHIR')]);
    mockEval.mockResolvedValueOnce(REPORT).mockRejectedValueOnce(new Error('eval error'));
    mockPersist.mockResolvedValue(1);

    const result = await refreshCqlMeasureResults();
    expect(result.rowCount).toBe(1);
    expect(mockPersist).toHaveBeenCalledTimes(1);
  });

  it('throws loudly when ALL bound measures fail to evaluate', async () => {
    mockSql.mockResolvedValueOnce([binding('A', 'AFHIR')]);
    mockEval.mockRejectedValue(new Error('engine down'));
    await expect(refreshCqlMeasureResults()).rejects.toThrow(/failed for all 1 bound measures/);
  });

  it('returns rowCount 0 (no throw) when no measures are bound', async () => {
    mockSql.mockResolvedValueOnce([]);
    const result = await refreshCqlMeasureResults();
    expect(result.rowCount).toBe(0);
    expect(mockEval).not.toHaveBeenCalled();
  });
});
