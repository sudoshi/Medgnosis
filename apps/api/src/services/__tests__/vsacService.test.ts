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
  getMeasureBridgeStatus,
  EDW_CODE_SYSTEM,
  type PopulationRole,
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
  // First test asserts the full return path (no filter); the next test
  // exercises the code-system filter branch.
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
    const codes = await resolveMeasureCodes('CMS122v12', 'SNOMEDCT', 'denominator_exclusion');
    expect(codes).toEqual(['44054006', '73211009']);
  });

  it('returns an empty array for an unbridged measure', async () => {
    const codes = await resolveMeasureCodes('CMS249v6', 'SNOMEDCT', 'denominator_exclusion');
    expect(codes).toEqual([]);
  });
});

describe('resolveMeasureCodes (role-aware)', () => {
  it('passes the role into the query', async () => {
    mockSql.mockResolvedValueOnce([{ code: '44054006' }]);
    const codes = await resolveMeasureCodes('CMS122v12', 'SNOMEDCT', 'denominator_exclusion');
    expect(codes).toEqual(['44054006']);
    const values = mockSql.mock.calls[0]?.slice(1) ?? [];
    expect(values).toContain('denominator_exclusion');
  });
});

describe('getMeasureBridgeStatus', () => {
  it('reports version drift and role coverage', async () => {
    mockSql.mockResolvedValueOnce([
      { vsac_cms_id: 'CMS122v14', population_role: 'denominator_exclusion', n: 9 },
      { vsac_cms_id: 'CMS122v14', population_role: 'unclassified', n: 12 },
    ]);
    const status = await getMeasureBridgeStatus('CMS122v12');
    expect(status).toEqual({
      measure_code: 'CMS122v12',
      vsac_cms_id: 'CMS122v14',
      version_drift: true,
      roles: { denominator_exclusion: 9, unclassified: 12 },
      unclassified_count: 12,
    });
  });

  it('returns null for an unbridged measure', async () => {
    expect(await getMeasureBridgeStatus('CMS249v6')).toBeNull();
  });
});

// Ensure PopulationRole type is usable (compile-time check)
const _roleCheck: PopulationRole = 'denominator_exclusion';
void _roleCheck;
