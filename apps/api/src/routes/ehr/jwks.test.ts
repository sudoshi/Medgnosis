import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import type { JWK } from 'jose';
import Fastify from 'fastify';
import ehrJwksRoutes from './jwks.js';

describe('ehrJwksRoutes', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('serves the configured SMART Backend Services public JWKS', async () => {
    const publicJwk = createPublicJwk();
    vi.stubEnv('EHR_BACKEND_PUBLIC_JWKS_JSON', JSON.stringify({ keys: [publicJwk] }));

    const app = Fastify();
    await app.register(ehrJwksRoutes, { prefix: '/.well-known' });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/.well-known/jwks.json',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=300, must-revalidate');
    expect(response.json()).toEqual({ keys: [publicJwk] });

    await app.close();
  });

  it('returns a public error envelope when JWKS is not configured', async () => {
    const app = Fastify();
    await app.register(ehrJwksRoutes, { prefix: '/.well-known' });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/.well-known/jwks.json',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      success: false,
      error: {
        code: 'EHR_BACKEND_JWKS_NOT_CONFIGURED',
        message: 'SMART Backend Services public JWKS is not configured',
      },
    });

    await app.close();
  });
});

function createPublicJwk(): JWK {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    ...(publicKey.export({ format: 'jwk' }) as JWK),
    kid: 'backend-key-1',
    alg: 'RS384',
    use: 'sig',
  };
}
