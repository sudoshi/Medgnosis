// =============================================================================
// Medgnosis API — Auth routes
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { loginRequestSchema } from '@medgnosis/shared';
import type { UserRole } from '@medgnosis/shared';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

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

    // Resolve provider_id for provider-role users (org_id → provider 1:1 mapping)
    let providerId: number | undefined;
    if (user.org_id) {
      const [prov] = await sql<{ provider_id: number }[]>`
        SELECT provider_id FROM phm_edw.provider
        WHERE org_id = ${user.org_id} AND active_ind = 'Y'
        LIMIT 1
      `.catch(() => []);
      providerId = prov?.provider_id;
    }

    // Generate JWT
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role as UserRole,
      org_id: String(user.org_id ?? ''),
      ...(providerId !== undefined ? { provider_id: providerId } : {}),
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
          provider_id: providerId ?? null,
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

    if (!token) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired refresh token' },
      });
    }

    // Replay detection: a revoked token being reused indicates potential theft.
    // Revoke ALL tokens for the user as a precaution.
    if (token.revoked) {
      await sql`
        UPDATE refresh_tokens SET revoked = TRUE
        WHERE user_id = ${token.user_id}::UUID AND revoked = FALSE
      `;
      fastify.log.warn({ userId: token.user_id }, 'Refresh token replay detected — all tokens revoked');
      return reply.status(401).send({
        success: false,
        error: { code: 'TOKEN_REUSE', message: 'Token reuse detected. All sessions have been revoked.' },
      });
    }

    if (new Date(token.expires_at) < new Date()) {
      return reply.status(401).send({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Refresh token has expired' },
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

    // Re-resolve provider_id for refreshed JWT
    let refreshProviderId: number | undefined;
    if (user.org_id) {
      const [prov] = await sql<{ provider_id: number }[]>`
        SELECT provider_id FROM phm_edw.provider
        WHERE org_id = ${user.org_id} AND active_ind = 'Y'
        LIMIT 1
      `.catch(() => []);
      refreshProviderId = prov?.provider_id;
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role as UserRole,
      org_id: String(user.org_id ?? ''),
      ...(refreshProviderId !== undefined ? { provider_id: refreshProviderId } : {}),
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
         RETURNING id, email, first_name, last_name, role, org_id, mfa_enabled`,
        values,
      );

      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        });
      }

      await request.auditLog('profile_update', 'auth', request.user.sub);

      return reply.send({
        success: true,
        data: { ...updated, org_id: String((updated as Record<string, unknown>).org_id ?? '') },
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

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
