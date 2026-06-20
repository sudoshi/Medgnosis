// =============================================================================
// Unit tests - UDAP Dynamic Client Registration (TEFCA facilitated-FHIR trust)
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import { SignJWT, generateKeyPair, jwtVerify, decodeProtectedHeader } from 'jose';
import { buildUdapSoftwareStatement, registerUdapClient } from './udapRegistration.js';

const REG_ENDPOINT = 'https://fhir.example.org/udap/register';

async function keys() {
  const { privateKey, publicKey } = await generateKeyPair('ES384');
  return { privateKey, publicKey };
}

const baseInput = {
  issuer: 'https://medgnosis.acumenus.net',
  registrationEndpoint: REG_ENDPOINT,
  clientName: 'Medgnosis',
  grantTypes: ['client_credentials'] as string[],
  scope: 'system/Patient.read',
  x5c: ['MIID...base64der...'],
  alg: 'ES384' as const,
};

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('buildUdapSoftwareStatement', () => {
  it('signs a JWT whose header carries the x5c chain and whose claims meet the UDAP DCR profile', async () => {
    const { privateKey, publicKey } = await keys();
    const now = new Date('2026-06-20T00:00:00Z');
    const jwt = await buildUdapSoftwareStatement({ ...baseInput, now }, privateKey);

    const header = decodeProtectedHeader(jwt);
    expect(header.alg).toBe('ES384');
    expect(header.x5c).toEqual(baseInput.x5c);

    const { payload } = await jwtVerify(jwt, publicKey, { audience: REG_ENDPOINT, currentDate: now });
    expect(payload.iss).toBe(baseInput.issuer);
    expect(payload.sub).toBe(baseInput.issuer);
    expect(payload.client_name).toBe('Medgnosis');
    expect(payload.grant_types).toEqual(['client_credentials']);
    expect(payload.token_endpoint_auth_method).toBe('private_key_jwt');
    expect(payload.scope).toBe('system/Patient.read');
    // client_credentials must not carry redirect_uris
    expect(payload.redirect_uris).toBeUndefined();
    expect(typeof payload.jti).toBe('string');
    expect(payload.iat).toBe(Math.floor(now.getTime() / 1000));
  });

  it('includes redirect_uris + response_types for an authorization_code client', async () => {
    const { privateKey, publicKey } = await keys();
    const jwt = await buildUdapSoftwareStatement(
      { ...baseInput, grantTypes: ['authorization_code', 'refresh_token'], redirectUris: ['https://medgnosis.acumenus.net/cb'] },
      privateKey,
    );
    const { payload } = await jwtVerify(jwt, publicKey, { audience: REG_ENDPOINT });
    expect(payload.redirect_uris).toEqual(['https://medgnosis.acumenus.net/cb']);
    expect(payload.response_types).toEqual(['code']);
  });

  it('throws when an authorization_code client has no redirect_uris', async () => {
    const { privateKey } = await keys();
    await expect(
      buildUdapSoftwareStatement({ ...baseInput, grantTypes: ['authorization_code'] }, privateKey),
    ).rejects.toThrow(/redirect/i);
  });
});

describe('registerUdapClient', () => {
  it('POSTs the software statement with udap=UDAP1 and returns the client_id', async () => {
    const { privateKey } = await keys();
    const softwareStatement = await new SignJWT({ iss: baseInput.issuer })
      .setProtectedHeader({ alg: 'ES384', x5c: baseInput.x5c })
      .sign(privateKey);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ client_id: 'udap-client-123', scope: 'system/Patient.read' }));

    const result = await registerUdapClient(
      { registrationEndpoint: REG_ENDPOINT, softwareStatement, fetchImpl },
    );

    expect(result).toEqual({ clientId: 'udap-client-123', scope: 'system/Patient.read' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(REG_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ software_statement: softwareStatement, udap: 'UDAP1' });
  });

  it('throws on a non-2xx registration response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_software_statement' }, 400));
    await expect(
      registerUdapClient({ registrationEndpoint: REG_ENDPOINT, softwareStatement: 'x', fetchImpl }),
    ).rejects.toThrow(/registration/i);
  });

  it('throws when the response has no client_id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ scope: 'x' }, 201));
    await expect(
      registerUdapClient({ registrationEndpoint: REG_ENDPOINT, softwareStatement: 'x', fetchImpl }),
    ).rejects.toThrow(/client_id/i);
  });
});
