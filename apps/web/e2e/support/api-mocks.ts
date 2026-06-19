import type { Page } from '@playwright/test';

type MockResponseBody = Record<string, unknown>;

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
