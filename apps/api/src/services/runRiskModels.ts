// =============================================================================
// Medgnosis API — Population risk-model runner
// Gathers a bounded patient context once (the problem-list cohort + demographics
// + active conditions + anticoagulant flag) and dispatches to every registered
// risk model. Stores actionable scores; counts insufficient_data without noise.
// Cohort-scoped — never a full 1M-patient or 1B-observation scan.
// =============================================================================

import { sql } from '@medgnosis/db';
import { allModels, type PatientRiskContext } from './riskModels/index.js';

const ANTICOAG_RE = 'warfarin|apixaban|rivaroxaban|dabigatran|edoxaban|eliquis|xarelto|coumadin|pradaxa|savaysa|lixiana';

export interface RiskRunResult {
  cohort: number;
  scored: number;
  gaps: number;
  byModel: Record<string, { scored: number; gaps: number; insufficient: number }>;
}

interface CohortRow {
  patient_id: number;
  gender: string;
  age: number;
  conditions: string[];
  on_anticoagulant: boolean;
}

export async function runRiskModels(): Promise<RiskRunResult> {
  const cohort = await sql<CohortRow[]>`
    SELECT
      p.patient_id,
      p.gender,
      date_part('year', age(p.date_of_birth))::int AS age,
      COALESCE(
        array_agg(DISTINCT pl.icd10_code) FILTER (WHERE pl.icd10_code IS NOT NULL),
        '{}'
      ) AS conditions,
      EXISTS (
        SELECT 1 FROM phm_edw.medication_order mo
        JOIN phm_edw.medication m ON m.medication_id = mo.medication_id
        WHERE mo.patient_id = p.patient_id
          AND mo.active_ind = 'Y'
          AND COALESCE(mo.prescription_status, '') NOT IN ('Discontinued', 'Cancelled', 'Completed')
          AND m.medication_name ~* ${ANTICOAG_RE}
      ) AS on_anticoagulant
    FROM phm_edw.patient p
    JOIN phm_edw.problem_list pl ON pl.patient_id = p.patient_id
      AND pl.problem_status = 'Active' AND pl.active_ind = 'Y'
    WHERE p.active_ind = 'Y'
    GROUP BY p.patient_id, p.gender, p.date_of_birth
  `;

  const models = allModels();
  const byModel: Record<string, { scored: number; gaps: number; insufficient: number }> = {};
  for (const m of models) byModel[m.code] = { scored: 0, gaps: 0, insufficient: 0 };

  let scored = 0;
  let gaps = 0;

  for (const row of cohort) {
    const ctx: PatientRiskContext = {
      patient_id: row.patient_id,
      age: row.age,
      gender: row.gender,
      conditions: row.conditions ?? [],
      onAnticoagulant: row.on_anticoagulant,
    };

    for (const model of models) {
      if (!model.eligible(ctx)) continue;
      const comp = model.compute(ctx);
      if (comp.category === 'insufficient_data') {
        byModel[model.code]!.insufficient += 1;
        continue;
      }

      await sql`
        INSERT INTO phm_edw.population_risk_score
          (patient_id, model_code, score_numeric, risk_category, components, care_gap)
        VALUES (
          ${row.patient_id}, ${model.code}, ${comp.score}, ${comp.category},
          ${sql.json(comp.components as Record<string, string | number | boolean | null>)}, ${comp.careGap}
        )
        ON CONFLICT (patient_id, model_code) DO UPDATE SET
          score_numeric = EXCLUDED.score_numeric,
          risk_category = EXCLUDED.risk_category,
          components = EXCLUDED.components,
          care_gap = EXCLUDED.care_gap,
          computed_date = NOW()
      `;
      scored += 1;
      byModel[model.code]!.scored += 1;
      if (comp.careGap) {
        gaps += 1;
        byModel[model.code]!.gaps += 1;
      }
    }
  }

  return { cohort: cohort.length, scored, gaps, byModel };
}
