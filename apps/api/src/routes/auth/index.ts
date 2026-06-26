// =============================================================================
// Medgnosis API — Auth routes
// =============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql } from '@medgnosis/db';
import {
  loginRequestSchema,
  registerRequestSchema,
  changePasswordSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  mfaSetupConfirmSchema,
  mfaVerifySchema,
  mfaDisableSchema,
} from '@medgnosis/shared';
import type { UserRole } from '@medgnosis/shared';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import QRCode from 'qrcode';
import { config } from '../../config.js';
import { formatAuthUser, issueAuthSession, resolveProviderId } from '../../services/auth/session.js';
import { permissionsForRole } from '../../services/auth/permissions.js';
import {
  getOidcProviderConfig,
  isOidcPubliclyAvailable,
} from '../../services/auth/oidc/providerConfig.js';
import { fetchOidcDiscovery } from '../../services/auth/oidc/discovery.js';
import {
  consumeHandshake,
  generateNonce,
  generatePkceVerifier,
  sha256Base64Url,
  storeHandshake,
} from '../../services/auth/oidc/handshakeStore.js';
import { validateOidcIdToken } from '../../services/auth/oidc/tokenValidator.js';
import {
  OidcAccessDeniedError,
  reconcileOidcUser,
} from '../../services/auth/oidc/reconciliation.js';
import {
  activateInviteWithPassword,
  getPendingInviteByToken,
} from '../../services/auth/invites.js';
import {
  consumePasswordReset,
  createPasswordReset,
  hashResetPassword,
  sendPasswordResetEmail,
} from '../../services/auth/passwordReset.js';
import {
  buildOtpAuthUrl,
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  parseRecoveryCodeRecords,
  protectMfaSecret,
  recoveryCodeRecords,
  unprotectMfaSecret,
  verifyTotpCode,
  verifyTotpCodeWithStep,
} from '../../services/auth/mfa.js';
import { buildAuthExposurePolicy } from '../../security/authPolicy.js';

const PASSWORD_RESET_RESPONSE_MESSAGE =
  'If this email is eligible for password reset, instructions have been sent to your inbox.';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MFA_CHALLENGE_EXPIRES_SECONDS = 5 * 60;
const MFA_SETUP_EXPIRES_SECONDS = 10 * 60;

interface AuthSessionRow {
  id: string;
  created_at: string;
  expires_at: string;
  revoked: boolean;
  revoked_at: string | null;
  last_used_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  active: boolean;
}

interface MfaUserRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  org_id: number | null;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  mfa_secret_pending: string | null;
  mfa_secret_pending_expires_at: string | null;
  mfa_recovery_codes: unknown;
  mfa_last_used_step: number | null;
  must_change_password: boolean;
}

async function issueMfaChallenge(
  fastify: FastifyInstance,
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    org_id: number | null;
    must_change_password?: boolean;
  },
) {
  const role = user.role as UserRole;
  const providerId = await resolveProviderId(user.org_id);
  const payload = {
    sub: user.id,
    email: user.email,
    role,
    roles: [role],
    permissions: permissionsForRole(role),
    org_id: String(user.org_id ?? ''),
    ...(providerId !== undefined ? { provider_id: providerId } : {}),
    ...(user.must_change_password ? { must_change_password: true } : {}),
    mfa_pending: true,
  };

  return {
    mfa_required: true,
    mfa_token: fastify.jwt.sign(payload, { expiresIn: `${MFA_CHALLENGE_EXPIRES_SECONDS}s` }),
    expires_in: MFA_CHALLENGE_EXPIRES_SECONDS,
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role,
    },
  };
}

async function issueVerifiedMfaSession(
  fastify: FastifyInstance,
  request: FastifyRequest,
  user: MfaUserRow,
  verifiedAt = new Date(),
) {
  return issueAuthSession(fastify, user, {
    ...sessionContextFromRequest(request),
    mfaVerifiedAt: verifiedAt,
  });
}

function mfaSecretKeyMaterial(): string {
  return `medgnosis:mfa:${config.jwtSecret}`;
}

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /auth/providers
  fastify.get('/providers', async () => {
    const oidcProvider = await getOidcProviderConfig();
    const oidcEnabled = isOidcPubliclyAvailable(oidcProvider);
    const exposurePolicy = buildAuthExposurePolicy(config);

    return {
      success: true,
      data: {
        local_enabled: config.localAuthEnabled,
        oidc_enabled: oidcEnabled,
        oidc_label: oidcEnabled ? oidcProvider.label : null,
        oidc_redirect_path: oidcEnabled ? '/auth/oidc/redirect' : null,
        registration_enabled: exposurePolicy.publicRegistrationEnabled,
        demo_quick_fill_enabled: exposurePolicy.demoQuickFillEnabled,
      },
    };
  });

  // POST /auth/request-password-reset
  fastify.post(
    '/request-password-reset',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '15 minutes' },
      },
    },
    async (request, reply) => {
      const parseResult = passwordResetRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.flatten().fieldErrors,
          },
        });
      }

      const normalizedEmail = parseResult.data.email.trim().toLowerCase();
      const genericResponse = {
        success: true,
        data: { message: PASSWORD_RESET_RESPONSE_MESSAGE },
      };

      if (!config.localAuthEnabled) {
        return reply.send(genericResponse);
      }

      const [user] = await sql<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        role: string;
      }[]>`
        SELECT id, email, first_name, last_name, role
        FROM public.app_users
        WHERE lower(email) = ${normalizedEmail}
          AND is_active = TRUE
      `;

      if (!user) {
        return reply.send(genericResponse);
      }

      const reset = await createPasswordReset({ userId: user.id });
      let emailSent = false;
      try {
        emailSent = await sendPasswordResetEmail({
          toEmail: user.email,
          firstName: user.first_name,
          resetUrl: reset.resetUrl,
          expiresAt: reset.reset.expires_at,
        });
      } catch (err) {
        fastify.log.error({ err, reset_id: reset.reset.id }, 'Failed to send password reset email');
      }

      await request.auditLog('password_reset_request', 'auth', user.id, {
        reset_id: reset.reset.id,
        role: user.role,
        email_sent: emailSent,
        expires_at: reset.reset.expires_at,
      });

      return reply.send(genericResponse);
    },
  );

  // POST /auth/reset-password
  fastify.post(
    '/reset-password',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '15 minutes' },
      },
    },
    async (request, reply) => {
      const parseResult = passwordResetConfirmSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.flatten().fieldErrors,
          },
        });
      }

      const passwordHash = await hashResetPassword(parseResult.data.password);
      const consumed = await consumePasswordReset(parseResult.data.token, passwordHash);

      if (!consumed) {
        return reply.status(400).send({
          success: false,
          error: { code: 'RESET_TOKEN_INVALID', message: 'Reset link is invalid or expired' },
        });
      }

      await request.auditLog('password_reset_complete', 'auth', consumed.user_id, {
        reset_id: consumed.id,
        role: consumed.role,
        consumed_at: consumed.consumed_at,
        sessions_revoked: true,
      });

      return reply.send({
        success: true,
        data: { message: 'Password reset successfully. Sign in with your new password.' },
      });
    },
  );

  // POST /auth/accept-invite
  fastify.post('/accept-invite', async (request, reply) => {
    const token = normalizeInviteToken((request.body as { token?: unknown } | null)?.token);
    if (!token) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'token is required' },
      });
    }

    const invite = await getPendingInviteByToken(token);
    if (!invite) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVITE_INVALID', message: 'Invitation is invalid or expired' },
      });
    }

    await request.auditLog('invite_accept', 'auth_invite', invite.id, {
      user_id: invite.user_id,
    });

    return reply.send({
      success: true,
      data: {
        invite: {
          email: invite.email,
          first_name: invite.first_name,
          last_name: invite.last_name,
          role: invite.role,
          expires_at: invite.expires_at,
        },
      },
    });
  });

  // POST /auth/set-password
  fastify.post('/set-password', async (request, reply) => {
    const body = request.body as { token?: unknown; password?: unknown } | null;
    const token = normalizeInviteToken(body?.token);
    const password = normalizeInvitePassword(body?.password);

    if (!token || !password) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'token and a valid password are required' },
      });
    }

    const passwordHash = await hashPassword(password);
    const activated = await activateInviteWithPassword(token, passwordHash);

    if (!activated) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVITE_INVALID', message: 'Invitation is invalid or expired' },
      });
    }

    await request.auditLog('invite_activate', 'auth_invite', activated.id, {
      user_id: activated.user_id,
    });

    return reply.send({
      success: true,
      data: {
        user: {
          id: activated.user_id,
          email: activated.email,
          first_name: activated.first_name,
          last_name: activated.last_name,
          role: activated.role,
        },
        message: 'Account activated successfully',
      },
    });
  });

  // GET /auth/oidc/redirect
  fastify.get(
    '/oidc/redirect',
    {
      config: {
        rateLimit: { max: 20, timeWindow: '1 minute' },
      },
    },
    async (_request, reply) => {
      const provider = await getOidcProviderConfig();
      if (!isOidcPubliclyAvailable(provider)) {
        return reply.status(404).send({
          success: false,
          error: { code: 'OIDC_DISABLED', message: 'OIDC sign-in is not enabled' },
        });
      }

      const discovery = await fetchOidcDiscovery(provider.discoveryUrl);
      const codeVerifier = generatePkceVerifier();
      const nonce = generateNonce();
      const state = await storeHandshake('state', {
        nonce,
        codeVerifier,
      }, provider.stateTtlSeconds);

      const authorizeUrl = new URL(discovery.authorization_endpoint);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', provider.clientId);
      authorizeUrl.searchParams.set('redirect_uri', provider.redirectUri);
      authorizeUrl.searchParams.set('scope', provider.scopes.join(' '));
      authorizeUrl.searchParams.set('state', state);
      authorizeUrl.searchParams.set('nonce', nonce);
      authorizeUrl.searchParams.set('code_challenge', sha256Base64Url(codeVerifier));
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');

      return reply.redirect(authorizeUrl.toString());
    },
  );

  // GET /auth/oidc/callback
  fastify.get(
    '/oidc/callback',
    {
      config: {
        rateLimit: { max: 20, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const query = request.query as {
        code?: string;
        state?: string;
        error?: string;
        error_description?: string;
      };

      if (query.error) {
        return reply.redirect(`${config.webAppUrl}/login?oidc_error=${encodeURIComponent(query.error)}`);
      }

      if (!query.code || !query.state) {
        return reply.status(400).send({
          success: false,
          error: { code: 'OIDC_BAD_CALLBACK', message: 'OIDC callback is missing code or state' },
        });
      }

      const statePayload = await consumeHandshake<{
        nonce: string;
        codeVerifier: string;
      }>(query.state, 'state');

      if (
        !statePayload ||
        typeof statePayload.nonce !== 'string' ||
        typeof statePayload.codeVerifier !== 'string'
      ) {
        return reply.status(400).send({
          success: false,
          error: { code: 'OIDC_STATE_INVALID', message: 'OIDC state is invalid or expired' },
        });
      }

      const provider = await getOidcProviderConfig();
      if (!isOidcPubliclyAvailable(provider)) {
        return reply.status(404).send({
          success: false,
          error: { code: 'OIDC_DISABLED', message: 'OIDC sign-in is not enabled' },
        });
      }

      const discovery = await fetchOidcDiscovery(provider.discoveryUrl);
      const form = new URLSearchParams({
        grant_type: 'authorization_code',
        code: query.code,
        redirect_uri: provider.redirectUri,
        client_id: provider.clientId,
        code_verifier: statePayload.codeVerifier,
      });
      if (provider.clientSecret) {
        form.set('client_secret', provider.clientSecret);
      }

      const tokenResponse = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });

      if (!tokenResponse.ok) {
        fastify.log.warn({ status: tokenResponse.status }, 'OIDC token exchange failed');
        return reply.redirect(`${config.webAppUrl}/login?oidc_error=token_exchange_failed`);
      }

      const tokenBody = await tokenResponse.json() as { id_token?: string };
      if (!tokenBody.id_token) {
        return reply.redirect(`${config.webAppUrl}/login?oidc_error=missing_id_token`);
      }

      try {
        const claims = await validateOidcIdToken(
          tokenBody.id_token,
          discovery,
          provider,
          statePayload.nonce,
        );
        const user = await reconcileOidcUser(claims, provider);
        const exchangeCode = await storeHandshake('exchange', { userId: user.id }, provider.exchangeTtlSeconds);

        await request.auditLog('oidc_callback_success', 'auth', user.id, {
          provider: 'authentik',
          email: claims.email,
        });

        return reply.redirect(`${config.webAppUrl}/auth/callback?code=${encodeURIComponent(exchangeCode)}`);
      } catch (err) {
        const code = err instanceof OidcAccessDeniedError ? 'access_denied' : 'validation_failed';
        fastify.log.warn({ err }, 'OIDC callback validation failed');
        return reply.redirect(`${config.webAppUrl}/login?oidc_error=${code}`);
      }
    },
  );

  // POST /auth/oidc/exchange
  fastify.post(
    '/oidc/exchange',
    {
      config: {
        rateLimit: { max: 20, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const body = request.body as { code?: string };
      if (!body.code) {
        return reply.status(400).send({
          success: false,
          error: { code: 'MISSING_CODE', message: 'code is required' },
        });
      }

      const payload = await consumeHandshake<{ userId: string }>(body.code, 'exchange');
      if (!payload || typeof payload.userId !== 'string') {
        return reply.status(400).send({
          success: false,
          error: { code: 'CODE_INVALID', message: 'OIDC exchange code is invalid or expired' },
        });
      }

      const [user] = await sql<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        role: string;
        org_id: number | null;
        mfa_enabled: boolean;
        mfa_secret: string | null;
        must_change_password: boolean;
      }[]>`
        SELECT id, email, first_name, last_name, role, org_id, mfa_enabled, mfa_secret, must_change_password
        FROM public.app_users
        WHERE id = ${payload.userId}::uuid AND is_active = TRUE
      `;

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User account not found or disabled' },
        });
      }

      if (user.mfa_enabled) {
        if (!user.mfa_secret) {
          fastify.log.warn({ userId: user.id }, 'MFA-enabled OIDC user has no TOTP secret');
          return reply.status(403).send({
            success: false,
            error: { code: 'MFA_NOT_CONFIGURED', message: 'MFA is not configured correctly for this account' },
          });
        }

        const challenge = await issueMfaChallenge(fastify, user);
        await request.auditLog('oidc_mfa_challenge', 'auth', user.id, { provider: 'authentik' });
        return reply.send({ success: true, data: challenge });
      }

      const session = await issueAuthSession(fastify, user, sessionContextFromRequest(request));
      await request.auditLog('oidc_exchange', 'auth', user.id, { provider: 'authentik' });

      return reply.send({ success: true, data: session });
    },
  );

  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
    if (!config.localAuthEnabled) {
      return reply.status(404).send({
        success: false,
        error: { code: 'LOCAL_AUTH_DISABLED', message: 'Local sign-in is not enabled' },
      });
    }

    const parseResult = loginRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.flatten().fieldErrors,
        },
      });
    }

    const { email, password } = parseResult.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Look up user
    const [user] = await sql<{
      id: string;
      email: string;
      password_hash: string;
      first_name: string;
      last_name: string;
      role: string;
      org_id: number | null;
      mfa_enabled: boolean;
      mfa_secret: string | null;
      is_active: boolean;
      must_change_password: boolean;
    }[]>`
      SELECT id, email, password_hash, first_name, last_name, role, org_id, mfa_enabled, mfa_secret, is_active, must_change_password
      FROM app_users
      WHERE lower(email) = ${normalizedEmail}
    `;

    if (!user || !user.is_active) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    // Verify password using timing-safe comparison
    // For development, also accept plain 'password' match
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    await sql`UPDATE app_users SET last_login_at = NOW() WHERE id = ${user.id}::UUID`;

    if (user.mfa_enabled) {
      if (!user.mfa_secret) {
        fastify.log.warn({ userId: user.id }, 'MFA-enabled user has no TOTP secret');
        return reply.status(403).send({
          success: false,
          error: { code: 'MFA_NOT_CONFIGURED', message: 'MFA is not configured correctly for this account' },
        });
      }

      const challenge = await issueMfaChallenge(fastify, user);
      await request.auditLog('login_mfa_challenge', 'auth', user.id);
      return reply.send({ success: true, data: challenge });
    }

    const session = await issueAuthSession(fastify, user, sessionContextFromRequest(request));
    await request.auditLog('login', 'auth', user.id);

    return reply.send({
      success: true,
      data: session,
    });
  });

  // POST /auth/mfa/setup
  fastify.post(
    '/mfa/setup',
    {
      preHandler: [fastify.authenticate],
      config: {
        rateLimit: { max: 5, timeWindow: '15 minutes' },
      },
    },
    async (request, reply) => {
      const [user] = await sql<{
        id: string;
        email: string;
        mfa_enabled: boolean;
      }[]>`
        SELECT id, email, mfa_enabled
        FROM public.app_users
        WHERE id = ${request.user.sub}::uuid AND is_active = TRUE
      `;

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        });
      }

      if (user.mfa_enabled) {
        return reply.status(409).send({
          success: false,
          error: { code: 'MFA_ALREADY_ENABLED', message: 'MFA is already enabled' },
        });
      }

      const secret = generateTotpSecret();
      const encryptedSecret = protectMfaSecret(secret, mfaSecretKeyMaterial());
      const expiresAt = new Date(Date.now() + MFA_SETUP_EXPIRES_SECONDS * 1000);
      const otpauthUrl = buildOtpAuthUrl(user.email, secret);
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 192,
      });

      await sql`
        UPDATE public.app_users
        SET mfa_secret_pending = ${encryptedSecret},
            mfa_secret_pending_expires_at = ${expiresAt.toISOString()},
            updated_at = NOW()
        WHERE id = ${user.id}::uuid
      `;

      await request.auditLog('mfa_setup_start', 'auth_mfa', user.id, {
        expires_at: expiresAt.toISOString(),
      });

      return reply.send({
        success: true,
        data: {
          manual_secret: secret,
          otpauth_url: otpauthUrl,
          qr_code_data_url: qrCodeDataUrl,
          expires_in: MFA_SETUP_EXPIRES_SECONDS,
        },
      });
    },
  );

  // POST /auth/mfa/confirm
  fastify.post(
    '/mfa/confirm',
    {
      preHandler: [fastify.authenticate],
      config: {
        rateLimit: { max: 10, timeWindow: '15 minutes' },
      },
    },
    async (request, reply) => {
      const parseResult = mfaSetupConfirmSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.flatten().fieldErrors,
          },
        });
      }

      const result = await sql.begin(async (tx) => {
        const rows = await tx.unsafe(
          `
          SELECT id, email, first_name, last_name, role, org_id, mfa_enabled,
                 mfa_secret, mfa_secret_pending, mfa_secret_pending_expires_at,
                 mfa_recovery_codes, mfa_last_used_step, must_change_password
          FROM public.app_users
          WHERE id = $1::uuid AND is_active = TRUE
          FOR UPDATE
          `,
          [request.user.sub],
        ) as MfaUserRow[];
        const [user] = rows;

        if (!user) {
          return { status: 404, error: { code: 'USER_NOT_FOUND', message: 'User not found' } };
        }
        if (user.mfa_enabled) {
          return { status: 409, error: { code: 'MFA_ALREADY_ENABLED', message: 'MFA is already enabled' } };
        }
        if (!user.mfa_secret_pending || !user.mfa_secret_pending_expires_at) {
          return { status: 400, error: { code: 'MFA_SETUP_REQUIRED', message: 'Start MFA setup before confirming' } };
        }
        if (new Date(user.mfa_secret_pending_expires_at) < new Date()) {
          return { status: 400, error: { code: 'MFA_SETUP_EXPIRED', message: 'MFA setup expired. Start again.' } };
        }

        const secret = unprotectMfaSecret(user.mfa_secret_pending, mfaSecretKeyMaterial());
        const verified = verifyTotpCodeWithStep(secret, parseResult.data.code);
        if (!verified.valid || verified.step === null) {
          return { status: 400, error: { code: 'MFA_CODE_INVALID', message: 'Authenticator code is invalid' } };
        }

        const recoveryCodes = generateRecoveryCodes();
        const records = recoveryCodeRecords(recoveryCodes);
        const updatedRows = await tx.unsafe(
          `
          UPDATE public.app_users
          SET mfa_enabled = TRUE,
              mfa_secret = mfa_secret_pending,
              mfa_secret_pending = NULL,
              mfa_secret_pending_expires_at = NULL,
              mfa_recovery_codes = $2::jsonb,
              mfa_enabled_at = NOW(),
              mfa_last_used_step = $3::bigint,
              updated_at = NOW()
          WHERE id = $1::uuid
          RETURNING id, email, first_name, last_name, role, org_id, mfa_enabled,
                    mfa_secret, mfa_secret_pending, mfa_secret_pending_expires_at,
                    mfa_recovery_codes, mfa_last_used_step, must_change_password
          `,
          [user.id, JSON.stringify(records), verified.step],
        ) as MfaUserRow[];

        if (request.user.session_id) {
          await tx.unsafe(
            `
            UPDATE public.refresh_tokens
            SET mfa_verified_at = NOW(),
                last_used_at = NOW()
            WHERE id = $2::uuid
              AND user_id = $1::uuid
              AND revoked = FALSE
            `,
            [user.id, request.user.session_id],
          );
          await tx.unsafe(
            `
            UPDATE public.refresh_tokens
            SET revoked = TRUE,
                revoked_at = COALESCE(revoked_at, NOW())
            WHERE user_id = $1::uuid
              AND id <> $2::uuid
              AND revoked = FALSE
            `,
            [user.id, request.user.session_id],
          );
        } else {
          await tx.unsafe(
            `
            UPDATE public.refresh_tokens
            SET revoked = TRUE,
                revoked_at = COALESCE(revoked_at, NOW())
            WHERE user_id = $1::uuid
              AND revoked = FALSE
            `,
            [user.id],
          );
        }

        return { status: 200, user: updatedRows[0], recoveryCodes };
      });

      if (result.status !== 200 || !('user' in result) || !result.user) {
        return reply.status(result.status).send({ success: false, error: result.error });
      }

      await request.auditLog('mfa_enable', 'auth_mfa', result.user.id, {
        recovery_codes_issued: result.recoveryCodes.length,
        other_sessions_revoked: true,
      });

      const providerId = await resolveProviderId(result.user.org_id);
      return reply.send({
        success: true,
        data: {
          user: formatAuthUser(result.user, providerId),
          recovery_codes: result.recoveryCodes,
        },
      });
    },
  );

  // POST /auth/mfa/verify
  fastify.post(
    '/mfa/verify',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '5 minutes' },
      },
    },
    async (request, reply) => {
      const parseResult = mfaVerifySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.flatten().fieldErrors,
          },
        });
      }

      let pending;
      try {
        pending = await fastify.jwt.verify<{
          sub: string;
          email: string;
          role: UserRole;
          org_id: string;
          mfa_pending?: boolean;
        }>(parseResult.data.mfa_token);
      } catch {
        return reply.status(401).send({
          success: false,
          error: { code: 'MFA_TOKEN_INVALID', message: 'MFA challenge is invalid or expired' },
        });
      }

      if (!pending.mfa_pending) {
        return reply.status(401).send({
          success: false,
          error: { code: 'MFA_TOKEN_INVALID', message: 'MFA challenge is invalid or expired' },
        });
      }

      const verifiedAt = new Date();
      const result = await sql.begin(async (tx) => {
        const rows = await tx.unsafe(
          `
          SELECT id, email, first_name, last_name, role, org_id, mfa_enabled,
                 mfa_secret, mfa_secret_pending, mfa_secret_pending_expires_at,
                 mfa_recovery_codes, mfa_last_used_step, must_change_password
          FROM public.app_users
          WHERE id = $1::uuid AND is_active = TRUE
          FOR UPDATE
          `,
          [pending.sub],
        ) as MfaUserRow[];
        const [user] = rows;

        if (!user || !user.mfa_enabled || !user.mfa_secret) {
          return { status: 401, error: { code: 'MFA_INVALID', message: 'MFA verification failed' } };
        }

        const code = parseResult.data.code.trim();
        const records = parseRecoveryCodeRecords(user.mfa_recovery_codes);
        let acceptedStep: number | null = null;
        let nextRecords = records;
        let valid = false;
        let method: 'totp' | 'recovery_code' = 'totp';

        if (/^\d{6}$/.test(code)) {
          const secret = unprotectMfaSecret(user.mfa_secret, mfaSecretKeyMaterial());
          const verified = verifyTotpCodeWithStep(secret, code);
          if (
            verified.valid &&
            verified.step !== null &&
            (user.mfa_last_used_step === null || verified.step > Number(user.mfa_last_used_step))
          ) {
            acceptedStep = verified.step;
            valid = true;
          }
        } else {
          method = 'recovery_code';
          const recovery = consumeRecoveryCode(records, code);
          valid = recovery.valid;
          nextRecords = recovery.records;
        }

        if (!valid) {
          return { status: 401, error: { code: 'MFA_INVALID', message: 'MFA verification failed' } };
        }

        await tx.unsafe(
          `
          UPDATE public.app_users
          SET mfa_last_used_step = CASE
                WHEN $2::bigint IS NULL THEN mfa_last_used_step
                ELSE $2::bigint
              END,
              mfa_recovery_codes = $3::jsonb,
              last_login_at = NOW(),
              updated_at = NOW()
          WHERE id = $1::uuid
          `,
          [user.id, acceptedStep, JSON.stringify(nextRecords)],
        );

        return { status: 200, user, method };
      });

      if (result.status !== 200 || !('user' in result) || !result.user) {
        return reply.status(result.status).send({ success: false, error: result.error });
      }

      const session = await issueVerifiedMfaSession(fastify, request, result.user, verifiedAt);
      await request.auditLog('login_mfa_verify', 'auth', result.user.id, {
        method: result.method,
      });

      return reply.send({ success: true, data: session });
    },
  );

  // POST /auth/mfa/disable
  fastify.post(
    '/mfa/disable',
    {
      preHandler: [fastify.authenticate],
      config: {
        rateLimit: { max: 10, timeWindow: '15 minutes' },
      },
    },
    async (request, reply) => {
      const parseResult = mfaDisableSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.flatten().fieldErrors,
          },
        });
      }

      const result = await sql.begin(async (tx) => {
        const rows = await tx.unsafe(
          `
          SELECT id, email, first_name, last_name, role, org_id, mfa_enabled,
                 mfa_secret, mfa_secret_pending, mfa_secret_pending_expires_at,
                 mfa_recovery_codes, mfa_last_used_step, must_change_password
          FROM public.app_users
          WHERE id = $1::uuid AND is_active = TRUE
          FOR UPDATE
          `,
          [request.user.sub],
        ) as MfaUserRow[];
        const [user] = rows;

        if (!user) {
          return { status: 404, error: { code: 'USER_NOT_FOUND', message: 'User not found' } };
        }
        if (!user.mfa_enabled || !user.mfa_secret) {
          return { status: 409, error: { code: 'MFA_NOT_ENABLED', message: 'MFA is not enabled' } };
        }

        const code = parseResult.data.code.trim();
        const records = parseRecoveryCodeRecords(user.mfa_recovery_codes);
        let valid = false;
        if (/^\d{6}$/.test(code)) {
          valid = verifyTotpCode(
            unprotectMfaSecret(user.mfa_secret, mfaSecretKeyMaterial()),
            code,
          );
        } else {
          valid = consumeRecoveryCode(records, code).valid;
        }

        if (!valid) {
          return { status: 401, error: { code: 'MFA_INVALID', message: 'MFA verification failed' } };
        }

        const updatedRows = await tx.unsafe(
          `
          UPDATE public.app_users
          SET mfa_enabled = FALSE,
              mfa_secret = NULL,
              mfa_secret_pending = NULL,
              mfa_secret_pending_expires_at = NULL,
              mfa_recovery_codes = '[]'::jsonb,
              mfa_enabled_at = NULL,
              mfa_last_used_step = NULL,
              updated_at = NOW()
          WHERE id = $1::uuid
          RETURNING id, email, first_name, last_name, role, org_id, mfa_enabled,
                    mfa_secret, mfa_secret_pending, mfa_secret_pending_expires_at,
                    mfa_recovery_codes, mfa_last_used_step, must_change_password
          `,
          [user.id],
        ) as MfaUserRow[];

        return { status: 200, user: updatedRows[0] };
      });

      if (result.status !== 200 || !('user' in result) || !result.user) {
        return reply.status(result.status).send({ success: false, error: result.error });
      }

      await request.auditLog('mfa_disable', 'auth_mfa', result.user.id);
      const providerId = await resolveProviderId(result.user.org_id);
      return reply.send({
        success: true,
        data: { user: formatAuthUser(result.user, providerId) },
      });
    },
  );

  // POST /auth/logout
  fastify.post(
    '/logout',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      // Revoke all refresh tokens for this user
      await sql`
        UPDATE refresh_tokens
        SET revoked = TRUE,
            revoked_at = COALESCE(revoked_at, NOW())
        WHERE user_id = ${request.user.sub}::UUID AND revoked = FALSE
      `;

      await request.auditLog('logout', 'auth', request.user.sub);

      return reply.send({ success: true });
    },
  );

  // GET /auth/sessions
  fastify.get(
    '/sessions',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const sessions = await sql<AuthSessionRow[]>`
        SELECT
          id,
          created_at::text AS created_at,
          expires_at::text AS expires_at,
          revoked,
          revoked_at::text AS revoked_at,
          last_used_at::text AS last_used_at,
          ip_address,
          user_agent,
          (revoked = FALSE AND expires_at > NOW()) AS active
        FROM public.refresh_tokens
        WHERE user_id = ${request.user.sub}::uuid
        ORDER BY
          (revoked = FALSE AND expires_at > NOW()) DESC,
          COALESCE(last_used_at, created_at) DESC
        LIMIT 50
      `;

      return reply.send({
        success: true,
        data: {
          sessions: sessions.map((session) => ({
            ...session,
            current: Boolean(request.user.session_id && session.id === request.user.session_id),
          })),
        },
      });
    },
  );

  // DELETE /auth/sessions/:id
  fastify.delete(
    '/sessions/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid session id' },
        });
      }

      const [session] = await sql<{ id: string; revoked_at: string }[]>`
        UPDATE public.refresh_tokens
        SET revoked = TRUE,
            revoked_at = COALESCE(revoked_at, NOW())
        WHERE id = ${id}::uuid
          AND user_id = ${request.user.sub}::uuid
          AND revoked = FALSE
        RETURNING id, revoked_at::text AS revoked_at
      `;

      if (!session) {
        return reply.status(404).send({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: 'Session not found or already revoked' },
        });
      }

      await request.auditLog('session_revoke', 'auth_session', session.id, {
        current: Boolean(request.user.session_id && session.id === request.user.session_id),
        revoked_at: session.revoked_at,
      });

      return reply.send({ success: true, data: { session } });
    },
  );

  // POST /auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const body = request.body as { refresh_token?: string };
    if (!body.refresh_token) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_TOKEN', message: 'refresh_token is required' },
      });
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(body.refresh_token)
      .digest('hex');

    const result = await sql.begin(async (tx) => {
      const tokenRows = await tx.unsafe(
        `
        SELECT id, user_id, expires_at, revoked, mfa_verified_at
        FROM refresh_tokens
        WHERE token_hash = $1
        FOR UPDATE
        `,
        [tokenHash],
      ) as {
        id: string;
        user_id: string;
        expires_at: string;
        revoked: boolean;
        mfa_verified_at: string | null;
      }[];
      const [token] = tokenRows;

      if (!token) {
        return {
          status: 401,
          body: {
            success: false,
            error: { code: 'INVALID_TOKEN', message: 'Invalid or expired refresh token' },
          },
        };
      }

      // Replay detection: a revoked token being reused indicates potential theft.
      // Revoke ALL tokens for the user as a precaution.
      if (token.revoked) {
        await tx.unsafe(
          `
          UPDATE refresh_tokens
          SET revoked = TRUE,
              revoked_at = COALESCE(revoked_at, NOW())
          WHERE user_id = $1::UUID AND revoked = FALSE
          `,
          [token.user_id],
        );
        fastify.log.warn({ userId: token.user_id }, 'Refresh token replay detected - all tokens revoked');
        return {
          status: 401,
          body: {
            success: false,
            error: { code: 'TOKEN_REUSE', message: 'Token reuse detected. All sessions have been revoked.' },
          },
        };
      }

      if (new Date(token.expires_at) < new Date()) {
        await tx.unsafe(
          `
          UPDATE refresh_tokens
          SET revoked = TRUE,
              revoked_at = COALESCE(revoked_at, NOW()),
              last_used_at = NOW()
          WHERE id = $1::UUID
          `,
          [token.id],
        );
        return {
          status: 401,
          body: {
            success: false,
            error: { code: 'TOKEN_EXPIRED', message: 'Refresh token has expired' },
          },
        };
      }

      // Look up user
      const userRows = await tx.unsafe(
        `
        SELECT id, email, role, org_id, must_change_password, mfa_enabled
        FROM app_users
        WHERE id = $1::UUID AND is_active = TRUE
        `,
        [token.user_id],
      ) as {
        id: string;
        email: string;
        role: string;
        org_id: number | null;
        must_change_password: boolean;
        mfa_enabled: boolean;
      }[];
      const [user] = userRows;

      if (!user) {
        return {
          status: 401,
          body: {
            success: false,
            error: { code: 'USER_NOT_FOUND', message: 'User account not found or disabled' },
          },
        };
      }

      if (user.mfa_enabled && !token.mfa_verified_at) {
        await tx.unsafe(
          `
          UPDATE refresh_tokens
          SET revoked = TRUE,
              revoked_at = COALESCE(revoked_at, NOW()),
              last_used_at = NOW()
          WHERE id = $1::UUID
          `,
          [token.id],
        );
        return {
          status: 401,
          body: {
            success: false,
            error: { code: 'MFA_REQUIRED', message: 'MFA verification is required for this session' },
          },
        };
      }

      // Revoke old token and issue new pair atomically.
      await tx.unsafe(
        `
        UPDATE refresh_tokens
        SET revoked = TRUE,
            revoked_at = COALESCE(revoked_at, NOW()),
            last_used_at = NOW()
        WHERE id = $1::UUID
        `,
        [token.id],
      );

      // Re-resolve provider_id for refreshed JWT
      let refreshProviderId: number | undefined;
      if (user.org_id) {
        const providerRows = await tx.unsafe(
          `
          SELECT provider_id FROM phm_edw.provider
          WHERE org_id = $1 AND active_ind = 'Y'
          LIMIT 1
          `,
          [user.org_id],
        ).catch(() => []) as { provider_id: number }[];
        const [prov] = providerRows;
        refreshProviderId = prov?.provider_id;
      }

      const newRefreshToken = crypto.randomUUID();
      const newRefreshHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
      const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const sessionContext = sessionContextFromRequest(request);

      const sessionRows = await tx.unsafe(
        `
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at, last_used_at, ip_address, user_agent, mfa_verified_at)
        VALUES ($1::UUID, $2, $3, NOW(), $4, $5, $6)
        RETURNING id
        `,
        [
          user.id,
          newRefreshHash,
          refreshExpiry.toISOString(),
          sessionContext.ipAddress,
          sessionContext.userAgent,
          user.mfa_enabled ? token.mfa_verified_at : null,
        ],
      ) as { id: string }[];
      const [session] = sessionRows;

      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role as UserRole,
        roles: [user.role as UserRole],
        permissions: permissionsForRole(user.role),
        org_id: String(user.org_id ?? ''),
        ...(session?.id ? { session_id: session.id } : {}),
        ...(refreshProviderId !== undefined ? { provider_id: refreshProviderId } : {}),
        ...(user.must_change_password ? { must_change_password: true } : {}),
      };

      const accessToken = fastify.jwt.sign(payload);

      return {
        status: 200,
        body: {
          success: true,
          data: {
            tokens: {
              access_token: accessToken,
              refresh_token: newRefreshToken,
              expires_in: 900,
            },
          },
        },
      };
    });

    return reply.status(result.status).send(result.body);
  });

  // POST /auth/register
  fastify.post(
    '/register',
    {
      config: {
        rateLimit: { max: 20, timeWindow: '15 minutes' },
      },
    },
    async (request, reply) => {
      const exposurePolicy = buildAuthExposurePolicy(config);
      if (!exposurePolicy.publicRegistrationEnabled) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'REGISTRATION_DISABLED',
            message: 'Registration is invite-only. Contact an administrator for access.',
          },
        });
      }

      const parseResult = registerRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.flatten().fieldErrors,
          },
        });
      }

      const { email, firstName, lastName } = parseResult.data;
      const normalizedEmail = email.trim().toLowerCase();

      // Check if user already exists — return same message to prevent enumeration
      const [existing] = await sql<{ id: string }[]>`
        SELECT id FROM app_users WHERE email = ${normalizedEmail}
      `;

      if (existing) {
        // Return success to prevent email enumeration
        return reply.send({
          success: true,
          data: { message: 'If this email is eligible for access, account instructions have been sent to your inbox.' },
        });
      }

      // Generate readable 12-char temp password (exclude I, l, O, 0)
      const tempPassword = generateTempPassword(12);
      const passwordHash = await hashPassword(tempPassword);

      // Insert inactive pending user with 'analyst' as default role. Admin
      // activation is required before the account can access PHI.
      await sql`
        INSERT INTO app_users (email, password_hash, first_name, last_name, role, must_change_password, is_active)
        VALUES (${normalizedEmail}, ${passwordHash}, ${firstName.trim()}, ${lastName.trim()}, 'analyst', TRUE, FALSE)
      `;

      // Send temp password via Resend API
      try {
        await sendWelcomeEmail(normalizedEmail, firstName.trim(), tempPassword);
      } catch (err) {
        fastify.log.error({ err, email: normalizedEmail }, 'Failed to send welcome email via Resend');
      }

      return reply.send({
        success: true,
        data: { message: 'If this email is eligible for access, account instructions have been sent to your inbox.' },
      });
    },
  );

  // POST /auth/change-password
  fastify.post(
    '/change-password',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parseResult = changePasswordSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.flatten().fieldErrors,
          },
        });
      }

      const { currentPassword, newPassword } = parseResult.data;

      // Look up user's current password hash
      const [user] = await sql<{ password_hash: string }[]>`
        SELECT password_hash FROM app_users
        WHERE id = ${request.user.sub}::UUID AND is_active = TRUE
      `;

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        });
      }

      // Verify current password
      const currentValid = await verifyPassword(currentPassword, user.password_hash);
      if (!currentValid) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
        });
      }

      // Ensure new password is different from current
      const samePassword = await verifyPassword(newPassword, user.password_hash);
      if (samePassword) {
        return reply.status(400).send({
          success: false,
          error: { code: 'SAME_PASSWORD', message: 'New password must be different from current password' },
        });
      }

      // Hash and update
      const newHash = await hashPassword(newPassword);
      await sql`
        UPDATE app_users
        SET password_hash = ${newHash}, must_change_password = FALSE, updated_at = NOW()
        WHERE id = ${request.user.sub}::UUID
      `;

      await request.auditLog('password_change', 'auth', request.user.sub);

      return reply.send({
        success: true,
        data: { message: 'Password changed successfully' },
      });
    },
  );

  // GET /auth/me
  fastify.get(
    '/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const [user] = await sql<{
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        role: string;
        org_id: number | null;
        mfa_enabled: boolean;
        must_change_password: boolean;
      }[]>`
        SELECT id, email, first_name, last_name, role, org_id, mfa_enabled, must_change_password
        FROM app_users
        WHERE id = ${request.user.sub}::UUID AND is_active = TRUE
      `;

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        });
      }

      const providerId = await resolveProviderId(user.org_id);

      return reply.send({
        success: true,
        data: formatAuthUser(user, providerId),
      });
    },
  );

  // PATCH /auth/me — Update own profile
  fastify.patch(
    '/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = request.body as {
        first_name?: string;
        last_name?: string;
        email?: string;
      };

      // Build SET clause dynamically (only provided fields)
      const updates: string[] = [];
      const values: string[] = [];
      let paramIdx = 1;

      if (body.first_name !== undefined) {
        updates.push(`first_name = $${paramIdx++}`);
        values.push(body.first_name.trim());
      }
      if (body.last_name !== undefined) {
        updates.push(`last_name = $${paramIdx++}`);
        values.push(body.last_name.trim());
      }
      if (body.email !== undefined) {
        updates.push(`email = $${paramIdx++}`);
        values.push(body.email.trim().toLowerCase());
      }

      if (updates.length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'NO_FIELDS', message: 'No fields to update' },
        });
      }

      updates.push('updated_at = NOW()');
      values.push(request.user.sub); // for WHERE clause

      const [updated] = await sql.unsafe(
        `UPDATE app_users SET ${updates.join(', ')}
         WHERE id = $${paramIdx}::UUID AND is_active = TRUE
         RETURNING id, email, first_name, last_name, role, org_id, mfa_enabled, must_change_password`,
        values,
      );

      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        });
      }

      const updatedUser = updated as unknown as {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        role: string;
        org_id: number | null;
        mfa_enabled: boolean;
        must_change_password: boolean;
      };
      const providerId = await resolveProviderId(updatedUser.org_id);
      await request.auditLog('profile_update', 'auth', request.user.sub);

      return reply.send({
        success: true,
        data: formatAuthUser(updatedUser, providerId),
      });
    },
  );

  // GET /auth/me/preferences — Fetch user preferences
  fastify.get(
    '/me/preferences',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const [row] = await sql<{ preferences: Record<string, unknown> }[]>`
        SELECT preferences FROM app_users
        WHERE id = ${request.user.sub}::UUID AND is_active = TRUE
      `;
      return reply.send({ success: true, data: row?.preferences ?? {} });
    },
  );

  // PATCH /auth/me/preferences — Update user preferences (shallow merge)
  fastify.patch(
    '/me/preferences',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;

      // Merge with existing preferences using || operator (shallow merge per key)
      const jsonBody = JSON.stringify(body);
      const [updated] = await sql<{ preferences: Record<string, unknown> }[]>`
        UPDATE app_users
        SET preferences = preferences || ${jsonBody}::jsonb,
            updated_at = NOW()
        WHERE id = ${request.user.sub}::UUID AND is_active = TRUE
        RETURNING preferences
      `;

      return reply.send({ success: true, data: updated?.preferences ?? {} });
    },
  );

  // GET /auth/me/db-overview — Database table counts for Settings
  fastify.get(
    '/me/db-overview',
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      const [counts] = await sql<{
        patients: number;
        encounters: number;
        procedures: number;
        care_gaps: number;
      }[]>`
        SELECT
          (SELECT COUNT(*)::int FROM phm_edw.patient) AS patients,
          (SELECT COUNT(*)::int FROM phm_edw.encounter) AS encounters,
          (SELECT COUNT(*)::int FROM phm_edw.procedure) AS procedures,
          (SELECT COUNT(*)::int FROM phm_edw.care_gap) AS care_gaps
      `;

      return reply.send({
        success: true,
        data: counts ?? { patients: 0, encounters: 0, procedures: 0, care_gaps: 0 },
      });
    },
  );

  // GET /auth/me/schedule — Fetch provider weekly schedule + clinic resources
  fastify.get(
    '/me/schedule',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      // Resolve provider via org_id
      const [user] = await sql<{ org_id: number | null }[]>`
        SELECT org_id FROM app_users
        WHERE id = ${request.user.sub}::UUID AND is_active = TRUE
      `;

      if (!user?.org_id) {
        return reply.send({ success: true, data: { schedule: [], resources: [] } });
      }

      const [provider] = await sql<{ provider_id: number }[]>`
        SELECT provider_id FROM phm_edw.provider
        WHERE org_id = ${user.org_id} AND active_ind = 'Y'
        LIMIT 1
      `;

      if (!provider) {
        return reply.send({ success: true, data: { schedule: [], resources: [] } });
      }

      const [schedule, resources] = await Promise.all([
        sql`
          SELECT
            schedule_id AS id,
            day_of_week,
            start_time,
            end_time,
            slot_duration_min,
            schedule_type,
            effective_date,
            end_date,
            notes
          FROM phm_edw.provider_schedule
          WHERE provider_id = ${provider.provider_id}
            AND active_ind = 'Y'
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)
          ORDER BY day_of_week, start_time
        `,
        sql`
          SELECT
            resource_id AS id,
            resource_name,
            resource_type,
            capacity,
            notes
          FROM phm_edw.clinic_resource
          WHERE org_id = ${user.org_id}
            AND active_ind = 'Y'
          ORDER BY resource_type, resource_name
        `,
      ]);

      return reply.send({ success: true, data: { schedule, resources } });
    },
  );

  // PATCH /auth/me/schedule — Update provider schedule entries
  fastify.patch(
    '/me/schedule',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = request.body as Array<{
        id: number;
        start_time?: string;
        end_time?: string;
        slot_duration_min?: number;
        schedule_type?: string;
        notes?: string;
      }>;

      if (!Array.isArray(body) || body.length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Expected array of schedule updates' },
        });
      }

      // Verify provider ownership via org_id
      const [user] = await sql<{ org_id: number | null }[]>`
        SELECT org_id FROM app_users
        WHERE id = ${request.user.sub}::UUID AND is_active = TRUE
      `;

      if (!user?.org_id) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'No organization linked' },
        });
      }

      const [provider] = await sql<{ provider_id: number }[]>`
        SELECT provider_id FROM phm_edw.provider
        WHERE org_id = ${user.org_id} AND active_ind = 'Y'
        LIMIT 1
      `;

      if (!provider) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Provider not found' },
        });
      }

      const results = [];
      for (const slot of body) {
        const updates: string[] = [];
        const values: string[] = [];
        let paramIdx = 1;

        if (slot.start_time !== undefined) {
          updates.push(`start_time = $${paramIdx++}::TIME`);
          values.push(slot.start_time);
        }
        if (slot.end_time !== undefined) {
          updates.push(`end_time = $${paramIdx++}::TIME`);
          values.push(slot.end_time);
        }
        if (slot.slot_duration_min !== undefined) {
          updates.push(`slot_duration_min = $${paramIdx++}`);
          values.push(String(slot.slot_duration_min));
        }
        if (slot.schedule_type !== undefined) {
          updates.push(`schedule_type = $${paramIdx++}`);
          values.push(slot.schedule_type);
        }
        if (slot.notes !== undefined) {
          updates.push(`notes = $${paramIdx++}`);
          values.push(slot.notes);
        }

        if (updates.length === 0) continue;

        updates.push('updated_date = NOW()');
        values.push(String(provider.provider_id));
        values.push(String(slot.id));

        const [updated] = await sql.unsafe(
          `UPDATE phm_edw.provider_schedule
           SET ${updates.join(', ')}
           WHERE provider_id = $${paramIdx++}
             AND schedule_id = $${paramIdx++}
             AND active_ind = 'Y'
           RETURNING schedule_id AS id, day_of_week, start_time, end_time, slot_duration_min, schedule_type`,
          values,
        );

        if (updated) results.push(updated);
      }

      await request.auditLog('schedule_update', 'provider_schedule', request.user.sub);

      return reply.send({ success: true, data: results });
    },
  );
}

// ---------------------------------------------------------------------------
// Password hashing & verification (bcrypt, cost factor 12)
// ---------------------------------------------------------------------------

function sessionContextFromRequest(request: FastifyRequest): { ipAddress: string; userAgent: string | null } {
  const header = request.headers['user-agent'];
  const userAgent = Array.isArray(header) ? header.join(' ') : header ?? null;
  return {
    ipAddress: request.ip,
    userAgent,
  };
}

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------------------
// Temp password generation (readable, excludes I/l/O/0)
// ---------------------------------------------------------------------------

function generateTempPassword(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789!@#$%&*';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('');
}

function normalizeInviteToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return token.length > 0 && token.length <= 256 ? token : null;
}

function normalizeInvitePassword(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.length >= 8 && value.length <= 128 ? value : null;
}

// ---------------------------------------------------------------------------
// Send welcome email via Resend API
// ---------------------------------------------------------------------------

async function sendWelcomeEmail(
  toEmail: string,
  firstName: string,
  tempPassword: string,
): Promise<void> {
  const apiKey = config.resendApiKey;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const html = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0A1628; color: #E4EBF2; padding: 40px 32px; border-radius: 12px;">
      <h1 style="font-size: 28px; font-weight: 700; color: #0DD9D9; margin: 0 0 8px;">Medgnosis</h1>
      <p style="font-size: 14px; color: #4E5D6C; margin: 0 0 28px;">Population Health Intelligence</p>

      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
        Hi ${firstName},
      </p>
      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
        Your Medgnosis account request has been created. An administrator must activate the account before you can sign in. After activation, use the temporary password below:
      </p>

      <div style="background: rgba(13, 217, 217, 0.06); border: 1px solid rgba(13, 217, 217, 0.2); border-radius: 8px; padding: 16px 20px; margin: 0 0 24px; text-align: center;">
        <p style="font-size: 12px; color: #4E5D6C; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Temporary Password</p>
        <p style="font-family: 'Fira Code', monospace; font-size: 20px; font-weight: 700; color: #0DD9D9; margin: 0; letter-spacing: 1.5px;">${tempPassword}</p>
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: #4E5D6C; margin: 0 0 28px;">
        You will be asked to change this password on your first login after activation.
      </p>

      <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
      <p style="font-size: 12px; color: #2E3D4A; margin: 0; text-align: center;">
        HIPAA Compliant &middot; SOC 2 Type II
      </p>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Medgnosis <${config.emailFrom}>`,
      to: [toEmail],
      subject: 'Your Medgnosis access credentials',
      html,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errBody}`);
  }
}
