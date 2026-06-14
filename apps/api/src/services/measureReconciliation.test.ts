// =============================================================================
// Unit tests — Measure reconciliation (CQL vs SQL)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql, mockEval } = vi.hoisted(() => ({ mockSql: vi.fn(), mockEval: vi.fn() }));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('./fhir/cqlEngineClient.js', () => ({
  evaluateMeasure: mockEval,
  populationsFromReport: (r: { __p: { denominator: number; numerator: number; denominatorExclusion: number } }) => ({
    initialPopulation: 0,
    ...r.__p,
  }),
}));

import { reconcile } from './measureReconciliation.js';

const PERIOD = { start: '2026-01-01', end: '2026-12-31' };

beforeEach(() => vi.clearAllMocks());

describe('reconcile', () => {
  it('agrees when SQL and CQL populations match within tolerance', async () => {
    mockSql.mockResolvedValueOnce([{ denominator: 80, numerator: 55, exclusion: 5 }]);
    mockEval.mockResolvedValue({ __p: { denominator: 80, numerator: 55, denominatorExclusion: 5 } });
    const r = await reconcile('CMS122v12', PERIOD, { engineUrl: 'http://e/fhir' });
    expect(r.agree).toBe(true);
    expect(r.deltas).toEqual({ denominator: 0, numerator: 0, exclusion: 0 });
  });

  it('disagrees and reports deltas', async () => {
    mockSql.mockResolvedValueOnce([{ denominator: 80, numerator: 55, exclusion: 5 }]);
    mockEval.mockResolvedValue({ __p: { denominator: 80, numerator: 40, denominatorExclusion: 5 } });
    const r = await reconcile('CMS122v12', PERIOD, { engineUrl: 'http://e/fhir' });
    expect(r.agree).toBe(false);
    expect(r.deltas.numerator).toBe(15);
  });

  it('honors a non-zero tolerance', async () => {
    mockSql.mockResolvedValueOnce([{ denominator: 80, numerator: 55, exclusion: 5 }]);
    mockEval.mockResolvedValue({ __p: { denominator: 80, numerator: 53, denominatorExclusion: 5 } });
    const r = await reconcile('CMS122v12', PERIOD, { engineUrl: 'http://e/fhir', tolerance: 2 });
    expect(r.agree).toBe(true);
  });

  it('treats a missing SQL row as zero counts', async () => {
    mockSql.mockResolvedValueOnce([]);
    mockEval.mockResolvedValue({ __p: { denominator: 0, numerator: 0, denominatorExclusion: 0 } });
    const r = await reconcile('UNKNOWN', PERIOD, { engineUrl: 'http://e/fhir' });
    expect(r.sql).toEqual({ denominator: 0, numerator: 0, exclusion: 0 });
    expect(r.agree).toBe(true);
  });
});
