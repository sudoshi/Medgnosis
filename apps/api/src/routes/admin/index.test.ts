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
  getMeasureEvaluator: vi.fn(() => ({ refresh: vi.fn() })),
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
vi.mock('../../services/auth/oidc/discovery.js', () => ({ fetchOidcDiscovery: vi.fn() }));
vi.mock('../../services/auth/oidc/providerConfig.js', () => ({
  getOidcProviderConfig: vi.fn(() => ({ enabled: false })),
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
  org_id: 'org-1',
};

const PROVIDER_USER: JwtPayload = {
  sub: '00000000-0000-4000-8000-000000000002',
  email: 'provider@example.test',
  role: 'provider',
  org_id: 'org-1',
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
    const app = await buildApp();

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
    const app = await buildApp();

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
      const app = await buildApp();

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
});

describe('admin user invitation routes', () => {
  it('lists users with pending invite status metadata', async () => {
    const pendingInvite = {
      id: '99999999-9999-4999-8999-999999999999',
      expires_at: '2099-01-01T00:00:00Z',
      created_at: '2026-06-18T00:00:00Z',
      status: 'pending',
    };
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const query = strings.join('');
      expect(query).toContain('public.app_user_invites');
      expect(query).toContain('pending_invite');
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
        expect(values[4]).toBe('$2b$12$pendinginvitehash');
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
      reconciliationRunId: 7001,
      measureReportId: 9001,
      dryRun: false,
      rowsPromoted: 1,
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
      'measure_promotion_cql_authoritative',
      'measure_promotion_config',
      'CMS122v12',
      expect.objectContaining({ reconciliationRunId: 7001, measureReportId: 9001, rowsPromoted: 1 }),
    );
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
        'RECONCILIATION_NOT_ACCEPTED',
        'Only accepted reconciliation runs can promote CQL results',
        409,
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
      error: { code: 'RECONCILIATION_NOT_ACCEPTED' },
    });
    expect(mockAuditLog).not.toHaveBeenCalled();
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
    () => async () => {
      /* no-op permission gate for focused admin route tests */
    },
  );
  app.decorate('requireSuperAdmin', async () => {
    /* no-op super-admin gate for focused admin route tests */
  });
  app.decorateRequest('auditLog', mockAuditLog);
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.ready();
  return app;
}
