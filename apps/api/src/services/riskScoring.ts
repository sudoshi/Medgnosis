// =============================================================================
// Medgnosis API — Population Health Risk Scoring Service
// Evidence-based multi-factor scoring for PHM patients.
//
// Factors (ported from Laravel PatientService + enhanced):
//   F01  Age-based risk (pediatric/elderly weighting)
//   F02  Chronic condition burden (count + severity)
//   F03  Vital signs abnormalities (BP, HR, BMI)
//   F04  Lab result abnormalities
//   F05  Care gap count
//   F06  Encounter frequency (under/over utilization)
//   F07  Medication complexity
//
// Scoring: 0-100, capped. Over-allocation design (max ~130) ensures
// multi-morbid patients are appropriately flagged.
// =============================================================================

import { sql } from '@medgnosis/db';
import type { RiskBand } from '@medgnosis/shared';

export interface RiskFactor {
  rule: string;
  label: string;
  weight: number;
  contribution: number;
  detail: string;
}

export interface RiskScoreResult {
  score: number;
  raw_score: number;
  band: RiskBand;
  factors: RiskFactor[];
  computed_at: string;
}

function scoreToBand(score: number): RiskBand {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

// ---------------------------------------------------------------------------
// F01 — Age-based risk (max 20)
// ---------------------------------------------------------------------------

async function evalAge(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 20;

  const [row] = await sql<{ age: number | null }[]>`
    SELECT EXTRACT(YEAR FROM AGE(NOW(), p.date_of_birth))::int AS age
    FROM phm_edw.patient p
    WHERE p.patient_id = ${patientId}::int
  `;

  const age = row?.age ?? 0;
  let contribution = 0;
  if (age >= 80) contribution = 20;
  else if (age >= 65) contribution = 15;
  else if (age >= 50) contribution = 10;
  else if (age < 2) contribution = 12;

  return {
    rule: 'AGE_RISK',
    label: 'Age-based risk',
    weight: WEIGHT,
    contribution,
    detail: `Age ${age} years`,
  };
}

// ---------------------------------------------------------------------------
// F02 — Chronic condition burden (max 25)
// ---------------------------------------------------------------------------

async function evalConditions(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 25;

  const [row] = await sql<{ active_count: number }[]>`
    SELECT COUNT(*)::int AS active_count
    FROM phm_edw.condition_diagnosis cd
    WHERE cd.patient_id = ${patientId}::int
      AND cd.diagnosis_status = 'active'
      AND cd.active_ind = 'Y'
  `;

  const count = row?.active_count ?? 0;
  let contribution = 0;
  if (count >= 5) contribution = 25;
  else if (count >= 3) contribution = 18;
  else if (count >= 2) contribution = 12;
  else if (count >= 1) contribution = 6;

  return {
    rule: 'CONDITION_BURDEN',
    label: 'Chronic condition burden',
    weight: WEIGHT,
    contribution,
    detail: `${count} active conditions`,
  };
}

// ---------------------------------------------------------------------------
// F03 — Vital signs (max 20)
// ---------------------------------------------------------------------------

async function evalVitals(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 20;

  const vitals = await sql`
    SELECT o.observation_code, o.value_numeric
    FROM phm_edw.observation o
    WHERE o.patient_id = ${patientId}::int
      AND o.active_ind = 'Y'
      AND o.observation_code IN ('systolic_bp', 'diastolic_bp', 'heart_rate', 'bmi')
    ORDER BY o.observation_datetime DESC
    LIMIT 10
  `;

  let contribution = 0;
  for (const v of vitals) {
    const val = Number(v.value_numeric);
    if (v.observation_code === 'systolic_bp' && val >= 180) contribution += 10;
    else if (v.observation_code === 'systolic_bp' && val >= 140) contribution += 5;
    if (v.observation_code === 'bmi' && (val >= 40 || val < 16)) contribution += 5;
    if (v.observation_code === 'heart_rate' && (val > 120 || val < 50)) contribution += 5;
  }

  return {
    rule: 'VITAL_SIGNS',
    label: 'Vital sign abnormalities',
    weight: WEIGHT,
    contribution: Math.min(WEIGHT, contribution),
    detail: `${vitals.length} recent vital readings analyzed`,
  };
}

// ---------------------------------------------------------------------------
// F04 — Lab abnormalities (max 20)
// ---------------------------------------------------------------------------

async function evalLabs(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 20;

  const [row] = await sql<{ abnormal_count: number }[]>`
    SELECT COUNT(*)::int AS abnormal_count
    FROM phm_edw.observation o
    WHERE o.patient_id = ${patientId}::int
      AND o.active_ind = 'Y'
      AND o.observation_code NOT IN ('systolic_bp', 'diastolic_bp', 'heart_rate', 'bmi')
      AND o.abnormal_flag = 'Y'
      AND o.observation_datetime >= NOW() - INTERVAL '6 months'
  `;

  const abnormals = row?.abnormal_count ?? 0;
  let contribution = 0;
  if (abnormals >= 5) contribution = 20;
  else if (abnormals >= 3) contribution = 12;
  else if (abnormals >= 1) contribution = 5;

  return {
    rule: 'LAB_ABNORMALITIES',
    label: 'Lab result abnormalities',
    weight: WEIGHT,
    contribution,
    detail: `${abnormals} abnormal results in 6 months`,
  };
}

// ---------------------------------------------------------------------------
// F05 — Care gap count (max 15)
// ---------------------------------------------------------------------------

async function evalCareGaps(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 15;

  const [row] = await sql<{ open_gaps: number }[]>`
    SELECT COUNT(*)::int AS open_gaps
    FROM phm_edw.care_gap
    WHERE patient_id = ${patientId}::int
      AND gap_status = 'open'
      AND active_ind = 'Y'
  `;

  const gaps = row?.open_gaps ?? 0;
  let contribution = 0;
  if (gaps >= 5) contribution = 15;
  else if (gaps >= 3) contribution = 10;
  else if (gaps >= 1) contribution = 5;

  return {
    rule: 'CARE_GAPS',
    label: 'Open care gaps',
    weight: WEIGHT,
    contribution,
    detail: `${gaps} open care gaps`,
  };
}

// ---------------------------------------------------------------------------
// F06 — Encounter frequency (max 15)
// ---------------------------------------------------------------------------

async function evalEncounters(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 15;

  const [row] = await sql<{ encounter_count: number }[]>`
    SELECT COUNT(*)::int AS encounter_count
    FROM phm_edw.encounter
    WHERE patient_id = ${patientId}::int
      AND active_ind = 'Y'
      AND encounter_datetime >= NOW() - INTERVAL '12 months'
  `;

  const count = row?.encounter_count ?? 0;
  let contribution = 0;
  // High utilization (>12/year) or zero utilization both signal risk
  if (count === 0) contribution = 10;
  else if (count >= 12) contribution = 15;
  else if (count >= 8) contribution = 8;

  return {
    rule: 'ENCOUNTER_FREQUENCY',
    label: 'Encounter frequency',
    weight: WEIGHT,
    contribution,
    detail: `${count} encounters in 12 months`,
  };
}

// ---------------------------------------------------------------------------
// F07 — Medication complexity (max 15)
// ---------------------------------------------------------------------------

async function evalMedications(patientId: string): Promise<RiskFactor> {
  const WEIGHT = 15;

  const [row] = await sql<{ med_count: number }[]>`
    SELECT COUNT(*)::int AS med_count
    FROM phm_edw.medication_order
    WHERE patient_id = ${patientId}::int
      AND active_ind = 'Y'
      AND prescription_status = 'active'
  `;

  const count = row?.med_count ?? 0;
  let contribution = 0;
  if (count >= 10) contribution = 15; // polypharmacy
  else if (count >= 5) contribution = 8;
  else if (count >= 3) contribution = 3;

  return {
    rule: 'MEDICATION_COMPLEXITY',
    label: 'Medication complexity',
    weight: WEIGHT,
    contribution,
    detail: `${count} active medications`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function computeRiskScore(patientId: string): Promise<RiskScoreResult> {
  const [f1, f2, f3, f4, f5, f6, f7] = await Promise.all([
    evalAge(patientId),
    evalConditions(patientId),
    evalVitals(patientId),
    evalLabs(patientId),
    evalCareGaps(patientId),
    evalEncounters(patientId),
    evalMedications(patientId),
  ]);

  const factors: RiskFactor[] = [f1, f2, f3, f4, f5, f6, f7];
  const rawScore = factors.reduce((sum, f) => sum + f.contribution, 0);
  const score = Math.min(100, rawScore);

  return {
    score,
    raw_score: rawScore,
    band: scoreToBand(score),
    factors,
    computed_at: new Date().toISOString(),
  };
}

export async function persistRiskScore(
  patientId: string,
  result: RiskScoreResult,
): Promise<void> {
  await sql`
    INSERT INTO patient_risk_history (patient_id, score, band, factors, computed_at)
    VALUES (${patientId}::int, ${result.score}, ${result.band},
            ${JSON.stringify(result.factors)}::JSONB, ${result.computed_at})
  `;
}
