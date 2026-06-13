// =============================================================================
// Medgnosis API — Inpatient Glucometrics routes
// Unit census triaged by the two rules + per-bed drill-down (glucose trend,
// insulin ledger, context flags with per-element freshness).
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { glucoCensus } from '../../services/glucometrics.js';

export default async function glucometricsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /glucometrics/census — triage every bed by the two rules
  fastify.get('/census', async (_request, reply) => {
    const census = await glucoCensus();
    const highRisk = census.filter((c) => c.high_risk).length;
    return reply.send({ success: true, data: { census, high_risk: highRisk, total: census.length } });
  });

  // GET /glucometrics/:admissionId — glucose trend + insulin ledger + context
  fastify.get<{ Params: { admissionId: string } }>('/:admissionId', async (request, reply) => {
    const id = request.params.admissionId;
    const [admission] = await sql<{ admission_id: number; patient_id: number; patient_name: string; unit: string; bed: string; admitting_dx: string | null }[]>`
      SELECT a.admission_id, a.patient_id, a.unit, a.bed, a.admitting_dx,
             p.first_name || ' ' || p.last_name AS patient_name
      FROM phm_rt.admission a JOIN phm_edw.patient p ON p.patient_id = a.patient_id
      WHERE a.admission_id = ${id}::int LIMIT 1
    `;
    if (!admission) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Admission not found' } });
    }

    const [glucose, insulin, context] = await Promise.all([
      sql`SELECT reading_datetime, glucose_mgdl, source FROM phm_rt.glucose_stream WHERE admission_id = ${id}::int ORDER BY reading_datetime DESC LIMIT 48`,
      sql`SELECT admin_datetime, dose_units, product FROM phm_rt.insulin_admin WHERE admission_id = ${id}::int ORDER BY admin_datetime DESC LIMIT 24`,
      // Context flags (per-element freshness: problem list is nightly, stream is live)
      sql<{ has_diabetes: boolean; on_insulin: boolean }[]>`
        SELECT
          EXISTS (SELECT 1 FROM phm_edw.problem_list pl
                  WHERE pl.patient_id = ${admission.patient_id} AND pl.active_ind = 'Y'
                    AND pl.problem_status = 'Active' AND (pl.icd10_code LIKE 'E10%' OR pl.icd10_code LIKE 'E11%')) AS has_diabetes,
          EXISTS (SELECT 1 FROM phm_rt.insulin_admin ia WHERE ia.admission_id = ${id}::int) AS on_insulin
      `,
    ]);

    return reply.send({
      success: true,
      data: { admission, glucose, insulin, context: context[0] ?? { has_diabetes: false, on_insulin: false } },
    });
  });
}
