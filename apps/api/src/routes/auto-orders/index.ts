// =============================================================================
// Medgnosis API — Auto-Orders routes
// Protocol registry, co-sign queue, enrollment lifecycle. Physician holds both
// keys: enrollment requires a co-sign; dis-enrollment is one action away.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { protocolEnrollSchema } from '@medgnosis/shared';
import { expiryDate } from '../../services/autoOrders.js';

export default async function autoOrdersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /auto-orders/protocols — registry + item counts
  fastify.get('/protocols', async (_request, reply) => {
    const rows = await sql`
      SELECT op.protocol_id, op.protocol_code, op.protocol_name, op.description,
             COUNT(pi.protocol_item_id)::int AS item_count
      FROM phm_edw.order_protocol op
      LEFT JOIN phm_edw.order_protocol_item pi ON pi.protocol_id = op.protocol_id AND pi.active_ind = 'Y'
      WHERE op.active_ind = 'Y'
      GROUP BY op.protocol_id
      ORDER BY op.protocol_name
    `;
    return reply.send({ success: true, data: rows });
  });

  // GET /auto-orders/enrollments?status=pending — co-sign queue / roster
  fastify.get('/enrollments', async (request, reply) => {
    const status = (request.query as { status?: string }).status ?? 'pending';
    const rows = await sql`
      SELECT e.enrollment_id, e.patient_id, e.protocol_id, e.status, e.enrolled_by,
             e.enrolled_at, e.expires_at,
             p.first_name || ' ' || p.last_name AS patient_name,
             op.protocol_name
      FROM phm_edw.protocol_enrollment e
      JOIN phm_edw.patient p ON p.patient_id = e.patient_id
      JOIN phm_edw.order_protocol op ON op.protocol_id = e.protocol_id
      WHERE e.status = ${status}
      ORDER BY e.created_date DESC
      LIMIT 200
    `;
    return reply.send({ success: true, data: rows });
  });

  // POST /auto-orders/enrollments — enroll a patient (pending co-sign)
  fastify.post('/enrollments', async (request, reply) => {
    const parsed = protocolEnrollSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'patient_id and protocol_id required' } });
    }
    const [row] = await sql<{ enrollment_id: number }[]>`
      INSERT INTO phm_edw.protocol_enrollment (patient_id, protocol_id, status)
      VALUES (${parsed.data.patient_id}, ${parsed.data.protocol_id}, 'pending')
      ON CONFLICT (patient_id, protocol_id) DO NOTHING
      RETURNING enrollment_id
    `;
    if (!row) {
      return reply.status(409).send({ success: false, error: { code: 'CONFLICT', message: 'Patient already enrolled in this protocol' } });
    }
    await request.auditLog('enroll', 'protocol_enrollment', String(row.enrollment_id));
    return reply.send({ success: true, data: { enrollment_id: row.enrollment_id, status: 'pending' } });
  });

  // POST /auto-orders/enrollments/:id/cosign — provider co-sign → active, 5yr standing
  fastify.post<{ Params: { id: string } }>('/enrollments/:id/cosign', async (request, reply) => {
    const actor = request.user.email ?? request.user.sub;
    const today = new Date().toISOString().slice(0, 10);
    const [row] = await sql<{ enrollment_id: number }[]>`
      UPDATE phm_edw.protocol_enrollment
      SET status = 'active', enrolled_by = ${actor}, enrolled_at = NOW(), expires_at = ${expiryDate(today)}::date
      WHERE enrollment_id = ${request.params.id}::int AND status = 'pending'
      RETURNING enrollment_id
    `;
    if (!row) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Pending enrollment not found' } });
    }
    await request.auditLog('cosign', 'protocol_enrollment', request.params.id);
    return reply.send({ success: true, data: { enrollment_id: row.enrollment_id, status: 'active' } });
  });

  // POST /auto-orders/enrollments/:id/disenroll
  fastify.post<{ Params: { id: string } }>('/enrollments/:id/disenroll', async (request, reply) => {
    const actor = request.user.email ?? request.user.sub;
    const [row] = await sql<{ enrollment_id: number }[]>`
      UPDATE phm_edw.protocol_enrollment
      SET status = 'disenrolled'
      WHERE enrollment_id = ${request.params.id}::int AND status IN ('pending', 'active')
      RETURNING enrollment_id
    `;
    if (!row) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Active enrollment not found' } });
    }
    await request.auditLog('disenroll', 'protocol_enrollment', request.params.id, { by: actor });
    return reply.send({ success: true, data: { enrollment_id: row.enrollment_id, status: 'disenrolled' } });
  });
}
