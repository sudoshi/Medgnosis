// =============================================================================
// Unit tests - QDM-backed CQL engine loader
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QdmElement } from './model.js';

const { mockSql, mockLoadBundle } = vi.hoisted(() => {
  const unsafe = vi.fn();
  return {
    mockSql: { unsafe },
    mockLoadBundle: vi.fn(),
  };
});
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../cqlEngineLoader.js', () => ({ loadBundle: mockLoadBundle }));

import { buildQdmQiCoreBundleForCql, loadQdmEventsToCqlEngine } from './qdmCqlLoader.js';

const NOW = '2026-06-17T19:10:00.000Z';
const INGEST_RUN_ID = '00000000-0000-4000-8000-000000000068';

const patientQdm: QdmElement = {
  id: 'Patient/pat-1',
  qdmVersion: '5.6',
  category: 'Patient',
  datatype: 'Patient',
  status: 'active',
  subject: { reference: 'Patient/pat-1', type: 'Patient', id: 'pat-1' },
  timing: { birthDate: '1970-05-05' },
  attributes: {
    active: true,
    gender: 'female',
    birthDate: '1970-05-05',
    name: { family: 'Bridge', given: ['Qdm'] },
  },
  source: {
    resourceType: 'Patient',
    id: 'pat-1',
    reference: 'Patient/pat-1',
    profiles: [],
    identifiers: [{ system: 'urn:mrn', value: 'MRN-1' }],
  },
};

const labQdm: QdmElement = {
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildQdmQiCoreBundleForCql', () => {
  it('selects bounded QDM events, includes matching Patient records, and projects QI-Core entries', async () => {
    mockSql.unsafe
      .mockResolvedValueOnce([
        {
          qdm_event_id: 88,
          patient_id: 123,
          patient_ref: 'Patient/pat-1',
          qdm_datatype: 'Laboratory Test, Performed',
          source_payload: labQdm,
        },
      ])
      .mockResolvedValueOnce([
        {
          qdm_event_id: 77,
          patient_id: 123,
          patient_ref: 'Patient/pat-1',
          qdm_datatype: 'Patient',
          source_payload: patientQdm,
        },
      ]);

    const result = await buildQdmQiCoreBundleForCql({
      ehrTenantId: 42,
      orgId: 7,
      ingestRunId: INGEST_RUN_ID,
      qdmDatatypes: ['Laboratory Test, Performed'],
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      limit: 25,
      now: NOW,
    });

    expect(result).toMatchObject({
      qdmEventsSelected: 1,
      qdmEventsIncluded: 2,
      qdmEventsProjected: 2,
      qdmEventsSkipped: 0,
    });
    expect(result.bundle.entry.map((entry) => entry.request.url)).toEqual([
      'Observation/qdm-Observation-obs-1',
      'Patient/qdm-Patient-pat-1',
    ]);
    expect(result.bundle.entry[0]?.resource.meta).toMatchObject({ lastUpdated: NOW });

    const primaryQuery = mockSql.unsafe.mock.calls[0]?.[0] as string;
    const primaryParams = mockSql.unsafe.mock.calls[0]?.[1] as unknown[];
    expect(primaryQuery).toContain('FROM phm_edw.qdm_event qe');
    expect(primaryQuery).toContain('EXISTS');
    expect(primaryQuery).toContain('qe.qdm_datatype = ANY');
    expect(primaryParams).toEqual([
      42,
      7,
      INGEST_RUN_ID,
      ['Laboratory Test, Performed'],
      '2026-01-01',
      '2026-12-31',
      25,
    ]);

    const patientQuery = mockSql.unsafe.mock.calls[1]?.[0] as string;
    const patientParams = mockSql.unsafe.mock.calls[1]?.[1] as unknown[];
    expect(patientQuery).toContain("qe.qdm_datatype = 'Patient'");
    expect(patientQuery).not.toContain('ingest_run_id');
    expect(patientQuery).toContain("qe.source_payload #>> '{subject,reference}'");
    expect(patientParams).toEqual([42, 7, [123], ['Patient/pat-1'], 25]);
  });

  it('rejects an inverted reporting period before querying', async () => {
    await expect(
      buildQdmQiCoreBundleForCql({
        periodStart: '2026-12-31',
        periodEnd: '2026-01-01',
      }),
    ).rejects.toThrow('periodEnd must be on or after periodStart');

    expect(mockSql.unsafe).not.toHaveBeenCalled();
  });
});

describe('loadQdmEventsToCqlEngine', () => {
  it('does not call the engine when no persisted QDM events project to QI-Core resources', async () => {
    mockSql.unsafe.mockResolvedValueOnce([]);

    const result = await loadQdmEventsToCqlEngine({
      engineBaseUrl: 'http://engine.test/fhir',
      includePatientRecords: false,
    });

    expect(result).toEqual({
      qdmEventsSelected: 0,
      qdmEventsIncluded: 0,
      qdmEventsProjected: 0,
      qdmEventsSkipped: 0,
      bundleEntries: 0,
      load: null,
    });
    expect(mockLoadBundle).not.toHaveBeenCalled();
  });

  it('loads the deduped QI-Core bundle into the configured engine URL and clamps the event limit', async () => {
    mockSql.unsafe.mockResolvedValueOnce([
      {
        qdm_event_id: 88,
        patient_id: 123,
        patient_ref: 'Patient/pat-1',
        qdm_datatype: 'Laboratory Test, Performed',
        source_payload: labQdm,
      },
    ]);
    mockLoadBundle.mockResolvedValueOnce({ total: 1, created: 1, ok: 1, failed: 0 });

    const result = await loadQdmEventsToCqlEngine({
      engineBaseUrl: 'http://engine.test/fhir',
      includePatientRecords: false,
      limit: 99999,
    });

    expect(result).toMatchObject({
      qdmEventsSelected: 1,
      qdmEventsIncluded: 1,
      qdmEventsProjected: 1,
      bundleEntries: 1,
      load: { total: 1, created: 1, ok: 1, failed: 0 },
    });
    expect(mockLoadBundle).toHaveBeenCalledWith(
      'http://engine.test/fhir',
      expect.objectContaining({
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [expect.objectContaining({ fullUrl: 'Observation/qdm-Observation-obs-1' })],
      }),
    );
    expect((mockSql.unsafe.mock.calls[0]?.[1] as unknown[]).at(-1)).toBe(50_000);
  });
});
