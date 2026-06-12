// =============================================================================
// Medgnosis API — Two-pass Population Finder
// The CKD playbook: the labs already stage the patient; find the population
// hiding in the data. Pass 1 re-stages generic diagnoses; Pass 2 surfaces
// lab/vitals-evident conditions missing from the problem list.
//
// SCALE: cohort-scoped (the ~1.3k patients with problem_list entries) and
// per-patient (patient-leading indexes). NEVER a global value scan over the
// ~1B-row observation table. eGFR = LOINC 48642-3; BMI from vital_sign.
// =============================================================================

import { sql } from '@medgnosis/db';

const EGFR_LOINC = '48642-3';

// Generic/unstaged CKD codes that Pass 1 re-stages into a specific KDIGO stage.
export const CKD_GENERIC_CODES = ['N18.9', 'N18.30'];

export interface StageResult {
  icd10: string;
  name: string;
  stage_label: string;
}

// ─── Pure staging mappers (clinical constants — mirror Phase 1 seed) ─────────

/** KDIGO GFR → CKD stage. Pure classifier; the finder decides what is actionable. */
export function stageCkdFromGfr(gfr: number | null): StageResult | null {
  if (gfr == null || Number.isNaN(gfr)) return null;
  if (gfr >= 90) return { icd10: 'N18.1', name: 'Chronic kidney disease, stage 1 (GFR >=90 with kidney damage)', stage_label: 'Stage 1' };
  if (gfr >= 60) return { icd10: 'N18.2', name: 'Chronic kidney disease, stage 2 (GFR 60-89)', stage_label: 'Stage 2' };
  if (gfr >= 45) return { icd10: 'N18.31', name: 'Chronic kidney disease, stage 3a (GFR 45-59)', stage_label: 'Stage 3a' };
  if (gfr >= 30) return { icd10: 'N18.32', name: 'Chronic kidney disease, stage 3b (GFR 30-44)', stage_label: 'Stage 3b' };
  if (gfr >= 15) return { icd10: 'N18.4', name: 'Chronic kidney disease, stage 4 (GFR 15-29)', stage_label: 'Stage 4' };
  return { icd10: 'N18.5', name: 'Chronic kidney disease, stage 5 (GFR <15)', stage_label: 'Stage 5' };
}

/** BMI → obesity class. Returns null below the overweight threshold. */
export function classifyObesityFromBmi(bmi: number | null): StageResult | null {
  if (bmi == null || Number.isNaN(bmi)) return null;
  if (bmi >= 40) return { icd10: 'E66.01', name: 'Morbid (severe) obesity, Class III (BMI >=40)', stage_label: 'Class III' };
  if (bmi >= 35) return { icd10: 'E66.9', name: 'Obesity, Class II (BMI 35.0-39.9)', stage_label: 'Class II' };
  if (bmi >= 30) return { icd10: 'E66.9', name: 'Obesity, Class I (BMI 30.0-34.9)', stage_label: 'Class I' };
  if (bmi >= 25) return { icd10: 'E66.3', name: 'Overweight (BMI 25.0-29.9)', stage_label: 'Overweight' };
  return null;
}

/** True when a generic CKD entry should be re-staged to a specific evidence-based stage. */
export function needsRestage(currentIcd10: string, suggestedIcd10: string): boolean {
  return CKD_GENERIC_CODES.includes(currentIcd10) && currentIcd10 !== suggestedIcd10;
}

// ─── DB orchestration ────────────────────────────────────────────────────────

export interface FinderResult {
  scanned: number;
  candidates: number;
  byType: Record<string, number>;
}

interface ActiveProblem {
  problem_id: number;
  icd10_code: string | null;
}

interface CandidateInput {
  patient_id: number;
  pass: number;
  finding_type: string;
  stage: StageResult;
  evidence: Record<string, string | number | null>;
  current_problem_id?: number;
  current_icd10?: string | null;
}

/**
 * Resolve ontology_id, skip if dismissed, then UPSERT the candidate.
 * Returns true only if a NEW candidate row was created.
 */
async function upsertCandidate(c: CandidateInput): Promise<boolean> {
  const findingKey = `${c.finding_type}:${c.stage.icd10}`;

  // Respect "does not have X" (permanent) and snoozes that are still active.
  const [dismissed] = await sql<{ dismissal_id: number }[]>`
    SELECT dismissal_id FROM phm_edw.recommendation_dismissal
    WHERE patient_id = ${c.patient_id}
      AND finding_key = ${findingKey}
      AND (dismissed_until IS NULL OR dismissed_until > CURRENT_DATE)
    LIMIT 1
  `;
  if (dismissed) return false;

  const [onto] = await sql<{ ontology_id: number }[]>`
    SELECT ontology_id FROM phm_edw.dx_ontology
    WHERE icd10_code = ${c.stage.icd10}
      AND (stage_label = ${c.stage.stage_label} OR stage_label IS NULL)
      AND active_ind = 'Y'
    ORDER BY (stage_label = ${c.stage.stage_label}) DESC NULLS LAST
    LIMIT 1
  `;

  const inserted = await sql<{ candidate_id: number }[]>`
    INSERT INTO phm_edw.population_finder_candidate
      (patient_id, pass, finding_type, current_problem_id, current_icd10,
       suggested_icd10, suggested_name, ontology_id, evidence, confidence, status)
    VALUES (
      ${c.patient_id}, ${c.pass}, ${c.finding_type},
      ${c.current_problem_id ?? null}, ${c.current_icd10 ?? null},
      ${c.stage.icd10}, ${c.stage.name}, ${onto?.ontology_id ?? null},
      ${sql.json(c.evidence)}, 'high', 'pending'
    )
    ON CONFLICT (patient_id, finding_type, suggested_icd10) DO NOTHING
    RETURNING candidate_id
  `;
  return inserted.length > 0;
}

/**
 * Run the two-pass finder over the problem-list cohort. Per-patient, indexed.
 * @param opts.cohortLimit cap the cohort (testing / incremental runs)
 */
export async function runFinder(opts: { cohortLimit?: number } = {}): Promise<FinderResult> {
  const cohort = await sql<{ patient_id: number }[]>`
    SELECT DISTINCT patient_id FROM phm_edw.problem_list
    WHERE active_ind = 'Y'
    ${opts.cohortLimit ? sql`LIMIT ${opts.cohortLimit}` : sql``}
  `;

  const byType: Record<string, number> = {};
  let candidates = 0;
  const bump = (t: string): void => { byType[t] = (byType[t] ?? 0) + 1; candidates += 1; };

  for (const { patient_id } of cohort) {
    // Latest eGFR (LOINC 48642-3) — patient-leading index.
    const [egfr] = await sql<{ value_numeric: string; observation_datetime: string }[]>`
      SELECT value_numeric, observation_datetime
      FROM phm_edw.observation
      WHERE patient_id = ${patient_id}
        AND observation_code = ${EGFR_LOINC}
        AND active_ind = 'Y'
        AND value_numeric IS NOT NULL
      ORDER BY observation_datetime DESC
      LIMIT 1
    `;
    // Latest BMI.
    const [vit] = await sql<{ bmi: string; recorded_datetime: string }[]>`
      SELECT bmi, recorded_datetime
      FROM phm_edw.vital_sign
      WHERE patient_id = ${patient_id} AND bmi IS NOT NULL AND active_ind = 'Y'
      ORDER BY recorded_datetime DESC
      LIMIT 1
    `;
    // Active problems.
    const problems = await sql<ActiveProblem[]>`
      SELECT problem_id, icd10_code
      FROM phm_edw.problem_list
      WHERE patient_id = ${patient_id} AND problem_status = 'Active' AND active_ind = 'Y'
    `;

    const gfr = egfr ? Number(egfr.value_numeric) : null;
    const bmi = vit ? Number(vit.bmi) : null;
    const hasCkd = problems.some((p) => p.icd10_code?.startsWith('N18'));
    const hasObesity = problems.some((p) => p.icd10_code?.startsWith('E66'));
    const stage = stageCkdFromGfr(gfr);

    // Pass 1 — re-stage a generic CKD entry to its evidence-based stage.
    if (stage) {
      const generic = problems.find(
        (p) => p.icd10_code && needsRestage(p.icd10_code, stage.icd10),
      );
      if (generic) {
        const created = await upsertCandidate({
          patient_id,
          pass: 1,
          finding_type: 'ckd_restage',
          stage,
          current_problem_id: generic.problem_id,
          current_icd10: generic.icd10_code,
          evidence: { egfr: gfr, observed_at: egfr?.observation_datetime ?? null },
        });
        if (created) bump('ckd_restage');
      }
    }

    // Pass 2 — lab-evident CKD missing from the list (GFR < 60: stages 3a-5,
    // unambiguous from eGFR alone; 1-2 need albuminuria and are not flagged here).
    if (gfr != null && gfr < 60 && !hasCkd && stage) {
      const created = await upsertCandidate({
        patient_id,
        pass: 2,
        finding_type: 'ckd_unlabeled',
        stage,
        evidence: { egfr: gfr, observed_at: egfr?.observation_datetime ?? null },
      });
      if (created) bump('ckd_unlabeled');
    }

    // Pass 2 — obesity (BMI >= 30) missing from the list.
    if (bmi != null && bmi >= 30 && !hasObesity) {
      const ob = classifyObesityFromBmi(bmi);
      if (ob) {
        const created = await upsertCandidate({
          patient_id,
          pass: 2,
          finding_type: 'obesity_unlabeled',
          stage: ob,
          evidence: { bmi, observed_at: vit?.recorded_datetime ?? null },
        });
        if (created) bump('obesity_unlabeled');
      }
    }
  }

  return { scanned: cohort.length, candidates, byType };
}
