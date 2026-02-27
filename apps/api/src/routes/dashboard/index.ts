// =============================================================================
// Medgnosis API — Dashboard routes  (Phase 10.1 — Clinician Morning View)
// Population health stats + clinician-facing schedule, alerts, tasks
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { sql } from '@medgnosis/db';

/** Calculate month-over-month trend as a rounded percentage. */
function calcTrend(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prior) / prior) * 100);
}

export default async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /dashboard — Aggregated dashboard data (pop-health + clinician)
  fastify.get('/', async (request, reply) => {
    // Provider scoping: all queries filtered to the logged-in provider's panel.
    // Admin users (no provider_id in JWT) see the full population.
    const providerId = request.user.provider_id;
    const scoped = providerId !== undefined;

    // Run all dashboard queries in parallel
    const [
      patientStats,
      careGapStats,
      riskDistribution,
      gapPriorityResult,
      encounterCountResult,
      recentEncounters,
      todaysEncounters,
      urgentAlerts,
      criticalAlertCount,
      trendResult,
    ] = await Promise.all([
      // Total and active patients — scoped to provider's PCP panel
      sql<{ total: number; active: number }[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*)::int AS active
        FROM phm_edw.patient
        WHERE active_ind = 'Y'
          ${scoped ? sql`AND pcp_provider_id = ${providerId}` : sql``}
      `,
      // Care gap summary — scoped via patient PCP
      sql<{ total: number; open: number; closed: number }[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE cg.gap_status = 'open')::int AS open,
          COUNT(*) FILTER (WHERE cg.gap_status = 'closed')::int AS closed
        FROM phm_edw.care_gap cg
        ${scoped ? sql`JOIN phm_edw.patient p ON p.patient_id = cg.patient_id` : sql``}
        WHERE cg.active_ind = 'Y'
          ${scoped ? sql`AND p.pcp_provider_id = ${providerId} AND p.active_ind = 'Y'` : sql``}
      `,
      // Risk stratification from star schema — scoped by provider_key
      sql<{ risk_level: string; count: number }[]>`
        SELECT risk_tier AS risk_level, COUNT(*)::int AS count
        FROM phm_star.fact_patient_composite
        WHERE risk_tier IS NOT NULL
          ${scoped ? sql`AND provider_key = (
              SELECT provider_key FROM phm_star.dim_provider
              WHERE provider_id = ${providerId} LIMIT 1
            )` : sql``}
        GROUP BY risk_tier
        ORDER BY CASE risk_tier
          WHEN 'critical' THEN 1 WHEN 'high' THEN 2
          WHEN 'moderate' THEN 3 WHEN 'low' THEN 4 ELSE 5
        END
      `.catch((err) => {
        fastify.log.error({ err }, 'Dashboard: risk stratification query failed');
        return [];
      }),
      // Care gap priority breakdown — scoped via patient PCP
      sql<{ high: number; medium: number; low: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE cg.gap_priority = 'high')::int AS high,
          COUNT(*) FILTER (WHERE cg.gap_priority = 'medium')::int AS medium,
          COUNT(*) FILTER (WHERE cg.gap_priority = 'low')::int AS low
        FROM phm_edw.care_gap cg
        ${scoped ? sql`JOIN phm_edw.patient p ON p.patient_id = cg.patient_id` : sql``}
        WHERE cg.gap_status = 'open' AND cg.active_ind = 'Y'
          ${scoped ? sql`AND p.pcp_provider_id = ${providerId} AND p.active_ind = 'Y'` : sql``}
      `.catch((err) => {
        fastify.log.error({ err }, 'Dashboard: care gap priority query failed');
        return [{ high: 0, medium: 0, low: 0 }];
      }),
      // Encounter count (30-day) — scoped to patient panel
      sql<{ value: number }[]>`
        SELECT COUNT(*)::int AS value
        FROM phm_edw.encounter e
        ${scoped ? sql`JOIN phm_edw.patient p ON p.patient_id = e.patient_id` : sql``}
        WHERE e.active_ind = 'Y'
          AND e.encounter_datetime >= NOW() - INTERVAL '30 days'
          ${scoped ? sql`AND p.pcp_provider_id = ${providerId} AND p.active_ind = 'Y'` : sql``}
      `.catch(() => [{ value: 0 }]),
      // Recent encounters (pop-health section) — scoped to patient panel
      sql`
        SELECT
          e.encounter_id AS id,
          e.encounter_datetime AS date,
          e.encounter_type AS type,
          p.first_name || ' ' || p.last_name AS patient_name
        FROM phm_edw.encounter e
        JOIN phm_edw.patient p ON p.patient_id = e.patient_id
        WHERE e.active_ind = 'Y'
          ${scoped ? sql`AND p.pcp_provider_id = ${providerId}` : sql``}
        ORDER BY e.encounter_datetime DESC
        LIMIT 10
      `.catch((err) => {
        fastify.log.error({ err }, 'Dashboard: recent encounters query failed');
        return [];
      }),

      // ── Clinician queries (Phase 10.1) ─────────────────────────────────

      // Today's encounters (schedule) — scoped to provider's own appointments
      // Range predicate (not ::date cast) so idx_encounter_datetime_active is usable
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
          ${scoped ? sql`AND e.provider_id = ${providerId}` : sql``}
        ORDER BY e.encounter_datetime ASC
        LIMIT 20
      `.catch((err) => {
        fastify.log.error({ err }, 'Dashboard: today encounters query failed');
        return [];
      }),

      // Urgent unacknowledged alerts — scoped to provider's patients
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
          ${scoped ? sql`AND (ca.patient_id IS NULL OR p.pcp_provider_id = ${providerId})` : sql``}
        ORDER BY
          CASE ca.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
          ca.created_at DESC
        LIMIT 10
      `.catch((err) => {
        fastify.log.error({ err }, 'Dashboard: urgent alerts query failed');
        return [];
      }),

      // Critical alert count — scoped to provider's patients
      sql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM public.clinical_alerts ca
        ${scoped ? sql`LEFT JOIN phm_edw.patient p ON p.patient_id = ca.patient_id` : sql``}
        WHERE ca.acknowledged_at IS NULL
          AND ca.auto_resolved = FALSE
          AND ca.severity = 'critical'
          ${scoped ? sql`AND (ca.patient_id IS NULL OR p.pcp_provider_id = ${providerId})` : sql``}
      `.catch(() => [{ count: 0 }]),

      // ── Trend calculations (30-day rolling comparison) ──────────────
      sql<{
        patients_current: number; patients_prior: number;
        encounters_current: number; encounters_prior: number;
        gaps_opened_30d: number; gaps_closed_30d: number;
      }[]>`
        SELECT
          (SELECT COUNT(*) FROM phm_edw.patient
           WHERE active_ind = 'Y'
             AND created_date >= NOW() - INTERVAL '30 days'
             ${scoped ? sql`AND pcp_provider_id = ${providerId}` : sql``})::int
            AS patients_current,
          (SELECT COUNT(*) FROM phm_edw.patient
           WHERE active_ind = 'Y'
             AND created_date >= NOW() - INTERVAL '60 days'
             AND created_date < NOW() - INTERVAL '30 days'
             ${scoped ? sql`AND pcp_provider_id = ${providerId}` : sql``})::int
            AS patients_prior,
          (SELECT COUNT(*) FROM phm_edw.encounter e
             ${scoped ? sql`JOIN phm_edw.patient p ON p.patient_id = e.patient_id` : sql``}
           WHERE e.active_ind = 'Y'
             AND e.encounter_datetime >= NOW() - INTERVAL '30 days'
             ${scoped ? sql`AND p.pcp_provider_id = ${providerId} AND p.active_ind = 'Y'` : sql``})::int
            AS encounters_current,
          (SELECT COUNT(*) FROM phm_edw.encounter e
             ${scoped ? sql`JOIN phm_edw.patient p ON p.patient_id = e.patient_id` : sql``}
           WHERE e.active_ind = 'Y'
             AND e.encounter_datetime >= NOW() - INTERVAL '60 days'
             AND e.encounter_datetime < NOW() - INTERVAL '30 days'
             ${scoped ? sql`AND p.pcp_provider_id = ${providerId} AND p.active_ind = 'Y'` : sql``})::int
            AS encounters_prior,
          (SELECT COUNT(*) FROM phm_edw.care_gap cg
             ${scoped ? sql`JOIN phm_edw.patient p ON p.patient_id = cg.patient_id` : sql``}
           WHERE cg.active_ind = 'Y'
             AND cg.identified_date >= NOW() - INTERVAL '30 days'
             ${scoped ? sql`AND p.pcp_provider_id = ${providerId} AND p.active_ind = 'Y'` : sql``})::int
            AS gaps_opened_30d,
          (SELECT COUNT(*) FROM phm_edw.care_gap cg
             ${scoped ? sql`JOIN phm_edw.patient p ON p.patient_id = cg.patient_id` : sql``}
           WHERE cg.active_ind = 'Y'
             AND cg.gap_status = 'closed'
             AND cg.resolved_date >= NOW() - INTERVAL '30 days'
             ${scoped ? sql`AND p.pcp_provider_id = ${providerId} AND p.active_ind = 'Y'` : sql``})::int
            AS gaps_closed_30d
      `.catch((err) => {
        fastify.log.error({ err }, 'Dashboard: trend query failed');
        return [{ patients_current: 0, patients_prior: 0, encounters_current: 0, encounters_prior: 0, gaps_opened_30d: 0, gaps_closed_30d: 0 }];
      }),
    ]);

    const stats = patientStats[0] ?? { total: 0, active: 0 };
    const gaps = careGapStats[0] ?? { total: 0, open: 0, closed: 0 };
    const critCount = (criticalAlertCount as { count: number }[])[0]?.count ?? 0;

    // Risk stratification — derive high-risk stats
    const riskDist = riskDistribution as { risk_level: string; count: number }[];
    const highRiskCount = riskDist
      .filter((r) => r.risk_level === 'high' || r.risk_level === 'critical')
      .reduce((sum, r) => sum + r.count, 0);
    const highRiskPct = stats.total > 0
      ? Math.round((highRiskCount / stats.total) * 100)
      : 0;

    // Care gap priority breakdown
    const gapPriority = (gapPriorityResult as { high: number; medium: number; low: number }[])[0]
      ?? { high: 0, medium: 0, low: 0 };

    // Encounter count (30-day)
    const encCount = (encounterCountResult as { value: number }[])[0]?.value ?? 0;

    // Trend calculations
    const trends = (trendResult as {
      patients_current: number; patients_prior: number;
      encounters_current: number; encounters_prior: number;
      gaps_opened_30d: number; gaps_closed_30d: number;
    }[])[0] ?? { patients_current: 0, patients_prior: 0, encounters_current: 0, encounters_prior: 0, gaps_opened_30d: 0, gaps_closed_30d: 0 };

    const patientTrend = calcTrend(trends.patients_current, trends.patients_prior);
    const encounterTrend = calcTrend(trends.encounters_current, trends.encounters_prior);
    // Care gap trend: prior_open ≈ current_open + closed_in_30d - opened_in_30d
    const priorOpen = gaps.open + trends.gaps_closed_30d - trends.gaps_opened_30d;
    const careGapTrend = calcTrend(gaps.open, Math.max(priorOpen, 0));

    return reply.send({
      success: true,
      data: {
        stats: {
          total_patients: { value: stats.total, trend: patientTrend },
          active_patients: stats.active,
          care_gaps: { value: gaps.open, trend: careGapTrend },
          risk_score: { high_risk_count: highRiskCount, high_risk_percentage: highRiskPct, trend: 0 },
          encounters: { value: encCount, trend: encounterTrend },
        },
        analytics: {
          care_gap_summary: {
            total: gaps.total,
            by_priority: gapPriority,
          },
          risk_stratification: {
            distribution: riskDist,
          },
          recent_encounters: recentEncounters,
        },
        // ── Clinician data ───────────────────────────────────────────────
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
    });
  });
}
