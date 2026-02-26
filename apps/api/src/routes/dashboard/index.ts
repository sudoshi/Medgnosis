// =============================================================================
// Medgnosis API — Dashboard routes  (Phase 10.1 — Clinician Morning View)
// Population health stats + clinician-facing schedule, alerts, tasks
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';

export default async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /dashboard — Aggregated dashboard data (pop-health + clinician)
  fastify.get('/', async (_request, reply) => {
    // Run all dashboard queries in parallel
    const [
      patientStats,
      careGapStats,
      riskDistribution,
      recentEncounters,
      todaysEncounters,
      urgentAlerts,
      criticalAlertCount,
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
      // Risk stratification placeholder
      Promise.resolve([]),
      // Recent encounters (pop-health section)
      sql`
        SELECT
          e.encounter_id AS id,
          e.encounter_datetime AS date,
          e.encounter_type AS type,
          p.first_name || ' ' || p.last_name AS patient_name
        FROM phm_edw.encounter e
        JOIN phm_edw.patient p ON p.patient_id = e.patient_id
        WHERE e.active_ind = 'Y'
        ORDER BY e.encounter_datetime DESC
        LIMIT 10
      `.catch((err) => {
        fastify.log.error({ err }, 'Dashboard: recent encounters query failed');
        return [];
      }),

      // ── Clinician queries (Phase 10.1) ─────────────────────────────────

      // Today's encounters (schedule)
      sql`
        SELECT
          e.encounter_id AS id,
          e.encounter_datetime AS date,
          e.encounter_type AS type,
          e.reason_for_visit AS reason,
          e.status,
          p.patient_id,
          p.first_name || ' ' || p.last_name AS patient_name,
          p.mrn,
          p.date_of_birth
        FROM phm_edw.encounter e
        JOIN phm_edw.patient p ON p.patient_id = e.patient_id
        WHERE e.active_ind = 'Y'
          AND e.encounter_datetime::date = CURRENT_DATE
        ORDER BY e.encounter_datetime ASC
        LIMIT 20
      `.catch((err) => {
        fastify.log.error({ err }, 'Dashboard: today encounters query failed');
        return [];
      }),

      // Urgent unacknowledged alerts (warning + critical)
      sql`
        SELECT
          ca.id,
          ca.alert_type,
          ca.severity,
          ca.title,
          ca.body,
          ca.created_at,
          ca.patient_id,
          p.first_name || ' ' || p.last_name AS patient_name,
          p.mrn
        FROM public.clinical_alerts ca
        LEFT JOIN phm_edw.patient p ON p.patient_id = ca.patient_id
        WHERE ca.acknowledged_at IS NULL
          AND ca.auto_resolved = FALSE
          AND ca.severity IN ('warning', 'critical')
        ORDER BY
          CASE ca.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
          ca.created_at DESC
        LIMIT 10
      `.catch((err) => {
        fastify.log.error({ err }, 'Dashboard: urgent alerts query failed');
        return [];
      }),

      // Critical alert count
      sql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM public.clinical_alerts
        WHERE acknowledged_at IS NULL
          AND auto_resolved = FALSE
          AND severity = 'critical'
      `.catch(() => [{ count: 0 }]),
    ]);

    const stats = patientStats[0] ?? { total: 0, active: 0 };
    const gaps = careGapStats[0] ?? { total: 0, open: 0, closed: 0 };
    const critCount = (criticalAlertCount as { count: number }[])[0]?.count ?? 0;

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
        // ── Clinician data ───────────────────────────────────────────────
        clinician: {
          todays_schedule: todaysEncounters,
          urgent_alerts: urgentAlerts,
          critical_alert_count: critCount,
          abby_briefing: {
            enabled: false,
            message: 'AI Morning Briefing coming in Phase 11',
          },
        },
      },
    });
  });
}
