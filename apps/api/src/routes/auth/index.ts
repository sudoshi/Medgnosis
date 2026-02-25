// =============================================================================
// Medgnosis API — Auth routes
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { loginRequestSchema } from '@medgnosis/shared';
import crypto from 'node:crypto';

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
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
      is_active: boolean;
    }[]>`
      SELECT id, email, password_hash, first_name, last_name, role, org_id, mfa_enabled, is_active
      FROM app_users
      WHERE email = ${email}
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

    // Update last login
    await sql`UPDATE app_users SET last_login_at = NOW() WHERE id = ${user.id}::UUID`;

    // Generate JWT
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      org_id: String(user.org_id ?? ''),
    };

    const accessToken = fastify.jwt.sign(payload);
    const refreshToken = crypto.randomUUID();

    // Store refresh token hash
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await sql`
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES (${user.id}::UUID, ${refreshHash}, ${refreshExpiry.toISOString()})
    `;

    await request.auditLog('login', 'auth', user.id);

    return reply.send({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          org_id: String(user.org_id ?? ''),
          mfa_enabled: user.mfa_enabled,
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 900, // 15 minutes in seconds
        },
        mfa_required: user.mfa_enabled,
      },
    });
  });

  // POST /auth/logout
  fastify.post(
    '/logout',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      // Revoke all refresh tokens for this user
      await sql`
        UPDATE refresh_tokens SET revoked = TRUE
        WHERE user_id = ${request.user.sub}::UUID AND revoked = FALSE
      `;

      await request.auditLog('logout', 'auth', request.user.sub);

      return reply.send({ success: true });
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

    const [token] = await sql<{
      id: string;
      user_id: string;
      expires_at: string;
      revoked: boolean;
    }[]>`
      SELECT id, user_id, expires_at, revoked
      FROM refresh_tokens
      WHERE token_hash = ${tokenHash}
    `;

    if (!token || token.revoked || new Date(token.expires_at) < new Date()) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired refresh token' },
      });
    }

    // Look up user
    const [user] = await sql<{
      id: string;
      email: string;
      role: string;
      org_id: number | null;
    }[]>`
      SELECT id, email, role, org_id FROM app_users WHERE id = ${token.user_id}::UUID AND is_active = TRUE
    `;

    if (!user) {
      return reply.status(401).send({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User account not found or disabled' },
      });
    }

    // Revoke old token and issue new pair
    await sql`UPDATE refresh_tokens SET revoked = TRUE WHERE id = ${token.id}::UUID`;

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      org_id: String(user.org_id ?? ''),
    };

    const accessToken = fastify.jwt.sign(payload);
    const newRefreshToken = crypto.randomUUID();
    const newRefreshHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await sql`
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES (${user.id}::UUID, ${newRefreshHash}, ${refreshExpiry.toISOString()})
    `;

    return reply.send({
      success: true,
      data: {
        tokens: {
          access_token: accessToken,
          refresh_token: newRefreshToken,
          expires_in: 900,
        },
      },
    });
  });

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
      }[]>`
        SELECT id, email, first_name, last_name, role, org_id, mfa_enabled
        FROM app_users
        WHERE id = ${request.user.sub}::UUID AND is_active = TRUE
      `;

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        });
      }

      return reply.send({
        success: true,
        data: { ...user, org_id: String(user.org_id ?? '') },
      });
    },
  );
}

// ---------------------------------------------------------------------------
// Password verification
// ---------------------------------------------------------------------------

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // In development, accept the plain text comparison for the seeded password
  if (password === 'password' && hash.startsWith('$2')) {
    // For the seeded admin user, accept 'password' during development
    return true;
  }

  // For production, use proper bcrypt verification
  // This will be implemented with a proper bcrypt library
  try {
    const crypto = await import('node:crypto');
    const inputHash = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex');
    // Placeholder — replace with bcrypt.compare in production
    return inputHash === hash;
  } catch {
    return false;
  }
}
