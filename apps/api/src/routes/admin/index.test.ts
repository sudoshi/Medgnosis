import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';

const {
  MockMeasurePromotionError,
  mockListConfigs,
  mockUpdateConfig,
  mockPromote,
  mockGenerateSemanticDriftDossier,
  mockGetSemanticDriftDetail,
  mockListSemanticDriftWorklist,
  mockGetQdmBridgeOperationalStatus,
  mockListQdmBridgeRuns,
  mockListQdmBridgeIssues,
  mockAuditLog,
  mockSql,
  mockGetSystemHealth,
  mockCreatePendingPasswordHash,
  mockCreateUserInvite,
  mockSendInviteEmail,
  mockDispatchEhrSyncAlertSnapshot,
  mockEhrSyncAlertAuditDetails,
  mockFetchOidcDiscovery,
  mockGetOidcProviderConfig,
  mockRecordAuthProviderTestEvent,
  mockRefreshMeasures,
} = vi.hoisted(() => {
  class MeasurePromotionErrorMock extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly details?: Record<string, unknown>;

    constructor(code: string, message: string, statusCode = 400, details?: Record<string, unknown>) {
      super(message);
      this.name = 'MeasurePromotionError';
      this.code = code;
      this.statusCode = statusCode;
      this.details = details;
    }
  }

  return {
    MockMeasurePromotionError: MeasurePromotionErrorMock,
    mockListConfigs: vi.fn(),
    mockUpdateConfig: vi.fn(),
    mockPromote: vi.fn(),
    mockGenerateSemanticDriftDossier: vi.fn(),
    mockGetSemanticDriftDetail: vi.fn(),
    mockListSemanticDriftWorklist: vi.fn(),
    mockGetQdmBridgeOperationalStatus: vi.fn(),
    mockListQdmBridgeRuns: vi.fn(),
    mockListQdmBridgeIssues: vi.fn(),
    mockAuditLog: vi.fn(),
    mockSql: vi.fn(),
    mockGetSystemHealth: vi.fn(),
    mockCreatePendingPasswordHash: vi.fn(),
    mockCreateUserInvite: vi.fn(),
    mockSendInviteEmail: vi.fn(),
    mockDispatchEhrSyncAlertSnapshot: vi.fn(),
    mockEhrSyncAlertAuditDetails: vi.fn(),
    mockFetchOidcDiscovery: vi.fn(),
    mockGetOidcProviderConfig: vi.fn(),
    mockRecordAuthProviderTestEvent: vi.fn(),
    mockRefreshMeasures: vi.fn(),
  };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../../services/measureReconciliation.js', () => ({
  listMeasurePromotionConfigs: mockListConfigs,
  updateMeasurePromotionConfig: mockUpdateConfig,
  promoteMeasureToCqlAuthoritative: mockPromote,
  MeasurePromotionError: MockMeasurePromotionError,
}));
vi.mock('../../services/measureSemanticDriftDossier.js', () => ({
  generateMeasureSemanticDriftDossier: mockGenerateSemanticDriftDossier,
  getMeasureSemanticDriftDetail: mockGetSemanticDriftDetail,
  listMeasureSemanticDriftWorklist: mockListSemanticDriftWorklist,
  MeasureSemanticDriftError: MockMeasurePromotionError,
}));
vi.mock('../../services/qdm/bridgeOps.js', () => ({
  getQdmBridgeOperationalStatus: mockGetQdmBridgeOperationalStatus,
  listQdmBridgeRuns: mockListQdmBridgeRuns,
  listQdmBridgeIssues: mockListQdmBridgeIssues,
}));
vi.mock('../../services/omopExport.js', () => ({
  exportPatientsToOmop: vi.fn(),
  exportConditionsToOmop: vi.fn(),
  exportMeasurementsToOmop: vi.fn(),
  generateDeidentifiedCohort: vi.fn(),
}));
vi.mock('../../services/measureEvaluator.js', () => ({
  getMeasureEvaluator: vi.fn(() => ({ refresh: mockRefreshMeasures })),
}));
vi.mock('../../plugins/solr.js', () => ({
  getSolrClient: vi.fn(() => null),
  isSolrAvailable: vi.fn(() => false),
}));
vi.mock('../../config.js', () => ({
  config: {
    redisUrl: 'redis://localhost:6379',
    solrEnabled: false,
    nodeEnv: 'test',
    localAuthEnabled: true,
  },
}));
vi.mock('ioredis', () => ({
  Redis: vi.fn(() => ({
    connect: vi.fn(),
    ping: vi.fn(),
    disconnect: vi.fn(),
  })),
}));
vi.mock('../../services/auth/oidc/discovery.js', () => ({ fetchOidcDiscovery: mockFetchOidcDiscovery }));
vi.mock('../../services/auth/oidc/providerConfig.js', () => ({
  getOidcProviderConfig: mockGetOidcProviderConfig,
}));
vi.mock('../../services/auth/providerHealth.js', () => ({
  recordAuthProviderTestEvent: mockRecordAuthProviderTestEvent,
}));
vi.mock('../../services/systemHealth.js', () => ({
  getSystemHealth: mockGetSystemHealth,
}));
vi.mock('../../services/ehr/syncAlerts.js', () => ({
  dispatchEhrSyncAlertSnapshot: mockDispatchEhrSyncAlertSnapshot,
  ehrSyncAlertAuditDetails: mockEhrSyncAlertAuditDetails,
}));
vi.mock('../../services/auth/invites.js', () => ({
  createPendingPasswordHash: mockCreatePendingPasswordHash,
  createUserInvite: mockCreateUserInvite,
  sendInviteEmail: mockSendInviteEmail,
}));

import adminRoutes from './index.js';

const ADMIN_USER: JwtPayload = {
  sub: '00000000-0000-4000-8000-000000000001',
  email: 'admin@example.test',
  role: 'admin',
  org_id: '7',
};

const SUPER_ADMIN_USER: JwtPayload = {
  sub: '00000000-0000-4000-8000-000000000003',
  email: 'super@example.test',
  role: 'super_admin',
  org_id: '7',
};

const PROVIDER_USER: JwtPayload = {
  sub: '00000000-0000-4000-8000-000000000002',
  email: 'provider@example.test',
  role: 'provider',
  org_id: '7',
  provider_id: 7,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockResolvedValue([]);
  mockGetSystemHealth.mockResolvedValue(systemHealthPayload());
  mockCreatePendingPasswordHash.mockResolvedValue('$2b$12$pendinginvitehash');
  mockCreateUserInvite.mockResolvedValue({
    invite: {
      id: '99999999-9999-4999-8999-999999999999',
      user_id: '11111111-1111-4111-8111-111111111111',
      expires_at: '2099-01-01T00:00:00Z',
      created_at: '2026-06-18T00:00:00Z',
    },
    token: 'raw-token-not-persisted',
    activationUrl: 'http://localhost:5173/accept-invite?token=raw-token-not-persisted',
  });
  mockSendInviteEmail.mockResolvedValue(false);
  mockFetchOidcDiscovery.mockResolvedValue({
    issuer: 'https://issuer.example.test',
    authorization_endpoint: 'https://issuer.example.test/oauth2/authorize',
    token_endpoint: 'https://issuer.example.test/oauth2/token',
    jwks_uri: 'https://issuer.example.test/oauth2/jwks',
  });
  mockGetOidcProviderConfig.mockResolvedValue({
    enabled: false,
    discoveryUrl: 'https://issuer.example.test/.well-known/openid-configuration',
    clientId: 'medgnosis-client',
    redirectUri: 'https://medgnosis.example.test/api/v1/auth/oidc/callback',
  });
  mockRecordAuthProviderTestEvent.mockResolvedValue(undefined);
  mockRefreshMeasures.mockResolvedValue({ rowCount: 42, durationMs: 1234 });
  mockDispatchEhrSyncAlertSnapshot.mockResolvedValue({
    status: 'sent',
    reason: 'sent',
    enabled: true,
    configured: true,
    endpointHost: 'ops.example',
    generatedAt: '2026-06-25T22:30:00Z',
    tenantCount: 1,
    issueCount: 3,
    criticalIssueCount: 1,
    warningIssueCount: 2,
    statusCode: 202,
  });
  mockEhrSyncAlertAuditDetails.mockReturnValue({
    status: 'sent',
    reason: 'sent',
    enabled: true,
    configured: true,
    endpointHost: 'ops.example',
    tenantCount: 1,
    issueCount: 3,
    criticalIssueCount: 1,
    warningIssueCount: 2,
    statusCode: 202,
    triggeredBy: 'manual',
  });
});

function systemHealthPayload() {
  return {
    api: { status: 'ok', node_env: 'test' },
    database: { status: 'ok' },
    redis: { status: 'ok' },
    solr: { status: 'disabled', enabled: false },
    auth: { local_enabled: true, oidc_enabled: false },
    workers: {
      status: 'degraded',
      total_workers: 3,
      counts: { waiting: 2, active: 1, delayed: 0, failed: 0 },
      queues: [
        {
          name: 'medgnosis-ehr-bulk-import',
          label: 'EHR Bulk import',
          role: 'ehr_bulk',
          status: 'ok',
          workers: 1,
          paused: false,
          counts: { waiting: 2, active: 1, delayed: 0, failed: 0 },
        },
      ],
    },
    ehr_bulk: {
      status: 'ok',
      queue_enabled: true,
      tenants: {
        total: 2,
        active: 1,
        with_backend_services: 1,
        with_capability_snapshots: 1,
        ready_for_bulk: 1,
      },
      schedules: {
        enabled: 1,
        due: 0,
        failed_24h: 0,
        next_run_at: '2026-06-20 02:00:00+00',
      },
      bulk_jobs: {
        active: 1,
        failed_24h: 0,
        completed_24h: 3,
        latest_completed_at: '2026-06-19 01:30:00+00',
      },
      issues: [],
    },
    ehr_sync_alerts: {
      status: 'ok',
      enabled: true,
      configured: true,
      nightly_enabled: true,
      endpoint_host: 'ops.example',
      last_dispatch_at: '2026-06-25T22:00:00Z',
      last_dispatch_status: 'sent',
      last_dispatch_reason: 'sent',
      last_issue_count: 3,
      last_critical_issue_count: 1,
      last_warning_issue_count: 2,
    },
    duration_ms: 12,
  };
}

describe('admin system health route', () => {
  it('returns worker queue and EHR Bulk readiness sections', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/system-health',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        workers: {
          total_workers: 3,
          queues: [{ name: 'medgnosis-ehr-bulk-import', status: 'ok' }],
        },
        ehr_bulk: {
          status: 'ok',
          tenants: { ready_for_bulk: 1 },
          schedules: { enabled: 1 },
          bulk_jobs: { completed_24h: 3 },
        },
      },
    });
    expect(mockGetSystemHealth).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('dispatches an audited PHI-safe EHR sync alert snapshot', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/system-health/ehr-sync-alerts/dispatch',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        ehrSyncAlertDispatch: {
          status: 'sent',
          reason: 'sent',
          endpointHost: 'ops.example',
          issueCount: 3,
          criticalIssueCount: 1,
          warningIssueCount: 2,
        },
      },
    });
    expect(mockDispatchEhrSyncAlertSnapshot).toHaveBeenCalledTimes(1);
    expect(mockEhrSyncAlertAuditDetails).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', issueCount: 3 }),
      'manual',
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      'ehr_sync_alert_dispatch',
      'ehr_sync_alert',
      'manual',
      expect.objectContaining({
        endpointHost: 'ops.example',
        issueCount: 3,
        triggeredBy: 'manual',
      }),
    );
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('https://ops.example/hooks');
    await app.close();
  });
});

describe('admin authentication provider routes', () => {
  it('rejects normal admins from auth provider listing before querying settings', async () => {
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/auth-providers',
    });

    expect(res.statusCode).toBe(403);
    expect(mockSql).not.toHaveBeenCalled();
    await app.close();
  });

  it('lists only currently supported auth provider surfaces and masks stored secrets', async () => {
    mockSql.mockResolvedValueOnce([
      {
        provider_type: 'ldap',
        display_name: 'LDAP',
        enabled: false,
        settings: { bind_password: 'stored-secret' },
        updated_at: '2026-06-19T00:00:00Z',
      },
      {
        provider_type: 'local',
        display_name: 'Local',
        enabled: true,
        settings: {},
        updated_at: '2026-06-19T00:00:00Z',
      },
      {
        provider_type: 'oidc',
        display_name: 'Authentik',
        enabled: true,
        settings: {
          client_id: 'medgnosis',
          client_secret: 'stored-secret',
          client_secret_ref: 'OIDC_CLIENT_SECRET',
        },
        updated_at: '2026-06-19T00:00:00Z',
      },
      {
        provider_type: 'saml2',
        display_name: 'SAML',
        enabled: false,
        settings: {},
        updated_at: '2026-06-19T00:00:00Z',
      },
    ]);
    const app = await buildApp(SUPER_ADMIN_USER);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/auth-providers',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        providers: [
          { provider_type: 'local', display_name: 'Local', enabled: true },
          {
            provider_type: 'oidc',
            display_name: 'Authentik',
            enabled: true,
            settings: {
              client_id: 'medgnosis',
              client_secret: '__stored__',
              client_secret_ref: 'OIDC_CLIENT_SECRET',
            },
          },
        ],
      },
    });
    expect(JSON.stringify(res.json())).not.toContain('ldap');
    expect(JSON.stringify(res.json())).not.toContain('saml2');
    expect(JSON.stringify(res.json())).not.toContain('stored-secret');
    await app.close();
  });

  it('rejects normal admins from auth provider updates before persistence', async () => {
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/auth-providers/oidc',
      payload: { enabled: true },
    });

    expect(res.statusCode).toBe(403);
    expect(mockSql).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('updates only managed OIDC provider settings and audits the change', async () => {
    mockSql
      .mockResolvedValueOnce([
        {
          provider_type: 'oidc',
          display_name: 'Authentik',
          enabled: false,
          settings: { client_secret_ref: 'OIDC_CLIENT_SECRET' },
          updated_at: '2026-06-19T00:00:00Z',
        },
      ])
      .mockImplementationOnce(((strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.join('');
        expect(query).toContain('INSERT INTO public.auth_provider_settings');
        expect(values[0]).toBe('oidc');
        expect(values[1]).toBe('Enterprise SSO');
        expect(values[2]).toBe(true);
        expect(JSON.parse(values[3] as string)).toMatchObject({
          label: 'Enterprise SSO',
          discovery_url: 'https://auth.example.test/.well-known/openid-configuration',
          client_id: 'medgnosis',
          client_secret_ref: 'OIDC_CLIENT_SECRET',
          scopes: ['openid', 'email'],
          allowed_groups: ['Medgnosis Admins'],
          admin_groups: ['Medgnosis Admins'],
        });
        return Promise.resolve([
          {
            provider_type: 'oidc',
            display_name: 'Enterprise SSO',
            enabled: true,
            settings: JSON.parse(values[3] as string),
            updated_at: '2026-06-19T00:01:00Z',
          },
        ]);
      }) as typeof mockSql);
    const app = await buildApp(SUPER_ADMIN_USER);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/auth-providers/oidc',
      payload: {
        display_name: ' Enterprise SSO ',
        enabled: true,
        settings: {
          label: ' Enterprise SSO ',
          discovery_url: ' https://auth.example.test/.well-known/openid-configuration ',
          client_id: ' medgnosis ',
          client_secret_ref: ' OIDC_CLIENT_SECRET ',
          scopes: 'openid, email',
          allowed_groups: ['Medgnosis Admins'],
          admin_groups: 'Medgnosis Admins',
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { provider: { provider_type: 'oidc', display_name: 'Enterprise SSO', enabled: true } },
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'auth_provider_update',
      'auth_provider',
      'oidc',
      { provider_type: 'oidc', enabled: true },
    );
    await app.close();
  });

  it.each(['local', 'ldap', 'oauth2', 'saml2'])(
    'rejects unsupported auth provider mutation for %s before persistence',
    async (providerType) => {
      const app = await buildApp(SUPER_ADMIN_USER);

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/admin/auth-providers/${providerType}`,
        payload: { enabled: true },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({
        success: false,
        error: { code: 'UNSUPPORTED_PROVIDER' },
      });
      expect(mockSql).not.toHaveBeenCalled();
      expect(mockAuditLog).not.toHaveBeenCalled();
      await app.close();
    },
  );

  it('records successful OIDC provider test evidence', async () => {
    const app = await buildApp(SUPER_ADMIN_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/auth-providers/oidc/test',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        issuer: 'https://issuer.example.test',
        client_configured: true,
        redirect_uri: 'https://medgnosis.example.test/api/v1/auth/oidc/callback',
      },
    });
    expect(mockRecordAuthProviderTestEvent).toHaveBeenCalledWith(expect.objectContaining({
      providerType: 'oidc',
      status: 'ok',
      testedBy: SUPER_ADMIN_USER.sub,
      issuer: 'https://issuer.example.test',
      clientConfigured: true,
      redirectUri: 'https://medgnosis.example.test/api/v1/auth/oidc/callback',
      responseMs: expect.any(Number),
    }));
    expect(mockAuditLog).toHaveBeenCalledWith(
      'auth_provider_test',
      'auth_provider',
      'oidc',
      expect.objectContaining({
        provider_type: 'oidc',
        status: 'ok',
        client_configured: true,
      }),
    );
    await app.close();
  });

  it('records failed OIDC provider test evidence', async () => {
    mockFetchOidcDiscovery.mockRejectedValueOnce(new Error('discovery unavailable'));
    const app = await buildApp(SUPER_ADMIN_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/auth-providers/oidc/test',
    });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({
      success: false,
      error: {
        code: 'PROVIDER_TEST_FAILED',
        message: 'discovery unavailable',
      },
    });
    expect(mockRecordAuthProviderTestEvent).toHaveBeenCalledWith(expect.objectContaining({
      providerType: 'oidc',
      status: 'error',
      testedBy: SUPER_ADMIN_USER.sub,
      clientConfigured: true,
      redirectUri: 'https://medgnosis.example.test/api/v1/auth/oidc/callback',
      errorCode: 'PROVIDER_TEST_FAILED',
      errorMessage: 'discovery unavailable',
      responseMs: expect.any(Number),
    }));
    expect(mockAuditLog).toHaveBeenCalledWith(
      'auth_provider_test',
      'auth_provider',
      'oidc',
      expect.objectContaining({
        provider_type: 'oidc',
        status: 'error',
        client_configured: true,
        error_code: 'PROVIDER_TEST_FAILED',
      }),
    );
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('discovery unavailable');
    await app.close();
  });
});

describe('admin user invitation routes', () => {
  it('lists users with pending invite status metadata', async () => {
    const pendingInvite = {
      id: '99999999-9999-4999-8999-999999999999',
      expires_at: '2099-01-01T00:00:00Z',
      created_at: '2026-06-18T00:00:00Z',
      status: 'pending',
    };
    mockSql.mockImplementation(((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('');
      expect(query).toContain('public.app_user_invites');
      expect(query).toContain('pending_invite');
      expect(query).toContain('WHERE u.org_id =');
      expect(query).toContain("u.role <> 'super_admin'");
      expect(values).toEqual([7]);
      return Promise.resolve([
        {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'pending@example.test',
          first_name: 'Pending',
          last_name: 'User',
          role: 'provider',
          is_active: false,
          created_at: '2026-06-18T00:00:00Z',
          last_login_at: null,
          provider_first_name: null,
          provider_last_name: null,
          pending_invite: pendingInvite,
        },
      ]);
    }) as typeof mockSql);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        users: [
          {
            email: 'pending@example.test',
            is_active: false,
            pending_invite: pendingInvite,
          },
        ],
      },
    });
    await app.close();
  });

  it('keeps super-admin user listing global', async () => {
    mockSql.mockImplementation(((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('');
      expect(query).toContain('public.app_user_invites');
      expect(query).toContain('pending_invite');
      expect(query).not.toContain('WHERE u.org_id =');
      expect(values).toEqual([]);
      return Promise.resolve([]);
    }) as typeof mockSql);
    const app = await buildApp(SUPER_ADMIN_USER);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { users: [] },
    });
    await app.close();
  });

  it('rejects normal admin user listing without a numeric organization scope', async () => {
    const app = await buildApp({ ...ADMIN_USER, org_id: 'org-1' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'ADMIN_ORG_SCOPE_REQUIRED' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    await app.close();
  });

  it('creates admin-invited users as inactive and issues a tokenized invite', async () => {
    const createdUser = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'new.user@example.test',
      first_name: 'New',
      last_name: 'User',
      role: 'provider',
      is_active: false,
      created_at: '2026-06-18T00:00:00Z',
    };

    mockSql.mockImplementation(((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('');
      if (query.includes('SELECT id FROM public.app_users')) {
        expect(values[0]).toBe('new.user@example.test');
        return Promise.resolve([]);
      }
      if (query.includes('INSERT INTO public.app_users')) {
        expect(values[0]).toBe('new.user@example.test');
        expect(values[1]).toBe('New');
        expect(values[2]).toBe('User');
        expect(values[3]).toBe('provider');
        expect(values[4]).toBe(7);
        expect(values[5]).toBe('$2b$12$pendinginvitehash');
        expect(query).toContain('role, org_id, password_hash');
        expect(query).toContain('must_change_password, is_active');
        expect(query).toContain('FALSE');
        return Promise.resolve([createdUser]);
      }
      return Promise.resolve([]);
    }) as typeof mockSql);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      payload: {
        email: ' New.User@Example.Test ',
        first_name: ' New ',
        last_name: ' User ',
        role: 'provider',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        user: { email: 'new.user@example.test', is_active: false },
        invite: {
          id: '99999999-9999-4999-8999-999999999999',
          activation_url: 'http://localhost:5173/accept-invite?token=raw-token-not-persisted',
          email_sent: false,
        },
      },
    });
    expect(mockCreateUserInvite).toHaveBeenCalledWith({
      userId: createdUser.id,
      createdBy: ADMIN_USER.sub,
    });
    expect(mockSendInviteEmail).toHaveBeenCalledWith({
      toEmail: createdUser.email,
      firstName: createdUser.first_name,
      activationUrl: 'http://localhost:5173/accept-invite?token=raw-token-not-persisted',
      expiresAt: '2099-01-01T00:00:00Z',
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'user_invite_create',
      'app_user',
      createdUser.id,
      {
        invite_id: '99999999-9999-4999-8999-999999999999',
        role: createdUser.role,
        email_sent: false,
        expires_at: '2099-01-01T00:00:00Z',
      },
    );
    await app.close();
  });

  it('creates super-admin-invited non-super-admin users in the requested organization', async () => {
    const createdUser = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'org.admin@example.test',
      first_name: 'Org',
      last_name: 'Admin',
      role: 'admin',
      is_active: false,
      created_at: '2026-06-18T00:00:00Z',
    };

    mockSql.mockImplementation(((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('');
      if (query.includes('SELECT id FROM public.app_users')) {
        expect(values[0]).toBe('org.admin@example.test');
        return Promise.resolve([]);
      }
      if (query.includes('INSERT INTO public.app_users')) {
        expect(values[0]).toBe('org.admin@example.test');
        expect(values[3]).toBe('admin');
        expect(values[4]).toBe(42);
        expect(values[5]).toBe('$2b$12$pendinginvitehash');
        return Promise.resolve([createdUser]);
      }
      return Promise.resolve([]);
    }) as typeof mockSql);
    const app = await buildApp(SUPER_ADMIN_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      payload: {
        email: 'org.admin@example.test',
        first_name: 'Org',
        last_name: 'Admin',
        role: 'admin',
        org_id: 42,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockCreateUserInvite).toHaveBeenCalledWith({
      userId: createdUser.id,
      createdBy: SUPER_ADMIN_USER.sub,
    });
    await app.close();
  });

  it('rejects super-admin-created non-super-admin users without any target organization', async () => {
    const app = await buildApp({ ...SUPER_ADMIN_USER, org_id: '' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      payload: {
        email: 'orgless.admin@example.test',
        first_name: 'Orgless',
        role: 'admin',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'TARGET_ORG_REQUIRED' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    expect(mockCreateUserInvite).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects normal admins creating a super-admin invite before persistence', async () => {
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      payload: {
        email: 'super.new@example.test',
        first_name: 'Super',
        last_name: 'New',
        role: 'super_admin',
      },
    });

    expect(res.statusCode).toBe(403);
    expect(mockSql).not.toHaveBeenCalled();
    expect(mockCreateUserInvite).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not revoke invites for users outside a normal admin organization', async () => {
    mockSql.mockImplementation(((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('');
      expect(query).toContain('AND org_id =');
      expect(values).toEqual(['11111111-1111-4111-8111-111111111111', 7]);
      return Promise.resolve([]);
    }) as typeof mockSql);
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users/11111111-1111-4111-8111-111111111111/revoke-invite',
    });

    expect(res.statusCode).toBe(404);
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('resends invites only for inactive users', async () => {
    const invitedUser = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'pending@example.test',
      first_name: 'Pending',
      last_name: 'User',
      role: 'analyst',
      is_active: false,
    };
    mockSql.mockResolvedValueOnce([invitedUser]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${invitedUser.id}/resend-invite`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        user: { email: 'pending@example.test', is_active: false },
        invite: { email_sent: false },
      },
    });
    expect(mockCreateUserInvite).toHaveBeenCalledWith({
      userId: invitedUser.id,
      createdBy: ADMIN_USER.sub,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'user_invite_resend',
      'app_user',
      invitedUser.id,
      {
        invite_id: '99999999-9999-4999-8999-999999999999',
        role: invitedUser.role,
        email_sent: false,
        expires_at: '2099-01-01T00:00:00Z',
      },
    );
    await app.close();
  });

  it('does not resend invites for already active users', async () => {
    mockSql.mockResolvedValueOnce([{
      id: '11111111-1111-4111-8111-111111111111',
      email: 'active@example.test',
      first_name: 'Active',
      last_name: 'User',
      role: 'analyst',
      is_active: true,
    }]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users/11111111-1111-4111-8111-111111111111/resend-invite',
    });

    expect(res.statusCode).toBe(409);
    expect(mockCreateUserInvite).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not resend invites for users outside a normal admin organization', async () => {
    mockSql.mockImplementation(((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('');
      expect(query).toContain('AND org_id =');
      expect(values).toEqual(['11111111-1111-4111-8111-111111111111', 7]);
      return Promise.resolve([]);
    }) as typeof mockSql);
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users/11111111-1111-4111-8111-111111111111/resend-invite',
    });

    expect(res.statusCode).toBe(404);
    expect(mockCreateUserInvite).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('revokes the latest pending invite for inactive users', async () => {
    const invitedUser = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'pending@example.test',
      first_name: 'Pending',
      last_name: 'User',
      role: 'analyst',
      is_active: false,
    };
    const revokedInvite = {
      id: '99999999-9999-4999-8999-999999999999',
      user_id: invitedUser.id,
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: '2026-06-18T12:00:00Z',
    };
    mockSql
      .mockResolvedValueOnce([invitedUser])
      .mockResolvedValueOnce([revokedInvite]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${invitedUser.id}/revoke-invite`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        user: { email: 'pending@example.test', is_active: false },
        invite: revokedInvite,
      },
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'user_invite_revoke',
      'app_user',
      invitedUser.id,
      {
        invite_id: revokedInvite.id,
        role: invitedUser.role,
        expires_at: revokedInvite.expires_at,
        revoked_at: revokedInvite.revoked_at,
      },
    );
    await app.close();
  });

  it('does not revoke invites for already active users', async () => {
    mockSql.mockResolvedValueOnce([{
      id: '11111111-1111-4111-8111-111111111111',
      email: 'active@example.test',
      first_name: 'Active',
      last_name: 'User',
      role: 'analyst',
      is_active: true,
    }]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users/11111111-1111-4111-8111-111111111111/revoke-invite',
    });

    expect(res.statusCode).toBe(409);
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects normal admins granting super-admin access before persistence', async () => {
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/11111111-1111-4111-8111-111111111111',
      payload: { role: 'super_admin' },
    });

    expect(res.statusCode).toBe(403);
    expect(mockSql).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('audits admin user profile updates without email or name details', async () => {
    const updatedUser = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'updated@example.test',
      first_name: 'Updated',
      last_name: 'User',
      role: 'analyst',
      is_active: true,
    };
    mockSql
      .mockResolvedValueOnce([{ id: updatedUser.id, role: 'analyst', is_active: true, org_id: 7 }])
      .mockResolvedValueOnce([updatedUser]);
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${updatedUser.id}`,
      payload: { first_name: 'Updated' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'user_update',
      'app_user',
      updatedUser.id,
      {
        role_changed: false,
        is_active_changed: false,
        profile_changed: true,
        role: 'analyst',
        is_active: true,
      },
    );
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('updated@example.test');
    await app.close();
  });

  it('does not let normal admins update users outside their organization', async () => {
    mockSql.mockResolvedValueOnce([]);
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/11111111-1111-4111-8111-111111111111',
      payload: { first_name: 'Outside' },
    });

    expect(res.statusCode).toBe(404);
    expect(mockSql).toHaveBeenCalledOnce();
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not let normal admins mutate existing super-admin accounts', async () => {
    mockSql.mockResolvedValueOnce([{
      id: '11111111-1111-4111-8111-111111111111',
      role: 'super_admin',
      is_active: true,
      org_id: 7,
    }]);
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/11111111-1111-4111-8111-111111111111',
      payload: { first_name: 'Root' },
    });

    expect(res.statusCode).toBe(403);
    expect(mockSql).toHaveBeenCalledOnce();
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('audits admin user deactivation without email details', async () => {
    const deactivatedUser = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'deactivated@example.test',
      is_active: false,
    };
    mockSql
      .mockResolvedValueOnce([{ id: deactivatedUser.id, role: 'analyst', is_active: true, org_id: 7 }])
      .mockResolvedValueOnce([{ role: 'analyst', is_active: true }])
      .mockResolvedValueOnce([deactivatedUser]);
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${deactivatedUser.id}`,
    });

    expect(res.statusCode).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'user_deactivate',
      'app_user',
      deactivatedUser.id,
      { is_active: false },
    );
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('deactivated@example.test');
    await app.close();
  });

  it('does not let normal admins deactivate users outside their organization', async () => {
    mockSql.mockResolvedValueOnce([]);
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/users/11111111-1111-4111-8111-111111111111',
    });

    expect(res.statusCode).toBe(404);
    expect(mockSql).toHaveBeenCalledOnce();
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('admin audit-log visibility routes', () => {
  it('scopes normal admin audit-log reads to actor users in their organization', async () => {
    const sqlCalls: Array<{ query: string; values: unknown[] }> = [];
    const auditRow = {
      audit_id: '99999999-9999-4999-8999-999999999999',
      event_type: 'user_update',
      target_type: 'app_user',
      target_id: '11111111-1111-4111-8111-111111111111',
      description: '{}',
      ip_address: '127.0.0.1',
      created_at: '2026-06-18T12:00:00Z',
      user_email: 'admin@example.test',
      user_first_name: 'Admin',
      user_last_name: 'User',
    };
    mockSql.mockImplementation(((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('');
      sqlCalls.push({ query, values });
      if (query.includes('COUNT(*)')) return Promise.resolve([{ count: '1' }]);
      return Promise.resolve([auditRow]);
    }) as typeof mockSql);
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/audit-log?event_type=user_update&limit=10&offset=5',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { logs: [auditRow], total: 1 },
    });
    expect(sqlCalls[0]?.query).toContain('JOIN public.app_users au ON al.user_id = au.id');
    expect(sqlCalls[0]?.query).toContain('AND au.org_id =');
    expect(sqlCalls[0]?.values).toEqual(['user_update', 7, 10, 5]);
    expect(sqlCalls[1]?.query).toContain('JOIN public.app_users au ON al.user_id = au.id');
    expect(sqlCalls[1]?.query).toContain('AND au.org_id =');
    expect(sqlCalls[1]?.values).toEqual(['user_update', 7]);
    await app.close();
  });

  it('keeps super-admin audit-log reads global including system rows', async () => {
    const sqlCalls: Array<{ query: string; values: unknown[] }> = [];
    mockSql.mockImplementation(((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('');
      sqlCalls.push({ query, values });
      if (query.includes('COUNT(*)')) return Promise.resolve([{ count: '2' }]);
      return Promise.resolve([]);
    }) as typeof mockSql);
    const app = await buildApp(SUPER_ADMIN_USER);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/audit-log?event_type=system_job&limit=10&offset=0',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { logs: [], total: 2 },
    });
    expect(sqlCalls[0]?.query).toContain('LEFT JOIN public.app_users au ON al.user_id = au.id');
    expect(sqlCalls[0]?.query).not.toContain('au.org_id =');
    expect(sqlCalls[0]?.values).toEqual(['system_job', 10, 0]);
    expect(sqlCalls[1]?.query).not.toContain('au.org_id =');
    expect(sqlCalls[1]?.values).toEqual(['system_job']);
    await app.close();
  });

  it('rejects normal admin audit-log reads without a numeric organization scope', async () => {
    const app = await buildApp({ ...ADMIN_USER, org_id: 'org-1' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/audit-log',
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'ADMIN_ORG_SCOPE_REQUIRED' },
    });
    expect(mockSql).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('admin FHIR endpoint mutation audit routes', () => {
  it('audits FHIR endpoint creation without endpoint URL details', async () => {
    const endpoint = {
      endpoint_id: 17,
      ehr_type: 'epic',
      auth_type: 'oauth2',
      version: 'R4',
      base_url: 'https://ehr.example.test/fhir',
    };
    mockSql.mockResolvedValueOnce([endpoint]);
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/fhir-endpoints',
      payload: {
        name: 'Epic Sandbox',
        ehr_type: 'epic',
        base_url: 'https://ehr.example.test/fhir',
        auth_type: 'oauth2',
        version: 'R4',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'fhir_endpoint_create',
      'fhir_endpoint',
      '17',
      expect.objectContaining({ ehr_type: 'epic', auth_type: 'oauth2', version: 'R4' }),
    );
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('https://ehr.example.test/fhir');
    await app.close();
  });

  it('audits FHIR endpoint updates as changed-field flags', async () => {
    mockSql.mockResolvedValueOnce([{ endpoint_id: 17, status: 'active' }]);
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/fhir-endpoints/17',
      payload: {
        base_url: 'https://ehr.example.test/fhir',
        status: 'active',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'fhir_endpoint_update',
      'fhir_endpoint',
      '17',
      expect.objectContaining({
        fields_changed: expect.objectContaining({ base_url: true, status: true, name: false }),
        status: 'active',
      }),
    );
    expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain('https://ehr.example.test/fhir');
    await app.close();
  });

  it('audits FHIR endpoint deactivation', async () => {
    mockSql.mockResolvedValueOnce([{ endpoint_id: 17 }]);
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/fhir-endpoints/17',
    });

    expect(res.statusCode).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'fhir_endpoint_deactivate',
      'fhir_endpoint',
      '17',
      { is_active: false },
    );
    await app.close();
  });

  it('audits FHIR endpoint sync checks', async () => {
    mockSql.mockResolvedValueOnce([{ endpoint_id: 17, status: 'connected' }]);
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/fhir-endpoints/17/sync',
    });

    expect(res.statusCode).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'fhir_endpoint_sync',
      'fhir_endpoint',
      '17',
      { status: 'connected', synced: true },
    );
    await app.close();
  });

  it('audits materialized view refresh outcomes', async () => {
    const unsafe = vi.fn().mockResolvedValue([]);
    (mockSql as unknown as { unsafe: typeof unsafe }).unsafe = unsafe;
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/refresh-mat-views',
    });

    expect(res.statusCode).toBe(200);
    expect(unsafe).toHaveBeenCalledTimes(7);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'materialized_views_refresh',
      'materialized_view',
      'admin_refresh',
      expect.objectContaining({
        total: 8,
        ok: 8,
        error: 0,
        all_ok: true,
      }),
    );
    await app.close();
  });

  it('audits measure refresh through the request audit helper', async () => {
    mockRefreshMeasures.mockResolvedValueOnce({ rowCount: 17, durationMs: 250 });
    const app = await buildApp(ADMIN_USER);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/refresh-measures',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        rows_refreshed: 17,
        duration_ms: 250,
      },
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_refresh',
      'measure_result',
      undefined,
      {
        rowCount: 17,
        durationMs: 250,
      },
    );
    expect(
      mockSql.mock.calls.some(([strings]) =>
        (strings as TemplateStringsArray).join('').includes('INSERT INTO public.audit_log'),
      ),
    ).toBe(false);
    await app.close();
  });
});

describe('admin measure promotion governance routes', () => {
  it('lists measure promotion configs', async () => {
    mockListConfigs.mockResolvedValueOnce([
      {
        measureCode: 'CMS122v12',
        promotionMode: 'cql_shadow',
        authoritativeSource: 'sql_bundle',
        latestReconciliationRun: null,
      },
    ]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs?measure_code=CMS122v12&limit=10',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { configs: [{ measureCode: 'CMS122v12', promotionMode: 'cql_shadow' }] },
    });
    expect(mockListConfigs).toHaveBeenCalledWith({ measureCode: 'CMS122v12', limit: 10 });
    await app.close();
  });

  it('updates a config and audits the change', async () => {
    mockUpdateConfig.mockResolvedValueOnce({
      measureCode: 'CMS122v12',
      promotionMode: 'cql_shadow',
      tolerance: 1,
      authoritativeSource: 'sql_bundle',
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/measure-promotion-configs/CMS122v12',
      payload: { promotionMode: 'cql_shadow', tolerance: 1 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { config: { measureCode: 'CMS122v12', promotionMode: 'cql_shadow' } },
    });
    expect(mockUpdateConfig).toHaveBeenCalledWith({
      measureCode: 'CMS122v12',
      promotionMode: 'cql_shadow',
      tolerance: 1,
      evaluatorSource: undefined,
      requireReconciliationAgreement: undefined,
      metadata: undefined,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_promotion_config_update',
      'measure_promotion_config',
      'CMS122v12',
      expect.objectContaining({ promotionMode: 'cql_shadow' }),
    );
    await app.close();
  });

  it('promotes a measure to CQL authoritative and audits non-dry runs', async () => {
    mockPromote.mockResolvedValueOnce({
      measureCode: 'CMS122v12',
      measureArtifactId: 1201,
      reconciliationRunId: 7001,
      measureReportId: 9001,
      dryRun: false,
      rowsPromoted: 1,
      coverage: {
        evidenceRowsSeen: 4,
        evidenceRowsPromotable: 4,
        distinctPatientKeys: 4,
        distinctMeasureKeys: 1,
        expectedInitialPopulation: 4,
      },
      materialization: {
        measureReportId: 9001,
        source: 'qdm-cql',
        evaluationScope: 'full_population',
        evidenceRowsSeen: 4,
        evidenceRowsPromoted: 4,
        evidenceRowsSkipped: 0,
        resultRowsUpserted: 1,
        qdmEvidenceSelected: 8,
        bridgeRowsUpserted: 4,
        factEvidenceRowsUpserted: 8,
      },
      config: {
        measureCode: 'CMS122v12',
        measureArtifactId: 1201,
        promotionMode: 'cql_authoritative',
        tolerance: 0,
        evaluatorSource: 'qdm-cql',
        authoritativeSource: 'qdm-cql',
        requireReconciliationAgreement: true,
      },
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/measure-promotion-configs/CMS122v12/promote-cql-authoritative',
      payload: {
        reconciliationRunId: 7001,
        measureReportId: 9001,
        requireFullPopulation: true,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { promotion: { measureCode: 'CMS122v12', rowsPromoted: 1 } },
    });
    expect(mockPromote).toHaveBeenCalledWith({
      measureCode: 'CMS122v12',
      reconciliationRunId: 7001,
      measureReportId: 9001,
      actorId: ADMIN_USER.sub,
      qdmRunId: undefined,
      dryRun: undefined,
      requireFullPopulation: true,
      statementTimeoutMs: undefined,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_promotion_cql_authoritative_attempt',
      'measure_promotion_config',
      'CMS122v12',
      expect.objectContaining({
        status: 'promoted',
        reconciliationRunId: 7001,
        measureReportId: 9001,
        rowsPromoted: 1,
        qdmRunIdPresent: false,
        dryRunRequested: false,
        requireFullPopulation: true,
        coverage: expect.objectContaining({
          evidenceRowsSeen: 4,
          evidenceRowsPromotable: 4,
          distinctPatientKeys: 4,
          distinctMeasureKeys: 1,
          expectedInitialPopulation: 4,
        }),
        materialization: expect.objectContaining({
          evidenceRowsPromoted: 4,
          resultRowsUpserted: 1,
          factEvidenceRowsUpserted: 8,
        }),
      }),
    );
    const attemptAudit = mockAuditLog.mock.calls.find(
      ([action]) => action === 'measure_promotion_cql_authoritative_attempt',
    )?.[3] as Record<string, unknown>;
    expect(JSON.stringify(attemptAudit)).not.toMatch(/qdmEvidence|fhirSubjectReport|qdmEventId|Patient\//);
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_promotion_cql_authoritative',
      'measure_promotion_config',
      'CMS122v12',
      expect.objectContaining({ reconciliationRunId: 7001, measureReportId: 9001, rowsPromoted: 1 }),
    );
    await app.close();
  });

  it('audits CQL promotion dry-run attempts without legacy authoritative audit rows', async () => {
    mockPromote.mockResolvedValueOnce({
      measureCode: 'CMS122v12',
      measureArtifactId: 1201,
      reconciliationRunId: 7001,
      measureReportId: 9001,
      dryRun: true,
      rowsPromoted: 0,
      coverage: {
        evidenceRowsSeen: 4,
        evidenceRowsPromotable: 4,
        distinctPatientKeys: 4,
        distinctMeasureKeys: 1,
        expectedInitialPopulation: 4,
      },
      materialization: null,
      config: {
        measureCode: 'CMS122v12',
        measureArtifactId: 1201,
        promotionMode: 'cql_shadow',
        tolerance: 0,
        evaluatorSource: 'qdm-cql',
        authoritativeSource: 'sql_bundle',
        requireReconciliationAgreement: true,
      },
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/measure-promotion-configs/CMS122v12/promote-cql-authoritative',
      payload: {
        reconciliationRunId: 7001,
        measureReportId: 9001,
        qdmRunId: '11111111-1111-4111-8111-111111111111',
        dryRun: true,
        statementTimeoutMs: 15_000,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { promotion: { measureCode: 'CMS122v12', dryRun: true, rowsPromoted: 0 } },
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_promotion_cql_authoritative_attempt',
      'measure_promotion_config',
      'CMS122v12',
      expect.objectContaining({
        status: 'dry_run',
        reconciliationRunId: 7001,
        measureReportId: 9001,
        qdmRunIdPresent: true,
        dryRunRequested: true,
        requireFullPopulation: true,
        statementTimeoutMs: 15_000,
        rowsPromoted: 0,
      }),
    );
    const attemptAudit = mockAuditLog.mock.calls.find(
      ([action]) => action === 'measure_promotion_cql_authoritative_attempt',
    )?.[3] as Record<string, unknown>;
    expect(JSON.stringify(attemptAudit)).not.toMatch(/qdmEvidence|fhirSubjectReport|qdmEventId|Patient\//);
    expect(
      mockAuditLog.mock.calls.some(([action]) => action === 'measure_promotion_cql_authoritative'),
    ).toBe(false);
    await app.close();
  });

  it('generates a semantic drift dossier and audits the read model artifact', async () => {
    mockGenerateSemanticDriftDossier.mockResolvedValueOnce({
      dossierId: 42,
      persisted: true,
      measureCode: 'CMS122v12',
      reconciliationRunId: 7003,
      measureReportId: 9001,
      patientsPersisted: 239,
      patientRowsReturned: 10,
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-dossier',
      payload: {
        reconciliationRunId: 7003,
        measureReportId: 9001,
        patientSampleLimit: 10,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { dossier: { dossierId: 42, measureCode: 'CMS122v12' } },
    });
    expect(mockGenerateSemanticDriftDossier).toHaveBeenCalledWith({
      measureCode: 'CMS122v12',
      reconciliationRunId: 7003,
      measureReportId: 9001,
      patientSampleLimit: 10,
      persist: undefined,
      actorId: ADMIN_USER.sub,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_semantic_drift_dossier_generate',
      'measure_semantic_drift_dossier',
      '42',
      expect.objectContaining({
        measureCode: 'CMS122v12',
        reconciliationRunId: 7003,
        measureReportId: 9001,
      }),
    );
    await app.close();
  });

  it('lists a semantic drift worklist and audits the dossier read', async () => {
    mockListSemanticDriftWorklist.mockResolvedValueOnce({
      measureCode: 'CMS122v12',
      dossierId: 42,
      sourceMeasureCode: 'DM-02',
      reconciliationRunId: 7003,
      measureReportId: 9001,
      period: { start: '2024-01-01', end: '2024-12-31' },
      semanticRelationship: 'surrogate_not_equivalent',
      generatedAt: '2026-06-18T13:15:00Z',
      filters: {
        denominatorDrift: 'residual_cql_or_qicore_semantic_gap',
        numeratorDrift: null,
        exclusionDrift: null,
        patientId: 3,
      },
      pagination: { limit: 5, offset: 10, total: 27, returned: 1, hasMore: true },
      classificationCounts: {},
      rows: [
        {
          dossierPatientId: 1001,
          patientId: 3,
          reviewPriority: 100,
          reviewHint: 'Inspect QI-Core projection.',
        },
      ],
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-worklist?dossierId=42&denominatorDrift=residual_cql_or_qicore_semantic_gap&patientId=3&limit=5&offset=10',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        worklist: {
          dossierId: 42,
          rows: [{ dossierPatientId: 1001, reviewPriority: 100 }],
        },
      },
    });
    expect(mockListSemanticDriftWorklist).toHaveBeenCalledWith({
      measureCode: 'CMS122v12',
      dossierId: 42,
      denominatorDrift: 'residual_cql_or_qicore_semantic_gap',
      numeratorDrift: undefined,
      exclusionDrift: undefined,
      patientId: 3,
      limit: 5,
      offset: 10,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_semantic_drift_worklist_view',
      'measure_semantic_drift_dossier',
      '42',
      expect.objectContaining({
        measureCode: 'CMS122v12',
        dossierId: 42,
        filters: expect.objectContaining({
          denominatorDrift: 'residual_cql_or_qicore_semantic_gap',
          hasPatientFilter: true,
        }),
      }),
    );
    expect(JSON.stringify(mockAuditLog.mock.calls[0]?.[3])).not.toContain('"patientId":3');
    await app.close();
  });

  it('reads a semantic drift detail row and audits PHI evidence access', async () => {
    mockGetSemanticDriftDetail.mockResolvedValueOnce({
      measureCode: 'CMS122v12',
      dossierId: 42,
      dossierPatientId: 1001,
      sourceMeasureCode: 'DM-02',
      reconciliationRunId: 7003,
      measureReportId: 9001,
      period: { start: '2024-01-01', end: '2024-12-31' },
      semanticRelationship: 'surrogate_not_equivalent',
      generatedAt: '2026-06-18T13:15:00Z',
      worklistRow: {
        dossierPatientId: 1001,
        patientId: 3,
        patientRef: 'Patient/3',
        denominatorDrift: 'residual_cql_or_qicore_semantic_gap',
      },
      measureReportEvidence: {
        id: 90001,
        measureReportId: 9001,
        qdmEvidenceCount: 2,
        fhirSubjectReportPresent: true,
        qdmEvidence: [{ qdmEventId: 1 }],
        fhirSubjectReport: { resourceType: 'MeasureReport' },
      },
    });
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-worklist/1001',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        detail: {
          dossierPatientId: 1001,
          measureReportEvidence: { id: 90001, qdmEvidenceCount: 2 },
        },
      },
    });
    expect(mockGetSemanticDriftDetail).toHaveBeenCalledWith({
      measureCode: 'CMS122v12',
      dossierPatientId: 1001,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_semantic_drift_detail_view',
      'measure_semantic_drift_patient',
      '1001',
      expect.objectContaining({
        measureCode: 'CMS122v12',
        dossierId: 42,
        dossierPatientId: 1001,
        patientId: 3,
        patientRef: 'Patient/3',
        measureReportEvidenceId: 90001,
        qdmEvidenceCount: 2,
        fhirSubjectReportPresent: true,
      }),
    );
    const auditMetadata = mockAuditLog.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(auditMetadata).not.toHaveProperty('qdmEvidence');
    expect(auditMetadata).not.toHaveProperty('fhirSubjectReport');
    expect(JSON.stringify(auditMetadata)).not.toContain('qdmEventId');
    expect(JSON.stringify(auditMetadata)).not.toContain('MeasureReport');
    await app.close();
  });

  it('lists QDM bridge operational status and audits aggregate access', async () => {
    mockGetQdmBridgeOperationalStatus.mockResolvedValueOnce([
      {
        operation: 'cql_shadow_refresh',
        measureCode: 'CMS122v12',
        latestRunId: '11111111-1111-4111-8111-111111111111',
        latestStatus: 'completed',
        latestStartedAt: '2026-06-18T14:00:00Z',
        latestCompletedAt: '2026-06-18T14:10:00Z',
        openIssueCount: 1,
        openBlockingIssueCount: 0,
        latestResult: { evidenceRowsPersisted: 256 },
        latestError: null,
      },
    ]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/qdm-bridge/status?measureCode=CMS122v12',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { status: [{ operation: 'cql_shadow_refresh', measureCode: 'CMS122v12' }] },
    });
    expect(mockGetQdmBridgeOperationalStatus).toHaveBeenCalledWith('CMS122v12');
    expect(mockAuditLog).toHaveBeenCalledWith(
      'qdm_bridge_status_view',
      'qdm_bridge_run',
      'CMS122v12',
      expect.objectContaining({ measureCode: 'CMS122v12', returned: 1 }),
    );
    await app.close();
  });

  it('lists QDM bridge runs with bounded filters', async () => {
    mockListQdmBridgeRuns.mockResolvedValueOnce([
      {
        id: '11111111-1111-4111-8111-111111111111',
        operation: 'cql_shadow_refresh',
        measureCode: 'CMS122v12',
        status: 'completed',
      },
    ]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/qdm-bridge/runs?measureCode=CMS122v12&operation=cql_shadow_refresh&status=completed&limit=10&offset=0',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { runs: [{ operation: 'cql_shadow_refresh', status: 'completed' }] },
    });
    expect(mockListQdmBridgeRuns).toHaveBeenCalledWith({
      measureCode: 'CMS122v12',
      operation: 'cql_shadow_refresh',
      status: 'completed',
      limit: 10,
      offset: 0,
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'qdm_bridge_runs_view',
      'qdm_bridge_run',
      'CMS122v12',
      expect.objectContaining({
        operation: 'cql_shadow_refresh',
        status: 'completed',
        pagination: expect.objectContaining({ returned: 1 }),
      }),
    );
    await app.close();
  });

  it('lists QDM bridge issues without raw evidence payloads in audit metadata', async () => {
    mockListQdmBridgeIssues.mockResolvedValueOnce([
      {
        id: '22222222-2222-4222-8222-222222222222',
        runId: '11111111-1111-4111-8111-111111111111',
        issueType: 'missing_timing',
        severity: 'warning',
        status: 'open',
        measureCode: 'CMS122v12',
        patientId: 3,
        message: 'QDM event has no clinically usable timing',
        details: { qdmDatatype: 'Laboratory Test, Performed' },
      },
    ]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/qdm-bridge/issues?measureCode=CMS122v12&severity=warning&status=open&limit=5',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { issues: [{ issueType: 'missing_timing', patientId: 3 }] },
    });
    expect(mockListQdmBridgeIssues).toHaveBeenCalledWith({
      measureCode: 'CMS122v12',
      runId: undefined,
      severity: 'warning',
      status: 'open',
      limit: 5,
      offset: undefined,
    });
    const auditMetadata = mockAuditLog.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(auditMetadata).toMatchObject({
      measureCode: 'CMS122v12',
      severity: 'warning',
      status: 'open',
      pagination: expect.objectContaining({ returned: 1 }),
    });
    expect(JSON.stringify(auditMetadata)).not.toContain('Laboratory Test');
    await app.close();
  });

  it('rejects invalid QDM bridge run filters before calling services', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/qdm-bridge/runs?operation=promote_anyway',
    });

    expect(res.statusCode).toBe(400);
    expect(mockListQdmBridgeRuns).not.toHaveBeenCalled();
    await app.close();
  });

  it('maps promotion governance errors into API error envelopes', async () => {
    mockPromote.mockRejectedValueOnce(
      new MockMeasurePromotionError(
        'INCOMPLETE_MEASURE_REPORT_EVIDENCE',
        'All MeasureReport evidence rows must resolve patient, measure, and period dimensions before promotion',
        409,
        {
          evidenceRowsSeen: 4,
          evidenceRowsPromotable: 3,
          distinctPatientKeys: 4,
          distinctMeasureKeys: 1,
          expectedInitialPopulation: 4,
          qdmEvidence: [{ patientId: 123, qdmEventId: 'secret-event' }],
          fhirSubjectReport: { subject: 'Patient/secret' },
        },
      ),
    );
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/measure-promotion-configs/CMS122v12/promote-cql-authoritative',
      payload: { reconciliationRunId: 7001, measureReportId: 9001 },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      success: false,
      error: {
        code: 'INCOMPLETE_MEASURE_REPORT_EVIDENCE',
        details: {
          evidenceRowsSeen: 4,
          evidenceRowsPromotable: 3,
          distinctPatientKeys: 4,
          distinctMeasureKeys: 1,
          expectedInitialPopulation: 4,
        },
      },
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_promotion_cql_authoritative_attempt',
      'measure_promotion_config',
      'CMS122v12',
      expect.objectContaining({
        status: 'failed',
        reconciliationRunId: 7001,
        measureReportId: 9001,
        errorCode: 'INCOMPLETE_MEASURE_REPORT_EVIDENCE',
        httpStatus: 409,
        errorDetails: expect.objectContaining({
          evidenceRowsSeen: 4,
          evidenceRowsPromotable: 3,
          distinctPatientKeys: 4,
          distinctMeasureKeys: 1,
          expectedInitialPopulation: 4,
        }),
      }),
    );
    const attemptAudit = mockAuditLog.mock.calls.find(
      ([action]) => action === 'measure_promotion_cql_authoritative_attempt',
    )?.[3] as Record<string, unknown>;
    expect(JSON.stringify(attemptAudit)).not.toMatch(/qdmEvidence|fhirSubjectReport|qdmEventId|Patient\/|patientId/);
    expect(JSON.stringify(res.json().error.details)).not.toMatch(
      /qdmEvidence|fhirSubjectReport|qdmEventId|Patient\/|patientId/,
    );
    await app.close();
  });

  it('preserves promotion governance errors when failure audit logging fails', async () => {
    mockPromote.mockRejectedValueOnce(
      new MockMeasurePromotionError(
        'RECONCILIATION_NOT_ACCEPTED',
        'Only accepted reconciliation runs can promote CQL results',
        409,
        { status: 'drift', agree: false, deltas: { denominator: 1, numerator: 0, exclusion: 0 }, tolerance: 0 },
      ),
    );
    mockAuditLog.mockRejectedValueOnce(new Error('audit store unavailable'));
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/measure-promotion-configs/CMS122v12/promote-cql-authoritative',
      payload: { reconciliationRunId: 7001, measureReportId: 9001 },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      success: false,
      error: {
        code: 'RECONCILIATION_NOT_ACCEPTED',
        details: {
          status: 'drift',
          agree: false,
          deltas: { denominator: 1, numerator: 0, exclusion: 0 },
          tolerance: 0,
        },
      },
    });
    expect(mockAuditLog).toHaveBeenCalledWith(
      'measure_promotion_cql_authoritative_attempt',
      'measure_promotion_config',
      'CMS122v12',
      expect.objectContaining({ status: 'failed', errorCode: 'RECONCILIATION_NOT_ACCEPTED' }),
    );
    await app.close();
  });

  it('maps semantic drift dossier errors into API error envelopes', async () => {
    mockGenerateSemanticDriftDossier.mockRejectedValueOnce(
      new MockMeasurePromotionError(
        'RECONCILIATION_SCOPE_NOT_FULL_POPULATION',
        'Semantic drift dossiers require full-population runs',
        409,
      ),
    );
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-dossier',
      payload: { reconciliationRunId: 2 },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'RECONCILIATION_SCOPE_NOT_FULL_POPULATION' },
    });
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('maps semantic drift detail errors into API error envelopes without auditing', async () => {
    mockGetSemanticDriftDetail.mockRejectedValueOnce(
      new MockMeasurePromotionError(
        'SEMANTIC_DRIFT_PATIENT_NOT_FOUND',
        'No semantic drift patient row 999 exists for CMS122v12',
        404,
      ),
    );
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-worklist/999',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'SEMANTIC_DRIFT_PATIENT_NOT_FOUND' },
    });
    expect(mockAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects non-admin users before calling governance services', async () => {
    const app = await buildApp(PROVIDER_USER);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs',
    });

    expect(res.statusCode).toBe(403);
    expect(mockListConfigs).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects invalid promotion payloads before calling the service', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/measure-promotion-configs/CMS122v12/promote-cql-authoritative',
      payload: { reconciliationRunId: 0, measureReportId: 9001 },
    });

    expect(res.statusCode).toBe(400);
    expect(mockPromote).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects invalid semantic drift dossier payloads before calling the service', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-dossier',
      payload: { patientSampleLimit: 0 },
    });

    expect(res.statusCode).toBe(400);
    expect(mockGenerateSemanticDriftDossier).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects invalid semantic drift worklist queries before calling the service', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-worklist?limit=0',
    });

    expect(res.statusCode).toBe(400);
    expect(mockListSemanticDriftWorklist).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects invalid semantic drift detail ids before calling the service', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-worklist/not-an-id',
    });

    expect(res.statusCode).toBe(400);
    expect(mockGetSemanticDriftDetail).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects coercive semantic drift detail ids before calling the service', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/measure-promotion-configs/CMS122v12/semantic-drift-worklist/1e2',
    });

    expect(res.statusCode).toBe(400);
    expect(mockGetSemanticDriftDetail).not.toHaveBeenCalled();
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
        const role = request.user.role;
        if (!(roles.includes(role) || (role === 'super_admin' && roles.includes('admin')))) {
          await reply.status(403).send({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: `Role '${role}' is not permitted to access this resource`,
            },
          });
        }
      },
  );
  app.decorate(
    'requirePermission',
    (permission: string) => async (request: FastifyRequest, reply: FastifyReply) => {
      const role = request.user.role;
      const superAdminOnly = new Set(['admin:auth-providers', 'admin:ai-providers', 'admin:roles']);
      if (superAdminOnly.has(permission) && role !== 'super_admin') {
        await reply.status(403).send({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `Permission '${permission}' is required to access this resource`,
          },
        });
      }
    },
  );
  app.decorate('requireSuperAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user.role !== 'super_admin') {
      await reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Super-admin access is required to access this resource',
        },
      });
    }
  });
  app.decorateRequest('auditLog', mockAuditLog);
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.ready();
  return app;
}
