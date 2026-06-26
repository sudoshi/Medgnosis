// =============================================================================
// Medgnosis API — Real-time surveillance routes (MEWS / NEWS2)
// Unit census with live scores + per-bed drill-down (trend, components, action).
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { streamTick } from '../../services/surveillance.js';
import {
  getSurveillanceSource,
  getSurveillanceSourceStatus,
} from '../../services/surveillance/factory.js';
import { Hl7v2SurveillanceSource } from '../../services/surveillance/hl7v2Source.js';
import { isAdminRole } from '../../services/auth/permissions.js';

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
    if (!isAdminRole(request.user.role)) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
    }
    const result = await streamTick();
    await request.auditLog('surveillance_tick_run', 'surveillance_tick', undefined, {
      ticked: result.ticked,
      alerts: result.alerts,
      initiated_by: 'manual',
    });
    return reply.send({ success: true, data: result });
  });

  // GET /surveillance/source-status — operator view of the active feed.
  // Reports current source mode, whether it is synthetic (demo), the last
  // ingested event time, and healthy/stale/idle freshness. Aggregate, no PHI.
  fastify.get('/source-status', async (_request, reply) => {
    return reply.send({ success: true, data: getSurveillanceSourceStatus() });
  });

  // POST /surveillance/hl7v2/ingest — intake one raw HL7 v2 ORU message (admin).
  // For an MLLP bridge / replay tooling: the body is the deframed message. Only
  // available when SURVEILLANCE_SOURCE=hl7v2 (otherwise the active source cannot
  // accept it). Buffered now; persisted + scored on the next ingestion cycle.
  fastify.post<{ Body: { message?: string } | string }>(
    '/hl7v2/ingest',
    async (request, reply) => {
      if (!isAdminRole(request.user.role)) {
        return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
      }
      const source = getSurveillanceSource();
      if (!(source instanceof Hl7v2SurveillanceSource)) {
        return reply.status(409).send({
          success: false,
          error: { code: 'SOURCE_MISMATCH', message: `Active source is not hl7v2 (${source.mode})` },
        });
      }
      const body = request.body;
      const raw = typeof body === 'string' ? body : (body?.message ?? '');
      if (typeof raw !== 'string' || raw.trim() === '') {
        return reply.status(400).send({
          success: false,
          error: { code: 'EMPTY_MESSAGE', message: 'HL7 v2 message body is required' },
        });
      }
      const event = await source.accept(raw);
      await request.auditLog('surveillance_hl7v2_ingest', 'surveillance_source', undefined, {
        accepted: event !== null,
        admission_id: event?.admissionId,
        pending: source.pending,
        rejected: source.rejected,
      });
      if (!event) {
        return reply.status(422).send({
          success: false,
          error: { code: 'UNMAPPED_MESSAGE', message: 'Message could not be parsed/resolved to an admission' },
        });
      }
      return reply.send({ success: true, data: { accepted: true, admission_id: event.admissionId, pending: source.pending } });
    },
  );
}
