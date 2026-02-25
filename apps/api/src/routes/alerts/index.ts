// =============================================================================
// Medgnosis API — Alert routes
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';

export default async function alertRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /alerts — List clinical alerts
  fastify.get('/', async (request, reply) => {
    const query = request.query as {
      severity?: string;
      acknowledged?: string;
      page?: string;
      per_page?: string;
    };

    const page = parseInt(query.page ?? '1', 10);
    const perPage = parseInt(query.per_page ?? '25', 10);
    const offset = (page - 1) * perPage;

    const alerts = await sql`
      SELECT
        ca.id,
        ca.patient_id,
        ca.alert_type,
        ca.rule_key,
        ca.severity,
        ca.title,
        ca.body,
        ca.acknowledged_at,
        ca.auto_resolved,
        ca.created_at
      FROM clinical_alerts ca
      WHERE 1=1
        ${query.severity ? sql`AND ca.severity = ${query.severity}` : sql``}
        ${query.acknowledged === 'false' ? sql`AND ca.acknowledged_at IS NULL AND ca.auto_resolved = FALSE` : sql``}
      ORDER BY ca.created_at DESC
      LIMIT ${perPage}
      OFFSET ${offset}
    `;

    return reply.send({
      success: true,
      data: alerts,
    });
  });

  // POST /alerts/:id/acknowledge
  fastify.post<{ Params: { id: string } }>(
    '/:id/acknowledge',
    async (request, reply) => {
      const { id } = request.params;

      const [updated] = await sql`
        UPDATE clinical_alerts
        SET acknowledged_at = NOW(),
            acknowledged_by = ${request.user.sub}::UUID,
            updated_at = NOW()
        WHERE id = ${id}::UUID AND acknowledged_at IS NULL
        RETURNING id, acknowledged_at
      `;

      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Alert not found or already acknowledged' },
        });
      }

      await request.auditLog('acknowledge', 'clinical_alert', id);

      return reply.send({ success: true, data: updated });
    },
  );
}
