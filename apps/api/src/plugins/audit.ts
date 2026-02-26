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
  // Use null as initial value — Fastify decorateRequest with a function reference
  // shares it across all requests on the prototype, so `this` binding is unreliable.
  // Instead, assign the closure per-request in an onRequest hook.
  fastify.decorateRequest('auditLog', async () => { /* replaced per-request */ });

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    request.auditLog = async (
      action: string,
      resourceType: string,
      resourceId?: string,
      details?: Record<string, unknown>,
    ): Promise<void> => {
      const userId = (request.user as { sub?: string } | undefined)?.sub ?? null;
      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'] ?? null;

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
        request.log.error({ err }, 'Failed to write audit log');
      }
    };
  });
}

export default fp(auditPlugin, { name: 'audit' });
