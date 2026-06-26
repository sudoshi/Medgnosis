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

import {
  hydrateStagedRunToEdw,
  upsertProviderFromReference,
  upsertOrganizationFromReference,
  upsertLocationFromReference,
  softDeleteLocalRow,
  softDeleteByCrosswalk,
  drainStagedRunToEdw,
} from './edwHydration.js';

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

function mockTx(handler: (query: string) => unknown) {
  return { unsafe: vi.fn(async (query: string) => handler(query)) } as never;
}

describe('reference dimension get-or-create', () => {
  it('creates a provider then can reuse it by NPI', async () => {
    const providerRows: unknown[] = [];
    const tx = mockTx((q) => {
      if (q.includes('SELECT provider_id FROM phm_edw.provider')) return providerRows;
      if (q.includes('INSERT INTO phm_edw.provider')) return [{ provider_id: 55 }];
      return [];
    });
    const practitioner = {
      resourceType: 'Practitioner', id: 'prac-1',
      identifier: [{ system: 'http://hl7.org/fhir/sid/us-npi', value: '1234567893' }],
      name: [{ family: 'Wells', given: ['Sarah'] }],
    } as unknown as FhirResource;
    expect(await upsertProviderFromReference(tx, practitioner)).toBe(55);
  });

  it('reuses an existing provider by NPI without inserting', async () => {
    const tx = mockTx((q) => {
      if (q.includes('SELECT provider_id FROM phm_edw.provider')) return [{ provider_id: 42 }];
      if (q.includes('INSERT INTO phm_edw.provider')) throw new Error('should not insert');
      return [];
    });
    const practitioner = {
      resourceType: 'Practitioner', id: 'prac-2',
      identifier: [{ system: 'http://hl7.org/fhir/sid/us-npi', value: '1234567893' }],
      name: [{ family: 'Wells', given: ['Sarah'] }],
    } as unknown as FhirResource;
    expect(await upsertProviderFromReference(tx, practitioner)).toBe(42);
  });

  it('creates an organization from name', async () => {
    const tx = mockTx((q) => {
      if (q.includes('SELECT org_id FROM phm_edw.organization')) return [];
      if (q.includes('INSERT INTO phm_edw.organization')) return [{ org_id: 9 }];
      return [];
    });
    const org = { resourceType: 'Organization', id: 'org-1', name: 'Mercy Clinic' } as unknown as FhirResource;
    expect(await upsertOrganizationFromReference(tx, org)).toBe(9);
  });

  it('returns null for an organization without a name', async () => {
    const tx = mockTx(() => []);
    const org = { resourceType: 'Organization', id: 'org-2' } as unknown as FhirResource;
    expect(await upsertOrganizationFromReference(tx, org)).toBeNull();
  });

  it('creates a clinic_resource from a Location', async () => {
    const tx = mockTx((q) => {
      if (q.includes('SELECT resource_id FROM phm_edw.clinic_resource')) return [];
      if (q.includes('INSERT INTO phm_edw.clinic_resource')) return [{ resource_id: 3 }];
      return [];
    });
    const loc = { resourceType: 'Location', id: 'loc-1', name: 'Room 4B' } as unknown as FhirResource;
    expect(await upsertLocationFromReference(tx, loc)).toBe(3);
  });

  it('returns null for a location without a name', async () => {
    const tx = mockTx(() => []);
    const loc = { resourceType: 'Location', id: 'loc-2' } as unknown as FhirResource;
    expect(await upsertLocationFromReference(tx, loc)).toBeNull();
  });

  it('returns null when practitioner has neither name nor NPI', async () => {
    const tx = mockTx(() => []);
    expect(await upsertProviderFromReference(tx, { resourceType: 'Practitioner' } as unknown as FhirResource)).toBeNull();
  });

  it('returns null for a null reference', async () => {
    const tx = mockTx(() => []);
    expect(await upsertProviderFromReference(tx, null)).toBeNull();
    expect(await upsertOrganizationFromReference(tx, null)).toBeNull();
    expect(await upsertLocationFromReference(tx, null)).toBeNull();
  });
});

describe('hydrateEncounter provider/org backfill', () => {
  it('resolves provider and serviceProvider crosswalks into the encounter insert params', async () => {
    const encounterWithRefs: FhirResource = {
      resourceType: 'Encounter',
      id: 'enc-9',
      status: 'finished',
      type: [{ text: 'Office visit' }],
      subject: { reference: 'Patient/pat-1' },
      participant: [{ individual: { reference: 'Practitioner/prac-1' } }],
      serviceProvider: { reference: 'Organization/org-1' },
      period: { start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z' },
    };

    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) {
        return Promise.resolve([stagedRow(1, 'Encounter', 'enc-9', encounterWithRefs)]);
      }
      if (text.includes('SELECT COALESCE(patient_id')) {
        return Promise.resolve([{ patient_id: 123 }]);
      }
      if (text.includes('SELECT local_table, local_id')) {
        return Promise.resolve([]);
      }
      if (text.includes("resource_type = 'Practitioner'") && text.includes("local_table = 'phm_edw.provider'")) {
        return Promise.resolve([{ local_id: 88 }]);
      }
      if (text.includes("resource_type = 'Organization'") && text.includes("local_table = 'phm_edw.organization'")) {
        return Promise.resolve([{ local_id: 77 }]);
      }
      if (text.includes('INSERT INTO phm_edw.encounter')) {
        return Promise.resolve([{ encounter_id: 456 }]);
      }
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId, ehrTenantId: 42, orgId: 7, limit: 10 });
    expect(result).toMatchObject({ resourcesHydrated: 1, resourcesFailed: 0, rowsInserted: 1 });

    const encounterInsert = mockSql.mock.calls.find((call) =>
      (call[0] as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.encounter'),
    );
    expect(encounterInsert).toBeDefined();
    // call[0] is the query strings array; positional params follow:
    // call[1]=$1 patientId, call[2]=$2 resolvedOrgId, call[3]=$3 providerId
    expect(encounterInsert?.[1]).toBe(123); // patientId
    expect(encounterInsert?.[2]).toBe(77); // resolvedOrgId
    expect(encounterInsert?.[3]).toBe(88); // providerId
  });
});

const serviceRequest = {
  resourceType: 'ServiceRequest', id: 'sr-1',
  subject: { reference: 'Patient/pat-1' },
  encounter: { reference: 'Encounter/enc-1' },
  status: 'active', priority: 'urgent',
  category: [{ text: 'Laboratory' }],
  code: { coding: [{ system: 'http://loinc.org', code: '24323-8', display: 'Comprehensive metabolic panel' }] },
  authoredOn: '2026-06-05T09:00:00Z',
} as unknown as FhirResource;

const diagnosticReport = {
  resourceType: 'DiagnosticReport', id: 'dr-1',
  subject: { reference: 'Patient/pat-1' },
  encounter: { reference: 'Encounter/enc-1' },
  status: 'final',
  category: [{ text: 'Laboratory' }],
  code: { coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC panel' }] },
  effectiveDateTime: '2026-06-06T08:00:00Z',
  issued: '2026-06-06T10:00:00Z',
  performer: [{ display: 'Acme Labs' }],
  conclusion: 'Within normal limits',
} as unknown as FhirResource;

const documentReference = {
  resourceType: 'DocumentReference', id: 'doc-1',
  subject: { reference: 'Patient/pat-1' },
  context: { encounter: { reference: 'Encounter/enc-1' } },
  status: 'current', docStatus: 'final',
  category: [{ text: 'Clinical Note' }],
  type: { coding: [{ system: 'http://loinc.org', code: '18842-5', display: 'Discharge summary' }] },
  author: [{ display: 'Dr. Jane Roe' }],
  date: '2026-06-07T08:00:00Z',
  content: [{ attachment: { contentType: 'application/pdf', url: 'http://x/y.pdf', title: 'Discharge Summary' } }],
} as unknown as FhirResource;

const medicationDispense = {
  resourceType: 'MedicationDispense',
  id: 'disp-1',
  subject: { reference: 'Patient/pat-1' },
  context: { reference: 'Encounter/enc-1' },
  status: 'completed',
  medicationCodeableConcept: {
    coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '860975', display: 'Metformin' }],
  },
  authorizingPrescription: [{ reference: 'MedicationRequest/med-1' }],
  whenPrepared: '2026-06-06T08:00:00Z',
  whenHandedOver: '2026-06-06T09:00:00Z',
  quantity: { value: 60, unit: 'tablet' },
  daysSupply: { value: 30, unit: 'day' },
  dosageInstruction: [{ text: '500 mg twice daily' }],
  performer: [{ actor: { reference: 'Organization/pharmacy-1', display: 'Acme Pharmacy' } }],
} as unknown as FhirResource;

const medicationDispenseWithReference = {
  resourceType: 'MedicationDispense',
  id: 'disp-ref-1',
  subject: { reference: 'Patient/pat-1' },
  status: 'completed',
  medicationReference: { reference: 'Medication/med-ref-1', display: 'Referenced Metformin' },
  whenHandedOver: '2026-06-06T09:00:00Z',
} as unknown as FhirResource;

const medicationAdministration = {
  resourceType: 'MedicationAdministration',
  id: 'admin-1',
  subject: { reference: 'Patient/pat-1' },
  context: { reference: 'Encounter/enc-1' },
  request: { reference: 'MedicationRequest/med-1' },
  status: 'completed',
  medicationCodeableConcept: {
    coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '860975', display: 'Metformin' }],
  },
  effectivePeriod: { start: '2026-06-06T10:00:00Z', end: '2026-06-06T10:05:00Z' },
  dosage: {
    text: '500 mg oral dose',
    route: { text: 'Oral' },
    dose: { value: 500, unit: 'mg' },
  },
  performer: [{ actor: { reference: 'Practitioner/nurse-1', display: 'Nurse Example' } }],
  reasonCode: [{ text: 'Diabetes management' }],
} as unknown as FhirResource;

describe('Phase C batch 1 hydrators', () => {
  it('hydrates a ServiceRequest into clinical_order (insert)', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'ServiceRequest', 'sr-1', serviceRequest)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.clinical_order')) return Promise.resolve([{ order_id: 700 }]);
      return Promise.resolve([]);
    });
    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.rowsInserted).toBe(1);
    expect(result.byResourceType['ServiceRequest']).toMatchObject({ hydrated: 1 });
    const insert = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.clinical_order'));
    expect(insert).toBeDefined();
    expect(insert!.slice(1)).toEqual(expect.arrayContaining([123])); // patientId
  });

  it('updates an existing clinical_order on re-ingest', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'ServiceRequest', 'sr-1', serviceRequest)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([{ local_table: 'phm_edw.clinical_order', local_id: 700 }]);
      if (text.includes('UPDATE phm_edw.clinical_order')) return Promise.resolve([{ order_id: 700 }]);
      return Promise.resolve([]);
    });
    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.rowsUpdated).toBe(1);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('UPDATE phm_edw.clinical_order'))).toBe(true);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.clinical_order'))).toBe(false);
  });

  it('hydrates a DiagnosticReport into diagnostic_report (insert)', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'DiagnosticReport', 'dr-1', diagnosticReport)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.diagnostic_report')) return Promise.resolve([{ report_id: 800 }]);
      return Promise.resolve([]);
    });
    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.rowsInserted).toBe(1);
    expect(result.byResourceType['DiagnosticReport']).toMatchObject({ hydrated: 1 });
    const insert = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.diagnostic_report'));
    expect(insert).toBeDefined();
    expect(insert!.slice(1)).toEqual(expect.arrayContaining([123])); // patientId
  });

  it('updates an existing diagnostic_report on re-ingest', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'DiagnosticReport', 'dr-1', diagnosticReport)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([{ local_table: 'phm_edw.diagnostic_report', local_id: 800 }]);
      if (text.includes('UPDATE phm_edw.diagnostic_report')) return Promise.resolve([{ report_id: 800 }]);
      return Promise.resolve([]);
    });
    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.rowsUpdated).toBe(1);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('UPDATE phm_edw.diagnostic_report'))).toBe(true);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.diagnostic_report'))).toBe(false);
  });

  it('hydrates a DocumentReference into document_reference (insert)', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'DocumentReference', 'doc-1', documentReference)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.document_reference')) return Promise.resolve([{ document_id: 900 }]);
      return Promise.resolve([]);
    });
    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.rowsInserted).toBe(1);
    expect(result.byResourceType['DocumentReference']).toMatchObject({ hydrated: 1 });
    const insert = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.document_reference'));
    expect(insert).toBeDefined();
    expect(insert!.slice(1)).toEqual(expect.arrayContaining([123])); // patientId
  });

  it('updates an existing document_reference on re-ingest', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'DocumentReference', 'doc-1', documentReference)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([{ local_table: 'phm_edw.document_reference', local_id: 900 }]);
      if (text.includes('UPDATE phm_edw.document_reference')) return Promise.resolve([{ document_id: 900 }]);
      return Promise.resolve([]);
    });
    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.rowsUpdated).toBe(1);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('UPDATE phm_edw.document_reference'))).toBe(true);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.document_reference'))).toBe(false);
  });

  it('hydrates a MedicationDispense into medication_dispense (insert)', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'MedicationDispense', 'disp-1', medicationDispense)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('SELECT medication_id')) return Promise.resolve([{ medication_id: 432 }]);
      if (text.includes("resource_type = 'MedicationRequest'")) return Promise.resolve([{ local_id: 876 }]);
      if (text.includes('INSERT INTO phm_edw.medication_dispense')) return Promise.resolve([{ medication_dispense_id: 910 }]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });

    expect(result.rowsInserted).toBe(1);
    expect(result.byResourceType['MedicationDispense']).toMatchObject({ hydrated: 1 });
    const insert = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.medication_dispense'));
    expect(insert).toBeDefined();
    expect(insert!.slice(1)).toEqual(expect.arrayContaining([123, 432, 876]));
    const crosswalk = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.ehr_resource_crosswalk'));
    expect(crosswalk?.[5]).toBe('phm_edw.medication_dispense');
    expect(crosswalk?.[6]).toBe(910);
  });

  it('hydrates MedicationDispense medicationReference into medication master identity', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'MedicationDispense', 'disp-ref-1', medicationDispenseWithReference)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('SELECT medication_id')) return Promise.resolve([]);
      if (text.includes("resource_type = 'MedicationRequest'")) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.medication\n')) return Promise.resolve([{ medication_id: 433 }]);
      if (text.includes('INSERT INTO phm_edw.medication_dispense')) return Promise.resolve([{ medication_dispense_id: 911 }]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });

    expect(result.rowsInserted).toBe(1);
    const medicationInsert = mockSql.mock.calls.find(([s]) =>
      (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.medication\n'),
    );
    expect(medicationInsert?.slice(1)).toEqual(['med-ref-1', 'Referenced Metformin', 'OTHER']);
  });

  it('updates an existing medication_dispense on re-ingest', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'MedicationDispense', 'disp-1', medicationDispense)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([{ local_table: 'phm_edw.medication_dispense', local_id: 910 }]);
      if (text.includes('SELECT medication_id')) return Promise.resolve([{ medication_id: 432 }]);
      if (text.includes("resource_type = 'MedicationRequest'")) return Promise.resolve([{ local_id: 876 }]);
      if (text.includes('UPDATE phm_edw.medication_dispense')) return Promise.resolve([{ medication_dispense_id: 910 }]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });

    expect(result.rowsUpdated).toBe(1);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('UPDATE phm_edw.medication_dispense'))).toBe(true);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.medication_dispense'))).toBe(false);
  });

  it('hydrates a MedicationAdministration into medication_administration (insert)', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'MedicationAdministration', 'admin-1', medicationAdministration)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('SELECT medication_id')) return Promise.resolve([{ medication_id: 432 }]);
      if (text.includes("resource_type = 'MedicationRequest'")) return Promise.resolve([{ local_id: 876 }]);
      if (text.includes('INSERT INTO phm_edw.medication_administration')) return Promise.resolve([{ medication_administration_id: 920 }]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });

    expect(result.rowsInserted).toBe(1);
    expect(result.byResourceType['MedicationAdministration']).toMatchObject({ hydrated: 1 });
    const insert = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.medication_administration'));
    expect(insert).toBeDefined();
    expect(insert!.slice(1)).toEqual(expect.arrayContaining([123, 432, 876]));
    const crosswalk = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.ehr_resource_crosswalk'));
    expect(crosswalk?.[5]).toBe('phm_edw.medication_administration');
    expect(crosswalk?.[6]).toBe(920);
  });

  it('updates an existing medication_administration on re-ingest', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'MedicationAdministration', 'admin-1', medicationAdministration)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([{ local_table: 'phm_edw.medication_administration', local_id: 920 }]);
      if (text.includes('SELECT medication_id')) return Promise.resolve([{ medication_id: 432 }]);
      if (text.includes("resource_type = 'MedicationRequest'")) return Promise.resolve([{ local_id: 876 }]);
      if (text.includes('UPDATE phm_edw.medication_administration')) return Promise.resolve([{ medication_administration_id: 920 }]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });

    expect(result.rowsUpdated).toBe(1);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('UPDATE phm_edw.medication_administration'))).toBe(true);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.medication_administration'))).toBe(false);
  });
});

const carePlan = {
  resourceType: 'CarePlan', id: 'cp-1',
  subject: { reference: 'Patient/pat-1' },
  status: 'active',
  category: [{ text: 'Diabetes management' }],
  period: { start: '2026-01-01' },
} as unknown as FhirResource;

const goal = {
  resourceType: 'Goal', id: 'goal-1',
  subject: { reference: 'Patient/pat-1' },
  lifecycleStatus: 'active',
  description: { text: 'A1c < 7' },
  target: [{ dueDate: '2026-12-31' }],
} as unknown as FhirResource;

const careTeam = {
  resourceType: 'CareTeam', id: 'ct-1',
  subject: { reference: 'Patient/pat-1' },
  name: 'Diabetes Care Team',
  participant: [
    { member: { display: 'Dr A' }, role: [{ text: 'physician' }] },
    { member: { display: 'Nurse B' }, role: [{ text: 'nurse' }] },
  ],
} as unknown as FhirResource;

const coverage = {
  resourceType: 'Coverage', id: 'cov-1',
  beneficiary: { reference: 'Patient/pat-1' },
  status: 'active',
  subscriberId: 'POL123',
  order: 1,
  payor: [{ display: 'Aetna' }],
  period: { start: '2026-01-01' },
} as unknown as FhirResource;

// PHQ-9 style QuestionnaireResponse: three numeric item answers (1+2+3) plus an
// explicit total-score item; the hydrator should prefer the explicit total (8)
// over the sum of items and carry the responses payload.
const questionnaireResponse = {
  resourceType: 'QuestionnaireResponse', id: 'qr-1',
  questionnaire: 'http://example.org/Questionnaire/PHQ-9|1.0',
  subject: { reference: 'Patient/pat-1' },
  encounter: { reference: 'Encounter/enc-1' },
  status: 'completed',
  authored: '2026-06-08T08:00:00Z',
  item: [
    { linkId: 'q1', text: 'Little interest', answer: [{ valueInteger: 1 }] },
    { linkId: 'q2', text: 'Feeling down', answer: [{ valueInteger: 2 }] },
    { linkId: 'q3', text: 'Trouble sleeping', answer: [{ valueInteger: 3 }] },
    { linkId: 'phq9-total-score', text: 'Total score', answer: [{ valueInteger: 8 }] },
  ],
} as unknown as FhirResource;

describe('Phase C batch 2 hydrators', () => {
  it('hydrates a CarePlan into care_plan (insert)', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'CarePlan', 'cp-1', carePlan)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.care_plan')) return Promise.resolve([{ care_plan_id: 800 }]);
      return Promise.resolve([]);
    });
    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.rowsInserted).toBe(1);
    expect(result.byResourceType['CarePlan']).toMatchObject({ hydrated: 1 });
    const insert = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.care_plan'));
    expect(insert).toBeDefined();
    expect(insert!.slice(1)).toEqual(expect.arrayContaining([123])); // patientId
  });

  it('updates an existing care_plan on re-ingest', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'CarePlan', 'cp-1', carePlan)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([{ local_table: 'phm_edw.care_plan', local_id: 800 }]);
      if (text.includes('UPDATE phm_edw.care_plan')) return Promise.resolve([{ care_plan_id: 800 }]);
      return Promise.resolve([]);
    });
    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.rowsUpdated).toBe(1);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('UPDATE phm_edw.care_plan'))).toBe(true);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.care_plan'))).toBe(false);
  });

  it('hydrates a Goal into care_plan_item via a synthetic imported-goals plan (insert)', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'Goal', 'goal-1', goal)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.care_plan_item')) return Promise.resolve([{ item_id: 900 }]);
      if (text.includes('SELECT care_plan_id FROM phm_edw.care_plan')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.care_plan')) return Promise.resolve([{ care_plan_id: 801 }]);
      return Promise.resolve([]);
    });
    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.rowsInserted).toBe(1);
    expect(result.byResourceType['Goal']).toMatchObject({ hydrated: 1 });
    const insert = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.care_plan_item'));
    expect(insert).toBeDefined();
    expect(insert!.slice(1)).toEqual(expect.arrayContaining([123])); // patientId
    // synthetic plan was created and reused as care_plan_id 801
    expect(insert!.slice(1)).toEqual(expect.arrayContaining([801]));
  });

  it('hydrates a CareTeam plus its members (insert)', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'CareTeam', 'ct-1', careTeam)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.care_team ')) return Promise.resolve([{ care_team_id: 500 }]);
      if (text.includes('UPDATE phm_edw.care_team_member')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.care_team_member')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.rowsInserted).toBe(1);
    expect(result.byResourceType['CareTeam']).toMatchObject({ hydrated: 1 });
    const memberInserts = mockSql.mock.calls.filter(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.care_team_member'));
    expect(memberInserts).toHaveLength(2);
  });

  it('hydrates a Coverage into patient_insurance_coverage, upserting the payer (insert)', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'Coverage', 'cov-1', coverage)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('SELECT payer_id FROM phm_edw.payer')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.payer')) return Promise.resolve([{ payer_id: 12 }]);
      if (text.includes('INSERT INTO phm_edw.patient_insurance_coverage')) return Promise.resolve([{ coverage_id: 33 }]);
      return Promise.resolve([]);
    });
    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.rowsInserted).toBe(1);
    expect(result.byResourceType['Coverage']).toMatchObject({ hydrated: 1 });
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.payer'))).toBe(true);
    const insert = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.patient_insurance_coverage'));
    expect(insert).toBeDefined();
    expect(insert!.slice(1)).toEqual(expect.arrayContaining([123, 12])); // patientId, payerId
  });

  it('updates an existing patient_insurance_coverage on re-ingest', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'Coverage', 'cov-1', coverage)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([{ local_table: 'phm_edw.patient_insurance_coverage', local_id: 33 }]);
      if (text.includes('SELECT payer_id FROM phm_edw.payer')) return Promise.resolve([{ payer_id: 12 }]);
      if (text.includes('UPDATE phm_edw.patient_insurance_coverage')) return Promise.resolve([{ coverage_id: 33 }]);
      return Promise.resolve([]);
    });
    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.rowsUpdated).toBe(1);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('UPDATE phm_edw.patient_insurance_coverage'))).toBe(true);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.patient_insurance_coverage'))).toBe(false);
  });
});

describe('QuestionnaireResponse normalization (PRO breadth)', () => {
  it('normalizes a staged QuestionnaireResponse into patient_reported_outcome instead of leaving it staged', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'QuestionnaireResponse', 'qr-1', questionnaireResponse)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.patient_reported_outcome')) return Promise.resolve([{ pro_id: 555 }]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });

    expect(result.rowsInserted).toBe(1);
    expect(result.resourcesSkipped).toBe(0);
    expect(result.byResourceType['QuestionnaireResponse']).toMatchObject({ hydrated: 1, skipped: 0 });
    const insert = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.patient_reported_outcome'));
    expect(insert).toBeDefined();
    const params = insert!.slice(1);
    expect(params[0]).toBe(123); // patientId
    expect(params[2]).toBe('PHQ-9'); // instrument_name derived from questionnaire canonical
    expect(params[3]).toBe('1.0'); // instrument_version from canonical |version
    expect(params[5]).toBe(8); // explicit total-score item wins over the 1+2+3 sum
    // crosswalk points at the EDW PRO row, preserving provenance for the run
    const crosswalk = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.ehr_resource_crosswalk'));
    expect(crosswalk?.[5]).toBe('phm_edw.patient_reported_outcome');
    expect(crosswalk?.[6]).toBe(555);
  });

  it('updates an existing patient_reported_outcome on re-ingest', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'QuestionnaireResponse', 'qr-1', questionnaireResponse)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([{ local_table: 'phm_edw.patient_reported_outcome', local_id: 555 }]);
      if (text.includes('UPDATE phm_edw.patient_reported_outcome')) return Promise.resolve([{ pro_id: 555 }]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.rowsUpdated).toBe(1);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('UPDATE phm_edw.patient_reported_outcome'))).toBe(true);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.patient_reported_outcome'))).toBe(false);
  });

  it('tombstones a QuestionnaireResponse via softDeleteByCrosswalk, excluding it from active reads', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('SELECT local_table, local_id FROM phm_edw.ehr_resource_crosswalk')) {
        return Promise.resolve([{ local_table: 'phm_edw.patient_reported_outcome', local_id: 555 }]);
      }
      return Promise.resolve([]);
    });

    const removed = await softDeleteByCrosswalk(42, 'QuestionnaireResponse', 'qr-1', 'bulk-deleted');
    const calls = mockSql.mock.calls.map(([s]) => (s as TemplateStringsArray).join(''));

    expect(removed).toBe(true);
    // active_ind='N' is what the workspace/patient reads filter on (active_ind='Y'),
    // so the tombstoned PRO row is excluded from active reads.
    expect(calls.some((c) => c.includes('UPDATE phm_edw.patient_reported_outcome') && c.includes("active_ind='N'"))).toBe(true);
    const xwalk = mockSql.mock.calls.find(([s]) =>
      (s as TemplateStringsArray).join('').includes('UPDATE phm_edw.ehr_resource_crosswalk')
      && (s as TemplateStringsArray).join('').includes('deleted_reason'),
    );
    expect(xwalk!.slice(1)).toEqual(expect.arrayContaining(['bulk-deleted']));
  });
});

describe('vital-sign dual-write', () => {
  it('folds a heart-rate Observation into vital_sign alongside the observation insert', async () => {
    const heartRate: FhirResource = {
      resourceType: 'Observation',
      id: 'vs-hr',
      subject: { reference: 'Patient/pat-1' },
      encounter: { reference: 'Encounter/enc-1' },
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }] },
      effectiveDateTime: '2026-06-02T08:00:00Z',
      valueQuantity: { value: 72, unit: '/min' },
    };

    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'Observation', 'vs-hr', heartRate)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.observation')) return Promise.resolve([{ observation_id: 50 }]);
      if (text.includes('SELECT vital_id FROM phm_edw.vital_sign')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.vital_sign')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.byResourceType['Observation']).toMatchObject({ hydrated: 1 });

    const observationInsert = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.observation'));
    expect(observationInsert).toBeDefined();

    const vitalInsert = mockSql.mock.calls.find(([s]) => (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.vital_sign'));
    expect(vitalInsert).toBeDefined();
    expect((vitalInsert![0] as TemplateStringsArray).join('')).toContain('heart_rate');
    expect(vitalInsert!.slice(1)).toEqual(expect.arrayContaining([72]));
  });

  it('folds blood-pressure components into systolic and diastolic on one vital row', async () => {
    const bloodPressure: FhirResource = {
      resourceType: 'Observation',
      id: 'vs-bp',
      subject: { reference: 'Patient/pat-1' },
      encounter: { reference: 'Encounter/enc-1' },
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
      code: { coding: [{ code: '85354-9' }] },
      effectiveDateTime: '2026-06-02T08:00:00Z',
      component: [
        { code: { coding: [{ code: '8480-6' }] }, valueQuantity: { value: 120, unit: 'mmHg' } },
        { code: { coding: [{ code: '8462-4' }] }, valueQuantity: { value: 80, unit: 'mmHg' } },
      ],
    };

    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'Observation', 'vs-bp', bloodPressure)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.observation')) return Promise.resolve([{ observation_id: 51 }]);
      if (text.includes('SELECT vital_id FROM phm_edw.vital_sign')) return Promise.resolve([]);
      if (text.includes('UPDATE phm_edw.vital_sign')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.vital_sign')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.byResourceType['Observation']).toMatchObject({ hydrated: 1 });

    const vitalWrites = mockSql.mock.calls
      .map(([s]) => (s as TemplateStringsArray).join(''))
      .filter((q) => q.includes('INSERT INTO phm_edw.vital_sign') || q.includes('UPDATE phm_edw.vital_sign'));
    expect(vitalWrites.length).toBeGreaterThanOrEqual(2);
    const vitalSql = vitalWrites.join('\n');
    expect(vitalSql).toContain('bp_systolic');
    expect(vitalSql).toContain('bp_diastolic');
  });

  it('does not touch vital_sign for a non-vital (laboratory) Observation', async () => {
    const lab: FhirResource = {
      resourceType: 'Observation',
      id: 'lab-1',
      subject: { reference: 'Patient/pat-1' },
      encounter: { reference: 'Encounter/enc-1' },
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'HbA1c' }] },
      effectiveDateTime: '2026-06-02T08:00:00Z',
      valueQuantity: { value: 8.2, unit: '%' },
    };

    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) return Promise.resolve([stagedRow(1, 'Observation', 'lab-1', lab)]);
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.observation')) return Promise.resolve([{ observation_id: 52 }]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });
    expect(result.byResourceType['Observation']).toMatchObject({ hydrated: 1 });
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('phm_edw.vital_sign'))).toBe(false);
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

const enteredInErrorCondition: FhirResource = {
  resourceType: 'Condition',
  id: 'cond-eie',
  subject: { reference: 'Patient/pat-1' },
  verificationStatus: { coding: [{ code: 'entered-in-error' }] },
  code: { coding: [{ system: 'http://snomed.info/sct', code: '44054006', display: 'Diabetes' }] },
};

describe('entered-in-error soft-delete', () => {
  it('soft-deletes an existing EDW row instead of re-hydrating it', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) {
        return Promise.resolve([stagedRow(1, 'Condition', 'cond-eie', enteredInErrorCondition)]);
      }
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) {
        return Promise.resolve([{ local_table: 'phm_edw.condition_diagnosis', local_id: 654 }]);
      }
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });
    const calls = mockSql.mock.calls.map(([s]) => (s as TemplateStringsArray).join(''));

    expect(calls.some((c) => c.includes('UPDATE phm_edw.condition_diagnosis') && c.includes("active_ind='N'"))).toBe(true);
    expect(calls.some((c) => c.includes('UPDATE phm_edw.ehr_resource_crosswalk') && c.includes('deleted_reason'))).toBe(true);
    expect(calls.some((c) => c.includes('INSERT INTO phm_edw.condition_diagnosis'))).toBe(false);
    expect(calls.some((c) => c.includes('SELECT condition_id'))).toBe(false);
    expect(result.rowsUpdated).toBe(1);

    const xwalk = mockSql.mock.calls.find(([s]) =>
      (s as TemplateStringsArray).join('').includes('UPDATE phm_edw.ehr_resource_crosswalk')
      && (s as TemplateStringsArray).join('').includes('deleted_reason'),
    );
    expect(xwalk!.slice(1)).toEqual(expect.arrayContaining(['entered-in-error']));
  });

  it('falls through to normal hydration when no prior EDW row exists', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) {
        return Promise.resolve([stagedRow(1, 'Condition', 'cond-eie', enteredInErrorCondition)]);
      }
      if (text.includes('SELECT COALESCE(patient_id')) return Promise.resolve([{ patient_id: 123 }]);
      if (text.includes('SELECT local_table, local_id')) return Promise.resolve([]);
      if (text.includes('SELECT condition_id')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.condition\n')) return Promise.resolve([{ condition_id: 321 }]);
      if (text.includes('INSERT INTO phm_edw.condition_diagnosis')) return Promise.resolve([{ condition_diagnosis_id: 654 }]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });
    const calls = mockSql.mock.calls.map(([s]) => (s as TemplateStringsArray).join(''));

    expect(calls.some((c) => c.includes('deleted_reason'))).toBe(false);
    expect(calls.some((c) => c.includes('INSERT INTO phm_edw.condition_diagnosis'))).toBe(true);
    expect(result.rowsInserted).toBe(1);
  });

  it('softDeleteLocalRow is a no-op for a table outside the allowlist', async () => {
    const unsafe = vi.fn(async () => []);
    const tx = { unsafe } as never;
    await softDeleteLocalRow(tx, 'phm_edw.unknown_table', 5);
    expect(unsafe).not.toHaveBeenCalled();
  });

  it('softDeleteByCrosswalk soft-deletes the mapped EDW row and stamps the crosswalk', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('SELECT local_table, local_id FROM phm_edw.ehr_resource_crosswalk')) {
        return Promise.resolve([{ local_table: 'phm_edw.condition_diagnosis', local_id: 654 }]);
      }
      return Promise.resolve([]);
    });

    const removed = await softDeleteByCrosswalk(42, 'Condition', 'cond-1', 'bulk-deleted');
    const calls = mockSql.mock.calls.map(([s]) => (s as TemplateStringsArray).join(''));

    expect(removed).toBe(true);
    expect(calls.some((c) => c.includes('UPDATE phm_edw.condition_diagnosis') && c.includes("active_ind='N'"))).toBe(true);
    const xwalk = mockSql.mock.calls.find(([s]) =>
      (s as TemplateStringsArray).join('').includes('UPDATE phm_edw.ehr_resource_crosswalk')
      && (s as TemplateStringsArray).join('').includes('deleted_reason'),
    );
    expect(xwalk!.slice(1)).toEqual(expect.arrayContaining(['bulk-deleted']));
  });

  it('softDeleteByCrosswalk returns false when no crosswalk row maps the resource', async () => {
    mockSql.mockImplementation(() => Promise.resolve([]));
    const removed = await softDeleteByCrosswalk(42, 'Condition', 'missing', 'bulk-deleted');
    expect(removed).toBe(false);
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('UPDATE phm_edw'))).toBe(false);
  });
});

describe('standalone reference-dimension hydration', () => {
  it('hydrates a top-level Practitioner into phm_edw.provider with a null-patient crosswalk', async () => {
    const practitioner = {
      resourceType: 'Practitioner',
      id: 'prac-1',
      identifier: [{ system: 'http://hl7.org/fhir/sid/us-npi', value: '1234567893' }],
      name: [{ family: 'Wells', given: ['Sarah'] }],
    } as unknown as FhirResource;
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) {
        return Promise.resolve([stagedRow(1, 'Practitioner', 'prac-1', practitioner)]);
      }
      if (text.includes('SELECT provider_id FROM phm_edw.provider')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.provider')) return Promise.resolve([{ provider_id: 88 }]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });

    expect(result.rowsInserted).toBe(1);
    expect(result.byResourceType['Practitioner']).toMatchObject({ hydrated: 1 });
    // No patient resolution should happen for a reference dimension.
    expect(mockSql.mock.calls.some(([s]) => (s as TemplateStringsArray).join('').includes('SELECT COALESCE(patient_id'))).toBe(false);
    const xwalk = mockSql.mock.calls.find(([s]) =>
      (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.ehr_resource_crosswalk'),
    );
    expect(xwalk).toBeDefined();
    const params = xwalk!.slice(1);
    expect(params[4]).toBe('phm_edw.provider'); // local_table
    expect(params[5]).toBe(88); // local_id
    expect(params[6]).toBeNull(); // patient_id is null for dimensions
  });

  it('hydrates a top-level Organization into phm_edw.organization', async () => {
    const org = { resourceType: 'Organization', id: 'org-1', name: 'Mercy Clinic' } as unknown as FhirResource;
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) {
        return Promise.resolve([stagedRow(1, 'Organization', 'org-1', org)]);
      }
      if (text.includes('SELECT org_id FROM phm_edw.organization')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.organization')) return Promise.resolve([{ org_id: 9 }]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });

    expect(result.byResourceType['Organization']).toMatchObject({ hydrated: 1 });
    expect(mockSql.mock.calls.some(([s]) =>
      (s as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.ehr_resource_crosswalk'),
    )).toBe(true);
  });

  it('hydrates a top-level Location into phm_edw.clinic_resource', async () => {
    const loc = { resourceType: 'Location', id: 'loc-1', name: 'Room 4B' } as unknown as FhirResource;
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) {
        return Promise.resolve([stagedRow(1, 'Location', 'loc-1', loc)]);
      }
      if (text.includes('SELECT resource_id FROM phm_edw.clinic_resource')) return Promise.resolve([]);
      if (text.includes('INSERT INTO phm_edw.clinic_resource')) return Promise.resolve([{ resource_id: 3 }]);
      return Promise.resolve([]);
    });

    const result = await hydrateStagedRunToEdw({ ingestRunId });

    expect(result.byResourceType['Location']).toMatchObject({ hydrated: 1 });
  });
});

describe('drainStagedRunToEdw', () => {
  function page(over: Partial<{
    resourcesSeen: number; resourcesHydrated: number; resourcesSkipped: number; resourcesFailed: number;
    rowsInserted: number; rowsUpdated: number; byResourceType: Record<string, { seen: number; hydrated: number; skipped: number; failed: number }>;
  }>) {
    return {
      resourcesSeen: 0, resourcesHydrated: 0, resourcesSkipped: 0, resourcesFailed: 0,
      rowsInserted: 0, rowsUpdated: 0, byResourceType: {}, errors: [], ...over,
    };
  }

  it('loops hydration in bounded batches until staging drains, merging results', async () => {
    const pages = [
      page({ resourcesSeen: 500, resourcesHydrated: 500, rowsInserted: 500, byResourceType: { Observation: { seen: 500, hydrated: 500, skipped: 0, failed: 0 } } }),
      page({ resourcesSeen: 300, resourcesHydrated: 300, rowsInserted: 280, rowsUpdated: 20, byResourceType: { DocumentReference: { seen: 300, hydrated: 300, skipped: 0, failed: 0 } } }),
      page({ resourcesSeen: 0 }),
    ];
    const hydrate = vi.fn().mockImplementation(() => Promise.resolve(pages.shift()));

    const total = await drainStagedRunToEdw({ ingestRunId, ehrTenantId: 42 }, { hydrateStagedRunToEdw: hydrate as never });

    expect(hydrate).toHaveBeenCalledTimes(3);
    expect(hydrate).toHaveBeenCalledWith(expect.objectContaining({ ingestRunId, ehrTenantId: 42, limit: 500 }));
    expect(total.resourcesHydrated).toBe(800);
    expect(total.rowsInserted).toBe(780);
    expect(total.rowsUpdated).toBe(20);
    expect(total.byResourceType['Observation']).toMatchObject({ hydrated: 500 });
    expect(total.byResourceType['DocumentReference']).toMatchObject({ hydrated: 300 });
  });

  it('stops without looping forever when a batch makes no progress (only skip/fail remain)', async () => {
    const hydrate = vi.fn().mockResolvedValue(
      page({ resourcesSeen: 10, resourcesHydrated: 0, resourcesSkipped: 10, byResourceType: { Observation: { seen: 10, hydrated: 0, skipped: 10, failed: 0 } } }),
    );

    const total = await drainStagedRunToEdw({ ingestRunId, ehrTenantId: 42 }, { hydrateStagedRunToEdw: hydrate as never });

    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(total.resourcesSkipped).toBe(10);
    expect(total.resourcesHydrated).toBe(0);
  });
});
