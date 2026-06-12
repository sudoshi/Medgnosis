// =============================================================================
// Unit tests — Auto-Referral MTM (pure uncontrolled detection + state machine)
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

import { isUncontrolled, nextMtmStatus, type Threshold } from '../mtmReferral.js';

const THRESHOLDS: Threshold[] = [
  { condition: 'diabetes', code: '4548-4', op: '>=', value: 9.0 },
  { condition: 'hypertension', code: 'SBP', op: '>=', value: 140 },
  { condition: 'hyperlipidemia', code: '18262-6', op: '>=', value: 100 },
];

describe('isUncontrolled', () => {
  it('A1c 9.5 is uncontrolled (>=9)', () => {
    expect(isUncontrolled('diabetes', 9.5, THRESHOLDS)).toBe(true);
  });
  it('A1c 7.0 is controlled', () => {
    expect(isUncontrolled('diabetes', 7.0, THRESHOLDS)).toBe(false);
  });
  it('SBP 130 is controlled (<140)', () => {
    expect(isUncontrolled('hypertension', 130, THRESHOLDS)).toBe(false);
  });
  it('LDL 110 is uncontrolled (>=100)', () => {
    expect(isUncontrolled('hyperlipidemia', 110, THRESHOLDS)).toBe(true);
  });
  it('unknown condition is never uncontrolled', () => {
    expect(isUncontrolled('asthma', 999, THRESHOLDS)).toBe(false);
  });
});

describe('nextMtmStatus', () => {
  it('referred + at goal -> at_goal', () => {
    expect(nextMtmStatus('referred', true)).toBe('at_goal');
  });
  it('managed + at goal -> at_goal', () => {
    expect(nextMtmStatus('managed', true)).toBe('at_goal');
  });
  it('at_goal -> repatriated (sustained)', () => {
    expect(nextMtmStatus('at_goal', true)).toBe('repatriated');
  });
  it('referred + not at goal -> managed (pharmacist actively managing)', () => {
    expect(nextMtmStatus('referred', false)).toBe('managed');
  });
  it('repatriated stays repatriated', () => {
    expect(nextMtmStatus('repatriated', true)).toBe('repatriated');
  });
});
