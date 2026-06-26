import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OidcProviderConfig } from './providerConfig.js';
import type { ValidatedOidcClaims } from './tokenValidator.js';

const { mockSqlBegin, mockHash } = vi.hoisted(() => ({
  mockSqlBegin: vi.fn(),
  mockHash: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({
  sql: { begin: mockSqlBegin },
}));
vi.mock('bcrypt', () => ({
  default: { hash: mockHash },
}));

import {
  OidcAccessDeniedError,
  reconcileOidcUser,
} from './reconciliation.js';

const provider: OidcProviderConfig = {
  enabled: true,
  label: 'Authentik',
  discoveryUrl: 'https://issuer.example.test/.well-known/openid-configuration',
  clientId: 'medgnosis',
  clientSecret: '',
  redirectUri: 'https://medgnosis.example.test/api/v1/auth/oidc/callback',
  scopes: ['openid', 'profile', 'email', 'groups'],
  allowedGroups: ['Medgnosis Users'],
  adminGroups: ['Medgnosis Admins'],
  stateTtlSeconds: 300,
  exchangeTtlSeconds: 120,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockHash.mockResolvedValue('$2b$12$oidc-unusable-password-hash');
});

describe('reconcileOidcUser', () => {
  it('rejects users outside allowed/admin groups before opening a transaction', async () => {
    await expect(
      reconcileOidcUser(claims({ groups: ['Other Team'] }), provider),
    ).rejects.toBeInstanceOf(OidcAccessDeniedError);

    expect(mockSqlBegin).not.toHaveBeenCalled();
  });

  it('JIT provisions allowed non-admin users as active analysts', async () => {
    const unsafe = mockTransactionResponses(
      [],
      [],
      [],
      [userRow({
        email: 'grace@example.test',
        first_name: 'Grace',
        last_name: 'Hopper',
        role: 'analyst',
      })],
      [],
      [],
    );

    const user = await reconcileOidcUser(
      claims({ email: 'grace@example.test', name: 'Grace Hopper', groups: ['medgnosis users'] }),
      provider,
    );

    expect(user).toMatchObject({
      email: 'grace@example.test',
      first_name: 'Grace',
      last_name: 'Hopper',
      role: 'analyst',
      is_active: true,
      must_change_password: false,
    });
    expect(mockHash).toHaveBeenCalledTimes(1);
    expect(unsafe.mock.calls[3]?.[1]).toEqual([
      'grace@example.test',
      '$2b$12$oidc-unusable-password-hash',
      'Grace',
      'Hopper',
      'analyst',
    ]);
  });

  it('JIT provisions admin-group users as admin but never super-admin', async () => {
    const unsafe = mockTransactionResponses(
      [],
      [],
      [],
      [userRow({ role: 'admin' })],
      [],
      [],
    );

    const user = await reconcileOidcUser(
      claims({ email: 'admin@example.test', groups: ['Medgnosis Admins'] }),
      provider,
    );

    expect(user.role).toBe('admin');
    expect(unsafe.mock.calls[3]?.[1]).toContain('admin');
    expect(JSON.stringify(unsafe.mock.calls)).not.toContain('super_admin');
  });

  it('denies inactive mapped accounts without creating or linking identities', async () => {
    const unsafe = mockTransactionResponses(
      [],
      [],
      [userRow({ is_active: false })],
    );

    await expect(
      reconcileOidcUser(claims({ groups: ['Medgnosis Users'] }), provider),
    ).rejects.toThrow('OIDC user maps to an inactive Medgnosis account');

    expect(unsafe).toHaveBeenCalledTimes(3);
    expect(unsafe.mock.calls.some(([query]) => String(query).includes('INSERT INTO public.user_external_identities')))
      .toBe(false);
  });

  it('promotes existing non-admin accounts when admin group membership is present', async () => {
    const unsafe = mockTransactionResponses(
      [],
      [],
      [userRow({ role: 'provider' })],
      [userRow({ role: 'admin' })],
      [],
      [],
    );

    const user = await reconcileOidcUser(
      claims({ groups: ['Medgnosis Admins'] }),
      provider,
    );

    expect(user.role).toBe('admin');
    expect(unsafe.mock.calls[3]?.[0]).toContain("SET role = 'admin'");
    expect(unsafe.mock.calls[3]?.[1]).toEqual(['00000000-0000-4000-8000-000000000001']);
  });

  it('preserves existing super-admin accounts during additive admin reconciliation', async () => {
    const unsafe = mockTransactionResponses(
      [userRow({ role: 'super_admin' })],
      [],
      [],
    );

    const user = await reconcileOidcUser(
      claims({ groups: ['Medgnosis Admins'] }),
      provider,
    );

    expect(user.role).toBe('super_admin');
    expect(unsafe.mock.calls.some(([query]) => String(query).includes("SET role = 'admin'")))
      .toBe(false);
    expect(unsafe.mock.calls.some(([query]) => String(query).includes('INSERT INTO public.user_external_identities')))
      .toBe(true);
  });

  it('links users through configured email aliases before creating JIT accounts', async () => {
    const unsafe = mockTransactionResponses(
      [],
      [{ canonical_email: 'canonical@example.test' }],
      [userRow({ email: 'canonical@example.test', role: 'analyst' })],
      [],
      [],
    );

    const user = await reconcileOidcUser(
      claims({ email: 'alias@example.test', groups: ['Medgnosis Users'] }),
      provider,
    );

    expect(user.email).toBe('canonical@example.test');
    expect(mockHash).not.toHaveBeenCalled();
    expect(unsafe.mock.calls[2]?.[1]).toEqual(['canonical@example.test']);
    expect(unsafe.mock.calls[3]?.[1]).toEqual([
      '00000000-0000-4000-8000-000000000001',
      'authentik-subject',
      'alias@example.test',
      JSON.stringify({
        email: 'alias@example.test',
        name: 'Ada Lovelace',
        groups: ['Medgnosis Users'],
      }),
    ]);
  });
});

function mockTransactionResponses(...responses: unknown[][]) {
  const unsafe = vi.fn().mockImplementation(() => Promise.resolve(responses.shift() ?? []));
  mockSqlBegin.mockImplementation(async (callback: (tx: { unsafe: typeof unsafe }) => Promise<unknown>) => {
    return callback({ unsafe });
  });
  return unsafe;
}

function claims(overrides: Partial<ValidatedOidcClaims> = {}): ValidatedOidcClaims {
  return {
    sub: 'authentik-subject',
    email: 'ada@example.test',
    name: 'Ada Lovelace',
    groups: ['Medgnosis Users'],
    claims: {
      sub: 'authentik-subject',
      email: 'ada@example.test',
      name: 'Ada Lovelace',
      groups: ['Medgnosis Users'],
    },
    ...overrides,
  };
}

function userRow(overrides: Partial<ReturnType<typeof baseUserRow>> = {}) {
  return {
    ...baseUserRow(),
    ...overrides,
  };
}

function baseUserRow() {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'ada@example.test',
    first_name: 'Ada',
    last_name: 'Lovelace',
    role: 'analyst',
    org_id: 1,
    mfa_enabled: false,
    must_change_password: false,
    is_active: true,
  };
}
