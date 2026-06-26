// =============================================================================
// Unit tests — Auto-Orders (pure eligibility/cadence helpers)
// =============================================================================

import { beforeEach, describe, it, expect, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  fn.mockResolvedValue([]);
  return { mockSql: fn };
});
const { mockSystemAudit } = vi.hoisted(() => ({ mockSystemAudit: vi.fn() }));

vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, { unsafe: vi.fn(), json: (v: unknown) => v }),
}));
vi.mock('../auditLog.js', () => ({
  writeSystemAuditLog: mockSystemAudit,
  writeAuditLog: vi.fn(),
}));

import { isExcluded, isItemDue, expiryDate, generateForEnrollments } from '../autoOrders.js';

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

describe('generateForEnrollments', () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSystemAudit.mockReset();
  });

  it('emits a PHI-safe aggregate audit row with internal-recommendation mode', async () => {
    let call = 0;
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.protocol_enrollment')) {
        return Promise.resolve([
          {
            enrollment_id: 11,
            patient_id: 501,
            item_id: 90,
            interval_days: 180,
            item_name: 'A1c',
            item_type: 'lab',
            loinc_code: '4548-4',
            cpt_code: null,
          },
        ]);
      }
      if (text.includes('MAX(order_datetime)')) {
        // Never previously ordered → due.
        return Promise.resolve([{ d: null }]);
      }
      // INSERT INTO phm_edw.clinical_order
      call += 1;
      return Promise.resolve([]);
    });

    const result = await generateForEnrollments();

    expect(result).toEqual({ enrollments: 1, generated: 1 });
    expect(call).toBe(1);

    expect(mockSystemAudit).toHaveBeenCalledTimes(1);
    const [action, resourceType, resourceId, details] = mockSystemAudit.mock.calls[0] as [
      string,
      string,
      string,
      Record<string, unknown>,
    ];
    expect(action).toBe('generate');
    expect(resourceType).toBe('clinical_order');
    expect(resourceId).toBe('autoorders-1');
    expect(details).toMatchObject({
      cohort_bound: true,
      enrollment_bound: true,
      enrollment_count: 1,
      order_count: 1,
      fulfillment_mode: 'internal_recommendation',
      writeback_attempted: false,
      clinical_review_required: true,
    });

    // PHI-safe: no patient / order / LOINC identifiers in the audit details.
    const serialized = JSON.stringify(details);
    expect(serialized).not.toContain('501');
    expect(serialized).not.toContain('4548-4');
    expect(serialized).not.toContain('A1c');
  });
});
