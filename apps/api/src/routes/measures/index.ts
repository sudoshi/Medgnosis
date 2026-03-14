// =============================================================================
// Medgnosis API — Quality Measure routes
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { measureFilterSchema } from '@medgnosis/shared';

export default async function measureRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /measures — List quality measures
  fastify.get('/', async (request, reply) => {
    measureFilterSchema.parse(request.query);

    const measures = await sql`
      SELECT
        md.measure_id AS id,
        md.measure_name AS title,
        md.measure_code AS code,
        md.description,
        md.active_ind
      FROM phm_edw.measure_definition md
      WHERE md.active_ind = 'Y'
      ORDER BY md.measure_code ASC
    `;

    return reply.send({
      success: true,
      data: measures,
    });
  });

  // GET /measures/:id — Measure detail with population analysis
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    const [measure] = await sql`
      SELECT
        md.measure_id AS id,
        md.measure_name AS title,
        md.measure_code AS code,
        md.description,
        md.active_ind
      FROM phm_edw.measure_definition md
      WHERE md.measure_id = ${id}::int
    `;

    if (!measure) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Measure not found' },
      });
    }

    // Get population analysis from star schema
    // measure_id (from measure_definition) != measure_key (from dim_measure)
    // so we must join through dim_measure to resolve the correct key
    const populationStats = await sql`
      SELECT
        COUNT(*)::int AS total_patients,
        COUNT(*) FILTER (WHERE fmr.numerator_flag = TRUE)::int AS compliant,
        COUNT(*) FILTER (WHERE fmr.denominator_flag = TRUE)::int AS eligible
      FROM phm_star.fact_measure_result fmr
      JOIN phm_star.dim_measure dm ON dm.measure_key = fmr.measure_key
      WHERE dm.measure_id = ${id}::int
    `.catch((err) => {
      fastify.log.error({ err, measureId: id }, 'Measures: population stats query failed');
      return [{ total_patients: 0, compliant: 0, eligible: 0 }];
    });

    return reply.send({
      success: true,
      data: {
        ...measure,
        population: populationStats[0],
      },
    });
  });
}
