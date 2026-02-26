-- =====================================================================
-- refresh_star_views.sql
-- Refresh ALL phm_star materialized views
--
-- MUST run OUTSIDE a transaction (CONCURRENTLY requires no active tx).
-- Run this after ETL migrations complete.
--
-- Usage (psql):
--   psql $DATABASE_URL -f packages/db/scripts/refresh_star_views.sql
-- =====================================================================

-- Refresh order: independent views first, dashboard last (reads fact_patient_composite)

REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_population_by_condition;
REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_provider_scorecard;
REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_patient_risk_tier;
REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_bundle_compliance_by_provider;
REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_population_overview;
REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_care_gap_worklist;
REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_patient_dashboard;
