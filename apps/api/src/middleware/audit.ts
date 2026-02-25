// =============================================================================
// Medgnosis API — Audit trail middleware
// Logs all mutations (POST/PUT/PATCH/DELETE) to audit_log table
// =============================================================================

import type { FastifyRequest, FastifyReply } from 'fastify';
import { sql } from '@medgnosis/db';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function auditMiddleware(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  if (!MUTATION_METHODS.has(req.method)) return;

  // Log after response is sent
  reply.then(async () => {
    try {
      const userId = (req.user as { id?: number })?.id ?? null;
      const action = `${req.method} ${req.url}`;

      // Redact sensitive fields from request body
      let details: Record<string, unknown> = {};
      if (req.body && typeof req.body === 'object') {
        details = { ...req.body as Record<string, unknown> };
        delete details.password;
        delete details.refresh_token;
        delete details.access_token;
      }

      await sql`
        INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address)
        VALUES (
          ${userId},
          ${action},
          ${extractResourceType(req.url)},
          ${extractResourceId(req.url)},
          ${JSON.stringify(details)},
          ${req.ip}
        )
      `;
    } catch {
      // Never fail the request due to audit logging
      req.log.warn('Failed to write audit log');
    }
  }, () => {
    // Ignore errors in reply callbacks
  });
}

function extractResourceType(url: string): string {
  // /api/v1/patients/123 → patients
  const parts = url.replace(/^\/api\/v1\//, '').split('/');
  return parts[0] ?? 'unknown';
}

function extractResourceId(url: string): string | null {
  const parts = url.replace(/^\/api\/v1\//, '').split('/');
  return parts[1] && /^\d+$/.test(parts[1]) ? parts[1] : null;
}
