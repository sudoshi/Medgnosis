// =============================================================================
// Unit tests — Wilson 95% confidence interval
// Reference values cross-checked against R: binom::binom.wilson()
// =============================================================================

import { describe, it, expect } from 'vitest';
import { wilsonCI } from '../wilsonCI.js';

describe('wilsonCI', () => {
  it('computes the textbook 50/100 interval', () => {
    const ci = wilsonCI(50, 100);
    expect(ci.lower).toBeCloseTo(0.4038, 3);
    expect(ci.upper).toBeCloseTo(0.5962, 3);
  });

  it('handles a perfect rate without exceeding 1', () => {
    const ci = wilsonCI(10, 10);
    expect(ci.lower).toBeCloseTo(0.7225, 3);
    expect(ci.upper).toBeLessThanOrEqual(1);
    expect(ci.upper).toBeCloseTo(1.0, 3);
  });

  it('handles a zero rate without going below 0', () => {
    const ci = wilsonCI(0, 10);
    expect(ci.lower).toBeGreaterThanOrEqual(0);
    expect(ci.lower).toBeCloseTo(0, 3);
    expect(ci.upper).toBeCloseTo(0.2775, 3);
  });

  it('returns a degenerate interval for an empty denominator', () => {
    expect(wilsonCI(0, 0)).toEqual({ lower: 0, upper: 0 });
  });

  it('narrows as n grows', () => {
    const small = wilsonCI(5, 10);
    const large = wilsonCI(500, 1000);
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
  });
});
