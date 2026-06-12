// =============================================================================
// Medgnosis API — Anticipatory Management Program (AMP) routes
// Tiered outreach worklist, disposition ledger (declined counts), ROI by tier.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { ampDispositionSchema } from '@medgnosis/shared';
import { ampRoi } from '../../services/ampEngine.js';

export default async function ampRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /amp?tier=1&status=pending — outreach worklist
  fastify.get('/', async (request, reply) => {
    const query = request.query as { tier?: string; status?: string; page?: string; per_page?: string };
    const tier = query.tier ? parseInt(query.tier, 10) : null;
    const status = query.status ?? 'pending';
    const page = parseInt(query.page ?? '1', 10);
    const perPage = parseInt(query.per_page ?? '50', 10);
    const offset = (page - 1) * perPage;

    const [rows, [count]] = await Promise.all([
      sql`
        SELECT ao.outreach_id, ao.patient_id, ao.care_gap_id, ao.amp_tier,
               ao.disposition, ao.net_revenue, ao.appointment_id,
               p.first_name || ' ' || p.last_name AS patient_name,
               md.measure_name, a.appointment_date
        FROM phm_edw.amp_outreach ao
        JOIN phm_edw.patient p ON p.patient_id = ao.patient_id
        LEFT JOIN phm_edw.care_gap cg ON cg.care_gap_id = ao.care_gap_id
        LEFT JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
        LEFT JOIN phm_edw.appointment a ON a.appointment_id = ao.appointment_id
        WHERE ao.disposition = ${status === 'all' ? sql`ao.disposition` : status}
          ${tier ? sql`AND ao.amp_tier = ${tier}` : sql``}
        ORDER BY ao.amp_tier, ao.net_revenue DESC NULLS LAST
        LIMIT ${perPage} OFFSET ${offset}
      `,
      sql<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM phm_edw.amp_outreach ao
        WHERE ao.disposition = ${status === 'all' ? sql`ao.disposition` : status}
          ${tier ? sql`AND ao.amp_tier = ${tier}` : sql``}
      `,
    ]);

    return reply.send({
      success: true,
      data: rows,
      meta: { page, per_page: perPage, total: count?.total ?? 0, total_pages: Math.ceil((count?.total ?? 0) / perPage) },
    });
  });

  // GET /amp/roi — pending opportunity per tier (the capture-rate slider data)
  fastify.get('/roi', async (_request, reply) => {
    const rows = await ampRoi();
    return reply.send({ success: true, data: rows });
  });

  // POST /amp/:id/disposition — record outreach outcome (declined is counted)
  fastify.post<{ Params: { id: string } }>('/:id/disposition', async (request, reply) => {
    const parsed = ampDispositionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'invalid disposition' } });
    }
    const actor = request.user.email ?? request.user.sub;
    const [row] = await sql<{ outreach_id: number }[]>`
      UPDATE phm_edw.amp_outreach
      SET disposition = ${parsed.data.disposition},
          notes = ${parsed.data.note ?? null},
          contacted_at = NOW(),
          outreach_by = ${actor}
      WHERE outreach_id = ${request.params.id}::int AND disposition = 'pending'
      RETURNING outreach_id
    `;
    if (!row) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Pending outreach not found' } });
    }
    await request.auditLog('disposition', 'amp_outreach', request.params.id, { disposition: parsed.data.disposition });
    return reply.send({ success: true, data: { outreach_id: row.outreach_id, disposition: parsed.data.disposition } });
  });
}
