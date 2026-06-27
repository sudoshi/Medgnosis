// =============================================================================
// Unit tests — QDM bridge issue triage state machine
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql, queueSql } = vi.hoisted(() => {
  // bridgeOps embeds projection helpers as `${sql`...columns...`}` fragments.
  // Those nested tagged-template calls must NOT consume a queued query result —
  // only top-level statements (SELECT/INSERT/UPDATE/...) do. The mock returns a
  // passthrough fragment for column-only templates and pulls from an explicit
  // result queue for real statements.
  const results: unknown[] = [];
  const STATEMENT = /\b(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i;
  const fn = vi.fn((strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = Array.isArray(strings) ? strings.join(' ') : String(strings);
    if (!STATEMENT.test(text)) {
      // Projection fragment — return an inert marker, not a promise.
      return { __fragment: text };
    }
    return Promise.resolve(results.length > 0 ? results.shift() : []);
  });
  Object.assign(fn, { json: vi.fn((value: unknown) => value), unsafe: vi.fn() });
  const queue = (...rows: unknown[]): void => {
    results.push(...rows);
  };
  return { mockSql: fn, queueSql: queue };
});
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  allowedTriageTransitions,
  isQdmBridgeIssueTriageState,
  isTerminalTriageState,
  isValidTriageTransition,
  setQdmBridgeIssueTriageState,
} from './issueTriage.js';
import type { QdmBridgeIssueStatus } from './bridgeOps.js';

const ISSUE_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '00000000-0000-4000-8000-000000000001';

function issueRow(status: QdmBridgeIssueStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: ISSUE_ID,
    run_id: null,
    issue_type: 'missing_timing',
    severity: 'warning',
    status,
    measure_code: 'CMS122v12',
    patient_id: null,
    patient_ref: null,
    qdm_event_id: null,
    source_table: null,
    source_id: null,
    message: 'QDM event has no clinically usable timing',
    details: {},
    created_at: '2026-06-26T02:00:00Z',
    resolved_at: isTerminalTriageState(status) ? '2026-06-26T03:00:00Z' : null,
    resolved_by: isTerminalTriageState(status) ? ACTOR_ID : null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('triage transition table', () => {
  it('recognizes only the migration 079 status vocabulary', () => {
    expect(isQdmBridgeIssueTriageState('open')).toBe(true);
    expect(isQdmBridgeIssueTriageState('acknowledged')).toBe(true);
    expect(isQdmBridgeIssueTriageState('resolved')).toBe(true);
    expect(isQdmBridgeIssueTriageState('suppressed')).toBe(true);
    expect(isQdmBridgeIssueTriageState('in_progress')).toBe(false);
    expect(isQdmBridgeIssueTriageState('wont_fix')).toBe(false);
  });

  it('marks resolved and suppressed as terminal', () => {
    expect(isTerminalTriageState('resolved')).toBe(true);
    expect(isTerminalTriageState('suppressed')).toBe(true);
    expect(isTerminalTriageState('open')).toBe(false);
    expect(isTerminalTriageState('acknowledged')).toBe(false);
  });

  it('permits the forward triage path and reopen', () => {
    expect(isValidTriageTransition('open', 'acknowledged')).toBe(true);
    expect(isValidTriageTransition('acknowledged', 'resolved')).toBe(true);
    expect(isValidTriageTransition('acknowledged', 'suppressed')).toBe(true);
    expect(isValidTriageTransition('resolved', 'open')).toBe(true);
    expect(isValidTriageTransition('suppressed', 'open')).toBe(true);
    // Idempotent self-transition is allowed.
    expect(isValidTriageTransition('open', 'open')).toBe(true);
  });

  it('rejects skipping straight from a terminal state to another terminal state', () => {
    expect(isValidTriageTransition('resolved', 'suppressed')).toBe(false);
    expect(isValidTriageTransition('suppressed', 'resolved')).toBe(false);
    expect(isValidTriageTransition('resolved', 'acknowledged')).toBe(false);
  });

  it('exposes the allowed transition set per state', () => {
    expect(allowedTriageTransitions('open')).toContain('acknowledged');
    expect(allowedTriageTransitions('resolved')).toEqual(['resolved', 'open']);
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

describe('setQdmBridgeIssueTriageState', () => {
  it('applies a valid transition and stamps resolution on a terminal state', async () => {
    queueSql([{ status: 'acknowledged' }], [issueRow('resolved')]);

    const result = await setQdmBridgeIssueTriageState({
      issueId: ISSUE_ID,
      toState: 'resolved',
      resolvedBy: ACTOR_ID,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.from).toBe('acknowledged');
      expect(result.to).toBe('resolved');
      expect(result.issue.status).toBe('resolved');
      expect(result.issue.resolvedAt).not.toBeNull();
    }
    const statements = statementCalls();
    const update = statements.find((text) => text.includes('UPDATE phm_edw.qdm_bridge_issue'));
    expect(update).toBeDefined();
    expect(update).toContain('AND status =');
  });

  it('applies open -> acknowledged without stamping resolution', async () => {
    queueSql([{ status: 'open' }], [issueRow('acknowledged')]);

    const result = await setQdmBridgeIssueTriageState({
      issueId: ISSUE_ID,
      toState: 'acknowledged',
      resolvedBy: ACTOR_ID,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.issue.resolvedAt).toBeNull();
    }
  });

  it('rejects an invalid transition without writing', async () => {
    queueSql([{ status: 'resolved' }]);

    const result = await setQdmBridgeIssueTriageState({
      issueId: ISSUE_ID,
      toState: 'suppressed',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ code: 'INVALID_TRANSITION', from: 'resolved', to: 'suppressed' });
    }
    // Only the status read happened; no UPDATE statement.
    expect(statementCalls()).toHaveLength(1);
  });

  it('returns ISSUE_NOT_FOUND when the issue does not exist', async () => {
    queueSql([]);

    const result = await setQdmBridgeIssueTriageState({
      issueId: ISSUE_ID,
      toState: 'acknowledged',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ISSUE_NOT_FOUND');
    }
    expect(statementCalls()).toHaveLength(1);
  });

  it('treats a lost write race as an invalid transition', async () => {
    queueSql([{ status: 'open' }], []); // read says open, UPDATE matched nothing

    const result = await setQdmBridgeIssueTriageState({
      issueId: ISSUE_ID,
      toState: 'acknowledged',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_TRANSITION');
    }
  });

  it('rejects an unknown target state before any query', async () => {
    await expect(
      setQdmBridgeIssueTriageState({
        issueId: ISSUE_ID,
        toState: 'in_progress' as QdmBridgeIssueStatus,
      }),
    ).rejects.toThrow('toState');
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('rejects a malformed issue id before any query', async () => {
    await expect(
      setQdmBridgeIssueTriageState({ issueId: 'not-a-uuid', toState: 'acknowledged' }),
    ).rejects.toThrow('issueId');
    expect(mockSql).not.toHaveBeenCalled();
  });
});
