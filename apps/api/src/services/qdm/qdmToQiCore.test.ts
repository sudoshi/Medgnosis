// =============================================================================
// Unit tests - QDM to QI-Core/FHIR projection
// =============================================================================

import { describe, expect, it } from 'vitest';
import { QICORE, US_CORE } from '../fhir/profiles.js';
import {
  normalizeObservation,
  normalizeDiagnosticReport,
  normalizeServiceRequest,
  normalizeDocumentReference,
  normalizeGoal,
} from './fhirToQdm.js';
import type { QdmElement } from './model.js';
import {
  QDM_IDENTIFIER_SYSTEM,
  qdmElementToQiCore,
  qdmElementsToQiCoreBundle,
} from './qdmToQiCore.js';

const NOW = '2026-06-17T18:55:00.000Z';

const patientQdm: QdmElement = {
  id: 'Patient/pat-1',
  qdmVersion: '5.6',
  category: 'Patient',
  datatype: 'Patient',
  status: 'active',
  timing: { birthDate: '1970-05-05' },
  subject: { reference: 'Patient/pat-1', type: 'Patient', id: 'pat-1' },
  attributes: {
    active: true,
    gender: 'female',
    birthDate: '1970-05-05',
    name: { family: 'B', given: ['A'], use: 'official' },
  },
  source: {
    resourceType: 'Patient',
    id: 'pat-1',
    reference: 'Patient/pat-1',
    profiles: [],
    identifiers: [{ system: 'urn:mrn', value: 'MRN-1' }],
  },
};

describe('qdmElementToQiCore', () => {
  it('projects QDM Patient elements to QI-Core Patient resources with QDM/source identifiers', () => {
    const resource = qdmElementToQiCore(patientQdm, { now: NOW });

    expect(resource).toMatchObject({
      resourceType: 'Patient',
      id: 'qdm-Patient-pat-1',
      active: true,
      gender: 'female',
      birthDate: '1970-05-05',
    });
    expect(resource?.meta).toEqual({
      lastUpdated: NOW,
      profile: [US_CORE.patient, QICORE.patient],
    });
    expect(resource?.identifier).toEqual(
      expect.arrayContaining([
        { system: QDM_IDENTIFIER_SYSTEM, value: 'Patient/pat-1' },
        { system: 'urn:mrn', value: 'MRN-1', type: undefined },
      ]),
    );
  });

  it('round-trips a normalized lab Observation back to QI-Core with stable patient reference and valueQuantity', () => {
    const [qdm] = normalizeObservation({
      resourceType: 'Observation',
      id: 'obs-1',
      status: 'final',
      category: [{ coding: [{ code: 'laboratory' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'HbA1c' }] },
      subject: { reference: 'Patient/pat-1' },
      effectiveDateTime: '2026-03-01T00:00:00Z',
      valueQuantity: { value: 9.5, unit: '%', system: 'http://unitsofmeasure.org', code: '%' },
    });

    const resource = qdmElementToQiCore(qdm!, { now: NOW });

    expect(resource).toMatchObject({
      resourceType: 'Observation',
      id: 'qdm-Observation-obs-1',
      status: 'final',
      subject: { reference: 'Patient/qdm-Patient-pat-1' },
      effectiveDateTime: '2026-03-01T00:00:00Z',
      valueQuantity: { value: 9.5, unit: '%', system: 'http://unitsofmeasure.org', code: '%' },
    });
    expect(resource?.meta?.profile).toEqual(
      expect.arrayContaining([US_CORE.observationClinicalResult, QICORE.observationLab]),
    );
    expect(resource?.identifier).toContainEqual({ system: QDM_IDENTIFIER_SYSTEM, value: 'Observation/obs-1' });
  });

  it('projects Medication, Not Ordered negation into QI-Core MedicationRequest doNotPerform', () => {
    const qdm: QdmElement = {
      id: 'MedicationRequest/med-1',
      qdmVersion: '5.6',
      category: 'Medication',
      datatype: 'Medication, Not Ordered',
      status: 'active',
      code: { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '860975', display: 'metformin' },
      subject: { reference: 'Patient/pat-1', type: 'Patient', id: 'pat-1' },
      timing: { authorDateTime: '2026-01-02T00:00:00Z' },
      attributes: {
        intent: 'order',
        negationRationale: [{ system: 'http://snomed.info/sct', code: '183932001', display: 'Procedure contraindicated' }],
      },
      source: { resourceType: 'MedicationRequest', id: 'med-1', profiles: [], identifiers: [] },
    };

    const resource = qdmElementToQiCore(qdm, { now: NOW });

    expect(resource).toMatchObject({
      resourceType: 'MedicationRequest',
      id: 'qdm-MedicationRequest-med-1',
      doNotPerform: true,
      authoredOn: '2026-01-02T00:00:00Z',
      subject: { reference: 'Patient/qdm-Patient-pat-1' },
    });
    expect(resource?.reasonCode).toEqual([
      {
        coding: [{ system: 'http://snomed.info/sct', code: '183932001', display: 'Procedure contraindicated' }],
        text: 'Procedure contraindicated',
      },
    ]);
  });

  it('projects Procedure, Not Performed negation into event statusReason', () => {
    const qdm: QdmElement = {
      id: 'Procedure/proc-1',
      qdmVersion: '5.6',
      category: 'Procedure',
      datatype: 'Procedure, Not Performed',
      status: 'not-done',
      code: { system: 'http://snomed.info/sct', code: '73761001', display: 'Colonoscopy' },
      subject: { reference: 'Patient/pat-1', type: 'Patient', id: 'pat-1' },
      timing: { relevantDateTime: '2026-02-01T00:00:00Z' },
      attributes: {
        negationRationale: [{ system: 'http://snomed.info/sct', code: '182840001', display: 'Drug treatment not indicated' }],
      },
      source: { resourceType: 'Procedure', id: 'proc-1', profiles: [], identifiers: [] },
    };

    const resource = qdmElementToQiCore(qdm, { now: NOW });

    expect(resource).toMatchObject({
      resourceType: 'Procedure',
      id: 'qdm-Procedure-proc-1',
      status: 'not-done',
      performedDateTime: '2026-02-01T00:00:00Z',
      subject: { reference: 'Patient/qdm-Patient-pat-1' },
      statusReason: {
        coding: [{ system: 'http://snomed.info/sct', code: '182840001', display: 'Drug treatment not indicated' }],
      },
    });
  });
});

describe('qdmElementsToQiCoreBundle', () => {
  it('builds an idempotent transaction Bundle from QDM elements', () => {
    const bundle = qdmElementsToQiCoreBundle([patientQdm], { now: NOW });

    expect(bundle).toEqual({
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: 'Patient/qdm-Patient-pat-1',
          resource: expect.objectContaining({ resourceType: 'Patient', id: 'qdm-Patient-pat-1' }),
          request: { method: 'PUT', url: 'Patient/qdm-Patient-pat-1' },
        },
      ],
    });
  });

  it('round-trips a DiagnosticReport to QI-Core', () => {
    const [qdm] = normalizeDiagnosticReport({
      resourceType: 'DiagnosticReport',
      id: 'dr-1',
      status: 'final',
      category: [{ coding: [{ code: 'LAB' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: '24323-8', display: 'CMP' }] },
      subject: { reference: 'Patient/pat-1' },
      effectiveDateTime: '2026-06-05T09:00:00Z',
      issued: '2026-06-05T10:00:00Z',
      conclusion: 'Within normal limits',
    });
    const resource = qdmElementToQiCore(qdm!, { now: NOW });
    expect(resource).toMatchObject({
      resourceType: 'DiagnosticReport',
      id: 'qdm-DiagnosticReport-dr-1',
      status: 'final',
      subject: { reference: 'Patient/qdm-Patient-pat-1' },
      effectiveDateTime: '2026-06-05T09:00:00Z',
      issued: '2026-06-05T10:00:00Z',
      conclusion: 'Within normal limits',
    });
    expect(resource?.meta?.profile).toEqual(
      expect.arrayContaining([US_CORE.diagnosticReportLab, QICORE.diagnosticReportLab]),
    );
  });

  it('round-trips a ServiceRequest to QI-Core Intervention order', () => {
    const [qdm] = normalizeServiceRequest({
      resourceType: 'ServiceRequest',
      id: 'sr-1',
      status: 'active',
      intent: 'order',
      priority: 'urgent',
      code: { coding: [{ system: 'http://loinc.org', code: '24323-8' }] },
      subject: { reference: 'Patient/pat-1' },
      authoredOn: '2026-06-05T09:00:00Z',
    });
    const resource = qdmElementToQiCore(qdm!, { now: NOW });
    expect(resource).toMatchObject({
      resourceType: 'ServiceRequest',
      id: 'qdm-ServiceRequest-sr-1',
      status: 'active',
      intent: 'order',
      priority: 'urgent',
      authoredOn: '2026-06-05T09:00:00Z',
      subject: { reference: 'Patient/qdm-Patient-pat-1' },
    });
    expect(resource?.meta?.profile).toEqual(
      expect.arrayContaining([US_CORE.serviceRequest, QICORE.serviceRequest]),
    );
  });

  it('round-trips a DocumentReference to a QI-Core Communication', () => {
    const [qdm] = normalizeDocumentReference({
      resourceType: 'DocumentReference',
      id: 'doc-1',
      status: 'current',
      docStatus: 'final',
      type: { coding: [{ system: 'http://loinc.org', code: '18842-5', display: 'Discharge summary' }] },
      subject: { reference: 'Patient/pat-1' },
      date: '2026-06-05T09:00:00Z',
    });
    const resource = qdmElementToQiCore(qdm!, { now: NOW });
    expect(resource).toMatchObject({
      resourceType: 'Communication',
      id: 'qdm-DocumentReference-doc-1', // id traces to the source DocumentReference
      status: 'current',
      subject: { reference: 'Patient/qdm-Patient-pat-1' },
      sent: '2026-06-05T09:00:00Z',
      topic: { coding: [{ system: 'http://loinc.org', code: '18842-5', display: 'Discharge summary' }], text: 'Discharge summary' },
    });
    expect(resource?.meta?.profile).toEqual(expect.arrayContaining([QICORE.communication]));
  });

  it('round-trips a Goal to QI-Core', () => {
    const [qdm] = normalizeGoal({
      resourceType: 'Goal',
      id: 'goal-1',
      lifecycleStatus: 'active',
      description: { text: 'A1c < 7' },
      subject: { reference: 'Patient/pat-1' },
      startDate: '2026-01-01',
      target: [{ dueDate: '2026-12-31' }],
    });
    const resource = qdmElementToQiCore(qdm!, { now: NOW });
    expect(resource).toMatchObject({
      resourceType: 'Goal',
      id: 'qdm-Goal-goal-1',
      lifecycleStatus: 'active',
      subject: { reference: 'Patient/qdm-Patient-pat-1' },
      startDate: '2026-01-01',
      description: { text: 'A1c < 7' },
      target: [{ dueDate: '2026-12-31' }],
    });
    expect(resource?.meta?.profile).toEqual(expect.arrayContaining([US_CORE.goal, QICORE.goal]));
  });
});
