// =============================================================================
// UDAP Dynamic Client Registration — the trust layer for TEFCA facilitated-FHIR.
//
// UDAP (HL7 "Security for Scalable Registration, Authentication, and
// Authorization" IG) extends the SMART Backend Services primitive (signed JWT
// client assertion) with PKI: the registration request carries a "software
// statement" — a JWT signed by the organization's X.509 certificate, with the
// cert chain in the `x5c` header — POSTed to the server's UDAP registration
// endpoint, which returns a client_id usable for subsequent client_credentials
// (private_key_jwt) token requests.
//
// This is the in-repo machinery; the actual certificates come from TEFCA/UDAP
// enrollment and are supplied as config (PEM key + x5c chain).
// =============================================================================

import { randomUUID } from 'node:crypto';
import { SignJWT, type JWTHeaderParameters } from 'jose';
import type { FetchLike } from './types.js';

// jose dropped the exported KeyLike alias in v6; derive the accepted key type
// directly from SignJWT.sign so this stays correct across versions.
type SigningKey = Parameters<InstanceType<typeof SignJWT>['sign']>[0];

const DEFAULT_TTL_SECONDS = 300;

export interface UdapSoftwareStatementInput {
  /** The client's unique URI (matches a SAN in the signing certificate). */
  issuer: string;
  /** The server's UDAP registration endpoint (the JWT audience). */
  registrationEndpoint: string;
  clientName: string;
  grantTypes: string[];
  scope: string;
  /** Base64-DER cert chain (leaf first) for the `x5c` JWT header. */
  x5c: string[];
  alg: 'ES384' | 'RS384' | 'ES256' | 'RS256';
  /** Required for an authorization_code client; rejected for client_credentials. */
  redirectUris?: string[];
  contacts?: string[];
  ttlSeconds?: number;
  now?: Date;
}

export class UdapRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UdapRegistrationError';
  }
}

export async function buildUdapSoftwareStatement(
  input: UdapSoftwareStatementInput,
  signingKey: SigningKey,
): Promise<string> {
  const isAuthCode = input.grantTypes.includes('authorization_code');
  if (isAuthCode && (!input.redirectUris || input.redirectUris.length === 0)) {
    throw new UdapRegistrationError('UDAP authorization_code clients require at least one redirect_uri');
  }

  const now = input.now ?? new Date();
  const iat = Math.floor(now.getTime() / 1000);
  const ttl = input.ttlSeconds && input.ttlSeconds > 0 ? input.ttlSeconds : DEFAULT_TTL_SECONDS;

  const claims: Record<string, unknown> = {
    client_name: input.clientName,
    grant_types: input.grantTypes,
    token_endpoint_auth_method: 'private_key_jwt',
    scope: input.scope,
  };
  if (isAuthCode) {
    claims.redirect_uris = input.redirectUris;
    claims.response_types = ['code'];
  }
  if (input.contacts && input.contacts.length > 0) claims.contacts = input.contacts;

  const header: JWTHeaderParameters = { alg: input.alg, x5c: input.x5c, typ: 'JWT' };

  return new SignJWT(claims)
    .setProtectedHeader(header)
    .setIssuer(input.issuer)
    .setSubject(input.issuer)
    .setAudience(input.registrationEndpoint)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttl)
    .setJti(randomUUID())
    .sign(signingKey);
}

export interface RegisterUdapClientInput {
  registrationEndpoint: string;
  softwareStatement: string;
  /** Optional UDAP certification JWTs. */
  certifications?: string[];
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export interface UdapClientRegistration {
  clientId: string;
  scope?: string;
}

export async function registerUdapClient(input: RegisterUdapClientInput): Promise<UdapClientRegistration> {
  const fetchImpl = input.fetchImpl ?? (globalThis.fetch.bind(globalThis) as FetchLike);
  const body: Record<string, unknown> = { software_statement: input.softwareStatement, udap: 'UDAP1' };
  if (input.certifications && input.certifications.length > 0) body.certifications = input.certifications;

  const response = await fetchImpl(input.registrationEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(input.timeoutMs ?? 15_000),
  });
  if (response.status < 200 || response.status >= 300) {
    throw new UdapRegistrationError(`UDAP registration failed with HTTP ${response.status}`);
  }
  const json = (await response.json()) as { client_id?: string; scope?: string };
  if (!json.client_id) {
    throw new UdapRegistrationError('UDAP registration response did not include a client_id');
  }
  return { clientId: json.client_id, scope: json.scope };
}
