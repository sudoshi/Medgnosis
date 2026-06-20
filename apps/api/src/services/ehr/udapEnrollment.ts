// =============================================================================
// UDAP enrollment — load PKI credentials and register with a UDAP authorization
// server (TEFCA facilitated-FHIR). Wraps udapRegistration with cert/key loading
// from configuration. The certificates themselves come from UDAP/TEFCA
// enrollment with a recognized CA (see docs/EMPI-UDAP-ENROLLMENT.md) and are
// supplied as PEM via env/secret — this module turns them into a registration.
// =============================================================================

import { importPKCS8 } from 'jose';
import type { FetchLike } from './types.js';
import {
  buildUdapSoftwareStatement,
  registerUdapClient,
  UdapRegistrationError,
  type UdapClientRegistration,
} from './udapRegistration.js';

export interface UdapCredentials {
  issuer: string;
  registrationEndpoint: string;
  /** PKCS#8 PEM private key matching the leaf certificate. */
  privateKeyPkcs8: string;
  /** Base64-DER cert chain (leaf first) for the x5c header. */
  x5c: string[];
  alg: 'ES384' | 'RS384' | 'ES256' | 'RS256';
  clientName: string;
  grantTypes: string[];
  scope: string;
  redirectUris?: string[];
}

export interface RegisterWithUdapDeps {
  fetchImpl?: FetchLike;
}

/** Extract each certificate from a PEM chain as a single-line base64 DER string (leaf first). */
export function parseCertChainToX5c(pem: string): string[] {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g);
  if (!blocks) return [];
  return blocks.map((block) =>
    block
      .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
      .replace(/\s+/g, ''),
  );
}

export async function registerWithUdap(
  creds: UdapCredentials,
  deps: RegisterWithUdapDeps = {},
): Promise<UdapClientRegistration> {
  if (creds.x5c.length === 0) {
    throw new UdapRegistrationError('UDAP enrollment requires a certificate chain (x5c)');
  }
  const signingKey = await importPKCS8(creds.privateKeyPkcs8, creds.alg);
  const softwareStatement = await buildUdapSoftwareStatement(
    {
      issuer: creds.issuer,
      registrationEndpoint: creds.registrationEndpoint,
      clientName: creds.clientName,
      grantTypes: creds.grantTypes,
      scope: creds.scope,
      x5c: creds.x5c,
      alg: creds.alg,
      redirectUris: creds.redirectUris,
    },
    signingKey,
  );
  return registerUdapClient({
    registrationEndpoint: creds.registrationEndpoint,
    softwareStatement,
    fetchImpl: deps.fetchImpl,
  });
}

const ALLOWED_ALGS = new Set(['ES384', 'RS384', 'ES256', 'RS256']);

/**
 * Load UDAP credentials from the environment, or undefined when not configured.
 * UDAP_PRIVATE_KEY / UDAP_CERT_CHAIN are PEM (the cert chain is parsed to x5c).
 */
export function loadUdapCredentialsFromEnv(): UdapCredentials | undefined {
  if (process.env['UDAP_ENABLED'] !== 'true') return undefined;
  const issuer = process.env['UDAP_ISSUER'];
  const registrationEndpoint = process.env['UDAP_REGISTRATION_ENDPOINT'];
  const privateKeyPkcs8 = process.env['UDAP_PRIVATE_KEY'];
  const certChain = process.env['UDAP_CERT_CHAIN'];
  if (!issuer || !registrationEndpoint || !privateKeyPkcs8 || !certChain) return undefined;

  const algRaw = process.env['UDAP_ALG'] ?? 'ES384';
  const alg = (ALLOWED_ALGS.has(algRaw) ? algRaw : 'ES384') as UdapCredentials['alg'];
  const grantTypes = (process.env['UDAP_GRANT_TYPES'] ?? 'client_credentials')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
  const redirectUris = process.env['UDAP_REDIRECT_URIS']
    ? process.env['UDAP_REDIRECT_URIS'].split(',').map((u) => u.trim()).filter(Boolean)
    : undefined;

  return {
    issuer,
    registrationEndpoint,
    privateKeyPkcs8,
    x5c: parseCertChainToX5c(certChain),
    alg,
    clientName: process.env['UDAP_CLIENT_NAME'] ?? 'Medgnosis',
    grantTypes,
    scope: process.env['UDAP_SCOPE'] ?? 'system/Patient.read',
    redirectUris,
  };
}
