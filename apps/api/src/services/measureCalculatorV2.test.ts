// =============================================================================
// Unit tests - Measure Calculator v2 refresh sequencing
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  type SqlMock = typeof fn & {
    unsafe: (query: string) => Promise<unknown>;
    begin: (cb: (tx: SqlMock) => Promise<unknown>) => Promise<unknown>;
  };
  const sqlMock = fn as SqlMock;
  sqlMock.unsafe = vi.fn();
  sqlMock.begin = vi.fn(async (cb) => cb(sqlMock));
  return { mockSql: sqlMock };
});
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { refreshMeasureResults } from './measureCalculatorV2.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.unsafe = vi.fn(async (query: string) => {
    if (query.includes('measure_sql_baseline_alias')) {
      return { count: 3 };
    }
    if (query.includes('INSERT INTO phm_star.fact_measure_result')) {
      return { count: 42 };
    }
    return { count: 0 };
  });
  mockSql.begin = vi.fn(async (cb) => cb(mockSql));
});

describe('refreshMeasureResults', () => {
  it('replaces SQL-source measure results without deleting promoted CQL rows', async () => {
    const result = await refreshMeasureResults();

    expect(result.rowCount).toBe(45);
    const queries = mockSql.unsafe.mock.calls.map(([query]) => query);
    const evidenceIndex = queries.findIndex((query) =>
      query.includes('fact_measure_result_evidence fmre'),
    );
    const factIndex = queries.findIndex((query) =>
      query.includes("DELETE FROM phm_star.fact_measure_result WHERE source = 'sql_bundle'"),
    );
    expect(evidenceIndex).toBeGreaterThan(-1);
    expect(factIndex).toBeGreaterThan(-1);
    expect(evidenceIndex).toBeLessThan(factIndex);
    expect(queries[factIndex + 1]).toContain('INSERT INTO phm_star.fact_measure_result');
    expect(queries[factIndex + 1]).toContain('source, evaluation_scope, reconciliation_status');
    expect(queries[factIndex + 2]).toContain('measure_sql_baseline_alias');
    expect(queries[factIndex + 4]).toContain("fmr.source = 'sql_bundle'");
  });
});
