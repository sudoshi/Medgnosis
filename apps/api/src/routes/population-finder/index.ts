// =============================================================================
// Medgnosis API — Population Finder review worklist routes
// Clinician review of two-pass finder candidates: accept (routes through the
// bulk-load utility), reject, or dismiss ("does not have X" / 12-month snooze).
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { finderDismissSchema } from '@medgnosis/shared';
import { applyBulk, type BulkAction } from '../../services/problemListService.js';

interface CandidateRow {
  candidate_id: number;
  patient_id: number;
  pass: number;
  finding_type: string;
  current_problem_id: number | null;
  current_icd10: string | null;
  suggested_icd10: string;
  suggested_name: string;
  ontology_id: number | null;
  evidence: Record<string, unknown>;
  status: string;
}

export default async function populationFinderRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /population-finder?status=pending&page= — candidate worklist
  fastify.get('/', async (request, reply) => {
    const query = request.query as { status?: string; page?: string; per_page?: string };
    const status = query.status ?? 'pending';
    const page = parseInt(query.page ?? '1', 10);
    const perPage = parseInt(query.per_page ?? '50', 10);
    const offset = (page - 1) * perPage;

    const [rows, [count]] = await Promise.all([
      sql`
        SELECT
          c.candidate_id, c.patient_id, c.pass, c.finding_type,
          c.current_icd10, c.suggested_icd10, c.suggested_name,
          c.evidence, c.confidence, c.status, c.created_date,
          p.first_name || ' ' || p.last_name AS patient_name
        FROM phm_edw.population_finder_candidate c
        JOIN phm_edw.patient p ON p.patient_id = c.patient_id
        WHERE c.status = ${status}
        ORDER BY c.created_date DESC
        LIMIT ${perPage} OFFSET ${offset}
      `,
      sql<{ total: number }[]>`
        SELECT COUNT(*)::int AS total
        FROM phm_edw.population_finder_candidate
        WHERE status = ${status}
      `,
    ]);

    return reply.send({
      success: true,
      data: rows,
      meta: { page, per_page: perPage, total: count?.total ?? 0, total_pages: Math.ceil((count?.total ?? 0) / perPage) },
    });
  });

  // Helper: load a pending candidate by id
  async function loadCandidate(id: string): Promise<CandidateRow | null> {
    const [row] = await sql<CandidateRow[]>`
      SELECT candidate_id, patient_id, pass, finding_type, current_problem_id,
             current_icd10, suggested_icd10, suggested_name, ontology_id, evidence, status
      FROM phm_edw.population_finder_candidate
      WHERE candidate_id = ${id}::int
      LIMIT 1
    `;
    return row ?? null;
  }

  // POST /population-finder/:id/accept — apply via bulk-load utility
  fastify.post<{ Params: { id: string } }>('/:id/accept', async (request, reply) => {
    const candidate = await loadCandidate(request.params.id);
    if (!candidate) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Candidate not found' } });
    }
    if (candidate.status !== 'pending') {
      return reply.status(409).send({ success: false, error: { code: 'CONFLICT', message: `Candidate already ${candidate.status}` } });
    }

    const actor = request.user.email ?? request.user.sub;
    const action: BulkAction =
      candidate.finding_type === 'ckd_restage' && candidate.current_problem_id
        ? {
            type: 'restage',
            patient_id: candidate.patient_id,
            old_problem_id: candidate.current_problem_id,
            icd10_code: candidate.suggested_icd10,
            problem_name: candidate.suggested_name,
            ontology_id: candidate.ontology_id ?? undefined,
          }
        : {
            type: 'add',
            patient_id: candidate.patient_id,
            icd10_code: candidate.suggested_icd10,
            problem_name: candidate.suggested_name,
            ontology_id: candidate.ontology_id ?? undefined,
            provenance: 'recommendation_accepted',
          };

    const plan = await applyBulk([action], { dryRun: false, actor, source: 'finder_accept' });

    await sql`
      UPDATE phm_edw.population_finder_candidate
      SET status = 'accepted', resolved_by = ${actor}, resolved_at = NOW()
      WHERE candidate_id = ${candidate.candidate_id}
    `;
    await request.auditLog('accept', 'finder_candidate', request.params.id, { plan });

    return reply.send({ success: true, data: { candidate_id: candidate.candidate_id, status: 'accepted', plan } });
  });

  // POST /population-finder/:id/reject
  fastify.post<{ Params: { id: string } }>('/:id/reject', async (request, reply) => {
    const actor = request.user.email ?? request.user.sub;
    const [updated] = await sql<{ candidate_id: number }[]>`
      UPDATE phm_edw.population_finder_candidate
      SET status = 'rejected', resolved_by = ${actor}, resolved_at = NOW()
      WHERE candidate_id = ${request.params.id}::int AND status = 'pending'
      RETURNING candidate_id
    `;
    if (!updated) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Pending candidate not found' } });
    }
    await request.auditLog('reject', 'finder_candidate', request.params.id);
    return reply.send({ success: true, data: { candidate_id: updated.candidate_id, status: 'rejected' } });
  });

  // POST /population-finder/:id/dismiss — "does not have X" (permanent) or snooze (+12mo)
  fastify.post<{ Params: { id: string } }>('/:id/dismiss', async (request, reply) => {
    const parsed = finderDismissSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'reason must be does_not_have or snooze' } });
    }
    const candidate = await loadCandidate(request.params.id);
    if (!candidate) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Candidate not found' } });
    }

    const actor = request.user.email ?? request.user.sub;
    const findingKey = `${candidate.finding_type}:${candidate.suggested_icd10}`;
    const dismissedUntil = parsed.data.reason === 'snooze' ? sql`CURRENT_DATE + INTERVAL '12 months'` : sql`NULL`;

    await sql`
      INSERT INTO phm_edw.recommendation_dismissal
        (patient_id, finding_key, reason, dismissed_until, dismissed_by)
      VALUES (${candidate.patient_id}, ${findingKey}, ${parsed.data.reason}, ${dismissedUntil}, ${actor})
    `;
    await sql`
      UPDATE phm_edw.population_finder_candidate
      SET status = 'rejected', resolved_by = ${actor}, resolved_at = NOW()
      WHERE candidate_id = ${candidate.candidate_id} AND status = 'pending'
    `;
    await request.auditLog('dismiss', 'finder_candidate', request.params.id, { reason: parsed.data.reason });

    return reply.send({ success: true, data: { candidate_id: candidate.candidate_id, dismissed: parsed.data.reason } });
  });
}
