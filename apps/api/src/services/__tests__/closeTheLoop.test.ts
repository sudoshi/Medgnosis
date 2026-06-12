// =============================================================================
// Unit tests — Close the Loop (pure obligation/closure logic)
// =============================================================================

import { describe, it, expect, vi } from 'vitest';

// Module imports @medgnosis/db (connects on import) — mock it; pure tests never call sql.
const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  fn.mockResolvedValue([]);
  return { mockSql: fn };
});
vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, { unsafe: vi.fn(), json: (v: unknown) => v }),
}));

import {
  severityOf,
  windowDaysFor,
  dueDate,
  classifyClosure,
  type GuidelineWindow,
} from '../closeTheLoop.js';

const GUIDELINE: GuidelineWindow[] = [
  { severity: 'critical', obligation: 'review_abnormal', window_days: 1 },
  { severity: 'high', obligation: 'review_abnormal', window_days: 14 },
  { severity: 'routine', obligation: 'review_abnormal', window_days: 30 },
];

describe('severityOf', () => {
  it('critical_flag wins', () => {
    expect(severityOf({ critical_flag: true, abnormal_flag: 'H' })).toBe('critical');
  });
  it('abnormal flags map to high', () => {
    expect(severityOf({ critical_flag: false, abnormal_flag: 'H' })).toBe('high');
    expect(severityOf({ critical_flag: false, abnormal_flag: 'L' })).toBe('high');
    expect(severityOf({ critical_flag: false, abnormal_flag: 'AA' })).toBe('high');
  });
  it('no flags -> routine', () => {
    expect(severityOf({ critical_flag: false, abnormal_flag: null })).toBe('routine');
    expect(severityOf({ critical_flag: false, abnormal_flag: '' })).toBe('routine');
  });
});

describe('windowDaysFor', () => {
  it('maps severity to its window via guideline rows', () => {
    expect(windowDaysFor('critical', GUIDELINE)).toBe(1);
    expect(windowDaysFor('high', GUIDELINE)).toBe(14);
    expect(windowDaysFor('routine', GUIDELINE)).toBe(30);
  });
  it('falls back to 30 when severity not present', () => {
    expect(windowDaysFor('high', [])).toBe(30);
  });
});

describe('dueDate', () => {
  it('adds window days to the identified date (deterministic, no clock)', () => {
    expect(dueDate('2026-01-01', 14)).toBe('2026-01-15');
    expect(dueDate('2026-01-01', 1)).toBe('2026-01-02');
  });
});

describe('classifyClosure', () => {
  it('reviewed when reviewed_datetime present', () => {
    expect(classifyClosure({ reviewed_datetime: '2026-01-02T00:00:00Z', hasFollowupOrder: false })).toBe('reviewed');
  });
  it('followup_order when a follow-up order exists', () => {
    expect(classifyClosure({ reviewed_datetime: null, hasFollowupOrder: true })).toBe('followup_order');
  });
  it('null (open) when neither', () => {
    expect(classifyClosure({ reviewed_datetime: null, hasFollowupOrder: false })).toBeNull();
  });
});
