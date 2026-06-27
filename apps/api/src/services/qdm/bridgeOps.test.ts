// =============================================================================
// Unit tests — QDM bridge shadow refresh (bounded + idempotent + backpressure)
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql, queueSql } = vi.hoisted(() => {
  // The ledger writers embed projection helpers as `${sql`...columns...`}`
  // fragments. Those nested tagged-template calls must NOT consume a queued
  // query result — only top-level statements (SELECT/INSERT/UPDATE/...) pull
  // from the result queue. Column-only fragments return an inert marker.
  const results: unknown[] = [];
  const STATEMENT = /\b(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i;
  const fn = vi.fn((strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = Array.isArray(strings) ? strings.join(' ') : String(strings);
    if (!STATEMENT.test(text)) {
      return { __fragment: text };
    }
    const next = results.length > 0 ? results.shift() : [];
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  });
  Object.assign(fn, { json: vi.fn((value: unknown) => value), unsafe: vi.fn() });
  const queue = (...rows: unknown[]): void => {
    results.push(...rows);
  };
  return { mockSql: fn, queueSql: queue };
});
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  resolveQdmShadowRefreshLimits,
  runQdmShadowRefresh,
} from './bridgeOps.js';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    operation: 'cql_shadow_refresh',
    measure_code: 'CMS122v12',
    period_start: null,
    period_end: null,
    status: 'running',
    trigger_source: 'scheduled',
    started_by: null,
    started_at: '2026-06-26T02:00:00Z',
    completed_at: null,
    duration_ms: null,
    qdm_events_loaded: null,
    patients_selected: null,
    evidence_rows_persisted: null,
    measure_report_id: null,
    reconciliation_run_id: null,
    semantic_drift_dossier_id: null,
    result: {},
    error: null,
    metadata: {},
    ...overrides,
  };
}

function issueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    run_id: RUN_ID,
    issue_type: 'shadow_refresh_population_capped',
    severity: 'warning',
    status: 'open',
    measure_code: 'CMS122v12',
    patient_id: null,
    patient_ref: null,
    qdm_event_id: null,
    source_table: null,
    source_id: null,
    message: 'capped',
    details: {},
    created_at: '2026-06-26T02:00:01Z',
    resolved_at: null,
    resolved_by: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['QDM_SHADOW_MAX_ROWS_PER_RUN'];
  delete process.env['QDM_SHADOW_BATCH_SIZE'];
  delete process.env['QDM_SHADOW_IDEMPOTENCY_WINDOW_MINUTES'];
});

afterEach(() => {
  delete process.env['QDM_SHADOW_MAX_ROWS_PER_RUN'];
  delete process.env['QDM_SHADOW_BATCH_SIZE'];
  delete process.env['QDM_SHADOW_IDEMPOTENCY_WINDOW_MINUTES'];
});

describe('resolveQdmShadowRefreshLimits', () => {
  it('uses safe defaults when no overrides or env are set', () => {
    const limits = resolveQdmShadowRefreshLimits();
    expect(limits).toEqual({
      maxRowsPerRun: 10_000,
      batchSize: 1_000,
      idempotencyWindowMinutes: 60,
    });
  });

  it('applies env overrides', () => {
    process.env['QDM_SHADOW_MAX_ROWS_PER_RUN'] = '500';
    process.env['QDM_SHADOW_BATCH_SIZE'] = '100';
    process.env['QDM_SHADOW_IDEMPOTENCY_WINDOW_MINUTES'] = '15';
    expect(resolveQdmShadowRefreshLimits()).toEqual({
      maxRowsPerRun: 500,
      batchSize: 100,
      idempotencyWindowMinutes: 15,
    });
  });

  it('clamps oversized env values to safe ceilings', () => {
    process.env['QDM_SHADOW_MAX_ROWS_PER_RUN'] = '99999999';
    process.env['QDM_SHADOW_BATCH_SIZE'] = '99999999';
    const limits = resolveQdmShadowRefreshLimits();
    expect(limits.maxRowsPerRun).toBe(200_000);
    expect(limits.batchSize).toBe(10_000);
  });

  it('per-call override beats env and clamps batch to the run cap', () => {
    process.env['QDM_SHADOW_MAX_ROWS_PER_RUN'] = '5000';
    const limits = resolveQdmShadowRefreshLimits({ maxRowsPerRun: 50, batchSize: 1000 });
    expect(limits.maxRowsPerRun).toBe(50);
    // batchSize larger than the cap is pointless and is clamped down to the cap.
    expect(limits.batchSize).toBe(50);
  });
});

/** Tagged-template calls whose first segment is a real SQL statement. */
function statementCalls(): string[] {
  return mockSql.mock.calls
    .map((call) => {
      const strings = call[0] as unknown;
      return Array.isArray(strings) ? strings.join(' ') : '';
    })
    .filter((text) => /\b(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(text));
}

describe('runQdmShadowRefresh', () => {
  it('runs bounded under the cap and completes the ledger run', async () => {
    queueSql(
      [], // idempotency guard: no prior run
      [runRow()], // startQdmBridgeRun INSERT
      [{ candidate_population: 300 }], // population count
      [runRow({ status: 'completed' })], // completeQdmBridgeRun
    );

    const result = await runQdmShadowRefresh({
      measureCode: 'CMS122v12',
      limits: { maxRowsPerRun: 1000, batchSize: 100 },
    });

    expect(result.status).toBe('completed');
    expect(result.runId).toBe(RUN_ID);
    expect(result.candidatePopulation).toBe(300);
    expect(result.patientsProcessed).toBe(300);
    expect(result.capped).toBe(false);
    expect(result.batches).toBe(3); // ceil(300 / 100)
    // Under the cap: guard + start + count + complete = 4 statements, no issue.
    const statements = statementCalls();
    expect(statements).toHaveLength(4);
    expect(statements.some((text) => text.includes('INSERT INTO phm_edw.qdm_bridge_issue'))).toBe(false);
  });

  it('enforces the backpressure cap and records a warning issue', async () => {
    queueSql(
      [], // idempotency guard
      [runRow()], // start
      [{ candidate_population: 250000 }], // population over cap
      [issueRow()], // recordQdmBridgeIssue
      [runRow({ status: 'completed' })], // complete
    );

    const result = await runQdmShadowRefresh({
      measureCode: 'CMS122v12',
      limits: { maxRowsPerRun: 10_000, batchSize: 1_000 },
    });

    expect(result.status).toBe('completed');
    expect(result.candidatePopulation).toBe(250000);
    expect(result.patientsProcessed).toBe(10_000); // hard cap enforced
    expect(result.capped).toBe(true);
    expect(result.batches).toBe(10); // ceil(10000 / 1000)
    const statements = statementCalls();
    expect(statements.some((text) => text.includes('INSERT INTO phm_edw.qdm_bridge_issue'))).toBe(true);
    // guard + start + count + issue + complete = 5 statements.
    expect(statements).toHaveLength(5);
  });

  it('is idempotent: a recent shadow run short-circuits with skipped', async () => {
    queueSql([{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }]);

    const result = await runQdmShadowRefresh({ measureCode: 'CMS122v12' });

    expect(result.status).toBe('skipped');
    expect(result.runId).toBeNull();
    expect(result.skippedReason).toBe('idempotent_recent_run');
    expect(result.priorRunId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    // Only the guard query runs; no run row is created.
    expect(statementCalls()).toHaveLength(1);
  });

  it('force=true bypasses the idempotency guard', async () => {
    queueSql(
      [runRow()], // start (no guard query)
      [{ candidate_population: 5 }], // count
      [runRow({ status: 'completed' })], // complete
    );

    const result = await runQdmShadowRefresh({ measureCode: 'CMS122v12', force: true });

    expect(result.status).toBe('completed');
    expect(result.patientsProcessed).toBe(5);
    // No idempotency guard SELECT was issued; the first statement is the INSERT.
    const statements = statementCalls();
    expect(statements[0]).toContain('INSERT INTO phm_edw.qdm_bridge_run');
    // The guard query is the only one that filters on status <> 'failed'.
    expect(statements.some((text) => text.includes("status <> 'failed'"))).toBe(false);
  });

  it('marks the run failed when population counting throws', async () => {
    queueSql(
      [], // guard
      [runRow()], // start
      new Error('statement timeout'), // count blows up
      [runRow({ status: 'failed' })], // failQdmBridgeRun
    );

    const result = await runQdmShadowRefresh({ measureCode: 'CMS122v12' });

    expect(result.status).toBe('failed');
    expect(result.runId).toBe(RUN_ID);
    const statements = statementCalls();
    expect(statements.some((text) => text.includes("status = 'failed'"))).toBe(true);
  });

  it('rejects a blank measure code before touching the ledger', async () => {
    await expect(runQdmShadowRefresh({ measureCode: '   ' })).rejects.toThrow('measureCode');
    expect(mockSql).not.toHaveBeenCalled();
  });
});
