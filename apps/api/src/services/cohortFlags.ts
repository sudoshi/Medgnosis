// =============================================================================
// Medgnosis API — Cohort high-risk flags + cohort matching
// Specialist population tools: clinician-specified flags computed continuously
// over the bounded cohort, and criteria-based cohort membership. Cohort-scoped;
// labs via the code-filtered fact_observation index (no observation scan).
// =============================================================================

import { sql } from '@medgnosis/db';

// ─── Pure flag helpers ───────────────────────────────────────────────────────

export function flagHyperkalemia(k: number | null): boolean {
  return k != null && k >= 5.5;
}
export function flagGfrLow(gfr: number | null): boolean {
  return gfr != null && gfr < 30;
}
export function flagNewAceArbNoBmp(p: { onAceArb: boolean; hasRecentBmp: boolean }): boolean {
  return p.onAceArb && !p.hasRecentBmp;
}

export interface CohortCriteria {
  conditions?: string[]; // ICD-10 prefixes
  flags?: string[];
}

/** A patient matches when any condition prefix matches AND all required flags are present. */
export function matchesCohort(p: { conditions: string[]; flags: string[] }, criteria: CohortCriteria): boolean {
  const condReq = criteria.conditions ?? [];
  const condMatch = condReq.length === 0 || p.conditions.some((c) => condReq.some((pre) => c.startsWith(pre)));
  const flagReq = criteria.flags ?? [];
  const flagMatch = flagReq.length === 0 || flagReq.every((f) => p.flags.includes(f));
  return condMatch && flagMatch;
}

// ─── DB orchestration ────────────────────────────────────────────────────────

const ACEARB_RE = 'lisinopril|enalapril|ramipril|benazepril|captopril|quinapril|losartan|valsartan|olmesartan|irbesartan|candesartan|telmisartan';

export interface CohortFlagResult {
  cohort: number;
  byFlag: Record<string, number>;
}

interface FlagCohortRow {
  patient_id: number;
  latest_k: string | null;
  latest_gfr: string | null;
  on_acearb: boolean;
  has_recent_bmp: boolean;
}

async function setFlag(patientId: number, key: string, on: boolean, valueText: string | null): Promise<void> {
  if (on) {
    await sql`
      INSERT INTO phm_edw.patient_flag (patient_id, flag_key, value_text, computed_date)
      VALUES (${patientId}, ${key}, ${valueText}, NOW())
      ON CONFLICT (patient_id, flag_key) DO UPDATE SET value_text = EXCLUDED.value_text, computed_date = NOW()
    `;
  } else {
    await sql`DELETE FROM phm_edw.patient_flag WHERE patient_id = ${patientId} AND flag_key = ${key}`;
  }
}

export async function runCohortFlags(): Promise<CohortFlagResult> {
  const cohort = await sql<FlagCohortRow[]>`
    WITH c AS (
      SELECT DISTINCT pl.patient_id, dp.patient_key
      FROM phm_edw.problem_list pl
      JOIN phm_star.dim_patient dp ON dp.patient_id = pl.patient_id
      WHERE pl.active_ind = 'Y' AND pl.problem_status = 'Active'
    )
    SELECT c.patient_id,
      (SELECT fo.value_numeric FROM phm_star.fact_observation fo
       WHERE fo.patient_key = c.patient_key AND fo.observation_code = '6298-4' AND fo.value_numeric IS NOT NULL
       ORDER BY fo.date_key_obs DESC LIMIT 1) AS latest_k,
      (SELECT fo.value_numeric FROM phm_star.fact_observation fo
       WHERE fo.patient_key = c.patient_key AND fo.observation_code = '33914-3' AND fo.value_numeric IS NOT NULL
       ORDER BY fo.date_key_obs DESC LIMIT 1) AS latest_gfr,
      EXISTS (SELECT 1 FROM phm_edw.medication_order mo JOIN phm_edw.medication m ON m.medication_id = mo.medication_id
              WHERE mo.patient_id = c.patient_id AND mo.active_ind = 'Y' AND m.medication_name ~* ${ACEARB_RE}) AS on_acearb,
      EXISTS (SELECT 1 FROM phm_edw.clinical_order co
              WHERE co.patient_id = c.patient_id AND co.loinc_code = '51990-0'
                AND co.order_datetime > NOW() - INTERVAL '12 months') AS has_recent_bmp
    FROM c
  `;

  const byFlag: Record<string, number> = { HYPERKALEMIA: 0, GFR_LOW: 0, NEW_ACEARB_NO_BMP: 0 };

  for (const r of cohort) {
    const k = r.latest_k != null ? Number(r.latest_k) : null;
    const gfr = r.latest_gfr != null ? Number(r.latest_gfr) : null;

    const hyperK = flagHyperkalemia(k);
    const gfrLow = flagGfrLow(gfr);
    const aceNoBmp = flagNewAceArbNoBmp({ onAceArb: r.on_acearb, hasRecentBmp: r.has_recent_bmp });

    await setFlag(r.patient_id, 'HYPERKALEMIA', hyperK, k != null ? `K ${k}` : null);
    await setFlag(r.patient_id, 'GFR_LOW', gfrLow, gfr != null ? `GFR ${gfr}` : null);
    await setFlag(r.patient_id, 'NEW_ACEARB_NO_BMP', aceNoBmp, aceNoBmp ? 'ACE/ARB, no BMP <12mo' : null);

    if (hyperK) byFlag.HYPERKALEMIA! += 1;
    if (gfrLow) byFlag.GFR_LOW! += 1;
    if (aceNoBmp) byFlag.NEW_ACEARB_NO_BMP! += 1;
  }

  return { cohort: cohort.length, byFlag };
}

export interface CohortMember {
  patient_id: number;
  patient_name: string;
  conditions: string[];
  flags: string[];
}

/** Preview a cohort's members from the problem-list cohort + computed flags. */
export async function previewCohort(criteria: CohortCriteria): Promise<CohortMember[]> {
  const rows = await sql<{ patient_id: number; patient_name: string; conditions: string[]; flags: string[] }[]>`
    SELECT p.patient_id, p.first_name || ' ' || p.last_name AS patient_name,
      COALESCE(array_agg(DISTINCT pl.icd10_code) FILTER (WHERE pl.icd10_code IS NOT NULL), '{}') AS conditions,
      COALESCE((SELECT array_agg(flag_key) FROM phm_edw.patient_flag pf WHERE pf.patient_id = p.patient_id), '{}') AS flags
    FROM phm_edw.patient p
    JOIN phm_edw.problem_list pl ON pl.patient_id = p.patient_id AND pl.active_ind = 'Y' AND pl.problem_status = 'Active'
    WHERE p.active_ind = 'Y'
    GROUP BY p.patient_id, p.first_name, p.last_name
  `;
  return rows
    .filter((r) => matchesCohort({ conditions: r.conditions ?? [], flags: r.flags ?? [] }, criteria))
    .slice(0, 200)
    .map((r) => ({ patient_id: r.patient_id, patient_name: r.patient_name, conditions: r.conditions ?? [], flags: r.flags ?? [] }));
}
