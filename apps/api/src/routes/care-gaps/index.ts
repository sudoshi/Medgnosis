// =============================================================================
// Medgnosis API — Care Gap routes (Solr-accelerated, PG fallback)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { careGapUpdateSchema } from '@medgnosis/shared';
import { getSolrClient } from '../../plugins/solr.js';
import { buildSearchCoreQuery } from '@medgnosis/solr';

export default async function careGapRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /care-gaps — List care gaps with filters
  fastify.get('/', async (request, reply) => {
    const startedAt = process.hrtime.bigint();
    const query = request.query as {
      status?: string;
      priority?: string;
      patient_id?: string;
      search?: string;
      page?: string;
      per_page?: string;
    };

    const page = parseInt(query.page ?? '1', 10);
    const perPage = parseInt(query.per_page ?? '25', 10);
    const offset = (page - 1) * perPage;

    const providerId = request.user.provider_id;
    const scoped = providerId !== undefined;

    let careGaps: Record<string, unknown>[];
    let total: number;
    let source: 'solr' | 'pg' = 'pg';

    const solr = getSolrClient();

    // Use Solr when searching or filtering (the main performance win)
    if (solr && (query.search || query.status || query.priority)) {
      try {
        const filters: Record<string, string> = {};
        if (query.status) filters['gap_status'] = query.status;
        if (query.priority) filters['gap_priority'] = query.priority;
        if (query.patient_id) filters['patient_id'] = query.patient_id;

        const solrQuery = buildSearchCoreQuery({
          searchTerm: query.search ?? '*:*',
          docType: 'care_gap',
          providerId,
          filters,
          limit: perPage,
          offset,
        });

        const result = await solr.query<{
          care_gap_id: number;
          patient_id: number;
          patient_name: string;
          measure_name: string;
          measure_code: string;
          gap_status: string;
          gap_priority: string;
          due_date: string;
          identified_date: string;
          resolved_date: string;
        }>('search', solrQuery);

        careGaps = result.response.docs.map((d) => ({
          id: d.care_gap_id,
          patient_id: d.patient_id,
          patient_name: d.patient_name,
          measure: d.measure_name,
          status: d.gap_status,
          priority: d.gap_priority,
          due_date: d.due_date,
          identified_date: d.identified_date,
          resolved_date: d.resolved_date,
          active_ind: 'Y',
        }));
        total = result.response.numFound;
        source = 'solr';
      } catch (err) {
        request.log.warn({ err }, '[care-gaps] Solr query failed — falling back to PG');
        ({ careGaps, total } = await pgCareGapsList(query, scoped, providerId, perPage, offset));
      }
    } else {
      ({ careGaps, total } = await pgCareGapsList(query, scoped, providerId, perPage, offset));
    }

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    request.log.info(
      { route: '/care-gaps', source, duration_ms: Math.round(durationMs * 100) / 100 },
      'Route timing',
    );

    reply.header('X-Query-Source', source);
    return reply.send({
      success: true,
      data: careGaps,
      meta: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
    });
  });

  // PATCH /care-gaps/:id — Update care gap status
  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const parseResult = careGapUpdateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' },
      });
    }

    const { status, notes } = parseResult.data;
    const dbStatus = status === 'resolved' ? 'closed' : status;
    const shouldResolve = status === 'closed' || status === 'resolved';

    const [updated] = await sql`
      UPDATE phm_edw.care_gap
      SET gap_status = ${dbStatus},
          resolved_date = ${shouldResolve ? new Date().toISOString() : null},
          comments = COALESCE(${notes ?? null}, comments),
          updated_date = NOW()
      WHERE care_gap_id = ${id}::int AND active_ind = 'Y'
      RETURNING care_gap_id AS id, gap_status AS status
    `;

    if (!updated) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Care gap not found' },
      });
    }

    await request.auditLog('update', 'care_gap', id, { status: dbStatus });

    return reply.send({ success: true, data: updated });
  });
}

// --- PG fallback for care gaps list ---
async function pgCareGapsList(
  query: { status?: string; priority?: string; patient_id?: string; search?: string },
  scoped: boolean,
  providerId: number | undefined,
  perPage: number,
  offset: number,
): Promise<{ careGaps: Record<string, unknown>[]; total: number }> {
  const [careGaps, [countResult]] = await Promise.all([
    sql`
      SELECT
        cg.care_gap_id AS id,
        cg.patient_id,
        p.first_name || ' ' || p.last_name AS patient_name,
        md.measure_name AS measure,
        cg.gap_status AS status,
        cg.gap_priority AS priority,
        cg.due_date,
        cg.identified_date,
        cg.resolved_date,
        cg.active_ind
      FROM phm_edw.care_gap cg
      JOIN phm_edw.patient p ON p.patient_id = cg.patient_id
      LEFT JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
      WHERE cg.active_ind = 'Y'
        AND p.active_ind = 'Y'
        ${scoped ? sql`AND p.pcp_provider_id = ${providerId!}` : sql``}
        ${query.status ? sql`AND cg.gap_status = ${query.status}` : sql``}
        ${query.priority ? sql`AND cg.gap_priority = ${query.priority}` : sql``}
        ${query.patient_id ? sql`AND cg.patient_id = ${query.patient_id}::int` : sql``}
        ${query.search
          ? sql`AND (
              (p.first_name || ' ' || p.last_name) ILIKE ${'%' + query.search + '%'}
              OR md.measure_name ILIKE ${'%' + query.search + '%'}
            )`
          : sql``}
      ORDER BY
        CASE cg.gap_priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
        cg.due_date ASC NULLS LAST,
        cg.identified_date ASC
      LIMIT ${perPage}
      OFFSET ${offset}
    `,
    sql<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM phm_edw.care_gap cg
      JOIN phm_edw.patient p ON p.patient_id = cg.patient_id
      LEFT JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
      WHERE cg.active_ind = 'Y'
        AND p.active_ind = 'Y'
        ${scoped ? sql`AND p.pcp_provider_id = ${providerId!}` : sql``}
        ${query.status ? sql`AND cg.gap_status = ${query.status}` : sql``}
        ${query.priority ? sql`AND cg.gap_priority = ${query.priority}` : sql``}
        ${query.patient_id ? sql`AND cg.patient_id = ${query.patient_id}::int` : sql``}
        ${query.search
          ? sql`AND (
              (p.first_name || ' ' || p.last_name) ILIKE ${'%' + query.search + '%'}
              OR md.measure_name ILIKE ${'%' + query.search + '%'}
            )`
          : sql``}
    `,
  ]);

  return { careGaps, total: countResult?.total ?? 0 };
}
