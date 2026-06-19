// =============================================================================
// Unit tests - staged FHIR to EDW workspace hydration
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FhirResource } from './types.js';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  type SqlMock = typeof fn & {
    json: (value: unknown) => unknown;
    unsafe: (query: string, parameters?: readonly unknown[]) => Promise<unknown>;
    begin: <T>(cb: (tx: SqlMock) => Promise<T>) => Promise<T>;
  };
  const sqlMock = fn as SqlMock;
  sqlMock.json = (value: unknown) => value;
  sqlMock.unsafe = async (query, parameters = []) =>
    fn([query] as unknown as TemplateStringsArray, ...parameters);
  sqlMock.begin = async (cb) => cb(sqlMock);
  return { mockSql: sqlMock };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { hydrateStagedRunToEdw } from './edwHydration.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.unsafe = async (query, parameters = []) =>
    mockSql([query] as unknown as TemplateStringsArray, ...parameters);
  mockSql.begin = async (cb) => cb(mockSql);
});

const ingestRunId = '00000000-0000-4000-8000-000000000063';

function stagedRow(
  id: number,
  resourceType: string,
  resourceId: string,
  resource: FhirResource,
): Record<string, unknown> {
  return {
    id,
    org_id: 7,
    ehr_tenant_id: 42,
    ingest_run_id: ingestRunId,
    resource_type: resourceType,
    resource_id: resourceId,
    patient_ref: 'Patient/pat-1',
    resource,
    source_version_id: '1',
    source_last_updated: '2026-06-19T12:00:00Z',
    content_hash: `${id}`.padStart(64, 'a').slice(0, 64),
    received_at: '2026-06-19T12:00:00Z',
  };
}

const encounter: FhirResource = {
  resourceType: 'Encounter',
  id: 'enc-1',
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
  type: [{ text: 'Office visit' }],
  subject: { reference: 'Patient/pat-1' },
  period: { start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z' },
};

const condition: FhirResource = {
  resourceType: 'Condition',
  id: 'cond-1',
  subject: { reference: 'Patient/pat-1' },
  encounter: { reference: 'Encounter/enc-1' },
  clinicalStatus: { coding: [{ code: 'active' }] },
  code: { coding: [{ system: 'http://snomed.info/sct', code: '44054006', display: 'Diabetes' }] },
  onsetDateTime: '2024-01-01T00:00:00Z',
};

const observation: FhirResource = {
  resourceType: 'Observation',
  id: 'obs-1',
  subject: { reference: 'Patient/pat-1' },
  encounter: { reference: 'Encounter/enc-1' },
  status: 'final',
  code: { coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'HbA1c' }] },
  effectiveDateTime: '2026-06-02T08:00:00Z',
  valueQuantity: { value: 8.2, unit: '%' },
};

const medicationRequest: FhirResource = {
  resourceType: 'MedicationRequest',
  id: 'med-1',
  subject: { reference: 'Patient/pat-1' },
  encounter: { reference: 'Encounter/enc-1' },
  status: 'active',
  intent: 'order',
  authoredOn: '2026-06-03T08:00:00Z',
  medicationCodeableConcept: {
    coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '860975', display: 'Metformin' }],
  },
  dosageInstruction: [{ text: '500 mg BID', timing: { repeat: { frequency: 2, period: 1, periodUnit: 'd' } } }],
  dispenseRequest: { numberOfRepeatsAllowed: 2 },
};

const procedure: FhirResource = {
  resourceType: 'Procedure',
  id: 'proc-1',
  subject: { reference: 'Patient/pat-1' },
  encounter: { reference: 'Encounter/enc-1' },
  status: 'completed',
  code: { coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '45378', display: 'Colonoscopy' }] },
  performedDateTime: '2026-06-04T09:00:00Z',
};

const allergyIntolerance: FhirResource = {
  resourceType: 'AllergyIntolerance',
  id: 'alg-1',
  patient: { reference: 'Patient/pat-1' },
  clinicalStatus: { coding: [{ code: 'active', display: 'Active' }] },
  category: ['medication'],
  code: {
    coding: [{ system: 'http://snomed.info/sct', code: '91936005', display: 'Penicillin allergy' }],
  },
  reaction: [{ manifestation: [{ text: 'Hives' }], severity: 'moderate' }],
  onsetDateTime: '2024-06-01T00:00:00Z',
};

const immunization: FhirResource = {
  resourceType: 'Immunization',
  id: 'imm-1',
  patient: { reference: 'Patient/pat-1' },
  status: 'completed',
  vaccineCode: { coding: [{ system: 'http://hl7.org/fhir/sid/cvx', code: '140', display: 'Influenza vaccine' }] },
  occurrenceDateTime: '2025-10-01T12:00:00Z',
  lotNumber: 'LOT-1',
  expirationDate: '2026-10-01',
  site: { text: 'Left arm' },
};

describe('hydrateStagedRunToEdw', () => {
  it('hydrates callback-staged resources into EDW rows and points crosswalks at EDW targets', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) {
        return Promise.resolve([
          stagedRow(1, 'Encounter', 'enc-1', encounter),
          stagedRow(2, 'Condition', 'cond-1', condition),
          stagedRow(3, 'Observation', 'obs-1', observation),
          stagedRow(4, 'MedicationRequest', 'med-1', medicationRequest),
          stagedRow(5, 'Procedure', 'proc-1', procedure),
          stagedRow(6, 'AllergyIntolerance', 'alg-1', allergyIntolerance),
          stagedRow(7, 'Immunization', 'imm-1', immunization),
        ]);
      }
      if (text.includes('SELECT COALESCE(patient_id')) {
        return Promise.resolve([{ patient_id: 123 }]);
      }
      if (text.includes('SELECT local_table, local_id')) {
        return Promise.resolve([]);
      }
      if (text.includes("resource_type = 'Encounter'") && text.includes("local_table = 'phm_edw.encounter'")) {
        return Promise.resolve([{ local_id: 456 }]);
      }
      if (text.includes('SELECT condition_id')) {
        return Promise.resolve([]);
      }
      if (text.includes('INSERT INTO phm_edw.condition\n')) {
        return Promise.resolve([{ condition_id: 321 }]);
      }
      if (text.includes('INSERT INTO phm_edw.condition_diagnosis')) {
        return Promise.resolve([{ condition_diagnosis_id: 654 }]);
      }
      if (text.includes('SELECT medication_id')) {
        return Promise.resolve([]);
      }
      if (text.includes('INSERT INTO phm_edw.medication\n')) {
        return Promise.resolve([{ medication_id: 432 }]);
      }
      if (text.includes('INSERT INTO phm_edw.medication_order')) {
        return Promise.resolve([{ medication_order_id: 876 }]);
      }
      if (text.includes('SELECT procedure_id')) {
        return Promise.resolve([]);
      }
      if (text.includes('INSERT INTO phm_edw.procedure\n')) {
        return Promise.resolve([{ procedure_id: 987 }]);
      }
      if (text.includes('INSERT INTO phm_edw.procedure_performed')) {
        return Promise.resolve([{ procedure_performed_id: 988 }]);
      }
      if (text.includes('SELECT allergy_id')) {
        return Promise.resolve([]);
      }
      if (text.includes('INSERT INTO phm_edw.allergy')) {
        return Promise.resolve([{ allergy_id: 765 }]);
      }
      if (text.includes('INSERT INTO phm_edw.patient_allergy')) {
        return Promise.resolve([{ patient_allergy_id: 766 }]);
      }
      if (text.includes('INSERT INTO phm_edw.immunization')) {
        return Promise.resolve([{ immunization_id: 877 }]);
      }
      if (text.includes('INSERT INTO phm_edw.encounter')) {
        return Promise.resolve([{ encounter_id: 456 }]);
      }
      if (text.includes('INSERT INTO phm_edw.observation')) {
        return Promise.resolve([{ observation_id: 789 }]);
      }
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({
      ingestRunId,
      ehrTenantId: 42,
      orgId: 7,
      limit: 50,
    });

    expect(result).toMatchObject({
      resourcesSeen: 7,
      resourcesHydrated: 7,
      resourcesSkipped: 0,
      resourcesFailed: 0,
      rowsInserted: 7,
      rowsUpdated: 0,
      byResourceType: {
        Encounter: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
        Condition: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
        Observation: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
        MedicationRequest: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
        Procedure: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
        AllergyIntolerance: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
        Immunization: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
      },
      errors: [],
    });

    const queries = mockSql.mock.calls.map((call) => (call[0] as TemplateStringsArray).join(''));
    expect(queries.some((query) => query.includes('ORDER BY CASE resource_type'))).toBe(true);
    expect(queries.some((query) => query.includes('INSERT INTO phm_edw.encounter'))).toBe(true);
    expect(queries.some((query) => query.includes('INSERT INTO phm_edw.condition_diagnosis'))).toBe(true);
    expect(queries.some((query) => query.includes('INSERT INTO phm_edw.observation'))).toBe(true);
    expect(queries.some((query) => query.includes('INSERT INTO phm_edw.medication_order'))).toBe(true);
    expect(queries.some((query) => query.includes('INSERT INTO phm_edw.procedure_performed'))).toBe(true);
    expect(queries.some((query) => query.includes('INSERT INTO phm_edw.patient_allergy'))).toBe(true);
    expect(queries.some((query) => query.includes('INSERT INTO phm_edw.immunization'))).toBe(true);

    const crosswalkTargets = mockSql.mock.calls
      .filter((call) => (call[0] as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.ehr_resource_crosswalk'))
      .map((call) => ({ resourceType: call[2], localTable: call[5], localId: call[6], patientId: call[7] }));

    expect(crosswalkTargets).toEqual([
      { resourceType: 'Encounter', localTable: 'phm_edw.encounter', localId: 456, patientId: 123 },
      { resourceType: 'Condition', localTable: 'phm_edw.condition_diagnosis', localId: 654, patientId: 123 },
      { resourceType: 'Observation', localTable: 'phm_edw.observation', localId: 789, patientId: 123 },
      { resourceType: 'MedicationRequest', localTable: 'phm_edw.medication_order', localId: 876, patientId: 123 },
      { resourceType: 'Procedure', localTable: 'phm_edw.procedure_performed', localId: 988, patientId: 123 },
      { resourceType: 'AllergyIntolerance', localTable: 'phm_edw.patient_allergy', localId: 766, patientId: 123 },
      { resourceType: 'Immunization', localTable: 'phm_edw.immunization', localId: 877, patientId: 123 },
    ]);
  });

  it('skips resources when the launch Patient crosswalk cannot be resolved', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) {
        return Promise.resolve([stagedRow(3, 'Observation', 'obs-1', observation)]);
      }
      if (text.includes('SELECT COALESCE(patient_id')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId, ehrTenantId: 42 });

    expect(result).toMatchObject({
      resourcesSeen: 1,
      resourcesHydrated: 0,
      resourcesSkipped: 1,
      resourcesFailed: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      byResourceType: {
        Observation: { seen: 1, hydrated: 0, skipped: 1, failed: 0 },
      },
    });
  });

  it('reuses an existing bulk Patient crosswalk before identity resolution', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) {
        return Promise.resolve([stagedRow(1, 'Patient', 'pat-1', bulkPatient)]);
      }
      if (text.includes('SELECT local_table, local_id')) {
        return Promise.resolve([{ local_table: 'phm_edw.patient', local_id: 777 }]);
      }
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId, ehrTenantId: 42, orgId: 7 });

    expect(result).toMatchObject({
      resourcesSeen: 1,
      resourcesHydrated: 1,
      resourcesSkipped: 0,
      resourcesFailed: 0,
      rowsUpdated: 1,
      byResourceType: { Patient: { seen: 1, hydrated: 1, skipped: 0, failed: 0 } },
    });

    const queries = mockSql.mock.calls.map((call) => (call[0] as TemplateStringsArray).join(''));
    expect(queries.some((q) => q.includes('FROM phm_edw.patient_identifier'))).toBe(false);
    expect(queries.some((q) => q.includes('INSERT INTO phm_edw.person'))).toBe(false);
    expect(queries.some((q) => q.includes('INSERT INTO phm_edw.patient\n'))).toBe(false);

    const crosswalk = mockSql.mock.calls
      .filter((call) => (call[0] as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.ehr_resource_crosswalk'))
      .map((call) => ({ resourceType: call[2], localTable: call[5], localId: call[6], patientId: call[7] }));
    expect(crosswalk).toEqual([
      { resourceType: 'Patient', localTable: 'phm_edw.patient', localId: 777, patientId: 777 },
    ]);
  });

  it('hydrates a bulk Patient through identity resolution, minting a person and linking it', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) {
        return Promise.resolve([stagedRow(1, 'Patient', 'pat-1', bulkPatient)]);
      }
      if (text.includes('FROM phm_edw.patient_identifier')) return Promise.resolve([]); // no id match
      if (text.includes('FROM phm_edw.person')) return Promise.resolve([]); // no demographic match
      if (text.includes('INSERT INTO phm_edw.person')) return Promise.resolve([{ person_id: 1 }]);
      if (text.includes('FROM phm_edw.patient_link')) return Promise.resolve([]); // no existing legacy row
      if (text.includes('INSERT INTO phm_edw.patient\n')) return Promise.resolve([{ patient_id: 555 }]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId, ehrTenantId: 42, orgId: 7 });

    expect(result).toMatchObject({
      resourcesSeen: 1,
      resourcesHydrated: 1,
      resourcesFailed: 0,
      byResourceType: { Patient: { seen: 1, hydrated: 1, skipped: 0, failed: 0 } },
    });

    const queries = mockSql.mock.calls.map((call) => (call[0] as TemplateStringsArray).join(''));
    expect(queries.some((q) => q.includes('INSERT INTO phm_edw.person'))).toBe(true);
    expect(queries.some((q) => q.includes('INSERT INTO phm_edw.patient_identifier'))).toBe(true);
    expect(queries.some((q) => q.includes('INSERT INTO phm_edw.patient_link'))).toBe(true);

    const crosswalk = mockSql.mock.calls
      .filter((call) => (call[0] as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.ehr_resource_crosswalk'))
      .map((call) => ({ resourceType: call[2], localTable: call[5], localId: call[6], patientId: call[7] }));
    expect(crosswalk).toEqual([
      { resourceType: 'Patient', localTable: 'phm_edw.patient', localId: 555, patientId: 555 },
    ]);
  });
});

const bulkPatient: FhirResource = {
  resourceType: 'Patient',
  id: 'pat-1',
  identifier: [
    {
      system: 'urn:oid:1.2.3.4',
      value: 'MRN-1',
      type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] },
    },
  ],
  name: [{ use: 'official', family: 'Bulk', given: ['Patty'] }],
  birthDate: '1980-02-03',
  gender: 'female',
};
