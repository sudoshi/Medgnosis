// =============================================================================
// Medgnosis API — Audit trail plugin
// Logs all mutating API calls to the audit_log table for compliance.
// =============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { sql } from '@medgnosis/db';

declare module 'fastify' {
  interface FastifyRequest {
    auditLog: (action: string, resourceType: string, resourceId?: string, details?: Record<string, unknown>) => Promise<void>;
  }
}

async function auditPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest('auditLog', async function (
    this: FastifyRequest,
    action: string,
    resourceType: string,
    resourceId?: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    const userId = (this.user as { sub?: string } | undefined)?.sub ?? null;
    const ipAddress = this.ip;
    const userAgent = this.headers['user-agent'] ?? null;

    try {
      await sql`
        INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
        VALUES (
          ${userId}::UUID,
          ${action},
          ${resourceType},
          ${resourceId ?? null},
          ${details ? JSON.stringify(details) : null}::JSONB,
          ${ipAddress},
          ${userAgent}
        )
      `;
    } catch (err) {
      this.log.error({ err }, 'Failed to write audit log');
    }
  });
}

export default fp(auditPlugin, { name: 'audit' });
