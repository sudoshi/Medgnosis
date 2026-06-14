// =============================================================================
// Unit tests — FHIR MeasureReport persistence
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FhirMeasureReport } from './fhir/cqlEngineClient.js';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  // postgres.js sql.json() wrapper — identity is fine for assertions.
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;
  return { mockSql: fn };
});
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { persistMeasureReport, latestMeasureReport } from './measureReportStore.js';

beforeEach(() => vi.clearAllMocks());

const report: FhirMeasureReport = {
  resourceType: 'MeasureReport',
  status: 'complete',
  measure: 'CMS122FHIR',
  group: [
    {
      population: [
        { code: { coding: [{ code: 'initial-population' }] }, count: 52 },
        { code: { coding: [{ code: 'denominator' }] }, count: 52 },
        { code: { coding: [{ code: 'denominator-exclusion' }] }, count: 19 },
        { code: { coding: [{ code: 'numerator' }] }, count: 32 },
      ],
      measureScore: { value: 0.97 },
    },
  ],
};

describe('persistMeasureReport', () => {
  it('upserts with extracted population counts + score and returns the id', async () => {
    mockSql.mockResolvedValueOnce([{ id: 7 }]);

    const id = await persistMeasureReport('CMS122v12', { start: '2024-01-01', end: '2024-12-31' }, report);

    expect(id).toBe(7);
    expect(mockSql).toHaveBeenCalledTimes(1);
    // Interpolated values include the measure, period, counts, and score.
    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toContain('CMS122v12');
    expect(values).toContain(52); // initial-population & denominator
    expect(values).toContain(19); // exclusion
    expect(values).toContain(32); // numerator
    expect(values).toContain(0.97); // score
  });

  it('defaults report_type to population and source to cql', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1 }]);
    await persistMeasureReport('CMS122v12', { start: '2024-01-01', end: '2024-12-31' }, report);
    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toContain('population');
    expect(values).toContain('cql');
  });
});

describe('latestMeasureReport', () => {
  it('returns the most recent persisted row for the measure', async () => {
    mockSql.mockResolvedValueOnce([
      {
        measure_code: 'CMS122v12',
        period_start: '2024-01-01',
        period_end: '2024-12-31',
        report_type: 'population',
        report,
        measure_score: 0.97,
        initial_population: 52,
        denominator: 52,
        numerator: 32,
        denominator_exclusion: 19,
        source: 'cql',
        computed_at: '2026-06-14T00:00:00Z',
      },
    ]);

    const row = await latestMeasureReport('CMS122v12');
    expect(row?.measure_code).toBe('CMS122v12');
    expect(row?.numerator).toBe(32);
    expect(row?.report.resourceType).toBe('MeasureReport');
  });

  it('returns null when no report has been persisted', async () => {
    mockSql.mockResolvedValueOnce([]);
    const row = await latestMeasureReport('CMS999v1');
    expect(row).toBeNull();
  });
});
