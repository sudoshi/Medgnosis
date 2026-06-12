// =============================================================================
// Unit tests — Auto-Orders (pure eligibility/cadence helpers)
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

import { isExcluded, isItemDue, expiryDate } from '../autoOrders.js';

describe('isExcluded', () => {
  it('excludes hospice / palliative / inactive', () => {
    expect(isExcluded({ hospice: true, palliative: false, inactive: false })).toBe(true);
    expect(isExcluded({ hospice: false, palliative: true, inactive: false })).toBe(true);
    expect(isExcluded({ hospice: false, palliative: false, inactive: true })).toBe(true);
  });
  it('includes an active, non-palliative patient', () => {
    expect(isExcluded({ hospice: false, palliative: false, inactive: false })).toBe(false);
  });
});

describe('isItemDue', () => {
  it('is due when never ordered', () => {
    expect(isItemDue(null, 180, '2026-06-12')).toBe(true);
  });
  it('is not due within the interval', () => {
    expect(isItemDue('2026-05-01', 180, '2026-06-12')).toBe(false);
  });
  it('is due once the interval has elapsed', () => {
    expect(isItemDue('2025-01-01', 180, '2026-06-12')).toBe(true);
  });
});

describe('expiryDate', () => {
  it('is five years after enrollment', () => {
    expect(expiryDate('2026-06-12')).toBe('2031-06-12');
  });
});
