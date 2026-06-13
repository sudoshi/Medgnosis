// =============================================================================
// Medgnosis API — Real-time surveillance routes (MEWS / NEWS2)
// Unit census with live scores + per-bed drill-down (trend, components, action).
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { streamTick } from '../../services/surveillance.js';

export default async function surveillanceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /surveillance/census?score=MEWS|NEWS2 — one row per admission, latest score
  fastify.get('/census', async (request, reply) => {
    const scoreType = (request.query as { score?: string }).score === 'NEWS2' ? 'NEWS2' : 'MEWS';
    const rows = await sql`
      SELECT a.admission_id, a.patient_id, a.unit, a.bed, a.admitting_dx,
             p.first_name || ' ' || p.last_name AS patient_name,
             s.score, s.band, s.action, s.components, s.computed_datetime
      FROM phm_rt.admission a
      JOIN phm_edw.patient p ON p.patient_id = a.patient_id
      LEFT JOIN LATERAL (
        SELECT score, band, action, components, computed_datetime
        FROM phm_rt.ews_score e
        WHERE e.admission_id = a.admission_id AND e.score_type = ${scoreType}
        ORDER BY e.computed_datetime DESC LIMIT 1
      ) s ON TRUE
      WHERE a.status = 'admitted'
      ORDER BY s.score DESC NULLS LAST, a.unit, a.bed
    `;
    return reply.send({ success: true, data: { score_type: scoreType, census: rows } });
  });

  // GET /surveillance/:admissionId — drill-down (vitals trend + both scores)
  fastify.get<{ Params: { admissionId: string } }>('/:admissionId', async (request, reply) => {
    const id = request.params.admissionId;
    const [admission] = await sql`
      SELECT a.admission_id, a.patient_id, a.unit, a.bed, a.admitting_dx, a.admit_datetime,
             p.first_name || ' ' || p.last_name AS patient_name
      FROM phm_rt.admission a JOIN phm_edw.patient p ON p.patient_id = a.patient_id
      WHERE a.admission_id = ${id}::int LIMIT 1
    `;
    if (!admission) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Admission not found' } });
    }
    const [vitals, scores] = await Promise.all([
      sql`
        SELECT recorded_datetime, temp_c, heart_rate, systolic_bp, resp_rate, spo2, on_oxygen, consciousness, gcs
        FROM phm_rt.vital_stream WHERE admission_id = ${id}::int
        ORDER BY recorded_datetime DESC LIMIT 48
      `,
      sql`
        SELECT score_type, score, band, action, components, computed_datetime
        FROM phm_rt.ews_score WHERE admission_id = ${id}::int
        ORDER BY computed_datetime DESC LIMIT 20
      `,
    ]);
    return reply.send({ success: true, data: { admission, vitals, scores } });
  });

  // POST /surveillance/tick — manual streamer tick (demo; admin only)
  fastify.post('/tick', async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
    }
    const result = await streamTick();
    return reply.send({ success: true, data: result });
  });
}
