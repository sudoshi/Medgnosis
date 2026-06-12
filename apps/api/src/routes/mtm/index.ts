// =============================================================================
// Medgnosis API — Auto-Referral MTM routes
// Referral worklist + manual state-machine advance.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { nextMtmStatus, type MtmStatus } from '../../services/mtmReferral.js';

export default async function mtmRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /mtm?status=referred — referral worklist
  fastify.get('/', async (request, reply) => {
    const status = (request.query as { status?: string }).status;
    const rows = await sql`
      SELECT m.mtm_id, m.patient_id, m.condition, m.trigger_value, m.trigger_code,
             m.mtm_status, m.referred_at, m.goal_at, m.repatriated_at,
             p.first_name || ' ' || p.last_name AS patient_name
      FROM phm_edw.mtm_referral m
      JOIN phm_edw.patient p ON p.patient_id = m.patient_id
      WHERE m.active_ind = 'Y'
        ${status ? sql`AND m.mtm_status = ${status}` : sql``}
      ORDER BY m.referred_at DESC
      LIMIT 200
    `;
    return reply.send({ success: true, data: rows });
  });

  // GET /mtm/stats — counts by status
  fastify.get('/stats', async (_request, reply) => {
    const rows = await sql`
      SELECT mtm_status, condition, COUNT(*)::int AS n
      FROM phm_edw.mtm_referral WHERE active_ind = 'Y'
      GROUP BY mtm_status, condition ORDER BY mtm_status
    `;
    return reply.send({ success: true, data: rows });
  });

  // POST /mtm/:id/advance — advance the state machine (atGoal supplied by reviewer)
  fastify.post<{ Params: { id: string }; Body: { at_goal?: boolean } }>('/:id/advance', async (request, reply) => {
    const atGoal = (request.body as { at_goal?: boolean })?.at_goal === true;
    const actor = request.user.email ?? request.user.sub;

    const [current] = await sql<{ mtm_status: MtmStatus }[]>`
      SELECT mtm_status FROM phm_edw.mtm_referral WHERE mtm_id = ${request.params.id}::int AND active_ind = 'Y' LIMIT 1
    `;
    if (!current) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'MTM referral not found' } });
    }
    const next = nextMtmStatus(current.mtm_status, atGoal);
    await sql`
      UPDATE phm_edw.mtm_referral
      SET mtm_status = ${next},
          goal_at = CASE WHEN ${next} = 'at_goal' THEN CURRENT_DATE ELSE goal_at END,
          repatriated_at = CASE WHEN ${next} = 'repatriated' THEN CURRENT_DATE ELSE repatriated_at END
      WHERE mtm_id = ${request.params.id}::int
    `;
    await request.auditLog('advance', 'mtm_referral', request.params.id, { from: current.mtm_status, to: next, by: actor });
    return reply.send({ success: true, data: { mtm_id: Number(request.params.id), mtm_status: next } });
  });
}
