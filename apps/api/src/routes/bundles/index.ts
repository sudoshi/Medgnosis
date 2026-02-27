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

  // GET /bundles/population — Population-level bundle performance (star schema)
  // NOTE: registered before /:bundleCode to avoid route conflict
  fastify.get('/population', async (request, reply) => {
    const query = request.query as { category?: string };

    const bundles = await sql<{
      bundle_key: number; bundle_code: string; bundle_name: string; disease_category: string;
      patient_count: number; avg_compliance_pct: number;
      total_open_gaps: number; total_closed_gaps: number;
      critical_patients: number; high_risk_patients: number;
      key_ecqm_refs: string | null; description: string | null; bundle_size: number;
    }[]>`
      SELECT
        mv.bundle_key, mv.bundle_code, mv.bundle_name, mv.disease_category,
        mv.patient_count::int, mv.avg_compliance_pct::float,
        mv.total_open_gaps::int, mv.total_closed_gaps::int,
        mv.critical_patients::int, mv.high_risk_patients::int,
        cb.key_ecqm_refs, cb.description, cb.bundle_size
      FROM phm_star.mv_population_by_condition mv
      JOIN phm_edw.condition_bundle cb ON cb.bundle_code = mv.bundle_code AND cb.active_ind = 'Y'
      ${query.category ? sql`WHERE mv.disease_category = ${query.category}` : sql``}
      ORDER BY mv.patient_count DESC
    `;

    const totalPatients = bundles.reduce((s, b) => s + b.patient_count, 0);
    const totalOpen = bundles.reduce((s, b) => s + b.total_open_gaps, 0);
    const totalClosed = bundles.reduce((s, b) => s + b.total_closed_gaps, 0);
    const avgCompliance = bundles.length > 0
      ? Math.round((bundles.reduce((s, b) => s + b.avg_compliance_pct * b.patient_count, 0) / totalPatients) * 10) / 10
      : 0;
    const categories = [...new Set(bundles.map((b) => b.disease_category))].sort();

    return reply.send({
      success: true,
      data: {
        summary: {
          total_bundles: bundles.length,
          total_patients: totalPatients,
          avg_compliance: avgCompliance,
          total_open_gaps: totalOpen,
          total_closed_gaps: totalClosed,
        },
        bundles,
        categories,
      },
    });
  });

  // GET /bundles/:bundleCode/patients — Patient drilldown for a specific bundle
  // NOTE: registered before /:bundleCode (more specific path matches first in Fastify)
  fastify.get<{ Params: { bundleCode: string } }>('/:bundleCode/patients', async (request, reply) => {
    const { bundleCode } = request.params;
    const query = request.query as { page?: string; per_page?: string; risk_tier?: string };

    const page = parseInt(query.page ?? '1', 10);
    const perPage = parseInt(query.per_page ?? '20', 10);
    const offset = (page - 1) * perPage;

    // Verify bundle exists
    const [bundle] = await sql<{ bundle_key: number }[]>`
      SELECT bundle_key FROM phm_star.dim_care_gap_bundle
      WHERE bundle_code = ${bundleCode.toUpperCase()} AND is_active = TRUE
    `;
    if (!bundle) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `Bundle '${bundleCode}' not found` },
      });
    }

    const [patients, [countResult]] = await Promise.all([
      sql<{
        patient_id: number; first_name: string; last_name: string; mrn: string;
        date_of_birth: string | null;
        total_measures: number; measures_met: number; measures_open: number;
        compliance_pct: number; risk_tier: string | null;
      }[]>`
        SELECT
          dp.patient_id, dp.first_name, dp.last_name, dp.mrn,
          dp.date_of_birth::text,
          fpb.total_measures::int, fpb.measures_met::int, fpb.measures_open::int,
          fpb.compliance_pct::float, fpb.risk_tier
        FROM phm_star.fact_patient_bundle fpb
        JOIN phm_star.dim_patient dp ON dp.patient_key = fpb.patient_key
        WHERE fpb.bundle_key = ${bundle.bundle_key} AND fpb.is_active = TRUE
          ${query.risk_tier ? sql`AND fpb.risk_tier = ${query.risk_tier}` : sql``}
        ORDER BY fpb.compliance_pct ASC
        LIMIT ${perPage} OFFSET ${offset}
      `,
      sql<{ total: number }[]>`
        SELECT COUNT(*)::int AS total
        FROM phm_star.fact_patient_bundle fpb
        WHERE fpb.bundle_key = ${bundle.bundle_key} AND fpb.is_active = TRUE
          ${query.risk_tier ? sql`AND fpb.risk_tier = ${query.risk_tier}` : sql``}
      `,
    ]);

    const total = countResult?.total ?? 0;
    return reply.send({
      success: true,
      data: patients,
      meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
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
