import { describe, expect, it, vi } from 'vitest';
import { jwtVerify } from 'jose';

vi.mock('@medgnosis/db', () => ({
  sql: vi.fn(),
}));

import {
  createBackendClientAssertion,
} from './backendServices.js';
import {
  formatBackendKeyEnv,
  generateBackendKeyMaterial,
} from './backendKeygen.js';
import { loadBackendPublicJwksFromEnvironment } from './backendJwks.js';

describe('generateBackendKeyMaterial', () => {
  it('generates private JWK refs and public JWKS material usable for Backend Services', async () => {
    const material = generateBackendKeyMaterial({
      kid: 'backend-key-1',
      alg: 'RS384',
      envPrefix: 'ehr_backend_test',
    });

    expect(material.env.privateJwkVar).toBe('EHR_BACKEND_TEST_PRIVATE_JWK_JSON');
    expect(material.env.privateKeyRef).toBe(
      'env:EHR_BACKEND_TEST_PRIVATE_JWK_JSON?kid=backend-key-1&alg=RS384',
    );
    expect(material.publicJwk).toMatchObject({
      kty: 'RSA',
      kid: 'backend-key-1',
      alg: 'RS384',
      use: 'sig',
    });
    expect(material.privateJwk).toHaveProperty('d');

    const jwks = loadBackendPublicJwksFromEnvironment({
      EHR_BACKEND_PUBLIC_JWKS_JSON: material.env.publicJwksJson,
    });
    expect(jwks?.keys[0]).toMatchObject({ kid: 'backend-key-1' });

    const assertion = await createBackendClientAssertion({
      clientId: 'backend-client',
      tokenEndpoint: 'https://ehr.example.test/oauth2/token',
      privateKey: material.privateJwk,
      jwksUrl: 'https://api.medgnosis.test/.well-known/jwks.json',
      now: new Date('2026-06-16T12:00:00Z'),
      jti: 'jti-1',
    });

    const { payload } = await jwtVerify(assertion, material.publicJwk, {
      issuer: 'backend-client',
      subject: 'backend-client',
      audience: 'https://ehr.example.test/oauth2/token',
      currentDate: new Date('2026-06-16T12:00:00Z'),
    });
    expect(payload.jti).toBe('jti-1');
  });

  it('formats shell-safe env lines without exposing private material outside the private JWK variable', () => {
    const material = generateBackendKeyMaterial({ kid: 'backend-key-1' });
    const output = formatBackendKeyEnv(material);

    expect(output).toContain('EHR_BACKEND_PRIVATE_JWK_JSON=');
    expect(output).toContain('EHR_BACKEND_PUBLIC_JWK_JSON=');
    expect(output).toContain('EHR_BACKEND_PUBLIC_JWKS_JSON=');
    expect(output).toContain('env:EHR_BACKEND_PRIVATE_JWK_JSON?kid=backend-key-1&alg=RS384');
  });
});
