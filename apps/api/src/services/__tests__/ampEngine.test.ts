// =============================================================================
// Unit tests — AMP engine (pure tiering + ROI)
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

import { ampTier, captureRevenue } from '../ampEngine.js';

describe('ampTier', () => {
  it('tier 1 when there is an upcoming appointment (pre-visit)', () => {
    expect(ampTier({ hasUpcomingAppt: true, daysSinceLastSeen: 30 })).toBe(1);
    expect(ampTier({ hasUpcomingAppt: true, daysSinceLastSeen: 9999 })).toBe(1);
  });
  it('tier 3 when not seen in 2+ years (no upcoming)', () => {
    expect(ampTier({ hasUpcomingAppt: false, daysSinceLastSeen: 800 })).toBe(3);
  });
  it('tier 2 when not seen in 1-2 years (no upcoming)', () => {
    expect(ampTier({ hasUpcomingAppt: false, daysSinceLastSeen: 400 })).toBe(2);
  });
  it('null when recently seen with no upcoming appointment', () => {
    expect(ampTier({ hasUpcomingAppt: false, daysSinceLastSeen: 100 })).toBeNull();
    expect(ampTier({ hasUpcomingAppt: false, daysSinceLastSeen: null })).toBe(3); // never seen => drifted away
  });
});

describe('captureRevenue', () => {
  it('multiplies total gap revenue by the capture rate', () => {
    const gaps = [{ net_revenue: 406.1 }, { net_revenue: 11.18 }, { net_revenue: null }];
    expect(captureRevenue(gaps, 1)).toBeCloseTo(417.28, 2);
    expect(captureRevenue(gaps, 0.3)).toBeCloseTo(125.18, 2);
    expect(captureRevenue([], 0.5)).toBe(0);
  });
});
