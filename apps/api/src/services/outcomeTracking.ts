// =============================================================================
// Medgnosis API — Close-the-Loop clinical outcome tracking
// "The denominator is the deliverable." Every close-the-loop obligation has a
// measurable outcome: did the gap close, the order complete, the referral
// finish, the alert get acknowledged, the patient get reached — and within
// what window? This computes REAL numerator/denominator rates over an explicit
// 30/60/90-day window from the rows that actually exist, with provider scoping
// and bounded, index-backed aggregate queries (no full EDW value scans).
//
// Each outcome metric is a single COUNT(*) ... FILTER aggregate over a date-
// windowed slice of a small/indexed operational table (care_gap, clinical_order,
// referral, clinical_alerts, amp_outreach). The pure derivation (rate, window
// cutoff, summary) is unit-tested independently of the DB.
// =============================================================================

import { sql } from '@medgnosis/db';

// ─── Outcome taxonomy ────────────────────────────────────────────────────────

export type OutcomeType =
  | 'gap_closure'
  | 'order_completion'
  | 'referral_completion'
  | 'alert_acknowledgment'
  | 'patient_outreach';

export const OUTCOME_TYPES: readonly OutcomeType[] = [
  'gap_closure',
  'order_completion',
  'referral_completion',
  'alert_acknowledgment',
  'patient_outreach',
] as const;

/** Allowed look-back windows in days. Bounded set — never an arbitrary scan. */
export const OUTCOME_WINDOW_DAYS = [30, 60, 90] as const;
export type OutcomeWindowDays = (typeof OUTCOME_WINDOW_DAYS)[number];

export const DEFAULT_OUTCOME_WINDOW_DAYS: OutcomeWindowDays = 90;

/** Aggregate counts a window query returns. Numerator never exceeds eligible. */
export interface OutcomeCounts {
  /** Denominator: obligations whose clock started inside the window. */
  eligible: number;
  /** Numerator: obligations that reached their terminal "closed" state. */
  met: number;
}

/** A single outcome metric: real numerator/denominator + derived rate. */
export interface OutcomeMetric extends OutcomeCounts {
  outcome: OutcomeType;
  /** Human-facing label for the numerator action ("closed", "completed", …). */
  numerator_label: string;
  /** Human-facing label for the denominator population ("eligible gaps", …). */
  denominator_label: string;
  /** met / eligible, rounded to 4 dp; null when eligible = 0 (undefined rate). */
  rate: number | null;
  /** Count still open (eligible − met) — the close-the-loop backlog. */
  open: number;
}

export interface OutcomeWindowReport {
  window_days: OutcomeWindowDays;
  /** Inclusive lower bound (ISO date) of the look-back window. */
  window_start: string;
  /** Upper bound (ISO date) — the as-of date the window is measured against. */
  as_of: string;
  /** True when the report is scoped to a single provider's panel. */
  provider_scoped: boolean;
  metrics: OutcomeMetric[];
  /** Roll-up across every outcome type (sum of numerators / denominators). */
  overall: OutcomeMetric;
}

// ─── Pure helpers (no DB, no clock) ──────────────────────────────────────────

/**
 * Coerce an arbitrary query value into one of the allowed windows. Anything
 * unrecognised collapses to the default — callers never get an unbounded scan.
 */
export function parseWindowDays(raw: unknown): OutcomeWindowDays {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN;
  return (OUTCOME_WINDOW_DAYS as readonly number[]).includes(n)
    ? (n as OutcomeWindowDays)
    : DEFAULT_OUTCOME_WINDOW_DAYS;
}

/**
 * Lower bound of the window: `windowDays` before `asOf`. Deterministic — the
 * caller supplies the as-of date (default = today at the route boundary) so the
 * computation is reproducible and testable without reading the clock.
 */
export function windowStart(asOfISO: string, windowDays: number): string {
  const d = new Date(`${asOfISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - windowDays);
  return d.toISOString().slice(0, 10);
}

/** met / eligible → rate in [0,1] (4 dp). Null when the denominator is zero. */
export function rate(counts: OutcomeCounts): number | null {
  if (counts.eligible <= 0) return null;
  return Math.round((counts.met / counts.eligible) * 10_000) / 10_000;
}

const LABELS: Record<OutcomeType, { numerator: string; denominator: string }> = {
  gap_closure: { numerator: 'closed', denominator: 'eligible care gaps' },
  order_completion: { numerator: 'completed', denominator: 'placed orders' },
  referral_completion: { numerator: 'completed', denominator: 'placed referrals' },
  alert_acknowledgment: { numerator: 'acknowledged', denominator: 'actionable alerts' },
  patient_outreach: { numerator: 'reached', denominator: 'outreach attempts' },
};

/** Assemble a full metric (rate + open backlog) from raw window counts. */
export function summarizeOutcome(outcome: OutcomeType, counts: OutcomeCounts): OutcomeMetric {
  const eligible = Math.max(0, counts.eligible);
  const met = Math.min(Math.max(0, counts.met), eligible);
  return {
    outcome,
    eligible,
    met,
    open: eligible - met,
    rate: rate({ eligible, met }),
    numerator_label: LABELS[outcome].numerator,
    denominator_label: LABELS[outcome].denominator,
  };
}

/** Roll every per-type metric into one overall numerator/denominator rate. */
export function rollupOverall(metrics: OutcomeMetric[]): OutcomeMetric {
  const eligible = metrics.reduce((s, m) => s + m.eligible, 0);
  const met = metrics.reduce((s, m) => s + m.met, 0);
  return {
    outcome: 'gap_closure', // overall is not a real type; outcome field unused by caller
    eligible,
    met,
    open: eligible - met,
    rate: rate({ eligible, met }),
    numerator_label: 'closed-the-loop',
    denominator_label: 'tracked obligations',
  };
}

// ─── Bounded window queries (one indexed aggregate per outcome type) ──────────
//
// Every query is a single grouped aggregate over a date-windowed, optionally
// provider-scoped slice of a small/indexed operational table. No per-row loops,
// no joins to high-cardinality fact tables, no value scans. Provider scoping
// joins phm_edw.patient(pcp_provider_id) which is the panel-attribution column
// the care-gap routes already use.

function scopeByProvider(providerId: number | null) {
  return providerId == null
    ? sql``
    : sql`AND p.pcp_provider_id = ${providerId}`;
}

async function countOutcome(rows: { eligible: number | null; met: number | null }[]): Promise<OutcomeCounts> {
  const r = rows[0];
  return { eligible: Number(r?.eligible ?? 0), met: Number(r?.met ?? 0) };
}

/** Gap closure: care gaps identified in the window, closed = resolved_date set. */
export async function gapClosureCounts(
  windowStartISO: string,
  asOfISO: string,
  providerId: number | null,
): Promise<OutcomeCounts> {
  const rows = await sql<{ eligible: number; met: number }[]>`
    SELECT
      COUNT(*)::int AS eligible,
      COUNT(*) FILTER (
        WHERE cg.gap_status = 'closed' AND cg.resolved_date IS NOT NULL
      )::int AS met
    FROM phm_edw.care_gap cg
    JOIN phm_edw.patient p ON p.patient_id = cg.patient_id
    WHERE cg.active_ind = 'Y'
      AND cg.identified_date >= ${windowStartISO}::date
      AND cg.identified_date <  (${asOfISO}::date + 1)
      ${scopeByProvider(providerId)}
  `;
  return countOutcome(rows);
}

/** Order completion: orders placed in the window, completed = Resulted/Completed. */
export async function orderCompletionCounts(
  windowStartISO: string,
  asOfISO: string,
  providerId: number | null,
): Promise<OutcomeCounts> {
  const rows = await sql<{ eligible: number; met: number }[]>`
    SELECT
      COUNT(*)::int AS eligible,
      COUNT(*) FILTER (
        WHERE co.order_status IN ('Resulted', 'Completed')
      )::int AS met
    FROM phm_edw.clinical_order co
    JOIN phm_edw.patient p ON p.patient_id = co.patient_id
    WHERE co.active_ind = 'Y'
      AND co.order_datetime >= ${windowStartISO}::date
      AND co.order_datetime <  (${asOfISO}::date + 1)
      ${scopeByProvider(providerId)}
  `;
  return countOutcome(rows);
}

/** Referral completion: referrals placed in the window, completed via status/date. */
export async function referralCompletionCounts(
  windowStartISO: string,
  asOfISO: string,
  providerId: number | null,
): Promise<OutcomeCounts> {
  const rows = await sql<{ eligible: number; met: number }[]>`
    SELECT
      COUNT(*)::int AS eligible,
      COUNT(*) FILTER (
        WHERE r.completed_date IS NOT NULL
           OR r.referral_status IN ('Completed', 'Report Received', 'Closed')
      )::int AS met
    FROM phm_edw.referral r
    JOIN phm_edw.patient p ON p.patient_id = r.patient_id
    WHERE r.active_ind = 'Y'
      AND r.referral_date >= ${windowStartISO}::date
      AND r.referral_date <  (${asOfISO}::date + 1)
      ${scopeByProvider(providerId)}
  `;
  return countOutcome(rows);
}

/**
 * Alert acknowledgment: alerts raised in the window that need a human (not
 * auto_resolved), acknowledged = acknowledged_at set. clinical_alerts lives in
 * `public` and keys patient_id as int, so provider scoping joins phm_edw.patient.
 */
export async function alertAcknowledgmentCounts(
  windowStartISO: string,
  asOfISO: string,
  providerId: number | null,
): Promise<OutcomeCounts> {
  const rows = await sql<{ eligible: number; met: number }[]>`
    SELECT
      COUNT(*)::int AS eligible,
      COUNT(*) FILTER (
        WHERE ca.acknowledged_at IS NOT NULL
      )::int AS met
    FROM clinical_alerts ca
    JOIN phm_edw.patient p ON p.patient_id = ca.patient_id
    WHERE ca.auto_resolved = FALSE
      AND ca.created_at >= ${windowStartISO}::date
      AND ca.created_at <  (${asOfISO}::date + 1)
      ${scopeByProvider(providerId)}
  `;
  return countOutcome(rows);
}

/** Patient outreach: outreach attempts created in the window, reached = disposition resolved. */
export async function patientOutreachCounts(
  windowStartISO: string,
  asOfISO: string,
  providerId: number | null,
): Promise<OutcomeCounts> {
  const rows = await sql<{ eligible: number; met: number }[]>`
    SELECT
      COUNT(*)::int AS eligible,
      COUNT(*) FILTER (
        WHERE ao.disposition IS NOT NULL AND ao.disposition <> 'pending'
      )::int AS met
    FROM phm_edw.amp_outreach ao
    JOIN phm_edw.patient p ON p.patient_id = ao.patient_id
    WHERE ao.created_date >= ${windowStartISO}::date
      AND ao.created_date <  (${asOfISO}::date + 1)
      ${scopeByProvider(providerId)}
  `;
  return countOutcome(rows);
}

const OUTCOME_QUERIES: Record<
  OutcomeType,
  (windowStartISO: string, asOfISO: string, providerId: number | null) => Promise<OutcomeCounts>
> = {
  gap_closure: gapClosureCounts,
  order_completion: orderCompletionCounts,
  referral_completion: referralCompletionCounts,
  alert_acknowledgment: alertAcknowledgmentCounts,
  patient_outreach: patientOutreachCounts,
};

// ─── Orchestrator ────────────────────────────────────────────────────────────

export interface OutcomeMetricsOptions {
  windowDays?: OutcomeWindowDays;
  /** As-of date (ISO). Defaults to today (UTC) at the route boundary. */
  asOf?: string;
  /** Provider panel scope; null = unscoped (admin/analyst whole-population). */
  providerId?: number | null;
}

/**
 * Compute every close-the-loop outcome metric over one window. Runs the five
 * bounded aggregates concurrently and derives rates + the overall roll-up.
 */
export async function computeOutcomeMetrics(
  options: OutcomeMetricsOptions = {},
): Promise<OutcomeWindowReport> {
  const windowDays = options.windowDays ?? DEFAULT_OUTCOME_WINDOW_DAYS;
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  const start = windowStart(asOf, windowDays);
  const providerId = options.providerId ?? null;

  const metrics = await Promise.all(
    OUTCOME_TYPES.map(async (outcome) => {
      const counts = await OUTCOME_QUERIES[outcome](start, asOf, providerId);
      return summarizeOutcome(outcome, counts);
    }),
  );

  return {
    window_days: windowDays,
    window_start: start,
    as_of: asOf,
    provider_scoped: providerId != null,
    metrics,
    overall: rollupOverall(metrics),
  };
}
