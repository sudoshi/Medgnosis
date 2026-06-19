import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  type SqlMock = typeof fn & {
    json: (value: unknown) => unknown;
    unsafe: (query: string, parameters?: readonly unknown[]) => Promise<unknown>;
    begin: (cb: (tx: SqlMock) => Promise<number>) => Promise<number>;
  };
  const sqlMock = fn as SqlMock;
  sqlMock.json = (value: unknown) => value;
  sqlMock.unsafe = async (query, parameters = []) =>
    fn([query] as unknown as TemplateStringsArray, ...parameters);
  sqlMock.begin = async (cb) => cb(sqlMock);
  return { mockSql: sqlMock };
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

const patientResource = {
  resourceType: 'Patient',
  id: 'pat-1',
  meta: {
    versionId: '7',
    lastUpdated: '2099-06-16T12:01:00Z',
  },
  identifier: [
    {
      system: 'urn:mrn',
      value: 'MRN-1',
      type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] },
    },
  ],
  name: [{ use: 'official', family: 'Launch', given: ['Ehr'] }],
  birthDate: '1975-04-02',
  gender: 'female',
};

const ingestRunRow = {
  id: '00000000-0000-4000-8000-000000000063',
  org_id: 7,
  ehr_tenant_id: 42,
  resource_type: 'Patient',
  mode: 'manual',
  status: 'running',
  requested_since: null,
  started_at: '2099-06-16T12:01:00Z',
  finished_at: null,
  resources_received: 0,
  resources_staged: 0,
  resources_updated: 0,
  error_count: 0,
  error_message: null,
  errors: [],
  metadata: {},
  created_at: '2099-06-16T12:01:00Z',
  updated_at: '2099-06-16T12:01:00Z',
};

const stagedPatientRow = {
  id: 99,
  org_id: 7,
  ehr_tenant_id: 42,
  ingest_run_id: ingestRunRow.id,
  resource_type: 'Patient',
  resource_id: 'pat-1',
  patient_ref: 'Patient/pat-1',
  resource: patientResource,
  source_version_id: '7',
  source_last_updated: '2099-06-16T12:01:00Z',
  content_hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  status: 'staged',
  error_message: null,
  errors: [],
  normalized: false,
  normalization_error: null,
  received_at: '2099-06-16T12:01:00Z',
  updated_at: '2099-06-16T12:01:00Z',
};

const patientSync = {
  status: 'imported',
  patientRef: 'Patient/pat-1',
  patientResourceId: 'pat-1',
  localPatientId: 123,
  ingestRunId: ingestRunRow.id,
  stagedResourceId: 99,
  qdmBridge: {
    resourcesSeen: 1,
    resourcesNormalized: 1,
    resourcesSkipped: 0,
    resourcesFailed: 0,
    eventsUpserted: 1,
    errors: [],
  },
};

const enrichedLaunchContext = {
  ...launchContext,
  patientSync,
  localPatientId: 123,
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
    const idTokenBundle = await createSignedSmartIdToken('nonce-from-route');
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        authorization_endpoint: 'https://ehr.example.test/oauth2/authorize',
        token_endpoint: 'https://ehr.example.test/oauth2/token',
        issuer: 'https://ehr.example.test',
        jwks_uri: 'https://ehr.example.test/oauth2/jwks',
        code_challenge_methods_supported: ['S256'],
      }))
      .mockResolvedValueOnce(jsonResponse({
        authorization_endpoint: 'https://ehr.example.test/oauth2/authorize',
        token_endpoint: 'https://ehr.example.test/oauth2/token',
        issuer: 'https://ehr.example.test',
        jwks_uri: 'https://ehr.example.test/oauth2/jwks',
        code_challenge_methods_supported: ['S256'],
      }))
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'raw-access-token',
        refresh_token: 'raw-refresh-token',
        id_token: idTokenBundle.idToken,
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'openid fhirUser launch patient/Patient.r',
        patient: 'pat-1',
        encounter: 'enc-1',
        fhirUser: 'Practitioner/doc-1',
      }))
      .mockResolvedValueOnce(jsonResponse(idTokenBundle.jwks))
      .mockResolvedValueOnce(jsonResponse(patientResource));
    vi.stubGlobal('fetch', fetchMock);

    mockSql
      .mockResolvedValueOnce([configRow])
      .mockResolvedValueOnce([baseSessionRow])
      .mockResolvedValueOnce([baseSessionRow])
      .mockResolvedValueOnce([configRow])
      .mockResolvedValueOnce([baseSessionRow])
      .mockResolvedValueOnce([consumedSessionRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ingestRunRow])
      .mockResolvedValueOnce([stagedPatientRow])
      // --- enterprise identity resolution (reconcilePatient) ---
      .mockResolvedValueOnce([]) // findPersonIdsByIdentifiers -> no match
      .mockResolvedValueOnce([]) // findPersonIdsByDemographicKey -> no match
      .mockResolvedValueOnce([{ person_id: 1 }]) // createPerson INSERT person
      .mockResolvedValueOnce([]) // patient_merge_log INSERT (provisional_created)
      .mockResolvedValueOnce([]) // attachIdentifiers INSERT patient_identifier (1 strong id)
      .mockResolvedValueOnce([]) // upsertDemographicKey UPDATE person
      .mockResolvedValueOnce([]) // findLegacyPatientId -> none
      .mockResolvedValueOnce([{ patient_id: 123 }]) // insertLegacyPatient INSERT phm_edw.patient
      .mockResolvedValueOnce([]) // linkLegacyPatient INSERT patient_link
      // --- end identity resolution ---
      .mockResolvedValueOnce([{ patient_id: 123, local_id: 123 }])
      .mockResolvedValueOnce([stagedPatientRow])
      .mockResolvedValueOnce([{ patient_id: 123 }])
      .mockResolvedValueOnce([{ id: 77 }])
      .mockResolvedValueOnce([{ qdm_event_id: 88 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        ...ingestRunRow,
        status: 'succeeded',
        finished_at: '2099-06-16T12:01:01Z',
        resources_received: 1,
        resources_staged: 1,
        resources_updated: 1,
        metadata: { patientSync },
      }])
      .mockResolvedValueOnce([{ ...consumedSessionRow, launch_context: enrichedLaunchContext }])
      .mockResolvedValueOnce([{
        ...tokenMetadataRow,
        id_token_hash: hashToken(idTokenBundle.idToken),
        launch_context: enrichedLaunchContext,
      }])
      .mockResolvedValueOnce([{ id: sessionId }]);

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
    const appRedirect = new URL(callbackResponse.headers.location as string, 'https://app.medgnosis.test');
    expect(appRedirect.pathname).toBe('/ehr/complete');
    const handoffCode = appRedirect.searchParams.get('smart_handoff');
    expect(handoffCode).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fetchMock).toHaveBeenCalledTimes(5);

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

    const [patientReadUrl, patientReadRequest] = fetchMock.mock.calls[4]!;
    expect(patientReadUrl).toBe('https://ehr.example.test/fhir/R4/Patient/pat-1');
    expect(patientReadRequest).toMatchObject({
      method: 'GET',
      headers: expect.objectContaining({
        authorization: 'Bearer raw-access-token',
      }),
    });

    const persistedValues = mockSql.mock.calls.flatMap((call) => call.slice(1));
    expect(persistedValues).toContain(hashSmartValue(state!));
    expect(persistedValues).toContain(hashSmartValue(handoffCode!));
    expect(persistedValues).toContain(hashToken('raw-access-token'));
    expect(persistedValues).toContain(hashToken('raw-refresh-token'));
    expect(persistedValues).toContain(hashToken(idTokenBundle.idToken));
    expect(persistedValues).not.toContain('raw-access-token');
    expect(persistedValues).not.toContain('raw-refresh-token');
    expect(persistedValues).not.toContain(idTokenBundle.idToken);
    expect(persistedValues).not.toContain(handoffCode);
    expect(persistedValues).toContain(123);

    await app.close();
  });
});

async function createSignedSmartIdToken(nonce: string): Promise<{
  idToken: string;
  jwks: { keys: Array<Record<string, unknown>> };
}> {
  const kid = 'smart-id-key-1';
  const now = Math.floor(Date.now() / 1000);
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  const idToken = await new SignJWT({
    nonce,
    token_use: 'id',
  })
    .setProtectedHeader({ alg: 'ES256', kid })
    .setIssuer('https://ehr.example.test')
    .setAudience('smart-client')
    .setSubject('Practitioner/doc-1')
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);

  return {
    idToken,
    jwks: {
      keys: [
        {
          ...publicJwk,
          kid,
          alg: 'ES256',
          use: 'sig',
        },
      ],
    },
  };
}
