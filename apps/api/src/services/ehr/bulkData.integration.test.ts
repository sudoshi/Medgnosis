import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchLike } from './types.js';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  (fn as unknown as { json: (value: unknown) => unknown }).json = (value: unknown) => value;
  return { mockSql: fn };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  cancelBulkExportJob,
  importBulkExportJob,
  importCompletedBulkExportJob,
  kickoffBulkExport,
  pollBulkExportJob,
  type BulkManifest,
  type EhrBulkJob,
  type ImportBulkExportJobInput,
} from './bulkData.js';

const bulkJobId = '00000000-0000-4000-8000-000000000067';
const ingestRunId = '00000000-0000-4000-8000-000000000085';
const token = {
  accessToken: 'runtime-bulk-token',
  tokenType: 'Bearer',
  scope: 'system/Observation.rs',
};

interface MockBulkServer {
  baseUrl: string;
  requests: Array<{ method: string; url: string; authorization: string | null }>;
  close: () => Promise<void>;
}

function ingestRunRow(status: 'running' | 'succeeded' = 'running') {
  return {
    id: ingestRunId,
    org_id: 7,
    ehr_tenant_id: 42,
    resource_type: null,
    mode: 'bulk',
    status,
    requested_since: null,
    started_at: '2026-06-17 12:05:00+00',
    finished_at: status === 'succeeded' ? '2026-06-17 12:06:00+00' : null,
    resources_received: status === 'succeeded' ? 1 : 0,
    resources_staged: status === 'succeeded' ? 1 : 0,
    resources_updated: status === 'succeeded' ? 1 : 0,
    error_count: 0,
    error_message: null,
    errors: [],
    metadata: {},
    created_at: '2026-06-17 12:05:00+00',
    updated_at: '2026-06-17 12:06:00+00',
  };
}

function bulkJobRow(
  baseUrl: string,
  manifest: BulkManifest | null,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: bulkJobId,
    org_id: 7,
    ehr_tenant_id: 42,
    ingest_run_id: null,
    export_level: 'group',
    group_id: 'group-1',
    patient_id: null,
    status: 'accepted',
    resource_types: ['Observation'],
    since: null,
    type_filters: [],
    request_url: `${baseUrl}/fhir/R4/Group/group-1/$export?_type=Observation`,
    status_url: `${baseUrl}/bulk/status/abc`,
    manifest,
    output_files: manifest?.output ?? [],
    error: null,
    retry_after_seconds: 1,
    poll_count: 0,
    requested_at: '2026-06-17 12:00:00+00',
    next_poll_at: '2026-06-17 12:01:00+00',
    completed_at: null,
    metadata: {},
    created_at: '2026-06-17 12:00:00+00',
    updated_at: '2026-06-17 12:00:00+00',
    ...overrides,
  };
}

function asEhrBulkJob(baseUrl: string, manifest: BulkManifest): EhrBulkJob {
  return {
    id: bulkJobId,
    orgId: 7,
    ehrTenantId: 42,
    ingestRunId: null,
    exportLevel: 'group',
    groupId: 'group-1',
    patientId: null,
    status: 'completed',
    resourceTypes: ['Observation'],
    since: null,
    typeFilters: [],
    requestUrl: `${baseUrl}/fhir/R4/Group/group-1/$export?_type=Observation`,
    statusUrl: `${baseUrl}/bulk/status/abc`,
    manifest,
    outputFiles: manifest.output,
    error: null,
    retryAfterSeconds: null,
    pollCount: 2,
    requestedAt: '2026-06-17 12:00:00+00',
    nextPollAt: null,
    completedAt: '2026-06-17 12:03:00+00',
    metadata: {},
    createdAt: '2026-06-17 12:00:00+00',
    updatedAt: '2026-06-17 12:03:00+00',
  };
}

function writeJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function writeText(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

async function startMockBulkServer(): Promise<MockBulkServer> {
  const requests: MockBulkServer['requests'] = [];
  let baseUrl = '';
  let statusPolls = 0;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';
    requests.push({
      method,
      url,
      authorization: typeof req.headers.authorization === 'string' ? req.headers.authorization : null,
    });

    if (method === 'GET' && url.startsWith('/fhir/R4/Group/group-1/$export')) {
      writeText(res, 202, '', {
        'content-location': `${baseUrl}/bulk/status/abc`,
        'retry-after': '1',
      });
      return;
    }

    if (method === 'GET' && url === '/bulk/status/abc') {
      statusPolls += 1;
      if (statusPolls === 1) {
        writeText(res, 202, '', { 'retry-after': '2' });
        return;
      }
      writeJson(res, 200, {
        transactionTime: '2026-06-17T12:03:00Z',
        request: `${baseUrl}/fhir/R4/Group/group-1/$export?_type=Observation`,
        requiresAccessToken: true,
        output: [
          {
            type: 'Observation',
            url: `${baseUrl}/bulk/observation.ndjson`,
            count: 1,
          },
        ],
      });
      return;
    }

    if (method === 'DELETE' && url === '/bulk/status/abc') {
      writeText(res, 202, '');
      return;
    }

    if (method === 'GET' && url === '/bulk/observation.ndjson') {
      writeText(
        res,
        200,
        `${JSON.stringify({
          resourceType: 'Observation',
          id: 'obs-1',
          status: 'final',
          code: { text: 'A1c' },
          subject: { reference: 'Patient/pat-1' },
          valueQuantity: { value: 7.1, unit: '%' },
        })}\n`,
        { 'content-type': 'application/fhir+ndjson' },
      );
      return;
    }

    writeJson(res, 404, { error: 'not_found' });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    requests,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

beforeEach(() => {
  mockSql.mockReset();
});

afterEach(() => {
  mockSql.mockReset();
});

describe('Bulk Data mock server integration', () => {
  it('runs kickoff, poll, completed import, and cancel against a local Bulk server', async () => {
    const server = await startMockBulkServer();
    const rawManifest: BulkManifest = {
      transactionTime: '2026-06-17T12:03:00Z',
      request: `${server.baseUrl}/fhir/R4/Group/group-1/$export?_type=Observation`,
      requiresAccessToken: true,
      output: [
        { type: 'Observation', url: `${server.baseUrl}/bulk/observation.ndjson`, count: 1 },
      ],
    };
    const redactedManifest: BulkManifest = {
      ...rawManifest,
      request: `${server.baseUrl}/__bulk_output__/requesthash`,
      output: [
        { type: 'Observation', url: `${server.baseUrl}/__bulk_output__/filehash`, count: 1 },
      ],
    };
    const tenant = {
      id: 42,
      orgId: 7,
      vendor: 'epic',
      fhirBaseUrl: `${server.baseUrl}/fhir/R4`,
    };
    const fetchImpl = globalThis.fetch.bind(globalThis) as FetchLike;
    const stageFhirResource = vi.fn().mockResolvedValue({ id: 'stage-1' });
    const hydrateStagedRunToEdw = vi.fn().mockResolvedValue({
      resourcesSeen: 1,
      resourcesHydrated: 1,
      resourcesSkipped: 0,
      resourcesFailed: 0,
      rowsInserted: 1,
      rowsUpdated: 0,
      byResourceType: { Observation: { seen: 1, hydrated: 1, skipped: 0, failed: 0 } },
      errors: [],
    });
    const finishIngestRun = vi.fn().mockResolvedValue({
      run: ingestRunRow('succeeded'),
      qdmBridge: {
        resourcesSeen: 1,
        resourcesNormalized: 1,
        resourcesSkipped: 0,
        resourcesFailed: 0,
        eventsUpserted: 1,
        errors: [],
      },
    });

    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('INSERT INTO phm_edw.ehr_bulk_job')) {
        return Promise.resolve([bulkJobRow(server.baseUrl, null)]);
      }
      if (text.includes("SET status = 'in_progress'")) {
        return Promise.resolve([bulkJobRow(server.baseUrl, null, {
          status: 'in_progress',
          retry_after_seconds: 2,
          poll_count: 1,
        })]);
      }
      if (text.includes('UPDATE phm_edw.ehr_bulk_job') && text.includes("SET status = 'completed'")) {
        return Promise.resolve([bulkJobRow(server.baseUrl, redactedManifest, {
          status: 'completed',
          output_files: redactedManifest.output,
          retry_after_seconds: null,
          poll_count: 2,
          next_poll_at: null,
          completed_at: '2026-06-17 12:03:00+00',
        })]);
      }
      if (text.includes("SET status = 'canceled'")) {
        return Promise.resolve([bulkJobRow(server.baseUrl, null, {
          status: 'canceled',
          next_poll_at: null,
          completed_at: '2026-06-17 12:04:00+00',
          metadata: { cancel: { triggeredBy: 'manual' } },
        })]);
      }
      if (text.includes('INSERT INTO phm_edw.ehr_ingest_run')) {
        return Promise.resolve([ingestRunRow('running')]);
      }
      if (text.includes('SET ingest_run_id')) {
        return Promise.resolve([bulkJobRow(server.baseUrl, redactedManifest, {
          status: 'completed',
          ingest_run_id: ingestRunId,
          output_files: redactedManifest.output,
          completed_at: '2026-06-17 12:03:00+00',
        })]);
      }
      if (text.includes('INSERT INTO phm_edw.ehr_bulk_import_file')) {
        return Promise.resolve([{ id: '00000000-0000-4000-8000-000000000086' }]);
      }
      if (text.includes('UPDATE phm_edw.ehr_bulk_import_file')) {
        return Promise.resolve([{ id: '00000000-0000-4000-8000-000000000086' }]);
      }
      return Promise.resolve([]);
    });

    try {
      const kickoffJob = await kickoffBulkExport({
        tenant,
        token,
        exportLevel: 'group',
        groupId: 'group-1',
        resourceTypes: ['Observation'],
        fetchImpl,
      });
      const inProgressJob = await pollBulkExportJob({ job: kickoffJob, token, fetchImpl });
      const completedJob = await pollBulkExportJob({ job: inProgressJob, token, fetchImpl });
      const importResult = await importCompletedBulkExportJob(
        {
          ehrTenantId: 42,
          bulkJobId,
          fetchImpl,
        },
        {
          loadBackendServicesConfig: vi.fn().mockResolvedValue({
            tenant,
            clientRegistrationId: 99,
            clientId: 'backend-client',
            authMethod: 'client_secret_basic',
            clientSecretRef: 'env:EHR_BACKEND_SECRET',
            jwksUrl: null,
            privateKeyRef: null,
            scopesRequested: 'system/Observation.rs',
            scopesGranted: 'system/Observation.rs',
            tokenEndpoint: `${server.baseUrl}/oauth/token`,
          }),
          requestBackendServiceToken: vi.fn().mockResolvedValue({
            accessToken: token,
            tokenResponse: {
              access_token: token.accessToken,
              token_type: token.tokenType,
              scope: token.scope,
              expires_in: 300,
            },
            tokenMetadata: null,
          }),
          getBulkJob: vi.fn().mockResolvedValue(asEhrBulkJob(server.baseUrl, redactedManifest)),
          importBulkExportJob: (input: ImportBulkExportJobInput) => importBulkExportJob({
            ...input,
            startIngestRun: vi.fn().mockResolvedValue(ingestRunRow('running')),
            stageFhirResource,
            hydrateStagedRunToEdw,
            finishIngestRun,
          }),
        },
      );
      const canceledJob = await cancelBulkExportJob({
        job: {
          ...asEhrBulkJob(server.baseUrl, rawManifest),
          status: 'in_progress',
          completedAt: null,
          nextPollAt: '2026-06-17 12:10:00+00',
        },
        token,
        metadata: { triggeredBy: 'manual' },
        fetchImpl,
      });

      expect(kickoffJob.status).toBe('accepted');
      expect(inProgressJob.status).toBe('in_progress');
      expect(completedJob.status).toBe('completed');
      expect(completedJob.outputFiles[0]?.url).toContain('/__bulk_output__/');
      expect(importResult).toMatchObject({
        resourcesRead: 1,
        resourcesStaged: 1,
        resourcesFailed: 0,
      });
      expect(importResult.files[0]).toMatchObject({
        resourceType: 'Observation',
        rowsRead: 1,
        resourcesStaged: 1,
        status: 'completed',
      });
      expect(stageFhirResource).toHaveBeenCalledWith(expect.objectContaining({
        ehrTenantId: 42,
        ingestRunId,
        resource: expect.objectContaining({ resourceType: 'Observation', id: 'obs-1' }),
      }));
      expect(canceledJob.status).toBe('canceled');
      expect(server.requests).toEqual(expect.arrayContaining([
        expect.objectContaining({ method: 'GET', url: expect.stringContaining('/$export') }),
        expect.objectContaining({ method: 'GET', url: '/bulk/status/abc' }),
        expect.objectContaining({ method: 'GET', url: '/bulk/observation.ndjson' }),
        expect.objectContaining({ method: 'DELETE', url: '/bulk/status/abc' }),
      ]));
      expect(server.requests.filter((request) => request.authorization === 'Bearer runtime-bulk-token')).toHaveLength(6);

      const persistedValues = JSON.stringify(mockSql.mock.calls.map((call) => call.slice(1)));
      expect(persistedValues).toContain('/__bulk_output__/');
      expect(persistedValues).not.toContain('/bulk/observation.ndjson');
      expect(persistedValues).not.toContain('runtime-bulk-token');
    } finally {
      await server.close();
    }
  });

  it('records a failed import file when the Bulk output endpoint returns an error', async () => {
    const server = await startMockBulkServer();
    const manifest: BulkManifest = {
      transactionTime: '2026-06-17T12:03:00Z',
      request: `${server.baseUrl}/fhir/R4/Group/group-1/$export?_type=Observation`,
      requiresAccessToken: true,
      output: [
        { type: 'Observation', url: `${server.baseUrl}/bulk/missing.ndjson`, count: 1 },
      ],
    };
    const tenant = {
      id: 42,
      orgId: 7,
      vendor: 'epic',
      fhirBaseUrl: `${server.baseUrl}/fhir/R4`,
    };
    const fetchImpl = globalThis.fetch.bind(globalThis) as FetchLike;
    const stageFhirResource = vi.fn().mockResolvedValue({ id: 'stage-1' });
    const failIngestRun = vi.fn().mockResolvedValue({
      ...ingestRunRow('succeeded'),
      status: 'failed',
      error_count: 1,
      error_message: 'Bulk Data import completed with 1 error(s)',
    });

    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('SET ingest_run_id')) {
        return Promise.resolve([bulkJobRow(server.baseUrl, manifest, {
          status: 'completed',
          ingest_run_id: ingestRunId,
          output_files: manifest.output,
          completed_at: '2026-06-17 12:03:00+00',
        })]);
      }
      if (text.includes('INSERT INTO phm_edw.ehr_bulk_import_file')) {
        return Promise.resolve([{ id: '00000000-0000-4000-8000-000000000087' }]);
      }
      if (text.includes('UPDATE phm_edw.ehr_bulk_import_file')) {
        return Promise.resolve([{ id: '00000000-0000-4000-8000-000000000087' }]);
      }
      return Promise.resolve([]);
    });

    try {
      const result = await importBulkExportJob({
        tenant,
        job: asEhrBulkJob(server.baseUrl, manifest),
        manifest,
        token,
        fetchImpl,
        startIngestRun: vi.fn().mockResolvedValue(ingestRunRow('running')),
        failIngestRun,
        stageFhirResource,
      });

      expect(result).toMatchObject({
        resourcesRead: 0,
        resourcesStaged: 0,
        resourcesFailed: 1,
      });
      expect(result.files[0]).toMatchObject({
        resourceType: 'Observation',
        rowsRead: 0,
        resourcesStaged: 0,
        errorCount: 1,
        status: 'failed',
        errorMessage: 'Bulk Data output fetch failed with HTTP 404',
      });
      expect(failIngestRun).toHaveBeenCalledWith(expect.objectContaining({
        errorCount: 1,
        errorMessage: 'Bulk Data import completed with 1 error(s)',
      }));
      expect(stageFhirResource).not.toHaveBeenCalled();
      expect(server.requests).toContainEqual(expect.objectContaining({
        method: 'GET',
        url: '/bulk/missing.ndjson',
        authorization: 'Bearer runtime-bulk-token',
      }));
    } finally {
      await server.close();
    }
  });
});
