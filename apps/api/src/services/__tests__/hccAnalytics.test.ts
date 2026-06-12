// =============================================================================
// Unit tests — HCC / coding analytics (pure)
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

import { captureRate, emShift, isHccRelevant } from '../hccAnalytics.js';

describe('captureRate', () => {
  it('is coded/evident as a rounded percent', () => {
    expect(captureRate(623, 915)).toBe(68);
    expect(captureRate(1, 2)).toBe(50);
  });
  it('is 0 when there is nothing evident', () => {
    expect(captureRate(0, 0)).toBe(0);
  });
});

describe('emShift', () => {
  it('summarizes level distribution + pct level 4+', () => {
    const r = emShift({ '99213': 157, '99214': 156, '99215': 145 });
    expect(r.level3).toBe(157);
    expect(r.level4).toBe(156);
    expect(r.level5).toBe(145);
    expect(r.total).toBe(458);
    expect(r.pct_level4plus).toBe(66); // (156+145)/458
  });
  it('handles empty', () => {
    expect(emShift({}).total).toBe(0);
    expect(emShift({}).pct_level4plus).toBe(0);
  });
});

describe('isHccRelevant', () => {
  it('matches the HCC-relevant prefixes', () => {
    expect(isHccRelevant('E11.22')).toBe(true);
    expect(isHccRelevant('I50.32')).toBe(true);
    expect(isHccRelevant('N18.4')).toBe(true);
    expect(isHccRelevant('E66.01')).toBe(true);
    expect(isHccRelevant('I48.0')).toBe(true);
    expect(isHccRelevant('J45.909')).toBe(false);
    expect(isHccRelevant('I10')).toBe(false);
  });
});
