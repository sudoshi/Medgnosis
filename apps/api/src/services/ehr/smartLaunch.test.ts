import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { generateKeyPairSync } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  (fn as unknown as { json: (value: unknown) => unknown }).json = (value: unknown) => value;
  return { mockSql: fn };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  completeSmartLaunchCallback,
  consumeSmartLaunchState,
  consumeSmartLaunchHandoff,
  createSmartLaunchState,
  createSmartLaunchHandoff,
  exchangeSmartAuthorizationCode,
  findSmartLaunchSessionByState,
  hashSmartValue,
  loadSmartLaunchConfig,
  normalizeSmartScope,
  smartPkceChallenge,
  validateSmartIdToken,
} from './smartLaunch.js';
import type { JSONWebKeySet, JWTPayload } from 'jose';
import type { FetchLike } from './types.js';

const baseSessionRow = {
  id: '11111111-1111-4111-8111-111111111111',
  ehr_tenant_id: 42,
  org_id: 7,
  user_id: '22222222-2222-4222-8222-222222222222',
  app_session_id: null,
  client_registration_id: 5,
  state_hash: hashSmartValue('state-1'),
  nonce_hash: hashSmartValue('nonce-1'),
  code_verifier: 'pkce-code-verifier-1',
  redirect_uri: 'https://api.medgnosis.test/api/ehr/launch/callback',
  app_redirect_url: '/ehr/complete',
  issuer: 'https://ehr.example.test',
  launch: 'launch-opaque',
  requested_scope: 'openid fhirUser launch patient/Patient.r',
  launch_context: {},
  status: 'pending',
  expires_at: '2026-06-16T12:10:00Z',
  consumed_at: null,
  handoff_code_hash: null,
  handoff_expires_at: null,
  handoff_consumed_at: null,
  created_at: '2026-06-16T12:00:00Z',
  updated_at: '2026-06-16T12:00:00Z',
} as const;

beforeEach(() => {
  mockSql.mockReset();
});

describe('createSmartLaunchState', () => {
  it('persists hashed state and builds a SMART authorization URL', async () => {
    mockSql.mockResolvedValueOnce([baseSessionRow]);

    const created = await createSmartLaunchState({
      ehrTenantId: 42,
      orgId: 7,
      userId: '22222222-2222-4222-8222-222222222222',
      clientRegistrationId: 5,
      clientId: 'smart-client',
      authorizationEndpoint: 'https://ehr.example.test/oauth2/authorize',
      fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
      redirectUri: 'https://api.medgnosis.test/api/ehr/launch/callback',
      appRedirectUrl: '/ehr/complete',
      issuer: 'https://ehr.example.test',
      launch: 'launch-opaque',
      scope: ['openid', 'fhirUser', 'launch', 'patient/Patient.r', 'patient/Patient.r'],
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'pkce-code-verifier-1',
      now: new Date('2026-06-16T12:00:00Z'),
    });

    expect(created.session.id).toBe(baseSessionRow.id);
    expect(created.state).toBe('state-1');
    expect(created.nonce).toBe('nonce-1');
    expect(created.authorizationUrl).toContain('https://ehr.example.test/oauth2/authorize?');

    const authorizationUrl = new URL(created.authorizationUrl);
    expect(authorizationUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizationUrl.searchParams.get('client_id')).toBe('smart-client');
    expect(authorizationUrl.searchParams.get('state')).toBe('state-1');
    expect(authorizationUrl.searchParams.get('nonce')).toBe('nonce-1');
    expect(authorizationUrl.searchParams.get('code_challenge')).toBe(
      smartPkceChallenge('pkce-code-verifier-1'),
    );
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizationUrl.searchParams.get('aud')).toBe('https://ehr.example.test/fhir/R4');
    expect(authorizationUrl.searchParams.get('launch')).toBe('launch-opaque');
    expect(authorizationUrl.searchParams.get('scope')).toBe(
      'openid fhirUser launch patient/Patient.r',
    );

    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toContain(hashSmartValue('state-1'));
    expect(values).toContain(hashSmartValue('nonce-1'));
    expect(values).toContain('pkce-code-verifier-1');
    expect(values).not.toContain('state-1');
    expect(values).not.toContain('nonce-1');
  });

  it('normalizes duplicate and blank scope values', () => {
    expect(normalizeSmartScope('openid  fhirUser openid  ')).toBe('openid fhirUser');
    expect(normalizeSmartScope(['launch', 'launch', ' patient/Patient.r '])).toBe(
      'launch patient/Patient.r',
    );
  });
});

describe('consumeSmartLaunchState', () => {
  it('consumes pending, unexpired state exactly once', async () => {
    mockSql
      .mockResolvedValueOnce([baseSessionRow])
      .mockResolvedValueOnce([
        {
          ...baseSessionRow,
          status: 'consumed',
          consumed_at: '2026-06-16T12:01:00Z',
          updated_at: '2026-06-16T12:01:00Z',
        },
      ]);

    const consumed = await consumeSmartLaunchState('state-1', {
      now: new Date('2026-06-16T12:01:00Z'),
    });

    expect(consumed).toMatchObject({
      id: baseSessionRow.id,
      status: 'consumed',
      consumedAt: '2026-06-16T12:01:00Z',
    });
    expect(mockSql.mock.calls[0]!.slice(1)).toContain(hashSmartValue('state-1'));
    expect(mockSql.mock.calls[1]!.slice(1)).toContain(baseSessionRow.id);
  });

  it('expires stale pending state without returning a session', async () => {
    mockSql.mockResolvedValueOnce([baseSessionRow]).mockResolvedValueOnce([]);

    const consumed = await consumeSmartLaunchState('state-1', {
      now: new Date('2026-06-16T12:11:00Z'),
    });

    expect(consumed).toBeNull();
    expect((mockSql.mock.calls[1]![0] as TemplateStringsArray).join('')).toContain("status = 'expired'");
  });

  it('finds state without consuming it', async () => {
    mockSql.mockResolvedValueOnce([baseSessionRow]);

    const session = await findSmartLaunchSessionByState('state-1');

    expect(session).toMatchObject({ ehrTenantId: 42, status: 'pending' });
    expect(mockSql).toHaveBeenCalledTimes(1);
  });
});

describe('loadSmartLaunchConfig', () => {
  it('loads tenant/client registration and discovers SMART endpoints', async () => {
    mockSql.mockResolvedValueOnce([
      {
        ehr_tenant_id: 42,
        org_id: 7,
        vendor: 'epic',
        fhir_base_url: 'https://ehr.example.test/fhir/R4/',
        smart_config_url: null,
        issuer: 'https://ehr.example.test',
        audience: 'https://ehr.example.test/fhir/R4',
        client_registration_id: 5,
        client_id: 'smart-client',
        client_secret_ref: null,
        auth_method: 'public_pkce',
        jwks_url: null,
        private_key_ref: null,
        redirect_uris: ['https://api.medgnosis.test/api/ehr/launch/callback'],
        launch_url: 'https://api.medgnosis.test/api/ehr/launch/42',
        scopes_requested: 'openid fhirUser launch patient/Patient.r',
        scopes_granted: 'openid fhirUser launch patient/Patient.r',
      },
    ]);
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        authorization_endpoint: 'https://ehr.example.test/oauth2/authorize',
        token_endpoint: 'https://ehr.example.test/oauth2/token',
        issuer: 'https://ehr.example.test',
        jwks_uri: 'https://ehr.example.test/oauth2/jwks',
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
      }),
    );

    const config = await loadSmartLaunchConfig(42, fetchMock);

    expect(config).toMatchObject({
      clientRegistrationId: 5,
      clientId: 'smart-client',
      authMethod: 'public_pkce',
      authorizationEndpoint: 'https://ehr.example.test/oauth2/authorize',
      tokenEndpoint: 'https://ehr.example.test/oauth2/token',
      issuer: 'https://ehr.example.test',
      idTokenJwksUrl: 'https://ehr.example.test/oauth2/jwks',
    });
    expect(config?.tenant.fhirBaseUrl).toBe('https://ehr.example.test/fhir/R4/');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ehr.example.test/fhir/R4/.well-known/smart-configuration',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('validateSmartIdToken', () => {
  it('accepts a signed SMART id_token with issuer, audience, exp, iat, and matching nonce', async () => {
    const now = new Date('2026-06-16T12:00:00Z');
    const { idToken, jwks } = await createSignedSmartIdToken({ nonce: 'nonce-1', now });

    const claims = await validateSmartIdToken({
      idToken,
      jwks,
      expectedIssuer: 'https://ehr.example.test',
      expectedAudience: 'smart-client',
      nonceHash: hashSmartValue('nonce-1'),
      now,
    });

    expect(claims.sub).toBe('Practitioner/doc-1');
  });

  it('rejects a validly signed id_token with the wrong nonce', async () => {
    const now = new Date('2026-06-16T12:00:00Z');
    const { idToken, jwks } = await createSignedSmartIdToken({ nonce: 'nonce-1', now });

    await expect(validateSmartIdToken({
      idToken,
      jwks,
      expectedIssuer: 'https://ehr.example.test',
      expectedAudience: 'smart-client',
      nonceHash: hashSmartValue('nonce-2'),
      now,
    })).rejects.toMatchObject({ code: 'smart_id_token_nonce_mismatch' });
  });

  it('rejects id_token issuer, audience, azp, token_use, and expiration failures', async () => {
    const now = new Date('2026-06-16T12:00:00Z');
    const valid = await createSignedSmartIdToken({ nonce: 'nonce-1', now });
    await expect(validateSmartIdToken({
      idToken: valid.idToken,
      jwks: valid.jwks,
      expectedIssuer: 'https://wrong-issuer.example.test',
      expectedAudience: 'smart-client',
      nonceHash: hashSmartValue('nonce-1'),
      now,
    })).rejects.toMatchObject({ code: 'smart_id_token_invalid' });

    await expect(validateSmartIdToken({
      idToken: valid.idToken,
      jwks: valid.jwks,
      expectedIssuer: 'https://ehr.example.test',
      expectedAudience: 'other-client',
      nonceHash: hashSmartValue('nonce-1'),
      now,
    })).rejects.toMatchObject({ code: 'smart_id_token_invalid' });

    const wrongAzp = await createSignedSmartIdToken({
      nonce: 'nonce-1',
      now,
      audience: ['smart-client', 'other-audience'],
      extraClaims: { azp: 'other-client' },
    });
    await expect(validateSmartIdToken({
      idToken: wrongAzp.idToken,
      jwks: wrongAzp.jwks,
      expectedIssuer: 'https://ehr.example.test',
      expectedAudience: 'smart-client',
      nonceHash: hashSmartValue('nonce-1'),
      now,
    })).rejects.toMatchObject({ code: 'smart_id_token_invalid' });

    const accessTokenUse = await createSignedSmartIdToken({
      nonce: 'nonce-1',
      now,
      extraClaims: { token_use: 'access' },
    });
    await expect(validateSmartIdToken({
      idToken: accessTokenUse.idToken,
      jwks: accessTokenUse.jwks,
      expectedIssuer: 'https://ehr.example.test',
      expectedAudience: 'smart-client',
      nonceHash: hashSmartValue('nonce-1'),
      now,
    })).rejects.toMatchObject({ code: 'smart_id_token_invalid' });

    const expired = await createSignedSmartIdToken({
      nonce: 'nonce-1',
      now,
      expiresAt: new Date('2026-06-16T11:59:00Z'),
    });
    await expect(validateSmartIdToken({
      idToken: expired.idToken,
      jwks: expired.jwks,
      expectedIssuer: 'https://ehr.example.test',
      expectedAudience: 'smart-client',
      nonceHash: hashSmartValue('nonce-1'),
      now,
    })).rejects.toMatchObject({ code: 'smart_id_token_invalid' });
  });
});

describe('exchangeSmartAuthorizationCode', () => {
  it('posts authorization_code grant and maps launch context from token response', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        access_token: 'raw-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'openid fhirUser launch patient/Patient.r',
        patient: 'pat-1',
        encounter: 'enc-1',
        fhirUser: 'Practitioner/doc-1',
      }),
    );

    const exchanged = await exchangeSmartAuthorizationCode(
      {
        tenant: {
          vendor: 'smart_generic',
          fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
        },
        tokenEndpoint: 'https://ehr.example.test/oauth2/token',
        clientId: 'smart-client',
        code: 'auth-code',
        codeVerifier: 'pkce-code-verifier-1',
        redirectUri: 'https://api.medgnosis.test/api/ehr/launch/callback',
        now: new Date('2026-06-16T12:00:00Z'),
      },
      fetchMock,
    );

    expect(exchanged.launchContext).toEqual({
      patient: 'pat-1',
      encounter: 'enc-1',
      fhirUser: 'Practitioner/doc-1',
      scopes: ['openid', 'fhirUser', 'launch', 'patient/Patient.r'],
    });
    expect(exchanged.expiresAt).toBe('2026-06-16T12:05:00.000Z');

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    const body = init?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('client_id')).toBe('smart-client');
    expect(body.get('code_verifier')).toBe('pkce-code-verifier-1');
    expect(body.get('client_secret')).toBeNull();
    expect(body.get('client_assertion')).toBeNull();
  });

  it('uses client_secret_post when configured for confidential SMART launch clients', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        access_token: 'raw-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'openid fhirUser',
      }),
    );

    await exchangeSmartAuthorizationCode(
      {
        tenant: {
          vendor: 'smart_generic',
          fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
        },
        tokenEndpoint: 'https://ehr.example.test/oauth2/token',
        clientId: 'smart-client',
        clientSecret: 'secret-1',
        authMethod: 'client_secret_post',
        code: 'auth-code',
        codeVerifier: 'pkce-code-verifier-1',
        redirectUri: 'https://api.medgnosis.test/api/ehr/launch/callback',
      },
      fetchMock,
    );

    const body = fetchMock.mock.calls[0]![1]?.body as URLSearchParams;
    expect(body.get('client_id')).toBe('smart-client');
    expect(body.get('client_secret')).toBe('secret-1');
  });

  it('uses client_secret_basic without putting the secret in the form body', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        access_token: 'raw-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'openid fhirUser',
      }),
    );

    await exchangeSmartAuthorizationCode(
      {
        tenant: {
          vendor: 'smart_generic',
          fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
        },
        tokenEndpoint: 'https://ehr.example.test/oauth2/token',
        clientId: 'smart-client',
        clientSecret: 'secret-1',
        authMethod: 'client_secret_basic',
        code: 'auth-code',
        codeVerifier: 'pkce-code-verifier-1',
        redirectUri: 'https://api.medgnosis.test/api/ehr/launch/callback',
      },
      fetchMock,
    );

    const init = fetchMock.mock.calls[0]![1]!;
    const body = init.body as URLSearchParams;
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from('smart-client:secret-1').toString('base64')}`,
    );
    expect(body.get('client_id')).toBeNull();
    expect(body.get('client_secret')).toBeNull();
  });

  it('uses private_key_jwt assertions when configured for SMART launch token auth', async () => {
    const privateKeyPkcs8 = createPrivateKeyPem();
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        access_token: 'raw-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'openid fhirUser',
      }),
    );

    await exchangeSmartAuthorizationCode(
      {
        tenant: {
          vendor: 'smart_generic',
          fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
        },
        tokenEndpoint: 'https://ehr.example.test/oauth2/token',
        clientId: 'smart-client',
        authMethod: 'private_key_jwt',
        privateKey: { key: privateKeyPkcs8, kid: 'smart-key-1', alg: 'RS384' },
        jwksUrl: 'https://api.medgnosis.test/.well-known/jwks.json',
        code: 'auth-code',
        codeVerifier: 'pkce-code-verifier-1',
        redirectUri: 'https://api.medgnosis.test/api/ehr/launch/callback',
        now: new Date('2026-06-16T12:00:00Z'),
      },
      fetchMock,
    );

    const body = fetchMock.mock.calls[0]![1]?.body as URLSearchParams;
    expect(body.get('client_id')).toBe('smart-client');
    expect(body.get('client_assertion_type')).toBe(
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    );
    expect(body.get('client_assertion')).toMatch(/^eyJ/);
    expect(body.get('client_secret')).toBeNull();
  });
});

describe('SMART launch app handoff', () => {
  it('mints a hashed one-time handoff code for consumed launch sessions', async () => {
    mockSql.mockResolvedValueOnce([{ id: baseSessionRow.id }]);

    const handoff = await createSmartLaunchHandoff(baseSessionRow.id, {
      now: new Date('2026-06-16T12:00:00Z'),
    });

    expect(handoff.sessionId).toBe(baseSessionRow.id);
    expect(handoff.handoffCode).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(handoff.expiresAt).toBe('2026-06-16T12:05:00.000Z');

    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toContain(hashSmartValue(handoff.handoffCode));
    expect(values).toContain(baseSessionRow.id);
    expect(values).not.toContain(handoff.handoffCode);
  });

  it('consumes a valid handoff once and resolves the local patient id from the crosswalk', async () => {
    mockSql
      .mockResolvedValueOnce([
        {
          ...baseSessionRow,
          status: 'consumed',
          app_session_id: '33333333-3333-4333-8333-333333333333',
          handoff_code_hash: hashSmartValue('handoff-code-1'),
          handoff_expires_at: '2026-06-16T12:05:00Z',
          handoff_consumed_at: '2026-06-16T12:01:00Z',
          launch_context: {
            patient: 'Patient/pat-1',
            fhirUser: 'Practitioner/doc-1',
            scopes: ['openid', 'patient/Patient.r'],
          },
        },
      ])
      .mockResolvedValueOnce([{ patient_id: 123 }]);

    const consumed = await consumeSmartLaunchHandoff({
      handoffCode: 'handoff-code-1',
      userId: baseSessionRow.user_id,
      orgId: 7,
      appSessionId: '33333333-3333-4333-8333-333333333333',
      now: new Date('2026-06-16T12:01:00Z'),
    });

    expect(consumed).toMatchObject({
      patientId: 123,
      session: {
        id: baseSessionRow.id,
        appSessionId: '33333333-3333-4333-8333-333333333333',
        handoffConsumedAt: '2026-06-16T12:01:00Z',
      },
    });
    expect(mockSql.mock.calls[0]!.slice(1)).toContain(hashSmartValue('handoff-code-1'));
    expect(mockSql.mock.calls[0]!.slice(1)).not.toContain('handoff-code-1');
    expect(mockSql.mock.calls[1]!.slice(1)).toContain('pat-1');
  });
});

describe('completeSmartLaunchCallback', () => {
  it('rejects OpenID launch callbacks when the token response omits id_token', async () => {
    mockSql
      .mockResolvedValueOnce([baseSessionRow])
      .mockResolvedValueOnce([
        {
          ...baseSessionRow,
          status: 'consumed',
          consumed_at: '2026-06-16T12:01:00Z',
          updated_at: '2026-06-16T12:01:00Z',
        },
      ]);
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        access_token: 'raw-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'openid fhirUser launch patient/Patient.r',
        patient: 'pat-1',
      }),
    );

    await expect(completeSmartLaunchCallback(
      {
        state: 'state-1',
        code: 'auth-code',
        now: new Date('2026-06-16T12:00:00Z'),
        config: {
          tenant: {
            vendor: 'smart_generic',
            fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
          },
          clientId: 'smart-client',
          tokenEndpoint: 'https://ehr.example.test/oauth2/token',
          authMethod: 'public_pkce',
          jwksUrl: null,
          privateKeyRef: null,
          issuer: 'https://ehr.example.test',
          idTokenJwksUrl: 'https://ehr.example.test/oauth2/jwks',
        },
      },
      fetchMock,
    )).rejects.toMatchObject({ code: 'smart_id_token_missing' });
    expect(mockSql).toHaveBeenCalledTimes(2);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createPrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

async function createSignedSmartIdToken(input: {
  issuer?: string;
  audience?: string | string[];
  nonce: string;
  now: Date;
  expiresAt?: Date;
  extraClaims?: JWTPayload;
}): Promise<{ idToken: string; jwks: JSONWebKeySet }> {
  const kid = 'smart-id-key-1';
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const publicJwk = await exportJWK(publicKey);
  const issuedAt = Math.floor(input.now.getTime() / 1000);
  const expiresAt = Math.floor(
    (input.expiresAt?.getTime() ?? input.now.getTime() + 5 * 60 * 1000) / 1000,
  );
  const idToken = await new SignJWT({
    nonce: input.nonce,
    token_use: 'id',
    ...input.extraClaims,
  })
    .setProtectedHeader({ alg: 'ES256', kid })
    .setIssuer(input.issuer ?? 'https://ehr.example.test')
    .setAudience(input.audience ?? 'smart-client')
    .setSubject('Practitioner/doc-1')
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
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
