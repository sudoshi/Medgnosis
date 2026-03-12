// =============================================================================
// Medgnosis API — Dashboard routes  (Phase 10.1 — Clinician Morning View)
// Population health stats from mv_dashboard_stats + live clinician queries
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';

/** Calculate month-over-month trend as a rounded percentage. */
function calcTrend(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prior) / prior) * 100);
}

// Mat view row shape
interface DashboardStats {
  provider_id: number | null;
  total_patients: number;
  active_patients: number;
  gaps_total: number;
  gaps_open: number;
  gaps_closed: number;
  gaps_priority_high: number;
  gaps_priority_medium: number;
  gaps_priority_low: number;
  gaps_opened_30d: number;
  gaps_closed_30d: number;
  encounters_30d: number;
  encounters_prior_30d: number;
  patients_new_30d: number;
  patients_prior_30d: number;
  risk_critical: number;
  risk_high: number;
  risk_moderate: number;
  risk_low: number;
  refreshed_at: string;
}

export default async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /dashboard — Aggregated dashboard data (pop-health + clinician)
  fastify.get('/', async (request, reply) => {
    const startedAt = process.hrtime.bigint();
    const providerId = request.user.provider_id;
    const scoped = providerId !== undefined;

    // ── Fast path: pre-aggregated stats from mat view + live clinician queries ──
    const [
      dashStats,
      recentEncounters,
      todaysEncounters,
      urgentAlerts,
      criticalAlertCount,
    ] = await Promise.all([
      // Single-row lookup from materialized view
      sql<DashboardStats[]>`
        SELECT *
        FROM phm_star.mv_dashboard_stats
        WHERE ${scoped ? sql`provider_id = ${providerId!}` : sql`provider_id IS NULL`}
        LIMIT 1
      `.catch((err) => {
        fastify.log.error({ err }, 'Dashboard: mv_dashboard_stats query failed');
        return [] as DashboardStats[];
      }),

      // Recent encounters (10 rows, fast with new index)
      sql`
        SELECT
          e.encounter_id AS id,
          e.encounter_datetime AS date,
          e.encounter_type AS type,
          p.first_name || ' ' || p.last_name AS patient_name
        FROM phm_edw.encounter e
        JOIN phm_edw.patient p ON p.patient_id = e.patient_id
        WHERE e.active_ind = 'Y'
          ${scoped ? sql`AND p.pcp_provider_id = ${providerId!}` : sql``}
        ORDER BY e.encounter_datetime DESC
        LIMIT 10
      `.catch((err) => {
        fastify.log.error({ err }, 'Dashboard: recent encounters query failed');
        return [];
      }),

      // Today's encounters (schedule) — small result set
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
          AND e.encounter_datetime >= CURRENT_DATE::timestamp
          AND e.encounter_datetime <  (CURRENT_DATE + 1)::timestamp
          ${scoped ? sql`AND e.provider_id = ${providerId!}` : sql``}
        ORDER BY e.encounter_datetime ASC
        LIMIT 20
      `.catch((err) => {
        fastify.log.error({ err }, 'Dashboard: today encounters query failed');
        return [];
      }),

      // Urgent alerts — small table
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
          ${scoped ? sql`AND (ca.patient_id IS NULL OR p.pcp_provider_id = ${providerId!})` : sql``}
        ORDER BY
          CASE ca.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
          ca.created_at DESC
        LIMIT 10
      `.catch((err) => {
        fastify.log.error({ err }, 'Dashboard: urgent alerts query failed');
        return [];
      }),

      // Critical alert count — small table
      sql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM public.clinical_alerts ca
        ${scoped ? sql`LEFT JOIN phm_edw.patient p ON p.patient_id = ca.patient_id` : sql``}
        WHERE ca.acknowledged_at IS NULL
          AND ca.auto_resolved = FALSE
          AND ca.severity = 'critical'
          ${scoped ? sql`AND (ca.patient_id IS NULL OR p.pcp_provider_id = ${providerId!})` : sql``}
      `.catch(() => [{ count: 0 }]),
    ]);

    // Extract mat view row (fallback to zeros if missing)
    const mv: DashboardStats = dashStats[0] ?? {
      provider_id: providerId ?? null,
      total_patients: 0, active_patients: 0,
      gaps_total: 0, gaps_open: 0, gaps_closed: 0,
      gaps_priority_high: 0, gaps_priority_medium: 0, gaps_priority_low: 0,
      gaps_opened_30d: 0, gaps_closed_30d: 0,
      encounters_30d: 0, encounters_prior_30d: 0,
      patients_new_30d: 0, patients_prior_30d: 0,
      risk_critical: 0, risk_high: 0, risk_moderate: 0, risk_low: 0,
      refreshed_at: new Date().toISOString(),
    };

    const critCount = (criticalAlertCount as { count: number }[])[0]?.count ?? 0;

    // Risk stratification from mat view
    const riskDist: { risk_level: string; count: number }[] = [];
    if (mv.risk_critical > 0) riskDist.push({ risk_level: 'critical', count: mv.risk_critical });
    if (mv.risk_high > 0) riskDist.push({ risk_level: 'high', count: mv.risk_high });
    if (mv.risk_moderate > 0) riskDist.push({ risk_level: 'moderate', count: mv.risk_moderate });
    if (mv.risk_low > 0) riskDist.push({ risk_level: 'low', count: mv.risk_low });

    const highRiskCount = mv.risk_high + mv.risk_critical;
    const highRiskPct = mv.total_patients > 0
      ? Math.round((highRiskCount / mv.total_patients) * 100)
      : 0;

    // Trend calculations from mat view
    const patientTrend = calcTrend(mv.patients_new_30d, mv.patients_prior_30d);
    const encounterTrend = calcTrend(mv.encounters_30d, mv.encounters_prior_30d);
    const priorOpen = mv.gaps_open + mv.gaps_closed_30d - mv.gaps_opened_30d;
    const careGapTrend = calcTrend(mv.gaps_open, Math.max(priorOpen, 0));

    const response = {
      success: true,
      data: {
        stats: {
          total_patients: { value: mv.total_patients, trend: patientTrend },
          active_patients: mv.active_patients,
          care_gaps: { value: mv.gaps_open, trend: careGapTrend },
          risk_score: { high_risk_count: highRiskCount, high_risk_percentage: highRiskPct, trend: 0 },
          encounters: { value: mv.encounters_30d, trend: encounterTrend },
        },
        analytics: {
          care_gap_summary: {
            total: mv.gaps_total,
            by_priority: {
              high: mv.gaps_priority_high,
              medium: mv.gaps_priority_medium,
              low: mv.gaps_priority_low,
            },
          },
          risk_stratification: {
            distribution: riskDist,
          },
          recent_encounters: recentEncounters,
        },
        clinician: {
          todays_schedule: todaysEncounters,
          urgent_alerts: urgentAlerts,
          critical_alert_count: critCount,
          abby_briefing: {
            enabled: true,
            message: 'Ask me about your patients, care gaps, or quality measures.',
          },
        },
      },
    };
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    request.log.info(
      { route: '/dashboard', provider_id: request.user.provider_id ?? null, duration_ms: Math.round(durationMs * 100) / 100 },
      'Route timing',
    );
    return reply.send(response);
  });
}
