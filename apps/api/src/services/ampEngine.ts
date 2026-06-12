// =============================================================================
// Medgnosis API — Anticipatory Management Program (AMP) engine
// "Memory is not a care plan. Anticipation is." Tier the cohort, build the
// pre-visit/outreach gap worklist, and price the opportunity for the capture-
// rate ROI model. Declined and unable-to-reach are counted dispositions.
// =============================================================================

import { sql } from '@medgnosis/db';

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * AMP tier:
 *  1 = pre-visit (has an upcoming appointment)
 *  2 = established, not seen in 1-2 years
 *  3 = drifting away (not seen in 2+ years, or never seen)
 *  null = recently seen, no upcoming appointment (nothing to anticipate)
 */
export function ampTier(p: { hasUpcomingAppt: boolean; daysSinceLastSeen: number | null }): 1 | 2 | 3 | null {
  if (p.hasUpcomingAppt) return 1;
  if (p.daysSinceLastSeen === null) return 3; // never seen → drifted away
  if (p.daysSinceLastSeen > 730) return 3;
  if (p.daysSinceLastSeen > 365) return 2;
  return null;
}

/** ROI model: total gap net-revenue × capture rate (rate 0..1). Null revenue = 0. */
export function captureRevenue(gaps: { net_revenue: number | null }[], rate: number): number {
  const total = gaps.reduce((sum, g) => sum + (g.net_revenue ?? 0), 0);
  return total * rate;
}

// ─── DB orchestration ────────────────────────────────────────────────────────

export interface AmpSweepResult {
  inserted: number;
  byTier: Record<number, { gaps: number; opportunity: number }>;
}

/**
 * Build the AMP outreach worklist. One INSERT…SELECT (the CASE mirrors ampTier)
 * over the problem-list cohort joined to its open care gaps. Bounded; no
 * observation scans.
 */
export async function runAmpSweep(): Promise<AmpSweepResult> {
  const inserted = await sql<{ outreach_id: number }[]>`
    WITH ls AS (
      SELECT pl.patient_id,
        MAX(a.appointment_date) FILTER (WHERE a.status = 'Completed') AS last_seen,
        bool_or(a.appointment_date >= CURRENT_DATE
                AND a.status IN ('Scheduled', 'Confirmed', 'Checked-In')) AS has_future,
        (array_agg(a.appointment_id ORDER BY a.appointment_date)
          FILTER (WHERE a.appointment_date >= CURRENT_DATE
                  AND a.status IN ('Scheduled', 'Confirmed', 'Checked-In')))[1] AS future_appt_id
      FROM phm_edw.problem_list pl
      LEFT JOIN phm_edw.appointment a ON a.patient_id = pl.patient_id
      WHERE pl.active_ind = 'Y' AND pl.problem_status = 'Active'
      GROUP BY pl.patient_id
    ),
    tiered AS (
      SELECT patient_id, future_appt_id,
        CASE
          WHEN has_future THEN 1
          WHEN last_seen IS NULL THEN 3
          WHEN last_seen < CURRENT_DATE - INTERVAL '2 years' THEN 3
          WHEN last_seen < CURRENT_DATE - INTERVAL '1 year' THEN 2
          ELSE NULL
        END AS tier
      FROM ls
    )
    INSERT INTO phm_edw.amp_outreach
      (patient_id, care_gap_id, amp_tier, appointment_id, disposition, net_revenue)
    SELECT cg.patient_id, cg.care_gap_id, t.tier, t.future_appt_id, 'pending', md.net_revenue
    FROM tiered t
    JOIN phm_edw.care_gap cg ON cg.patient_id = t.patient_id
      AND cg.gap_status IN ('open', 'identified') AND cg.active_ind = 'Y'
    LEFT JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
    WHERE t.tier IS NOT NULL
    ON CONFLICT (patient_id, care_gap_id, amp_tier) DO NOTHING
    RETURNING outreach_id
  `;

  const summary = await sql<{ amp_tier: number; gaps: number; opportunity: number }[]>`
    SELECT amp_tier, COUNT(*)::int AS gaps, COALESCE(SUM(net_revenue), 0)::float AS opportunity
    FROM phm_edw.amp_outreach
    WHERE disposition = 'pending'
    GROUP BY amp_tier
  `;
  const byTier: Record<number, { gaps: number; opportunity: number }> = {};
  for (const r of summary) byTier[r.amp_tier] = { gaps: r.gaps, opportunity: r.opportunity };

  return { inserted: inserted.length, byTier };
}

export interface AmpRoiRow {
  amp_tier: number;
  pending_gaps: number;
  opportunity: number;
}

/** Pending opportunity per tier — the frontend multiplies by the capture rate. */
export async function ampRoi(): Promise<AmpRoiRow[]> {
  return sql<AmpRoiRow[]>`
    SELECT amp_tier,
           COUNT(*)::int AS pending_gaps,
           COALESCE(SUM(net_revenue), 0)::float AS opportunity
    FROM phm_edw.amp_outreach
    WHERE disposition = 'pending'
    GROUP BY amp_tier
    ORDER BY amp_tier
  `;
}
