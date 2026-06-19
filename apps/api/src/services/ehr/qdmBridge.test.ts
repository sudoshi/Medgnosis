// =============================================================================
// Unit tests - staged FHIR to QDM bridge
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QdmElement } from '../qdm/index.js';
import type { StagedFhirResourceRow } from './qdmBridge.js';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  type SqlMock = typeof fn & {
    json: (v: unknown) => unknown;
    unsafe: (query: string, parameters?: readonly unknown[]) => Promise<unknown>;
    begin: (cb: (tx: SqlMock) => Promise<number>) => Promise<number>;
  };
  const sqlMock = fn as SqlMock;
  sqlMock.json = (v: unknown) => v;
  sqlMock.unsafe = async (query, parameters = []) =>
    fn([query] as unknown as TemplateStringsArray, ...parameters);
  sqlMock.begin = async (cb) => cb(sqlMock);
  return { mockSql: sqlMock };
});
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  buildQdmEventUpsertInput,
  normalizeStagedRunToQdm,
} from './qdmBridge.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.begin = async (cb) => cb(mockSql);
  mockSql.unsafe = async (query, parameters = []) =>
    mockSql([query] as unknown as TemplateStringsArray, ...parameters);
});

const stagedObservation: StagedFhirResourceRow = {
  id: 501,
  org_id: 7,
  ehr_tenant_id: 42,
  ingest_run_id: '00000000-0000-4000-8000-000000000068',
  resource_type: 'Observation',
  resource_id: 'obs-1',
  patient_ref: 'Patient/pat-1',
  source_version_id: '3',
  source_last_updated: '2026-06-17T12:00:00Z',
  content_hash: 'abc123',
  resource: {
    resourceType: 'Observation',
    id: 'obs-1',
    status: 'final',
    identifier: [{ system: 'urn:mrn', value: 'MRN-1' }],
    category: [{ coding: [{ code: 'laboratory' }] }],
    code: { coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'HbA1c' }] },
    subject: { reference: 'Patient/pat-1' },
    effectiveDateTime: '2026-03-01T00:00:00Z',
    valueQuantity: { value: 9.5, unit: '%' },
  },
};

const stagedPatient: StagedFhirResourceRow = {
  id: 502,
  org_id: 7,
  ehr_tenant_id: 42,
  ingest_run_id: '00000000-0000-4000-8000-000000000068',
  resource_type: 'Patient',
  resource_id: 'pat-1',
  patient_ref: 'Patient/pat-1',
  source_version_id: '7',
  source_last_updated: '2026-06-17T12:00:00Z',
  content_hash: 'patient123',
  resource: {
    resourceType: 'Patient',
    id: 'pat-1',
    identifier: [{ system: 'urn:mrn', value: 'MRN-1' }],
    name: [{ family: 'Launch', given: ['Ehr'] }],
    birthDate: '1975-04-02',
  },
};

describe('buildQdmEventUpsertInput', () => {
  it('flattens canonical QDM timing, code, value, and source metadata for persistence', () => {
    const qdm: QdmElement = {
      id: 'Observation/obs-1',
      qdmVersion: '5.6',
      category: 'Laboratory Test',
      datatype: 'Laboratory Test, Performed',
      status: 'final',
      code: { system: 'http://loinc.org', code: '4548-4', display: 'HbA1c' },
      subject: { reference: 'Patient/pat-1', type: 'Patient', id: 'pat-1' },
      timing: { relevantDateTime: '2026-03-01T00:00:00Z' },
      attributes: { value: { value: 9.5, unit: '%' } },
      source: {
        resourceType: 'Observation',
        id: 'obs-1',
        reference: 'Observation/obs-1',
        profiles: [],
        identifiers: [],
      },
    };

    const event = buildQdmEventUpsertInput(stagedObservation, qdm, 123);

    expect(event.qdmEventKey).toMatch(/^qdm-[a-f0-9]{64}$/);
    expect(event.patientId).toBe(123);
    expect(event.patientRef).toBe('Patient/pat-1');
    expect(event.qdmCategory).toBe('Laboratory Test');
    expect(event.qdmDatatype).toBe('Laboratory Test, Performed');
    expect(event.code).toBe('4548-4');
    expect(event.relevantStartAt).toBe('2026-03-01T00:00:00Z');
    expect(event.valueNumeric).toBe(9.5);
    expect(event.valueUnit).toBe('%');
  });
});

describe('normalizeStagedRunToQdm', () => {
  it('normalizes staged FHIR resources into QDM events and marks staging complete', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) {
        return Promise.resolve([stagedObservation]);
      }
      if (text.includes('SELECT COALESCE(patient_id')) {
        return Promise.resolve([{ patient_id: 123 }]);
      }
      if (text.includes('INSERT INTO phm_edw.ehr_resource_crosswalk')) {
        return Promise.resolve([{ id: 77 }]);
      }
      if (text.includes('INSERT INTO phm_edw.qdm_event')) {
        return Promise.resolve([{ qdm_event_id: 88 }]);
      }
      return Promise.resolve([]);
    });

    const result = await normalizeStagedRunToQdm({
      ingestRunId: stagedObservation.ingest_run_id,
      ehrTenantId: 42,
      orgId: 7,
      limit: 10,
    });

    expect(result).toMatchObject({
      resourcesSeen: 1,
      resourcesNormalized: 1,
      resourcesSkipped: 0,
      resourcesFailed: 0,
      eventsUpserted: 1,
    });

    const queries = mockSql.mock.calls.map((call) => (call[0] as TemplateStringsArray).join(''));
    expect(queries.some((query) => query.includes('INSERT INTO phm_edw.qdm_event'))).toBe(true);
    expect(queries.some((query) => query.includes('INSERT INTO phm_edw.fhir_qdm_crosswalk'))).toBe(true);
    const resourceCrosswalkCall = mockSql.mock.calls.find((call) =>
      (call[0] as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.ehr_resource_crosswalk'),
    );
    expect(resourceCrosswalkCall?.[4]).toEqual([{ system: 'urn:mrn', value: 'MRN-1' }]);
    const qdmEventCall = mockSql.mock.calls.find((call) =>
      (call[0] as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.qdm_event'),
    );
    expect(qdmEventCall?.[26]).toEqual(expect.objectContaining({ value: { value: 9.5, unit: '%' } }));
    expect(qdmEventCall?.[27]).toEqual(expect.objectContaining({ datatype: 'Laboratory Test, Performed' }));
    const fhirQdmCall = mockSql.mock.calls.find((call) =>
      (call[0] as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.fhir_qdm_crosswalk'),
    );
    expect(fhirQdmCall?.[11]).toEqual({
      qdmCategory: 'Laboratory Test',
      qdmDatatype: 'Laboratory Test, Performed',
      sourceHash: 'abc123',
    });
    expect(
      queries.some(
        (query) =>
          query.includes('UPDATE phm_edw.fhir_ingest_staging') &&
          query.includes("status = 'normalized'"),
      ),
    ).toBe(true);
  });

  it('preserves launched Patient crosswalks as local patient targets while adding QDM evidence', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) {
        return Promise.resolve([stagedPatient]);
      }
      if (text.includes('SELECT COALESCE(patient_id')) {
        return Promise.resolve([{ patient_id: 123 }]);
      }
      if (text.includes('INSERT INTO phm_edw.ehr_resource_crosswalk')) {
        return Promise.resolve([{ id: 77 }]);
      }
      if (text.includes('INSERT INTO phm_edw.qdm_event')) {
        return Promise.resolve([{ qdm_event_id: 88 }]);
      }
      return Promise.resolve([]);
    });

    const result = await normalizeStagedRunToQdm({
      ingestRunId: stagedPatient.ingest_run_id,
      ehrTenantId: 42,
      orgId: 7,
      limit: 10,
    });

    expect(result).toMatchObject({
      resourcesSeen: 1,
      resourcesNormalized: 1,
      resourcesFailed: 0,
      eventsUpserted: 1,
    });

    const resourceCrosswalkCall = mockSql.mock.calls.find((call) =>
      (call[0] as TemplateStringsArray).join('').includes('INSERT INTO phm_edw.ehr_resource_crosswalk'),
    );
    expect(resourceCrosswalkCall?.[5]).toBe('phm_edw.patient');
    expect(resourceCrosswalkCall?.[6]).toBe(123);
    expect(resourceCrosswalkCall?.[7]).toBe(123);

    const queries = mockSql.mock.calls.map((call) => (call[0] as TemplateStringsArray).join(''));
    expect(queries.some((query) => query.includes('INSERT INTO phm_edw.fhir_qdm_crosswalk'))).toBe(true);
    expect(
      queries.some(
        (query) =>
          query.includes('UPDATE phm_edw.ehr_resource_crosswalk') &&
          query.includes("local_table = 'phm_edw.qdm_event'"),
      ),
    ).toBe(false);
  });

  it('marks unsupported staged resources as skipped without creating QDM events', async () => {
    const stagedCoverage: StagedFhirResourceRow = {
      ...stagedObservation,
      resource_type: 'Coverage',
      resource_id: 'coverage-1',
      resource: { resourceType: 'Coverage', id: 'coverage-1', beneficiary: { reference: 'Patient/pat-1' } },
    };
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.fhir_ingest_staging')) {
        return Promise.resolve([stagedCoverage]);
      }
      if (text.includes('SELECT COALESCE(patient_id')) {
        return Promise.resolve([{ patient_id: 123 }]);
      }
      return Promise.resolve([]);
    });

    const result = await normalizeStagedRunToQdm({
      ingestRunId: stagedObservation.ingest_run_id,
      limit: 10,
    });

    expect(result).toMatchObject({
      resourcesSeen: 1,
      resourcesNormalized: 0,
      resourcesSkipped: 1,
      resourcesFailed: 0,
      eventsUpserted: 0,
    });
    const queries = mockSql.mock.calls.map((call) => (call[0] as TemplateStringsArray).join(''));
    expect(queries.some((query) => query.includes('INSERT INTO phm_edw.qdm_event'))).toBe(false);
    expect(
      queries.some(
        (query) =>
          query.includes('UPDATE phm_edw.fhir_ingest_staging') &&
          query.includes("status = 'skipped'"),
      ),
    ).toBe(true);
    const skippedCall = mockSql.mock.calls.find((call) =>
      (call[0] as TemplateStringsArray).join('').includes("status = 'skipped'"),
    );
    expect(skippedCall?.[3]).toEqual([{ message: 'Unsupported FHIR resourceType: Coverage' }]);
  });
});
