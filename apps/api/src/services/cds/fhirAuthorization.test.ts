// =============================================================================
// Unit tests — CDS Hooks 2.0.1 fhirAuthorization and route auth
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import Fastify, { type FastifyInstance } from 'fastify';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';

const { mockConfig, mockSql } = vi.hoisted(() => ({
  mockConfig: {
    isProd: false,
    cdsHooksSecret: '',
    cdsFhirAuthRequired: false,
    cdsSharedSecretCompat: true,
    cdsJwksCacheTtlSeconds: 300,
    cdsFhirAuthIssuer: '',
    cdsFhirAuthAudience: '',
    cdsFhirAuthJwksUrl: '',
    cdsFhirAuthRequiredScopes: '',
    webAppUrl: 'http://localhost:5175',
  },
  mockSql: vi.fn(),
}));

vi.mock('../../config.js', () => ({ config: mockConfig }));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import cdsHooksRoutes from '../../routes/cds-hooks/index.js';
import cdsFeedbackRoutes from '../../routes/cds-hooks/feedback.js';
import {
  clearFhirAuthorizationJwksCache,
  verifyCdsHookRequest,
  verifyFhirAuthorization,
  type CdsFhirAuthConfig,
} from './fhirAuthorization.js';

const jwtConfig: Partial<CdsFhirAuthConfig> = {
  cdsFhirAuthRequired: true,
  cdsSharedSecretCompat: false,
  cdsFhirAuthIssuer: 'https://ehr.example.test',
  cdsFhirAuthAudience: 'https://api.example.test/cds-services/medgnosis-care-gaps',
  cdsFhirAuthJwksUrl: 'https://ehr.example.test/.well-known/jwks.json',
  cdsFhirAuthRequiredScopes: 'patient/Observation.rs',
};

async function signedClientJwt({
  issuer = 'https://ehr.example.test',
  audience = 'https://api.example.test/cds-services/medgnosis-care-gaps',
  scope = 'patient/Observation.rs patient/Condition.rs',
  expiresInSeconds = 300,
  includeExp = true,
} = {}) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = (await exportJWK(publicKey)) as JWK;
  publicJwk.kid = 'cds-test-key';
  const jwks = createLocalJWKSet({ keys: [publicJwk] });

  let token = new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', kid: 'cds-test-key', typ: 'JWT' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setJti('cds-test-jti');

  if (includeExp) {
    token = token.setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds);
  }

  return { token: await token.sign(privateKey), jwks, publicJwk };
}

async function startJwksServer(publicJwk: JWK): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: [publicJwk] }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('JWKS test server did not bind to a TCP port');
  }

  return {
    url: `http://127.0.0.1:${address.port}/jwks.json`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function buildCdsApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(cdsHooksRoutes, { prefix: '/cds-services' });
  await app.ready();
  return app;
}

async function buildFeedbackApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(cdsFeedbackRoutes, { prefix: '/cds-services' });
  await app.ready();
  return app;
}

beforeEach(() => {
  Object.assign(mockConfig, {
    isProd: false,
    cdsHooksSecret: '',
    cdsFhirAuthRequired: false,
    cdsSharedSecretCompat: true,
    cdsJwksCacheTtlSeconds: 300,
    cdsFhirAuthIssuer: '',
    cdsFhirAuthAudience: '',
    cdsFhirAuthJwksUrl: '',
    cdsFhirAuthRequiredScopes: '',
    webAppUrl: 'http://localhost:5175',
  });
  mockSql.mockReset();
  clearFhirAuthorizationJwksCache();
});

describe('verifyFhirAuthorization', () => {
  it('accepts a signed CDS Hooks client JWT with issuer, audience, exp, and scope', async () => {
    const { token, jwks } = await signedClientJwt();

    const result = await verifyFhirAuthorization(token, '', { config: jwtConfig, jwks });

    expect(result.ok).toBe(true);
    expect(result.method).toBe('fhirAuthorization');
    expect(result.payload?.iss).toBe('https://ehr.example.test');
  });

  it('rejects a valid signature with the wrong audience', async () => {
    const { token, jwks } = await signedClientJwt();

    const result = await verifyFhirAuthorization(token, '', {
      config: { ...jwtConfig, cdsFhirAuthAudience: 'https://api.example.test/cds-services/other' },
      jwks,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.code).toBe('cds_fhir_auth_invalid');
  });

  it('requires exp even when the signature is valid', async () => {
    const { token, jwks } = await signedClientJwt({ includeExp: false });

    const result = await verifyFhirAuthorization(token, '', { config: jwtConfig, jwks });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.message).toMatch(/exp/);
  });

  it('requires configured scopes when CDS scopes are configured', async () => {
    const { token, jwks } = await signedClientJwt({ scope: 'patient/Condition.rs' });

    const result = await verifyFhirAuthorization(token, '', { config: jwtConfig, jwks });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.message).toMatch(/scope/);
  });
});

describe('verifyCdsHookRequest', () => {
  it('allows shared-secret fallback only when compatibility is enabled', async () => {
    const request = {
      headers: { 'x-medgnosis-cds-secret': 'legacy-secret' },
      body: {},
    };

    const allowed = await verifyCdsHookRequest(request as never, {
      config: {
        isProd: true,
        cdsHooksSecret: 'legacy-secret',
        cdsFhirAuthRequired: true,
        cdsSharedSecretCompat: true,
      },
    });
    const denied = await verifyCdsHookRequest(request as never, {
      config: {
        ...jwtConfig,
        isProd: true,
        cdsHooksSecret: 'legacy-secret',
        cdsSharedSecretCompat: false,
      },
    });

    expect(allowed.ok).toBe(true);
    expect(allowed.method).toBe('shared-secret');
    expect(denied.ok).toBe(false);
    expect(denied.status).toBe(401);
  });
});

describe('CDS Hooks route auth', () => {
  it('keeps discovery open when CDS JWT auth is required', async () => {
    Object.assign(mockConfig, { ...jwtConfig, isProd: true, cdsFhirAuthRequired: true });
    const app = await buildCdsApp();

    const res = await app.inject({ method: 'GET', url: '/cds-services' });

    expect(res.statusCode).toBe(200);
    expect(res.json().services.map((service: { id: string }) => service.id)).toContain('medgnosis-order-select');
    await app.close();
  });

  it('authenticates order-select with the compatibility shared secret and returns hardened cards', async () => {
    Object.assign(mockConfig, {
      isProd: true,
      cdsHooksSecret: 'legacy-secret',
      cdsFhirAuthRequired: true,
      cdsSharedSecretCompat: true,
    });
    mockSql.mockResolvedValueOnce([
      {
        bundle_code: 'dm',
        condition_name: 'Diabetes',
        measure_name: 'A1c Testing',
        care_gap_id: 10,
        gap_priority: 'high',
        item_name: 'Hemoglobin A1c',
        item_type: 'lab',
        loinc_code: '4548-4',
        loinc_description: 'Hemoglobin A1c/Hemoglobin.total in Blood',
        cpt_code: null,
        cpt_description: null,
        frequency: 'annually',
      },
    ]);
    const app = await buildCdsApp();

    const res = await app.inject({
      method: 'POST',
      url: '/cds-services/medgnosis-order-select',
      headers: { 'x-medgnosis-cds-secret': 'legacy-secret' },
      payload: { hook: 'order-select', hookInstance: 'h1', context: { patientId: '42' } },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().cards[0]).toEqual(
      expect.objectContaining({
        indicator: 'warning',
        source: expect.objectContaining({
          topic: expect.objectContaining({ code: 'care-gap' }),
        }),
        overrideReasons: expect.arrayContaining([expect.objectContaining({ code: 'already-addressed' })]),
      }),
    );
    await app.close();
  });

  it('authenticates service POSTs with a CDS client JWT when compatibility is disabled', async () => {
    const { token, publicJwk } = await signedClientJwt();
    const jwksServer = await startJwksServer(publicJwk);
    Object.assign(mockConfig, {
      ...jwtConfig,
      isProd: true,
      cdsFhirAuthRequired: true,
      cdsSharedSecretCompat: false,
      cdsFhirAuthJwksUrl: jwksServer.url,
    });
    mockSql.mockResolvedValueOnce([]);
    const app = await buildCdsApp();

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/cds-services/medgnosis-care-gaps',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          hook: 'order-sign',
          hookInstance: 'h1',
          fhirAuthorization: {
            access_token: 'opaque-fhir-server-access-token',
            token_type: 'Bearer',
            scope: 'patient/Observation.rs',
          },
          context: { patientId: '42' },
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ cards: [] });
      expect(mockSql).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
      await jwksServer.close();
    }
  });

  it('rejects service POST shared-secret fallback when compatibility is disabled', async () => {
    Object.assign(mockConfig, {
      ...jwtConfig,
      isProd: true,
      cdsHooksSecret: 'legacy-secret',
      cdsSharedSecretCompat: false,
    });
    const app = await buildCdsApp();

    const res = await app.inject({
      method: 'POST',
      url: '/cds-services/medgnosis-care-gaps',
      headers: { 'x-medgnosis-cds-secret': 'legacy-secret' },
      payload: { hook: 'order-sign', hookInstance: 'h1', context: { patientId: '42' } },
    });

    expect(res.statusCode).toBe(401);
    expect(mockSql).not.toHaveBeenCalled();
    await app.close();
  });

  it('applies CDS JWT auth to feedback POSTs', async () => {
    Object.assign(mockConfig, {
      ...jwtConfig,
      isProd: true,
      cdsFhirAuthRequired: true,
      cdsSharedSecretCompat: false,
    });
    const app = await buildFeedbackApp();

    const res = await app.inject({
      method: 'POST',
      url: '/cds-services/medgnosis-care-gaps/feedback',
      payload: { feedback: [] },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()._error).toBe('Unauthorized');
    await app.close();
  });
});
