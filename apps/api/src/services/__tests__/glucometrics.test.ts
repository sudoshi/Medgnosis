// =============================================================================
// Unit tests — Glucometrics two-rule triage
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

import { glucoseRisk, avg24h } from '../glucometrics.js';

const TH = { single: 300, avg24h: 180 };

describe('avg24h', () => {
  it('averages readings within the last 24h', () => {
    const readings = [
      { glucose_mgdl: 200, reading_datetime: '2026-06-12T08:00:00Z' },
      { glucose_mgdl: 160, reading_datetime: '2026-06-12T02:00:00Z' },
      { glucose_mgdl: 999, reading_datetime: '2026-06-09T08:00:00Z' }, // >24h ago, excluded
    ];
    expect(avg24h(readings, '2026-06-12T10:00:00Z')).toBe(180);
  });
  it('returns null with no recent readings', () => {
    expect(avg24h([], '2026-06-12T10:00:00Z')).toBeNull();
  });
});

describe('glucoseRisk', () => {
  it('high on a single severe excursion (>=300)', () => {
    const readings = [{ glucose_mgdl: 320, reading_datetime: '2026-06-12T08:00:00Z' }];
    const r = glucoseRisk(readings, '2026-06-12T10:00:00Z', TH);
    expect(r.highRisk).toBe(true);
    expect(r.reasons).toContain('severe_excursion');
  });
  it('high on persistent elevation (24h-avg >=180)', () => {
    const readings = [
      { glucose_mgdl: 190, reading_datetime: '2026-06-12T08:00:00Z' },
      { glucose_mgdl: 200, reading_datetime: '2026-06-12T04:00:00Z' },
    ];
    const r = glucoseRisk(readings, '2026-06-12T10:00:00Z', TH);
    expect(r.highRisk).toBe(true);
    expect(r.reasons).toContain('persistent');
  });
  it('low when controlled', () => {
    const readings = [
      { glucose_mgdl: 120, reading_datetime: '2026-06-12T08:00:00Z' },
      { glucose_mgdl: 140, reading_datetime: '2026-06-12T04:00:00Z' },
    ];
    const r = glucoseRisk(readings, '2026-06-12T10:00:00Z', TH);
    expect(r.highRisk).toBe(false);
    expect(r.reasons).toHaveLength(0);
  });
});
