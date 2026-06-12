// =============================================================================
// Medgnosis API — Cohort Manager routes
// Specialist cohort builder, flagged-patient worklist, and structured
// closed-loop messaging back to the PCP.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { cohortCreateSchema, cohortMessageSchema } from '@medgnosis/shared';
import { previewCohort, type CohortCriteria } from '../../services/cohortFlags.js';

export default async function cohortRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /cohorts — definitions
  fastify.get('/', async (_request, reply) => {
    const rows = await sql`
      SELECT cohort_id, name, description, criteria, created_by, created_date
      FROM phm_edw.cohort_definition WHERE active_ind = 'Y' ORDER BY created_date DESC
    `;
    return reply.send({ success: true, data: rows });
  });

  // POST /cohorts — create a definition
  fastify.post('/', async (request, reply) => {
    const parsed = cohortCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid cohort definition' } });
    }
    const actor = request.user.email ?? request.user.sub;
    const [row] = await sql<{ cohort_id: number }[]>`
      INSERT INTO phm_edw.cohort_definition (name, description, criteria, created_by)
      VALUES (${parsed.data.name}, ${parsed.data.description ?? null}, ${sql.json(parsed.data.criteria)}, ${actor})
      RETURNING cohort_id
    `;
    await request.auditLog('create', 'cohort_definition', String(row?.cohort_id));
    return reply.send({ success: true, data: { cohort_id: row?.cohort_id } });
  });

  // GET /cohorts/:id/patients — members + their flags
  fastify.get<{ Params: { id: string } }>('/:id/patients', async (request, reply) => {
    const [def] = await sql<{ criteria: CohortCriteria }[]>`
      SELECT criteria FROM phm_edw.cohort_definition WHERE cohort_id = ${request.params.id}::int LIMIT 1
    `;
    if (!def) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Cohort not found' } });
    const members = await previewCohort(def.criteria);
    return reply.send({ success: true, data: members });
  });

  // POST /cohorts/preview — preview ad-hoc criteria without saving
  fastify.post('/preview', async (request, reply) => {
    const parsed = cohortCreateSchema.partial({ name: true }).safeParse(request.body);
    const criteria = (request.body as { criteria?: CohortCriteria })?.criteria;
    if (!parsed.success || !criteria) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'criteria required' } });
    }
    const members = await previewCohort(criteria);
    return reply.send({ success: true, data: members });
  });

  // GET /cohorts/flags?flag_key= — flagged-patient worklist
  fastify.get('/flags', async (request, reply) => {
    const flagKey = (request.query as { flag_key?: string }).flag_key;
    const rows = await sql`
      SELECT pf.patient_id, pf.flag_key, pf.value_text, pf.computed_date,
             p.first_name || ' ' || p.last_name AS patient_name
      FROM phm_edw.patient_flag pf
      JOIN phm_edw.patient p ON p.patient_id = pf.patient_id
      WHERE 1=1 ${flagKey ? sql`AND pf.flag_key = ${flagKey}` : sql``}
      ORDER BY pf.flag_key, pf.computed_date DESC
      LIMIT 200
    `;
    return reply.send({ success: true, data: rows });
  });

  // POST /cohorts/message — closed-loop specialist → PCP
  fastify.post('/message', async (request, reply) => {
    const parsed = cohortMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid message' } });
    }
    const actor = request.user.email ?? request.user.sub;
    const [row] = await sql<{ message_id: number }[]>`
      INSERT INTO phm_edw.cohort_message
        (patient_id, from_user, to_provider_id, subject, body, required_disposition)
      VALUES (${parsed.data.patient_id}, ${actor}, ${parsed.data.to_provider_id ?? null},
              ${parsed.data.subject}, ${parsed.data.body ?? null}, ${parsed.data.required_disposition ?? null})
      RETURNING message_id
    `;
    await request.auditLog('message', 'cohort_message', String(row?.message_id), { patient_id: parsed.data.patient_id });
    return reply.send({ success: true, data: { message_id: row?.message_id, status: 'sent' } });
  });

  // GET /cohorts/messages?status= — message worklist
  fastify.get('/messages', async (request, reply) => {
    const status = (request.query as { status?: string }).status;
    const rows = await sql`
      SELECT m.message_id, m.patient_id, m.from_user, m.subject, m.body,
             m.required_disposition, m.status, m.disposition, m.created_date,
             p.first_name || ' ' || p.last_name AS patient_name
      FROM phm_edw.cohort_message m
      JOIN phm_edw.patient p ON p.patient_id = m.patient_id
      WHERE 1=1 ${status ? sql`AND m.status = ${status}` : sql``}
      ORDER BY m.created_date DESC LIMIT 100
    `;
    return reply.send({ success: true, data: rows });
  });

  // POST /cohorts/message/:id/resolve — PCP documents the disposition (closes the loop)
  fastify.post<{ Params: { id: string }; Body: { disposition?: string } }>('/message/:id/resolve', async (request, reply) => {
    const disposition = (request.body as { disposition?: string })?.disposition ?? 'Acknowledged';
    const actor = request.user.email ?? request.user.sub;
    const [row] = await sql<{ message_id: number }[]>`
      UPDATE phm_edw.cohort_message
      SET status = 'resolved', disposition = ${disposition}, resolved_by = ${actor}, resolved_at = NOW()
      WHERE message_id = ${request.params.id}::int AND status <> 'resolved'
      RETURNING message_id
    `;
    if (!row) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Open message not found' } });
    await request.auditLog('resolve', 'cohort_message', request.params.id);
    return reply.send({ success: true, data: { message_id: row.message_id, status: 'resolved' } });
  });
}
