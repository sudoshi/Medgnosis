// =============================================================================
// Medgnosis API — FHIR profile canonicals + US Core terminology constants
// Single source of truth for meta.profile assertions and coded concepts used
// by the read-only FHIR mappers. US Core 7.0.0 canonicals (QI-Core 7.0.2 base).
// =============================================================================

export const US_CORE = {
  patient: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
  conditionProblems:
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns',
  observationClinicalResult:
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-clinical-result',
  medicationRequest:
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest',
} as const;

export const US_CORE_EXT = {
  race: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
  ethnicity: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
  birthsex: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
} as const;

// CDC Race & Ethnicity code system (OMB categories live here).
export const CDC_RACE_SYSTEM = 'urn:oid:2.16.840.1.113883.6.238';

export const CONDITION_CATEGORY_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/condition-category';
export const CONDITION_VER_STATUS_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/condition-ver-status';
export const OBSERVATION_CATEGORY_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/observation-category';

// Free-text EDW race strings → OMB category {code, display}. Mirrors the
// concept buckets already used in services/omopExport.ts.
export const RACE_OMB: Record<string, { code: string; display: string }> = {
  white: { code: '2106-3', display: 'White' },
  black: { code: '2054-5', display: 'Black or African American' },
  'african american': { code: '2054-5', display: 'Black or African American' },
  asian: { code: '2028-9', display: 'Asian' },
  'american indian': {
    code: '1002-5',
    display: 'American Indian or Alaska Native',
  },
  'alaska native': {
    code: '1002-5',
    display: 'American Indian or Alaska Native',
  },
  'native hawaiian': {
    code: '2076-8',
    display: 'Native Hawaiian or Other Pacific Islander',
  },
  'pacific islander': {
    code: '2076-8',
    display: 'Native Hawaiian or Other Pacific Islander',
  },
};

export const ETHNICITY_OMB = {
  hispanic: { code: '2135-2', display: 'Hispanic or Latino' },
  nonHispanic: { code: '2186-5', display: 'Not Hispanic or Latino' },
} as const;
