import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchLike } from './types.js';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  (fn as unknown as { json: (value: unknown) => unknown }).json = (value: unknown) => value;
  return { mockSql: fn };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  buildBulkExportRequest,
  kickoffBulkExport,
  parseBulkManifest,
  pollBulkExportJob,
} from './bulkData.js';

const jobId = '00000000-0000-4000-8000-000000000067';
const tenant = {
  id: 42,
  orgId: 7,
  vendor: 'epic',
  fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
};
const token = {
  accessToken: 'raw-bulk-token',
  tokenType: 'Bearer',
};

const manifest = {
  transactionTime: '2026-06-17T12:00:00Z',
  request: 'https://ehr.example.test/fhir/R4/Group/group-1/$export?_type=Patient,Observation',
  requiresAccessToken: true,
  output: [
    { type: 'Patient', url: 'https://ehr.example.test/bulk/patient.ndjson', count: 2 },
    { type: 'Observation', url: 'https://ehr.example.test/bulk/observation.ndjson', count: 10 },
  ],
};

function bulkJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: jobId,
    org_id: 7,
    ehr_tenant_id: 42,
    ingest_run_id: null,
    export_level: 'group',
    group_id: 'group-1',
    patient_id: null,
    status: 'accepted',
    resource_types: ['Patient', 'Observation'],
    since: '2026-06-17 00:00:00+00',
    type_filters: ['Observation?date=ge2026-01-01'],
    request_url: 'https://ehr.example.test/fhir/R4/Group/group-1/$export?_type=Patient%2CObservation&_since=2026-06-17T00%3A00%3A00.000Z',
    status_url: 'https://ehr.example.test/bulk/status/abc',
    manifest: null,
    output_files: [],
    error: null,
    retry_after_seconds: 120,
    poll_count: 0,
    requested_at: '2026-06-17 12:00:00+00',
    next_poll_at: '2026-06-17 12:02:00+00',
    completed_at: null,
    metadata: { ticket: 'EHR-1' },
    created_at: '2026-06-17 12:00:00+00',
    updated_at: '2026-06-17 12:00:00+00',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body === null ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  mockSql.mockReset();
});

describe('buildBulkExportRequest', () => {
  it('builds approved vendor group export URLs with bounded resource types', () => {
    const request = buildBulkExportRequest({
      tenant,
      token,
      exportLevel: 'group',
      groupId: 'group-1',
      resourceTypes: ['Patient', 'Observation', 'Patient'],
      since: new Date('2026-06-17T00:00:00Z'),
      typeFilters: ['Observation?date=ge2026-01-01'],
    });

    const url = new URL(request.requestUrl);
    expect(url.pathname).toBe('/fhir/R4/Group/group-1/$export');
    expect(url.searchParams.get('_type')).toBe('Patient,Observation');
    expect(url.searchParams.get('_since')).toBe('2026-06-17T00:00:00.000Z');
    expect(url.searchParams.getAll('_typeFilter')).toEqual(['Observation?date=ge2026-01-01']);
  });

  it('rejects unsupported tenant Bulk Data levels before network or database calls', async () => {
    await expect(
      kickoffBulkExport({
        tenant: { ...tenant, vendor: 'smart_generic' },
        token,
        exportLevel: 'group',
        groupId: 'group-1',
        resourceTypes: ['Patient'],
        fetchImpl: vi.fn<FetchLike>(),
      }),
    ).rejects.toThrow('not configured for group Bulk Data export');

    expect(mockSql).not.toHaveBeenCalled();
  });
});

describe('kickoffBulkExport', () => {
  it('posts a respond-async kickoff and stores only job metadata', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse(null, 202, {
        'content-location': 'https://ehr.example.test/bulk/status/abc',
        'retry-after': '120',
      }),
    );
    mockSql.mockResolvedValueOnce([bulkJobRow()]);

    const job = await kickoffBulkExport({
      tenant,
      token,
      exportLevel: 'group',
      groupId: 'group-1',
      resourceTypes: ['Patient', 'Observation'],
      since: new Date('2026-06-17T00:00:00Z'),
      typeFilters: ['Observation?date=ge2026-01-01'],
      metadata: { ticket: 'EHR-1' },
      fetchImpl: fetchMock,
    });

    expect(job).toMatchObject({
      id: jobId,
      status: 'accepted',
      statusUrl: 'https://ehr.example.test/bulk/status/abc',
      retryAfterSeconds: 120,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(new URL(url).pathname).toBe('/fhir/R4/Group/group-1/$export');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        accept: 'application/fhir+json, application/json',
        authorization: 'Bearer raw-bulk-token',
        prefer: 'respond-async',
      },
    });

    const boundValues = JSON.stringify(mockSql.mock.calls[0]!.slice(1));
    expect(boundValues).toContain('https://ehr.example.test/bulk/status/abc');
    expect(boundValues).not.toContain('raw-bulk-token');
  });
});

describe('pollBulkExportJob', () => {
  it('keeps an accepted export in progress when the EHR returns 202', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse(null, 202, { 'retry-after': '60' }),
    );
    mockSql.mockResolvedValueOnce([bulkJobRow({ status: 'in_progress', retry_after_seconds: 60, poll_count: 1 })]);

    const job = await pollBulkExportJob({
      job: { id: jobId, statusUrl: 'https://ehr.example.test/bulk/status/abc' },
      token,
      fetchImpl: fetchMock,
    });

    expect(job.status).toBe('in_progress');
    expect(job.retryAfterSeconds).toBe(60);
    expect(mockSql.mock.calls[0]!.slice(1)).toEqual(expect.arrayContaining([60, jobId]));
  });

  it('stores a completed manifest and output file descriptors', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(manifest));
    mockSql.mockResolvedValueOnce([
      bulkJobRow({
        status: 'completed',
        manifest,
        output_files: manifest.output,
        completed_at: '2026-06-17 12:05:00+00',
        poll_count: 2,
      }),
    ]);

    const job = await pollBulkExportJob({
      job: { id: jobId, statusUrl: 'https://ehr.example.test/bulk/status/abc' },
      token,
      fetchImpl: fetchMock,
    });

    expect(job.status).toBe('completed');
    expect(job.outputFiles).toHaveLength(2);
    expect(job.outputFiles[0]).toMatchObject({ type: 'Patient', count: 2 });
    expect(JSON.stringify(mockSql.mock.calls[0]!.slice(1))).toContain('patient.ndjson');
  });
});

describe('parseBulkManifest', () => {
  it('validates Bulk Data manifest shape', () => {
    expect(parseBulkManifest(manifest).output).toHaveLength(2);
    expect(() => parseBulkManifest({ ...manifest, output: [{ type: 'Patient' }] })).toThrow(
      'output[0].url',
    );
  });
});
