import { sql } from '@medgnosis/db';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import type { AuthUserRow } from '../session.js';
import type { OidcProviderConfig } from './providerConfig.js';
import type { ValidatedOidcClaims } from './tokenValidator.js';

export class OidcAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OidcAccessDeniedError';
  }
}

interface UserIdentityRow extends AuthUserRow {
  is_active: boolean;
}

function groupMatches(userGroups: string[], allowedGroups: string[]): boolean {
  const normalized = new Set(userGroups.map((group) => group.toLowerCase()));
  return allowedGroups.some((group) => normalized.has(group.toLowerCase()));
}

function splitName(name: string, email: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    const localPart = email.split('@')[0] ?? 'User';
    return { firstName: localPart, lastName: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0] ?? 'User', lastName: '' };
  }
  return {
    firstName: parts[0] ?? 'User',
    lastName: parts.slice(1).join(' '),
  };
}

async function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(`oidc:${crypto.randomUUID()}:${crypto.randomBytes(32).toString('hex')}`, 12);
}

export async function reconcileOidcUser(
  claims: ValidatedOidcClaims,
  provider: OidcProviderConfig,
): Promise<AuthUserRow> {
  const isAllowed = groupMatches(claims.groups, provider.allowedGroups);
  const isAdmin = groupMatches(claims.groups, provider.adminGroups);

  if (!isAllowed && !isAdmin) {
    throw new OidcAccessDeniedError('OIDC user is not a member of an allowed Medgnosis group');
  }

  return sql.begin(async (tx) => {
    const identityRows = await tx.unsafe(
      `
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.org_id,
             u.mfa_enabled, u.must_change_password, u.is_active
      FROM public.user_external_identities x
      JOIN public.app_users u ON u.id = x.user_id
      WHERE x.provider_type = $1 AND x.provider_subject = $2
      LIMIT 1
      `,
      ['authentik', claims.sub],
    ) as UserIdentityRow[];

    let user = identityRows[0];

    if (!user) {
      const aliasRows = await tx.unsafe(
        `
        SELECT canonical_email
        FROM public.oidc_email_aliases
        WHERE lower(alias_email) = lower($1)
        LIMIT 1
        `,
        [claims.email],
      ) as { canonical_email: string }[];
      const canonicalEmail = aliasRows[0]?.canonical_email ?? claims.email;

      const emailRows = await tx.unsafe(
        `
        SELECT id, email, first_name, last_name, role, org_id,
               mfa_enabled, must_change_password, is_active
        FROM public.app_users
        WHERE lower(email) = lower($1)
        LIMIT 1
        `,
        [canonicalEmail],
      ) as UserIdentityRow[];
      user = emailRows[0];
    }

    if (user && !user.is_active) {
      throw new OidcAccessDeniedError('OIDC user maps to an inactive Medgnosis account');
    }

    if (!user) {
      const { firstName, lastName } = splitName(claims.name, claims.email);
      const role = isAdmin ? 'admin' : 'analyst';
      const passwordHash = await unusablePasswordHash();
      const createdRows = await tx.unsafe(
        `
        INSERT INTO public.app_users (
          email, password_hash, first_name, last_name, role,
          must_change_password, is_active
        )
        VALUES ($1, $2, $3, $4, $5, FALSE, TRUE)
        RETURNING id, email, first_name, last_name, role, org_id,
                  mfa_enabled, must_change_password, is_active
        `,
        [claims.email, passwordHash, firstName, lastName, role],
      ) as UserIdentityRow[];
      user = createdRows[0];
    }

    if (!user) {
      throw new Error('OIDC reconciliation failed to resolve or create a user');
    }

    if (isAdmin && user.role !== 'admin' && user.role !== 'super_admin') {
      const promotedRows = await tx.unsafe(
        `
        UPDATE public.app_users
        SET role = 'admin', updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING id, email, first_name, last_name, role, org_id,
                  mfa_enabled, must_change_password, is_active
        `,
        [user.id],
      ) as UserIdentityRow[];
      user = promotedRows[0] ?? user;
    }

    await tx.unsafe(
      `
      INSERT INTO public.user_external_identities (
        user_id, provider_type, provider_subject, email_at_link, claims, last_login_at
      )
      VALUES ($1::uuid, 'authentik', $2, $3, $4::jsonb, NOW())
      ON CONFLICT (provider_type, provider_subject)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        email_at_link = EXCLUDED.email_at_link,
        claims = EXCLUDED.claims,
        last_login_at = NOW(),
        updated_at = NOW()
      `,
      [user.id, claims.sub, claims.email, JSON.stringify({
        email: claims.email,
        name: claims.name,
        groups: claims.groups,
      })],
    );

    await tx.unsafe(
      `UPDATE public.app_users SET last_login_at = NOW() WHERE id = $1::uuid`,
      [user.id],
    );

    return user;
  });
}
