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
