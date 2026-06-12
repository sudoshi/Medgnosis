// =============================================================================
// Medgnosis API — Population risk-model routes
// Registry browse, scored-patient worklist (care-gap filter), and on-demand run.
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { runRiskModels } from '../../services/runRiskModels.js';

export default async function riskModelRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /risk-models — the registry
  fastify.get('/', async (_request, reply) => {
    const models = await sql`
      SELECT model_code, model_name, model_version, model_type, description, is_active
      FROM phm_star.dim_risk_model
      WHERE is_active = TRUE
      ORDER BY model_name
    `;
    return reply.send({ success: true, data: models });
  });

  // GET /risk-models/:code/scores?care_gap=true — scored-patient worklist
  fastify.get<{ Params: { code: string }; Querystring: { care_gap?: string } }>(
    '/:code/scores',
    async (request, reply) => {
      const onlyGaps = request.query.care_gap === 'true';
      const rows = await sql`
        SELECT
          prs.patient_id, prs.model_code, prs.score_numeric, prs.risk_category,
          prs.components, prs.care_gap, prs.computed_date,
          p.first_name || ' ' || p.last_name AS patient_name
        FROM phm_edw.population_risk_score prs
        JOIN phm_edw.patient p ON p.patient_id = prs.patient_id
        WHERE prs.model_code = ${request.params.code}
          ${onlyGaps ? sql`AND prs.care_gap = TRUE` : sql``}
        ORDER BY prs.score_numeric DESC NULLS LAST, prs.patient_id
        LIMIT 200
      `;
      return reply.send({ success: true, data: rows });
    },
  );

  // POST /risk-models/run — recompute now (admin only)
  fastify.post('/run', async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
    }
    const result = await runRiskModels();
    await request.auditLog('run', 'risk_models', undefined, result as unknown as Record<string, unknown>);
    return reply.send({ success: true, data: result });
  });
}
