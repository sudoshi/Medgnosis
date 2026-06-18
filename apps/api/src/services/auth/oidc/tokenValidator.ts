import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { OidcDiscoveryDocument } from './discovery.js';
import type { OidcProviderConfig } from './providerConfig.js';

export interface ValidatedOidcClaims {
  sub: string;
  email: string;
  name: string;
  groups: string[];
  claims: JWTPayload;
}

function claimString(payload: JWTPayload, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}

function claimGroups(payload: JWTPayload): string[] {
  const groups = payload.groups;
  if (Array.isArray(groups)) {
    return groups.filter((group): group is string => typeof group === 'string' && group.length > 0);
  }
  if (typeof groups === 'string' && groups.length > 0) {
    return [groups];
  }
  return [];
}

export async function validateOidcIdToken(
  idToken: string,
  discovery: OidcDiscoveryDocument,
  provider: OidcProviderConfig,
  expectedNonce: string,
): Promise<ValidatedOidcClaims> {
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  const result = await jwtVerify(idToken, jwks, {
    issuer: discovery.issuer,
    audience: provider.clientId,
    maxTokenAge: '15m',
    clockTolerance: 30,
  });

  const payload = result.payload;
  if (payload.nonce !== expectedNonce) {
    throw new Error('OIDC nonce mismatch');
  }

  const sub = claimString(payload, 'sub');
  const email = claimString(payload, 'email').toLowerCase();
  const name = claimString(payload, 'name') || email;

  if (!sub || !email || !name) {
    throw new Error('OIDC id token is missing required user claims');
  }

  return {
    sub,
    email,
    name,
    groups: claimGroups(payload),
    claims: payload,
  };
}
