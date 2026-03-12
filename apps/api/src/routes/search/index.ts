// =============================================================================
// Medgnosis API — Global search routes (Solr-accelerated, PG fallback)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { getSolrClient } from '../../plugins/solr.js';
import { buildSearchCoreQuery } from '@medgnosis/solr';

export default async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /search?q=term — Full-text fuzzy search across patients
  fastify.get('/', async (request, reply) => {
    const query = request.query as { q?: string; limit?: string };
    const searchTerm = query.q ?? '';
    const limit = Math.min(parseInt(query.limit ?? '20', 10), 50);

    if (searchTerm.length < 2) {
      return reply.send({ success: true, data: { patients: [] } });
    }

    const startedAt = process.hrtime.bigint();
    const solr = getSolrClient();
    let source: 'solr' | 'pg' = 'pg';

    let patients: Record<string, unknown>[];

    if (solr) {
      try {
        const solrQuery = buildSearchCoreQuery({
          searchTerm,
          docType: 'patient',
          providerId: request.user.provider_id,
          limit,
          offset: 0,
        });

        const result = await solr.query<{
          patient_id: number;
          first_name: string;
          last_name: string;
          mrn: string;
          date_of_birth: string;
          doc_type: string;
        }>('search', solrQuery);

        patients = result.response.docs.map((d) => ({
          id: d.patient_id,
          first_name: d.first_name,
          last_name: d.last_name,
          mrn: d.mrn,
          date_of_birth: d.date_of_birth,
          relevance: 1,
        }));
        source = 'solr';
      } catch (err) {
        request.log.warn({ err }, '[search] Solr query failed — falling back to PG');
        patients = await pgSearch(searchTerm, limit);
      }
    } else {
      patients = await pgSearch(searchTerm, limit);
    }

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    request.log.info(
      { route: '/search', source, duration_ms: Math.round(durationMs * 100) / 100 },
      'Route timing',
    );

    reply.header('X-Query-Source', source);
    return reply.send({ success: true, data: { patients } });
  });
}

async function pgSearch(
  searchTerm: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  return sql`
    SELECT
      p.patient_id AS id,
      p.first_name,
      p.last_name,
      p.mrn,
      p.date_of_birth,
      similarity(p.first_name || ' ' || p.last_name, ${searchTerm}) AS relevance
    FROM phm_edw.patient p
    WHERE p.active_ind = 'Y'
      AND (
        (p.first_name || ' ' || p.last_name) ILIKE ${`%${searchTerm}%`}
        OR p.mrn ILIKE ${`%${searchTerm}%`}
        OR similarity(p.first_name || ' ' || p.last_name, ${searchTerm}) > 0.3
      )
    ORDER BY relevance DESC, p.last_name ASC
    LIMIT ${limit}
  `;
}
