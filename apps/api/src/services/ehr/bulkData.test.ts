import { createHash } from 'node:crypto';
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
  cancelBulkExportJob,
  cancelBulkExportJobWithBackendServices,
  kickoffBulkExportWithBackendServices,
  importCompletedBulkExportJob,
  importBulkExportJob,
  extractDeletedReferences,
  processBulkDeletions,
  kickoffBulkExport,
  listBulkJobs,
  parseBulkManifest,
  pollBulkExportJob,
  pollBulkExportJobWithBackendServices,
} from './bulkData.js';
import type { FhirResource } from './types.js';
import type { EhrBulkJob, ImportBulkExportJobResult } from './bulkData.js';

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

const bulkIngestRun = {
  id: '00000000-0000-4000-8000-000000000085',
  orgId: 7,
  ehrTenantId: 42,
  resourceType: null,
  mode: 'bulk',
  status: 'running',
  requestedSince: null,
  startedAt: '2026-06-17 12:05:00+00',
  finishedAt: null,
  resourcesReceived: 0,
  resourcesStaged: 0,
  resourcesUpdated: 0,
  errorCount: 0,
  errorMessage: null,
  errors: [],
  metadata: {},
  createdAt: '2026-06-17 12:05:00+00',
  updatedAt: '2026-06-17 12:05:00+00',
} as const;

const bulkEdwHydration = {
  resourcesSeen: 1,
  resourcesHydrated: 1,
  resourcesSkipped: 0,
  resourcesFailed: 0,
  rowsInserted: 1,
  rowsUpdated: 0,
  byResourceType: {
    Observation: { seen: 1, hydrated: 1, skipped: 0, failed: 0 },
  },
  errors: [],
};

const bulkQdmBridge = {
  resourcesSeen: 2,
  resourcesNormalized: 2,
  resourcesSkipped: 0,
  resourcesFailed: 0,
  eventsUpserted: 2,
  errors: [],
};

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

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

function ehrBulkJob(overrides: Partial<EhrBulkJob> = {}): EhrBulkJob {
  return {
    id: jobId,
    orgId: 7,
    ehrTenantId: 42,
    ingestRunId: null,
    exportLevel: 'group',
    groupId: 'group-1',
    patientId: null,
    status: 'completed',
    resourceTypes: ['Patient', 'Observation'],
    since: '2026-06-17 00:00:00+00',
    typeFilters: ['Observation?date=ge2026-01-01'],
    requestUrl: manifest.request,
    statusUrl: 'https://ehr.example.test/bulk/status/abc',
    manifest,
    outputFiles: manifest.output,
    error: null,
    retryAfterSeconds: null,
    pollCount: 2,
    requestedAt: '2026-06-17 12:00:00+00',
    nextPollAt: null,
    completedAt: '2026-06-17 12:05:00+00',
    metadata: {},
    createdAt: '2026-06-17 12:00:00+00',
    updatedAt: '2026-06-17 12:05:00+00',
    ...overrides,
  };
}

function backendConfig(overrides: Record<string, unknown> = {}) {
  return {
    tenant,
    clientRegistrationId: 99,
    clientId: 'backend-client',
    authMethod: 'client_secret_basic' as const,
    clientSecretRef: 'env:EHR_BACKEND_SECRET',
    jwksUrl: null,
    privateKeyRef: null,
    scopesRequested: 'system/Patient.rs system/Observation.rs system/Condition.rs',
    scopesGranted: 'system/Patient.rs system/Observation.rs',
    tokenEndpoint: 'https://issuer.example.test/oauth/token',
    ...overrides,
  };
}

const backendTokenResult = {
  accessToken: {
    accessToken: 'runtime-backend-token',
    tokenType: 'Bearer',
    scope: 'system/Patient.rs system/Observation.rs',
  },
  tokenResponse: {
    access_token: 'runtime-backend-token',
    token_type: 'Bearer',
    expires_in: 300,
    scope: 'system/Patient.rs system/Observation.rs',
  },
  tokenMetadata: {
    id: '00000000-0000-4000-8000-000000000087',
    smartLaunchSessionId: null,
    ehrTenantId: 42,
    orgId: 7,
    userId: null,
    tokenType: 'Bearer',
    scope: 'system/Patient.rs system/Observation.rs',
    accessTokenHash: 'hash',
    refreshTokenHash: null,
    idTokenHash: null,
    patientRef: null,
    encounterRef: null,
    fhirUserRef: null,
    launchContext: {},
    tokenResponseMetadata: {},
    issuedAt: '2026-06-17 12:00:00+00',
    expiresAt: '2026-06-17 12:05:00+00',
    revokedAt: null,
    createdAt: '2026-06-17 12:00:00+00',
    updatedAt: '2026-06-17 12:00:00+00',
  },
};

function bulkImportFileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000086',
    bulk_job_id: jobId,
    org_id: 7,
    ehr_tenant_id: 42,
    ingest_run_id: bulkIngestRun.id,
    resource_type: 'Patient',
    file_url_hash: 'a'.repeat(64),
    file_url_redacted: 'https://ehr.example.test/__bulk_output__/aaaaaaaaaaaaaaaa',
    manifest_count: 1,
    status: 'completed',
    rows_read: 1,
    resources_staged: 1,
    error_count: 0,
    error: null,
    started_at: '2026-06-17 12:05:00+00',
    completed_at: '2026-06-17 12:06:00+00',
    metadata: {},
    created_at: '2026-06-17 12:05:00+00',
    updated_at: '2026-06-17 12:06:00+00',
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
  it('sends a respond-async GET kickoff and stores only job metadata', async () => {
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
      method: 'GET',
      headers: {
        accept: 'application/fhir+json',
        authorization: 'Bearer raw-bulk-token',
        prefer: 'respond-async',
      },
    });

    const boundValues = JSON.stringify(mockSql.mock.calls[0]!.slice(1));
    expect(boundValues).toContain('https://ehr.example.test/bulk/status/abc');
    expect(boundValues).not.toContain('raw-bulk-token');
  });

  it('rejects cross-origin Bulk status URLs from kickoff responses', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse(null, 202, {
        'content-location': 'https://evil.example.test/bulk/status/abc',
      }),
    );

    await expect(
      kickoffBulkExport({
        tenant,
        token,
        exportLevel: 'group',
        groupId: 'group-1',
        resourceTypes: ['Patient'],
        fetchImpl: fetchMock,
      }),
    ).rejects.toThrow('status URL origin does not match');

    expect(mockSql).not.toHaveBeenCalled();
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
    const persistedValues = JSON.stringify(mockSql.mock.calls[0]!.slice(1));
    expect(persistedValues).toContain('__bulk_output__');
    expect(persistedValues).not.toContain('patient.ndjson');
    expect(persistedValues).not.toContain('observation.ndjson');
  });
});

describe('cancelBulkExportJob', () => {
  it('sends a Bulk Data DELETE and marks active jobs canceled without persisting token values', async () => {
    const activeJob = ehrBulkJob({
      status: 'in_progress',
      completedAt: null,
      nextPollAt: '2026-06-17 12:10:00+00',
    });
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(null, 202));
    mockSql.mockResolvedValueOnce([
      bulkJobRow({
        status: 'canceled',
        completed_at: '2026-06-17 12:08:00+00',
        next_poll_at: null,
        metadata: { cancel: { source: 'ehr-bulk-data-cancel', triggeredBy: 'manual' } },
      }),
    ]);

    const job = await cancelBulkExportJob({
      job: activeJob,
      token,
      metadata: { triggeredBy: 'manual' },
      fetchImpl: fetchMock,
    });

    expect(job.status).toBe('canceled');
    expect(fetchMock).toHaveBeenCalledWith(
      activeJob.statusUrl,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ authorization: 'Bearer raw-bulk-token' }),
      }),
    );
    const sqlValues = JSON.stringify(mockSql.mock.calls[0]!.slice(1));
    expect(sqlValues).toContain('ehr-bulk-data-cancel');
    expect(sqlValues).not.toContain('raw-bulk-token');
  });

  it('rejects cancellation of terminal Bulk jobs before network access', async () => {
    const fetchMock = vi.fn<FetchLike>();

    await expect(
      cancelBulkExportJob({
        job: ehrBulkJob({ status: 'completed' }),
        token,
        fetchImpl: fetchMock,
      }),
    ).rejects.toThrow('Only accepted or in-progress Bulk Data jobs can be canceled');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockSql).not.toHaveBeenCalled();
  });
});

describe('backend-services Bulk orchestration', () => {
  it('kicks off a Bulk export with runtime backend-services token scope', async () => {
    const completedJob = ehrBulkJob({ status: 'accepted', retryAfterSeconds: 600 });
    const loadBackendServicesConfig = vi.fn().mockResolvedValue(backendConfig());
    const requestBackendServiceToken = vi.fn().mockResolvedValue(backendTokenResult);
    const runKickoff = vi.fn().mockResolvedValue(completedJob);
    const fetchMock = vi.fn<FetchLike>();

    const result = await kickoffBulkExportWithBackendServices(
      {
        ehrTenantId: 42,
        exportLevel: 'group',
        groupId: 'group-1',
        resourceTypes: ['Patient', 'Observation'],
        since: '2026-06-01T00:00:00Z',
        fetchImpl: fetchMock,
      },
      {
        loadBackendServicesConfig,
        requestBackendServiceToken,
        kickoffBulkExport: runKickoff,
      },
    );

    expect(result.job.id).toBe(jobId);
    expect(result.tokenMetadataId).toBe('00000000-0000-4000-8000-000000000087');
    expect(loadBackendServicesConfig).toHaveBeenCalledWith(42, fetchMock);
    expect(requestBackendServiceToken).toHaveBeenCalledWith({
      config: backendConfig(),
      scope: 'system/Patient.rs system/Observation.rs',
      fetchImpl: fetchMock,
    });
    expect(runKickoff).toHaveBeenCalledWith(expect.objectContaining({
      tenant,
      token: expect.objectContaining({ accessToken: 'runtime-backend-token' }),
      exportLevel: 'group',
      resourceTypes: ['Patient', 'Observation'],
      groupId: 'group-1',
      since: '2026-06-01T00:00:00Z',
      metadata: expect.objectContaining({
        source: 'ehr-bulk-data-orchestration',
        tokenMetadataId: '00000000-0000-4000-8000-000000000087',
      }),
    }));
  });

  it('polls a Bulk export with backend-services token and returns a redacted job', async () => {
    const inProgressJob = ehrBulkJob({ status: 'in_progress', completedAt: null });
    const completedJob = ehrBulkJob();
    const loadBackendServicesConfig = vi.fn().mockResolvedValue(backendConfig());
    const requestBackendServiceToken = vi.fn().mockResolvedValue(backendTokenResult);
    const getBulkJob = vi.fn().mockResolvedValue(inProgressJob);
    const runPoll = vi.fn().mockResolvedValue(completedJob);
    const fetchMock = vi.fn<FetchLike>();

    const result = await pollBulkExportJobWithBackendServices(
      {
        ehrTenantId: 42,
        bulkJobId: jobId,
        fetchImpl: fetchMock,
      },
      {
        loadBackendServicesConfig,
        requestBackendServiceToken,
        getBulkJob,
        pollBulkExportJob: runPoll,
      },
    );

    expect(result.job.status).toBe('completed');
    expect(result.job.statusUrl).toContain('__bulk_output__');
    expect(requestBackendServiceToken).toHaveBeenCalledWith({
      config: backendConfig(),
      scope: 'system/Patient.rs system/Observation.rs',
      fetchImpl: fetchMock,
    });
    expect(runPoll).toHaveBeenCalledWith({
      job: inProgressJob,
      token: expect.objectContaining({ accessToken: 'runtime-backend-token' }),
      fetchImpl: fetchMock,
    });
  });

  it('cancels an active Bulk export with a runtime backend-services token', async () => {
    const inProgressJob = ehrBulkJob({ status: 'in_progress', completedAt: null, nextPollAt: '2026-06-17 12:10:00+00' });
    const canceledJob = ehrBulkJob({ status: 'canceled', completedAt: '2026-06-17 12:08:00+00', nextPollAt: null });
    const loadBackendServicesConfig = vi.fn().mockResolvedValue(backendConfig());
    const requestBackendServiceToken = vi.fn().mockResolvedValue(backendTokenResult);
    const getBulkJob = vi.fn().mockResolvedValue(inProgressJob);
    const runCancel = vi.fn().mockResolvedValue(canceledJob);
    const fetchMock = vi.fn<FetchLike>();

    const result = await cancelBulkExportJobWithBackendServices(
      {
        ehrTenantId: 42,
        bulkJobId: jobId,
        metadata: { triggeredBy: 'manual' },
        fetchImpl: fetchMock,
      },
      {
        loadBackendServicesConfig,
        requestBackendServiceToken,
        getBulkJob,
        cancelBulkExportJob: runCancel,
      },
    );

    expect(result.job.status).toBe('canceled');
    expect(result.job.statusUrl).toContain('__bulk_output__');
    expect(requestBackendServiceToken).toHaveBeenCalledWith({
      config: backendConfig(),
      scope: 'system/Patient.rs system/Observation.rs',
      fetchImpl: fetchMock,
    });
    expect(runCancel).toHaveBeenCalledWith({
      job: inProgressJob,
      token: expect.objectContaining({ accessToken: 'runtime-backend-token' }),
      metadata: { triggeredBy: 'manual' },
      fetchImpl: fetchMock,
    });
  });

  it('rejects backend-services cancellation of terminal jobs before token request', async () => {
    const requestBackendServiceToken = vi.fn();

    await expect(
      cancelBulkExportJobWithBackendServices(
        {
          ehrTenantId: 42,
          bulkJobId: jobId,
          fetchImpl: vi.fn<FetchLike>(),
        },
        {
          loadBackendServicesConfig: vi.fn().mockResolvedValue(backendConfig()),
          requestBackendServiceToken,
          getBulkJob: vi.fn().mockResolvedValue(ehrBulkJob({ status: 'completed' })),
          cancelBulkExportJob: vi.fn(),
        },
      ),
    ).rejects.toThrow('Only accepted or in-progress Bulk Data jobs can be canceled');

    expect(requestBackendServiceToken).not.toHaveBeenCalled();
  });
});

describe('listBulkJobs', () => {
  it('returns redacted tenant Bulk jobs with file-level import status', async () => {
    mockSql
      .mockResolvedValueOnce([
        bulkJobRow({
          status: 'completed',
          ingest_run_id: bulkIngestRun.id,
          manifest,
          output_files: manifest.output,
          completed_at: '2026-06-17 12:05:00+00',
        }),
      ])
      .mockResolvedValueOnce([bulkImportFileRow()])
      .mockResolvedValueOnce([
        {
          id: bulkIngestRun.id,
          status: 'succeeded',
          finished_at: '2026-06-17 12:07:00+00',
          resources_received: '1',
          resources_staged: '1',
          resources_updated: '1',
          error_count: '0',
          metadata: {
            bulkImport: { edwHydration: bulkEdwHydration },
            qdmBridge: bulkQdmBridge,
            qdmReplay: { replayedAt: '2026-06-17T12:08:00.000Z' },
          },
        },
      ]);

    const jobs = await listBulkJobs({ ehrTenantId: 42, status: 'completed', limit: 5 });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: jobId,
      status: 'completed',
      importFiles: [
        {
          resourceType: 'Patient',
          status: 'completed',
          rowsRead: 1,
          resourcesStaged: 1,
        },
      ],
      importSummary: {
        totalFiles: 1,
        completedFiles: 1,
        rowsRead: 1,
        resourcesStaged: 1,
        errorCount: 0,
        canResumeFailedFiles: false,
        canReplayQdm: true,
        ingestRunId: bulkIngestRun.id,
        ingestStatus: 'succeeded',
        edwResourcesHydrated: 1,
        qdmReplayStatus: 'replayed',
        qdmResourcesNormalized: 2,
        qdmEventsUpserted: 2,
        qdmLastReplayedAt: '2026-06-17T12:08:00.000Z',
      },
    });
    expect(jobs[0]?.requestUrl).toContain('__bulk_output__');
    expect(JSON.stringify(jobs)).not.toContain('patient.ndjson');
  });

  it('treats zero-normalized QDM replay metadata as replayed', async () => {
    mockSql
      .mockResolvedValueOnce([
        bulkJobRow({
          status: 'completed',
          ingest_run_id: bulkIngestRun.id,
          manifest,
          output_files: manifest.output,
          completed_at: '2026-06-17 12:05:00+00',
        }),
      ])
      .mockResolvedValueOnce([bulkImportFileRow()])
      .mockResolvedValueOnce([
        {
          id: bulkIngestRun.id,
          status: 'succeeded',
          finished_at: '2026-06-17 12:07:00+00',
          resources_received: '1',
          resources_staged: '1',
          resources_updated: '1',
          error_count: '0',
          metadata: {
            qdmBridge: {
              resourcesSeen: 1,
              resourcesNormalized: 0,
              resourcesSkipped: 1,
              resourcesFailed: 0,
              eventsUpserted: 0,
              errors: [],
            },
            qdmReplay: { replayedAt: '2026-06-17T12:08:00.000Z' },
          },
        },
      ]);

    const [job] = await listBulkJobs({ ehrTenantId: 42, status: 'completed', limit: 5 });

    expect(job?.importSummary).toMatchObject({
      qdmReplayStatus: 'replayed',
      qdmResourcesNormalized: 0,
      qdmEventsUpserted: 0,
      canReplayQdm: true,
      qdmLastReplayedAt: '2026-06-17T12:08:00.000Z',
    });
  });
});

describe('importCompletedBulkExportJob', () => {
  it('loads backend-services config, requests covered system scopes, and imports the completed job', async () => {
    const completedJob = ehrBulkJob();
    const backendConfig = {
      tenant,
      clientRegistrationId: 99,
      clientId: 'backend-client',
      authMethod: 'client_secret_basic' as const,
      clientSecretRef: 'env:EHR_BACKEND_SECRET',
      jwksUrl: null,
      privateKeyRef: null,
      scopesRequested: 'system/Patient.rs system/Observation.rs system/Condition.rs',
      scopesGranted: 'system/Patient.rs system/Observation.rs',
      tokenEndpoint: 'https://issuer.example.test/oauth/token',
    };
    const importResult: ImportBulkExportJobResult = {
      job: completedJob,
      ingestRun: { ...bulkIngestRun, status: 'succeeded' },
      files: [],
      resourcesRead: 2,
      resourcesStaged: 2,
      resourcesFailed: 0,
      edwHydration: bulkEdwHydration,
      qdmBridge: bulkQdmBridge,
    };
    const loadBackendServicesConfig = vi.fn().mockResolvedValue(backendConfig);
    const requestBackendServiceToken = vi.fn().mockResolvedValue({
      accessToken: {
        accessToken: 'runtime-backend-token',
        tokenType: 'Bearer',
        scope: 'system/Patient.rs system/Observation.rs',
      },
      tokenResponse: {
        access_token: 'runtime-backend-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'system/Patient.rs system/Observation.rs',
      },
      tokenMetadata: {
        id: '00000000-0000-4000-8000-000000000087',
        smartLaunchSessionId: null,
        ehrTenantId: 42,
        orgId: 7,
        userId: null,
        tokenType: 'Bearer',
        scope: 'system/Patient.rs system/Observation.rs',
        accessTokenHash: 'hash',
        refreshTokenHash: null,
        idTokenHash: null,
        patientRef: null,
        encounterRef: null,
        fhirUserRef: null,
        launchContext: {},
        tokenResponseMetadata: {},
        issuedAt: '2026-06-17 12:00:00+00',
        expiresAt: '2026-06-17 12:05:00+00',
        revokedAt: null,
        createdAt: '2026-06-17 12:00:00+00',
        updatedAt: '2026-06-17 12:00:00+00',
      },
    });
    const getBulkJob = vi.fn().mockResolvedValue(completedJob);
    const runImport = vi.fn().mockResolvedValue(importResult);
    const fetchMock = vi.fn<FetchLike>();

    const result = await importCompletedBulkExportJob(
      {
        ehrTenantId: 42,
        bulkJobId: jobId,
        maxResourcesPerFile: 500,
        resumeFailedOnly: true,
        fetchImpl: fetchMock,
      },
      {
        loadBackendServicesConfig,
        requestBackendServiceToken,
        getBulkJob,
        importBulkExportJob: runImport,
      },
    );

    expect(result.tokenMetadataId).toBe('00000000-0000-4000-8000-000000000087');
    expect(loadBackendServicesConfig).toHaveBeenCalledWith(42, fetchMock);
    expect(getBulkJob).toHaveBeenCalledWith(jobId, 42);
    expect(requestBackendServiceToken).toHaveBeenCalledWith({
      config: backendConfig,
      scope: 'system/Patient.rs system/Observation.rs',
      fetchImpl: fetchMock,
    });
    expect(runImport).toHaveBeenCalledWith({
      tenant,
      job: completedJob,
      manifest,
      token: expect.objectContaining({ accessToken: 'runtime-backend-token' }),
      fetchImpl: fetchMock,
      maxResourcesPerFile: 500,
      resumeFailedOnly: true,
    });
  });

  it('rejects a completed manifest when backend-services scopes do not cover all output files', async () => {
    const completedJob = ehrBulkJob();
    const backendConfig = {
      tenant,
      clientRegistrationId: 99,
      clientId: 'backend-client',
      authMethod: 'client_secret_basic' as const,
      clientSecretRef: 'env:EHR_BACKEND_SECRET',
      jwksUrl: null,
      privateKeyRef: null,
      scopesRequested: 'system/Patient.rs',
      scopesGranted: 'system/Patient.rs',
      tokenEndpoint: 'https://issuer.example.test/oauth/token',
    };
    const requestBackendServiceToken = vi.fn();
    const runImport = vi.fn();

    await expect(
      importCompletedBulkExportJob(
        {
          ehrTenantId: 42,
          bulkJobId: jobId,
          fetchImpl: vi.fn<FetchLike>(),
        },
        {
          loadBackendServicesConfig: vi.fn().mockResolvedValue(backendConfig),
          requestBackendServiceToken,
          getBulkJob: vi.fn().mockResolvedValue(completedJob),
          importBulkExportJob: runImport,
        },
      ),
    ).rejects.toThrow('missing Bulk Data read scopes for: Observation');

    expect(requestBackendServiceToken).not.toHaveBeenCalled();
    expect(runImport).not.toHaveBeenCalled();
  });

  it('re-fetches raw output URLs when the stored completed manifest is redacted', async () => {
    const redactedManifest = {
      ...manifest,
      request: 'https://ehr.example.test/__bulk_output__/requesthash',
      output: manifest.output.map((output, index) => ({
        ...output,
        url: `https://ehr.example.test/__bulk_output__/hash-${index}`,
      })),
    };
    const completedJob = ehrBulkJob({ manifest: redactedManifest, outputFiles: redactedManifest.output });
    const backendConfig = {
      tenant,
      clientRegistrationId: 99,
      clientId: 'backend-client',
      authMethod: 'client_secret_basic' as const,
      clientSecretRef: 'env:EHR_BACKEND_SECRET',
      jwksUrl: null,
      privateKeyRef: null,
      scopesRequested: 'system/Patient.rs system/Observation.rs',
      scopesGranted: 'system/Patient.rs system/Observation.rs',
      tokenEndpoint: 'https://issuer.example.test/oauth/token',
    };
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(manifest));
    const runImport = vi.fn().mockImplementation(async (input) => ({
      job: input.job,
      ingestRun: { ...bulkIngestRun, status: 'succeeded' },
      files: [],
      resourcesRead: 0,
      resourcesStaged: 0,
      resourcesFailed: 0,
      edwHydration: null,
      qdmBridge: null,
    }));

    const result = await importCompletedBulkExportJob(
      {
        ehrTenantId: 42,
        bulkJobId: jobId,
        fetchImpl: fetchMock,
      },
      {
        loadBackendServicesConfig: vi.fn().mockResolvedValue(backendConfig),
        requestBackendServiceToken: vi.fn().mockResolvedValue({
          accessToken: {
            accessToken: 'runtime-backend-token',
            tokenType: 'Bearer',
            scope: 'system/Patient.rs system/Observation.rs',
          },
          tokenResponse: {
            access_token: 'runtime-backend-token',
            token_type: 'Bearer',
            expires_in: 300,
            scope: 'system/Patient.rs system/Observation.rs',
          },
          tokenMetadata: null,
        }),
        getBulkJob: vi.fn().mockResolvedValue(completedJob),
        importBulkExportJob: runImport,
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      completedJob.statusUrl,
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer runtime-backend-token' }),
      }),
    );
    expect(runImport).toHaveBeenCalledWith(expect.objectContaining({
      manifest,
    }));
    expect(JSON.stringify(result)).not.toContain('patient.ndjson');
    expect(JSON.stringify(result)).toContain('__bulk_output__');
  });

  it('does not treat backend-services write-only scopes as Bulk import read scopes', async () => {
    const completedJob = ehrBulkJob();
    const backendConfig = {
      tenant,
      clientRegistrationId: 99,
      clientId: 'backend-client',
      authMethod: 'client_secret_basic' as const,
      clientSecretRef: 'env:EHR_BACKEND_SECRET',
      jwksUrl: null,
      privateKeyRef: null,
      scopesRequested: 'system/Patient.write system/Observation.write',
      scopesGranted: 'system/Patient.write system/Observation.write',
      tokenEndpoint: 'https://issuer.example.test/oauth/token',
    };

    await expect(
      importCompletedBulkExportJob(
        {
          ehrTenantId: 42,
          bulkJobId: jobId,
          fetchImpl: vi.fn<FetchLike>(),
        },
        {
          loadBackendServicesConfig: vi.fn().mockResolvedValue(backendConfig),
          requestBackendServiceToken: vi.fn(),
          getBulkJob: vi.fn().mockResolvedValue(completedJob),
          importBulkExportJob: vi.fn(),
        },
      ),
    ).rejects.toThrow('missing Bulk Data read scopes for: Patient, Observation');
  });
});

describe('importBulkExportJob', () => {
  it('rejects tenant/job mismatches before starting an import run', async () => {
    await expect(
      importBulkExportJob({
        tenant,
        job: ehrBulkJob({ ehrTenantId: 999 }),
        token,
        fetchImpl: vi.fn<FetchLike>(),
        startIngestRun: vi.fn(),
      }),
    ).rejects.toThrow('does not belong to the selected EHR tenant');
  });

  it('rejects tenant organization mismatches before starting an import run', async () => {
    await expect(
      importBulkExportJob({
        tenant: { ...tenant, orgId: 9 },
        job: ehrBulkJob({ orgId: 7 }),
        token,
        fetchImpl: vi.fn<FetchLike>(),
        startIngestRun: vi.fn(),
      }),
    ).rejects.toThrow('Bulk Data job organization does not match the selected tenant');
  });

  it('rejects manifests that broaden beyond the original requested resource types', async () => {
    await expect(
      importBulkExportJob({
        tenant,
        job: ehrBulkJob({ resourceTypes: ['Patient'] }),
        token,
        fetchImpl: vi.fn<FetchLike>(),
        startIngestRun: vi.fn(),
      }),
    ).rejects.toThrow('unrequested output types: Observation');
  });

  it('downloads completed manifest NDJSON files, stages resources, hydrates EDW, and QDM-replays', async () => {
    const patient = JSON.stringify({
      resourceType: 'Patient',
      id: 'pat-1',
      name: [{ use: 'official', family: 'Bulk', given: ['Bryn'] }],
      birthDate: '1980-01-01',
      gender: 'female',
    });
    const observation = JSON.stringify({
      resourceType: 'Observation',
      id: 'obs-1',
      subject: { reference: 'Patient/pat-1' },
      status: 'final',
      code: { text: 'A1c' },
      valueQuantity: { value: 7.1, unit: '%' },
    });
    const fetchMock = vi.fn<FetchLike>()
      .mockResolvedValueOnce(new Response(`${patient}\n`, {
        status: 200,
        headers: { 'content-type': 'application/fhir+ndjson' },
      }))
      .mockResolvedValueOnce(new Response(`${observation}\n`, {
        status: 200,
        headers: { 'content-type': 'application/fhir+ndjson' },
      }));
    const startIngestRun = vi.fn().mockResolvedValue(bulkIngestRun);
    const stageFhirResource = vi.fn()
      .mockResolvedValueOnce({ id: 1001 })
      .mockResolvedValueOnce({ id: 1002 });
    const drainStagedRunToEdw = vi.fn().mockResolvedValue(bulkEdwHydration);
    const finishIngestRun = vi.fn().mockResolvedValue({
      run: { ...bulkIngestRun, status: 'succeeded' },
      qdmBridge: bulkQdmBridge,
    });
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('UPDATE phm_edw.ehr_bulk_job')) {
        return Promise.resolve([
          bulkJobRow({
            status: 'completed',
            manifest,
            output_files: manifest.output,
            ingest_run_id: bulkIngestRun.id,
          }),
        ]);
      }
      if (text.includes('INSERT INTO phm_edw.ehr_bulk_import_file')) {
        return Promise.resolve([{ id: '00000000-0000-4000-8000-000000000086' }]);
      }
      if (text.includes("SET status = 'completed'")) {
        return Promise.resolve([{ id: '00000000-0000-4000-8000-000000000086' }]);
      }
      return Promise.resolve([]);
    });

    const result = await importBulkExportJob({
      tenant,
      job: {
        ...bulkJobRow({
          status: 'completed',
          manifest,
          output_files: manifest.output,
        }),
        id: jobId,
        orgId: 7,
        ehrTenantId: 42,
        ingestRunId: null,
        exportLevel: 'group',
        groupId: 'group-1',
        patientId: null,
        resourceTypes: ['Patient', 'Observation'],
        typeFilters: [],
        requestUrl: manifest.request,
        statusUrl: 'https://ehr.example.test/bulk/status/abc',
        outputFiles: manifest.output,
        retryAfterSeconds: null,
        pollCount: 2,
        metadata: {},
        createdAt: '2026-06-17 12:00:00+00',
        updatedAt: '2026-06-17 12:05:00+00',
      },
      token,
      fetchImpl: fetchMock,
      startIngestRun,
      stageFhirResource,
      drainStagedRunToEdw,
      finishIngestRun,
    });

    expect(result).toMatchObject({
      resourcesRead: 2,
      resourcesStaged: 2,
      resourcesFailed: 0,
      files: [
        { resourceType: 'Patient', rowsRead: 1, resourcesStaged: 1, status: 'completed' },
        { resourceType: 'Observation', rowsRead: 1, resourcesStaged: 1, status: 'completed' },
      ],
      edwHydration: bulkEdwHydration,
      qdmBridge: bulkQdmBridge,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ehr.example.test/bulk/patient.ndjson',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer raw-bulk-token' }),
      }),
    );
    expect(stageFhirResource).toHaveBeenCalledTimes(2);
    expect(drainStagedRunToEdw).toHaveBeenCalledWith({
      orgId: 7,
      ehrTenantId: 42,
      ingestRunId: bulkIngestRun.id,
    });
    expect(finishIngestRun).toHaveBeenCalledWith(expect.objectContaining({
      id: bulkIngestRun.id,
      resourcesReceived: 2,
      resourcesStaged: 2,
      resourcesUpdated: 1,
      qdmBridge: {
        enabled: true,
        limit: 2,
        sourceSystem: 'ehr-bulk-data',
        failOnError: false,
      },
    }));
    const sqlText = mockSql.mock.calls.map((call) => (call[0] as TemplateStringsArray).join('')).join('\n');
    expect(sqlText).not.toContain('INSERT INTO phm_edw.patient');
    expect(sqlText).toContain('INSERT INTO phm_edw.ehr_bulk_import_file');
  });

  it('validates Bulk output checksum and size before completing the file ledger', async () => {
    const patient = JSON.stringify({
      resourceType: 'Patient',
      id: 'pat-1',
      name: [{ use: 'official', family: 'Bulk', given: ['Bryn'] }],
      birthDate: '1980-01-01',
    });
    const body = `${patient}\n`;
    const checksum = sha256Hex(body);
    const bytes = utf8ByteLength(body);
    const validatedManifest = {
      ...manifest,
      output: [{
        type: 'Patient',
        url: 'https://ehr.example.test/bulk/patient.ndjson',
        count: 1,
        checksum: `sha256:${checksum}`,
        size: bytes,
      }],
    };
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/fhir+ndjson' },
    }));
    const startIngestRun = vi.fn().mockResolvedValue(bulkIngestRun);
    const stageFhirResource = vi.fn().mockResolvedValue({ id: 1001 });
    const drainStagedRunToEdw = vi.fn().mockResolvedValue(bulkEdwHydration);
    const finishIngestRun = vi.fn().mockResolvedValue({
      run: { ...bulkIngestRun, status: 'succeeded' },
      qdmBridge: null,
    });
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('UPDATE phm_edw.ehr_bulk_job')) {
        return Promise.resolve([
          bulkJobRow({
            status: 'completed',
            manifest: validatedManifest,
            output_files: validatedManifest.output,
            ingest_run_id: bulkIngestRun.id,
            resource_types: ['Patient'],
          }),
        ]);
      }
      if (text.includes('INSERT INTO phm_edw.ehr_bulk_import_file')) {
        return Promise.resolve([{ id: '00000000-0000-4000-8000-000000000086' }]);
      }
      if (text.includes("SET status = 'completed'")) {
        return Promise.resolve([{ id: '00000000-0000-4000-8000-000000000086' }]);
      }
      return Promise.resolve([]);
    });

    const result = await importBulkExportJob({
      tenant,
      job: ehrBulkJob({
        manifest: validatedManifest,
        outputFiles: validatedManifest.output,
        resourceTypes: ['Patient'],
      }),
      manifest: validatedManifest,
      token,
      fetchImpl: fetchMock,
      startIngestRun,
      stageFhirResource,
      drainStagedRunToEdw,
      finishIngestRun,
    });

    expect(result.files[0]).toMatchObject({
      status: 'completed',
      bytesRead: bytes,
      checksumSha256: checksum,
      rowsRead: 1,
      resourcesStaged: 1,
    });
    const completedCall = mockSql.mock.calls.find((call) => (
      (call[0] as TemplateStringsArray).join('').includes("SET status = 'completed'")
    ));
    const completedValues = JSON.stringify(completedCall?.slice(1));
    expect(completedValues).toContain(checksum);
    expect(completedValues).toContain(`"bytesRead":${bytes}`);
    expect(completedValues).toContain(`"expectedSize":${bytes}`);
  });

  it('fails a Bulk output with a checksum mismatch and skips EDW hydration', async () => {
    const patient = JSON.stringify({
      resourceType: 'Patient',
      id: 'pat-1',
      name: [{ use: 'official', family: 'Bulk', given: ['Bryn'] }],
      birthDate: '1980-01-01',
    });
    const body = `${patient}\n`;
    const actualChecksum = sha256Hex(body);
    const bytes = utf8ByteLength(body);
    const expectedChecksum = '0'.repeat(64);
    const badChecksumManifest = {
      ...manifest,
      output: [{
        type: 'Patient',
        url: 'https://ehr.example.test/bulk/patient.ndjson',
        count: 1,
        checksum: `sha256:${expectedChecksum}`,
        size: bytes,
      }],
    };
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/fhir+ndjson' },
    }));
    const startIngestRun = vi.fn().mockResolvedValue(bulkIngestRun);
    const stageFhirResource = vi.fn().mockResolvedValue({ id: 1001 });
    const drainStagedRunToEdw = vi.fn();
    const finishIngestRun = vi.fn();
    const failIngestRun = vi.fn().mockResolvedValue({ ...bulkIngestRun, status: 'failed' });
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('UPDATE phm_edw.ehr_bulk_job')) {
        return Promise.resolve([
          bulkJobRow({
            status: 'completed',
            manifest: badChecksumManifest,
            output_files: badChecksumManifest.output,
            ingest_run_id: bulkIngestRun.id,
            resource_types: ['Patient'],
          }),
        ]);
      }
      if (text.includes('INSERT INTO phm_edw.ehr_bulk_import_file') || text.includes("SET status = 'failed'")) {
        return Promise.resolve([{ id: '00000000-0000-4000-8000-000000000086' }]);
      }
      return Promise.resolve([]);
    });

    const result = await importBulkExportJob({
      tenant,
      job: ehrBulkJob({
        manifest: badChecksumManifest,
        outputFiles: badChecksumManifest.output,
        resourceTypes: ['Patient'],
      }),
      manifest: badChecksumManifest,
      token,
      fetchImpl: fetchMock,
      startIngestRun,
      stageFhirResource,
      drainStagedRunToEdw,
      finishIngestRun,
      failIngestRun,
    });

    expect(result.resourcesFailed).toBe(1);
    expect(result.files[0]).toMatchObject({
      status: 'failed',
      rowsRead: 1,
      resourcesStaged: 1,
      bytesRead: bytes,
      checksumSha256: actualChecksum,
    });
    expect(result.files[0]?.errorMessage).toContain('checksum mismatch');
    expect(drainStagedRunToEdw).not.toHaveBeenCalled();
    expect(finishIngestRun).not.toHaveBeenCalled();
    expect(failIngestRun).toHaveBeenCalledWith(expect.objectContaining({
      resourcesReceived: 1,
      resourcesStaged: 1,
      errorCount: 1,
    }));
    const failedCall = mockSql.mock.calls.find((call) => (
      (call[0] as TemplateStringsArray).join('').includes("SET status = 'failed'")
    ));
    const failedValues = JSON.stringify(failedCall?.slice(1));
    expect(failedValues).toContain(actualChecksum);
    expect(failedValues).toContain(expectedChecksum);
  });

  it('fails the ingest run when an output file has invalid resource content', async () => {
    const badManifest = {
      ...manifest,
      output: [{ type: 'Observation', url: 'https://ehr.example.test/bulk/bad.ndjson', count: 1 }],
    };
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      new Response(`${JSON.stringify({ resourceType: 'Patient', id: 'pat-1' })}\n`, {
        status: 200,
        headers: { 'content-type': 'application/fhir+ndjson' },
      }),
    );
    const startIngestRun = vi.fn().mockResolvedValue(bulkIngestRun);
    const stageFhirResource = vi.fn();
    const drainStagedRunToEdw = vi.fn().mockResolvedValue(null);
    const finishIngestRun = vi.fn();
    const failIngestRun = vi.fn().mockResolvedValue({ ...bulkIngestRun, status: 'failed' });
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('UPDATE phm_edw.ehr_bulk_job')) {
        return Promise.resolve([
          bulkJobRow({
            status: 'completed',
            manifest: badManifest,
            output_files: badManifest.output,
            ingest_run_id: bulkIngestRun.id,
          }),
        ]);
      }
      if (text.includes('INSERT INTO phm_edw.ehr_bulk_import_file') || text.includes("SET status = 'failed'")) {
        return Promise.resolve([{ id: '00000000-0000-4000-8000-000000000086' }]);
      }
      return Promise.resolve([]);
    });

    const result = await importBulkExportJob({
      tenant,
      job: {
        ...bulkJobRow({ status: 'completed', manifest: badManifest, output_files: badManifest.output }),
        id: jobId,
        orgId: 7,
        ehrTenantId: 42,
        ingestRunId: null,
        exportLevel: 'group',
        groupId: 'group-1',
        patientId: null,
        resourceTypes: ['Observation'],
        typeFilters: [],
        requestUrl: badManifest.request,
        statusUrl: 'https://ehr.example.test/bulk/status/abc',
        outputFiles: badManifest.output,
        retryAfterSeconds: null,
        pollCount: 2,
        metadata: {},
        createdAt: '2026-06-17 12:00:00+00',
        updatedAt: '2026-06-17 12:05:00+00',
      },
      token,
      fetchImpl: fetchMock,
      startIngestRun,
      stageFhirResource,
      drainStagedRunToEdw,
      finishIngestRun,
      failIngestRun,
    });

    expect(result.resourcesFailed).toBe(1);
    expect(result.files[0]).toMatchObject({
      status: 'failed',
      rowsRead: 1,
      resourcesStaged: 0,
    });
    expect(stageFhirResource).not.toHaveBeenCalled();
    expect(finishIngestRun).not.toHaveBeenCalled();
    expect(failIngestRun).toHaveBeenCalledWith(expect.objectContaining({
      id: bulkIngestRun.id,
      resourcesReceived: 1,
      resourcesStaged: 0,
      errorCount: 1,
    }));
  });

  it('skips previously completed files during failed-import resume', async () => {
    const resumeManifest = {
      ...manifest,
      output: [{ type: 'Patient', url: 'https://ehr.example.test/bulk/patient.ndjson', count: 2 }],
    };
    const fetchMock = vi.fn<FetchLike>();
    const startIngestRun = vi.fn().mockResolvedValue(bulkIngestRun);
    const finishIngestRun = vi.fn().mockResolvedValue({
      run: { ...bulkIngestRun, status: 'succeeded' },
      qdmBridge: null,
    });
    const drainStagedRunToEdw = vi.fn();
    const stageFhirResource = vi.fn();
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('UPDATE phm_edw.ehr_bulk_job')) {
        return Promise.resolve([
          bulkJobRow({
            status: 'completed',
            manifest: resumeManifest,
            output_files: resumeManifest.output,
            ingest_run_id: bulkIngestRun.id,
          }),
        ]);
      }
      if (text.includes('FROM phm_edw.ehr_bulk_import_file')) {
        return Promise.resolve([
          bulkImportFileRow({
            resource_type: 'Patient',
            status: 'completed',
            rows_read: 2,
            resources_staged: 2,
          }),
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await importBulkExportJob({
      tenant,
      job: ehrBulkJob({
        manifest: resumeManifest,
        outputFiles: resumeManifest.output,
        resourceTypes: ['Patient'],
      }),
      manifest: resumeManifest,
      token,
      fetchImpl: fetchMock,
      resumeFailedOnly: true,
      startIngestRun,
      stageFhirResource,
      drainStagedRunToEdw,
      finishIngestRun,
    });

    expect(result).toMatchObject({
      resourcesRead: 0,
      resourcesStaged: 0,
      resourcesFailed: 0,
      files: [
        { resourceType: 'Patient', rowsRead: 0, resourcesStaged: 0, status: 'skipped' },
      ],
      edwHydration: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stageFhirResource).not.toHaveBeenCalled();
    expect(drainStagedRunToEdw).not.toHaveBeenCalled();
    expect(finishIngestRun).toHaveBeenCalledWith(expect.objectContaining({
      id: bulkIngestRun.id,
      resourcesReceived: 0,
      resourcesStaged: 0,
      errorCount: 0,
    }));
    const sqlText = mockSql.mock.calls.map((call) => (call[0] as TemplateStringsArray).join('')).join('\n');
    expect(sqlText).toContain('FROM phm_edw.ehr_bulk_import_file');
    expect(sqlText).not.toContain('INSERT INTO phm_edw.ehr_bulk_import_file');
  });

  it('rejects tokenless manifest output URLs outside the tenant/status origins before fetch', async () => {
    const publicManifest = {
      ...manifest,
      requiresAccessToken: false,
      output: [{ type: 'Patient', url: 'https://evil.example.test/bulk/patient.ndjson', count: 1 }],
    };
    const fetchMock = vi.fn<FetchLike>();
    const startIngestRun = vi.fn().mockResolvedValue(bulkIngestRun);
    const failIngestRun = vi.fn().mockResolvedValue({ ...bulkIngestRun, status: 'failed' });
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('UPDATE phm_edw.ehr_bulk_job')) {
        return Promise.resolve([
          bulkJobRow({
            status: 'completed',
            manifest: publicManifest,
            output_files: publicManifest.output,
            ingest_run_id: bulkIngestRun.id,
          }),
        ]);
      }
      if (text.includes('INSERT INTO phm_edw.ehr_bulk_import_file') || text.includes("SET status = 'failed'")) {
        return Promise.resolve([{ id: '00000000-0000-4000-8000-000000000086' }]);
      }
      return Promise.resolve([]);
    });

    const result = await importBulkExportJob({
      tenant,
      job: ehrBulkJob({
        manifest: publicManifest,
        outputFiles: publicManifest.output,
        resourceTypes: ['Patient'],
      }),
      fetchImpl: fetchMock,
      startIngestRun,
      failIngestRun,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.resourcesFailed).toBe(1);
    expect(result.files[0]).toMatchObject({
      status: 'failed',
      rowsRead: 0,
      resourcesStaged: 0,
    });
    expect(result.files[0]?.errorMessage).toContain('origin does not match');
    expect(failIngestRun).toHaveBeenCalledWith(expect.objectContaining({
      errorCount: 1,
    }));
  });
});

  describe('parseBulkManifest', () => {
    it('validates Bulk Data manifest shape', () => {
      expect(parseBulkManifest(manifest).output).toHaveLength(2);
      expect(parseBulkManifest({
        ...manifest,
        output: [{ type: 'Patient', url: 'https://ehr.example.test/bulk/patient.ndjson', checksum: 'a'.repeat(64), size: 12 }],
      }).output[0]).toMatchObject({ checksum: 'a'.repeat(64), size: 12 });
      expect(() => parseBulkManifest({ ...manifest, output: [{ type: 'Patient' }] })).toThrow(
        'output[0].url',
      );
      expect(() => parseBulkManifest({
        ...manifest,
        output: [{ type: 'Patient', url: 'https://ehr.example.test/bulk/patient.ndjson', size: -1 }],
      })).toThrow('output[0].size');
    });
  });

  describe('processBulkDeletions + extractDeletedReferences', () => {
    it('extracts DELETE entries and ignores non-deletions / malformed entries', () => {
      const bundle = {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          { request: { method: 'DELETE', url: 'Condition/cond-1' } },
          { request: { method: 'DELETE', url: 'https://ehr.example.test/fhir/R4/Observation/obs-9' } },
          { request: { method: 'POST', url: 'Patient/should-ignore' } },
          { request: { url: 'NoMethod/x' } },
          { note: 'no request' },
        ],
      } as unknown as FhirResource;

      expect(extractDeletedReferences(bundle)).toEqual([
        { resourceType: 'Condition', id: 'cond-1' },
        { resourceType: 'Observation', id: 'obs-9' },
      ]);
    });

    it('soft-deletes each referenced resource via the crosswalk', async () => {
      const ndjson = `${JSON.stringify({
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          { request: { method: 'DELETE', url: 'Condition/cond-1' } },
          { request: { method: 'DELETE', url: 'MedicationRequest/med-7' } },
        ],
      })}\n`;
      const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
        new Response(ndjson, { status: 200, headers: { 'content-type': 'application/fhir+ndjson' } }),
      );
      const softDeleteByCrosswalk = vi.fn(async () => true);

      const result = await processBulkDeletions({
        tenant,
        job: { statusUrl: 'https://ehr.example.test/status', requestUrl: 'https://ehr.example.test/req' } as never,
        manifest: {
          ...manifest,
          deleted: [{ type: 'Bundle', url: 'https://ehr.example.test/bulk/deleted.ndjson' }],
        } as never,
        token,
        fetchImpl: fetchMock,
        softDeleteByCrosswalk,
      });

      expect(result).toEqual({ filesProcessed: 1, entriesSeen: 2, softDeleted: 2, errorCount: 0 });
      expect(softDeleteByCrosswalk).toHaveBeenCalledWith(42, 'Condition', 'cond-1', 'bulk-deleted');
      expect(softDeleteByCrosswalk).toHaveBeenCalledWith(42, 'MedicationRequest', 'med-7', 'bulk-deleted');
    });

    it('counts a file error without throwing when the deleted-output fetch fails', async () => {
      const fetchMock = vi.fn<FetchLike>().mockResolvedValue(new Response('nope', { status: 500 }));
      const softDeleteByCrosswalk = vi.fn(async () => true);

      const result = await processBulkDeletions({
        tenant,
        job: {} as never,
        manifest: {
          ...manifest,
          deleted: [{ type: 'Bundle', url: 'https://ehr.example.test/bulk/deleted.ndjson' }],
        } as never,
        token,
        fetchImpl: fetchMock,
        softDeleteByCrosswalk,
      });

      expect(result.errorCount).toBe(1);
      expect(result.softDeleted).toBe(0);
      expect(softDeleteByCrosswalk).not.toHaveBeenCalled();
    });
  });
