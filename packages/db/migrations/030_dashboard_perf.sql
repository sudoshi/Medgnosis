-- =====================================================================
-- Migration 030: Dashboard Performance Optimization
-- 1. Composite index on encounter for date-range + patient_id queries
-- 2. Materialized view for pre-aggregated dashboard stats per provider
-- =====================================================================

-- ---------------------------------------------------------------------------
-- 1. Encounter composite index (partial, active-only)
--    Eliminates 750ms seq scans on 28M rows for date-range queries
-- ---------------------------------------------------------------------------

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_encounter_active_datetime_patient
  ON phm_edw.encounter (encounter_datetime, patient_id)
  WHERE active_ind = 'Y';

-- Also add a provider-scoped patient index for fast panel lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_pcp_active
  ON phm_edw.patient (pcp_provider_id)
  WHERE active_ind = 'Y';

-- Care gap join acceleration (provider-scoped dashboards)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_care_gap_patient_status
  ON phm_edw.care_gap (patient_id, gap_status)
  WHERE active_ind = 'Y';

-- ---------------------------------------------------------------------------
-- 2. Materialized view: mv_dashboard_stats
--    One row per provider (+ one NULL row for admin/full-population)
--    Replaces 10 parallel queries with a single row lookup
-- ---------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS phm_star.mv_dashboard_stats;

CREATE MATERIALIZED VIEW phm_star.mv_dashboard_stats AS
WITH provider_patients AS (
  -- All active patients grouped by their PCP
  SELECT
    p.pcp_provider_id AS provider_id,
    p.patient_id
  FROM phm_edw.patient p
  WHERE p.active_ind = 'Y'
),
patient_stats AS (
  SELECT
    pp.provider_id,
    COUNT(*)::int AS total_patients,
    COUNT(*)::int AS active_patients
  FROM provider_patients pp
  GROUP BY pp.provider_id
),
-- Admin row: full population
admin_patient_stats AS (
  SELECT
    NULL::int AS provider_id,
    COUNT(*)::int AS total_patients,
    COUNT(*)::int AS active_patients
  FROM phm_edw.patient
  WHERE active_ind = 'Y'
),
care_gap_stats AS (
  SELECT
    p.pcp_provider_id AS provider_id,
    COUNT(*)::int AS gaps_total,
    COUNT(*) FILTER (WHERE cg.gap_status = 'open')::int AS gaps_open,
    COUNT(*) FILTER (WHERE cg.gap_status = 'closed')::int AS gaps_closed,
    COUNT(*) FILTER (WHERE cg.gap_status = 'open' AND cg.gap_priority = 'high')::int AS gaps_priority_high,
    COUNT(*) FILTER (WHERE cg.gap_status = 'open' AND cg.gap_priority = 'medium')::int AS gaps_priority_medium,
    COUNT(*) FILTER (WHERE cg.gap_status = 'open' AND cg.gap_priority = 'low')::int AS gaps_priority_low,
    COUNT(*) FILTER (WHERE cg.identified_date >= NOW() - INTERVAL '30 days')::int AS gaps_opened_30d,
    COUNT(*) FILTER (WHERE cg.gap_status = 'closed' AND cg.resolved_date >= NOW() - INTERVAL '30 days')::int AS gaps_closed_30d
  FROM phm_edw.care_gap cg
  JOIN phm_edw.patient p ON p.patient_id = cg.patient_id AND p.active_ind = 'Y'
  WHERE cg.active_ind = 'Y'
  GROUP BY p.pcp_provider_id
),
admin_care_gap_stats AS (
  SELECT
    NULL::int AS provider_id,
    COUNT(*)::int AS gaps_total,
    COUNT(*) FILTER (WHERE cg.gap_status = 'open')::int AS gaps_open,
    COUNT(*) FILTER (WHERE cg.gap_status = 'closed')::int AS gaps_closed,
    COUNT(*) FILTER (WHERE cg.gap_status = 'open' AND cg.gap_priority = 'high')::int AS gaps_priority_high,
    COUNT(*) FILTER (WHERE cg.gap_status = 'open' AND cg.gap_priority = 'medium')::int AS gaps_priority_medium,
    COUNT(*) FILTER (WHERE cg.gap_status = 'open' AND cg.gap_priority = 'low')::int AS gaps_priority_low,
    COUNT(*) FILTER (WHERE cg.identified_date >= NOW() - INTERVAL '30 days')::int AS gaps_opened_30d,
    COUNT(*) FILTER (WHERE cg.gap_status = 'closed' AND cg.resolved_date >= NOW() - INTERVAL '30 days')::int AS gaps_closed_30d
  FROM phm_edw.care_gap cg
  WHERE cg.active_ind = 'Y'
),
encounter_stats AS (
  SELECT
    p.pcp_provider_id AS provider_id,
    COUNT(*) FILTER (WHERE e.encounter_datetime >= NOW() - INTERVAL '30 days')::int AS encounters_30d,
    COUNT(*) FILTER (WHERE e.encounter_datetime >= NOW() - INTERVAL '60 days'
                       AND e.encounter_datetime < NOW() - INTERVAL '30 days')::int AS encounters_prior_30d
  FROM phm_edw.encounter e
  JOIN phm_edw.patient p ON p.patient_id = e.patient_id AND p.active_ind = 'Y'
  WHERE e.active_ind = 'Y'
    AND e.encounter_datetime >= NOW() - INTERVAL '60 days'
  GROUP BY p.pcp_provider_id
),
admin_encounter_stats AS (
  SELECT
    NULL::int AS provider_id,
    COUNT(*) FILTER (WHERE e.encounter_datetime >= NOW() - INTERVAL '30 days')::int AS encounters_30d,
    COUNT(*) FILTER (WHERE e.encounter_datetime >= NOW() - INTERVAL '60 days'
                       AND e.encounter_datetime < NOW() - INTERVAL '30 days')::int AS encounters_prior_30d
  FROM phm_edw.encounter e
  WHERE e.active_ind = 'Y'
    AND e.encounter_datetime >= NOW() - INTERVAL '60 days'
),
patient_trends AS (
  SELECT
    p.pcp_provider_id AS provider_id,
    COUNT(*) FILTER (WHERE p.created_date >= NOW() - INTERVAL '30 days')::int AS patients_new_30d,
    COUNT(*) FILTER (WHERE p.created_date >= NOW() - INTERVAL '60 days'
                       AND p.created_date < NOW() - INTERVAL '30 days')::int AS patients_prior_30d
  FROM phm_edw.patient p
  WHERE p.active_ind = 'Y'
  GROUP BY p.pcp_provider_id
),
admin_patient_trends AS (
  SELECT
    NULL::int AS provider_id,
    COUNT(*) FILTER (WHERE p.created_date >= NOW() - INTERVAL '30 days')::int AS patients_new_30d,
    COUNT(*) FILTER (WHERE p.created_date >= NOW() - INTERVAL '60 days'
                       AND p.created_date < NOW() - INTERVAL '30 days')::int AS patients_prior_30d
  FROM phm_edw.patient p
  WHERE p.active_ind = 'Y'
),
risk_stats AS (
  SELECT
    dp.provider_id,
    COUNT(*) FILTER (WHERE fpc.risk_tier = 'critical')::int AS risk_critical,
    COUNT(*) FILTER (WHERE fpc.risk_tier = 'high')::int AS risk_high,
    COUNT(*) FILTER (WHERE fpc.risk_tier = 'moderate')::int AS risk_moderate,
    COUNT(*) FILTER (WHERE fpc.risk_tier = 'low')::int AS risk_low
  FROM phm_star.fact_patient_composite fpc
  JOIN phm_star.dim_provider dp ON dp.provider_key = fpc.provider_key
  WHERE fpc.risk_tier IS NOT NULL
  GROUP BY dp.provider_id
),
admin_risk_stats AS (
  SELECT
    NULL::int AS provider_id,
    COUNT(*) FILTER (WHERE fpc.risk_tier = 'critical')::int AS risk_critical,
    COUNT(*) FILTER (WHERE fpc.risk_tier = 'high')::int AS risk_high,
    COUNT(*) FILTER (WHERE fpc.risk_tier = 'moderate')::int AS risk_moderate,
    COUNT(*) FILTER (WHERE fpc.risk_tier = 'low')::int AS risk_low
  FROM phm_star.fact_patient_composite fpc
  WHERE fpc.risk_tier IS NOT NULL
),
-- Combine all provider rows
all_providers AS (
  SELECT DISTINCT pcp_provider_id AS provider_id
  FROM phm_edw.patient
  WHERE active_ind = 'Y' AND pcp_provider_id IS NOT NULL
)
-- Provider rows
SELECT
  ap.provider_id,
  COALESCE(ps.total_patients, 0) AS total_patients,
  COALESCE(ps.active_patients, 0) AS active_patients,
  COALESCE(cg.gaps_total, 0) AS gaps_total,
  COALESCE(cg.gaps_open, 0) AS gaps_open,
  COALESCE(cg.gaps_closed, 0) AS gaps_closed,
  COALESCE(cg.gaps_priority_high, 0) AS gaps_priority_high,
  COALESCE(cg.gaps_priority_medium, 0) AS gaps_priority_medium,
  COALESCE(cg.gaps_priority_low, 0) AS gaps_priority_low,
  COALESCE(cg.gaps_opened_30d, 0) AS gaps_opened_30d,
  COALESCE(cg.gaps_closed_30d, 0) AS gaps_closed_30d,
  COALESCE(es.encounters_30d, 0) AS encounters_30d,
  COALESCE(es.encounters_prior_30d, 0) AS encounters_prior_30d,
  COALESCE(pt.patients_new_30d, 0) AS patients_new_30d,
  COALESCE(pt.patients_prior_30d, 0) AS patients_prior_30d,
  COALESCE(rs.risk_critical, 0) AS risk_critical,
  COALESCE(rs.risk_high, 0) AS risk_high,
  COALESCE(rs.risk_moderate, 0) AS risk_moderate,
  COALESCE(rs.risk_low, 0) AS risk_low,
  NOW() AS refreshed_at
FROM all_providers ap
LEFT JOIN patient_stats ps ON ps.provider_id = ap.provider_id
LEFT JOIN care_gap_stats cg ON cg.provider_id = ap.provider_id
LEFT JOIN encounter_stats es ON es.provider_id = ap.provider_id
LEFT JOIN patient_trends pt ON pt.provider_id = ap.provider_id
LEFT JOIN risk_stats rs ON rs.provider_id = ap.provider_id

UNION ALL

-- Admin (full-population) row: provider_id IS NULL
SELECT
  NULL::int AS provider_id,
  COALESCE(aps.total_patients, 0),
  COALESCE(aps.active_patients, 0),
  COALESCE(acg.gaps_total, 0),
  COALESCE(acg.gaps_open, 0),
  COALESCE(acg.gaps_closed, 0),
  COALESCE(acg.gaps_priority_high, 0),
  COALESCE(acg.gaps_priority_medium, 0),
  COALESCE(acg.gaps_priority_low, 0),
  COALESCE(acg.gaps_opened_30d, 0),
  COALESCE(acg.gaps_closed_30d, 0),
  COALESCE(aes.encounters_30d, 0),
  COALESCE(aes.encounters_prior_30d, 0),
  COALESCE(apt.patients_new_30d, 0),
  COALESCE(apt.patients_prior_30d, 0),
  COALESCE(ars.risk_critical, 0),
  COALESCE(ars.risk_high, 0),
  COALESCE(ars.risk_moderate, 0),
  COALESCE(ars.risk_low, 0),
  NOW()
FROM admin_patient_stats aps
CROSS JOIN admin_care_gap_stats acg
CROSS JOIN admin_encounter_stats aes
CROSS JOIN admin_patient_trends apt
CROSS JOIN admin_risk_stats ars
;

-- Unique index required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX uq_mv_dashboard_stats_provider
  ON phm_star.mv_dashboard_stats (provider_id);

-- Lookup index
CREATE INDEX idx_mv_dashboard_stats_provider
  ON phm_star.mv_dashboard_stats (provider_id)
  WHERE provider_id IS NOT NULL;

-- Register migration
INSERT INTO public._migrations (name, applied_at)
VALUES ('030_dashboard_perf.sql', NOW())
ON CONFLICT DO NOTHING;
