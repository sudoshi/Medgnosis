// =============================================================================
// Unit tests - QDM star evidence decoration
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  type SqlMock = typeof fn & {
    unsafe: (query: string, parameters?: readonly unknown[]) => Promise<unknown>;
    begin: (cb: (tx: SqlMock) => Promise<unknown>) => Promise<unknown>;
  };
  const sqlMock = fn as SqlMock;
  sqlMock.unsafe = async (query, parameters = []) =>
    fn([query] as unknown as TemplateStringsArray, ...parameters);
  sqlMock.begin = vi.fn(async (cb) => cb(sqlMock));
  return { mockSql: sqlMock };
});
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  decorateQdmBundleDetailEvidence,
  QDM_STAR_DECORATOR_EVALUATOR,
} from './starEvidenceDecorator.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.unsafe = async (query, parameters = []) =>
    mockSql([query] as unknown as TemplateStringsArray, ...parameters);
  mockSql.begin = vi.fn(async (cb) => cb(mockSql));
});

describe('decorateQdmBundleDetailEvidence', () => {
  it('decorates excluded bundle details through bridge_qdm_star_evidence only', async () => {
    mockSql.mockResolvedValueOnce([{ row_count: 4 }]);

    const result = await decorateQdmBundleDetailEvidence({
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      measureCodes: ['CMS122v12', 'CMS122v12', ' CMS130v10 '],
    });

    expect(result).toEqual({ rowCount: 4 });
    expect(mockSql.begin).toHaveBeenCalledTimes(1);

    const query = (mockSql.mock.calls[0]![0] as TemplateStringsArray).join('');
    expect(query).toContain('INSERT INTO phm_star.bridge_qdm_star_evidence');
    expect(query).not.toContain('fact_measure_result_evidence');
    expect(query).toContain("lower(d.gap_status) = 'excluded'");
    expect(query).toContain("mv.population_role = 'denominator_exclusion'");
    expect(query).toContain('phm_edw.qdm_event qe');
    expect(query).toContain('phm_edw.measure_value_set mv');
    expect(query).toContain('phm_edw.vsac_value_set_code vc');
    expect(query).toContain('phm_star.dim_patient dp');
    expect(query).toContain('phm_star.dim_measure dm');
    expect(query).toContain('ON CONFLICT ON CONSTRAINT uq_bqse_event_fact_role');
    expect(query).toContain("WHEN 'http://snomed.info/sct' THEN 'SNOMEDCT'");
    expect(query).toContain("WHEN 'http://loinc.org' THEN 'LOINC'");
    expect(query).toContain("WHEN 'http://www.nlm.nih.gov/research/umls/rxnorm' THEN 'RXNORM'");

    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toEqual([
      ['CMS122v12', 'CMS130v10'],
      '2026-01-01',
      '2026-12-31',
      QDM_STAR_DECORATOR_EVALUATOR,
    ]);
  });

  it('allows all measures by passing a null measure scope', async () => {
    mockSql.mockResolvedValueOnce([{ row_count: 0 }]);

    const result = await decorateQdmBundleDetailEvidence({
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    });

    expect(result.rowCount).toBe(0);
    expect(mockSql.mock.calls[0]!.slice(1)[0]).toBeNull();
  });

  it('rejects inverted reporting periods before writing', async () => {
    await expect(
      decorateQdmBundleDetailEvidence({
        periodStart: '2026-12-31',
        periodEnd: '2026-01-01',
      }),
    ).rejects.toThrow('periodEnd must be on or after periodStart');

    expect(mockSql).not.toHaveBeenCalled();
  });
});
