import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import type { JWK } from 'jose';
import {
  BackendJwksError,
  loadBackendPublicJwksFromEnvironment,
} from './backendJwks.js';

describe('loadBackendPublicJwksFromEnvironment', () => {
  it('loads a public JWKS from EHR_BACKEND_PUBLIC_JWKS_JSON', () => {
    const publicJwk = createPublicJwk();
    const jwks = loadBackendPublicJwksFromEnvironment({
      EHR_BACKEND_PUBLIC_JWKS_JSON: JSON.stringify({ keys: [publicJwk] }),
    });

    expect(jwks).toEqual({ keys: [publicJwk] });
  });

  it('loads a single public JWK from EHR_BACKEND_PUBLIC_JWK_JSON', () => {
    const publicJwk = createPublicJwk();
    const jwks = loadBackendPublicJwksFromEnvironment({
      EHR_BACKEND_PUBLIC_JWK_JSON: JSON.stringify(publicJwk),
    });

    expect(jwks).toEqual({ keys: [publicJwk] });
  });

  it('returns null when no public key material is configured', () => {
    expect(loadBackendPublicJwksFromEnvironment({})).toBeNull();
  });

  it('rejects ambiguous JWKS and JWK configuration', () => {
    const publicJwk = createPublicJwk();
    expect(() =>
      loadBackendPublicJwksFromEnvironment({
        EHR_BACKEND_PUBLIC_JWKS_JSON: JSON.stringify({ keys: [publicJwk] }),
        EHR_BACKEND_PUBLIC_JWK_JSON: JSON.stringify(publicJwk),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'backend_jwks_ambiguous',
      }) as BackendJwksError,
    );
  });

  it('rejects private key material in the public JWKS', () => {
    const publicJwk = createPublicJwk();
    expect(() =>
      loadBackendPublicJwksFromEnvironment({
        EHR_BACKEND_PUBLIC_JWKS_JSON: JSON.stringify({
          keys: [{ ...publicJwk, d: 'private-exponent' }],
        }),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'backend_jwk_private_material_rejected',
      }) as BackendJwksError,
    );
  });

  it('rejects public keys without kid', () => {
    const publicJwk = createPublicJwk();
    const { kid: _kid, ...missingKid } = publicJwk;

    expect(() =>
      loadBackendPublicJwksFromEnvironment({
        EHR_BACKEND_PUBLIC_JWKS_JSON: JSON.stringify({ keys: [missingKid] }),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'backend_jwk_missing_kid',
      }) as BackendJwksError,
    );
  });

  it('rejects duplicate key ids', () => {
    const first = createPublicJwk();
    const second = createPublicJwk('backend-key-1');

    expect(() =>
      loadBackendPublicJwksFromEnvironment({
        EHR_BACKEND_PUBLIC_JWKS_JSON: JSON.stringify({ keys: [first, second] }),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'backend_jwk_duplicate_kid',
      }) as BackendJwksError,
    );
  });

  it('rejects RSA keys missing public modulus/exponent material', () => {
    const publicJwk = createPublicJwk();
    const { n: _n, ...missingModulus } = publicJwk;

    expect(() =>
      loadBackendPublicJwksFromEnvironment({
        EHR_BACKEND_PUBLIC_JWKS_JSON: JSON.stringify({ keys: [missingModulus] }),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'backend_jwk_missing_public_material',
      }) as BackendJwksError,
    );
  });

  it('rejects alg values incompatible with key type', () => {
    const publicJwk = createPublicJwk();

    expect(() =>
      loadBackendPublicJwksFromEnvironment({
        EHR_BACKEND_PUBLIC_JWK_JSON: JSON.stringify({ ...publicJwk, alg: 'ES384' }),
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'backend_jwk_alg_mismatch',
      }) as BackendJwksError,
    );
  });
});

function createPublicJwk(kid = 'backend-key-1'): JWK {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    ...(publicKey.export({ format: 'jwk' }) as JWK),
    kid,
    alg: 'RS384',
    use: 'sig',
  };
}
