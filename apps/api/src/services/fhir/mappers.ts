// =============================================================================
// Medgnosis API — FHIR R4 resource mappers
// =============================================================================

import type { Row } from 'postgres';
import {
  US_CORE,
  US_CORE_EXT,
  CDC_RACE_SYSTEM,
  RACE_OMB,
  ETHNICITY_OMB,
  CONDITION_CATEGORY_SYSTEM,
  CONDITION_VER_STATUS_SYSTEM,
  OBSERVATION_CATEGORY_SYSTEM,
  ENCOUNTER_CLASS_SYSTEM,
} from './profiles.js';
import { crosswalkEncounter } from './encounterCrosswalk.js';

export type FhirGender = 'male' | 'female' | 'other' | 'unknown';

/**
 * Map free-text EDW gender (M/F/Male/Female/Non-binary/...) to the FHIR
 * AdministrativeGender value set WITHOUT data loss. Anything non-empty that is
 * not clearly male/female maps to 'other'; null/empty maps to 'unknown'.
 * (Regression guard: the prior implementation collapsed everything non-male
 * to 'female'.)
 */
export function toFhirGender(raw: unknown): FhirGender {
  if (raw == null) return 'unknown';
  const v = String(raw).trim().toLowerCase();
  if (v === '') return 'unknown';
  if (v === 'male' || v === 'm') return 'male';
  if (v === 'female' || v === 'f') return 'female';
  return 'other';
}

interface UsCoreOmbExtension {
  url: string;
  extension: Array<{
    url: 'ombCategory' | 'text';
    valueCoding?: { system: string; code: string; display: string };
    valueString?: string;
  }>;
}

export function usCoreRaceExtension(race: unknown): UsCoreOmbExtension | undefined {
  if (race == null) return undefined;
  const key = String(race).trim().toLowerCase();
  const omb = RACE_OMB[key];
  if (!omb) return undefined;
  return {
    url: US_CORE_EXT.race,
    extension: [
      {
        url: 'ombCategory',
        valueCoding: { system: CDC_RACE_SYSTEM, code: omb.code, display: omb.display },
      },
      { url: 'text', valueString: omb.display },
    ],
  };
}

export function usCoreEthnicityExtension(
  ethnicity: unknown,
): UsCoreOmbExtension | undefined {
  if (ethnicity == null) return undefined;
  const v = String(ethnicity).trim().toLowerCase();
  if (v === '') return undefined;
  const omb =
    v.includes('hispanic') && !v.includes('not')
      ? ETHNICITY_OMB.hispanic
      : ETHNICITY_OMB.nonHispanic;
  return {
    url: US_CORE_EXT.ethnicity,
    extension: [
      {
        url: 'ombCategory',
        valueCoding: { system: CDC_RACE_SYSTEM, code: omb.code, display: omb.display },
      },
      { url: 'text', valueString: omb.display },
    ],
  };
}

export interface FHIRResource {
  resourceType: string;
  id: string;
  meta?: { lastUpdated: string; profile?: string[] };
  [key: string]: unknown;
}

export interface FHIRBundle {
  resourceType: 'Bundle';
  type: 'searchset' | 'document' | 'collection';
  total: number;
  entry: Array<{ fullUrl: string; resource: FHIRResource }>;
}

export function mapPatientToFHIR(row: Row): FHIRResource {
  return {
    resourceType: 'Patient',
    id: String(row.patient_id),
    meta: { lastUpdated: new Date().toISOString(), profile: [US_CORE.patient] },
    identifier: [
      {
        system: 'urn:medgnosis:mrn',
        value: row.mrn ?? String(row.patient_id),
      },
    ],
    name: [
      {
        family: row.last_name,
        given: [row.first_name],
        use: 'official',
      },
    ],
    gender: toFhirGender(row.gender),
    birthDate: row.date_of_birth
      ? new Date(row.date_of_birth as string).toISOString().split('T')[0]
      : undefined,
    active: true,
    extension: [
      usCoreRaceExtension(row.race),
      usCoreEthnicityExtension(row.ethnicity),
    ].filter((e): e is UsCoreOmbExtension => e !== undefined),
  };
}

// EDW diagnosis_status → FHIR condition-clinical code. Default to active; only
// an explicit resolved/inactive/remission marker demotes the condition.
function toConditionClinicalStatus(raw: unknown): 'active' | 'resolved' | 'inactive' {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'resolved') return 'resolved';
  if (v === 'inactive' || v === 'remission') return 'inactive';
  return 'active';
}

export function mapConditionToFHIR(
  row: Row,
  patientId: string,
): FHIRResource {
  return {
    resourceType: 'Condition',
    id: String(row.condition_diagnosis_id),
    meta: {
      lastUpdated: new Date().toISOString(),
      profile: [US_CORE.conditionProblems],
    },
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          // EDW diagnosis_status is frequently null/unpopulated; an unresolved
          // diagnosis is active. Only an explicit resolved/inactive marker
          // demotes it (a 'resolved' default broke QI-Core prevalenceInterval so
          // chronic conditions like diabetes never overlapped the period).
          code: toConditionClinicalStatus(row.diagnosis_status),
        },
      ],
    },
    verificationStatus: {
      coding: [{ system: CONDITION_VER_STATUS_SYSTEM, code: 'confirmed' }],
    },
    category: [
      {
        coding: [
          {
            system: CONDITION_CATEGORY_SYSTEM,
            code: 'problem-list-item',
            display: 'Problem List Item',
          },
        ],
      },
      // Also tag encounter-diagnosis: phm_edw.condition_diagnosis rows are
      // encounter diagnoses, and QI-Core eCQMs retrieve diagnoses via
      // [ConditionEncounterDiagnosis] (e.g. CMS122 "Diabetes"). Without this
      // category the measure's diabetes lookup finds nothing.
      {
        coding: [
          {
            system: CONDITION_CATEGORY_SYSTEM,
            code: 'encounter-diagnosis',
            display: 'Encounter Diagnosis',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: row.condition_code ?? '',
          display: row.condition_name,
        },
      ],
      text: row.condition_name,
    },
    subject: { reference: `Patient/${patientId}` },
    onsetDateTime: row.onset_date
      ? new Date(row.onset_date as string).toISOString()
      : undefined,
  };
}

export function mapObservationToFHIR(
  row: Row,
  patientId: string,
): FHIRResource {
  const resource: FHIRResource = {
    resourceType: 'Observation',
    id: String(row.observation_id),
    meta: {
      lastUpdated: new Date().toISOString(),
      profile: [US_CORE.observationClinicalResult],
    },
    status: 'final',
    category: [
      {
        coding: [
          {
            system: OBSERVATION_CATEGORY_SYSTEM,
            code: 'laboratory',
            display: 'Laboratory',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: row.observation_code ?? '',
          display: row.observation_desc,
        },
      ],
      text: row.observation_desc,
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: row.observation_datetime
      ? new Date(row.observation_datetime as string).toISOString()
      : undefined,
  };

  if (row.value_numeric != null) {
    resource.valueQuantity = {
      value: Number(row.value_numeric),
      unit: row.units ?? '',
      system: 'http://unitsofmeasure.org',
    };
  } else if (row.value_text) {
    resource.valueString = row.value_text;
  }

  return resource;
}

export function mapMedicationToFHIR(
  row: Row,
  patientId: string,
): FHIRResource {
  return {
    resourceType: 'MedicationRequest',
    id: String(row.medication_order_id),
    meta: {
      lastUpdated: new Date().toISOString(),
      profile: [US_CORE.medicationRequest],
    },
    status: row.prescription_status === 'active' ? 'active' : 'stopped',
    intent: 'order',
    reportedBoolean: false,
    medicationCodeableConcept: {
      coding: [
        {
          system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
          code: row.medication_code ?? '',
          display: row.medication_name,
        },
      ],
      text: row.medication_name,
    },
    subject: { reference: `Patient/${patientId}` },
    authoredOn: row.start_datetime
      ? new Date(row.start_datetime as string).toISOString()
      : undefined,
  };
}

// EDW encounter.status → FHIR Encounter.status. Historical EDW encounters are
// completed visits; map the common active/open markers to in-progress, else
// finished.
function toEncounterStatus(raw: unknown): string {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'active' || v === 'in-progress' || v === 'in progress' || v === 'open') return 'in-progress';
  if (v === 'cancelled' || v === 'canceled') return 'cancelled';
  return 'finished';
}

export function mapEncounterToFHIR(
  row: Row,
  patientId: string,
): FHIRResource {
  const x = crosswalkEncounter(row.encounter_type);
  const type =
    x.typeCoding != null
      ? [{ coding: [x.typeCoding], text: row.encounter_type ?? undefined }]
      : row.encounter_type != null
        ? [{ text: String(row.encounter_type) }]
        : undefined;

  const resource: FHIRResource = {
    resourceType: 'Encounter',
    id: String(row.encounter_id),
    meta: { lastUpdated: new Date().toISOString(), profile: [US_CORE.encounter] },
    status: toEncounterStatus(row.status),
    class: { system: ENCOUNTER_CLASS_SYSTEM, code: x.classCode },
    subject: { reference: `Patient/${patientId}` },
    period: {
      start: row.encounter_datetime
        ? new Date(row.encounter_datetime as string).toISOString()
        : undefined,
      end: row.discharge_datetime
        ? new Date(row.discharge_datetime as string).toISOString()
        : undefined,
    },
  };
  if (type) resource.type = type;
  return resource;
}

export function buildBundle(
  resources: FHIRResource[],
  type: FHIRBundle['type'] = 'searchset',
  baseUrl = 'http://localhost:3000/api/fhir',
): FHIRBundle {
  return {
    resourceType: 'Bundle',
    type,
    total: resources.length,
    entry: resources.map((resource) => ({
      fullUrl: `${baseUrl}/${resource.resourceType}/${resource.id}`,
      resource,
    })),
  };
}
