// =============================================================================
// Medgnosis API — Problem List routes (curation + bulk-load utility)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { bulkProblemActionSchema } from '@medgnosis/shared';
import { applyBulk, type BulkAction } from '../../services/problemListService.js';

export default async function problemListRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /problem-list?patient_id= — active problems for a patient, with ontology context
  fastify.get('/', async (request, reply) => {
    const query = request.query as { patient_id?: string; status?: string };
    if (!query.patient_id) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'patient_id is required' },
      });
    }
    const status = query.status ?? 'Active';

    const problems = await sql`
      SELECT
        pl.problem_id,
        pl.patient_id,
        pl.problem_name,
        pl.icd10_code,
        pl.problem_status,
        pl.problem_type,
        pl.provenance,
        pl.onset_date,
        pl.resolved_date,
        o.disease_process,
        o.organ_system,
        o.stage_label
      FROM phm_edw.problem_list pl
      LEFT JOIN phm_edw.dx_ontology o ON o.ontology_id = pl.ontology_id
      WHERE pl.patient_id = ${query.patient_id}::int
        AND pl.active_ind = 'Y'
        ${status === 'all' ? sql`` : sql`AND pl.problem_status = ${status}`}
      ORDER BY o.organ_system NULLS LAST, pl.problem_name
    `;

    return reply.send({ success: true, data: problems });
  });

  // POST /problem-list/bulk?dry_run=true — apply curation actions
  fastify.post('/bulk', async (request, reply) => {
    const parsed = bulkProblemActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid bulk actions',
          details: parsed.error.flatten().fieldErrors,
        },
      });
    }

    const dryRun = (request.query as { dry_run?: string }).dry_run === 'true';
    const actor = request.user.email ?? request.user.sub;

    const plan = await applyBulk(parsed.data.actions as BulkAction[], {
      dryRun,
      actor,
      source: 'bulk_load',
    });

    if (!dryRun) {
      await request.auditLog('bulk_update', 'problem_list', undefined, {
        action_count: parsed.data.actions.length,
        applied: plan.filter((p) => p.status === 'applied').length,
      });
    }

    return reply.send({ success: true, data: { dry_run: dryRun, plan } });
  });
}
