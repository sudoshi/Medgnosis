import { describe, expect, it, vi } from 'vitest';

vi.mock('@medgnosis/db', () => ({
  sql: {
    end: vi.fn(),
  },
}));

import { parseCliOptions } from './onboard-ehr-tenant.js';

describe('parseCliOptions', () => {
  it('parses required tenant fields and client registrations from CLI flags', () => {
    const options = parseCliOptions(
      [
        '--vendor',
        'epic',
        '--environment=sandbox',
        '--name',
        'Epic Sandbox',
        '--fhir-base-url',
        'https://ehr.example.test/fhir/R4',
        '--api-base-url',
        'https://api.medgnosis.test/',
        '--smart-client-id',
        'smart-client',
        '--smart-redirect-uris',
        'https://api.medgnosis.test/callback, https://api.medgnosis.test/callback-2',
        '--backend-client-id',
        'backend-client',
        '--backend-private-key-ref',
        'env:EHR_BACKEND_PRIVATE_JWK_JSON?kid=backend-key-1&alg=RS384',
        '--backend-portal-app-id',
        'epic-backend-app-123',
        '--backend-approval-status',
        'approved',
        '--backend-approval-evidence-json',
        '{"ticket":"EHR-123","approvedBy":"epic"}',
        '--json',
        '--run-smoke',
      ],
      {},
    );

    expect(options.tenant).toMatchObject({
      vendor: 'epic',
      environment: 'sandbox',
      name: 'Epic Sandbox',
      fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
      status: 'testing',
    });
    expect(options.apiBaseUrl).toBe('https://api.medgnosis.test/');
    expect(options.smartLaunch).toMatchObject({
      clientId: 'smart-client',
      redirectUris: [
        'https://api.medgnosis.test/callback',
        'https://api.medgnosis.test/callback-2',
      ],
      clientSlot: 'smart_launch',
      authMethod: 'public_pkce',
      profileId: 'epic-smart-r4',
      profileVersion: '2026-06-17',
      approvalStatus: 'draft',
      enabled: true,
    });
    expect(options.backendServices).toMatchObject({
      clientId: 'backend-client',
      clientSlot: 'backend_services',
      privateKeyRef: 'env:EHR_BACKEND_PRIVATE_JWK_JSON?kid=backend-key-1&alg=RS384',
      scopesRequested:
        'system/Patient.rs system/Encounter.rs system/Condition.rs system/Observation.rs system/MedicationRequest.rs system/AllergyIntolerance.rs system/Procedure.rs system/Immunization.rs',
      authMethod: 'private_key_jwt',
      profileId: 'epic-smart-r4',
      profileVersion: '2026-06-17',
      portalAppId: 'epic-backend-app-123',
      approvalStatus: 'approved',
      approvalEvidence: { ticket: 'EHR-123', approvedBy: 'epic' },
    });
    expect(options.json).toBe(true);
    expect(options.runSmoke).toBe(true);
  });

  it('supports environment variables and disabled clients', () => {
    const options = parseCliOptions([], {
      EHR_ONBOARD_VENDOR: 'oracle_cerner',
      EHR_ONBOARD_ENVIRONMENT: 'production',
      EHR_ONBOARD_NAME: 'Oracle Cerner Production',
      EHR_ONBOARD_FHIR_BASE_URL: 'https://cerner.example.test/r4',
      EHR_ONBOARD_TENANT_ID: '42',
      EHR_ONBOARD_ORG_ID: '7',
      EHR_ONBOARD_CDS_CLIENT_ID: 'cds-client',
      EHR_ONBOARD_CDS_CLIENT_SECRET_REF: 'env:CDS_CLIENT_SECRET',
      EHR_ONBOARD_CDS_AUTH_METHOD: 'shared_secret',
      EHR_ONBOARD_CDS_PORTAL_APP_ID: 'cerner-cds-app',
      EHR_ONBOARD_CDS_APPROVAL_STATUS: 'submitted',
      EHR_ONBOARD_CDS_ENABLED: 'false',
    });

    expect(options.tenant).toMatchObject({
      id: 42,
      orgId: 7,
      vendor: 'oracle_cerner',
      environment: 'production',
    });
    expect(options.smartLaunch).toBeNull();
    expect(options.backendServices).toBeNull();
    expect(options.cdsHooks).toMatchObject({
      clientId: 'cds-client',
      clientSecretRef: 'env:CDS_CLIENT_SECRET',
      authMethod: 'shared_secret',
      profileId: 'oracle_cerner-smart-r4',
      portalAppId: 'cerner-cds-app',
      approvalStatus: 'submitted',
      enabled: false,
    });
  });

  it('rejects missing required fields and unsupported vendors', () => {
    expect(() => parseCliOptions([], {})).toThrow(/Provide --vendor/);
    expect(() =>
      parseCliOptions(
        [
          '--vendor',
          'unsupported',
          '--environment',
          'sandbox',
          '--name',
          'Test',
          '--fhir-base-url',
          'https://ehr.example.test',
        ],
        {},
      ),
    ).toThrow(/Unsupported vendor/);
    expect(() =>
      parseCliOptions(
        [
          '--vendor',
          'epic',
          '--environment',
          'sandbox',
          '--name',
          'Test',
          '--fhir-base-url',
          'https://ehr.example.test',
          '--smart-client-id',
          'smart-client',
          '--smart-auth-method',
          'unsupported',
        ],
        {},
      ),
    ).toThrow(/Unsupported smart-auth-method/);
  });
});
