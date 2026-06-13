// =============================================================================
// Unit tests — Cohort high-risk flags + cohort matching (pure)
// =============================================================================

import { describe, it, expect, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  fn.mockResolvedValue([]);
  return { mockSql: fn };
});
vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, { unsafe: vi.fn(), json: (v: unknown) => v }),
}));

import { flagHyperkalemia, flagGfrLow, flagNewAceArbNoBmp, matchesCohort } from '../cohortFlags.js';

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
