// =============================================================================
// Medgnosis API — Care Gap Bundle routes (Phase 10.6)
// Condition bundles, measures, and overlap rules
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';

export default async function bundleRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /bundles — List all active condition bundles with measure counts
  fastify.get('/', async (_request, reply) => {
    const bundles = await sql`
      SELECT
        cb.bundle_id,
        cb.bundle_code,
        cb.condition_name,
        cb.icd10_pattern,
        cb.bundle_size,
        cb.key_ecqm_refs,
        cb.description,
        COUNT(bm.bundle_measure_id)::int AS measure_count
      FROM phm_edw.condition_bundle cb
      LEFT JOIN phm_edw.bundle_measure bm
        ON bm.bundle_id = cb.bundle_id AND bm.active_ind = 'Y'
      WHERE cb.active_ind = 'Y'
      GROUP BY cb.bundle_id, cb.bundle_code, cb.condition_name,
               cb.icd10_pattern, cb.bundle_size, cb.key_ecqm_refs, cb.description
      ORDER BY cb.condition_name ASC
    `;

    return reply.send({ success: true, data: bundles });
  });

  // GET /bundles/overlaps — All active deduplication rules
  // NOTE: registered before /:bundleCode to avoid route conflict
  fastify.get('/overlaps', async (_request, reply) => {
    const rules = await sql`
      SELECT
        overlap_rule_id,
        rule_code,
        shared_domain,
        applicable_bundles,
        canonical_measure_code,
        dedup_rule
      FROM phm_edw.bundle_overlap_rule
      WHERE active_ind = 'Y'
      ORDER BY rule_code ASC
    `;

    return reply.send({ success: true, data: rules });
  });

  // GET /bundles/:bundleCode — Single bundle with all measures
  fastify.get<{ Params: { bundleCode: string } }>('/:bundleCode', async (request, reply) => {
    const { bundleCode } = request.params;

    const [bundle] = await sql`
      SELECT
        bundle_id,
        bundle_code,
        condition_name,
        icd10_pattern,
        bundle_size,
        key_ecqm_refs,
        description
      FROM phm_edw.condition_bundle
      WHERE bundle_code = ${bundleCode.toUpperCase()} AND active_ind = 'Y'
    `;

    if (!bundle) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `Bundle '${bundleCode}' not found` },
      });
    }

    const measures = await sql`
      SELECT
        md.measure_id,
        md.measure_code,
        md.measure_name,
        md.description,
        bm.frequency,
        bm.ecqm_reference,
        bm.ordinal
      FROM phm_edw.bundle_measure bm
      JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
      WHERE bm.bundle_id = ${bundle.bundle_id} AND bm.active_ind = 'Y'
      ORDER BY bm.ordinal ASC
    `;

    return reply.send({
      success: true,
      data: { ...bundle, measures },
    });
  });
}
