import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';

vi.mock('../../services/ehr/smartLaunch.js', () => ({
  completeSmartLaunchCallback: vi.fn(),
  consumeSmartLaunchHandoff: vi.fn(),
  createSmartLaunchHandoff: vi.fn(),
  createSmartLaunchState: vi.fn(),
  findSmartLaunchSessionByState: vi.fn(),
  loadSmartLaunchConfig: vi.fn(),
}));

import ehrSmartLaunchRoutes from './launch.js';
import {
  completeSmartLaunchCallback,
  consumeSmartLaunchHandoff,
  createSmartLaunchHandoff,
  createSmartLaunchState,
  findSmartLaunchSessionByState,
  loadSmartLaunchConfig,
} from '../../services/ehr/smartLaunch.js';
import type {
  CompleteSmartLaunchCallbackResult,
  CreatedSmartLaunchState,
  SmartLaunchConfig,
  SmartLaunchSession,
} from '../../services/ehr/smartLaunch.js';

const PROVIDER_USER: JwtPayload = {
  sub: '22222222-2222-4222-8222-222222222222',
  email: 'provider@example.test',
  role: 'provider',
  org_id: '7',
  provider_id: 11,
};

const launchConfig: SmartLaunchConfig = {
  tenant: {
    id: 42,
    orgId: 7,
    vendor: 'epic',
    fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
  },
  clientRegistrationId: 5,
  clientId: 'smart-client',
  clientSecretRef: null,
  authMethod: 'public_pkce',
  jwksUrl: null,
  privateKeyRef: null,
  redirectUris: ['https://api.medgnosis.test/api/ehr/launch/callback'],
  launchUrl: 'https://api.medgnosis.test/api/ehr/launch/42',
  scopesRequested: 'openid fhirUser launch patient/Patient.r',
  scopesGranted: 'openid fhirUser launch patient/Patient.r',
  authorizationEndpoint: 'https://ehr.example.test/oauth2/authorize',
  tokenEndpoint: 'https://ehr.example.test/oauth2/token',
  issuer: 'https://ehr.example.test',
  idTokenJwksUrl: 'https://ehr.example.test/oauth2/jwks',
};

const session: SmartLaunchSession = {
  id: '11111111-1111-4111-8111-111111111111',
  ehrTenantId: 42,
  orgId: 7,
  userId: PROVIDER_USER.sub,
  appSessionId: null,
  clientRegistrationId: 5,
  stateHash: 'state-hash',
  nonceHash: 'nonce-hash',
  codeVerifier: 'pkce-code-verifier-1',
  redirectUri: 'https://api.medgnosis.test/api/ehr/launch/callback',
  appRedirectUrl: '/ehr/complete',
  issuer: 'https://ehr.example.test',
  launch: 'launch-opaque',
  requestedScope: 'openid fhirUser launch patient/Patient.r',
  launchContext: {},
  status: 'consumed',
  expiresAt: '2026-06-16T12:10:00Z',
  consumedAt: '2026-06-16T12:01:00Z',
  handoffCodeHash: null,
  handoffExpiresAt: null,
  handoffConsumedAt: null,
  createdAt: '2026-06-16T12:00:00Z',
  updatedAt: '2026-06-16T12:01:00Z',
};

async function buildApp(user: JwtPayload | undefined = PROVIDER_USER): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorate('authenticate', async (request: FastifyRequest) => {
    if (user) request.user = { ...user, session_id: '33333333-3333-4333-8333-333333333333' };
  });
  app.decorate('optionalAuth', async (request: FastifyRequest) => {
    if (user) request.user = user;
  });
  await app.register(ehrSmartLaunchRoutes, { prefix: '/ehr/launch' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.mocked(loadSmartLaunchConfig).mockReset();
  vi.mocked(createSmartLaunchState).mockReset();
  vi.mocked(findSmartLaunchSessionByState).mockReset();
  vi.mocked(completeSmartLaunchCallback).mockReset();
  vi.mocked(createSmartLaunchHandoff).mockReset();
  vi.mocked(consumeSmartLaunchHandoff).mockReset();
});

describe('EHR SMART launch routes', () => {
  it('starts a SMART launch and redirects to the EHR authorization URL', async () => {
    vi.mocked(loadSmartLaunchConfig).mockResolvedValueOnce(launchConfig);
    vi.mocked(createSmartLaunchState).mockResolvedValueOnce({
      session,
      state: 'state-1',
      nonce: 'nonce-1',
      authorizationUrl: 'https://ehr.example.test/oauth2/authorize?response_type=code',
    } satisfies CreatedSmartLaunchState);
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/ehr/launch/42?iss=https%3A%2F%2Fehr.example.test&launch=launch-opaque&return_to=/ehr/complete',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(
      'https://ehr.example.test/oauth2/authorize?response_type=code',
    );
    expect(createSmartLaunchState).toHaveBeenCalledWith(
      expect.objectContaining({
        ehrTenantId: 42,
        orgId: 7,
        userId: PROVIDER_USER.sub,
        clientRegistrationId: 5,
        clientId: 'smart-client',
        redirectUri: 'https://api.medgnosis.test/api/ehr/launch/callback',
        appRedirectUrl: '/ehr/complete',
        issuer: 'https://ehr.example.test',
        launch: 'launch-opaque',
        scope: 'openid fhirUser launch patient/Patient.r',
      }),
    );
    await app.close();
  });

  it('starts a standalone SMART launch with launch/patient scope and no embedded launch token', async () => {
    vi.mocked(loadSmartLaunchConfig).mockResolvedValueOnce(launchConfig);
    vi.mocked(createSmartLaunchState).mockResolvedValueOnce({
      session: { ...session, launch: null, requestedScope: 'openid fhirUser patient/Patient.r launch/patient' },
      state: 'state-1',
      nonce: 'nonce-1',
      authorizationUrl: 'https://ehr.example.test/oauth2/authorize?response_type=code',
    } satisfies CreatedSmartLaunchState);
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/ehr/launch/standalone/42?return_to=/ehr/standalone-complete',
    });

    expect(response.statusCode).toBe(302);
    expect(createSmartLaunchState).toHaveBeenCalledWith(
      expect.objectContaining({
        ehrTenantId: 42,
        appRedirectUrl: '/ehr/standalone-complete',
        launch: null,
        scope: 'openid fhirUser patient/Patient.r launch/patient',
      }),
    );
    await app.close();
  });

  it('rejects EHR launch requests without an issuer before creating state', async () => {
    vi.mocked(loadSmartLaunchConfig).mockResolvedValueOnce(launchConfig);
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/ehr/launch/42?launch=launch-opaque',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'SMART_ISSUER_REQUIRED' },
    });
    expect(createSmartLaunchState).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects EHR launch requests from an unregistered issuer', async () => {
    vi.mocked(loadSmartLaunchConfig).mockResolvedValueOnce(launchConfig);
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/ehr/launch/42?iss=https%3A%2F%2Fevil.example.test&launch=launch-opaque',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'SMART_ISSUER_MISMATCH' },
    });
    expect(createSmartLaunchState).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects EHR launch requests without the embedded launch token', async () => {
    vi.mocked(loadSmartLaunchConfig).mockResolvedValueOnce(launchConfig);
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/ehr/launch/42?iss=https%3A%2F%2Fehr.example.test',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'SMART_LAUNCH_REQUIRED' },
    });
    expect(createSmartLaunchState).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an unregistered redirect_uri before creating state', async () => {
    vi.mocked(loadSmartLaunchConfig).mockResolvedValueOnce(launchConfig);
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/ehr/launch/42?redirect_uri=https%3A%2F%2Fevil.example%2Fcallback',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(createSmartLaunchState).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects authenticated users from a different org than the EHR tenant', async () => {
    vi.mocked(loadSmartLaunchConfig).mockResolvedValueOnce(launchConfig);
    const app = await buildApp({ ...PROVIDER_USER, org_id: '9' });

    const response = await app.inject({
      method: 'GET',
      url: '/ehr/launch/42',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'EHR_TENANT_ORG_MISMATCH' },
    });
    expect(createSmartLaunchState).not.toHaveBeenCalled();
    await app.close();
  });

  it('completes the callback and redirects back to the app with a session id', async () => {
    vi.mocked(findSmartLaunchSessionByState).mockResolvedValueOnce(session);
    vi.mocked(loadSmartLaunchConfig).mockResolvedValueOnce(launchConfig);
    vi.mocked(completeSmartLaunchCallback).mockResolvedValueOnce({
      session,
      launchContext: {
        patient: 'pat-1',
        encounter: 'enc-1',
        fhirUser: 'Practitioner/doc-1',
        scopes: ['openid', 'patient/Patient.r'],
      },
      tokenMetadata: {
        id: 'token-1',
        smartLaunchSessionId: session.id,
        ehrTenantId: 42,
        orgId: 7,
        userId: PROVIDER_USER.sub,
        tokenType: 'Bearer',
        scope: 'openid patient/Patient.r',
        accessTokenHash: 'hashed-access',
        refreshTokenHash: null,
        idTokenHash: null,
        patientRef: 'pat-1',
        encounterRef: 'enc-1',
        fhirUserRef: 'Practitioner/doc-1',
        launchContext: {},
        tokenResponseMetadata: {},
        issuedAt: '2026-06-16T12:00:00Z',
        expiresAt: '2026-06-16T13:00:00Z',
        revokedAt: null,
        createdAt: '2026-06-16T12:00:00Z',
        updatedAt: '2026-06-16T12:00:00Z',
      },
    } satisfies CompleteSmartLaunchCallbackResult);
    vi.mocked(createSmartLaunchHandoff).mockResolvedValueOnce({
      sessionId: session.id,
      handoffCode: 'handoff-code-1',
      expiresAt: '2026-06-16T12:06:00.000Z',
    });
    const app = await buildApp(undefined);

    const response = await app.inject({
      method: 'GET',
      url: '/ehr/launch/callback?state=state-1&code=auth-code',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(
      `/ehr/complete?smart_handoff=${encodeURIComponent('handoff-code-1')}`,
    );
    expect(completeSmartLaunchCallback).toHaveBeenCalledWith({
      state: 'state-1',
      code: 'auth-code',
      config: {
        tenant: launchConfig.tenant,
        clientId: 'smart-client',
        tokenEndpoint: 'https://ehr.example.test/oauth2/token',
        authMethod: 'public_pkce',
        clientSecretRef: null,
        jwksUrl: null,
        privateKeyRef: null,
        issuer: 'https://ehr.example.test',
        idTokenJwksUrl: 'https://ehr.example.test/oauth2/jwks',
      },
    });
    expect(createSmartLaunchHandoff).toHaveBeenCalledWith(session.id);
    await app.close();
  });

  it('consumes a SMART handoff from an authenticated Medgnosis session', async () => {
    vi.mocked(consumeSmartLaunchHandoff).mockResolvedValueOnce({
      session: {
        ...session,
        appSessionId: '33333333-3333-4333-8333-333333333333',
        launchContext: {
          patient: 'pat-1',
          encounter: 'enc-1',
          fhirUser: 'Practitioner/doc-1',
          scopes: ['openid', 'patient/Patient.r'],
        },
      },
      patientId: 123,
    });
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/ehr/launch/complete',
      payload: { smart_handoff: 'handoff-code-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        smart_session_id: session.id,
        ehr_tenant_id: 42,
        patient_id: 123,
        launch_context: { patient: 'pat-1' },
      },
    });
    expect(consumeSmartLaunchHandoff).toHaveBeenCalledWith({
      handoffCode: 'handoff-code-1',
      userId: PROVIDER_USER.sub,
      orgId: 7,
      appSessionId: '33333333-3333-4333-8333-333333333333',
    });
    await app.close();
  });
});
