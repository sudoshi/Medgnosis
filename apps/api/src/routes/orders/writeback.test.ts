// =============================================================================
// Unit tests — Order fulfillment classification + EHR-writeback gate
// =============================================================================

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UserRole } from '@medgnosis/shared';
import {
  DEFAULT_FULFILLMENT_MODE,
  OrderFulfillmentMode,
  evaluateWritebackGate,
  isWritebackEnabled,
  requiresClinicalReview,
  writebackBlockReason,
} from './writeback.js';

const WB_KEYS = [
  'ORDERS_EHR_WRITEBACK_ENABLED',
  'ORDERS_EHR_WRITEBACK_TENANTS',
  'ORDERS_EHR_WRITEBACK_ROLES',
] as const;

function clearWritebackEnv(): void {
  for (const k of WB_KEYS) delete process.env[k];
}

const PROVIDER = { org_id: 'org-1', role: 'provider' as UserRole };

beforeEach(clearWritebackEnv);
afterEach(clearWritebackEnv);

describe('order fulfillment classification', () => {
  it('defaults every order action to an internal recommendation', () => {
    expect(DEFAULT_FULFILLMENT_MODE).toBe(OrderFulfillmentMode.INTERNAL_RECOMMENDATION);
    expect(DEFAULT_FULFILLMENT_MODE).toBe('internal_recommendation');
  });

  it('exposes both classification modes', () => {
    expect(OrderFulfillmentMode.EHR_WRITEBACK).toBe('ehr_writeback');
    expect(OrderFulfillmentMode.INTERNAL_RECOMMENDATION).toBe('internal_recommendation');
  });
});

describe('evaluateWritebackGate', () => {
  it('is closed by default (no env configured)', () => {
    const decision = evaluateWritebackGate(PROVIDER);
    expect(decision).toEqual({ allowed: false, reason: 'writeback_disabled' });
    expect(isWritebackEnabled(PROVIDER)).toBe(false);
  });

  it('stays closed when the global flag is on but the tenant flag is off', () => {
    process.env.ORDERS_EHR_WRITEBACK_ENABLED = 'true';
    process.env.ORDERS_EHR_WRITEBACK_ROLES = 'provider';
    // tenant allowlist intentionally absent
    expect(evaluateWritebackGate(PROVIDER)).toEqual({
      allowed: false,
      reason: 'tenant_not_enabled',
    });
  });

  it('stays closed when the tenant flag is on but the role flag is off', () => {
    process.env.ORDERS_EHR_WRITEBACK_ENABLED = 'true';
    process.env.ORDERS_EHR_WRITEBACK_TENANTS = 'org-1';
    // role allowlist intentionally absent
    expect(evaluateWritebackGate(PROVIDER)).toEqual({
      allowed: false,
      reason: 'role_not_enabled',
    });
  });

  it('opens only when global + tenant + role flags all admit the actor', () => {
    process.env.ORDERS_EHR_WRITEBACK_ENABLED = 'true';
    process.env.ORDERS_EHR_WRITEBACK_TENANTS = 'org-9, org-1';
    process.env.ORDERS_EHR_WRITEBACK_ROLES = 'admin,provider';
    expect(evaluateWritebackGate(PROVIDER)).toEqual({ allowed: true, reason: 'allowed' });
    expect(isWritebackEnabled(PROVIDER)).toBe(true);
  });

  it('does not admit a tenant outside the allowlist even with role enabled', () => {
    process.env.ORDERS_EHR_WRITEBACK_ENABLED = 'true';
    process.env.ORDERS_EHR_WRITEBACK_TENANTS = 'org-2';
    process.env.ORDERS_EHR_WRITEBACK_ROLES = 'provider';
    expect(isWritebackEnabled(PROVIDER)).toBe(false);
  });
});

describe('clinical-review guard', () => {
  it('requires review for an unreviewed (generated/auto) order', () => {
    expect(requiresClinicalReview({})).toBe(true);
    expect(requiresClinicalReview({ clinically_reviewed: false })).toBe(true);
  });

  it('clears review once a clinician has reviewed', () => {
    expect(requiresClinicalReview({ clinically_reviewed: true })).toBe(false);
  });
});

describe('writebackBlockReason', () => {
  it('blocks on the gate before considering review when writeback is disabled', () => {
    expect(writebackBlockReason(PROVIDER, { clinically_reviewed: true })).toBe('writeback_disabled');
  });

  it('blocks an enabled-actor + reviewed order nowhere (allows)', () => {
    process.env.ORDERS_EHR_WRITEBACK_ENABLED = 'true';
    process.env.ORDERS_EHR_WRITEBACK_TENANTS = 'org-1';
    process.env.ORDERS_EHR_WRITEBACK_ROLES = 'provider';
    expect(writebackBlockReason(PROVIDER, { clinically_reviewed: true })).toBeNull();
  });

  it('blocks on review even when the gate is fully open if the order is unreviewed', () => {
    process.env.ORDERS_EHR_WRITEBACK_ENABLED = 'true';
    process.env.ORDERS_EHR_WRITEBACK_TENANTS = 'org-1';
    process.env.ORDERS_EHR_WRITEBACK_ROLES = 'provider';
    expect(writebackBlockReason(PROVIDER, { clinically_reviewed: false })).toBe('review_required');
  });
});
