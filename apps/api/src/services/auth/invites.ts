import { sql } from '@medgnosis/db';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { config } from '../../config.js';

const BCRYPT_ROUNDS = 12;
const INVITE_TOKEN_BYTES = 32;
const INVITE_TTL_DAYS = 7;

export interface InviteRow {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  expires_at: string;
}

export interface CreatedInvite {
  invite: {
    id: string;
    user_id: string;
    expires_at: string;
    created_at: string;
  };
  token: string;
  activationUrl: string;
}

interface CreateUserInviteInput {
  userId: string;
  createdBy: string;
  ttlDays?: number;
}

interface SendInviteEmailInput {
  toEmail: string;
  firstName: string;
  activationUrl: string;
  expiresAt: string;
}

export function generateInviteToken(): string {
  return crypto.randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
}

export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function buildInviteActivationUrl(token: string): string {
  const baseUrl = config.webAppUrl.replace(/\/$/, '');
  return `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}`;
}

export async function createPendingPasswordHash(): Promise<string> {
  const unusablePassword = crypto.randomBytes(32).toString('base64url');
  return bcrypt.hash(unusablePassword, BCRYPT_ROUNDS);
}

export async function createUserInvite(input: CreateUserInviteInput): Promise<CreatedInvite> {
  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const ttlDays = input.ttlDays ?? INVITE_TTL_DAYS;

  await sql`
    UPDATE public.app_user_invites
    SET revoked_at = NOW(),
        updated_at = NOW()
    WHERE user_id = ${input.userId}::uuid
      AND accepted_at IS NULL
      AND revoked_at IS NULL
  `;

  const [invite] = await sql<CreatedInvite['invite'][]>`
    INSERT INTO public.app_user_invites (user_id, token_hash, created_by, expires_at)
    VALUES (
      ${input.userId}::uuid,
      ${tokenHash},
      ${input.createdBy}::uuid,
      NOW() + (${ttlDays}::int * INTERVAL '1 day')
    )
    RETURNING id, user_id, expires_at::text AS expires_at, created_at::text AS created_at
  `;

  if (!invite) {
    throw new Error('Failed to create invite token');
  }

  return {
    invite,
    token,
    activationUrl: buildInviteActivationUrl(token),
  };
}

export async function getPendingInviteByToken(token: string): Promise<InviteRow | null> {
  const tokenHash = hashInviteToken(token);
  const [invite] = await sql<InviteRow[]>`
    SELECT
      i.id,
      i.user_id,
      u.email,
      u.first_name,
      u.last_name,
      u.role,
      i.expires_at::text AS expires_at
    FROM public.app_user_invites i
    JOIN public.app_users u ON u.id = i.user_id
    WHERE i.token_hash = ${tokenHash}
      AND i.accepted_at IS NULL
      AND i.revoked_at IS NULL
      AND i.expires_at > NOW()
      AND u.is_active = FALSE
  `;

  return invite ?? null;
}

export async function activateInviteWithPassword(
  token: string,
  passwordHash: string,
): Promise<InviteRow | null> {
  const tokenHash = hashInviteToken(token);

  return sql.begin(async (tx) => {
    const inviteRows = await tx.unsafe(
      `
      SELECT i.id, i.user_id
      FROM public.app_user_invites i
      JOIN public.app_users u ON u.id = i.user_id
      WHERE i.token_hash = $1
        AND i.accepted_at IS NULL
        AND i.revoked_at IS NULL
        AND i.expires_at > NOW()
        AND u.is_active = FALSE
      FOR UPDATE OF i, u
      `,
      [tokenHash],
    ) as { id: string; user_id: string }[];
    const [invite] = inviteRows;

    if (!invite) {
      return null;
    }

    const userRows = await tx.unsafe(
      `
      UPDATE public.app_users
      SET password_hash = $1,
          is_active = TRUE,
          must_change_password = FALSE,
          updated_at = NOW()
      WHERE id = $2::uuid
      RETURNING id AS user_id, email, first_name, last_name, role
      `,
      [passwordHash, invite.user_id],
    ) as Omit<InviteRow, 'id' | 'expires_at'>[];
    const [user] = userRows;

    if (!user) {
      return null;
    }

    const acceptedRows = await tx.unsafe(
      `
      UPDATE public.app_user_invites
      SET accepted_at = NOW(),
          updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING expires_at::text AS expires_at
      `,
      [invite.id],
    ) as { expires_at: string }[];
    const [accepted] = acceptedRows;

    return {
      id: invite.id,
      user_id: user.user_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      expires_at: accepted?.expires_at ?? '',
    };
  });
}

export async function sendInviteEmail(input: SendInviteEmailInput): Promise<boolean> {
  if (!config.resendApiKey) {
    return false;
  }

  const firstName = escapeHtml(input.firstName);
  const activationUrl = escapeHtml(input.activationUrl);
  const expiresAt = escapeHtml(input.expiresAt);

  const html = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0A1628; color: #E4EBF2; padding: 40px 32px; border-radius: 12px;">
      <h1 style="font-size: 28px; font-weight: 700; color: #0DD9D9; margin: 0 0 8px;">Medgnosis</h1>
      <p style="font-size: 14px; color: #4E5D6C; margin: 0 0 28px;">Population Health Intelligence</p>
      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px;">Hi ${firstName},</p>
      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px;">An administrator invited you to activate your Medgnosis account.</p>
      <p style="margin: 0 0 24px;">
        <a href="${activationUrl}" style="display: inline-block; background: #0DD9D9; color: #0A1628; text-decoration: none; font-weight: 700; padding: 12px 18px; border-radius: 8px;">Activate account</a>
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #4E5D6C; margin: 0;">This invitation expires at ${expiresAt}.</p>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Medgnosis <${config.emailFrom}>`,
      to: [input.toEmail],
      subject: 'Activate your Medgnosis account',
      html,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errBody}`);
  }

  return true;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
