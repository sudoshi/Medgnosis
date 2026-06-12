// =============================================================================
// Unit tests — VSAC value set service
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

type SqlRow = Record<string, unknown>;

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn<(strings: TemplateStringsArray, ...values: unknown[]) => Promise<SqlRow[]>>();
  fn.mockResolvedValue([]);
  return { mockSql: fn };
});

vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, {
    unsafe: vi.fn().mockResolvedValue([]),
  }),
}));

import {
  listValueSets,
  getValueSetCodes,
  getMeasureValueSets,
  resolveMeasureCodes,
  EDW_CODE_SYSTEM,
} from '../vsacService.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockResolvedValue([]);
});

describe('EDW_CODE_SYSTEM', () => {
  it('routes EDW domains to the verified VSAC code systems', () => {
    // condition/procedure are SNOMED in phm_edw (verified 2026-06-12) — NOT ICD-10/CPT
    expect(EDW_CODE_SYSTEM.condition).toBe('SNOMEDCT');
    expect(EDW_CODE_SYSTEM.procedure).toBe('SNOMEDCT');
    expect(EDW_CODE_SYSTEM.medication).toBe('RXNORM');
    expect(EDW_CODE_SYSTEM.observation).toBe('LOINC');
  });
});

describe('listValueSets', () => {
  it('returns value set summaries', async () => {
    mockSql.mockResolvedValueOnce([
      { value_set_oid: '2.16.840.1.113883.3.464.1003.103.12.1001', name: 'Diabetes', qdm_category: 'Condition', code_count: 120 },
    ]);
    const result = await listValueSets();
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Diabetes');
  });
});

describe('getValueSetCodes', () => {
  // NOTE: call WITHOUT codeSystem here. With it, the nested sql`` fragment
  // fires an extra mock call that consumes mockResolvedValueOnce before the
  // outer query runs — the mock can't distinguish fragments from queries.
  it('returns the codes for an OID', async () => {
    mockSql.mockResolvedValueOnce([
      { code: '44054006', description: 'Diabetes mellitus type 2', code_system: 'SNOMEDCT' },
    ]);
    const codes = await getValueSetCodes('2.16.840.1.113883.3.464.1003.103.12.1001');
    expect(codes).toEqual([
      { code: '44054006', description: 'Diabetes mellitus type 2', code_system: 'SNOMEDCT' },
    ]);
    const values = mockSql.mock.calls[0]?.slice(1) ?? [];
    expect(values).toContain('2.16.840.1.113883.3.464.1003.103.12.1001');
  });

  it('does not throw when a code-system filter is supplied', async () => {
    await expect(
      getValueSetCodes('2.16.840.1.113883.3.464.1003.103.12.1001', 'SNOMEDCT'),
    ).resolves.toEqual([]);
  });
});

describe('getMeasureValueSets', () => {
  it('returns bridged value sets for a measure code', async () => {
    mockSql.mockResolvedValueOnce([
      { value_set_oid: '2.16...', name: 'Diabetes', vsac_cms_id: 'CMS122v14', qdm_category: 'Condition', code_count: 120 },
    ]);
    const result = await getMeasureValueSets('CMS122v12');
    expect(result[0]?.vsac_cms_id).toBe('CMS122v14');
  });
});

describe('resolveMeasureCodes', () => {
  it('flattens code rows to a string array', async () => {
    mockSql.mockResolvedValueOnce([{ code: '44054006' }, { code: '73211009' }]);
    const codes = await resolveMeasureCodes('CMS122v12', 'SNOMEDCT');
    expect(codes).toEqual(['44054006', '73211009']);
  });

  it('returns an empty array for an unbridged measure', async () => {
    const codes = await resolveMeasureCodes('CMS249v6', 'SNOMEDCT');
    expect(codes).toEqual([]);
  });
});
