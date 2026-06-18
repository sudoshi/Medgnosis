import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';
import type { FetchLike } from '../../services/ehr/types.js';

const { mockSql, normalizeStagedRunToQdm, loadQdmEventsToCqlEngine } = vi.hoisted(() => {
  const fn = vi.fn();
  (fn as unknown as { json: (value: unknown) => unknown }).json = (value: unknown) => value;
  const normalizeStagedRunToQdm = vi.fn();
  const loadQdmEventsToCqlEngine = vi.fn();
  return { mockSql: fn, normalizeStagedRunToQdm, loadQdmEventsToCqlEngine };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../../services/ehr/qdmBridge.js', () => ({ normalizeStagedRunToQdm }));
vi.mock('../../services/qdm/index.js', () => ({ loadQdmEventsToCqlEngine }));

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

const fetchMock = vi.fn<FetchLike>();

beforeEach(() => {
  mockSql.mockReset();
  normalizeStagedRunToQdm.mockReset();
  loadQdmEventsToCqlEngine.mockReset();
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
