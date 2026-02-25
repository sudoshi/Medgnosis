// =============================================================================
// Medgnosis API — Dashboard routes
// Ported from backend/app/Http/Controllers/DashboardController.php
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';

export default async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /dashboard — Aggregated dashboard data
  fastify.get('/', async (_request, reply) => {
    // Run all dashboard queries in parallel
    const [
      patientStats,
      careGapStats,
      riskDistribution,
      recentEncounters,
    ] = await Promise.all([
      // Total and active patients
      sql<{ total: number; active: number }[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE active_ind = 'Y')::int AS active
        FROM phm_edw.patient
      `,
      // Care gap summary
      sql<{ total: number; open: number; closed: number }[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE gap_status = 'open')::int AS open,
          COUNT(*) FILTER (WHERE gap_status = 'closed')::int AS closed
        FROM phm_edw.care_gap
        WHERE active_ind = 'Y'
      `,
      // Risk stratification from star schema
      sql`
        SELECT risk_level, COUNT(*)::int AS count
        FROM (
          SELECT
            CASE
              WHEN fr.risk_score >= 75 THEN 'critical'
              WHEN fr.risk_score >= 50 THEN 'high'
              WHEN fr.risk_score >= 25 THEN 'moderate'
              ELSE 'low'
            END AS risk_level
          FROM phm_star.fact_measure_result fr
          WHERE fr.active_ind = 'Y'
        ) sub
        GROUP BY risk_level
      `.catch(() => []),
      // Recent encounters
      sql`
        SELECT
          e.encounter_id AS id,
          e.encounter_date AS date,
          e.encounter_type AS type,
          p.first_name || ' ' || p.last_name AS patient_name
        FROM phm_edw.encounter e
        JOIN phm_edw.patient p ON p.patient_id = e.patient_id
        WHERE e.active_ind = 'Y'
        ORDER BY e.encounter_date DESC
        LIMIT 10
      `.catch(() => []),
    ]);

    const stats = patientStats[0] ?? { total: 0, active: 0 };
    const gaps = careGapStats[0] ?? { total: 0, open: 0, closed: 0 };

    return reply.send({
      success: true,
      data: {
        stats: {
          total_patients: { value: stats.total, trend: 0 },
          active_patients: stats.active,
          care_gaps: { value: gaps.open, trend: 0 },
          risk_score: { high_risk_count: 0, high_risk_percentage: 0, trend: 0 },
          encounters: { value: 0, trend: 0 },
        },
        analytics: {
          care_gap_summary: {
            total: gaps.total,
            by_priority: { high: 0, medium: 0, low: 0 },
          },
          risk_stratification: {
            distribution: riskDistribution,
          },
          recent_encounters: recentEncounters,
        },
      },
    });
  });
}
