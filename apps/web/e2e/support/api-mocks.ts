import type { Page, Route } from '@playwright/test';

type MockResponseBody = Record<string, unknown>;

async function fulfillJson(route: Route, body: MockResponseBody, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function successBody(data: unknown, meta?: MockResponseBody): MockResponseBody {
  return meta
    ? { success: true, data, meta }
    : { success: true, data };
}

export async function mockAuthProviderDiscovery(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/providers', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          local_enabled: true,
          oidc_enabled: false,
          oidc_label: null,
          oidc_redirect_path: null,
        },
      }),
    });
  });
}

export const invitedUser = {
  id: '00000000-0000-4000-8000-000000000111',
  email: 'invited.clinician@example.test',
  first_name: 'Invited',
  last_name: 'Clinician',
  role: 'provider',
  roles: ['provider'],
  permissions: ['patients:read'],
  org_id: '00000000-0000-4000-8000-000000000222',
  provider_id: 101,
  mfa_enabled: false,
  must_change_password: false,
  created_at: '2026-06-18T12:00:00.000Z',
  updated_at: '2026-06-18T12:00:00.000Z',
};

export const invitedAuthTokens = {
  access_token: 'e2e-access-token',
  refresh_token: 'e2e-refresh-token',
  expires_in: 900,
};

export const providerUser = {
  ...invitedUser,
  id: '00000000-0000-4000-8000-000000000121',
  email: 'provider@example.test',
  first_name: 'Priya',
  last_name: 'Provider',
  permissions: ['patients:read', 'patients:write'],
};

export const providerAuthTokens = {
  access_token: 'e2e-provider-access-token',
  refresh_token: 'e2e-provider-refresh-token',
  expires_in: 900,
};

export const analystUser = {
  id: '00000000-0000-4000-8000-000000000131',
  email: 'analyst@example.test',
  first_name: 'Alex',
  last_name: 'Analyst',
  role: 'analyst',
  roles: ['analyst'],
  permissions: ['patients:read'],
  org_id: invitedUser.org_id,
  provider_id: null,
  mfa_enabled: false,
  must_change_password: false,
  created_at: '2026-06-18T12:00:00.000Z',
  updated_at: '2026-06-18T12:00:00.000Z',
};

export const analystAuthTokens = {
  access_token: 'e2e-analyst-access-token',
  refresh_token: 'e2e-analyst-refresh-token',
  expires_in: 900,
};

export const adminUser = {
  id: '00000000-0000-4000-8000-000000000010',
  email: 'admin@example.test',
  first_name: 'Ada',
  last_name: 'Admin',
  role: 'super_admin',
  roles: ['super_admin', 'admin'],
  permissions: [
    'admin:access',
    'admin:users',
    'admin:roles',
    'admin:auth-providers',
    'admin:audit',
    'admin:system-health',
    'admin:etl',
    'admin:ehr',
  ],
  org_id: '00000000-0000-4000-8000-000000000333',
  provider_id: null,
  mfa_enabled: false,
  must_change_password: false,
  created_at: '2026-06-18T12:00:00.000Z',
  updated_at: '2026-06-18T12:00:00.000Z',
};

export const adminAuthTokens = {
  access_token: 'e2e-admin-access-token',
  refresh_token: 'e2e-admin-refresh-token',
  expires_in: 900,
};

export const superAdminUser = adminUser;
export const superAdminAuthTokens = adminAuthTokens;

export const standardAdminUser = {
  ...adminUser,
  id: '00000000-0000-4000-8000-000000000141',
  email: 'standard.admin@example.test',
  first_name: 'Anika',
  last_name: 'Admin',
  role: 'admin',
  roles: ['admin'],
  permissions: [
    'admin:access',
    'admin:users',
    'admin:audit',
    'admin:system-health',
    'admin:etl',
    'admin:ehr',
    'patients:read',
    'patients:write',
  ],
};

export const standardAdminAuthTokens = {
  access_token: 'e2e-standard-admin-access-token',
  refresh_token: 'e2e-standard-admin-refresh-token',
  expires_in: 900,
};

export const mfaEnabledAdminUser = {
  ...adminUser,
  mfa_enabled: true,
};

export const mfaChallenge = {
  mfa_required: true,
  mfa_token: 'e2e-pending-mfa-token',
  expires_in: 300,
  user: {
    id: adminUser.id,
    email: adminUser.email,
    first_name: adminUser.first_name,
    last_name: adminUser.last_name,
    role: adminUser.role,
  },
};

export const pendingInvite = {
  email: invitedUser.email,
  first_name: invitedUser.first_name,
  last_name: invitedUser.last_name,
  role: invitedUser.role,
  expires_at: '2026-06-25T12:00:00.000Z',
};

export function inviteLookupSuccessBody(body: MockResponseBody = {}): MockResponseBody {
  return {
    success: true,
    data: {
      invite: {
        ...pendingInvite,
        ...body,
      },
    },
  };
}

export function inviteActivationSuccessBody(body: MockResponseBody = {}): MockResponseBody {
  return {
    success: true,
    data: {
      message: 'Your account is active. Redirecting to sign in...',
      ...body,
    },
  };
}

export function inviteActivationErrorBody(message = 'Invite link has expired.'): MockResponseBody {
  return {
    success: false,
    error: {
      code: 'INVITE_INVALID',
      message,
    },
  };
}

export async function seedAuthenticatedSession(
  page: Page,
  user: MockResponseBody = adminUser,
  tokens: MockResponseBody = adminAuthTokens,
): Promise<void> {
  await page.addInitScript(({ seededUser, seededTokens }) => {
    window.localStorage.setItem('medgnosis-auth', JSON.stringify({
      state: {
        user: seededUser,
        tokens: seededTokens,
        isAuthenticated: true,
      },
      version: 0,
    }));
  }, { seededUser: user, seededTokens: tokens });
}

export async function mockAuthenticatedShellApis(page: Page): Promise<void> {
  await page.route('**/api/v1/dashboard', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          stats: {
            total_patients: { value: 0, trend: 0 },
            active_patients: 0,
            care_gaps: { value: 0, trend: 0 },
            risk_score: { high_risk_count: 0, high_risk_percentage: 0, trend: 0 },
            encounters: { value: 0, trend: 0 },
          },
          analytics: {
            care_gap_summary: {
              total: 0,
              by_priority: { high: 0, medium: 0, low: 0 },
            },
            risk_stratification: { distribution: [] },
            recent_encounters: [],
          },
          clinician: {
            todays_schedule: [],
            urgent_alerts: [],
            critical_alert_count: 0,
            abby_briefing: {
              enabled: true,
              message: 'Ask me about your patients or care gaps.',
            },
          },
        },
      }),
    });
  });

  await page.route('**/api/v1/alerts**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          alerts: [],
          pagination: { page: 1, per_page: 1, total: 0 },
        },
      }),
    });
  });

  await page.route('**/api/v1/insights/morning-briefing', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { briefing: 'Ask me about your patients or care gaps.' },
      }),
    });
  });
}

export async function mockSmartLaunchCompletion(
  page: Page,
  body: MockResponseBody = { patient_id: 123 },
  status = 200,
): Promise<void> {
  await page.route('**/api/v1/ehr/launch/complete', async (route) => {
    const success = status >= 200 && status < 300;
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(success
        ? {
          success: true,
          data: {
            smart_session_id: '11111111-1111-4111-8111-111111111111',
            ehr_tenant_id: 42,
            patient_id: null,
            launch_context: {
              patient: 'Patient/pat-1',
              fhirUser: 'Practitioner/doc-1',
            },
            ...body,
          },
        }
        : {
          success: false,
          error: {
            code: 'SMART_HANDOFF_INVALID',
            message: 'SMART launch handoff is invalid or expired',
          },
        }),
    });
  });
}

export async function mockPatientDetailApis(page: Page, patientId = 123): Promise<void> {
  await page.route(`**/api/v1/patients/${patientId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: patientId,
          first_name: 'Ehr',
          last_name: 'Launch',
          mrn: 'MRN-123',
          date_of_birth: '1975-04-12',
          gender: 'female',
          race: null,
          ethnicity: null,
          primary_phone: null,
          email: null,
          active_ind: 'Y',
          pcp: null,
          insurance: null,
          address: null,
          allergies: [],
          summary: {
            conditions_count: 0,
            encounters_count: 0,
            allergies_count: 0,
            open_care_gaps_count: 0,
          },
        },
      }),
    });
  });

  for (const suffix of ['conditions', 'encounters', 'observations', 'medications']) {
    await page.route(`**/api/v1/patients/${patientId}/${suffix}**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], meta: { total: 0 } }),
      });
    });
  }

  await page.route(`**/api/v1/patients/${patientId}/care-bundle`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          overall_compliance_pct: 100,
          bundles: [],
          total_measures: 0,
          deduplicated_measures: 0,
        },
      }),
    });
  });
}

export async function mockAdminApis(page: Page): Promise<void> {
  await page.route('**/api/v1/admin/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          total_providers: 12,
          active_patients: 2475,
          open_care_gaps: 31,
          star_bundle_rows: 2475,
          star_composite_rows: 2475,
          last_etl_status: 'success',
          last_etl_at: '2026-06-18T12:00:00.000Z',
        },
      }),
    });
  });

  await page.route('**/api/v1/admin/audit-log**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          logs: [
            {
              audit_id: 'audit-1',
              event_type: 'login',
              target_type: 'app_user',
              target_id: adminUser.id,
              description: 'Admin signed in',
              user_email: adminUser.email,
              user_first_name: adminUser.first_name,
              user_last_name: adminUser.last_name,
              created_at: '2026-06-18T12:00:00.000Z',
            },
          ],
          total: 1,
        },
      }),
    });
  });

  await page.route('**/api/v1/admin/users', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          users: [
            {
              id: adminUser.id,
              email: adminUser.email,
              first_name: adminUser.first_name,
              last_name: adminUser.last_name,
              role: adminUser.role,
              is_active: true,
              created_at: adminUser.created_at,
              last_login_at: '2026-06-18T12:00:00.000Z',
              provider_first_name: null,
              provider_last_name: null,
              pending_invite: null,
            },
            {
              id: '00000000-0000-4000-8000-000000000011',
              email: 'pending.clinician@example.test',
              first_name: 'Pending',
              last_name: 'Clinician',
              role: 'provider',
              is_active: false,
              created_at: '2026-06-18T12:10:00.000Z',
              last_login_at: null,
              provider_first_name: null,
              provider_last_name: null,
              pending_invite: {
                id: '00000000-0000-4000-8000-000000000012',
                expires_at: '2026-06-25T12:00:00.000Z',
                created_at: '2026-06-18T12:10:00.000Z',
                status: 'pending',
              },
            },
          ],
        },
      }),
    });
  });

  await page.route('**/api/v1/admin/users/*/revoke-invite', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          user: {
            id: '00000000-0000-4000-8000-000000000011',
            email: 'pending.clinician@example.test',
            first_name: 'Pending',
            last_name: 'Clinician',
            role: 'provider',
            is_active: false,
          },
          invite: {
            id: '00000000-0000-4000-8000-000000000012',
            user_id: '00000000-0000-4000-8000-000000000011',
            expires_at: '2026-06-25T12:00:00.000Z',
            revoked_at: '2026-06-18T12:30:00.000Z',
          },
        },
      }),
    });
  });
}

export async function mockSettingsApis(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/me/preferences', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {},
      }),
    });
  });

  await page.route('**/api/v1/auth/sessions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          sessions: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              created_at: '2026-06-18T12:00:00.000Z',
              expires_at: '2026-06-25T12:00:00.000Z',
              revoked: false,
              revoked_at: null,
              last_used_at: '2026-06-18T12:30:00.000Z',
              ip_address: '127.0.0.1',
              user_agent: 'Mozilla/5.0 Chrome/125.0',
              active: true,
              current: true,
            },
            {
              id: '22222222-2222-4222-8222-222222222222',
              created_at: '2026-06-18T10:00:00.000Z',
              expires_at: '2026-06-25T10:00:00.000Z',
              revoked: false,
              revoked_at: null,
              last_used_at: '2026-06-18T11:15:00.000Z',
              ip_address: '203.0.113.10',
              user_agent: 'Mozilla/5.0 Safari/605.1.15',
              active: true,
              current: false,
            },
          ],
        },
      }),
    });
  });

  await page.route('**/api/v1/auth/sessions/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          session: {
            id: '22222222-2222-4222-8222-222222222222',
            revoked_at: '2026-06-18T12:45:00.000Z',
          },
        },
      }),
    });
  });

  await page.route('**/api/v1/auth/mfa/setup', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          manual_secret: 'JBSWY3DPEHPK3PXP',
          otpauth_url: 'otpauth://totp/Medgnosis:admin@example.test?secret=JBSWY3DPEHPK3PXP&issuer=Medgnosis',
          qr_code_data_url: 'data:image/png;base64,iVBORw0KGgo=',
          expires_in: 600,
        },
      }),
    });
  });

  await page.route('**/api/v1/auth/mfa/confirm', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          user: mfaEnabledAdminUser,
          recovery_codes: [
            'MG-ABCDEFGH-234567AB',
            'MG-BCDEFGHI-34567ABC',
            'MG-CDEFGHIJ-4567ABCD',
            'MG-DEFGHIJK-567ABCDE',
            'MG-EFGHIJKL-67ABCDEF',
            'MG-FGHIJKLM-7ABCDEFG',
            'MG-GHIJKLMN-ABCDEFGH',
            'MG-HIJKLMNO-BCDEFGHI',
          ],
        },
      }),
    });
  });

  await page.route('**/api/v1/auth/mfa/disable', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          user: {
            ...adminUser,
            mfa_enabled: false,
          },
        },
      }),
    });
  });
}

const releaseSmokeNow = '2026-06-26T20:00:00.000Z';

const releaseSmokeTenant = {
  id: 42,
  orgId: 7,
  vendor: 'epic',
  name: 'Epic Sandbox Smoke',
  environment: 'sandbox',
  fhirBaseUrl: 'https://fhir.epic.example.test/interconnect-fhir-oauth/api/FHIR/R4',
  smartConfigUrl: 'https://fhir.epic.example.test/.well-known/smart-configuration',
  issuer: 'https://fhir.epic.example.test/interconnect-fhir-oauth/api/FHIR/R4',
  audience: 'https://fhir.epic.example.test/interconnect-fhir-oauth/api/FHIR/R4',
  status: 'testing',
  createdAt: releaseSmokeNow,
  updatedAt: releaseSmokeNow,
};

function releaseSmokeHealth() {
  return {
    api: { status: 'ok', node_env: 'test' },
    database: { status: 'ok' },
    redis: {
      status: 'ok',
      endpoint: 'localhost:6379/0',
      pubsub: {
        alert_pattern: 'medgnosis:alerts:*',
        patterns: 1,
        alert_channels: 2,
      },
    },
    solr: {
      status: 'ok',
      enabled: true,
      url: 'http://localhost:8984/solr',
      cores: [
        { role: 'search', name: 'search', healthy: true, status: { name: 'search' } },
        { role: 'clinical', name: 'clinical', healthy: true, status: { name: 'clinical' } },
      ],
    },
    auth: {
      status: 'ok',
      local_enabled: true,
      oidc_enabled: true,
      providers: [
        {
          provider_type: 'local',
          display_name: 'Email and password',
          enabled: true,
          status: 'ok',
          updated_at: releaseSmokeNow,
          last_test: null,
          issues: [],
        },
      ],
    },
    workers: {
      status: 'ok',
      total_workers: 4,
      counts: { waiting: 0, active: 0, delayed: 1, failed: 0 },
      queues: [
        {
          name: 'medgnosis-ehr-bulk-import',
          label: 'EHR Bulk import',
          role: 'ehr_bulk',
          status: 'ok',
          workers: 1,
          paused: false,
          counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
        },
        {
          name: 'medgnosis-nightly',
          label: 'Nightly scheduler',
          role: 'scheduler',
          status: 'ok',
          workers: 1,
          paused: false,
          counts: { waiting: 0, active: 0, delayed: 1, failed: 0 },
          repeatable_jobs: 1,
          next_run_at: '2026-06-27T02:00:00.000Z',
          latest_completed_at: releaseSmokeNow,
        },
      ],
    },
    ehr_tenants: {
      status: 'ok',
      tenants: {
        total: 1,
        active: 1,
        disabled: 0,
        healthy: 1,
        degraded: 0,
        blocked: 0,
        production: 0,
        sandbox: 1,
        staging: 0,
      },
      discovery: {
        with_snapshots: 1,
        smart_ok: 1,
        capability_ok: 1,
        with_resource_support: 1,
        issuer_mismatches: 0,
        missing_authorization_endpoint: 0,
        missing_token_endpoint: 0,
        latest_snapshot_at: releaseSmokeNow,
      },
      backend_services: {
        tenants_with_enabled_clients: 1,
        enabled_clients: 1,
        ready_for_token_exchange: 1,
        credentials_incomplete: 0,
        scopes_missing: 0,
        token_requests_24h: 1,
        latest_token_issued_at: releaseSmokeNow,
        latest_token_expired: 0,
      },
      smart_launch: {
        launches_started_24h: 2,
        launches_denied_24h: 0,
        callbacks_succeeded_24h: 2,
        callbacks_failed_24h: 0,
        handoffs_completed_24h: 2,
        expired_pending_launches: 0,
        latest_success_at: releaseSmokeNow,
      },
      fhir_api: {
        failed_requests_24h: 0,
        auth_failures_24h: 0,
        rate_limit_failures_24h: 0,
        network_failures_24h: 0,
        backend_token_failures_24h: 0,
        backend_token_auth_failures_24h: 0,
        latest_failure_at: null,
        affected_resource_types: [],
      },
      resource_coverage: {
        required_resource_types: ['Patient', 'Observation', 'Condition', 'Encounter'],
        tenants_with_required_bulk_coverage: 1,
        tenants_missing_required_bulk_coverage: 0,
        average_required_bulk_coverage: 1,
      },
      issues: [],
    },
    ehr_bulk: {
      status: 'ok',
      queue_enabled: true,
      tenants: {
        total: 1,
        active: 1,
        with_backend_services: 1,
        with_capability_snapshots: 1,
        ready_for_bulk: 1,
      },
      schedules: {
        enabled: 1,
        due: 0,
        failed_24h: 0,
        next_run_at: '2026-06-27T02:00:00.000Z',
      },
      bulk_jobs: {
        active: 0,
        failed_24h: 0,
        completed_24h: 1,
        latest_completed_at: releaseSmokeNow,
      },
      issues: [],
    },
    ehr_sync_alerts: {
      status: 'ok',
      enabled: true,
      configured: true,
      nightly_enabled: true,
      endpoint_host: 'ops.example.test',
      last_dispatch_at: releaseSmokeNow,
      last_dispatch_status: 'sent',
      last_dispatch_reason: 'sent',
      last_issue_count: 3,
      last_critical_issue_count: 1,
      last_warning_issue_count: 2,
    },
    standards: {
      status: 'ok',
      checks: [
        {
          key: 'cql',
          label: 'CQL Engine',
          status: 'ok',
          runtime_configured: true,
          detail: 'CQL smoke assets and runtime are configured',
          commands: ['bash scripts/cql-engine-smoke.sh'],
          artifacts: { present: 4, total: 4, missing: [] },
        },
        {
          key: 'fhir',
          label: 'FHIR US Core / QI-Core',
          status: 'ok',
          runtime_configured: true,
          detail: 'FHIR validator and golden fixtures are available',
          commands: ['./scripts/fhir-validate.sh'],
          artifacts: { present: 5, total: 5, missing: [] },
        },
        {
          key: 'deqm',
          label: 'Da Vinci DEQM',
          status: 'ok',
          runtime_configured: true,
          detail: 'DEQM validator and fixture are available',
          commands: ['./scripts/deqm-validate.sh'],
          artifacts: { present: 3, total: 3, missing: [] },
        },
      ],
      issues: [],
    },
    duration_ms: 9,
  };
}

function releaseSmokeTenantDetail() {
  return {
    tenant: releaseSmokeTenant,
    clientRegistrations: [
      {
        id: 101,
        ehrTenantId: releaseSmokeTenant.id,
        clientType: 'smart_launch',
        clientSlot: 'default',
        clientId: 'smart-launch-client',
        jwksUrl: null,
        redirectUris: ['http://127.0.0.1:5176/ehr/launch/complete'],
        launchUrl: 'https://medgnosis.example.test/ehr/launch',
        scopesRequested: 'openid fhirUser launch patient/Patient.r',
        scopesGranted: 'openid fhirUser launch patient/Patient.r',
        authMethod: 'public_pkce',
        profileId: null,
        profileVersion: null,
        portalAppId: null,
        approvalStatus: 'approved',
        approvalEvidence: {},
        enabled: true,
        hasClientSecretRef: false,
        hasPrivateKeyRef: false,
        createdAt: releaseSmokeNow,
        updatedAt: releaseSmokeNow,
      },
      {
        id: 102,
        ehrTenantId: releaseSmokeTenant.id,
        clientType: 'backend_services',
        clientSlot: 'default',
        clientId: 'backend-services-client',
        jwksUrl: 'https://medgnosis.example.test/.well-known/jwks.json',
        redirectUris: [],
        launchUrl: null,
        scopesRequested: 'system/Patient.rs system/Observation.rs',
        scopesGranted: 'system/Patient.rs system/Observation.rs',
        authMethod: 'private_key_jwt',
        profileId: null,
        profileVersion: null,
        portalAppId: null,
        approvalStatus: 'approved',
        approvalEvidence: {},
        enabled: true,
        hasClientSecretRef: false,
        hasPrivateKeyRef: true,
        createdAt: releaseSmokeNow,
        updatedAt: releaseSmokeNow,
      },
    ],
    latestCapabilitySnapshot: null,
    readiness: {
      clients: [
        {
          clientSlot: 'default',
          clientType: 'smart_launch',
          clientId: 'smart-launch-client',
          authMethod: 'public_pkce',
          status: 'ready',
          missing: [],
        },
        {
          clientSlot: 'default',
          clientType: 'backend_services',
          clientId: 'backend-services-client',
          authMethod: 'private_key_jwt',
          status: 'ready',
          missing: [],
        },
      ],
    },
  };
}

function releaseSmokeSyncStatus() {
  return {
    ehrTenantId: releaseSmokeTenant.id,
    generatedAt: releaseSmokeNow,
    crosswalk: {
      totalResources: 4,
      localTargetResources: 4,
      unmappedLocalResources: 0,
      patientLinkedResources: 4,
      missingPatientResources: 0,
      staleResources: 0,
      collisionResources: 0,
      collisionTargets: 0,
      patientCrosswalks: 1,
      resourceTypes: 4,
      lastSeenAt: releaseSmokeNow,
      staleAfterDays: 7,
    },
    resources: [],
    bulkSchedule: {
      enabledSchedules: 1,
      dueSchedules: 0,
      nextBulkScheduleAt: '2026-06-27T02:00:00.000Z',
      lastBulkScheduleSuccessAt: releaseSmokeNow,
      lastBulkScheduleFailureAt: null,
    },
    bulkWorker: {
      lastEventAt: releaseSmokeNow,
      latestAction: 'ehr_bulk_worker_import',
      lastFailureAt: null,
      failures24h: 0,
      incompleteImports24h: 0,
      activeOverdueJobs: 0,
      oldestOverdueJobAt: null,
    },
    patientSync: {
      totalPatients: 1,
      displayedPatients: 0,
      stalePatients: 0,
      lastPatientSeenAt: releaseSmokeNow,
      staleAfterDays: 7,
    },
    lastSuccessfulIngestAt: releaseSmokeNow,
    lastSuccessfulBulkExportAt: releaseSmokeNow,
    lastSuccessfulBulkImportAt: releaseSmokeNow,
    lastSeenAt: releaseSmokeNow,
    issues: [],
    patientResources: [],
    conflictTargets: [],
    stalePatientResources: [],
  };
}

function releaseSmokeReadinessEvidence() {
  return {
    ehrTenantId: releaseSmokeTenant.id,
    generatedAt: releaseSmokeNow,
    discovery: {
      latestSnapshotId: 12,
      capturedAt: releaseSmokeNow,
      smartConfigurationUrl: 'https://fhir.epic.example.test/.well-known/smart-configuration',
      capabilityStatementUrl: 'https://fhir.epic.example.test/metadata',
      smartOk: true,
      capabilityOk: true,
      registeredIssuer: releaseSmokeTenant.issuer,
      discoveredIssuer: releaseSmokeTenant.issuer,
      issuerMatches: true,
      authorizationEndpointPresent: true,
      tokenEndpointPresent: true,
      fhirVersion: '4.0.1',
      resourceCount: 4,
      drift: [],
    },
    capability: {
      previousSnapshotId: 11,
      previousCapturedAt: '2026-06-25T20:00:00.000Z',
      addedResourceTypes: [],
      removedResourceTypes: [],
      changedResourceTypes: [],
      changedResourceCount: 0,
      requiredBulkResourceTypes: ['Patient', 'Observation', 'Condition', 'Encounter'],
      supportedRequiredBulkResourceTypes: ['Patient', 'Observation', 'Condition', 'Encounter'],
      missingRequiredBulkResourceTypes: [],
      bulkResourceCoverageRatio: 1,
    },
    backendServices: {
      enabledClientCount: 1,
      authMethods: ['private_key_jwt'],
      credentialStatus: 'ready',
      hasClientSecretRef: false,
      hasPrivateKeyRef: true,
      hasJwksUrl: true,
      scopesRequestedCount: 2,
      scopesGrantedCount: 2,
      tokenEndpointPresent: true,
      readyForTokenExchange: true,
      latestTokenIssuedAt: releaseSmokeNow,
      latestTokenExpiresAt: '2026-06-26T21:00:00.000Z',
      latestTokenExpired: false,
      tokenRequests24h: 1,
    },
    launch: {
      latestLaunchStartedAt: releaseSmokeNow,
      latestLaunchDeniedAt: null,
      latestCallbackSucceededAt: releaseSmokeNow,
      latestCallbackFailedAt: null,
      latestHandoffCompletedAt: releaseSmokeNow,
      latestSessionCreatedAt: releaseSmokeNow,
      latestSessionConsumedAt: releaseSmokeNow,
      latestSessionHandoffConsumedAt: releaseSmokeNow,
      activePendingLaunches: 0,
      expiredPendingLaunches: 0,
      launchesStarted24h: 2,
      launchesDenied24h: 0,
      callbacksSucceeded24h: 2,
      callbacksFailed24h: 0,
      handoffsCompleted24h: 2,
    },
    bulkDiagnostics: {
      readyForManualKickoff: true,
      activeJobs: 0,
      failedJobs24h: 0,
      completedJobs24h: 1,
      latestJobRequestedAt: releaseSmokeNow,
      latestCompletedAt: releaseSmokeNow,
      enabledScheduleCount: 1,
      overdueScheduleCount: 0,
      nextScheduledAt: '2026-06-27T02:00:00.000Z',
    },
    issues: [],
  };
}

function releaseSmokeMeasureConfigs() {
  return [
    {
      measureCode: 'CMS122v12',
      promotionMode: 'cql_shadow',
      authoritativeSource: 'sql_bundle',
      tolerance: 0,
      evaluatorSource: 'qdm-cql',
      requireReconciliationAgreement: true,
      metadata: {
        latestShadowMaterialization: {
          sqlCounts: { denominator: 256, numerator: 58, exclusion: 0 },
          cqlCounts: { denominator: 155, numerator: 0, exclusion: 0 },
          deltas: { denominator: 101, numerator: 58, exclusion: 0 },
          evaluationScope: 'full_population',
          measureReportId: 881,
          reconciliationRunId: 441,
          reconciliationStatus: 'drift',
          source: 'qdm-cql',
        },
      },
      latestReconciliationRun: {
        id: 441,
        status: 'drift',
        agree: false,
        promotionEligible: false,
        evaluationScope: 'full_population',
        deltas: { denominator: 101, numerator: 58, exclusion: 0 },
        computedAt: releaseSmokeNow,
      },
    },
    {
      measureCode: 'CMS165v12',
      promotionMode: 'sql_only',
      authoritativeSource: 'sql_bundle',
      tolerance: 0,
      evaluatorSource: null,
      requireReconciliationAgreement: true,
      metadata: {},
      latestReconciliationRun: null,
    },
  ];
}

function releaseSmokeWorklist(measureCode = 'CMS122v12') {
  return {
    measureCode,
    dossierId: 122,
    sourceMeasureCode: null,
    reconciliationRunId: null,
    measureReportId: null,
    period: { start: '2026-01-01', end: '2026-12-31' },
    semanticRelationship: 'cql_shadow_review',
    generatedAt: releaseSmokeNow,
    filters: {
      denominatorDrift: 'residual_cql_or_qicore_semantic_gap',
      numeratorDrift: null,
      exclusionDrift: null,
      patientId: null,
    },
    pagination: {
      limit: 25,
      offset: 0,
      total: 0,
      returned: 0,
      hasMore: false,
    },
    classificationCounts: {},
    rows: [],
  };
}

function releaseSmokeDossier(measureCode = 'CMS122v12') {
  return {
    measureCode,
    binding: null,
    components: {
      fhirLibraryUrl: null,
      fhirMeasureUrl: null,
      elm: null,
      testDeckCoverage: null,
      measureReport: null,
    },
  };
}

export async function mockAdminReleaseSmokeApis(page: Page, unhandledRequests: string[] = []): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.replace(/^\/api\/v1/, '') || '/';
    const method = request.method();

    if (apiPath === '/dashboard') {
      return fulfillJson(route, successBody({
        stats: {
          total_patients: { value: 0, trend: 0 },
          active_patients: 0,
          care_gaps: { value: 0, trend: 0 },
          risk_score: { high_risk_count: 0, high_risk_percentage: 0, trend: 0 },
          encounters: { value: 0, trend: 0 },
        },
        analytics: {
          care_gap_summary: { total: 0, by_priority: { high: 0, medium: 0, low: 0 } },
          risk_stratification: { distribution: [] },
          recent_encounters: [],
        },
        clinician: {
          todays_schedule: [],
          urgent_alerts: [],
          critical_alert_count: 0,
          abby_briefing: { enabled: true, message: 'Ask me about your patients or care gaps.' },
        },
      }));
    }

    if (apiPath === '/alerts') {
      return fulfillJson(route, successBody([], { page: 1, per_page: 50, total: 0, total_pages: 1 }));
    }

    if (apiPath === '/admin/stats') {
      return fulfillJson(route, successBody({
        total_providers: 12,
        active_patients: 2475,
        open_care_gaps: 31,
        star_bundle_rows: 2475,
        star_composite_rows: 2475,
        last_etl_status: 'success',
        last_etl_at: releaseSmokeNow,
      }));
    }

    if (apiPath === '/admin/audit-log') {
      return fulfillJson(route, successBody({
        logs: [
          {
            audit_id: 'audit-1',
            event_type: 'login',
            target_type: 'app_user',
            target_id: adminUser.id,
            description: 'Admin signed in',
            user_email: adminUser.email,
            user_first_name: adminUser.first_name,
            user_last_name: adminUser.last_name,
            created_at: releaseSmokeNow,
          },
        ],
        total: 1,
      }));
    }

    if (method === 'GET' && apiPath === '/admin/system-health') {
      return fulfillJson(route, successBody(releaseSmokeHealth()));
    }

    if (method === 'POST' && apiPath === '/admin/system-health/ehr-sync-alerts/dispatch') {
      return fulfillJson(route, successBody({
        ehrSyncAlertDispatch: {
          status: 'sent',
          reason: 'sent',
          enabled: true,
          configured: true,
          endpointHost: 'ops.example.test',
          generatedAt: releaseSmokeNow,
          tenantCount: 1,
          issueCount: 3,
          criticalIssueCount: 1,
          warningIssueCount: 2,
          statusCode: 202,
        },
      }));
    }

    if (method === 'GET' && apiPath === '/ehr/admin/tenants') {
      return fulfillJson(route, successBody({ tenants: [releaseSmokeTenant], count: 1 }));
    }

    if (method === 'GET' && apiPath === `/ehr/admin/tenants/${releaseSmokeTenant.id}`) {
      return fulfillJson(route, successBody(releaseSmokeTenantDetail()));
    }

    if (method === 'GET' && apiPath === `/ehr/admin/tenants/${releaseSmokeTenant.id}/ingest-runs`) {
      return fulfillJson(route, successBody({
        tenant: releaseSmokeTenant,
        ingestRuns: [],
        latest: null,
        count: 0,
      }));
    }

    if (method === 'GET' && apiPath === `/ehr/admin/tenants/${releaseSmokeTenant.id}/bulk-jobs`) {
      return fulfillJson(route, successBody({
        tenant: releaseSmokeTenant,
        bulkJobs: [],
        latest: null,
        count: 0,
      }));
    }

    if (method === 'GET' && apiPath === `/ehr/admin/tenants/${releaseSmokeTenant.id}/bulk-schedules`) {
      return fulfillJson(route, successBody({
        tenant: releaseSmokeTenant,
        bulkSchedules: [],
        latest: null,
        count: 0,
      }));
    }

    if (method === 'GET' && apiPath === `/ehr/admin/tenants/${releaseSmokeTenant.id}/sync-status`) {
      return fulfillJson(route, successBody({
        tenant: releaseSmokeTenant,
        syncStatus: releaseSmokeSyncStatus(),
      }));
    }

    if (method === 'GET' && apiPath === `/ehr/admin/tenants/${releaseSmokeTenant.id}/readiness-evidence`) {
      return fulfillJson(route, successBody({
        tenant: releaseSmokeTenant,
        readinessEvidence: releaseSmokeReadinessEvidence(),
      }));
    }

    if (method === 'GET' && apiPath === '/admin/measure-promotion-configs') {
      return fulfillJson(route, successBody({ configs: releaseSmokeMeasureConfigs() }));
    }

    const worklistMatch = apiPath.match(/^\/admin\/measure-promotion-configs\/([^/]+)\/semantic-drift-worklist$/);
    if (method === 'GET' && worklistMatch) {
      return fulfillJson(route, successBody({ worklist: releaseSmokeWorklist(decodeURIComponent(worklistMatch[1])) }));
    }

    const configPatchMatch = apiPath.match(/^\/admin\/measure-promotion-configs\/([^/]+)$/);
    if (method === 'PATCH' && configPatchMatch) {
      const measureCode = decodeURIComponent(configPatchMatch[1]);
      const config = releaseSmokeMeasureConfigs().find((item) => item.measureCode === measureCode) ?? {
        measureCode,
        promotionMode: 'sql_only',
        authoritativeSource: 'sql_bundle',
        tolerance: 0,
        evaluatorSource: null,
        requireReconciliationAgreement: true,
        metadata: {},
        latestReconciliationRun: null,
      };
      return fulfillJson(route, successBody({ config: { ...config, promotionMode: 'cql_shadow' } }));
    }

    const dossierGenerateMatch = apiPath.match(/^\/admin\/measure-promotion-configs\/([^/]+)\/semantic-drift-dossier$/);
    if (method === 'POST' && dossierGenerateMatch) {
      const measureCode = decodeURIComponent(dossierGenerateMatch[1]);
      return fulfillJson(route, successBody({
        dossier: {
          dossierId: 223,
          measureCode,
          persisted: true,
          patientRowsReturned: 25,
          patientsPersisted: 25,
        },
      }));
    }

    const promotionMatch = apiPath.match(/^\/admin\/measure-promotion-configs\/([^/]+)\/promote-cql-authoritative$/);
    if (method === 'POST' && promotionMatch) {
      const body = request.postDataJSON() as { dryRun?: boolean } | null;
      return fulfillJson(route, successBody({
        promotion: {
          measureCode: decodeURIComponent(promotionMatch[1]),
          dryRun: body?.dryRun !== false,
          rowsPromoted: body?.dryRun === false ? 155 : 0,
        },
      }));
    }

    if (method === 'GET' && apiPath === '/admin/qdm-bridge/status') {
      return fulfillJson(route, successBody({ status: [] }));
    }

    if (method === 'GET' && apiPath === '/admin/qdm-bridge/issues') {
      return fulfillJson(route, successBody({ issues: [] }));
    }

    const dossierMatch = apiPath.match(/^\/measures\/([^/]+)\/dossier$/);
    if (method === 'GET' && dossierMatch) {
      return fulfillJson(route, successBody(releaseSmokeDossier(decodeURIComponent(dossierMatch[1]))));
    }

    const label = `${method} ${apiPath}${url.search}`;
    unhandledRequests.push(label);
    return fulfillJson(route, {
      success: false,
      error: {
        code: 'E2E_UNHANDLED_ADMIN_RELEASE_SMOKE_API',
        message: `Unhandled admin release-smoke API request: ${label}`,
      },
    }, 500);
  });
}

export async function mockProtectedRouteSmokeApis(page: Page, unhandledRequests: string[] = []): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.replace(/^\/api\/v1/, '') || '/';
    const method = request.method();

    if (apiPath === '/dashboard') {
      return fulfillJson(route, successBody({
        stats: {
          total_patients: { value: 0, trend: 0 },
          active_patients: 0,
          care_gaps: { value: 0, trend: 0 },
          risk_score: { high_risk_count: 0, high_risk_percentage: 0, trend: 0 },
          encounters: { value: 0, trend: 0 },
        },
        analytics: {
          care_gap_summary: { total: 0, by_priority: { high: 0, medium: 0, low: 0 } },
          risk_stratification: { distribution: [] },
          recent_encounters: [],
        },
        clinician: {
          todays_schedule: [],
          urgent_alerts: [],
          critical_alert_count: 0,
          abby_briefing: { enabled: true, message: 'Ask me about your patients or care gaps.' },
        },
      }));
    }

    if (apiPath === '/insights/morning-briefing') {
      return fulfillJson(route, successBody({ briefing: 'Ask me about your patients or care gaps.' }));
    }

    if (apiPath === '/patients') {
      return fulfillJson(route, successBody([], { page: 1, per_page: 20, total: 0, total_pages: 1 }));
    }

    if (/^\/patients\/\d+$/.test(apiPath)) {
      const id = Number(apiPath.split('/')[2]);
      return fulfillJson(route, successBody({
        id,
        first_name: 'Ehr',
        last_name: 'Launch',
        mrn: `MRN-${id}`,
        date_of_birth: '1975-04-12',
        gender: 'female',
        race: null,
        ethnicity: null,
        primary_phone: null,
        email: null,
        active_ind: 'Y',
        pcp: null,
        insurance: null,
        address: null,
        allergies: [],
        summary: {
          conditions_count: 0,
          encounters_count: 0,
          allergies_count: 0,
          open_care_gaps_count: 0,
        },
      }));
    }

    if (/^\/patients\/\d+\/(conditions|encounters|observations|medications|allergies|diagnostic-reports|documents|flowsheet|notes)$/.test(apiPath)) {
      return fulfillJson(route, successBody([], { page: 1, per_page: 20, total: 0, total_pages: 1 }));
    }

    if (/^\/patients\/\d+\/care-bundle$/.test(apiPath)) {
      return fulfillJson(route, successBody({
        overall_compliance_pct: 100,
        bundles: [],
        total_measures: 0,
        deduplicated_measures: 0,
      }));
    }

    if (method === 'POST' && apiPath === '/clinical-notes') {
      return fulfillJson(route, successBody({
        note_id: 'route-smoke-note',
        patient_id: 123,
        visit_type: 'office_visit',
        status: 'draft',
      }));
    }

    if (apiPath === '/measures') {
      return fulfillJson(route, successBody([
        {
          id: 1,
          title: 'Diabetes: Hemoglobin A1c Poor Control',
          code: 'CMS122',
          description: 'Patients with diabetes and elevated HbA1c.',
          active_ind: 'Y',
        },
      ]));
    }

    if (apiPath === '/measures/1') {
      return fulfillJson(route, successBody({
        id: 1,
        title: 'Diabetes: Hemoglobin A1c Poor Control',
        code: 'CMS122',
        description: 'Patients with diabetes and elevated HbA1c.',
        active_ind: 'Y',
        population: { total_patients: 0, compliant: 0, eligible: 0 },
      }));
    }

    if (apiPath === '/bundles/population') {
      return fulfillJson(route, successBody({
        bundles: [
          {
            bundle_key: 1,
            bundle_code: 'DM',
            bundle_name: 'Diabetes Care',
            disease_category: 'Endocrine',
            patient_count: 0,
            avg_compliance_pct: 100,
            total_open_gaps: 0,
            total_closed_gaps: 0,
            critical_patients: 0,
            high_risk_patients: 0,
            bundle_size: 1,
            key_ecqm_refs: 'CMS122',
            description: 'Diabetes bundle smoke fixture.',
          },
        ],
        summary: {
          total_bundles: 1,
          total_patients: 0,
          avg_compliance: 100,
          total_open_gaps: 0,
          total_closed_gaps: 0,
        },
      }));
    }

    if (apiPath === '/bundles/DM') {
      return fulfillJson(route, successBody({
        bundle_code: 'DM',
        measures: [
          {
            measure_id: 1,
            measure_code: 'CMS122',
            measure_name: 'Diabetes: Hemoglobin A1c Poor Control',
            description: 'HbA1c control',
            frequency: 'annual',
            ecqm_reference: 'CMS122',
            ordinal: 1,
          },
        ],
      }));
    }

    if (apiPath === '/bundles/DM/patients') {
      return fulfillJson(route, successBody([], { page: 1, per_page: 20, total: 0, total_pages: 1 }));
    }

    if (apiPath === '/bundles') {
      return fulfillJson(route, successBody([]));
    }

    if (apiPath === '/orders/worklist') {
      return fulfillJson(route, successBody([], { page: 1, per_page: 20, total: 0, total_pages: 1 }));
    }

    if (apiPath === '/alerts') {
      return fulfillJson(route, successBody([], { page: 1, per_page: 50, total: 0, total_pages: 1 }));
    }

    if (apiPath === '/population-finder') {
      return fulfillJson(route, successBody([]));
    }

    if (apiPath === '/close-the-loop/stats') {
      return fulfillJson(route, successBody({ by_status: [], by_closure: [] }));
    }

    if (apiPath === '/close-the-loop') {
      return fulfillJson(route, successBody([]));
    }

    if (/^\/risk-models\/[^/]+\/scores$/.test(apiPath)) {
      return fulfillJson(route, successBody([]));
    }

    if (apiPath === '/amp/roi') {
      return fulfillJson(route, successBody([]));
    }

    if (apiPath === '/amp') {
      return fulfillJson(route, successBody([]));
    }

    if (apiPath === '/auto-orders/enrollments') {
      return fulfillJson(route, successBody([]));
    }

    if (apiPath === '/mtm') {
      return fulfillJson(route, successBody([]));
    }

    if (apiPath === '/surveillance/census') {
      return fulfillJson(route, successBody({ score_type: url.searchParams.get('score') ?? 'MEWS', census: [] }));
    }

    if (apiPath === '/glucometrics/census') {
      return fulfillJson(route, successBody({ census: [], high_risk: 0, total: 0 }));
    }

    if (/^\/supernote\/\d+$/.test(apiPath)) {
      const patientId = Number(apiPath.split('/')[2]);
      return fulfillJson(route, successBody({
        patient: { patient_id: patientId, first_name: 'Ehr', last_name: 'Launch', age: 51, gender: 'female' },
        last_seen: null,
        brief_history: 'Route smoke clinical summary.',
        whats_due: 'Up to date on care gaps.',
        problems_by_system: [],
        interval_events: [],
        care_gaps: [],
        lab_review: [],
        assessment_plan: [
          {
            icd10_code: 'E11.9',
            diagnosis_name: 'Type 2 diabetes mellitus',
            organ_system: 'Endocrine',
            ontology_id: null,
            generate_plan: true,
            previous_plan: null,
            current_plan: 'Continue current plan.',
          },
        ],
      }));
    }

    if (apiPath === '/auth/me/preferences') {
      return fulfillJson(route, successBody({}));
    }

    if (apiPath === '/auth/sessions') {
      return fulfillJson(route, successBody({
        sessions: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            created_at: '2026-06-18T12:00:00.000Z',
            expires_at: '2026-06-25T12:00:00.000Z',
            revoked: false,
            revoked_at: null,
            last_used_at: '2026-06-18T12:30:00.000Z',
            ip_address: '127.0.0.1',
            user_agent: 'Mozilla/5.0 Chrome/125.0',
            active: true,
            current: true,
          },
        ],
      }));
    }

    if (apiPath === '/auth/me/db-overview') {
      return fulfillJson(route, successBody({ schemas: [], tables: [], summary: {} }));
    }

    if (apiPath === '/auth/me/schedule') {
      return fulfillJson(route, successBody([]));
    }

    if (apiPath === '/data-quality/findings') {
      return fulfillJson(route, successBody([]));
    }

    if (apiPath === '/data-quality/feeds') {
      return fulfillJson(route, successBody([]));
    }

    if (apiPath === '/cohorts') {
      return fulfillJson(route, successBody([]));
    }

    if (/^\/cohorts\/\d+\/patients$/.test(apiPath)) {
      return fulfillJson(route, successBody([]));
    }

    if (apiPath === '/cohorts/messages') {
      return fulfillJson(route, successBody([]));
    }

    if (apiPath === '/coding/hcc-capture') {
      return fulfillJson(route, successBody({
        byProvider: [],
        overall: { provider_id: null, provider_name: 'All providers', evident: 0, coded: 0, capture_pct: 0 },
      }));
    }

    if (apiPath === '/coding/em-distribution') {
      return fulfillJson(route, successBody({
        byProvider: [],
        overall: { provider_id: null, provider_name: 'All providers', low_pct: 0, mid_pct: 0, high_pct: 0 },
      }));
    }

    if (apiPath === '/coding/missed-opportunities') {
      return fulfillJson(route, successBody({ lab_evident: [], uncoded_hcc: [], total_uncoded_hcc: 0 }));
    }

    if (apiPath === '/admin/stats') {
      return fulfillJson(route, successBody({
        total_providers: 12,
        active_patients: 2475,
        open_care_gaps: 31,
        star_bundle_rows: 2475,
        star_composite_rows: 2475,
        last_etl_status: 'success',
        last_etl_at: '2026-06-18T12:00:00.000Z',
      }));
    }

    if (apiPath === '/admin/audit-log') {
      return fulfillJson(route, successBody({
        logs: [
          {
            audit_id: 'audit-1',
            event_type: 'login',
            target_type: 'app_user',
            target_id: adminUser.id,
            description: 'Admin signed in',
            user_email: adminUser.email,
            user_first_name: adminUser.first_name,
            user_last_name: adminUser.last_name,
            created_at: '2026-06-18T12:00:00.000Z',
          },
        ],
        total: 1,
      }));
    }

    if (method === 'POST' && apiPath === '/auth/logout') {
      return fulfillJson(route, successBody({ message: 'Logged out' }));
    }

    const label = `${method} ${apiPath}${url.search}`;
    unhandledRequests.push(label);
    return fulfillJson(route, {
      success: false,
      error: {
        code: 'E2E_UNHANDLED_ROUTE_SMOKE_API',
        message: `Unhandled route smoke API request: ${label}`,
      },
    }, 500);
  });
}
