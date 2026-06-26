import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { jwtVerify, type JWK } from 'jose';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  (fn as unknown as { json: (value: unknown) => unknown }).json = (value: unknown) => value;
  return { mockSql: fn };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  BackendServicesError,
  createBackendClientAssertion,
  loadBackendServicesConfig,
  requestBackendServiceToken,
  resolvePrivateKeyFromEnvironment,
  type BackendServicesConfig,
} from './backendServices.js';
import type { FetchLike } from './types.js';
import { hashToken } from './tokenStore.js';

beforeEach(() => {
  mockSql.mockReset();
  vi.unstubAllEnvs();
});

const config: BackendServicesConfig = {
  tenant: {
    id: 42,
    orgId: 7,
    vendor: 'epic',
    fhirBaseUrl: 'https://ehr.example.test/fhir/R4',
  },
  clientRegistrationId: 9,
  clientId: 'backend-client',
  authMethod: 'private_key_jwt',
  clientSecretRef: null,
  jwksUrl: 'https://api.medgnosis.test/.well-known/jwks.json',
  privateKeyRef: 'env:EHR_BACKEND_PRIVATE_KEY_PEM?kid=backend-key-1&alg=RS384',
  scopesRequested: 'system/Patient.rs system/Observation.rs',
  scopesGranted: 'system/Patient.rs system/Observation.rs',
  tokenEndpoint: 'https://ehr.example.test/oauth2/token',
};

describe('createBackendClientAssertion', () => {
  it('signs a private_key_jwt with SMART Backend Services claims and headers', async () => {
    const { privateKeyPkcs8, publicKey } = createRsaKeyFixture();

    const assertion = await createBackendClientAssertion({
      clientId: 'backend-client',
      tokenEndpoint: 'https://ehr.example.test/oauth2/token',
      privateKey: { key: privateKeyPkcs8, kid: 'backend-key-1', alg: 'RS384' },
      jwksUrl: 'https://api.medgnosis.test/.well-known/jwks.json',
      now: new Date('2026-06-16T12:00:00Z'),
      jti: 'jti-1',
    });

    const { payload, protectedHeader } = await jwtVerify(assertion, publicKey, {
      issuer: 'backend-client',
      subject: 'backend-client',
      audience: 'https://ehr.example.test/oauth2/token',
      currentDate: new Date('2026-06-16T12:00:00Z'),
    });

    expect(protectedHeader).toMatchObject({
      alg: 'RS384',
      kid: 'backend-key-1',
      typ: 'JWT',
      jku: 'https://api.medgnosis.test/.well-known/jwks.json',
    });
    expect(payload).toMatchObject({
      iss: 'backend-client',
      sub: 'backend-client',
      aud: 'https://ehr.example.test/oauth2/token',
      jti: 'jti-1',
      iat: 1781611200,
      exp: 1781611500,
    });
  });

  it('rejects assertion TTLs longer than five minutes', async () => {
    const { privateKeyPkcs8 } = createRsaKeyFixture();

    await expect(
      createBackendClientAssertion({
        clientId: 'backend-client',
        tokenEndpoint: 'https://ehr.example.test/oauth2/token',
        privateKey: { key: privateKeyPkcs8, kid: 'backend-key-1', alg: 'RS384' },
        ttlSeconds: 301,
      }),
    ).rejects.toMatchObject({
      code: 'backend_assertion_ttl_invalid',
    });
  });
});

describe('resolvePrivateKeyFromEnvironment', () => {
  it('resolves env: references with query-string kid and alg metadata', async () => {
    const { privateKeyPkcs8 } = createRsaKeyFixture();
    vi.stubEnv('EHR_BACKEND_PRIVATE_KEY_PEM', privateKeyPkcs8);

    const material = await resolvePrivateKeyFromEnvironment(
      'env:EHR_BACKEND_PRIVATE_KEY_PEM?kid=backend-key-1&alg=RS384',
    );

    expect(material).toMatchObject({
      key: privateKeyPkcs8,
      kid: 'backend-key-1',
      alg: 'RS384',
    });
  });

  it('accepts JSON JWK material stored in an env var', async () => {
    const { privateJwk: jwk } = createRsaKeyFixture();
    jwk.kid = 'jwk-key-1';
    jwk.alg = 'RS384';
    vi.stubEnv('EHR_BACKEND_PRIVATE_JWK', JSON.stringify(jwk));

    const material = await resolvePrivateKeyFromEnvironment('env:EHR_BACKEND_PRIVATE_JWK');

    expect(material.kid).toBe('jwk-key-1');
    expect(material.alg).toBe('RS384');
    expect(material.key).toMatchObject({ kid: 'jwk-key-1' });
  });
});

describe('requestBackendServiceToken', () => {
  it('posts the client_credentials backend-services token request and keeps raw token in memory only', async () => {
    const { privateKeyPkcs8 } = createRsaKeyFixture();
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(
      jsonResponse({
        access_token: 'raw-backend-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'system/Patient.rs system/Observation.rs',
      }),
    );

    const result = await requestBackendServiceToken({
      config,
      privateKey: { key: privateKeyPkcs8, kid: 'backend-key-1', alg: 'RS384' },
      fetchImpl: fetchMock,
      now: new Date('2026-06-16T12:00:00Z'),
      jti: 'jti-1',
      persistMetadata: false,
    });

    expect(result.accessToken).toEqual({
      accessToken: 'raw-backend-access-token',
      tokenType: 'Bearer',
      scope: 'system/Patient.rs system/Observation.rs',
      expiresAt: '2026-06-16T12:05:00.000Z',
    });
    expect(result.tokenMetadata).toBeNull();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://ehr.example.test/oauth2/token');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    const body = init?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('scope')).toBe('system/Patient.rs system/Observation.rs');
    expect(body.get('client_assertion_type')).toBe(
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    );
    expect(body.get('client_assertion')).toMatch(/^eyJ/);
    expect(body.get('client_secret')).toBeNull();
  });

  it('uses client_secret_post for backend clients registered with shared OAuth secrets', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(
      jsonResponse({
        access_token: 'raw-backend-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'system/Patient.rs',
      }),
    );

    await requestBackendServiceToken({
      config: {
        ...config,
        authMethod: 'client_secret_post',
        clientSecretRef: 'env:EHR_BACKEND_CLIENT_SECRET',
        privateKeyRef: null,
        jwksUrl: null,
        scopesRequested: 'system/Patient.rs',
      },
      clientSecret: 'secret-1',
      fetchImpl: fetchMock,
      persistMetadata: false,
    });

    const body = fetchMock.mock.calls[0]![1]?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('client_id')).toBe('backend-client');
    expect(body.get('client_secret')).toBe('secret-1');
    expect(body.get('client_assertion')).toBeNull();
  });

  it('uses client_secret_basic without putting backend client secrets in the form body', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(
      jsonResponse({
        access_token: 'raw-backend-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'system/Patient.rs',
      }),
    );

    await requestBackendServiceToken({
      config: {
        ...config,
        authMethod: 'client_secret_basic',
        clientSecretRef: 'env:EHR_BACKEND_CLIENT_SECRET',
        privateKeyRef: null,
        jwksUrl: null,
        scopesRequested: 'system/Patient.rs',
      },
      clientSecret: 'secret-1',
      fetchImpl: fetchMock,
      persistMetadata: false,
    });

    const init = fetchMock.mock.calls[0]![1]!;
    const body = init.body as URLSearchParams;
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from('backend-client:secret-1').toString('base64')}`,
    );
    expect(body.get('client_id')).toBeNull();
    expect(body.get('client_secret')).toBeNull();
    expect(body.get('client_assertion')).toBeNull();
  });

  it('requests least-privilege configured scopes instead of every granted scope', async () => {
    const { privateKeyPkcs8 } = createRsaKeyFixture();
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(
      jsonResponse({
        access_token: 'raw-backend-access-token',
        token_type: 'bearer',
        expires_in: 300,
        scope: 'system/Patient.rs',
      }),
    );

    await requestBackendServiceToken({
      config: {
        ...config,
        scopesRequested: 'system/Patient.rs',
        scopesGranted: 'system/Patient.rs system/Observation.rs system/Condition.rs',
      },
      privateKey: { key: privateKeyPkcs8, kid: 'backend-key-1', alg: 'RS384' },
      fetchImpl: fetchMock,
      persistMetadata: false,
    });

    const body = fetchMock.mock.calls[0]![1]?.body as URLSearchParams;
    expect(body.get('scope')).toBe('system/Patient.rs');
  });

  it('rejects runtime scopes outside the granted backend-services scope set', async () => {
    const { privateKeyPkcs8 } = createRsaKeyFixture();

    await expect(
      requestBackendServiceToken({
        config: {
          ...config,
          scopesRequested: 'system/Patient.rs',
          scopesGranted: 'system/Patient.rs',
        },
        scope: 'system/Observation.rs',
        privateKey: { key: privateKeyPkcs8, kid: 'backend-key-1', alg: 'RS384' },
        fetchImpl: vi.fn<FetchLike>(),
        persistMetadata: false,
      }),
    ).rejects.toMatchObject({
      code: 'backend_scopes_not_granted',
    });
  });

  it('persists hashed token metadata when enabled', async () => {
    const { privateKeyPkcs8 } = createRsaKeyFixture();
    const accessHash = hashToken('raw-backend-access-token');
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(
      jsonResponse({
        access_token: 'raw-backend-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'system/Patient.rs',
      }),
    );
    mockSql.mockResolvedValueOnce([
      {
        id: 'token-row-1',
        smart_launch_session_id: null,
        ehr_tenant_id: 42,
        org_id: 7,
        user_id: null,
        token_type: 'Bearer',
        scope: 'system/Patient.rs',
        access_token_hash: accessHash,
        refresh_token_hash: null,
        id_token_hash: null,
        patient_ref: null,
        encounter_ref: null,
        fhir_user_ref: null,
        launch_context: { scopes: ['system/Patient.rs'] },
        token_response_metadata: {
          token_type: 'Bearer',
          expires_in: 300,
          scope: 'system/Patient.rs',
        },
        issued_at: '2026-06-16T12:00:00Z',
        expires_at: '2026-06-16T12:05:00Z',
        revoked_at: null,
        created_at: '2026-06-16T12:00:00Z',
        updated_at: '2026-06-16T12:00:00Z',
      },
    ]);

    const result = await requestBackendServiceToken({
      config,
      privateKey: { key: privateKeyPkcs8, kid: 'backend-key-1', alg: 'RS384' },
      fetchImpl: fetchMock,
      now: new Date('2026-06-16T12:00:00Z'),
    });

    expect(result.tokenMetadata).toMatchObject({
      id: 'token-row-1',
      accessTokenHash: accessHash,
      scope: 'system/Patient.rs',
      smartLaunchSessionId: null,
    });
    const boundValues = JSON.stringify(mockSql.mock.calls[0]!.slice(1));
    expect(boundValues).toContain(accessHash!);
    expect(boundValues).not.toContain('raw-backend-access-token');
  });

  it('normalizes OAuth error responses', async () => {
    const { privateKeyPkcs8 } = createRsaKeyFixture();
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(
      jsonResponse({ error: 'invalid_client', error_description: 'bad assertion' }, 401),
    );

    await expect(
      requestBackendServiceToken({
        config,
        privateKey: { key: privateKeyPkcs8, kid: 'backend-key-1', alg: 'RS384' },
        fetchImpl: fetchMock,
        persistMetadata: false,
      }),
    ).rejects.toMatchObject({
      code: 'backend_token_request_failed',
      status: 401,
      message: 'bad assertion',
    } satisfies Partial<BackendServicesError>);
    const auditPayload = JSON.stringify(mockSql.mock.calls);
    expect(auditPayload).toContain('ehr_backend_token_failed');
    expect(auditPayload).toContain('backend_token_request_failed');
    expect(auditPayload).toContain('invalid_client');
    expect(auditPayload).not.toContain('bad assertion');
    expect(auditPayload).not.toContain('backend-client');
    expect(auditPayload).not.toContain('oauth2/token');
  });

  it('rejects token responses missing required SMART Backend Services fields', async () => {
    const { privateKeyPkcs8 } = createRsaKeyFixture();
    const fetchMock = vi.fn<FetchLike>().mockResolvedValueOnce(
      jsonResponse({
        access_token: 'raw-backend-access-token',
        token_type: 'Bearer',
        expires_in: 300,
      }),
    );

    await expect(
      requestBackendServiceToken({
        config,
        privateKey: { key: privateKeyPkcs8, kid: 'backend-key-1', alg: 'RS384' },
        fetchImpl: fetchMock,
        persistMetadata: false,
      }),
    ).rejects.toMatchObject({
      code: 'backend_token_missing_scope',
    });
  });
});

describe('loadBackendServicesConfig', () => {
  it('loads enabled backend-services registration and discovers token endpoint', async () => {
    mockSql.mockResolvedValueOnce([
      {
        ehr_tenant_id: 42,
        org_id: 7,
        vendor: 'epic',
        fhir_base_url: 'https://ehr.example.test/fhir/R4/',
        smart_config_url: null,
        issuer: 'https://ehr.example.test',
        audience: 'https://ehr.example.test/fhir/R4',
        client_registration_id: 9,
        client_id: 'backend-client',
        auth_method: 'private_key_jwt',
        client_secret_ref: null,
        jwks_url: 'https://api.medgnosis.test/.well-known/jwks.json',
        private_key_ref: 'env:EHR_BACKEND_PRIVATE_KEY_PEM?kid=backend-key-1&alg=RS384',
        scopes_requested: 'system/Patient.rs',
        scopes_granted: 'system/Patient.rs',
      },
    ]);
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        token_endpoint: 'https://ehr.example.test/oauth2/token',
        grant_types_supported: ['client_credentials'],
        token_endpoint_auth_methods_supported: ['private_key_jwt'],
        token_endpoint_auth_signing_alg_values_supported: ['RS384'],
      }),
    );

    const loaded = await loadBackendServicesConfig(42, fetchMock);

    expect(loaded).toMatchObject({
      clientRegistrationId: 9,
      clientId: 'backend-client',
      authMethod: 'private_key_jwt',
      tokenEndpoint: 'https://ehr.example.test/oauth2/token',
      tenant: {
        id: 42,
        orgId: 7,
        fhirBaseUrl: 'https://ehr.example.test/fhir/R4/',
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ehr.example.test/fhir/R4/.well-known/smart-configuration',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects backend discovery that does not support private_key_jwt', async () => {
    mockSql.mockResolvedValueOnce([
      {
        ehr_tenant_id: 42,
        org_id: 7,
        vendor: 'epic',
        fhir_base_url: 'https://ehr.example.test/fhir/R4/',
        smart_config_url: null,
        issuer: 'https://ehr.example.test',
        audience: 'https://ehr.example.test/fhir/R4',
        client_registration_id: 9,
        client_id: 'backend-client',
        auth_method: 'private_key_jwt',
        client_secret_ref: null,
        jwks_url: 'https://api.medgnosis.test/.well-known/jwks.json',
        private_key_ref: 'env:EHR_BACKEND_PRIVATE_KEY_PEM?kid=backend-key-1&alg=RS384',
        scopes_requested: 'system/Patient.rs',
        scopes_granted: 'system/Patient.rs',
      },
    ]);
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        token_endpoint: 'https://ehr.example.test/oauth2/token',
        grant_types_supported: ['client_credentials'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
        token_endpoint_auth_signing_alg_values_supported: ['RS384'],
      }),
    );

    await expect(loadBackendServicesConfig(42, fetchMock)).rejects.toMatchObject({
      code: 'backend_auth_method_not_supported',
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createRsaKeyFixture(): {
  privateKeyPkcs8: string;
  privateJwk: JWK;
  publicKey: KeyObject;
} {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKeyPkcs8: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    privateJwk: privateKey.export({ format: 'jwk' }) as JWK,
    publicKey,
  };
}
