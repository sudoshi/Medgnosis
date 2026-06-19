import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';
import type { FetchLike } from '../../services/ehr/types.js';

const {
  mockSql,
  normalizeStagedRunToQdm,
  loadQdmEventsToCqlEngine,
  cancelBulkExportJobWithBackendServices,
  listBulkSchedules,
  upsertBulkSchedule,
  BulkScheduleOwnershipError,
  enqueueEhrBulkExport,
  enqueueEhrBulkImport,
  enqueueSmartPatientContextRefresh,
  mockAuditLog,
} = vi.hoisted(() => {
  const fn = vi.fn();
  (fn as unknown as { json: (value: unknown) => unknown }).json = (value: unknown) => value;
  const normalizeStagedRunToQdm = vi.fn();
  const loadQdmEventsToCqlEngine = vi.fn();
  const cancelBulkExportJobWithBackendServices = vi.fn();
  const listBulkSchedules = vi.fn();
  const upsertBulkSchedule = vi.fn();
  class BulkScheduleOwnershipError extends Error {
    constructor() {
      super('Bulk schedule not found for tenant');
      this.name = 'BulkScheduleOwnershipError';
    }
  }
  const enqueueEhrBulkExport = vi.fn();
  const enqueueEhrBulkImport = vi.fn();
  const enqueueSmartPatientContextRefresh = vi.fn();
  const mockAuditLog = vi.fn();
  return {
    mockSql: fn,
    normalizeStagedRunToQdm,
    loadQdmEventsToCqlEngine,
    cancelBulkExportJobWithBackendServices,
    listBulkSchedules,
    upsertBulkSchedule,
    BulkScheduleOwnershipError,
    enqueueEhrBulkExport,
    enqueueEhrBulkImport,
    enqueueSmartPatientContextRefresh,
    mockAuditLog,
  };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../../services/ehr/qdmBridge.js', () => ({ normalizeStagedRunToQdm }));
vi.mock('../../services/qdm/index.js', () => ({ loadQdmEventsToCqlEngine }));
vi.mock('../../services/ehr/bulkData.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/ehr/bulkData.js')>();
  return { ...actual, cancelBulkExportJobWithBackendServices };
});
vi.mock('../../services/ehr/bulkSchedules.js', () => ({
  BulkScheduleOwnershipError,
  listBulkSchedules,
  upsertBulkSchedule,
  MIN_BULK_SCHEDULE_INTERVAL_MINUTES: 15,
  MAX_BULK_SCHEDULE_INTERVAL_MINUTES: 525600,
}));
vi.mock('../../workers/ehr-bulk-import.js', () => ({ enqueueEhrBulkExport, enqueueEhrBulkImport }));
vi.mock('../../workers/ehr-patient-context-refresh.js', () => ({ enqueueSmartPatientContextRefresh }));

import ehrRoutes from './index.js';

const ADMIN_USER: JwtPayload = {
  sub: 'admin-1',
  email: 'admin@example.test',
  role: 'admin',
  org_id: 'org-1',
};

const PROVIDER_USER: JwtPayload = {
  sub: 'provider-1',
  email: 'provider@example.test',
  role: 'provider',
  org_id: 'org-1',
  provider_id: 7,
};

const tenantRow = {
  id: 42,
  org_id: 7,
  vendor: 'epic',
  name: 'Acme Epic Sandbox',
  environment: 'sandbox',
  fhir_base_url: 'https://ehr.example.test/fhir',
  smart_config_url: 'https://issuer.example.test/.well-known/smart-configuration',
  issuer: 'https://issuer.example.test',
  audience: 'https://ehr.example.test/fhir',
  status: 'testing',
  created_at: '2026-06-16T12:00:00Z',
  updated_at: '2026-06-16T12:00:00Z',
} as const;

const clientRow = {
  id: 99,
  ehr_tenant_id: 42,
  client_type: 'smart_launch',
  client_slot: 'smart_launch',
  client_id: 'smart-client',
  client_secret_ref: 'env:EHR_SMART_CLIENT_SECRET',
  jwks_url: null,
  private_key_ref: null,
  redirect_uris: ['https://api.medgnosis.test/api/v1/ehr/launch/callback'],
  launch_url: 'https://api.medgnosis.test/api/v1/ehr/launch/42',
  scopes_requested: 'openid fhirUser launch patient/Patient.r',
  scopes_granted: 'openid fhirUser launch patient/Patient.r',
  auth_method: 'client_secret_basic',
  profile_id: 'epic-smart-r4',
  profile_version: '2026-06-17',
  portal_app_id: 'epic-app-1',
  approval_status: 'submitted',
  approval_evidence: { ticket: 'EPIC-1' },
  enabled: true,
  created_at: '2026-06-16T12:00:00Z',
  updated_at: '2026-06-16T12:00:00Z',
} as const;

const snapshotRow = {
  id: 12,
  ehr_tenant_id: 42,
  smart_configuration: {
    ok: true,
    summary: { authorizationEndpoint: 'https://issuer.example.test/oauth2/authorize' },
  },
  capability_statement: {
    ok: true,
    summary: { resourceTypes: ['Patient'] },
  },
  resource_support: {
    Patient: { interactions: ['read'], searchParams: [] },
  },
  captured_at: '2026-06-16T12:05:00Z',
} as const;

const ingestRunRow = {
  id: '00000000-0000-4000-8000-000000000063',
  org_id: 7,
  ehr_tenant_id: 42,
  resource_type: 'Observation',
  mode: 'manual',
  status: 'succeeded',
  requested_since: '2026-06-16 00:00:00+00',
  started_at: '2026-06-16 12:00:00+00',
  finished_at: '2026-06-16 12:05:00+00',
  resources_received: 12,
  resources_staged: 12,
  resources_updated: 10,
  error_count: 0,
  error_message: null,
  errors: [],
  metadata: {
    source: 'smart-patient-context-refresh',
    contextResources: { attempted: ['Observation'], received: 12, staged: 12 },
  },
  created_at: '2026-06-16 12:00:00+00',
  updated_at: '2026-06-16 12:05:00+00',
} as const;

const bulkJobRow = {
  id: '00000000-0000-4000-8000-000000000067',
  org_id: 7,
  ehr_tenant_id: 42,
  ingest_run_id: '00000000-0000-4000-8000-000000000063',
  export_level: 'group',
  group_id: 'group-1',
  patient_id: null,
  status: 'completed',
  resource_types: ['Patient', 'Observation'],
  since: '2026-06-16 00:00:00+00',
  type_filters: [],
  request_url: 'https://ehr.example.test/fhir/Group/group-1/$export',
  status_url: 'https://ehr.example.test/bulk/status/abc',
  manifest: {
    transactionTime: '2026-06-17T12:00:00Z',
    request: 'https://ehr.example.test/__bulk_output__/request',
    requiresAccessToken: true,
    output: [{ type: 'Patient', url: 'https://ehr.example.test/__bulk_output__/file', count: 1 }],
  },
  output_files: [{ type: 'Patient', url: 'https://ehr.example.test/__bulk_output__/file', count: 1 }],
  error: null,
  retry_after_seconds: null,
  poll_count: 3,
  requested_at: '2026-06-17 12:00:00+00',
  next_poll_at: null,
  completed_at: '2026-06-17 12:05:00+00',
  metadata: { source: 'ehr-bulk-data-orchestration' },
  created_at: '2026-06-17 12:00:00+00',
  updated_at: '2026-06-17 12:05:00+00',
} as const;

const bulkImportFileRow = {
  id: '00000000-0000-4000-8000-000000000086',
  bulk_job_id: '00000000-0000-4000-8000-000000000067',
  org_id: 7,
  ehr_tenant_id: 42,
  ingest_run_id: '00000000-0000-4000-8000-000000000063',
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
} as const;

const bulkSchedule = {
  id: '00000000-0000-4000-8000-000000000091',
  orgId: 7,
  ehrTenantId: 42,
  enabled: true,
  exportLevel: 'group',
  groupId: 'group-1',
  patientId: null,
  resourceTypes: ['Patient', 'Observation'],
  sinceMode: 'last_success',
  since: null,
  typeFilters: ['Observation?date=ge2026-01-01'],
  intervalMinutes: 1440,
  maxResourcesPerFile: 500,
  lastEnqueuedAt: '2026-06-17 12:00:00+00',
  lastQueueJobId: 'ehr-bulk-kickoff:42:abc',
  lastBulkJobId: '00000000-0000-4000-8000-000000000067',
  lastSuccessAt: '2026-06-17 12:10:00+00',
  lastFailureAt: null,
  lastError: null,
  nextRunAt: '2026-06-18 12:00:00+00',
  metadata: {},
  createdAt: '2026-06-17 11:00:00+00',
  updatedAt: '2026-06-17 12:10:00+00',
} as const;

const fetchMock = vi.fn<FetchLike>();

beforeEach(() => {
  mockSql.mockReset();
  normalizeStagedRunToQdm.mockReset();
  loadQdmEventsToCqlEngine.mockReset();
  cancelBulkExportJobWithBackendServices.mockReset();
  listBulkSchedules.mockReset();
  upsertBulkSchedule.mockReset();
  enqueueEhrBulkExport.mockReset();
  enqueueEhrBulkImport.mockReset();
  enqueueSmartPatientContextRefresh.mockReset();
  mockAuditLog.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EHR admin routes', () => {
  it('rejects non-admin users before listing tenants', async () => {
    const app = await buildApp(PROVIDER_USER);

    const res = await app.inject({ method: 'GET', url: '/api/ehr/admin/tenants' });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    await app.close();
  });

  it('lists EHR tenants for admin users with optional filters', async () => {
    mockSql.mockResolvedValueOnce([tenantRow]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/ehr/admin/tenants?vendor=epic&environment=sandbox&status=testing',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        count: 1,
        tenants: [
          {
            id: 42,
            vendor: 'epic',
            name: 'Acme Epic Sandbox',
            fhirBaseUrl: 'https://ehr.example.test/fhir',
            smartConfigUrl: 'https://issuer.example.test/.well-known/smart-configuration',
          },
        ],
      },
    });
    expect(mockSql.mock.calls[0]!.slice(1)).toEqual(
      expect.arrayContaining(['epic', 'sandbox', 'testing']),
    );
    await app.close();
  });

  it('rejects invalid tenant list filters', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/ehr/admin/tenants?vendor=unknown',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    await app.close();
  });

  it('creates or updates a tenant and client registrations without returning raw secret refs', async () => {
    mockSql
      .mockResolvedValueOnce([tenantRow])
      .mockResolvedValueOnce([clientRow]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants',
      payload: {
        tenant: {
          id: 42,
          orgId: 7,
          vendor: 'epic',
          name: 'Acme Epic Sandbox',
          environment: 'sandbox',
          fhirBaseUrl: 'https://ehr.example.test/fhir',
          smartConfigUrl: 'https://issuer.example.test/.well-known/smart-configuration',
          status: 'testing',
        },
        apiBaseUrl: 'https://api.medgnosis.test',
        smartLaunch: {
          clientId: 'smart-client',
          clientSecretRef: 'env:EHR_SMART_CLIENT_SECRET',
          authMethod: 'client_secret_basic',
          scopesRequested: 'openid fhirUser launch patient/Patient.r',
          approvalStatus: 'submitted',
          approvalEvidence: { ticket: 'EPIC-1' },
        },
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        tenant: {
          id: 42,
          vendor: 'epic',
          name: 'Acme Epic Sandbox',
        },
        clients: [
          {
            clientSlot: 'smart_launch',
            clientId: 'smart-client',
            authMethod: 'client_secret_basic',
            hasClientSecretRef: true,
            hasPrivateKeyRef: false,
          },
        ],
      },
    });
    expect(JSON.stringify(res.json())).not.toContain('EHR_SMART_CLIENT_SECRET');
    expect(mockSql.mock.calls[1]!.slice(1)).toEqual(
      expect.arrayContaining(['env:EHR_SMART_CLIENT_SECRET', 'client_secret_basic']),
    );
    await app.close();
  });

  it('rejects invalid tenant upsert payloads', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants',
      payload: {
        tenant: {
          vendor: 'epic',
          environment: 'sandbox',
          name: 'Missing FHIR URL',
        },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'tenant.fhirBaseUrl is required' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns tenant details, sanitized client registrations, latest snapshot, and readiness', async () => {
    mockSql
      .mockResolvedValueOnce([tenantRow])
      .mockResolvedValueOnce([clientRow])
      .mockResolvedValueOnce([snapshotRow]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/ehr/admin/tenants/42',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        tenant: {
          id: 42,
          vendor: 'epic',
        },
        clientRegistrations: [
          {
            clientSlot: 'smart_launch',
            authMethod: 'client_secret_basic',
            hasClientSecretRef: true,
          },
        ],
        latestCapabilitySnapshot: {
          id: 12,
          ehrTenantId: 42,
        },
        readiness: {
          clients: [
            {
              clientSlot: 'smart_launch',
              status: 'ready',
              missing: [],
            },
          ],
        },
      },
    });
    expect(JSON.stringify(res.json())).not.toContain('EHR_SMART_CLIENT_SECRET');
    await app.close();
  });

  it('returns the latest stored capability snapshot for a tenant', async () => {
    mockSql
      .mockResolvedValueOnce([tenantRow])
      .mockResolvedValueOnce([snapshotRow]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/ehr/admin/tenants/42/capabilities',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        tenant: {
          id: 42,
          vendor: 'epic',
        },
        latestCapabilitySnapshot: {
          id: 12,
          ehrTenantId: 42,
        },
        resourceSupport: {
          Patient: { interactions: ['read'] },
        },
      },
    });
    await app.close();
  });

  it('lists recent EHR ingest runs for tenant sync visibility', async () => {
    mockSql
      .mockResolvedValueOnce([tenantRow])
      .mockResolvedValueOnce([ingestRunRow]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/ehr/admin/tenants/42/ingest-runs?status=succeeded&mode=manual&resourceType=Observation&limit=5',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        tenant: { id: 42, orgId: 7 },
        count: 1,
        latest: {
          id: ingestRunRow.id,
          status: 'succeeded',
          mode: 'manual',
          resourceType: 'Observation',
          resourcesReceived: 12,
          resourcesStaged: 12,
          resourcesUpdated: 10,
        },
        ingestRuns: [
          {
            id: ingestRunRow.id,
            status: 'succeeded',
            metadata: {
              source: 'smart-patient-context-refresh',
            },
          },
        ],
      },
    });
    expect(mockSql.mock.calls[1]!.slice(1)).toEqual(
      expect.arrayContaining([
        42,
        'succeeded',
        'succeeded',
        'manual',
        'manual',
        'Observation',
        'Observation',
        5,
      ]),
    );
    await app.close();
  });

  it('rejects invalid EHR ingest run list filters before tenant lookup', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/ehr/admin/tenants/42/ingest-runs?status=stale',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST', message: "Unsupported ingest run status 'stale'" },
    });
    expect(mockSql).not.toHaveBeenCalled();
    await app.close();
  });

  it('builds a vendor onboarding profile for admin users', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/ehr/admin/onboarding-profile?vendor=oracle_cerner&environment=sandbox&name=Oracle%20Sandbox&fhirBaseUrl=https%3A%2F%2Fcerner.example.test%2Fr4&apiBaseUrl=https%3A%2F%2Fapi.medgnosis.test&tenantId=42&smartClientId=smart-client',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        profile: {
          tenant: {
            vendor: 'oracle_cerner',
            name: 'Oracle Sandbox',
            fhirBaseUrl: 'https://cerner.example.test/r4',
          },
          endpoints: {
            smartLaunchUrl: 'https://api.medgnosis.test/api/v1/ehr/launch/42',
            backendJwksUrl: 'https://api.medgnosis.test/.well-known/jwks.json',
          },
          clientRegistrations: {
            smartLaunch: {
              clientId: 'smart-client',
              redirectUris: ['https://api.medgnosis.test/api/v1/ehr/launch/callback'],
            },
          },
        },
      },
    });
    expect(mockSql).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects invalid onboarding profile inputs', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/ehr/admin/onboarding-profile?vendor=unknown&fhirBaseUrl=https%3A%2F%2Fehr.example.test%2Fr4',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST' },
    });
    await app.close();
  });

  it('runs SMART diagnostics for one tenant', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.ehr_tenant') && text.includes('WHERE id =')) {
        return Promise.resolve(values.includes(42) ? [tenantRow] : []);
      }
      if (text.includes('INSERT INTO phm_edw.ehr_capability_snapshot')) {
        return Promise.resolve([snapshotRow]);
      }
      return Promise.resolve([]);
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(smartConfiguration()))
      .mockResolvedValueOnce(jsonResponse(capabilityStatement()));
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/ehr/admin/tenants/42/diagnostics',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        tenant: {
          id: 42,
          vendor: 'epic',
        },
        diagnostics: {
          smartConfiguration: { ok: true, status: 200 },
          capabilityStatement: { ok: true, status: 200 },
          support: {
            endpoints: { authorization: true, token: true },
            launch: {
              ehr: true,
              patientContext: { ehr: true },
            },
            cdsHooks: {
              advertised: true,
              endpoint: 'https://ehr.example.test/cds-services',
            },
          },
        },
        snapshot: {
          id: 12,
          ehrTenantId: 42,
        },
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://issuer.example.test/.well-known/smart-configuration',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ehr.example.test/fhir/metadata',
      expect.objectContaining({ method: 'GET' }),
    );
    await app.close();
  });

  it('runs SMART discovery through the POST discover alias', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.ehr_tenant') && text.includes('WHERE id =')) {
        return Promise.resolve(values.includes(42) ? [tenantRow] : []);
      }
      if (text.includes('INSERT INTO phm_edw.ehr_capability_snapshot')) {
        return Promise.resolve([snapshotRow]);
      }
      return Promise.resolve([]);
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(smartConfiguration()))
      .mockResolvedValueOnce(jsonResponse(capabilityStatement()));
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/discover',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        snapshot: {
          id: 12,
          ehrTenantId: 42,
        },
      },
    });
    await app.close();
  });

  it('returns 404 when diagnostics target an unknown tenant', async () => {
    mockSql.mockResolvedValueOnce([]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/ehr/admin/tenants/999/diagnostics',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('enqueues a manual SMART patient-context refresh for a tenant', async () => {
    mockSql.mockResolvedValueOnce([tenantRow]);
    enqueueSmartPatientContextRefresh.mockResolvedValueOnce({
      enqueued: true,
      queueName: 'medgnosis-ehr-patient-context-refresh',
      jobId: 'smart-patient-context-refresh:42:pat-1:manual',
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/patient-context-refresh',
      payload: {
        patientResourceId: 'pat-1',
        localPatientId: 123,
        requestedSince: '2026-06-01T00:00:00Z',
        resourceTypes: ['Encounter', 'Observation'],
        pageSize: 25,
        maxPages: 3,
      },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        tenant: { id: 42, orgId: 7 },
        refresh: {
          enqueued: true,
          queueName: 'medgnosis-ehr-patient-context-refresh',
          jobId: 'smart-patient-context-refresh:42:pat-1:manual',
        },
      },
    });
    expect(enqueueSmartPatientContextRefresh).toHaveBeenCalledWith({
      ehrTenantId: 42,
      orgId: 7,
      triggeredBy: 'manual',
      patientResourceId: 'pat-1',
      localPatientId: 123,
      requestedSince: '2026-06-01T00:00:00.000Z',
      resourceTypes: ['Encounter', 'Observation'],
      pageSize: 25,
      maxPages: 3,
    });
    await app.close();
  });

  it('rejects invalid manual patient-context refresh inputs before tenant lookup', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/patient-context-refresh',
      payload: { patientResourceId: 'pat-1', maxPages: 0 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'maxPages must be a positive integer' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    expect(enqueueSmartPatientContextRefresh).not.toHaveBeenCalled();
    await app.close();
  });

  it('lists tenant Bulk Data jobs with redacted file-level import status', async () => {
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('FROM phm_edw.ehr_tenant') && text.includes('WHERE id =')) {
        return Promise.resolve([tenantRow]);
      }
      if (text.includes('FROM phm_edw.ehr_bulk_job')) {
        return Promise.resolve([bulkJobRow]);
      }
      if (text.includes('FROM phm_edw.ehr_bulk_import_file')) {
        return Promise.resolve([bulkImportFileRow]);
      }
      return Promise.resolve([]);
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/ehr/admin/tenants/42/bulk-jobs?limit=5&status=completed',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        tenant: { id: 42, orgId: 7 },
        count: 1,
        latest: {
          id: '00000000-0000-4000-8000-000000000067',
          status: 'completed',
          importFiles: [
            {
              resourceType: 'Patient',
              status: 'completed',
              rowsRead: 1,
              resourcesStaged: 1,
            },
          ],
        },
      },
    });
    const body = JSON.stringify(res.json());
    expect(body).toContain('__bulk_output__');
    expect(body).not.toContain('/bulk/status/abc');
    await app.close();
  });

  it('lists tenant Bulk Data schedules with last-success visibility', async () => {
    mockSql.mockResolvedValueOnce([tenantRow]);
    listBulkSchedules.mockResolvedValueOnce([bulkSchedule]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/ehr/admin/tenants/42/bulk-schedules',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        tenant: { id: 42, orgId: 7 },
        count: 1,
        latest: {
          id: '00000000-0000-4000-8000-000000000091',
          enabled: true,
          exportLevel: 'group',
          lastSuccessAt: '2026-06-17 12:10:00+00',
          nextRunAt: '2026-06-18 12:00:00+00',
        },
        bulkSchedules: [
          {
            id: '00000000-0000-4000-8000-000000000091',
            sinceMode: 'last_success',
            intervalMinutes: 1440,
          },
        ],
      },
    });
    expect(listBulkSchedules).toHaveBeenCalledWith({ ehrTenantId: 42 });
    await app.close();
  });

  it('upserts a tenant Bulk Data schedule with PHI-safe audit metadata', async () => {
    mockSql.mockResolvedValueOnce([tenantRow]);
    upsertBulkSchedule.mockResolvedValueOnce(bulkSchedule);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/bulk-schedules',
      payload: {
        exportLevel: 'group',
        groupId: 'group-1',
        resourceTypes: ['Patient', 'Observation'],
        sinceMode: 'last_success',
        typeFilters: ['Observation?date=ge2026-01-01'],
        intervalMinutes: 1440,
        maxResourcesPerFile: 500,
        nextRunAt: '2026-06-18T12:00:00Z',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        tenant: { id: 42, orgId: 7 },
        bulkSchedule: {
          id: '00000000-0000-4000-8000-000000000091',
          intervalMinutes: 1440,
          nextRunAt: '2026-06-18 12:00:00+00',
        },
      },
    });
    expect(upsertBulkSchedule).toHaveBeenCalledWith({
      ehrTenantId: 42,
      orgId: 7,
      exportLevel: 'group',
      groupId: 'group-1',
      resourceTypes: ['Patient', 'Observation'],
      sinceMode: 'last_success',
      typeFilters: ['Observation?date=ge2026-01-01'],
      intervalMinutes: 1440,
      maxResourcesPerFile: 500,
      nextRunAt: '2026-06-18T12:00:00.000Z',
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'ehr_bulk_schedule_upsert',
      'ehr_bulk_schedule',
      '00000000-0000-4000-8000-000000000091',
      expect.objectContaining({
        tenantId: 42,
        enabled: true,
        exportLevel: 'group',
        hasGroupId: true,
        hasPatientId: false,
        sinceMode: 'last_success',
        intervalMinutes: 1440,
        typeFilterCount: 1,
      }),
    );
    const auditDetails = JSON.stringify(mockAuditLog.mock.calls[0]?.[3]);
    expect(auditDetails).not.toContain('group-1');
    expect(auditDetails).not.toContain('Observation?date=ge2026-01-01');
    await app.close();
  });

  it('rejects invalid Bulk Data schedule intervals before tenant lookup', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/bulk-schedules',
      payload: {
        exportLevel: 'group',
        groupId: 'group-1',
        resourceTypes: ['Patient'],
        intervalMinutes: 5,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'intervalMinutes must be at least 15' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    expect(upsertBulkSchedule).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects over-large Bulk Data schedule intervals before tenant lookup', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/bulk-schedules',
      payload: {
        exportLevel: 'group',
        groupId: 'group-1',
        resourceTypes: ['Patient'],
        intervalMinutes: 525601,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'intervalMinutes must be at most 525600' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    expect(upsertBulkSchedule).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects fixed Bulk Data schedules without a since timestamp before tenant lookup', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/bulk-schedules',
      payload: {
        exportLevel: 'group',
        groupId: 'group-1',
        resourceTypes: ['Patient'],
        sinceMode: 'fixed',
        intervalMinutes: 1440,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'since is required when sinceMode is fixed' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    expect(upsertBulkSchedule).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects Bulk Data schedule updates outside the tenant scope', async () => {
    mockSql.mockResolvedValueOnce([tenantRow]);
    upsertBulkSchedule.mockRejectedValueOnce(new BulkScheduleOwnershipError());
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/bulk-schedules',
      payload: {
        id: '00000000-0000-4000-8000-000000000091',
        exportLevel: 'group',
        groupId: 'group-1',
        resourceTypes: ['Patient'],
        intervalMinutes: 1440,
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Bulk schedule not found for tenant' },
    });
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('enqueues a manual Bulk Data export kickoff for a tenant', async () => {
    mockSql.mockResolvedValueOnce([tenantRow]);
    enqueueEhrBulkExport.mockResolvedValueOnce({
      enqueued: true,
      queueName: 'medgnosis-ehr-bulk-import',
      jobId: 'ehr-bulk-kickoff:42:abc',
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/bulk-exports',
      payload: {
        exportLevel: 'group',
        groupId: 'group-1',
        resourceTypes: ['Patient', 'Observation'],
        since: '2026-06-01T00:00:00Z',
        typeFilters: ['Observation?date=ge2026-01-01'],
        maxResourcesPerFile: 500,
      },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        tenant: { id: 42, orgId: 7 },
        bulkExport: {
          enqueued: true,
          queueName: 'medgnosis-ehr-bulk-import',
          jobId: 'ehr-bulk-kickoff:42:abc',
        },
      },
    });
    expect(enqueueEhrBulkExport).toHaveBeenCalledWith({
      ehrTenantId: 42,
      orgId: 7,
      vendor: 'epic',
      triggeredBy: 'manual',
      exportLevel: 'group',
      groupId: 'group-1',
      resourceTypes: ['Patient', 'Observation'],
      since: '2026-06-01T00:00:00.000Z',
      typeFilters: ['Observation?date=ge2026-01-01'],
      maxResourcesPerFile: 500,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'ehr_bulk_export_enqueue',
      'ehr_tenant',
      '42',
      expect.objectContaining({
        tenantId: 42,
        exportLevel: 'group',
        resourceTypes: ['Patient', 'Observation'],
        hasGroupId: true,
        hasPatientId: false,
        typeFilterCount: 1,
        enqueued: true,
        queueJobId: 'ehr-bulk-kickoff:42:abc',
      }),
    );
    const exportAuditDetails = JSON.stringify(mockAuditLog.mock.calls[0]?.[3]);
    expect(exportAuditDetails).not.toContain('group-1');
    expect(exportAuditDetails).not.toContain('Observation?date=ge2026-01-01');
    await app.close();
  });

  it('rejects invalid Bulk Data export inputs before tenant lookup', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/bulk-exports',
      payload: {
        exportLevel: 'group',
        resourceTypes: ['Patient'],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'groupId is required for group exports' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    expect(enqueueEhrBulkExport).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('enqueues a completed Bulk Data import for a tenant', async () => {
    mockSql.mockResolvedValueOnce([tenantRow]);
    enqueueEhrBulkImport.mockResolvedValueOnce({
      enqueued: true,
      queueName: 'medgnosis-ehr-bulk-import',
      jobId: 'ehr-bulk-import:42:00000000-0000-4000-8000-000000000067',
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/bulk-imports',
      payload: {
        bulkJobId: '00000000-0000-4000-8000-000000000067',
        maxResourcesPerFile: 500,
      },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        tenant: { id: 42, orgId: 7 },
        bulkImport: {
          enqueued: true,
          queueName: 'medgnosis-ehr-bulk-import',
          jobId: 'ehr-bulk-import:42:00000000-0000-4000-8000-000000000067',
        },
      },
    });
    expect(enqueueEhrBulkImport).toHaveBeenCalledWith({
      ehrTenantId: 42,
      orgId: 7,
      triggeredBy: 'manual',
      bulkJobId: '00000000-0000-4000-8000-000000000067',
      maxResourcesPerFile: 500,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'ehr_bulk_import_enqueue',
      'ehr_bulk_job',
      '00000000-0000-4000-8000-000000000067',
      expect.objectContaining({
        tenantId: 42,
        resumeFailedOnly: false,
        maxResourcesPerFile: 500,
        enqueued: true,
      }),
    );
    await app.close();
  });

  it('enqueues a failed-file-only Bulk Data import resume for a tenant', async () => {
    mockSql.mockResolvedValueOnce([tenantRow]);
    enqueueEhrBulkImport.mockResolvedValueOnce({
      enqueued: true,
      queueName: 'medgnosis-ehr-bulk-import',
      jobId: 'ehr-bulk-import-resume:42:00000000-0000-4000-8000-000000000067',
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/bulk-imports',
      payload: {
        bulkJobId: '00000000-0000-4000-8000-000000000067',
        resumeFailedOnly: true,
      },
    });

    expect(res.statusCode).toBe(202);
    expect(enqueueEhrBulkImport).toHaveBeenCalledWith({
      ehrTenantId: 42,
      orgId: 7,
      triggeredBy: 'manual',
      bulkJobId: '00000000-0000-4000-8000-000000000067',
      resumeFailedOnly: true,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'ehr_bulk_import_enqueue',
      'ehr_bulk_job',
      '00000000-0000-4000-8000-000000000067',
      expect.objectContaining({
        tenantId: 42,
        resumeFailedOnly: true,
        enqueued: true,
      }),
    );
    await app.close();
  });

  it('rejects invalid Bulk Data import inputs before tenant lookup', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/bulk-imports',
      payload: { bulkJobId: 'not-a-uuid' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'bulkJobId must be a UUID' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    expect(enqueueEhrBulkImport).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects non-boolean Bulk Data resume flags before tenant lookup', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/bulk-imports',
      payload: {
        bulkJobId: '00000000-0000-4000-8000-000000000067',
        resumeFailedOnly: 'yes',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'resumeFailedOnly must be a boolean' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    expect(enqueueEhrBulkImport).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('cancels an active Bulk Data job for a tenant', async () => {
    mockSql.mockResolvedValueOnce([tenantRow]);
    cancelBulkExportJobWithBackendServices.mockResolvedValueOnce({
      tenant: { id: 42, orgId: 7, vendor: 'epic' },
      job: {
        id: '00000000-0000-4000-8000-000000000067',
        status: 'canceled',
        statusUrl: 'https://ehr.example.test/__bulk_output__/statushash',
      },
      tokenMetadataId: '00000000-0000-4000-8000-000000000087',
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/bulk-jobs/00000000-0000-4000-8000-000000000067/cancel',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        tenant: { id: 42, orgId: 7 },
        bulkCancel: {
          job: {
            id: '00000000-0000-4000-8000-000000000067',
            status: 'canceled',
          },
        },
      },
    });
    expect(cancelBulkExportJobWithBackendServices).toHaveBeenCalledWith({
      ehrTenantId: 42,
      bulkJobId: '00000000-0000-4000-8000-000000000067',
      metadata: { triggeredBy: 'manual' },
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'ehr_bulk_cancel',
      'ehr_bulk_job',
      '00000000-0000-4000-8000-000000000067',
      expect.objectContaining({
        tenantId: 42,
        status: 'canceled',
        tokenMetadataId: '00000000-0000-4000-8000-000000000087',
      }),
    );
    await app.close();
  });

  it('rejects invalid Bulk Data cancel job ids before tenant lookup', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/bulk-jobs/not-a-uuid/cancel',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'bulkJobId must be a UUID' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    expect(cancelBulkExportJobWithBackendServices).not.toHaveBeenCalled();
    await app.close();
  });

  it('replays QDM normalization for a tenant ingest run', async () => {
    const qdm = {
      resourcesSeen: 3,
      resourcesNormalized: 2,
      resourcesSkipped: 1,
      resourcesFailed: 0,
      eventsUpserted: 2,
      errors: [],
    };
    mockSql.mockResolvedValueOnce([tenantRow]);
    normalizeStagedRunToQdm.mockResolvedValueOnce(qdm);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/ingest-runs/00000000-0000-4000-8000-000000000068/qdm-normalization',
      payload: {
        limit: 25,
        sourceSystem: 'admin-test',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        tenant: { id: 42, orgId: 7 },
        ingestRunId: '00000000-0000-4000-8000-000000000068',
        qdm,
      },
    });
    expect(normalizeStagedRunToQdm).toHaveBeenCalledWith({
      ingestRunId: '00000000-0000-4000-8000-000000000068',
      ehrTenantId: 42,
      orgId: 7,
      limit: 25,
      sourceSystem: 'admin-test',
    });
    await app.close();
  });

  it('rejects invalid QDM replay inputs before tenant lookup', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/ingest-runs/00000000-0000-4000-8000-000000000068/qdm-normalization',
      payload: { limit: 0 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'limit must be a positive integer' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    expect(normalizeStagedRunToQdm).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 404 for QDM replay against an unknown tenant', async () => {
    mockSql.mockResolvedValueOnce([]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/999/ingest-runs/00000000-0000-4000-8000-000000000068/qdm-normalization',
      payload: {},
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(normalizeStagedRunToQdm).not.toHaveBeenCalled();
    await app.close();
  });

  it('loads tenant-scoped QDM events into the CQL engine', async () => {
    const qdmCqlLoad = {
      qdmEventsSelected: 2,
      qdmEventsIncluded: 3,
      qdmEventsProjected: 3,
      qdmEventsSkipped: 0,
      bundleEntries: 3,
      load: { total: 3, created: 1, ok: 3, failed: 0 },
    };
    mockSql.mockResolvedValueOnce([tenantRow]);
    loadQdmEventsToCqlEngine.mockResolvedValueOnce(qdmCqlLoad);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/qdm/cql-load',
      payload: {
        ingestRunId: '00000000-0000-4000-8000-000000000068',
        qdmEventIds: [88, 89, 88],
        patientRefs: ['Patient/pat-1'],
        qdmDatatypes: ['Laboratory Test, Performed'],
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        includePatientRecords: true,
        engineBaseUrl: 'http://engine.example.test/fhir',
        limit: 25,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        tenant: { id: 42, orgId: 7 },
        qdmCqlLoad,
      },
    });
    expect(loadQdmEventsToCqlEngine).toHaveBeenCalledWith({
      ehrTenantId: 42,
      orgId: 7,
      ingestRunId: '00000000-0000-4000-8000-000000000068',
      qdmEventIds: [88, 89],
      patientRefs: ['Patient/pat-1'],
      qdmDatatypes: ['Laboratory Test, Performed'],
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      includePatientRecords: true,
      engineBaseUrl: 'http://engine.example.test/fhir',
      limit: 25,
    });
    await app.close();
  });

  it('rejects invalid QDM CQL load inputs before tenant lookup', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/42/qdm/cql-load',
      payload: {
        periodStart: '2026-12-31',
        periodEnd: '2026-01-01',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'periodEnd must be on or after periodStart' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    expect(loadQdmEventsToCqlEngine).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 404 for QDM CQL load against an unknown tenant', async () => {
    mockSql.mockResolvedValueOnce([]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/ehr/admin/tenants/999/qdm/cql-load',
      payload: {},
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(loadQdmEventsToCqlEngine).not.toHaveBeenCalled();
    await app.close();
  });
});

async function buildApp(user: JwtPayload = ADMIN_USER): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorateRequest('auditLog', mockAuditLog);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    request.user = user;
  });
  app.decorate(
    'requireRole',
    (roles: JwtPayload['role'][]) =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (!roles.includes(request.user.role)) {
          await reply.status(403).send({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: `Role '${request.user.role}' is not permitted to access this resource`,
            },
          });
        }
      },
  );
  await app.register(ehrRoutes, { prefix: '/api/ehr' });
  await app.ready();
  return app;
}

function smartConfiguration(): Record<string, unknown> {
  return {
    issuer: 'https://issuer.example.test',
    authorization_endpoint: 'https://issuer.example.test/oauth2/authorize',
    token_endpoint: 'https://issuer.example.test/oauth2/token',
    scopes_supported: ['launch', 'openid', 'patient/Patient.rs'],
    capabilities: ['launch-ehr', 'context-ehr-patient'],
    cds_hooks_endpoint: 'https://ehr.example.test/cds-services',
    cds_hooks_supported: ['patient-view'],
  };
}

function capabilityStatement(): Record<string, unknown> {
  return {
    resourceType: 'CapabilityStatement',
    status: 'active',
    fhirVersion: '4.0.1',
    format: ['json'],
    rest: [
      {
        mode: 'server',
        resource: [{ type: 'Patient', interaction: [{ code: 'read' }] }],
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
