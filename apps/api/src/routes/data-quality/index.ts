// =============================================================================
// Medgnosis API — Data Quality routes
// The rogues' gallery + the five-tests feed board. Confirm → standing
// regression check; dismiss → documented.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';

export default async function dataQualityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /data-quality/findings?status=open — the rogues' gallery
  fastify.get('/findings', async (request, reply) => {
    const status = (request.query as { status?: string }).status ?? 'open';
    const rows = await sql`
      SELECT f.finding_id, f.detector, f.entity_table, f.entity_id, f.patient_id,
             f.field, f.observed, f.severity, f.detail, f.status, f.is_regression, f.created_date,
             CASE WHEN f.patient_id IS NOT NULL
                  THEN (SELECT first_name || ' ' || last_name FROM phm_edw.patient WHERE patient_id = f.patient_id)
             END AS patient_name
      FROM phm_edw.dq_finding f
      WHERE f.status = ${status}
      ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, f.created_date DESC
      LIMIT 200
    `;
    return reply.send({ success: true, data: rows });
  });

  // GET /data-quality/feeds — the five tests per feed + freshness
  fastify.get('/feeds', async (_request, reply) => {
    const rows = await sql`
      SELECT feed_name, source, accurate, timely, complete, understood, trusted, latency, last_refreshed, notes
      FROM phm_edw.dq_feed ORDER BY feed_name
    `;
    return reply.send({ success: true, data: rows });
  });

  // POST /data-quality/findings/:id/confirm — confirmed → standing regression check
  fastify.post<{ Params: { id: string } }>('/findings/:id/confirm', async (request, reply) => {
    const actor = request.user.email ?? request.user.sub;
    const [row] = await sql<{ finding_id: number }[]>`
      UPDATE phm_edw.dq_finding
      SET status = 'confirmed', is_regression = TRUE, resolved_by = ${actor}, resolved_at = NOW()
      WHERE finding_id = ${request.params.id}::int AND status = 'open'
      RETURNING finding_id
    `;
    if (!row) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Open finding not found' } });
    await request.auditLog('confirm', 'dq_finding', request.params.id);
    return reply.send({ success: true, data: { finding_id: row.finding_id, status: 'confirmed', is_regression: true } });
  });

  // POST /data-quality/findings/:id/dismiss
  fastify.post<{ Params: { id: string } }>('/findings/:id/dismiss', async (request, reply) => {
    const actor = request.user.email ?? request.user.sub;
    const [row] = await sql<{ finding_id: number }[]>`
      UPDATE phm_edw.dq_finding
      SET status = 'dismissed', resolved_by = ${actor}, resolved_at = NOW()
      WHERE finding_id = ${request.params.id}::int AND status = 'open'
      RETURNING finding_id
    `;
    if (!row) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Open finding not found' } });
    await request.auditLog('dismiss', 'dq_finding', request.params.id);
    return reply.send({ success: true, data: { finding_id: row.finding_id, status: 'dismissed' } });
  });
}
