// =============================================================================
// Unit tests — EHR FHIR resource staging
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FhirBundle, FhirResource } from './types.js';

const { mockSql, normalizeStagedRunToQdm } = vi.hoisted(() => {
  const fn = vi.fn();
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;
  const normalizeStagedRunToQdm = vi.fn();
  return { mockSql: fn, normalizeStagedRunToQdm };
});
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('./qdmBridge.js', () => ({ normalizeStagedRunToQdm }));

import {
  stableFhirResourceHash,
  stageFhirResource,
  stageFhirResources,
} from './resourceStaging.js';

beforeEach(() => vi.clearAllMocks());

const runId = '00000000-0000-4000-8000-000000000063';

const patientResource: FhirResource = {
  resourceType: 'Patient',
  id: 'pat-1',
  meta: {
    versionId: '7',
    lastUpdated: '2026-06-16T12:00:00Z',
  },
  identifier: [{ system: 'urn:mrn', value: 'MRN-1' }],
};

describe('stableFhirResourceHash', () => {
  it('produces the same hash for semantically identical JSON with different key order', () => {
    const reordered: FhirResource = {
      id: 'pat-1',
      identifier: [{ value: 'MRN-1', system: 'urn:mrn' }],
      meta: {
        lastUpdated: '2026-06-16T12:00:00Z',
        versionId: '7',
      },
      resourceType: 'Patient',
    };

    expect(stableFhirResourceHash(patientResource)).toBe(stableFhirResourceHash(reordered));
    expect(stableFhirResourceHash(patientResource)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('stageFhirResource', () => {
  it('upserts one FHIR resource with source metadata and stable content hash', async () => {
    const contentHash = stableFhirResourceHash(patientResource);
    mockSql.mockResolvedValueOnce([
      stagingRow(patientResource, {
        resource_type: 'Patient',
        resource_id: 'pat-1',
        patient_ref: 'Patient/pat-1',
        source_version_id: '7',
        source_last_updated: '2026-06-16 12:00:00+00',
        content_hash: contentHash,
      }),
    ]);

    const staged = await stageFhirResource({
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: runId,
      resource: patientResource,
    });

    expect(staged).toMatchObject({
      id: 99,
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: runId,
      resourceType: 'Patient',
      resourceId: 'pat-1',
      patientRef: 'Patient/pat-1',
      sourceVersionId: '7',
      contentHash,
      status: 'staged',
      errors: [],
    });

    const values = mockSql.mock.calls[0]!.slice(1);
    const statement = String(mockSql.mock.calls[0]![0]);
    expect(statement).toContain('source_version_id = EXCLUDED.source_version_id');
    expect(statement).toContain('content_hash = EXCLUDED.content_hash');
    expect(values).toEqual(
      expect.arrayContaining([
        7,
        42,
        runId,
        'Patient',
        'pat-1',
        'Patient/pat-1',
        patientResource,
        '7',
        '2026-06-16T12:00:00Z',
        contentHash,
        [],
      ]),
    );
  });

  it('rejects resources without an id before writing', async () => {
    await expect(
      stageFhirResource({
        orgId: 7,
        ehrTenantId: 42,
        ingestRunId: runId,
        resource: { resourceType: 'Observation' },
      }),
    ).rejects.toThrow('missing id');

    expect(mockSql).not.toHaveBeenCalled();
  });
});

describe('stageFhirResources', () => {
  it('flattens Bundle entries, ignores empty entries, and stages each resource', async () => {
    const observation: FhirResource = {
      resourceType: 'Observation',
      id: 'obs-1',
      subject: { reference: 'Patient/pat-1' },
      meta: { versionId: '3', lastUpdated: '2026-06-16T12:01:00Z' },
      code: { text: 'A1c' },
    };
    const bundle: FhirBundle = {
      resourceType: 'Bundle',
      id: 'bundle-1',
      type: 'searchset',
      entry: [
        { fullUrl: 'https://ehr.example/fhir/Patient/pat-1', resource: patientResource },
        {},
        { fullUrl: 'https://ehr.example/fhir/Observation/obs-1', resource: observation },
      ],
    };

    mockSql
      .mockResolvedValueOnce([
        stagingRow(patientResource, {
          resource_type: 'Patient',
          resource_id: 'pat-1',
          patient_ref: 'Patient/pat-1',
          source_version_id: '7',
          source_last_updated: '2026-06-16 12:00:00+00',
          content_hash: stableFhirResourceHash(patientResource),
        }),
      ])
      .mockResolvedValueOnce([
        stagingRow(observation, {
          id: 100,
          resource_type: 'Observation',
          resource_id: 'obs-1',
          patient_ref: 'Patient/pat-1',
          source_version_id: '3',
          source_last_updated: '2026-06-16 12:01:00+00',
          content_hash: stableFhirResourceHash(observation),
        }),
      ]);

    const result = await stageFhirResources({
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: runId,
      source: bundle,
    });

    expect(result.receivedCount).toBe(2);
    expect(result.staged.map((resource) => resource.resourceType)).toEqual(['Patient', 'Observation']);
    expect(result.qdm).toBeNull();
    expect(mockSql).toHaveBeenCalledTimes(2);
    expect(normalizeStagedRunToQdm).not.toHaveBeenCalled();

    const secondValues = mockSql.mock.calls[1]!.slice(1);
    expect(secondValues).toEqual(
      expect.arrayContaining(['Observation', 'obs-1', 'Patient/pat-1', '3', '2026-06-16T12:01:00Z']),
    );
  });

  it('uses resource ids from absolute Bundle fullUrl values when resource.id is absent', async () => {
    const observation: FhirResource = {
      resourceType: 'Observation',
      subject: { reference: 'Patient/pat-1' },
    };
    mockSql.mockResolvedValueOnce([
      stagingRow(observation, {
        resource_type: 'Observation',
        resource_id: 'obs-from-full-url',
        patient_ref: 'Patient/pat-1',
        source_version_id: null,
        source_last_updated: null,
        content_hash: stableFhirResourceHash(observation),
      }),
    ]);

    const result = await stageFhirResources({
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: runId,
      source: {
        resourceType: 'Bundle',
        entry: [
          {
            fullUrl: 'https://ehr.example/fhir/Observation/obs-from-full-url',
            resource: observation,
          },
        ],
      },
    });

    expect(result.staged[0]?.resourceId).toBe('obs-from-full-url');
    expect(result.qdm).toBeNull();
    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toEqual(expect.arrayContaining(['Observation', 'obs-from-full-url']));
  });

  it('can normalize the staged run into QDM after all resources are staged', async () => {
    const qdmResult = {
      resourcesSeen: 2,
      resourcesNormalized: 2,
      resourcesSkipped: 0,
      resourcesFailed: 0,
      eventsUpserted: 2,
      errors: [],
    };
    normalizeStagedRunToQdm.mockResolvedValueOnce(qdmResult);
    const observation: FhirResource = {
      resourceType: 'Observation',
      id: 'obs-1',
      subject: { reference: 'Patient/pat-1' },
    };

    mockSql
      .mockResolvedValueOnce([
        stagingRow(patientResource, {
          resource_type: 'Patient',
          resource_id: 'pat-1',
          patient_ref: 'Patient/pat-1',
        }),
      ])
      .mockResolvedValueOnce([
        stagingRow(observation, {
          id: 100,
          resource_type: 'Observation',
          resource_id: 'obs-1',
          patient_ref: 'Patient/pat-1',
        }),
      ]);

    const result = await stageFhirResources({
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: runId,
      source: [patientResource, observation],
      normalizeToQdm: {
        enabled: true,
        limit: 50,
        sourceSystem: 'unit-test-staging',
      },
    });

    expect(result.qdm).toEqual(qdmResult);
    expect(mockSql).toHaveBeenCalledTimes(2);
    expect(normalizeStagedRunToQdm).toHaveBeenCalledWith({
      ingestRunId: runId,
      ehrTenantId: 42,
      orgId: 7,
      limit: 50,
      sourceSystem: 'unit-test-staging',
    });
  });

  it('can fail fast when opt-in QDM normalization reports failed resources', async () => {
    normalizeStagedRunToQdm.mockResolvedValueOnce({
      resourcesSeen: 1,
      resourcesNormalized: 0,
      resourcesSkipped: 0,
      resourcesFailed: 1,
      eventsUpserted: 0,
      errors: [{ stagingId: 99, resourceType: 'Observation', resourceId: 'obs-1', message: 'bad' }],
    });
    mockSql.mockResolvedValueOnce([
      stagingRow(patientResource, {
        resource_type: 'Patient',
        resource_id: 'pat-1',
        patient_ref: 'Patient/pat-1',
      }),
    ]);

    await expect(
      stageFhirResources({
        orgId: 7,
        ehrTenantId: 42,
        ingestRunId: runId,
        source: [patientResource],
        normalizeToQdm: { enabled: true, failOnError: true },
      }),
    ).rejects.toThrow('QDM normalization failed');
  });
});

function stagingRow(resource: FhirResource, overrides: Record<string, unknown> = {}) {
  return {
    id: 99,
    org_id: 7,
    ehr_tenant_id: 42,
    ingest_run_id: runId,
    resource_type: resource.resourceType,
    resource_id: resource.id ?? 'from-full-url',
    patient_ref: resource.resourceType === 'Patient' && resource.id ? `Patient/${resource.id}` : null,
    resource,
    source_version_id: resource.meta?.versionId ?? null,
    source_last_updated: resource.meta?.lastUpdated ?? null,
    content_hash: stableFhirResourceHash(resource),
    status: 'staged',
    error_message: null,
    errors: [],
    normalized: false,
    normalization_error: null,
    received_at: '2026-06-16 12:02:00+00',
    updated_at: '2026-06-16 12:02:00+00',
    ...overrides,
  };
}
