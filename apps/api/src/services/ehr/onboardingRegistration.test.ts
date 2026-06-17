import { describe, expect, it, vi } from 'vitest';

vi.mock('@medgnosis/db', () => ({
  sql: vi.fn(),
}));

import {
  applyEhrOnboardingRegistration,
  formatOnboardingRegistrationResult,
  type EhrOnboardingRegistrationDeps,
} from './onboardingRegistration.js';
import type {
  EhrTenant,
  SanitizedEhrClientRegistration,
} from './tenantRegistry.js';

const tenant: EhrTenant = {
  id: 42,
  orgId: 7,
  vendor: 'epic',
  name: 'Epic Sandbox',
  environment: 'sandbox',
  fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
  smartConfigUrl: null,
  issuer: 'https://ehr.example.test',
  audience: 'https://ehr.example.test/fhir/R4',
  status: 'testing',
  createdAt: '2026-06-16T12:00:00Z',
  updatedAt: '2026-06-16T12:00:00Z',
};

function client(overrides: Partial<SanitizedEhrClientRegistration>): SanitizedEhrClientRegistration {
  return {
    id: 1,
    ehrTenantId: 42,
    clientType: 'smart_launch',
    clientSlot: 'smart_launch',
    clientId: 'client',
    jwksUrl: null,
    redirectUris: [],
    launchUrl: null,
    scopesRequested: '',
    scopesGranted: '',
    authMethod: 'public_pkce',
    profileId: 'epic-smart-r4',
    profileVersion: '2026-06-17',
    portalAppId: null,
    approvalStatus: 'draft',
    approvalEvidence: {},
    enabled: true,
    createdAt: '2026-06-16T12:00:00Z',
    updatedAt: '2026-06-16T12:00:00Z',
    hasClientSecretRef: false,
    hasPrivateKeyRef: false,
    ...overrides,
  };
}

function deps(): EhrOnboardingRegistrationDeps {
  return {
    upsertTenant: vi.fn().mockResolvedValue(tenant),
    upsertClientRegistration: vi
      .fn()
      .mockImplementation((input) => Promise.resolve(client(input))),
  };
}

describe('applyEhrOnboardingRegistration', () => {
  it('upserts the tenant and applies SMART/backend defaults from the API base URL', async () => {
    const testDeps = deps();

    const result = await applyEhrOnboardingRegistration(
      {
        tenant: {
          vendor: 'epic',
          name: 'Epic Sandbox',
          environment: 'sandbox',
          fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
          status: 'testing',
        },
        apiBaseUrl: 'https://api.medgnosis.test/',
        smartLaunch: {
          clientId: 'smart-client',
          scopesRequested: 'openid fhirUser launch patient/Patient.r',
        },
        backendServices: {
          clientId: 'backend-client',
          privateKeyRef: 'env:EHR_BACKEND_PRIVATE_JWK_JSON?kid=backend-key-1&alg=RS384',
          scopesRequested: 'system/Patient.rs',
        },
      },
      testDeps,
    );

    expect(result.tenant).toBe(tenant);
    expect(result.clients.map((item) => item.clientType)).toEqual([
      'smart_launch',
      'backend_services',
    ]);
    expect(testDeps.upsertTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor: 'epic',
        fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
      }),
    );
    expect(testDeps.upsertClientRegistration).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        ehrTenantId: 42,
        clientType: 'smart_launch',
        clientSlot: 'smart_launch',
        clientId: 'smart-client',
        redirectUris: ['https://api.medgnosis.test/api/v1/ehr/launch/callback'],
        launchUrl: 'https://api.medgnosis.test/api/v1/ehr/launch/42',
        scopesGranted: 'openid fhirUser launch patient/Patient.r',
        enabled: true,
      }),
    );
    expect(testDeps.upsertClientRegistration).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        clientType: 'backend_services',
        clientSlot: 'backend_services',
        clientId: 'backend-client',
        jwksUrl: 'https://api.medgnosis.test/.well-known/jwks.json',
        privateKeyRef: 'env:EHR_BACKEND_PRIVATE_JWK_JSON?kid=backend-key-1&alg=RS384',
      }),
    );
  });

  it('preserves explicit client URLs and supports CDS Hooks registrations', async () => {
    const testDeps = deps();

    await applyEhrOnboardingRegistration(
      {
        tenant: {
          vendor: 'oracle_cerner',
          name: 'Oracle Cerner Sandbox',
          environment: 'sandbox',
          fhirBaseUrl: 'https://cerner.example.test/r4',
        },
        apiBaseUrl: 'https://api.medgnosis.test',
        smartLaunch: {
          clientId: 'smart-client',
          redirectUris: ['https://custom.example.test/callback'],
          launchUrl: 'https://custom.example.test/launch',
        },
        cdsHooks: {
          clientId: 'cds-client',
          clientSlot: 'cds_hooks',
          clientSecretRef: 'env:CDS_CLIENT_SECRET',
          authMethod: 'fhir_authorization_jwt',
          profileId: 'oracle_cerner-smart-r4',
          profileVersion: '2026-06-17',
          portalAppId: 'cerner-cds-123',
          approvalStatus: 'submitted',
          approvalEvidence: { ticket: 'CER-123' },
          enabled: false,
        },
      },
      testDeps,
    );

    expect(testDeps.upsertClientRegistration).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        redirectUris: ['https://custom.example.test/callback'],
        launchUrl: 'https://custom.example.test/launch',
      }),
    );
    expect(testDeps.upsertClientRegistration).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        clientType: 'cds_hooks',
        clientSlot: 'cds_hooks',
        clientId: 'cds-client',
        clientSecretRef: 'env:CDS_CLIENT_SECRET',
        authMethod: 'fhir_authorization_jwt',
        profileId: 'oracle_cerner-smart-r4',
        profileVersion: '2026-06-17',
        portalAppId: 'cerner-cds-123',
        approvalStatus: 'submitted',
        approvalEvidence: { ticket: 'CER-123' },
        enabled: false,
      }),
    );
  });
});

describe('formatOnboardingRegistrationResult', () => {
  it('renders tenant and sanitized client state without raw secret refs', () => {
    const output = formatOnboardingRegistrationResult({
      tenant,
      clients: [
        {
          ...client({
            clientType: 'backend_services',
            clientSlot: 'backend_services',
            clientId: 'backend-client',
            authMethod: 'private_key_jwt',
            hasPrivateKeyRef: true,
          }),
          clientType: 'backend_services',
        },
      ],
    });

    expect(output).toContain('EHR tenant 42: Epic Sandbox');
    expect(output).toContain('backend_services: backend-client type=backend_services');
    expect(output).toContain('auth=private_key_jwt approval=draft');
    expect(output).toContain('privateKeyRef=true');
    expect(output).not.toContain('EHR_BACKEND_PRIVATE_JWK_JSON');
  });
});
