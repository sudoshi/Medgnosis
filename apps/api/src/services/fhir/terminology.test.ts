// =============================================================================
// Unit tests — FHIR terminology service ($expand / $validate-code over VSAC)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { expandValueSet, validateCode, oidFromCanonical } from './terminology.js';

beforeEach(() => vi.clearAllMocks());

const OID = '2.16.840.1.113883.3.464.1003.103.12.1001';

describe('oidFromCanonical', () => {
  it('extracts the OID from a VSAC canonical url', () => {
    expect(oidFromCanonical(`http://cts.nlm.nih.gov/fhir/ValueSet/${OID}`)).toBe(OID);
  });
  it('passes a bare OID through', () => {
    expect(oidFromCanonical(OID)).toBe(OID);
  });
});

describe('expandValueSet', () => {
  it('returns a FHIR ValueSet with expansion.contains from the code rows', async () => {
    mockSql.mockResolvedValueOnce([{ name: 'Diabetes', expansion_version: '2025-05' }]);
    mockSql.mockResolvedValueOnce([
      { code: '44054006', description: 'Diabetes mellitus type 2', code_system: 'SNOMEDCT' },
    ]);
    const vs = await expandValueSet(OID);
    expect(vs?.resourceType).toBe('ValueSet');
    expect(vs?.expansion?.total).toBe(1);
    expect(vs?.expansion?.contains?.[0]?.code).toBe('44054006');
    expect(vs?.expansion?.contains?.[0]?.system).toContain('snomed');
  });

  it('returns null when the OID is unknown', async () => {
    mockSql.mockResolvedValueOnce([]); // no value-set header row
    const vs = await expandValueSet('0.0.0');
    expect(vs).toBeNull();
  });

  it('returns the cached expansion when a period row exists', async () => {
    mockSql.mockResolvedValueOnce([{ name: 'Diabetes', expansion_version: '2025-05' }]); // header
    mockSql.mockResolvedValueOnce([
      {
        expansion: [{ system: 'http://snomed.info/sct', code: '44054006', display: 'DM2' }],
        expansion_version: '2025-05',
        code_count: 1,
      },
    ]); // cache row
    const vs = await expandValueSet(OID, { measurementPeriod: '2025' });
    expect(vs?.expansion?.total).toBe(1);
    expect(vs?.expansion?.contains?.[0]?.code).toBe('44054006');
  });
});

describe('validateCode', () => {
  it('returns Parameters result=true when the code is a member', async () => {
    mockSql.mockResolvedValueOnce([{ found: 1 }]);
    const out = await validateCode(OID, 'http://snomed.info/sct', '44054006');
    expect(out.resourceType).toBe('Parameters');
    expect(out.parameter.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
  });
  it('returns result=false when not a member', async () => {
    mockSql.mockResolvedValueOnce([]); // no match
    const out = await validateCode(OID, 'http://snomed.info/sct', '99999999');
    expect(out.parameter.find((p) => p.name === 'result')?.valueBoolean).toBe(false);
  });
});
