// =============================================================================
// Medgnosis API - QDM bridge issue triage state machine
// PHI-safe triage transitions over the existing qdm_bridge_issue.status column
// (migration 079: open / acknowledged / resolved / suppressed). No new column is
// introduced; the triage workflow is layered onto that vocabulary so the change
// is purely additive and reversible.
//
// Workflow (per WORKSTREAM A10):
//   open -> acknowledged -> resolved | suppressed (wont_fix)
// with reopen back to open from any non-open state. Terminal states (resolved,
// suppressed) stamp resolved_at; reopening clears it. Every transition is a
// targeted UPDATE guarded by the issue's current status to stay idempotent under
// concurrent admin edits.
// =============================================================================

import { sql } from '@medgnosis/db';
import type { QdmBridgeIssue, QdmBridgeIssueStatus } from './bridgeOps.js';
import { issueFromRow, type IssueRow, issueProjectionSql } from './bridgeOps.js';

/**
 * Terminal triage states stamp `resolved_at`. `suppressed` is the bridge's
 * "won't fix" terminal per the migration 079 vocabulary.
 */
const TERMINAL_STATES: ReadonlySet<QdmBridgeIssueStatus> = new Set<QdmBridgeIssueStatus>([
  'resolved',
  'suppressed',
]);

/**
 * Allowed triage transitions keyed by current status. Re-asserting the current
 * status (idempotent no-op) is explicitly permitted so repeated admin actions or
 * nightly reconciliation passes never throw.
 */
const TRANSITIONS: Readonly<Record<QdmBridgeIssueStatus, readonly QdmBridgeIssueStatus[]>> = {
  open: ['open', 'acknowledged', 'resolved', 'suppressed'],
  acknowledged: ['acknowledged', 'resolved', 'suppressed', 'open'],
  resolved: ['resolved', 'open'],
  suppressed: ['suppressed', 'open'],
};

export type QdmBridgeIssueTriageError =
  | { code: 'ISSUE_NOT_FOUND' }
  | { code: 'INVALID_TRANSITION'; from: QdmBridgeIssueStatus; to: QdmBridgeIssueStatus };

export interface SetQdmBridgeIssueTriageStateInput {
  issueId: string;
  toState: QdmBridgeIssueStatus;
  resolvedBy?: string | null;
}

export type SetQdmBridgeIssueTriageStateResult =
  | { ok: true; issue: QdmBridgeIssue; from: QdmBridgeIssueStatus; to: QdmBridgeIssueStatus }
  | { ok: false; error: QdmBridgeIssueTriageError };

interface CurrentStatusRow {
  status: QdmBridgeIssueStatus;
}

export function isQdmBridgeIssueTriageState(value: string): value is QdmBridgeIssueStatus {
  return value === 'open' || value === 'acknowledged' || value === 'resolved' || value === 'suppressed';
}

export function isTerminalTriageState(state: QdmBridgeIssueStatus): boolean {
  return TERMINAL_STATES.has(state);
}

export function allowedTriageTransitions(from: QdmBridgeIssueStatus): readonly QdmBridgeIssueStatus[] {
  return TRANSITIONS[from];
}

export function isValidTriageTransition(
  from: QdmBridgeIssueStatus,
  to: QdmBridgeIssueStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Apply a triage transition to a single bridge issue. Validates the transition
 * against the current persisted status, stamps/clears `resolved_at` to satisfy
 * the migration 079 `ck_qbi_resolution_status` constraint, and returns the
 * refreshed issue. Re-asserting the same status is an idempotent success.
 */
export async function setQdmBridgeIssueTriageState(
  input: SetQdmBridgeIssueTriageStateInput,
): Promise<SetQdmBridgeIssueTriageStateResult> {
  const issueId = uuid(input.issueId, 'issueId');
  const toState = triageState(input.toState);
  const resolvedBy = optionalUuid(input.resolvedBy, 'resolvedBy');

  const [current] = await sql<CurrentStatusRow[]>`
    SELECT status
    FROM phm_edw.qdm_bridge_issue
    WHERE id = ${issueId}::uuid
  `;
  if (!current) {
    return { ok: false, error: { code: 'ISSUE_NOT_FOUND' } };
  }

  const fromState = current.status;
  if (!isValidTriageTransition(fromState, toState)) {
    return { ok: false, error: { code: 'INVALID_TRANSITION', from: fromState, to: toState } };
  }

  const terminal = isTerminalTriageState(toState);
  const [row] = await sql<IssueRow[]>`
    UPDATE phm_edw.qdm_bridge_issue
    SET
      status = ${toState},
      resolved_at = CASE WHEN ${terminal} THEN NOW() ELSE NULL END,
      resolved_by = CASE WHEN ${terminal} THEN ${resolvedBy}::uuid ELSE NULL END
    WHERE id = ${issueId}::uuid
      AND status = ${fromState}
    RETURNING ${issueProjectionSql()}
  `;
  if (!row) {
    // Lost a race: another transition landed between the read and the write.
    return { ok: false, error: { code: 'INVALID_TRANSITION', from: fromState, to: toState } };
  }

  return { ok: true, issue: issueFromRow(row), from: fromState, to: toState };
}

function triageState(value: unknown): QdmBridgeIssueStatus {
  if (typeof value !== 'string' || !isQdmBridgeIssueTriageState(value)) {
    throw new Error('toState must be one of: open, acknowledged, resolved, suppressed');
  }
  return value;
}

function uuid(value: unknown, field: string): string {
  const parsed = optionalUuid(value, field);
  if (!parsed) throw new Error(`${field} must be a UUID`);
  return parsed;
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value == null || value === '') return null;
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error(`${field} must be a UUID`);
  }
  return value;
}
