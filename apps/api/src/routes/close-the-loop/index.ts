// =============================================================================
// Medgnosis API — Close the Loop routes
// The abnormal-result safety net: open-loop worklist, documented resolution,
// and the "denominator is the deliverable" census.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { loopResolveSchema } from '@medgnosis/shared';

export default async function closeTheLoopRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /close-the-loop?status=open — worklist ordered by urgency (due date)
  fastify.get('/', async (request, reply) => {
    const query = request.query as { status?: string; page?: string; per_page?: string };
    const status = query.status ?? 'open';
    const page = parseInt(query.page ?? '1', 10);
    const perPage = parseInt(query.per_page ?? '50', 10);
    const offset = (page - 1) * perPage;

    const [rows, [count]] = await Promise.all([
      sql`
        SELECT
          rl.loop_id, rl.result_id, rl.patient_id, rl.obligation, rl.severity,
          rl.identified_date, rl.due_date, rl.loop_status, rl.closure_type,
          (CURRENT_DATE - rl.due_date)::int AS days_overdue,
          p.first_name || ' ' || p.last_name AS patient_name,
          orr.abnormal_flag, orr.result_value, orr.critical_flag,
          co.order_name
        FROM phm_edw.result_loop rl
        JOIN phm_edw.patient p ON p.patient_id = rl.patient_id
        JOIN phm_edw.order_result orr ON orr.result_id = rl.result_id
        LEFT JOIN phm_edw.clinical_order co ON co.order_id = orr.order_id
        WHERE rl.loop_status = ${status}
        ORDER BY
          CASE rl.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
          rl.due_date ASC
        LIMIT ${perPage} OFFSET ${offset}
      `,
      sql<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM phm_edw.result_loop WHERE loop_status = ${status}
      `,
    ]);

    return reply.send({
      success: true,
      data: rows,
      meta: { page, per_page: perPage, total: count?.total ?? 0, total_pages: Math.ceil((count?.total ?? 0) / perPage) },
    });
  });

  // GET /close-the-loop/stats — the denominator is the deliverable
  fastify.get('/stats', async (_request, reply) => {
    const [byStatus, byClosure] = await Promise.all([
      sql`SELECT loop_status, count(*)::int AS n FROM phm_edw.result_loop GROUP BY loop_status`,
      sql`SELECT closure_type, count(*)::int AS n FROM phm_edw.result_loop WHERE loop_status = 'closed' GROUP BY closure_type`,
    ]);
    return reply.send({ success: true, data: { by_status: byStatus, by_closure: byClosure } });
  });

  // POST /close-the-loop/:id/resolve — document a terminal disposition
  fastify.post<{ Params: { id: string } }>('/:id/resolve', async (request, reply) => {
    const parsed = loopResolveSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'closure_type must be appropriate_care | refused | unable_to_reach | reviewed' },
      });
    }
    const actor = request.user.email ?? request.user.sub;
    const [updated] = await sql<{ loop_id: number }[]>`
      UPDATE phm_edw.result_loop
      SET loop_status = 'closed',
          closure_type = ${parsed.data.closure_type},
          closure_evidence = COALESCE(closure_evidence, '{}'::jsonb)
            || ${sql.json({ manual_note: parsed.data.note ?? null, resolved_via: 'worklist' })},
          resolved_by = ${actor},
          resolved_at = NOW()
      WHERE loop_id = ${request.params.id}::int AND loop_status = 'open'
      RETURNING loop_id
    `;
    if (!updated) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Open loop not found' } });
    }
    await request.auditLog('resolve', 'result_loop', request.params.id, { closure_type: parsed.data.closure_type });
    return reply.send({ success: true, data: { loop_id: updated.loop_id, closure_type: parsed.data.closure_type } });
  });
}
