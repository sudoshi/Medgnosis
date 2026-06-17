import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  (fn as unknown as { json: (value: unknown) => unknown }).json = (value: unknown) => value;
  return { mockSql: fn };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import ehrSmartLaunchRoutes from './launch.js';
import { hashSmartValue } from '../../services/ehr/smartLaunch.js';
import { hashToken } from '../../services/ehr/tokenStore.js';

const sessionId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

const configRow = {
  ehr_tenant_id: 42,
  org_id: 7,
  vendor: 'smart_generic',
  fhir_base_url: 'https://ehr.example.test/fhir/R4',
  smart_config_url: null,
  issuer: 'https://ehr.example.test',
  audience: 'https://ehr.example.test/fhir/R4',
  client_registration_id: 5,
  client_id: 'smart-client',
  client_secret_ref: null,
  auth_method: 'public_pkce',
  jwks_url: null,
  private_key_ref: null,
  redirect_uris: ['https://api.medgnosis.test/api/v1/ehr/launch/callback'],
  launch_url: 'https://api.medgnosis.test/api/v1/ehr/launch/42',
  scopes_requested: 'openid fhirUser launch patient/Patient.r',
  scopes_granted: 'openid fhirUser launch patient/Patient.r',
};

const baseSessionRow = {
  id: sessionId,
  ehr_tenant_id: 42,
  org_id: 7,
  user_id: userId,
  client_registration_id: 5,
  state_hash: hashSmartValue('state-from-route'),
  nonce_hash: hashSmartValue('nonce-from-route'),
  code_verifier: 'pkce-code-verifier-from-db',
  redirect_uri: 'https://api.medgnosis.test/api/v1/ehr/launch/callback',
  app_redirect_url: '/ehr/complete',
  issuer: 'https://ehr.example.test',
  launch: 'launch-opaque',
  requested_scope: 'openid fhirUser launch patient/Patient.r',
  launch_context: {},
  status: 'pending',
  expires_at: '2099-06-16T12:10:00Z',
  consumed_at: null,
  created_at: '2099-06-16T12:00:00Z',
  updated_at: '2099-06-16T12:00:00Z',
};

const consumedSessionRow = {
  ...baseSessionRow,
  status: 'consumed',
  consumed_at: '2099-06-16T12:01:00Z',
  updated_at: '2099-06-16T12:01:00Z',
};

const launchContext = {
  patient: 'pat-1',
  encounter: 'enc-1',
  fhirUser: 'Practitioner/doc-1',
  scopes: ['openid', 'fhirUser', 'launch', 'patient/Patient.r'],
};

const tokenMetadataRow = {
  id: '33333333-3333-4333-8333-333333333333',
  smart_launch_session_id: sessionId,
  ehr_tenant_id: 42,
  org_id: 7,
  user_id: userId,
  token_type: 'Bearer',
  scope: 'openid fhirUser launch patient/Patient.r',
  access_token_hash: hashToken('raw-access-token'),
  refresh_token_hash: hashToken('raw-refresh-token'),
  id_token_hash: null,
  patient_ref: 'pat-1',
  encounter_ref: 'enc-1',
  fhir_user_ref: 'Practitioner/doc-1',
  launch_context: launchContext,
  token_response_metadata: {
    token_type: 'Bearer',
    expires_in: 300,
    scope: 'openid fhirUser launch patient/Patient.r',
    patient: 'pat-1',
    encounter: 'enc-1',
    fhirUser: 'Practitioner/doc-1',
  },
  issued_at: '2099-06-16T12:01:00Z',
  expires_at: '2099-06-16T12:06:00Z',
  revoked_at: null,
  created_at: '2099-06-16T12:01:00Z',
  updated_at: '2099-06-16T12:01:00Z',
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(ehrSmartLaunchRoutes, { prefix: '/ehr/launch' });
  await app.ready();
  return app;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  mockSql.mockReset();
  vi.unstubAllGlobals();
});

describe('EHR SMART launch route integration', () => {
  it('runs launch initiation through callback/token exchange without persisting raw tokens', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        authorization_endpoint: 'https://ehr.example.test/oauth2/authorize',
        token_endpoint: 'https://ehr.example.test/oauth2/token',
        code_challenge_methods_supported: ['S256'],
      }))
      .mockResolvedValueOnce(jsonResponse({
        authorization_endpoint: 'https://ehr.example.test/oauth2/authorize',
        token_endpoint: 'https://ehr.example.test/oauth2/token',
        code_challenge_methods_supported: ['S256'],
      }))
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'raw-access-token',
        refresh_token: 'raw-refresh-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'openid fhirUser launch patient/Patient.r',
        patient: 'pat-1',
        encounter: 'enc-1',
        fhirUser: 'Practitioner/doc-1',
      }));
    vi.stubGlobal('fetch', fetchMock);

    mockSql
      .mockResolvedValueOnce([configRow])
      .mockResolvedValueOnce([baseSessionRow])
      .mockResolvedValueOnce([baseSessionRow])
      .mockResolvedValueOnce([configRow])
      .mockResolvedValueOnce([baseSessionRow])
      .mockResolvedValueOnce([consumedSessionRow])
      .mockResolvedValueOnce([{ ...consumedSessionRow, launch_context: launchContext }])
      .mockResolvedValueOnce([tokenMetadataRow]);

    const app = await buildApp();

    const launchResponse = await app.inject({
      method: 'GET',
      url: '/ehr/launch/42?iss=https%3A%2F%2Fehr.example.test&launch=launch-opaque&return_to=/ehr/complete',
    });

    expect(launchResponse.statusCode).toBe(302);
    const authorizationUrl = new URL(launchResponse.headers.location as string);
    const state = authorizationUrl.searchParams.get('state');
    expect(authorizationUrl.origin).toBe('https://ehr.example.test');
    expect(authorizationUrl.searchParams.get('client_id')).toBe('smart-client');
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      'https://api.medgnosis.test/api/v1/ehr/launch/callback',
    );
    expect(authorizationUrl.searchParams.get('launch')).toBe('launch-opaque');
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);

    const callbackResponse = await app.inject({
      method: 'GET',
      url: `/ehr/launch/callback?state=${encodeURIComponent(state!)}&code=auth-code`,
    });

    expect(callbackResponse.statusCode).toBe(302);
    expect(callbackResponse.headers.location).toBe(
      `/ehr/complete?smart_session_id=${encodeURIComponent(sessionId)}`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [, tokenRequest] = fetchMock.mock.calls[2]!;
    expect(tokenRequest).toMatchObject({
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    const tokenBody = tokenRequest?.body as URLSearchParams;
    expect(tokenBody.get('grant_type')).toBe('authorization_code');
    expect(tokenBody.get('code')).toBe('auth-code');
    expect(tokenBody.get('code_verifier')).toBe('pkce-code-verifier-from-db');

    const persistedValues = mockSql.mock.calls.flatMap((call) => call.slice(1));
    expect(persistedValues).toContain(hashSmartValue(state!));
    expect(persistedValues).toContain(hashToken('raw-access-token'));
    expect(persistedValues).toContain(hashToken('raw-refresh-token'));
    expect(persistedValues).not.toContain('raw-access-token');
    expect(persistedValues).not.toContain('raw-refresh-token');

    await app.close();
  });
});
