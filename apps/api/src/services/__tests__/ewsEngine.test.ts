// =============================================================================
// Unit tests — generic early-warning scoring engine (MEWS + NEWS2)
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

import { fToC, scoreVitals, mewsAction, news2Band, type Band } from '../ewsEngine.js';

// MEWS bands (subset, mirrors seeded {parameter,min,max,points})
const MEWS_BANDS: Band[] = [
  { parameter: 'temp_c', min: null, max: 35.0, points: 2 },
  { parameter: 'temp_c', min: 35.1, max: 38.4, points: 0 },
  { parameter: 'temp_c', min: 38.5, max: null, points: 2 },
  { parameter: 'heart_rate', min: 111, max: 129, points: 2 },
  { parameter: 'heart_rate', min: 51, max: 100, points: 0 },
  { parameter: 'resp_rate', min: 21, max: 29, points: 2 },
  { parameter: 'resp_rate', min: 10, max: 18, points: 0 },
  { parameter: 'systolic_bp', min: 81, max: 100, points: 1 },
  { parameter: 'systolic_bp', min: 101, max: 199, points: 0 },
  { parameter: 'gcs', min: 15, max: 15, points: 0 },
];
const MEWS_LADDER = [
  { score_min: 0, score_max: 2, action: 'Routine monitoring', owner: 'Bedside RN' },
  { score_min: 3, score_max: 3, action: 'Increased nursing surveillance', owner: 'Bedside RN' },
  { score_min: 4, score_max: 4, action: 'Notify provider', owner: 'RN -> Provider' },
  { score_min: 5, score_max: null, action: 'Rapid-response team + notify provider stat', owner: 'RRT' },
];

const NEWS2_DISCRETE: Band[] = [
  { parameter: 'on_oxygen', value: false, points: 0 },
  { parameter: 'on_oxygen', value: true, points: 2 },
  { parameter: 'consciousness', value: 'A', points: 0 },
  { parameter: 'consciousness', value: 'CVPU', points: 3 },
];
const NEWS2_TRIGGERS = [
  { band: 'low', aggregate_min: 0, aggregate_max: 4, response: 'Ward-based response' },
  { band: 'low-medium', single_param_score: 3, response: 'Urgent ward review' },
  { band: 'medium', aggregate_min: 5, aggregate_max: 6, response: 'Urgent team response' },
  { band: 'high', aggregate_min: 7, aggregate_max: null, response: 'Emergency response' },
];

describe('fToC', () => {
  it('converts Fahrenheit to Celsius', () => {
    expect(fToC(98.6)).toBeCloseTo(37.0, 1);
    expect(fToC(95.0)).toBeCloseTo(35.0, 1);
  });
});

describe('scoreVitals — MEWS worked example', () => {
  it('HR118 RR22 SBP100 temp36 GCS15 -> total 5', () => {
    const r = scoreVitals(
      { heart_rate: 118, resp_rate: 22, systolic_bp: 100, temp_c: 36.0, gcs: 15 },
      MEWS_BANDS,
    );
    expect(r.total).toBe(5);
    expect(r.components).toMatchObject({ heart_rate: 2, resp_rate: 2, systolic_bp: 1, temp_c: 0, gcs: 0 });
    expect(r.maxSingleParam).toBe(2);
  });
});

describe('scoreVitals — discrete bands (NEWS2)', () => {
  it('on_oxygen true -> 2; consciousness CVPU -> 3', () => {
    expect(scoreVitals({ on_oxygen: true }, NEWS2_DISCRETE).total).toBe(2);
    expect(scoreVitals({ consciousness: 'CVPU' }, NEWS2_DISCRETE).total).toBe(3);
    expect(scoreVitals({ on_oxygen: false, consciousness: 'A' }, NEWS2_DISCRETE).total).toBe(0);
  });
});

describe('mewsAction', () => {
  it('score 5 -> RRT', () => {
    expect(mewsAction(5, MEWS_LADDER)).toMatchObject({ owner: 'RRT' });
    expect(mewsAction(5, MEWS_LADDER)?.action).toMatch(/rapid-response/i);
  });
  it('score 2 -> routine', () => {
    expect(mewsAction(2, MEWS_LADDER)?.action).toMatch(/routine/i);
  });
});

describe('news2Band', () => {
  it('aggregate 7 -> high', () => {
    expect(news2Band(7, 3, NEWS2_TRIGGERS).band).toBe('high');
  });
  it('aggregate 3, no single-3 -> low', () => {
    expect(news2Band(3, 1, NEWS2_TRIGGERS).band).toBe('low');
  });
  it('aggregate 2 with a single param = 3 -> low-medium', () => {
    expect(news2Band(2, 3, NEWS2_TRIGGERS).band).toBe('low-medium');
  });
});
