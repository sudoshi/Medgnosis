// =============================================================================
// Unit tests - UDAP enrollment (cert loading + registration orchestration)
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import { exportPKCS8, generateKeyPair } from 'jose';
import { parseCertChainToX5c, registerWithUdap, type UdapCredentials } from './udapEnrollment.js';

const SAMPLE_PEM = `-----BEGIN CERTIFICATE-----
MIIBleaf0000AAAA
BBBBCCCC
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIBca0001DDDD
-----END CERTIFICATE-----
`;

describe('parseCertChainToX5c', () => {
  it('extracts each certificate body as a single-line base64 DER string (leaf first)', () => {
    expect(parseCertChainToX5c(SAMPLE_PEM)).toEqual([
      'MIIBleaf0000AAAABBBBCCCC',
      'MIIBca0001DDDD',
    ]);
  });

  it('returns [] for empty / non-cert input', () => {
    expect(parseCertChainToX5c('')).toEqual([]);
    expect(parseCertChainToX5c('not a cert')).toEqual([]);
  });
});

describe('registerWithUdap', () => {
  async function creds(): Promise<UdapCredentials> {
    const { privateKey } = await generateKeyPair('ES384', { extractable: true });
    return {
      issuer: 'https://medgnosis.acumenus.net',
      registrationEndpoint: 'https://fhir.example.org/udap/register',
      privateKeyPkcs8: await exportPKCS8(privateKey),
      x5c: ['MIIBleaf0000'],
      alg: 'ES384',
      clientName: 'Medgnosis',
      grantTypes: ['client_credentials'],
      scope: 'system/Patient.read',
    };
  }

  it('imports the key, signs a software statement, registers, and returns the client_id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ client_id: 'udap-xyz', scope: 'system/Patient.read' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await registerWithUdap(await creds(), { fetchImpl });

    expect(result).toEqual({ clientId: 'udap-xyz', scope: 'system/Patient.read' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://fhir.example.org/udap/register');
    const body = JSON.parse(init.body as string);
    expect(body.udap).toBe('UDAP1');
    expect(typeof body.software_statement).toBe('string');
    expect(body.software_statement.split('.')).toHaveLength(3); // a signed JWS
  });

  it('throws when no certificate chain is configured', async () => {
    const c = await creds();
    await expect(registerWithUdap({ ...c, x5c: [] }, {})).rejects.toThrow(/certificate/i);
  });
});
