// =============================================================================
// Medgnosis API — OMOP CDM Export service
// Maps PHM EDW data to OMOP Common Data Model format
// =============================================================================

import { sql } from '@medgnosis/db';

// ---------------------------------------------------------------------------
// OMOP Vocabulary Lookups
// Standard concept IDs from the OMOP CDM v5.4 vocabulary.
// In production, use a full concept table; these map the most common
// Synthea-generated SNOMED/LOINC codes to OMOP concept IDs.
// ---------------------------------------------------------------------------

const RACE_CONCEPT: Record<string, number> = {
  white: 8527, black: 8516, asian: 8515, native: 8557, other: 8522,
};
const ETHNICITY_CONCEPT: Record<string, number> = {
  hispanic: 38003563, nonhispanic: 38003564,
};

const SNOMED_TO_OMOP: Record<string, number> = {
  '44054006': 201826, '73211009': 316866, '59621000': 320128, '38341003': 317309,
  '13645005': 4185932, '195662009': 257007, '40055000': 4134120, '162864005': 436659,
  '15777000': 4185711, '230690007': 381316, '22298006': 4329847, '53741008': 257628,
  '233604007': 255848, '68496003': 443904, '126906006': 4112853, '254837009': 4112853,
};

const LOINC_TO_OMOP: Record<string, number> = {
  '8302-2': 3036277, '29463-7': 3025315, '39156-5': 3038553,
  '8480-6': 3004249, '8462-4': 3012888, '2093-3': 3027114,
  '2571-8': 3028437, '2085-9': 3007070, '4548-4': 3004410,
  '6299-2': 3001604, '2160-0': 3016723, '2345-7': 3004501,
  '6690-2': 3000963, '718-7': 3000963, '4544-3': 3024929, '777-3': 3024929,
};

function lookupSnomedConcept(code: string): number {
  return SNOMED_TO_OMOP[code] ?? 0;
}
function lookupLoincConcept(code: string): number {
  return LOINC_TO_OMOP[code] ?? 0;
}
function lookupRaceConcept(race: string | null): number {
  if (!race) return 0;
  return RACE_CONCEPT[race.toLowerCase()] ?? 0;
}
function lookupEthnicityConcept(ethnicity: string | null): number {
  if (!ethnicity) return 0;
  return ethnicity.toLowerCase().includes('hispanic')
    ? ETHNICITY_CONCEPT.hispanic : ETHNICITY_CONCEPT.nonhispanic;
}

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
      race_concept_id: lookupRaceConcept(p.race as string | null),
      ethnicity_concept_id: lookupEthnicityConcept(p.ethnicity as string | null),
      person_source_value: `${p.first_name} ${p.last_name}`,
    };
  });
}

export async function exportConditionsToOmop(
  patientId?: number,
): Promise<OmopConditionOccurrence[]> {
  const conditions = patientId
    ? await sql`
        SELECT cd.condition_diagnosis_id, cd.patient_id, c.condition_name, c.condition_code,
               cd.onset_date, cd.resolution_date, cd.diagnosis_status
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
        WHERE cd.patient_id = ${patientId}
      `
    : await sql`
        SELECT cd.condition_diagnosis_id, cd.patient_id, c.condition_name, c.condition_code,
               cd.onset_date, cd.resolution_date, cd.diagnosis_status
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
        LIMIT 5000
      `;

  return conditions.map((c) => ({
    condition_occurrence_id: Number(c.condition_diagnosis_id),
    person_id: Number(c.patient_id),
    condition_concept_id: lookupSnomedConcept(c.condition_code as string),
    condition_start_date: c.onset_date
      ? new Date(c.onset_date as string).toISOString().split('T')[0]
      : '',
    condition_end_date: c.resolution_date
      ? new Date(c.resolution_date as string).toISOString().split('T')[0]
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
        SELECT observation_id, patient_id, observation_desc, observation_code,
               value_numeric, value_text, units, observation_datetime
        FROM phm_edw.observation WHERE patient_id = ${patientId}
      `
    : await sql`
        SELECT observation_id, patient_id, observation_desc, observation_code,
               value_numeric, value_text, units, observation_datetime
        FROM phm_edw.observation LIMIT 5000
      `;

  return obs.map((o) => ({
    measurement_id: Number(o.observation_id),
    person_id: Number(o.patient_id),
    measurement_concept_id: lookupLoincConcept(o.observation_code as string),
    measurement_date: o.observation_datetime
      ? new Date(o.observation_datetime as string).toISOString().split('T')[0]
      : '',
    value_as_number: o.value_numeric != null ? Number(o.value_numeric) : null,
    value_as_concept_id: null,
    unit_concept_id: 0,
    measurement_source_value:
      (o.observation_code as string) ?? (o.observation_desc as string),
  }));
}

export async function generateDeidentifiedCohort(
  _cohortCriteria: { min_age?: number; max_age?: number; conditions?: string[] },
  limit = 500,
) {
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
