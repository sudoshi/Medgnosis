// =============================================================================
// Unit tests - EMPI operational metrics
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { getEmpiMetrics } from './empiMetrics.js';

beforeEach(() => vi.clearAllMocks());

describe('getEmpiMetrics', () => {
  it('aggregates person mix, queue-by-reason, merge activity, coverage, and duplicates', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const t = strings.join('');
      if (t.includes('FROM phm_edw.person GROUP BY status')) {
        return Promise.resolve([{ status: 'active', c: 1000 }, { status: 'provisional', c: 12 }, { status: 'merged', c: 3 }]);
      }
      if (t.includes('FROM phm_edw.patient_link')) return Promise.resolve([{ c: 1005 }]);
      if (t.includes("status = 'open' GROUP BY reason")) {
        return Promise.resolve([{ reason: 'probabilistic_match', c: 7 }, { reason: 'demographic_only_match', c: 2 }]);
      }
      if (t.includes('min(created_at)')) return Promise.resolve([{ oldest: '2026-06-19T00:00:00Z' }]);
      if (t.includes("action IN ('merge', 'unmerge')")) {
        return Promise.resolve([{ action: 'merge', c: 5 }, { action: 'unmerge', c: 1 }]);
      }
      if (t.includes("source_system IN ('mpi-backfill', 'mpi-feed')")) return Promise.resolve([{ c: 880 }]);
      if (t.includes('HAVING count(*) > 1')) return Promise.resolve([{ c: 9 }]);
      return Promise.resolve([]);
    });

    const metrics = await getEmpiMetrics();

    expect(metrics).toEqual({
      persons: { total: 1015, active: 1000, provisional: 12, merged: 3 },
      patientLinks: 1005,
      reviewQueue: {
        open: 9,
        byReason: { probabilistic_match: 7, demographic_only_match: 2 },
        oldestOpenAt: '2026-06-19T00:00:00Z',
      },
      merges: { merged: 5, unmerged: 1 },
      mpiCoverage: { personsWithMaster: 880 },
      potentialDuplicates: 9,
    });
  });

  it('defaults cleanly on an empty system', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const t = strings.join('');
      if (t.includes('min(created_at)')) return Promise.resolve([{ oldest: null }]);
      return Promise.resolve([]);
    });
    const metrics = await getEmpiMetrics();
    expect(metrics.persons).toEqual({ total: 0, active: 0, provisional: 0, merged: 0 });
    expect(metrics.reviewQueue).toEqual({ open: 0, byReason: {}, oldestOpenAt: null });
    expect(metrics.merges).toEqual({ merged: 0, unmerged: 0 });
    expect(metrics.potentialDuplicates).toBe(0);
  });
});
