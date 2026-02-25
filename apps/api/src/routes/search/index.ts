// =============================================================================
// Medgnosis API — Global search routes (pg_trgm powered)
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';

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

    const patients = await sql`
      SELECT
        p.patient_id AS id,
        p.first_name,
        p.last_name,
        p.medical_record_number AS mrn,
        p.date_of_birth,
        similarity(p.first_name || ' ' || p.last_name, ${searchTerm}) AS relevance
      FROM phm_edw.patient p
      WHERE p.active_ind = 'Y'
        AND (
          (p.first_name || ' ' || p.last_name) ILIKE ${`%${searchTerm}%`}
          OR p.medical_record_number ILIKE ${`%${searchTerm}%`}
          OR similarity(p.first_name || ' ' || p.last_name, ${searchTerm}) > 0.3
        )
      ORDER BY relevance DESC, p.last_name ASC
      LIMIT ${limit}
    `;

    return reply.send({
      success: true,
      data: { patients },
    });
  });
}
