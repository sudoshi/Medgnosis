// =============================================================================
// Unit tests - QDM/CQL MeasureReport evidence to star promotion
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const unsafe = vi.fn();
  return {
    mockSql: {
      unsafe,
      begin: vi.fn(async (cb: (tx: { unsafe: typeof unsafe }) => Promise<unknown>) =>
        cb({ unsafe }),
      ),
    },
  };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  promoteMeasureReportEvidenceToStar,
  QDM_CQL_STAR_PROMOTION_EVALUATOR,
} from './measureReportToStar.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.unsafe.mockImplementation(async (query: string) => {
    if (query.startsWith('SET LOCAL')) return [];
    return [
      {
        evidence_rows_seen: '2',
        evidence_rows_promoted: '1',
        evidence_rows_skipped: '1',
        result_rows_upserted: '1',
        qdm_evidence_selected: '3',
        bridge_rows_upserted: '3',
        fact_evidence_rows_upserted: '3',
      },
    ];
  });
});

describe('promoteMeasureReportEvidenceToStar', () => {
  it('promotes persisted MeasureReport evidence into CQL-sourced star rows and evidence ledgers', async () => {
    const result = await promoteMeasureReportEvidenceToStar({
      measureReportId: 7001,
      evidenceSource: 'qdm-cql-smoke',
      starSource: 'qdm-cql',
      qdmRunId: '00000000-0000-4000-8000-000000000070',
      reconciliationStatus: 'cql_shadow',
      reconciliationDelta: { denominatorDelta: 1 },
      statementTimeoutMs: 45_000,
    });

    expect(result).toEqual({
      measureReportId: 7001,
      source: 'qdm-cql',
      evaluationScope: 'scoped_subjects',
      evidenceRowsSeen: 2,
      evidenceRowsPromoted: 1,
      evidenceRowsSkipped: 1,
      resultRowsUpserted: 1,
      qdmEvidenceSelected: 3,
      bridgeRowsUpserted: 3,
      factEvidenceRowsUpserted: 3,
    });

    expect(mockSql.begin).toHaveBeenCalledTimes(1);
    expect(mockSql.unsafe).toHaveBeenCalledTimes(2);
    expect(mockSql.unsafe.mock.calls[0]?.[0]).toBe("SET LOCAL statement_timeout = '45000ms'");

    const query = mockSql.unsafe.mock.calls[1]?.[0] as string;
    const params = mockSql.unsafe.mock.calls[1]?.[1] as unknown[];
    expect(query).toContain('INSERT INTO phm_star.fact_measure_result');
    expect(query).toContain('evaluation_scope');
    expect(query).toContain("WHERE source <> 'sql_bundle'");
    expect(query).toContain('jsonb_to_recordset(s.qdm_evidence)');
    expect(query).toContain('INSERT INTO phm_star.bridge_qdm_star_evidence');
    expect(query).toContain('ON CONFLICT ON CONSTRAINT uq_bqse_event_fact_role');
    expect(query).toContain('INSERT INTO phm_star.fact_measure_result_evidence');
    expect(query).toContain("':qdm:'");
    expect(query).toContain('ON CONFLICT ON CONSTRAINT uq_fmre_result_event_role');
    expect(params).toEqual([
      7001,
      'qdm-cql-smoke',
      'qdm-cql',
      'scoped_subjects',
      '00000000-0000-4000-8000-000000000070',
      'cql_shadow',
      { denominatorDelta: 1 },
      QDM_CQL_STAR_PROMOTION_EVALUATOR,
    ]);
  });

  it('uses bounded defaults and allows any evidence source when not specified', async () => {
    await promoteMeasureReportEvidenceToStar({ measureReportId: 12 });

    expect(mockSql.unsafe.mock.calls[0]?.[0]).toBe("SET LOCAL statement_timeout = '30000ms'");
    const params = mockSql.unsafe.mock.calls[1]?.[1] as unknown[];
    expect(params).toEqual([
      12,
      null,
      'qdm-cql',
      'scoped_subjects',
      null,
      'shadow_pending',
      {},
      QDM_CQL_STAR_PROMOTION_EVALUATOR,
    ]);
  });

  it('rejects sql_bundle as a CQL promotion source', async () => {
    await expect(
      promoteMeasureReportEvidenceToStar({
        measureReportId: 7001,
        starSource: 'sql_bundle',
      }),
    ).rejects.toThrow('cannot be sql_bundle');

    expect(mockSql.begin).not.toHaveBeenCalled();
  });

  it('validates ids, source lengths, and qdmRunId before writing', async () => {
    await expect(promoteMeasureReportEvidenceToStar({ measureReportId: 0 })).rejects.toThrow(
      'positive integer',
    );
    await expect(
      promoteMeasureReportEvidenceToStar({
        measureReportId: 1,
        starSource: 'this-source-name-is-more-than-thirty-characters',
      }),
    ).rejects.toThrow('30 characters or fewer');
    await expect(
      promoteMeasureReportEvidenceToStar({
        measureReportId: 1,
        qdmRunId: 'not-a-uuid',
      }),
    ).rejects.toThrow('valid UUID');

    expect(mockSql.begin).not.toHaveBeenCalled();
  });
});
