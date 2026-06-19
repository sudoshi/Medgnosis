import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import crypto from 'node:crypto';
import type { AuthTokens, User, UserRole } from '@medgnosis/shared';
import { isUserRole, permissionsForRole } from './permissions.js';

export interface AuthUserRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  org_id: number | null;
  mfa_enabled: boolean;
  must_change_password: boolean;
}

export interface IssuedAuthSession {
  user: User;
  tokens: AuthTokens;
  mfa_required: boolean;
}

export interface IssueSessionContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  mfaVerifiedAt?: Date | string | null;
}

export async function resolveProviderId(orgId: number | null): Promise<number | undefined> {
  if (!orgId) return undefined;

  const [provider] = await sql<{ provider_id: number }[]>`
    SELECT provider_id FROM phm_edw.provider
    WHERE org_id = ${orgId} AND active_ind = 'Y'
    LIMIT 1
  `.catch(() => []);

  return provider?.provider_id;
}

export function formatAuthUser(row: AuthUserRow, providerId?: number): User {
  const role = isUserRole(row.role) ? row.role : 'analyst';
  const permissions = permissionsForRole(role);

  return {
    id: row.id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    role,
    roles: [role],
    permissions,
    org_id: String(row.org_id ?? ''),
    provider_id: providerId ?? null,
    mfa_enabled: row.mfa_enabled,
    must_change_password: row.must_change_password,
    created_at: '',
    updated_at: '',
  };
}

export async function issueAuthSession(
  fastify: FastifyInstance,
  user: AuthUserRow,
  context: IssueSessionContext = {},
): Promise<IssuedAuthSession> {
  const role = isUserRole(user.role) ? user.role : 'analyst';
  const providerId = await resolveProviderId(user.org_id);
  const permissions = permissionsForRole(role);

  const refreshToken = crypto.randomUUID();
  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [refreshRow] = await sql<{ id: string }[]>`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at, last_used_at, ip_address, user_agent, mfa_verified_at)
    VALUES (
      ${user.id}::UUID,
      ${refreshHash},
      ${refreshExpiry.toISOString()},
      NOW(),
      ${context.ipAddress ?? null},
      ${context.userAgent ?? null},
      ${context.mfaVerifiedAt instanceof Date ? context.mfaVerifiedAt.toISOString() : context.mfaVerifiedAt ?? null}
    )
    RETURNING id
  `;

  const payload = {
    sub: user.id,
    email: user.email,
    role: role as UserRole,
    roles: [role],
    permissions,
    org_id: String(user.org_id ?? ''),
    ...(refreshRow?.id ? { session_id: refreshRow.id } : {}),
    ...(providerId !== undefined ? { provider_id: providerId } : {}),
    ...(user.must_change_password ? { must_change_password: true } : {}),
  };

  const accessToken = fastify.jwt.sign(payload);

  return {
    user: formatAuthUser(user, providerId),
    tokens: {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900,
    },
    mfa_required: user.mfa_enabled,
  };
}
