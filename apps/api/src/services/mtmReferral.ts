// =============================================================================
// Medgnosis API — Auto-Referral for Medication Therapy Management (MTM)
// Patients persistently uncontrolled for diabetes / hypertension / hyperlipidemia
// are auto-referred to clinical pharmacists, then repatriated to primary care
// once at goal. Delegation to the discipline best built to act.
// =============================================================================

import { sql } from '@medgnosis/db';
import { evaluate } from './rulesEngine.js';

export interface Threshold {
  condition: string;
  code: string;
  op: string;
  value: number;
}

export type MtmStatus = 'referred' | 'managed' | 'at_goal' | 'repatriated';

// ─── Pure helpers ────────────────────────────────────────────────────────────

export function isUncontrolled(condition: string, value: number, thresholds: Threshold[]): boolean {
  const t = thresholds.find((x) => x.condition === condition);
  if (!t) return false;
  switch (t.op) {
    case '>=': return value >= t.value;
    case '>': return value > t.value;
    case '<=': return value <= t.value;
    case '<': return value < t.value;
    default: return false;
  }
}

/** Referral lifecycle: referred → managed → at_goal → repatriated. */
export function nextMtmStatus(current: MtmStatus, atGoal: boolean): MtmStatus {
  if (current === 'repatriated') return 'repatriated';
  if (current === 'at_goal') return atGoal ? 'repatriated' : 'managed';
  // referred or managed
  return atGoal ? 'at_goal' : 'managed';
}

// ─── DB orchestration ────────────────────────────────────────────────────────

export interface MtmScanResult {
  cohort: number;
  referred: number;
  advanced: number;
}

interface CohortRow {
  patient_id: number;
  has_dm: boolean;
  has_htn: boolean;
  has_hld: boolean;
  latest_a1c: string | null;
  latest_ldl: string | null;
  latest_sbp: number | null;
}

const CONDITIONS: { key: string; code: string }[] = [
  { key: 'diabetes', code: '4548-4' },
  { key: 'hypertension', code: 'SBP' },
  { key: 'hyperlipidemia', code: '18262-6' },
];

function valueFor(condition: string, row: CohortRow): number | null {
  if (condition === 'diabetes') return row.latest_a1c != null ? Number(row.latest_a1c) : null;
  if (condition === 'hyperlipidemia') return row.latest_ldl != null ? Number(row.latest_ldl) : null;
  if (condition === 'hypertension') return row.latest_sbp ?? null;
  return null;
}

function hasCondition(condition: string, row: CohortRow): boolean {
  if (condition === 'diabetes') return row.has_dm;
  if (condition === 'hypertension') return row.has_htn;
  if (condition === 'hyperlipidemia') return row.has_hld;
  return false;
}

export async function runMtmScan(): Promise<MtmScanResult> {
  const thrRows = await evaluate('UNCONTROLLED_THRESHOLD', 'RULE');
  const thresholds = thrRows
    .map((r) => r.value_jsonb as Threshold)
    .filter((t): t is Threshold => !!t && typeof t.value === 'number');

  // Cohort: problem-list patients with DM/HTN/HLD + latest relevant values
  // (A1c/LDL via fact_observation code-filtered index; SBP from vital_sign).
  const cohort = await sql<CohortRow[]>`
    WITH c AS (
      SELECT DISTINCT pl.patient_id, dp.patient_key,
        bool_or(pl.icd10_code LIKE 'E11%' OR pl.icd10_code LIKE 'E10%') AS has_dm,
        bool_or(pl.icd10_code LIKE 'I10%' OR pl.icd10_code LIKE 'I11%') AS has_htn,
        bool_or(pl.icd10_code LIKE 'E78%') AS has_hld
      FROM phm_edw.problem_list pl
      JOIN phm_star.dim_patient dp ON dp.patient_id = pl.patient_id
      WHERE pl.active_ind = 'Y' AND pl.problem_status = 'Active'
        AND (pl.icd10_code LIKE 'E1%' OR pl.icd10_code LIKE 'I1%' OR pl.icd10_code LIKE 'E78%')
      GROUP BY pl.patient_id, dp.patient_key
    )
    SELECT c.patient_id, c.has_dm, c.has_htn, c.has_hld,
      (SELECT fo.value_numeric FROM phm_star.fact_observation fo
       WHERE fo.patient_key = c.patient_key AND fo.observation_code = '4548-4' AND fo.value_numeric IS NOT NULL
       ORDER BY fo.date_key_obs DESC LIMIT 1) AS latest_a1c,
      (SELECT fo.value_numeric FROM phm_star.fact_observation fo
       WHERE fo.patient_key = c.patient_key AND fo.observation_code = '18262-6' AND fo.value_numeric IS NOT NULL
       ORDER BY fo.date_key_obs DESC LIMIT 1) AS latest_ldl,
      (SELECT vs.bp_systolic FROM phm_edw.vital_sign vs
       WHERE vs.patient_id = c.patient_id AND vs.bp_systolic IS NOT NULL AND vs.active_ind = 'Y'
       ORDER BY vs.recorded_datetime DESC LIMIT 1) AS latest_sbp
    FROM c
  `;

  const open = await sql<{ patient_id: number; condition: string; mtm_status: MtmStatus; mtm_id: number }[]>`
    SELECT patient_id, condition, mtm_status, mtm_id FROM phm_edw.mtm_referral WHERE active_ind = 'Y'
  `;
  const openMap = new Map(open.map((o) => [`${o.patient_id}:${o.condition}`, o]));

  let referred = 0;
  let advanced = 0;

  for (const row of cohort) {
    for (const c of CONDITIONS) {
      if (!hasCondition(c.key, row)) continue;
      const value = valueFor(c.key, row);
      if (value == null) continue;
      const uncontrolled = isUncontrolled(c.key, value, thresholds);
      const existing = openMap.get(`${row.patient_id}:${c.key}`);

      if (!existing) {
        if (!uncontrolled) continue;
        const [ref] = await sql<{ referral_id: number }[]>`
          INSERT INTO phm_edw.referral
            (patient_id, specialty, referral_reason, urgency, referral_date, referral_status, active_ind)
          VALUES (${row.patient_id}, 'Clinical Pharmacy',
                  ${`Persistently uncontrolled ${c.key} — auto-referral for medication therapy management`},
                  'routine', CURRENT_DATE, 'Pending', 'Y')
          RETURNING referral_id
        `;
        await sql`
          INSERT INTO phm_edw.mtm_referral
            (patient_id, referral_id, condition, trigger_value, trigger_code, mtm_status)
          VALUES (${row.patient_id}, ${ref?.referral_id ?? null}, ${c.key}, ${value}, ${c.code}, 'referred')
          ON CONFLICT (patient_id, condition) DO NOTHING
        `;
        referred += 1;
      } else {
        const atGoal = !uncontrolled;
        const next = nextMtmStatus(existing.mtm_status, atGoal);
        if (next === existing.mtm_status) continue;
        await sql`
          UPDATE phm_edw.mtm_referral
          SET mtm_status = ${next},
              goal_at = CASE WHEN ${next} = 'at_goal' THEN CURRENT_DATE ELSE goal_at END,
              repatriated_at = CASE WHEN ${next} = 'repatriated' THEN CURRENT_DATE ELSE repatriated_at END
          WHERE mtm_id = ${existing.mtm_id}
        `;
        advanced += 1;
      }
    }
  }

  return { cohort: cohort.length, referred, advanced };
}
