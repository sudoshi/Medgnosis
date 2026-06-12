// =============================================================================
// Unit tests — Data Quality detectors (pure threshold logic)
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

import {
  isImpossibleHeight,
  isImpossibleTemp,
  isImpossibleWeight,
  isImplausibleJump,
  hasEdgeWhitespace,
} from '../dqDetectors.js';

describe('isImpossibleHeight (inches)', () => {
  it('flags out-of-range', () => {
    expect(isImpossibleHeight(985.32)).toBe(true);
    expect(isImpossibleHeight(10)).toBe(true);
    expect(isImpossibleHeight(68)).toBe(false);
  });
});

describe('isImpossibleTemp (F)', () => {
  it('flags out-of-range', () => {
    expect(isImpossibleTemp(212)).toBe(true);
    expect(isImpossibleTemp(60)).toBe(true);
    expect(isImpossibleTemp(98.6)).toBe(false);
  });
});

describe('isImpossibleWeight (lbs)', () => {
  it('flags out-of-range', () => {
    expect(isImpossibleWeight(1480)).toBe(true);
    expect(isImpossibleWeight(0)).toBe(true);
    expect(isImpossibleWeight(180)).toBe(false);
  });
});

describe('isImplausibleJump', () => {
  it('flags large deltas between consecutive readings', () => {
    expect(isImplausibleJump(180, 340, 100)).toBe(true);
    expect(isImplausibleJump(180, 200, 100)).toBe(false);
    expect(isImplausibleJump(null, 200, 100)).toBe(false); // no prior → not a jump
  });
});

describe('hasEdgeWhitespace', () => {
  it('detects leading/trailing whitespace', () => {
    expect(hasEdgeWhitespace('Smith ')).toBe(true);
    expect(hasEdgeWhitespace(' Smith')).toBe(true);
    expect(hasEdgeWhitespace('Smith')).toBe(false);
    expect(hasEdgeWhitespace(null)).toBe(false);
  });
});
