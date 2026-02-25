// =============================================================================
// Medgnosis API — OMOP CDM Export service
// Maps PHM EDW data to OMOP Common Data Model format
// =============================================================================

import { sql } from '@medgnosis/db';

interface OmopPerson {
  person_id: number;
  gender_concept_id: number;
  year_of_birth: number;
  month_of_birth: number;
  day_of_birth: number;
  race_concept_id: number;
  ethnicity_concept_id: number;
  person_source_value: string;
}

interface OmopConditionOccurrence {
  condition_occurrence_id: number;
  person_id: number;
  condition_concept_id: number;
  condition_start_date: string;
  condition_end_date: string | null;
  condition_type_concept_id: number;
  condition_source_value: string;
}

interface OmopMeasurement {
  measurement_id: number;
  person_id: number;
  measurement_concept_id: number;
  measurement_date: string;
  value_as_number: number | null;
  value_as_concept_id: number | null;
  unit_concept_id: number;
  measurement_source_value: string;
}

export async function exportPatientsToOmop(
  limit = 1000,
): Promise<OmopPerson[]> {
  const patients = await sql`
    SELECT patient_id, first_name, last_name, date_of_birth, gender, race, ethnicity
    FROM phm_edw.patient
    LIMIT ${limit}
  `;

  return patients.map((p) => {
    const dob = p.date_of_birth ? new Date(p.date_of_birth as string) : null;
    return {
      person_id: Number(p.patient_id),
      gender_concept_id: p.gender === 'Male' ? 8507 : 8532, // OMOP concept IDs
      year_of_birth: dob?.getFullYear() ?? 0,
      month_of_birth: dob ? dob.getMonth() + 1 : 0,
      day_of_birth: dob?.getDate() ?? 0,
      race_concept_id: 0, // Would map from race value
      ethnicity_concept_id: 0,
      person_source_value: `${p.first_name} ${p.last_name}`,
    };
  });
}

export async function exportConditionsToOmop(
  patientId?: number,
): Promise<OmopConditionOccurrence[]> {
  const conditions = patientId
    ? await sql`
        SELECT condition_id, patient_id, condition_name, condition_code, onset_date, resolved_date, status
        FROM phm_edw.condition WHERE patient_id = ${patientId}
      `
    : await sql`
        SELECT condition_id, patient_id, condition_name, condition_code, onset_date, resolved_date, status
        FROM phm_edw.condition LIMIT 5000
      `;

  return conditions.map((c) => ({
    condition_occurrence_id: Number(c.condition_id),
    person_id: Number(c.patient_id),
    condition_concept_id: 0, // Would map SNOMED→OMOP
    condition_start_date: c.onset_date
      ? new Date(c.onset_date as string).toISOString().split('T')[0]
      : '',
    condition_end_date: c.resolved_date
      ? new Date(c.resolved_date as string).toISOString().split('T')[0]
      : null,
    condition_type_concept_id: 32817, // EHR
    condition_source_value: (c.condition_code as string) ?? (c.condition_name as string),
  }));
}

export async function exportMeasurementsToOmop(
  patientId?: number,
): Promise<OmopMeasurement[]> {
  const obs = patientId
    ? await sql`
        SELECT observation_id, patient_id, observation_type, observation_code,
               value_numeric, value_text, unit, observation_date
        FROM phm_edw.observation WHERE patient_id = ${patientId}
      `
    : await sql`
        SELECT observation_id, patient_id, observation_type, observation_code,
               value_numeric, value_text, unit, observation_date
        FROM phm_edw.observation LIMIT 5000
      `;

  return obs.map((o) => ({
    measurement_id: Number(o.observation_id),
    person_id: Number(o.patient_id),
    measurement_concept_id: 0, // Would map LOINC→OMOP
    measurement_date: o.observation_date
      ? new Date(o.observation_date as string).toISOString().split('T')[0]
      : '',
    value_as_number: o.value_numeric != null ? Number(o.value_numeric) : null,
    value_as_concept_id: null,
    unit_concept_id: 0,
    measurement_source_value:
      (o.observation_code as string) ?? (o.observation_type as string),
  }));
}

export async function generateDeidentifiedCohort(
  cohortCriteria: { min_age?: number; max_age?: number; conditions?: string[] },
  limit = 500,
) {
  let query = sql`
    SELECT p.patient_id, p.date_of_birth, p.gender, p.race, p.ethnicity
    FROM phm_edw.patient p
    WHERE 1=1
  `;

  // Note: Dynamic cohort criteria would be applied here with parameterized queries
  const patients = await sql`
    SELECT p.patient_id, p.date_of_birth, p.gender, p.race, p.ethnicity
    FROM phm_edw.patient p
    LIMIT ${limit}
  `;

  // De-identify: remove direct identifiers, generalize dates
  return patients.map((p) => {
    const dob = p.date_of_birth ? new Date(p.date_of_birth as string) : null;
    return {
      person_id: Number(p.patient_id),
      age_group: dob
        ? `${Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000) / 10) * 10}-${Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000) / 10) * 10 + 9}`
        : 'Unknown',
      gender: p.gender,
      race: p.race ?? 'Unknown',
      ethnicity: p.ethnicity ?? 'Unknown',
    };
  });
}
