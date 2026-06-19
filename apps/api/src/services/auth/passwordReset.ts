import { sql } from '@medgnosis/db';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { config } from '../../config.js';

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_BYTES = 32;
const RESET_TTL_MINUTES = 60;

export interface CreatedPasswordReset {
  reset: {
    id: string;
    user_id: string;
    expires_at: string;
    created_at: string;
  };
  token: string;
  resetUrl: string;
}

export interface ConsumedPasswordReset {
  id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  consumed_at: string;
}

interface CreatePasswordResetInput {
  userId: string;
  ttlMinutes?: number;
}

interface SendPasswordResetEmailInput {
  toEmail: string;
  firstName: string;
  resetUrl: string;
  expiresAt: string;
}

export function generatePasswordResetToken(): string {
  return crypto.randomBytes(RESET_TOKEN_BYTES).toString('base64url');
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function buildPasswordResetUrl(token: string): string {
  const baseUrl = config.webAppUrl.replace(/\/$/, '');
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function hashResetPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function createPasswordReset(input: CreatePasswordResetInput): Promise<CreatedPasswordReset> {
  const token = generatePasswordResetToken();
  const tokenHash = hashPasswordResetToken(token);
  const ttlMinutes = input.ttlMinutes ?? RESET_TTL_MINUTES;

  await sql`
    UPDATE public.app_password_reset_tokens
    SET revoked_at = NOW(),
        updated_at = NOW()
    WHERE user_id = ${input.userId}::uuid
      AND consumed_at IS NULL
      AND revoked_at IS NULL
  `;

  const [reset] = await sql<CreatedPasswordReset['reset'][]>`
    INSERT INTO public.app_password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (
      ${input.userId}::uuid,
      ${tokenHash},
      NOW() + (${ttlMinutes}::int * INTERVAL '1 minute')
    )
    RETURNING id, user_id, expires_at::text AS expires_at, created_at::text AS created_at
  `;

  if (!reset) {
    throw new Error('Failed to create password reset token');
  }

  return {
    reset,
    token,
    resetUrl: buildPasswordResetUrl(token),
  };
}

export async function consumePasswordReset(
  token: string,
  passwordHash: string,
): Promise<ConsumedPasswordReset | null> {
  const tokenHash = hashPasswordResetToken(token);

  return sql.begin(async (tx) => {
    const resetRows = await tx.unsafe(
      `
      SELECT r.id, r.user_id
      FROM public.app_password_reset_tokens r
      JOIN public.app_users u ON u.id = r.user_id
      WHERE r.token_hash = $1
        AND r.consumed_at IS NULL
        AND r.revoked_at IS NULL
        AND r.expires_at > NOW()
        AND u.is_active = TRUE
      FOR UPDATE OF r, u
      `,
      [tokenHash],
    ) as { id: string; user_id: string }[];
    const [reset] = resetRows;

    if (!reset) {
      return null;
    }

    const userRows = await tx.unsafe(
      `
      UPDATE public.app_users
      SET password_hash = $1,
          must_change_password = FALSE,
          updated_at = NOW()
      WHERE id = $2::uuid
      RETURNING id AS user_id, email, first_name, last_name, role
      `,
      [passwordHash, reset.user_id],
    ) as Omit<ConsumedPasswordReset, 'id' | 'consumed_at'>[];
    const [user] = userRows;

    if (!user) {
      return null;
    }

    await tx.unsafe(
      `
      UPDATE public.refresh_tokens
      SET revoked = TRUE,
          revoked_at = COALESCE(revoked_at, NOW())
      WHERE user_id = $1::uuid
        AND revoked = FALSE
      `,
      [reset.user_id],
    );

    const consumedRows = await tx.unsafe(
      `
      UPDATE public.app_password_reset_tokens
      SET consumed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING consumed_at::text AS consumed_at
      `,
      [reset.id],
    ) as { consumed_at: string }[];
    const [consumed] = consumedRows;

    return {
      id: reset.id,
      user_id: user.user_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      consumed_at: consumed?.consumed_at ?? '',
    };
  });
}

export async function sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<boolean> {
  if (!config.resendApiKey) {
    return false;
  }

  const firstName = escapeHtml(input.firstName);
  const resetUrl = escapeHtml(input.resetUrl);
  const expiresAt = escapeHtml(input.expiresAt);

  const html = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0A1628; color: #E4EBF2; padding: 40px 32px; border-radius: 12px;">
      <h1 style="font-size: 28px; font-weight: 700; color: #0DD9D9; margin: 0 0 8px;">Medgnosis</h1>
      <p style="font-size: 14px; color: #4E5D6C; margin: 0 0 28px;">Population Health Intelligence</p>
      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px;">Hi ${firstName},</p>
      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px;">Use this secure link to reset your Medgnosis password.</p>
      <p style="margin: 0 0 24px;">
        <a href="${resetUrl}" style="display: inline-block; background: #0DD9D9; color: #0A1628; text-decoration: none; font-weight: 700; padding: 12px 18px; border-radius: 8px;">Reset password</a>
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #4E5D6C; margin: 0;">This reset link expires at ${expiresAt}. If you did not request this, ignore this email.</p>
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
      subject: 'Reset your Medgnosis password',
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
