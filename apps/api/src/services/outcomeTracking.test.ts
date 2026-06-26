// =============================================================================
// Unit tests — Close-the-Loop outcome tracking
// Pure derivation (window math, rate, roll-up) is tested without the DB; the
// window queries are tested against a mocked `sql` that records the tagged-
// template invocation so we can prove: correct numerator/denominator wiring,
// a single bounded aggregate per outcome, provider scoping, and no PHI columns
// in the aggregate response.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// @medgnosis/db connects on import — mock it. The pure tests never touch sql;
// the query tests drive it through queued resolutions (FIFO, like the engine).
const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  fn.mockResolvedValue([]);
  return { mockSql: fn };
});
vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, { unsafe: vi.fn(), json: (v: unknown) => v }),
}));

import {
  OUTCOME_TYPES,
  OUTCOME_WINDOW_DAYS,
  DEFAULT_OUTCOME_WINDOW_DAYS,
  parseWindowDays,
  windowStart,
  rate,
  summarizeOutcome,
  rollupOverall,
  gapClosureCounts,
  orderCompletionCounts,
  referralCompletionCounts,
  alertAcknowledgmentCounts,
  patientOutreachCounts,
  computeOutcomeMetrics,
  type OutcomeMetric,
} from './outcomeTracking.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockResolvedValue([]);
});

/** Reassemble the SQL text from a recorded tagged-template invocation. */
function sqlText(call: unknown[]): string {
  const [strings] = call as [TemplateStringsArray, ...unknown[]];
  return Array.isArray(strings) ? strings.join(' ') : '';
}

/**
 * Route mock resolutions by table name in the SQL text rather than FIFO. The
 * orchestrator fires the five aggregates with Promise.all, and each query also
 * invokes `sql` for its (possibly empty) provider-scope fragment — so call
 * order is non-deterministic. Empty/scope fragments (no COUNT) resolve to [].
 */
function routeByTable(counts: Record<string, { eligible: number; met: number }>): void {
  mockSql.mockImplementation((...call: unknown[]) => {
    const text = sqlText(call);
    if (!text.includes('COUNT(*)')) return Promise.resolve([]);
    for (const [table, value] of Object.entries(counts)) {
      if (text.includes(table)) return Promise.resolve([value]);
    }
    return Promise.resolve([{ eligible: 0, met: 0 }]);
  });
}

// ─── parseWindowDays ─────────────────────────────────────────────────────────

describe('parseWindowDays', () => {
  it('accepts the bounded windows as numbers and strings', () => {
    expect(parseWindowDays(30)).toBe(30);
    expect(parseWindowDays('60')).toBe(60);
    expect(parseWindowDays('90')).toBe(90);
  });
  it('collapses anything unrecognised to the default (never unbounded)', () => {
    expect(parseWindowDays('365')).toBe(DEFAULT_OUTCOME_WINDOW_DAYS);
    expect(parseWindowDays('abc')).toBe(DEFAULT_OUTCOME_WINDOW_DAYS);
    expect(parseWindowDays(undefined)).toBe(DEFAULT_OUTCOME_WINDOW_DAYS);
    expect(parseWindowDays(0)).toBe(DEFAULT_OUTCOME_WINDOW_DAYS);
    expect(parseWindowDays(-30)).toBe(DEFAULT_OUTCOME_WINDOW_DAYS);
  });
});

// ─── windowStart ─────────────────────────────────────────────────────────────

describe('windowStart', () => {
  it('subtracts the window days from the as-of date (deterministic, no clock)', () => {
    expect(windowStart('2026-06-30', 30)).toBe('2026-05-31');
    expect(windowStart('2026-06-30', 60)).toBe('2026-05-01');
    expect(windowStart('2026-06-30', 90)).toBe('2026-04-01');
  });
  it('crosses year boundaries correctly', () => {
    expect(windowStart('2026-01-15', 30)).toBe('2025-12-16');
  });
});

// ─── rate ────────────────────────────────────────────────────────────────────

describe('rate', () => {
  it('computes met/eligible to 4 dp', () => {
    expect(rate({ eligible: 80, met: 55 })).toBe(0.6875);
    expect(rate({ eligible: 3, met: 1 })).toBe(0.3333);
    expect(rate({ eligible: 100, met: 100 })).toBe(1);
  });
  it('returns null when the denominator is zero (undefined rate, not 0/0)', () => {
    expect(rate({ eligible: 0, met: 0 })).toBeNull();
  });
});

// ─── summarizeOutcome ────────────────────────────────────────────────────────

describe('summarizeOutcome', () => {
  it('builds a metric with rate, open backlog, and labels', () => {
    const m = summarizeOutcome('gap_closure', { eligible: 20, met: 7 });
    expect(m).toMatchObject({
      outcome: 'gap_closure',
      eligible: 20,
      met: 7,
      open: 13,
      rate: 0.35,
      numerator_label: 'closed',
      denominator_label: 'eligible care gaps',
    });
  });
  it('clamps a numerator that exceeds the denominator and floors negatives', () => {
    expect(summarizeOutcome('order_completion', { eligible: 5, met: 9 })).toMatchObject({
      eligible: 5,
      met: 5,
      open: 0,
      rate: 1,
    });
    expect(summarizeOutcome('order_completion', { eligible: -3, met: -1 })).toMatchObject({
      eligible: 0,
      met: 0,
      open: 0,
      rate: null,
    });
  });
});

// ─── rollupOverall ───────────────────────────────────────────────────────────

describe('rollupOverall', () => {
  it('sums numerators and denominators across every outcome type', () => {
    const metrics: OutcomeMetric[] = [
      summarizeOutcome('gap_closure', { eligible: 10, met: 4 }),
      summarizeOutcome('order_completion', { eligible: 20, met: 16 }),
      summarizeOutcome('referral_completion', { eligible: 5, met: 5 }),
    ];
    const overall = rollupOverall(metrics);
    expect(overall.eligible).toBe(35);
    expect(overall.met).toBe(25);
    expect(overall.open).toBe(10);
    expect(overall.rate).toBe(0.7143);
  });
  it('is null-rate over an empty population', () => {
    expect(rollupOverall([]).rate).toBeNull();
  });
});

// ─── window queries: numerator/denominator wiring + bounded + scoping ────────

describe('outcome window queries', () => {
  const QUERIES = [
    { name: 'gap_closure', fn: gapClosureCounts, table: 'phm_edw.care_gap', numerator: 'closed' },
    { name: 'order_completion', fn: orderCompletionCounts, table: 'phm_edw.clinical_order', numerator: 'Resulted' },
    { name: 'referral_completion', fn: referralCompletionCounts, table: 'phm_edw.referral', numerator: 'Completed' },
    { name: 'alert_acknowledgment', fn: alertAcknowledgmentCounts, table: 'clinical_alerts', numerator: 'acknowledged_at' },
    { name: 'patient_outreach', fn: patientOutreachCounts, table: 'phm_edw.amp_outreach', numerator: 'disposition' },
  ] as const;

  for (const q of QUERIES) {
    it(`${q.name}: returns the eligible/met counts the aggregate yields`, async () => {
      routeByTable({ [q.table]: { eligible: 42, met: 30 } });
      const counts = await q.fn('2026-04-01', '2026-06-30', null);
      expect(counts).toEqual({ eligible: 42, met: 30 });
    });

    it(`${q.name}: runs exactly ONE bounded aggregate over its own table`, async () => {
      routeByTable({ [q.table]: { eligible: 1, met: 1 } });
      await q.fn('2026-04-01', '2026-06-30', null);
      // Exactly one aggregate (COUNT) statement — plus the empty scope fragment.
      const aggregateCalls = mockSql.mock.calls.filter((c) => sqlText(c).includes('COUNT(*)'));
      expect(aggregateCalls).toHaveLength(1);
      const text = sqlText(aggregateCalls[0]!);
      expect(text).toContain(q.table);
      expect(text).toContain('COUNT(*) FILTER');
      expect(text).toContain(q.numerator);
      // Window bound present — never an unbounded full-table count.
      expect(text).toMatch(/>=/);
    });

    it(`${q.name}: defaults eligible/met to 0 when the table slice is empty`, async () => {
      mockSql.mockResolvedValue([]);
      const counts = await q.fn('2026-04-01', '2026-06-30', null);
      expect(counts).toEqual({ eligible: 0, met: 0 });
    });

    it(`${q.name}: emits a provider-scope fragment only when scoped`, async () => {
      routeByTable({ [q.table]: { eligible: 1, met: 1 } });
      await q.fn('2026-04-01', '2026-06-30', 7);
      // scopeByProvider(7) is its own tagged-template call carrying pcp_provider_id.
      const scopeCall = mockSql.mock.calls.find((c) => sqlText(c).includes('pcp_provider_id'));
      expect(scopeCall).toBeDefined();
      expect((scopeCall as unknown[])[1]).toBe(7);

      mockSql.mockClear();
      routeByTable({ [q.table]: { eligible: 1, met: 1 } });
      await q.fn('2026-04-01', '2026-06-30', null);
      const unscoped = mockSql.mock.calls.find((c) => sqlText(c).includes('pcp_provider_id'));
      expect(unscoped).toBeUndefined();
    });
  }
});

// ─── computeOutcomeMetrics orchestrator ──────────────────────────────────────

describe('computeOutcomeMetrics', () => {
  it('computes every outcome type over the window with correct rates + roll-up', async () => {
    // Route by table — Promise.all fires the five aggregates concurrently.
    routeByTable({
      'phm_edw.care_gap': { eligible: 20, met: 7 }, // gap_closure
      'phm_edw.clinical_order': { eligible: 100, met: 90 }, // order_completion
      'phm_edw.referral': { eligible: 10, met: 4 }, // referral_completion
      clinical_alerts: { eligible: 8, met: 8 }, // alert_acknowledgment
      'phm_edw.amp_outreach': { eligible: 50, met: 12 }, // patient_outreach
    });

    const report = await computeOutcomeMetrics({ windowDays: 60, asOf: '2026-06-30', providerId: null });

    expect(report.window_days).toBe(60);
    expect(report.window_start).toBe('2026-05-01');
    expect(report.as_of).toBe('2026-06-30');
    expect(report.provider_scoped).toBe(false);
    expect(report.metrics.map((m) => m.outcome)).toEqual([...OUTCOME_TYPES]);

    const gap = report.metrics.find((m) => m.outcome === 'gap_closure')!;
    expect(gap).toMatchObject({ eligible: 20, met: 7, open: 13, rate: 0.35 });

    const order = report.metrics.find((m) => m.outcome === 'order_completion')!;
    expect(order).toMatchObject({ eligible: 100, met: 90, rate: 0.9 });

    // Overall = sum of all numerators / denominators.
    expect(report.overall.eligible).toBe(20 + 100 + 10 + 8 + 50);
    expect(report.overall.met).toBe(7 + 90 + 4 + 8 + 12);
    expect(report.overall.rate).toBe(Math.round((121 / 188) * 10_000) / 10_000);
  });

  it('marks the report provider_scoped and threads the provider id into scoping', async () => {
    mockSql.mockResolvedValue([{ eligible: 1, met: 1 }]);
    const report = await computeOutcomeMetrics({ windowDays: 30, asOf: '2026-06-30', providerId: 42 });
    expect(report.provider_scoped).toBe(true);
    const scoped = mockSql.mock.calls.find((c) => sqlText(c).includes('pcp_provider_id'));
    expect((scoped as unknown[])[1]).toBe(42);
  });

  it('produces an aggregate-only payload — no patient-level / PHI fields leak', async () => {
    mockSql.mockResolvedValue([{ eligible: 5, met: 2 }]);
    const report = await computeOutcomeMetrics({ windowDays: 90, asOf: '2026-06-30' });

    const PHI_KEYS = ['patient_id', 'patient_name', 'first_name', 'last_name', 'mrn', 'dob', 'result_value'];
    const blob = JSON.stringify(report).toLowerCase();
    for (const key of PHI_KEYS) expect(blob).not.toContain(key);

    // Each metric exposes only aggregate count/label fields.
    for (const m of report.metrics) {
      expect(Object.keys(m).sort()).toEqual(
        ['denominator_label', 'eligible', 'met', 'numerator_label', 'open', 'outcome', 'rate'].sort(),
      );
    }
  });

  it('defaults to the 90-day window when none is supplied', async () => {
    mockSql.mockResolvedValue([{ eligible: 0, met: 0 }]);
    const report = await computeOutcomeMetrics({ asOf: '2026-06-30' });
    expect(report.window_days).toBe(DEFAULT_OUTCOME_WINDOW_DAYS);
    expect(DEFAULT_OUTCOME_WINDOW_DAYS).toBe(90);
    expect(OUTCOME_WINDOW_DAYS).toEqual([30, 60, 90]);
  });
});
