// =============================================================================
// Medgnosis API — Order fulfillment classification + EHR-writeback gating
// -----------------------------------------------------------------------------
// Every order action is classified as either an INTERNAL recommendation (a
// decision-support suggestion that never leaves Medgnosis) or an EHR_WRITEBACK
// (a mutation pushed back into an external EHR). Today every generated, auto-,
// and provider-placed order is an INTERNAL recommendation: nothing is written
// back. Any future writeback path is gated behind BOTH a tenant feature flag
// AND a role feature flag, and is DEFAULT OFF.
//
// This gate is intentionally local to the orders module — it does not belong in
// packages/shared/constants. It mirrors the env-driven, default-false flag
// pattern in src/config.ts (optionalBool / optionalList) without coupling to it.
// =============================================================================

import type { UserRole } from '@medgnosis/shared';

// ─── Classification ───────────────────────────────────────────────────────────

/**
 * How an order action is fulfilled.
 *
 * - INTERNAL_RECOMMENDATION: decision support only. The order lives in
 *   phm_edw.clinical_order and is surfaced to clinicians; it is NEVER pushed to
 *   an external EHR. This is the mode for ALL current generated/auto/placed
 *   orders.
 * - EHR_WRITEBACK: the action would mutate an external EHR (e.g. POST a FHIR
 *   ServiceRequest to a connected system). Gated, default off, and requires
 *   clinical review before it could act.
 */
export const OrderFulfillmentMode = {
  INTERNAL_RECOMMENDATION: 'internal_recommendation',
  EHR_WRITEBACK: 'ehr_writeback',
} as const;

export type OrderFulfillmentMode =
  (typeof OrderFulfillmentMode)[keyof typeof OrderFulfillmentMode];

/**
 * The fulfillment mode for every order action Medgnosis takes today. Generated,
 * auto-, and provider-placed orders are internal recommendations only — they
 * are surfaced for clinical action but are never written back to an EHR.
 */
export const DEFAULT_FULFILLMENT_MODE: OrderFulfillmentMode =
  OrderFulfillmentMode.INTERNAL_RECOMMENDATION;

// ─── Local env helpers (mirror config.ts, scoped to this module) ──────────────

function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val === 'true';
}

function envList(key: string): readonly string[] {
  const val = process.env[key];
  if (!val) return [];
  return val
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// ─── Feature-flag gate (tenant flag AND role flag, default OFF) ────────────────

export interface WritebackActor {
  org_id: string;
  role: UserRole;
}

export interface WritebackGateDecision {
  allowed: boolean;
  /** Stable reason code — PHI-safe, suitable for audit details. */
  reason:
    | 'allowed'
    | 'writeback_disabled'
    | 'tenant_not_enabled'
    | 'role_not_enabled';
}

/**
 * Reads the writeback gate from the environment on each call so that tenant /
 * role allowlists can be reconfigured without a process restart and so tests
 * can drive it deterministically.
 *
 * EHR writeback is enabled for an actor only when ALL hold:
 *   1. ORDERS_EHR_WRITEBACK_ENABLED === 'true'           (global kill-switch, default off)
 *   2. actor.org_id ∈ ORDERS_EHR_WRITEBACK_TENANTS       (tenant feature flag, default empty)
 *   3. actor.role  ∈ ORDERS_EHR_WRITEBACK_ROLES          (role feature flag, default empty)
 *
 * With no env configured the gate is closed — internal recommendations only.
 */
export function evaluateWritebackGate(actor: WritebackActor): WritebackGateDecision {
  if (!envBool('ORDERS_EHR_WRITEBACK_ENABLED', false)) {
    return { allowed: false, reason: 'writeback_disabled' };
  }

  const tenants = envList('ORDERS_EHR_WRITEBACK_TENANTS');
  if (!tenants.includes(actor.org_id)) {
    return { allowed: false, reason: 'tenant_not_enabled' };
  }

  const roles = envList('ORDERS_EHR_WRITEBACK_ROLES');
  if (!roles.includes(actor.role)) {
    return { allowed: false, reason: 'role_not_enabled' };
  }

  return { allowed: true, reason: 'allowed' };
}

/** True only when both the tenant and role writeback flags admit the actor. */
export function isWritebackEnabled(actor: WritebackActor): boolean {
  return evaluateWritebackGate(actor).allowed;
}

// ─── Clinical-review guard ─────────────────────────────────────────────────────

/**
 * An order may only travel a writeback path once a clinician has reviewed it.
 * Generated/auto orders are created in a 'Future' / 'Ordered' decision-support
 * state and are NOT clinically reviewed at generation time, so they can never
 * be written back. This guard is the single chokepoint a future writeback
 * implementation must pass.
 */
export function requiresClinicalReview(order: { clinically_reviewed?: boolean }): boolean {
  return order.clinically_reviewed !== true;
}

/**
 * Combined precondition for any EHR-writeback side effect. Returns the reason it
 * is blocked, or null when the action may proceed. PHI-safe — returns codes
 * only, never patient/order identifiers.
 */
export function writebackBlockReason(
  actor: WritebackActor,
  order: { clinically_reviewed?: boolean },
): 'writeback_disabled' | 'tenant_not_enabled' | 'role_not_enabled' | 'review_required' | null {
  const gate = evaluateWritebackGate(actor);
  if (!gate.allowed) {
    return gate.reason === 'allowed' ? null : gate.reason;
  }
  if (requiresClinicalReview(order)) {
    return 'review_required';
  }
  return null;
}
