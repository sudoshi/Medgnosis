// =============================================================================
// Medgnosis API — FHIR R4 resource mappers
// =============================================================================

import type { Row } from 'postgres';

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
    meta: { lastUpdated: new Date().toISOString() },
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
    gender: row.gender?.toLowerCase() === 'male' ? 'male' : 'female',
    birthDate: row.date_of_birth
      ? new Date(row.date_of_birth as string).toISOString().split('T')[0]
      : undefined,
    active: true,
  };
}

export function mapConditionToFHIR(
  row: Row,
  patientId: string,
): FHIRResource {
  return {
    resourceType: 'Condition',
    id: String(row.condition_id),
    meta: { lastUpdated: new Date().toISOString() },
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: row.status === 'active' ? 'active' : 'resolved',
        },
      ],
    },
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
    meta: { lastUpdated: new Date().toISOString() },
    status: 'final',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: row.observation_code ?? '',
          display: row.observation_type,
        },
      ],
      text: row.observation_type,
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: row.observation_date
      ? new Date(row.observation_date as string).toISOString()
      : undefined,
  };

  if (row.value_numeric != null) {
    resource.valueQuantity = {
      value: Number(row.value_numeric),
      unit: row.unit ?? '',
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
    id: String(row.medication_id),
    meta: { lastUpdated: new Date().toISOString() },
    status: row.status === 'active' ? 'active' : 'stopped',
    intent: 'order',
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
    authoredOn: row.start_date
      ? new Date(row.start_date as string).toISOString()
      : undefined,
  };
}

export function buildBundle(
  resources: FHIRResource[],
  type: FHIRBundle['type'] = 'searchset',
  baseUrl = 'https://medgnosis.example.com/fhir',
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
