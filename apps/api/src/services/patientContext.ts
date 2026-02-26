// =============================================================================
// Medgnosis API — Shared Patient Clinical Context Helper
// Used by AI Scribe (clinical-notes/scribe) and AI Chat (insights/chat)
// =============================================================================

import { sql } from '@medgnosis/db';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PatientClinicalContext {
  conditions: string;
  medications: string;
  vitals: string;
  allergies: string;
  careGaps: string;
  encounters: string;
}

// ─── Fetch + Format ─────────────────────────────────────────────────────────

/**
 * Gather clinical context for a patient via 6 parallel DB queries.
 * Returns pre-formatted strings ready for LLM system prompt injection.
 */
export async function getPatientClinicalContext(
  patientId: number,
): Promise<PatientClinicalContext> {
  type R = Record<string, unknown>;

  const [conditions, medications, vitals, allergies, careGaps, recentEncounters] =
    await Promise.all([
      sql`
        SELECT c.condition_name, c.condition_code, cd.diagnosis_status
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
        WHERE cd.patient_id = ${patientId} AND cd.active_ind = 'Y'
          AND cd.diagnosis_status = 'active'
        ORDER BY cd.onset_date DESC
        LIMIT 20
      `,
      sql`
        SELECT m.medication_name, mo.dosage, mo.frequency, mo.route
        FROM phm_edw.medication_order mo
        JOIN phm_edw.medication m ON m.medication_id = mo.medication_id
        WHERE mo.patient_id = ${patientId} AND mo.active_ind = 'Y'
          AND mo.prescription_status = 'active'
        ORDER BY mo.start_datetime DESC
        LIMIT 20
      `,
      sql`
        SELECT o.observation_desc, o.value_numeric, o.value_text,
               o.units, o.observation_datetime
        FROM phm_edw.observation o
        WHERE o.patient_id = ${patientId} AND o.active_ind = 'Y'
          AND o.observation_code IN ('8310-5','8867-4','9279-1','85354-9','29463-7','39156-5','8480-6','8462-4')
        ORDER BY o.observation_datetime DESC
        LIMIT 10
      `,
      sql`
        SELECT a.allergy_name, pa.severity, pa.reaction
        FROM phm_edw.patient_allergy pa
        JOIN phm_edw.allergy a ON a.allergy_id = pa.allergy_id
        WHERE pa.patient_id = ${patientId} AND pa.active_ind = 'Y'
        ORDER BY pa.severity DESC NULLS LAST
        LIMIT 10
      `,
      sql`
        SELECT md.measure_name, cg.gap_status
        FROM phm_edw.care_gap cg
        JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
        WHERE cg.patient_id = ${patientId} AND cg.active_ind = 'Y'
          AND cg.gap_status NOT IN ('met', 'closed')
        LIMIT 10
      `,
      sql`
        SELECT e.encounter_type, e.encounter_reason,
               e.encounter_datetime, e.disposition
        FROM phm_edw.encounter e
        WHERE e.patient_id = ${patientId} AND e.active_ind = 'Y'
        ORDER BY e.encounter_datetime DESC
        LIMIT 3
      `,
    ]);

  // Format context strings
  const conditionList =
    conditions.length > 0
      ? (conditions as R[])
          .map((c) => `${c.condition_name} (${c.condition_code})`)
          .join(', ')
      : 'No active conditions on file';

  const medList =
    medications.length > 0
      ? (medications as R[])
          .map((m) => `${m.medication_name} ${m.dosage ?? ''} ${m.frequency ?? ''}`.trim())
          .join(', ')
      : 'No active medications';

  const vitalList =
    vitals.length > 0
      ? (vitals as R[])
          .map((v) =>
            `${v.observation_desc}: ${v.value_numeric ?? v.value_text ?? 'N/A'} ${v.units ?? ''}`.trim(),
          )
          .join('; ')
      : 'No recent vitals';

  const allergyList =
    allergies.length > 0
      ? (allergies as R[])
          .map((a) =>
            `${a.allergy_name}${a.severity ? ` (${a.severity})` : ''}${a.reaction ? ` - ${a.reaction}` : ''}`,
          )
          .join(', ')
      : 'NKDA';

  const gapList =
    careGaps.length > 0
      ? (careGaps as R[])
          .map((g) => `${g.measure_name}: ${g.gap_status}`)
          .join(', ')
      : 'No open care gaps';

  const encounterList =
    recentEncounters.length > 0
      ? (recentEncounters as R[])
          .map((e) =>
            `${e.encounter_type} on ${new Date(String(e.encounter_datetime)).toLocaleDateString()} - ${e.encounter_reason ?? 'no reason noted'}`,
          )
          .join('; ')
      : 'No recent encounters';

  return {
    conditions: conditionList,
    medications: medList,
    vitals: vitalList,
    allergies: allergyList,
    careGaps: gapList,
    encounters: encounterList,
  };
}

/**
 * Format patient context as a multi-line string for LLM system prompt.
 */
export function formatContextForPrompt(ctx: PatientClinicalContext): string {
  return [
    `Active Conditions: ${ctx.conditions}`,
    `Medications: ${ctx.medications}`,
    `Recent Vitals: ${ctx.vitals}`,
    `Allergies: ${ctx.allergies}`,
    `Open Care Gaps: ${ctx.careGaps}`,
    `Recent Encounters: ${ctx.encounters}`,
  ].join('\n');
}
