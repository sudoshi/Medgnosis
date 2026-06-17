import { generateKeyPairSync } from 'node:crypto';
import type { JWK } from 'jose';
import type { BackendSigningAlg } from './backendServices.js';

export interface GeneratedBackendKeyMaterial {
  kid: string;
  alg: BackendSigningAlg;
  privateJwk: JWK;
  publicJwk: JWK;
  publicJwks: { keys: JWK[] };
  env: {
    privateJwkVar: string;
    publicJwkVar: string;
    publicJwksVar: string;
    privateJwkJson: string;
    publicJwkJson: string;
    publicJwksJson: string;
    privateKeyRef: string;
  };
}

export interface GenerateBackendKeyInput {
  kid?: string;
  alg?: BackendSigningAlg;
  envPrefix?: string;
}

export function generateBackendKeyMaterial(
  input: GenerateBackendKeyInput = {},
): GeneratedBackendKeyMaterial {
  const alg = input.alg ?? 'RS384';
  const kid = input.kid ?? `ehr-backend-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const envPrefix = normalizeEnvPrefix(input.envPrefix ?? 'EHR_BACKEND');
  const { privateKey, publicKey } = generateKeyPair(alg);
  const privateJwk = withPublicMetadata(privateKey.export({ format: 'jwk' }) as JWK, kid, alg);
  const publicJwk = withPublicMetadata(publicKey.export({ format: 'jwk' }) as JWK, kid, alg);
  const privateJwkVar = `${envPrefix}_PRIVATE_JWK_JSON`;
  const publicJwkVar = `${envPrefix}_PUBLIC_JWK_JSON`;
  const publicJwksVar = `${envPrefix}_PUBLIC_JWKS_JSON`;
  const publicJwks = { keys: [publicJwk] };

  return {
    kid,
    alg,
    privateJwk,
    publicJwk,
    publicJwks,
    env: {
      privateJwkVar,
      publicJwkVar,
      publicJwksVar,
      privateJwkJson: JSON.stringify(privateJwk),
      publicJwkJson: JSON.stringify(publicJwk),
      publicJwksJson: JSON.stringify(publicJwks),
      privateKeyRef: `env:${privateJwkVar}?kid=${encodeURIComponent(kid)}&alg=${alg}`,
    },
  };
}

export function formatBackendKeyEnv(material: GeneratedBackendKeyMaterial): string {
  return [
    `${material.env.privateJwkVar}=${shellQuote(material.env.privateJwkJson)}`,
    `${material.env.publicJwkVar}=${shellQuote(material.env.publicJwkJson)}`,
    `${material.env.publicJwksVar}=${shellQuote(material.env.publicJwksJson)}`,
    `# Use this value for ehr_client_registration.private_key_ref:`,
    `# ${material.env.privateKeyRef}`,
  ].join('\n');
}

function generateKeyPair(alg: BackendSigningAlg) {
  if (alg === 'ES384') {
    return generateKeyPairSync('ec', { namedCurve: 'P-384' });
  }
  if (alg === 'ES256') {
    return generateKeyPairSync('ec', { namedCurve: 'P-256' });
  }
  return generateKeyPairSync('rsa', { modulusLength: 3072 });
}

function withPublicMetadata(jwk: JWK, kid: string, alg: BackendSigningAlg): JWK {
  return {
    ...jwk,
    kid,
    alg,
    use: 'sig',
  };
}

function normalizeEnvPrefix(value: string): string {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'EHR_BACKEND';
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
