// =============================================================================
// Medgnosis API — Close the Loop engine
// "No abnormal result falls through." Enumerate abnormal results, compute each
// one's follow-up obligation + clock from the rules engine, search for closure
// evidence, and track every open loop to a documented disposition.
//
// Runs against the abnormal order_result rows that actually exist (bounded set);
// the guideline matrix is data (RESULT_FOLLOWUP today, ASCCP cytology ready).
// =============================================================================

import { sql } from '@medgnosis/db';
import { evaluate } from './rulesEngine.js';

export type Severity = 'critical' | 'high' | 'routine';
export type ClosureType = 'reviewed' | 'followup_order' | 'appropriate_care' | 'refused' | 'unable_to_reach';

export interface GuidelineWindow {
  severity: string;
  obligation: string;
  window_days: number;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

const ABNORMAL_FLAGS = new Set(['H', 'L', 'A', 'AA', 'HH', 'LL']);

export function severityOf(r: { critical_flag: boolean; abnormal_flag: string | null }): Severity {
  if (r.critical_flag) return 'critical';
  if (r.abnormal_flag && ABNORMAL_FLAGS.has(r.abnormal_flag.toUpperCase())) return 'high';
  return 'routine';
}

export function windowDaysFor(severity: Severity, guideline: GuidelineWindow[]): number {
  const row = guideline.find((g) => g.severity === severity);
  return row?.window_days ?? 30;
}

/** Add `windowDays` to an ISO date (YYYY-MM-DD). Deterministic — no clock read. */
export function dueDate(identifiedISO: string, windowDays: number): string {
  const d = new Date(`${identifiedISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + windowDays);
  return d.toISOString().slice(0, 10);
}

export function classifyClosure(c: {
  reviewed_datetime: string | null;
  hasFollowupOrder: boolean;
}): ClosureType | null {
  if (c.reviewed_datetime) return 'reviewed';
  if (c.hasFollowupOrder) return 'followup_order';
  return null;
}

function obligationFor(severity: Severity, guideline: GuidelineWindow[]): string {
  return guideline.find((g) => g.severity === severity)?.obligation ?? 'review_abnormal';
}

// ─── DB orchestration ────────────────────────────────────────────────────────

export interface LoopScanResult {
  scanned: number;
  open: number;
  closed: number;
}

interface AbnormalResult {
  result_id: number;
  patient_id: number;
  order_id: number;
  abnormal_flag: string | null;
  critical_flag: boolean;
  result_datetime: string;
  reviewed_datetime: string | null;
}

/**
 * Enumerate abnormal results, compute obligation + clock, detect closure
 * evidence, and UPSERT one result_loop per result. Bounded set (abnormal
 * results only), per-patient closure lookup — no observation value scans.
 */
export async function runLoopScan(): Promise<LoopScanResult> {
  const guidelineRows = await evaluate('RESULT_FOLLOWUP', 'WINDOW');
  const guideline: GuidelineWindow[] = guidelineRows
    .map((r) => r.value_jsonb as GuidelineWindow)
    .filter((g): g is GuidelineWindow => !!g && typeof g.window_days === 'number');

  const abnormals = await sql<AbnormalResult[]>`
    SELECT result_id, patient_id, order_id, abnormal_flag, critical_flag,
           result_datetime::text AS result_datetime,
           reviewed_datetime::text AS reviewed_datetime
    FROM phm_edw.order_result
    WHERE active_ind = 'Y'
      AND (critical_flag = TRUE OR (abnormal_flag IS NOT NULL AND abnormal_flag <> ''))
  `;

  let open = 0;
  let closed = 0;

  for (const r of abnormals) {
    const severity = severityOf(r);
    const windowDays = windowDaysFor(severity, guideline);
    const identified = r.result_datetime.slice(0, 10);
    const due = dueDate(identified, windowDays);

    // Closure evidence: a follow-up order placed AFTER this result, for the patient.
    const [followup] = await sql<{ n: number }[]>`
      SELECT 1 AS n FROM phm_edw.clinical_order
      WHERE patient_id = ${r.patient_id}
        AND order_datetime > ${r.result_datetime}
        AND active_ind = 'Y'
      LIMIT 1
    `;
    const closureType = classifyClosure({
      reviewed_datetime: r.reviewed_datetime,
      hasFollowupOrder: !!followup,
    });

    const status = closureType ? 'closed' : 'open';
    if (closureType) closed += 1;
    else open += 1;

    await sql`
      INSERT INTO phm_edw.result_loop
        (result_id, patient_id, obligation, severity, identified_date, due_date,
         loop_status, closure_type, closure_evidence, resolved_at)
      VALUES (
        ${r.result_id}, ${r.patient_id}, ${obligationFor(severity, guideline)}, ${severity},
        ${identified}::date, ${due}::date, ${status}, ${closureType},
        ${sql.json({
          reviewed_datetime: r.reviewed_datetime,
          followup_order: !!followup,
          abnormal_flag: r.abnormal_flag,
          critical: r.critical_flag,
        })},
        ${closureType ? sql`NOW()` : null}
      )
      ON CONFLICT (result_id) DO UPDATE SET
        loop_status = EXCLUDED.loop_status,
        closure_type = EXCLUDED.closure_type,
        closure_evidence = EXCLUDED.closure_evidence,
        due_date = EXCLUDED.due_date,
        severity = EXCLUDED.severity
      WHERE phm_edw.result_loop.loop_status = 'open'
    `;
  }

  return { scanned: abnormals.length, open, closed };
}
