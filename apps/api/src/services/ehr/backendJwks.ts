// =============================================================================
// SMART Backend Services JWKS publication
// Publishes public signing keys for EHR validation without exposing private key
// material used by private_key_jwt client authentication.
// =============================================================================

import { createPublicKey } from 'node:crypto';
import type { JWK } from 'jose';

export interface PublicJwks {
  keys: JWK[];
}

export class BackendJwksError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 500) {
    super(message);
    this.name = 'BackendJwksError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const PRIVATE_JWK_FIELDS = new Set(['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']);
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export function loadBackendPublicJwksFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): PublicJwks | null {
  const jwksJson = env['EHR_BACKEND_PUBLIC_JWKS_JSON']?.trim();
  const jwkJson = env['EHR_BACKEND_PUBLIC_JWK_JSON']?.trim();

  if (jwksJson && jwkJson) {
    throw new BackendJwksError(
      'backend_jwks_ambiguous',
      'Configure either EHR_BACKEND_PUBLIC_JWKS_JSON or EHR_BACKEND_PUBLIC_JWK_JSON, not both',
    );
  }
  if (!jwksJson && !jwkJson) return null;

  const parsed = parseJson(jwksJson ?? jwkJson ?? '', jwksJson ? 'JWKS' : 'JWK');
  const jwks = jwksJson
    ? normalizeJwks(parsed)
    : { keys: [normalizeJwk(parsed, 0)] };

  if (jwks.keys.length === 0) {
    throw new BackendJwksError(
      'backend_jwks_empty',
      'SMART Backend Services public JWKS must contain at least one key',
    );
  }

  return jwks;
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new BackendJwksError(
      'backend_jwks_invalid_json',
      `SMART Backend Services public ${label} environment variable is not valid JSON`,
    );
  }
}

function normalizeJwks(value: unknown): PublicJwks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BackendJwksError(
      'backend_jwks_invalid',
      'SMART Backend Services public JWKS must be a JSON object with a keys array',
    );
  }
  const keys = (value as { keys?: unknown }).keys;
  if (!Array.isArray(keys)) {
    throw new BackendJwksError(
      'backend_jwks_missing_keys',
      'SMART Backend Services public JWKS must include a keys array',
    );
  }
  const normalized = keys.map((key, index) => normalizeJwk(key, index));
  assertUniqueKids(normalized);
  return { keys: normalized };
}

function normalizeJwk(value: unknown, index: number): JWK {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BackendJwksError(
      'backend_jwk_invalid',
      `SMART Backend Services public JWK at index ${index} must be a JSON object`,
    );
  }

  const jwk = value as Record<string, unknown>;
  if (typeof jwk.kty !== 'string' || jwk.kty.length === 0) {
    throw new BackendJwksError(
      'backend_jwk_missing_kty',
      `SMART Backend Services public JWK at index ${index} is missing kty`,
    );
  }
  if (jwk.kty === 'oct') {
    throw new BackendJwksError(
      'backend_jwk_symmetric_key_rejected',
      `SMART Backend Services public JWK at index ${index} must not be a symmetric key`,
    );
  }
  if (typeof jwk.kid !== 'string' || jwk.kid.length === 0) {
    throw new BackendJwksError(
      'backend_jwk_missing_kid',
      `SMART Backend Services public JWK at index ${index} is missing kid`,
    );
  }
  for (const field of PRIVATE_JWK_FIELDS) {
    if (field in jwk) {
      throw new BackendJwksError(
        'backend_jwk_private_material_rejected',
        `SMART Backend Services public JWK at index ${index} contains private key material`,
      );
    }
  }
  validatePublicKeyShape(jwk, index);

  return jwk as JWK;
}

function assertUniqueKids(keys: JWK[]): void {
  const seen = new Set<string>();
  for (const key of keys) {
    const kid = key.kid as string;
    if (seen.has(kid)) {
      throw new BackendJwksError(
        'backend_jwk_duplicate_kid',
        `SMART Backend Services public JWKS contains duplicate kid: ${kid}`,
      );
    }
    seen.add(kid);
  }
}

function validatePublicKeyShape(jwk: Record<string, unknown>, index: number): void {
  if (jwk.kty === 'RSA') {
    requireBase64UrlField(jwk, 'n', index);
    requireBase64UrlField(jwk, 'e', index);
    validateAlgFamily(jwk, index, ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512']);
  } else if (jwk.kty === 'EC') {
    requireStringField(jwk, 'crv', index);
    requireBase64UrlField(jwk, 'x', index);
    requireBase64UrlField(jwk, 'y', index);
    validateAlgFamily(jwk, index, ['ES256', 'ES384', 'ES512']);
  } else {
    throw new BackendJwksError(
      'backend_jwk_unsupported_kty',
      `SMART Backend Services public JWK at index ${index} has unsupported kty`,
    );
  }

  try {
    createPublicKey({ key: jwk, format: 'jwk' } as Parameters<typeof createPublicKey>[0]);
  } catch {
    throw new BackendJwksError(
      'backend_jwk_invalid_public_key',
      `SMART Backend Services public JWK at index ${index} is not valid public key material`,
    );
  }
}

function validateAlgFamily(jwk: Record<string, unknown>, index: number, allowed: string[]): void {
  if (jwk.alg === undefined) return;
  if (typeof jwk.alg !== 'string' || !allowed.includes(jwk.alg)) {
    throw new BackendJwksError(
      'backend_jwk_alg_mismatch',
      `SMART Backend Services public JWK at index ${index} alg is not compatible with kty`,
    );
  }
}

function requireStringField(jwk: Record<string, unknown>, field: string, index: number): void {
  if (typeof jwk[field] !== 'string' || jwk[field].length === 0) {
    throw new BackendJwksError(
      'backend_jwk_missing_public_material',
      `SMART Backend Services public JWK at index ${index} is missing ${field}`,
    );
  }
}

function requireBase64UrlField(jwk: Record<string, unknown>, field: string, index: number): void {
  requireStringField(jwk, field, index);
  if (!BASE64URL_RE.test(jwk[field] as string)) {
    throw new BackendJwksError(
      'backend_jwk_invalid_public_material',
      `SMART Backend Services public JWK at index ${index} has invalid ${field}`,
    );
  }
}
