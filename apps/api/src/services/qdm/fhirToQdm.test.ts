// =============================================================================
// Unit tests - FHIR/QI-Core-like resources to canonical QDM analytics elements
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  normalizeCondition,
  normalizeDevice,
  normalizeEncounter,
  normalizeFhirResourcesToQdm,
  normalizeMedicationAdministration,
  normalizeMedicationRequest,
  normalizeObservation,
  normalizePatient,
  normalizeProcedure,
} from './fhirToQdm.js';

const patientContext = {
  sourceSystem: 'bulk-fhir-test',
  patient: { reference: 'Patient/mgp-42', type: 'Patient', id: 'mgp-42' },
  provenance: { importRunId: 'run-1' },
};

describe('FHIR to QDM normalizers', () => {
  it('maps Patient to a canonical QDM Patient entity with demographics and source references', () => {
    const [qdm] = normalizePatient(
      {
        resourceType: 'Patient',
        id: 'mgp-42',
        meta: { profile: ['http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-patient'] },
        identifier: [{ system: 'urn:medgnosis:mrn', value: 'MRN-42' }],
        active: true,
        gender: 'female',
        birthDate: '1970-05-05',
        name: [{ family: 'Lovelace', given: ['Ada'], use: 'official' }],
      },
      { sourceSystem: 'qi-core-export' },
    );

    expect(qdm?.category).toBe('Patient');
    expect(qdm?.datatype).toBe('Patient');
    expect(qdm?.status).toBe('active');
    expect(qdm?.timing.birthDate).toBe('1970-05-05');
    expect(qdm?.attributes.gender).toBe('female');
    expect(qdm?.source.identifiers[0]).toEqual({ system: 'urn:medgnosis:mrn', value: 'MRN-42' });
    expect(qdm?.source.sourceSystem).toBe('qi-core-export');
  });

  it('maps Encounter period, status, visit code, class, and subject', () => {
    const [qdm] = normalizeEncounter(
      {
        resourceType: 'Encounter',
        id: 'mge-10',
        status: 'finished',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
        type: [{ coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '99213', display: 'Office Visit' }] }],
        subject: { reference: 'Patient/mgp-42' },
        period: { start: '2026-01-01T13:00:00Z', end: '2026-01-01T13:30:00Z' },
      },
      patientContext,
    );

    expect(qdm?.category).toBe('Encounter');
    expect(qdm?.datatype).toBe('Encounter, Performed');
    expect(qdm?.status).toBe('finished');
    expect(qdm?.code?.code).toBe('99213');
    expect(qdm?.timing.relevantPeriod).toEqual({
      start: '2026-01-01T13:00:00Z',
      end: '2026-01-01T13:30:00Z',
    });
    expect(qdm?.subject?.id).toBe('mgp-42');
  });

  it('maps Condition clinical status and onset/abatement into Diagnosis prevalencePeriod', () => {
    const [qdm] = normalizeCondition(
      {
        resourceType: 'Condition',
        id: 'mgc-9',
        clinicalStatus: { coding: [{ code: 'active' }] },
        verificationStatus: { coding: [{ code: 'confirmed' }] },
        code: { coding: [{ system: 'http://snomed.info/sct', code: '44054006', display: 'Type 2 diabetes' }] },
        subject: { reference: 'Patient/mgp-42' },
        onsetDateTime: '2020-03-15T00:00:00Z',
      },
      patientContext,
    );

    expect(qdm?.category).toBe('Condition');
    expect(qdm?.datatype).toBe('Diagnosis');
    expect(qdm?.status).toBe('active');
    expect(qdm?.code?.code).toBe('44054006');
    expect(qdm?.timing.prevalencePeriod?.start).toBe('2020-03-15T00:00:00Z');
    expect(qdm?.attributes.verificationStatus).toBe('confirmed');
  });

  it('maps lab Observation to Laboratory Test, Performed with result value and components', () => {
    const [qdm] = normalizeObservation(
      {
        resourceType: 'Observation',
        id: 'mgo-7',
        status: 'final',
        category: [{ coding: [{ code: 'laboratory' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'HbA1c' }] },
        subject: { reference: 'Patient/mgp-42' },
        effectiveDateTime: '2026-03-01T00:00:00Z',
        valueQuantity: { value: 9.5, unit: '%', system: 'http://unitsofmeasure.org' },
        component: [
          {
            code: { coding: [{ system: 'http://loinc.org', code: '17856-6', display: 'Hemoglobin A1c method' }] },
            valueString: 'HPLC',
          },
        ],
      },
      patientContext,
    );

    expect(qdm?.category).toBe('Laboratory Test');
    expect(qdm?.datatype).toBe('Laboratory Test, Performed');
    expect(qdm?.code?.code).toBe('4548-4');
    expect(qdm?.timing.relevantDateTime).toBe('2026-03-01T00:00:00Z');
    expect(qdm?.attributes.value).toEqual({ value: 9.5, unit: '%', system: 'http://unitsofmeasure.org' });
    expect((qdm?.attributes.components as Array<{ code: { code: string }; value: string }>)[0]?.code.code).toBe(
      '17856-6',
    );
  });

  it('maps MedicationRequest doNotPerform to Medication, Not Ordered with negation rationale', () => {
    const [qdm] = normalizeMedicationRequest(
      {
        resourceType: 'MedicationRequest',
        id: 'mgm-2',
        status: 'active',
        intent: 'order',
        doNotPerform: true,
        medicationCodeableConcept: {
          coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '860975', display: 'metformin' }],
        },
        authoredOn: '2026-01-02T00:00:00Z',
        reasonCode: [{ coding: [{ system: 'http://snomed.info/sct', code: '183932001', display: 'Not indicated' }] }],
      },
      patientContext,
    );

    expect(qdm?.category).toBe('Medication');
    expect(qdm?.datatype).toBe('Medication, Not Ordered');
    expect(qdm?.code?.code).toBe('860975');
    expect(qdm?.timing.authorDateTime).toBe('2026-01-02T00:00:00Z');
    expect((qdm?.attributes.negationRationale as Array<{ code: string }>)[0]?.code).toBe('183932001');
  });

  it('maps MedicationAdministration to Medication, Administered with effective period and dosage', () => {
    const [qdm] = normalizeMedicationAdministration(
      {
        resourceType: 'MedicationAdministration',
        id: 'medadmin-1',
        status: 'completed',
        medicationCodeableConcept: { coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '1049502' }] },
        subject: { reference: 'Patient/mgp-42' },
        effectivePeriod: { start: '2026-01-03T10:00:00Z', end: '2026-01-03T10:05:00Z' },
        dosage: { dose: { value: 5, unit: 'mg' } },
      },
      patientContext,
    );

    expect(qdm?.datatype).toBe('Medication, Administered');
    expect(qdm?.status).toBe('completed');
    expect(qdm?.timing.relevantPeriod?.start).toBe('2026-01-03T10:00:00Z');
    expect(qdm?.attributes.dosage).toEqual({ dose: { value: 5, unit: 'mg' } });
  });

  it('maps Procedure not-done status to Procedure, Not Performed with rationale', () => {
    const [qdm] = normalizeProcedure(
      {
        resourceType: 'Procedure',
        id: 'proc-1',
        status: 'not-done',
        code: { coding: [{ system: 'http://snomed.info/sct', code: '73761001', display: 'Colonoscopy' }] },
        subject: { reference: 'Patient/mgp-42' },
        performedDateTime: '2026-02-01T00:00:00Z',
        statusReason: { coding: [{ system: 'http://snomed.info/sct', code: '182840001', display: 'Patient refused' }] },
      },
      patientContext,
    );

    expect(qdm?.category).toBe('Procedure');
    expect(qdm?.datatype).toBe('Procedure, Not Performed');
    expect(qdm?.code?.code).toBe('73761001');
    expect((qdm?.attributes.negationRationale as Array<{ code: string }>)[0]?.code).toBe('182840001');
  });

  it('maps Device to a QDM Device entity with type, identifiers, and UDI attributes', () => {
    const [qdm] = normalizeDevice(
      {
        resourceType: 'Device',
        id: 'device-1',
        status: 'active',
        identifier: [{ system: 'urn:ietf:rfc:3986', value: 'urn:udi:123' }],
        type: { coding: [{ system: 'http://snomed.info/sct', code: '706004007', display: 'Implantable defibrillator' }] },
        patient: { reference: 'Patient/mgp-42' },
        manufacturer: 'Acme Medical',
        lotNumber: 'LOT-9',
        serialNumber: 'SN-1',
        udiCarrier: [{ deviceIdentifier: '123' }],
      },
      patientContext,
    );

    expect(qdm?.category).toBe('Device');
    expect(qdm?.datatype).toBe('Device');
    expect(qdm?.code?.code).toBe('706004007');
    expect(qdm?.source.identifiers[0]?.value).toBe('urn:udi:123');
    expect(qdm?.attributes.patient).toEqual({ reference: 'Patient/mgp-42', type: 'Patient', id: 'mgp-42' });
    expect(qdm?.attributes.serialNumber).toBe('SN-1');
  });

  it('normalizes mixed resource arrays and ignores unsupported resources', () => {
    const elements = normalizeFhirResourcesToQdm([
      { resourceType: 'Patient', id: 'mgp-42' },
      { resourceType: 'Observation', id: 'obs-1', category: [{ coding: [{ code: 'survey' }] }] },
      { resourceType: 'Coverage', id: 'coverage-1' },
    ]);

    expect(elements.map((element) => element.datatype)).toEqual(['Patient', 'Assessment, Performed']);
  });
});
