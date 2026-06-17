import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  (fn as unknown as { json: (value: unknown) => unknown }).json = (value: unknown) => value;
  return { mockSql: fn };
});

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import {
  expiresAtFromExpiresIn,
  hashToken,
  normalizeScope,
  persistSmartTokenMetadata,
  sanitizeTokenResponseMetadata,
} from './tokenStore.js';

beforeEach(() => {
  mockSql.mockReset();
});

describe('token metadata helpers', () => {
  it('hashes tokens deterministically and normalizes scopes', () => {
    expect(hashToken('access-token')).toBe(
      '3f16bed7089f4653e5ef21bfd2824d7f3aaaecc7a598e7e89c580e1606a9cc52',
    );
    expect(hashToken(null)).toBeNull();
    expect(normalizeScope(['openid', ' patient/Patient.r ', ''])).toBe('openid patient/Patient.r');
  });

  it('derives token expiry from expires_in seconds', () => {
    expect(expiresAtFromExpiresIn(300, new Date('2026-06-16T12:00:00Z'))).toBe(
      '2026-06-16T12:05:00.000Z',
    );
    expect(expiresAtFromExpiresIn(0, new Date('2026-06-16T12:00:00Z'))).toBeNull();
  });

  it('removes raw token fields from response metadata', () => {
    expect(
      sanitizeTokenResponseMetadata({
        access_token: 'raw-access',
        refresh_token: 'raw-refresh',
        id_token: 'raw-id',
        token_type: 'Bearer',
        patient: 'pat-1',
      }),
    ).toEqual({ token_type: 'Bearer', patient: 'pat-1' });
  });
});

describe('persistSmartTokenMetadata', () => {
  it('stores token hashes and sanitized metadata without raw token values', async () => {
    const accessHash = hashToken('raw-access-token');
    const refreshHash = hashToken('raw-refresh-token');
    const idHash = hashToken('raw-id-token');

    mockSql.mockResolvedValueOnce([
      {
        id: 'token-row-1',
        smart_launch_session_id: 'session-1',
        ehr_tenant_id: 42,
        org_id: 7,
        user_id: 'user-1',
        token_type: 'Bearer',
        scope: 'openid patient/Patient.r',
        access_token_hash: accessHash,
        refresh_token_hash: refreshHash,
        id_token_hash: idHash,
        patient_ref: 'pat-1',
        encounter_ref: 'enc-1',
        fhir_user_ref: 'Practitioner/doc-1',
        launch_context: {
          patient: 'pat-1',
          encounter: 'enc-1',
          fhirUser: 'Practitioner/doc-1',
          scopes: ['openid', 'patient/Patient.r'],
        },
        token_response_metadata: {
          token_type: 'Bearer',
          patient: 'pat-1',
        },
        issued_at: '2026-06-16T12:00:00Z',
        expires_at: '2026-06-16T13:00:00Z',
        revoked_at: null,
        created_at: '2026-06-16T12:00:00Z',
        updated_at: '2026-06-16T12:00:00Z',
      },
    ]);

    const stored = await persistSmartTokenMetadata({
      smartLaunchSessionId: 'session-1',
      ehrTenantId: 42,
      orgId: 7,
      userId: 'user-1',
      tokenType: 'Bearer',
      scope: ['openid', 'patient/Patient.r'],
      accessToken: 'raw-access-token',
      refreshToken: 'raw-refresh-token',
      idToken: 'raw-id-token',
      patientRef: 'pat-1',
      encounterRef: 'enc-1',
      fhirUserRef: 'Practitioner/doc-1',
      launchContext: {
        patient: 'pat-1',
        encounter: 'enc-1',
        fhirUser: 'Practitioner/doc-1',
        scopes: ['openid', 'patient/Patient.r'],
      },
      tokenResponseMetadata: {
        access_token: 'raw-access-token',
        refresh_token: 'raw-refresh-token',
        id_token: 'raw-id-token',
        token_type: 'Bearer',
        patient: 'pat-1',
      },
      issuedAt: '2026-06-16T12:00:00Z',
      expiresAt: '2026-06-16T13:00:00Z',
    });

    expect(stored).toMatchObject({
      id: 'token-row-1',
      accessTokenHash: accessHash,
      refreshTokenHash: refreshHash,
      idTokenHash: idHash,
      patientRef: 'pat-1',
    });

    const boundValues = JSON.stringify(mockSql.mock.calls[0]!.slice(1));
    expect(boundValues).toContain(accessHash!);
    expect(boundValues).toContain(refreshHash!);
    expect(boundValues).toContain(idHash!);
    expect(boundValues).not.toContain('raw-access-token');
    expect(boundValues).not.toContain('raw-refresh-token');
    expect(boundValues).not.toContain('raw-id-token');
  });
});
