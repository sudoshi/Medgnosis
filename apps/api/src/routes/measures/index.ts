// =============================================================================
// Medgnosis API — Quality Measure routes
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';
import { measureFilterSchema } from '@medgnosis/shared';
import { wilsonCI } from '../../services/wilsonCI.js';
import { getMeasureDossier } from '../../services/measureDossier.js';

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

  // GET /measures/:id/strata — age/sex strata with Wilson 95% CIs.
  // measure_id != measure_key: resolve through dim_measure (see GET /:id).
  fastify.get<{ Params: { id: string } }>('/:id/strata', async (request, reply) => {
    const { id } = request.params;

    const rows = await sql<
      { dimension: string; stratum: string; denominator: number; numerator: number; excluded: number }[]
    >`
      SELECT fms.dimension, fms.stratum,
             fms.denominator::int, fms.numerator::int, fms.excluded::int
      FROM phm_star.fact_measure_strata fms
      JOIN phm_star.dim_measure dm ON dm.measure_key = fms.measure_key
      WHERE dm.measure_id = ${id}::int
      ORDER BY fms.dimension, fms.stratum
    `;

    if (rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No strata for this measure (run a measure refresh first)' },
      });
    }

    const data = rows.map((row) => {
      // small_cell: display guidance for wide-CI / small-n strata (denominator
      // 1–10). NOT suppression — this is an internal clinical tool; raw n stays
      // visible. Consumers may render a warning indicator alongside the rate.
      const small_cell = row.denominator > 0 && row.denominator < 11;
      if (row.denominator <= 0) {
        return { ...row, rate: null, ci_lower: null, ci_upper: null, small_cell };
      }
      const ci = wilsonCI(row.numerator, row.denominator);
      return {
        ...row,
        rate: Math.round((row.numerator / row.denominator) * 1000) / 10,
        ci_lower: Math.round(ci.lower * 1000) / 10,
        ci_upper: Math.round(ci.upper * 1000) / 10,
        small_cell,
      };
    });

    return reply.send({ success: true, data });
  });

  // GET /measures/:code/dossier — per-measure transparency package:
  // FHIR artifact binding + VSAC value sets (version-pinned) + bridge status.
  fastify.get<{ Params: { code: string } }>('/:code/dossier', async (request, reply) => {
    const dossier = await getMeasureDossier(request.params.code);
    return reply.send({ success: true, data: dossier });
  });
}
