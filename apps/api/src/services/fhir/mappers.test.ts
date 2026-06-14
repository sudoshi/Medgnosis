// =============================================================================
// Unit tests — FHIR R4 mappers (US Core 7.0.0 conformance)
// =============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  toFhirGender,
  usCoreRaceExtension,
  usCoreEthnicityExtension,
  mapPatientToFHIR,
  mapConditionToFHIR,
  mapObservationToFHIR,
  mapMedicationToFHIR,
  buildBundle,
} from './mappers.js';
import { US_CORE, US_CORE_EXT } from './profiles.js';

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'test-fixtures',
  'fhir',
);

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8')) as Record<string, unknown>;
}

function stripVolatile(r: Record<string, unknown>): Record<string, unknown> {
  const meta = { ...(r.meta as Record<string, unknown>) };
  delete meta.lastUpdated;
  return { ...r, meta };
}

// --------------------------------------------------------------------------
// Task 2 — gender
// --------------------------------------------------------------------------
describe('toFhirGender', () => {
  it('maps male variants to male', () => {
    expect(toFhirGender('Male')).toBe('male');
    expect(toFhirGender('M')).toBe('male');
    expect(toFhirGender('male')).toBe('male');
  });
  it('maps female variants to female', () => {
    expect(toFhirGender('Female')).toBe('female');
    expect(toFhirGender('F')).toBe('female');
  });
  it('maps non-binary and unknown WITHOUT collapsing to female (data-loss regression)', () => {
    expect(toFhirGender('Non-binary')).toBe('other');
    expect(toFhirGender('X')).toBe('other');
    expect(toFhirGender(null)).toBe('unknown');
    expect(toFhirGender('')).toBe('unknown');
    expect(toFhirGender(undefined)).toBe('unknown');
  });
});

describe('mapPatientToFHIR gender', () => {
  it('does not silently turn non-binary into female', () => {
    const r = mapPatientToFHIR({
      patient_id: 1,
      first_name: 'A',
      last_name: 'B',
      gender: 'Non-binary',
    } as never);
    expect(r.gender).toBe('other');
  });
});

// --------------------------------------------------------------------------
// Task 3 — meta.profile + required US Core elements
// --------------------------------------------------------------------------
describe('meta.profile assertions', () => {
  it('Patient claims us-core-patient', () => {
    const r = mapPatientToFHIR({
      patient_id: 1,
      first_name: 'A',
      last_name: 'B',
      gender: 'M',
    } as never);
    expect(r.meta?.profile).toContain(US_CORE.patient);
  });
  it('Condition claims us-core-condition + carries category and verificationStatus', () => {
    const r = mapConditionToFHIR(
      {
        condition_diagnosis_id: 9,
        condition_name: 'DM2',
        condition_code: '44054006',
        diagnosis_status: 'active',
      } as never,
      '1',
    );
    expect(r.meta?.profile).toContain(US_CORE.conditionProblems);
    expect((r.category as unknown[]).length).toBeGreaterThan(0);
    expect(r.verificationStatus).toBeDefined();
  });
  it('Observation claims us-core-observation-clinical-result + carries category', () => {
    const r = mapObservationToFHIR(
      {
        observation_id: 7,
        observation_desc: 'A1c',
        observation_code: '4548-4',
        value_numeric: 8.1,
        units: '%',
      } as never,
      '1',
    );
    expect(r.meta?.profile).toContain(US_CORE.observationClinicalResult);
    expect((r.category as unknown[]).length).toBeGreaterThan(0);
  });
  it('MedicationRequest claims us-core-medicationrequest + reportedBoolean', () => {
    const r = mapMedicationToFHIR(
      {
        medication_order_id: 3,
        medication_name: 'Metformin',
        medication_code: '6809',
        prescription_status: 'active',
      } as never,
      '1',
    );
    expect(r.meta?.profile).toContain(US_CORE.medicationRequest);
    expect(r.reportedBoolean).toBe(false);
  });
});

// --------------------------------------------------------------------------
// Task 4 — US Core demographic extensions
// --------------------------------------------------------------------------
describe('US Core demographic extensions', () => {
  it('builds a race extension with ombCategory + text', () => {
    const ext = usCoreRaceExtension('White');
    expect(ext?.url).toBe(US_CORE_EXT.race);
    const omb = ext?.extension.find((e) => e.url === 'ombCategory');
    expect(omb?.valueCoding?.code).toBe('2106-3');
  });
  it('returns undefined for an unmappable/empty race', () => {
    expect(usCoreRaceExtension(null)).toBeUndefined();
    expect(usCoreRaceExtension('Klingon')).toBeUndefined();
  });
  it('builds ethnicity extension and detects hispanic vs not', () => {
    expect(
      usCoreEthnicityExtension('Hispanic or Latino')?.extension.find(
        (e) => e.url === 'ombCategory',
      )?.valueCoding?.code,
    ).toBe('2135-2');
    expect(
      usCoreEthnicityExtension('Not Hispanic')?.extension.find(
        (e) => e.url === 'ombCategory',
      )?.valueCoding?.code,
    ).toBe('2186-5');
  });
  it('Patient includes extensions when race/ethnicity present', () => {
    const r = mapPatientToFHIR({
      patient_id: 1,
      first_name: 'A',
      last_name: 'B',
      gender: 'F',
      race: 'Black',
      ethnicity: 'Hispanic',
    } as never);
    const urls = (r.extension as Array<{ url: string }>).map((e) => e.url);
    expect(urls).toContain(US_CORE_EXT.race);
    expect(urls).toContain(US_CORE_EXT.ethnicity);
  });
});

// --------------------------------------------------------------------------
// Task 5 — buildBundle base URL
// --------------------------------------------------------------------------
describe('buildBundle base URL', () => {
  it('uses the provided base URL and never the example.com placeholder', () => {
    const b = buildBundle(
      [{ resourceType: 'Patient', id: '1' }],
      'searchset',
      'https://medgnosis.acumenus.net/api/fhir',
    );
    expect(b.entry[0]!.fullUrl).toBe('https://medgnosis.acumenus.net/api/fhir/Patient/1');
    expect(b.entry[0]!.fullUrl).not.toContain('example.com');
  });
  it('default base URL is not the example placeholder', () => {
    const b = buildBundle([{ resourceType: 'Patient', id: '1' }]);
    expect(b.entry[0]!.fullUrl).not.toContain('example.com');
  });
});

// --------------------------------------------------------------------------
// Task 6 — golden fixtures stay in sync with mappers (shape pinned for the
// HL7 validator CI job)
// --------------------------------------------------------------------------
describe('golden fixtures stay in sync with mappers', () => {
  it('Patient mapper output matches patient.json', () => {
    const r = mapPatientToFHIR({
      patient_id: 12345,
      mrn: 'MRN-12345',
      first_name: 'Ada',
      last_name: 'Lovelace',
      date_of_birth: '1980-12-10',
      gender: 'Female',
      race: 'White',
      ethnicity: 'Not Hispanic',
    } as never);
    expect(stripVolatile(r)).toEqual(stripVolatile(loadFixture('patient.json')));
  });

  it('Condition mapper output matches condition.json', () => {
    const r = mapConditionToFHIR(
      {
        condition_diagnosis_id: 555,
        condition_name: 'Type 2 diabetes mellitus',
        condition_code: '44054006',
        diagnosis_status: 'active',
        onset_date: '2020-03-15',
      } as never,
      '12345',
    );
    expect(stripVolatile(r)).toEqual(stripVolatile(loadFixture('condition.json')));
  });

  it('Observation mapper output matches observation.json', () => {
    const r = mapObservationToFHIR(
      {
        observation_id: 777,
        observation_desc: 'Hemoglobin A1c/Hemoglobin.total in Blood',
        observation_code: '4548-4',
        value_numeric: 8.1,
        units: '%',
        observation_datetime: '2024-06-01T10:00:00.000Z',
      } as never,
      '12345',
    );
    expect(stripVolatile(r)).toEqual(stripVolatile(loadFixture('observation.json')));
  });
});
