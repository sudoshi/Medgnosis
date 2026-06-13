// =============================================================================
// Unit tests — Cohort high-risk flags + cohort matching (pure)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  fn.mockResolvedValue([]);
  return { mockSql: fn };
});
vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, { unsafe: vi.fn(), json: (v: unknown) => v }),
}));

import { flagHyperkalemia, flagGfrLow, flagNewAceArbNoBmp, matchesCohort, runCohortFlags } from '../cohortFlags.js';

describe('flagHyperkalemia', () => {
  it('flags K >= 5.5', () => {
    expect(flagHyperkalemia(5.8)).toBe(true);
    expect(flagHyperkalemia(4.2)).toBe(false);
    expect(flagHyperkalemia(null)).toBe(false);
  });
});

describe('flagGfrLow', () => {
  it('flags GFR < 30', () => {
    expect(flagGfrLow(22)).toBe(true);
    expect(flagGfrLow(45)).toBe(false);
    expect(flagGfrLow(null)).toBe(false);
  });
});

describe('flagNewAceArbNoBmp', () => {
  it('flags on ACE/ARB without a recent BMP', () => {
    expect(flagNewAceArbNoBmp({ onAceArb: true, hasRecentBmp: false })).toBe(true);
    expect(flagNewAceArbNoBmp({ onAceArb: true, hasRecentBmp: true })).toBe(false);
    expect(flagNewAceArbNoBmp({ onAceArb: false, hasRecentBmp: false })).toBe(false);
  });
});

describe('matchesCohort', () => {
  const criteria = { conditions: ['N18.3', 'N18.4'], flags: ['GFR_LOW'] };
  it('matches when a condition prefix and a required flag are present', () => {
    expect(matchesCohort({ conditions: ['N18.32'], flags: ['GFR_LOW'] }, criteria)).toBe(true);
  });
  it('fails when the required flag is absent', () => {
    expect(matchesCohort({ conditions: ['N18.32'], flags: [] }, criteria)).toBe(false);
  });
  it('fails when no condition prefix matches', () => {
    expect(matchesCohort({ conditions: ['E11.9'], flags: ['GFR_LOW'] }, criteria)).toBe(false);
  });
  it('with no flag requirement, condition match suffices', () => {
    expect(matchesCohort({ conditions: ['N18.4'], flags: [] }, { conditions: ['N18.4'] })).toBe(true);
  });
});

describe('runCohortFlags (VSAC-driven ACE/ARB)', () => {
  const ACE_OID = '2.16.840.1.113883.3.526.2.39';
  const SUPPRESS_OID_1 = '2.16.840.1.113883.3.526.2.1256';
  const SUPPRESS_OID_2 = '2.16.840.1.113883.3.526.2.1257';

  beforeEach(() => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([]);
  });

  it('throws when ACEARB_RXNORM_VALUE_SET_OID rule row is missing', async () => {
    // acearbOid lookup returns empty → no rule row → must throw
    mockSql.mockResolvedValueOnce([]);
    await expect(runCohortFlags()).rejects.toThrow('ACEARB_RXNORM_VALUE_SET_OID missing');
  });

  it('queries the cohort with the OID from clinical_rule and returns flag counts', async () => {
    // Call[0]: acearbOid lookup
    mockSql.mockResolvedValueOnce([{ value_text: ACE_OID }]);
    // Call[1]: suppressOids lookup (two suppress sets)
    mockSql.mockResolvedValueOnce([{ value_text: SUPPRESS_OID_1 }, { value_text: SUPPRESS_OID_2 }]);
    // Call[2]: suppress fragment sql`` interpolation (always fires — empty or populated)
    // Call[3]: cohort query — one patient on ACE/ARB, no recent BMP
    mockSql.mockResolvedValueOnce([]); // fragment
    mockSql.mockResolvedValueOnce([
      { patient_id: 1, latest_k: null, latest_gfr: null, on_acearb: true, has_recent_bmp: false },
    ]);
    // remaining setFlag calls → default []
    mockSql.mockResolvedValue([]);

    const result = await runCohortFlags();
    expect(result.cohort).toBe(1);
    expect(result.byFlag['NEW_ACEARB_NO_BMP']).toBe(1);
    expect(result.byFlag['HYPERKALEMIA']).toBe(0);
    expect(result.byFlag['GFR_LOW']).toBe(0);
    // Verify acearbOid reached the cohort query (call[3], values start at slice(1))
    const cohortCallValues = (mockSql.mock.calls[3] ?? []).slice(1) as unknown[];
    expect(cohortCallValues).toContain(ACE_OID);
  });

  it('passes suppress OIDs to the suppression fragment when present', async () => {
    mockSql.mockResolvedValueOnce([{ value_text: ACE_OID }]);
    mockSql.mockResolvedValueOnce([{ value_text: SUPPRESS_OID_1 }]);
    mockSql.mockResolvedValue([]);

    await runCohortFlags();
    // Call[2] is the suppress fragment; its values include the suppress array
    const fragmentValues = (mockSql.mock.calls[2] ?? []).slice(1) as unknown[];
    expect(fragmentValues).toContainEqual([SUPPRESS_OID_1]);
  });

  it('still runs when suppress OID list is empty (no allergy/intolerance rules)', async () => {
    mockSql.mockResolvedValueOnce([{ value_text: ACE_OID }]);
    mockSql.mockResolvedValueOnce([]); // empty suppress list
    mockSql.mockResolvedValue([]);

    // Must not throw — empty suppress list = no suppression fragment, no error
    await expect(runCohortFlags()).resolves.toMatchObject({ cohort: 0 });
    // Verify acearbOid still reached call[3]
    const cohortCallValues = (mockSql.mock.calls[3] ?? []).slice(1) as unknown[];
    expect(cohortCallValues).toContain(ACE_OID);
  });
});
