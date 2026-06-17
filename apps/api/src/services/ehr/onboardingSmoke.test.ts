import { describe, expect, it, vi } from 'vitest';

vi.mock('@medgnosis/db', () => ({
  sql: vi.fn(),
}));

import {
  formatSmokeReport,
  runEhrOnboardingSmoke,
  type EhrOnboardingSmokeDeps,
} from './onboardingSmoke.js';

const tenant = {
  id: 42,
  orgId: 7,
  vendor: 'epic' as const,
  name: 'Epic Sandbox',
  environment: 'sandbox' as const,
  fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
  smartConfigUrl: null,
  issuer: 'https://ehr.example.test',
  audience: 'https://ehr.example.test/fhir/R4',
  status: 'testing',
  createdAt: '2026-06-16T12:00:00Z',
  updatedAt: '2026-06-16T12:00:00Z',
};

const launchConfig = {
  tenant,
  clientRegistrationId: 9,
  clientId: 'smart-client',
  clientSecretRef: null,
  authMethod: 'public_pkce' as const,
  jwksUrl: null,
  privateKeyRef: null,
  redirectUris: ['https://api.medgnosis.test/api/v1/ehr/launch/callback'],
  launchUrl: 'https://api.medgnosis.test/api/v1/ehr/launch/42',
  scopesRequested: 'openid fhirUser launch patient/Patient.r',
  scopesGranted: 'openid fhirUser launch patient/Patient.r',
  authorizationEndpoint: 'https://ehr.example.test/oauth2/authorize',
  tokenEndpoint: 'https://ehr.example.test/oauth2/token',
};

const backendConfig = {
  tenant,
  clientRegistrationId: 10,
  clientId: 'backend-client',
  authMethod: 'private_key_jwt' as const,
  clientSecretRef: null,
  jwksUrl: 'https://api.medgnosis.test/.well-known/jwks.json',
  privateKeyRef: 'env:EHR_BACKEND_PRIVATE_KEY_PEM?kid=backend-key-1&alg=RS384',
  scopesRequested: 'system/Patient.rs',
  scopesGranted: 'system/Patient.rs system/Observation.rs',
  tokenEndpoint: 'https://ehr.example.test/oauth2/token',
};

const secretBackendConfig = {
  ...backendConfig,
  authMethod: 'client_secret_basic' as const,
  clientSecretRef: 'env:EHR_BACKEND_CLIENT_SECRET',
  jwksUrl: null,
  privateKeyRef: null,
};

function deps(overrides: Partial<EhrOnboardingSmokeDeps> = {}): EhrOnboardingSmokeDeps {
  return {
    getTenant: vi.fn().mockResolvedValue(tenant),
    discoverSmartConfiguration: vi.fn().mockResolvedValue({
      checkedAt: '2026-06-16T12:00:00Z',
      tenant: { id: 42, name: 'Epic Sandbox', vendor: 'epic' },
      endpoints: {
        fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
        smartConfigurationUrl: 'https://ehr.example.test/fhir/R4/.well-known/smart-configuration',
        capabilityStatementUrl: 'https://ehr.example.test/fhir/R4/metadata',
      },
      smartConfiguration: {
        url: 'https://ehr.example.test/fhir/R4/.well-known/smart-configuration',
        ok: true,
        status: 200,
        summary: {
          authorizationEndpoint: 'https://ehr.example.test/oauth2/authorize',
          tokenEndpoint: 'https://ehr.example.test/oauth2/token',
          capabilities: ['launch-ehr'],
          scopesSupported: ['openid', 'fhirUser', 'launch', 'patient/Patient.r'],
          responseTypesSupported: ['code'],
          tokenEndpointAuthMethodsSupported: ['private_key_jwt'],
          codeChallengeMethodsSupported: ['S256'],
        },
      },
      capabilityStatement: {
        url: 'https://ehr.example.test/fhir/R4/metadata',
        ok: true,
        status: 200,
        summary: {
          resourceType: 'CapabilityStatement',
          formats: ['json'],
          security: { services: [], descriptions: [], oauthUris: {}, extensions: [] },
          resourceTypes: ['Patient'],
          resourceSupport: {},
          operations: [],
          instantiates: [],
        },
      },
      support: {
        endpoints: {
          authorization: true,
          token: true,
          registration: false,
          management: false,
          introspection: false,
          revocation: false,
          launch: false,
        },
        scopes: {
          supported: ['openid', 'fhirUser', 'launch', 'patient/Patient.r'],
          patient: ['patient/Patient.r'],
          user: [],
          system: [],
          launch: ['launch'],
          openid: true,
          fhirUser: true,
          onlineAccess: false,
          offlineAccess: false,
          wildcard: false,
        },
        launch: {
          ehr: true,
          standalone: false,
          patientContext: { ehr: false, standalone: false },
          encounterContext: { ehr: false, standalone: false },
        },
        cdsHooks: { advertised: false, hooks: [], fhirAuthorizationRequired: false, hints: [] },
      },
    }),
    loadSmartLaunchConfig: vi.fn().mockResolvedValue(launchConfig),
    loadBackendServicesConfig: vi.fn().mockResolvedValue(backendConfig),
    loadBackendPublicJwksFromEnvironment: vi.fn().mockReturnValue({
      keys: [{ kty: 'RSA', kid: 'backend-key-1', n: 'abc', e: 'AQAB' }],
    }),
    resolvePrivateKeyFromEnvironment: vi.fn().mockResolvedValue({
      key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
      kid: 'backend-key-1',
      alg: 'RS384',
    }),
    requestBackendServiceToken: vi.fn().mockResolvedValue({
      accessToken: {
        accessToken: 'token',
        tokenType: 'Bearer',
        scope: 'system/Patient.rs',
        expiresAt: '2026-06-16T12:05:00Z',
      },
      tokenResponse: {
        access_token: 'token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'system/Patient.rs',
      },
      tokenMetadata: null,
    }),
    readResource: vi.fn().mockResolvedValue({
      resource: { resourceType: 'Patient', id: 'pat-1' },
      audit: {
        method: 'GET',
        interaction: 'read',
        resourceType: 'Patient',
        status: 200,
        attemptCount: 1,
        retryCount: 0,
        durationMs: 10,
        startedAt: '2026-06-16T12:00:00Z',
        completedAt: '2026-06-16T12:00:00Z',
      },
    }),
    fetchImpl: vi.fn(),
    ...overrides,
  };
}

describe('runEhrOnboardingSmoke', () => {
  it('checks tenant, discovery, launch, and backend readiness without calling live token/read paths by default', async () => {
    const testDeps = deps();

    const report = await runEhrOnboardingSmoke({
      tenantId: 42,
      deps: testDeps,
      now: () => '2026-06-16T12:00:00Z',
    });

    expect(report.ok).toBe(true);
    expect(report.summary).toEqual({ pass: 4, fail: 0, warn: 0, skip: 3 });
    expect(report.steps.map((step) => [step.id, step.status])).toEqual([
      ['tenant', 'pass'],
      ['smart-discovery', 'pass'],
      ['smart-launch', 'pass'],
      ['backend-config', 'pass'],
      ['jwks-endpoint', 'skip'],
      ['backend-token', 'skip'],
      ['fhir-read', 'skip'],
    ]);
    expect(testDeps.requestBackendServiceToken).not.toHaveBeenCalled();
    expect(testDeps.readResource).not.toHaveBeenCalled();
  });

  it('calls backend token exchange only when explicitly requested', async () => {
    const testDeps = deps();

    const report = await runEhrOnboardingSmoke({
      tenantId: 42,
      requestBackendToken: true,
      backendScope: 'system/Patient.rs',
      deps: testDeps,
    });

    expect(report.ok).toBe(true);
    expect(testDeps.requestBackendServiceToken).toHaveBeenCalledWith(
      expect.objectContaining({
        config: backendConfig,
        scope: 'system/Patient.rs',
        persistMetadata: false,
      }),
    );
    expect(report.steps.find((step) => step.id === 'backend-token')?.status).toBe('pass');
  });

  it('accepts client-secret backend-services clients without requiring a public JWKS endpoint', async () => {
    const fetchImpl = vi.fn();
    const testDeps = deps({
      loadBackendServicesConfig: vi.fn().mockResolvedValue(secretBackendConfig),
      loadBackendPublicJwksFromEnvironment: vi.fn(),
      fetchImpl,
    });

    const report = await runEhrOnboardingSmoke({
      tenantId: 42,
      apiBaseUrl: 'https://api.medgnosis.test',
      requestBackendToken: true,
      backendScope: 'system/Patient.rs',
      env: { EHR_BACKEND_CLIENT_SECRET: 'secret-1' },
      deps: testDeps,
    });

    expect(report.ok).toBe(true);
    expect(report.steps.find((step) => step.id === 'backend-config')).toMatchObject({
      status: 'pass',
      details: {
        authMethod: 'client_secret_basic',
        publicJwksKeyCount: 0,
      },
    });
    expect(report.steps.find((step) => step.id === 'jwks-endpoint')).toMatchObject({
      status: 'skip',
      message: 'Backend auth_method client_secret_basic does not require a public JWKS endpoint',
    });
    expect(testDeps.loadBackendPublicJwksFromEnvironment).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalledWith(
      'https://api.medgnosis.test/.well-known/jwks.json',
      expect.anything(),
    );
    expect(testDeps.requestBackendServiceToken).toHaveBeenCalledWith(
      expect.objectContaining({
        config: secretBackendConfig,
        scope: 'system/Patient.rs',
        persistMetadata: false,
      }),
    );
  });

  it('fails client-secret backend-services readiness when the secret env var is missing', async () => {
    const report = await runEhrOnboardingSmoke({
      tenantId: 42,
      env: {},
      deps: deps({
        loadBackendServicesConfig: vi.fn().mockResolvedValue(secretBackendConfig),
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.steps.find((step) => step.id === 'backend-config')).toMatchObject({
      status: 'fail',
      details: {
        authMethod: 'client_secret_basic',
        credential: 'client secret env var is not set: EHR_BACKEND_CLIENT_SECRET',
      },
    });
    expect(report.steps.find((step) => step.id === 'jwks-endpoint')?.status).toBe('skip');
    expect(report.steps.find((step) => step.id === 'backend-token')?.status).toBe('skip');
  });

  it('skips the JWKS endpoint check for launch-only tenants without a backend-services client', async () => {
    const fetchImpl = vi.fn();
    const testDeps = deps({
      loadBackendServicesConfig: vi.fn().mockResolvedValue(null),
      fetchImpl,
    });

    const report = await runEhrOnboardingSmoke({
      tenantId: 42,
      apiBaseUrl: 'http://localhost:3002',
      deps: testDeps,
    });

    expect(report.ok).toBe(true);
    expect(report.steps.find((step) => step.id === 'backend-config')?.status).toBe('skip');
    expect(report.steps.find((step) => step.id === 'jwks-endpoint')).toMatchObject({
      status: 'skip',
      message: 'No backend-services client registration needs a public JWKS endpoint',
    });
    expect(fetchImpl).not.toHaveBeenCalledWith(
      'http://localhost:3002/.well-known/jwks.json',
      expect.anything(),
    );
  });

  it('uses a supplied access token to run an authenticated FHIR read', async () => {
    const testDeps = deps();

    const report = await runEhrOnboardingSmoke({
      tenantId: 42,
      fhirAccessToken: 'ehr-access-token',
      fhirRead: { resourceType: 'Patient', id: 'pat-1' },
      deps: testDeps,
    });

    expect(report.ok).toBe(true);
    expect(testDeps.readResource).toHaveBeenCalledWith(
      tenant,
      { accessToken: 'ehr-access-token', tokenType: 'Bearer' },
      'Patient',
      'pat-1',
    );
    expect(report.steps.find((step) => step.id === 'fhir-read')?.status).toBe('pass');
  });

  it('fails when the tenant is missing', async () => {
    const report = await runEhrOnboardingSmoke({
      tenantId: 99,
      deps: deps({ getTenant: vi.fn().mockResolvedValue(null) }),
    });

    expect(report.ok).toBe(false);
    expect(report.summary.fail).toBe(1);
    expect(report.steps).toHaveLength(1);
  });
});

describe('formatSmokeReport', () => {
  it('renders a concise plain-text summary', async () => {
    const report = await runEhrOnboardingSmoke({
      tenantId: 42,
      deps: deps(),
      now: () => '2026-06-16T12:00:00Z',
    });

    expect(formatSmokeReport(report)).toContain('Summary: 4 pass, 0 warn, 3 skip, 0 fail');
    expect(formatSmokeReport(report)).toContain('PASS Tenant registry');
  });
});
