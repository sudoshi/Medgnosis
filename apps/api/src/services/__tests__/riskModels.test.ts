// =============================================================================
// Unit tests — Risk model scorers (pure)
// =============================================================================

import { describe, it, expect } from 'vitest';
import { scoreCha2ds2Vasc } from '../riskModels/cha2ds2vasc.js';
import { scoreGail } from '../riskModels/gail.js';

describe('scoreCha2ds2Vasc', () => {
  it('scores each component correctly', () => {
    // 76yo female, HTN + DM, no CHF/stroke/vascular
    // age>=75 = 2, female = 1, HTN = 1, DM = 1 => 5
    const r = scoreCha2ds2Vasc({ age: 76, gender: 'female', chf: false, htn: true, dm: true, stroke: false, vascular: false });
    expect(r.score).toBe(5);
    expect(r.category).toBe('high');
    expect(r.anticoag_indicated).toBe(true);
    expect(r.components).toMatchObject({ age: 2, sex: 1, htn: 1, dm: 1 });
  });

  it('age 65-74 contributes 1', () => {
    const r = scoreCha2ds2Vasc({ age: 70, gender: 'male', chf: false, htn: false, dm: false, stroke: false, vascular: false });
    expect(r.components.age).toBe(1);
    expect(r.score).toBe(1);
  });

  it('stroke/TIA contributes 2', () => {
    const r = scoreCha2ds2Vasc({ age: 50, gender: 'male', chf: false, htn: false, dm: false, stroke: true, vascular: false });
    expect(r.components.stroke).toBe(2);
    expect(r.score).toBe(2);
  });

  it('low-risk male = 0 low, not anticoag-indicated', () => {
    const r = scoreCha2ds2Vasc({ age: 50, gender: 'male', chf: false, htn: false, dm: false, stroke: false, vascular: false });
    expect(r.score).toBe(0);
    expect(r.category).toBe('low');
    expect(r.anticoag_indicated).toBe(false);
  });

  it('anticoag threshold: >=2 men, >=3 women', () => {
    // male score 2 -> indicated
    expect(scoreCha2ds2Vasc({ age: 70, gender: 'male', chf: true, htn: false, dm: false, stroke: false, vascular: false }).anticoag_indicated).toBe(true);
    // female score 2 (sex 1 + htn 1) -> NOT indicated (needs >=3)
    expect(scoreCha2ds2Vasc({ age: 50, gender: 'female', chf: false, htn: true, dm: false, stroke: false, vascular: false }).anticoag_indicated).toBe(false);
  });
});

describe('scoreGail', () => {
  it('returns insufficient_data when required reproductive/family inputs are absent', () => {
    const r = scoreGail({ age: 55, gender: 'female' });
    expect(r.category).toBe('insufficient_data');
    expect(r.score).toBeNull();
  });
});
