-- =====================================================================
-- refresh_star_views.sql
-- Phase 6 Step 27: Refresh phm_star materialized views
--
-- MUST run OUTSIDE a transaction (CONCURRENTLY requires no active tx).
-- Run this immediately after 013_etl_star_v2.sql completes each cycle.
--
-- Usage (psql):
--   psql $DATABASE_URL -f packages/db/scripts/refresh_star_views.sql
--
-- Cron example (8x daily, 15 min after ETL starts):
--   15 */3 * * * psql $DATABASE_URL -f /app/packages/db/scripts/refresh_star_views.sql
-- =====================================================================

-- Refresh order matters: patient_dashboard reads from fact_patient_composite
-- which is populated in Step 23. Bundle compliance reads fact_patient_bundle.
-- Population overview reads fact_population_snapshot. Worklist reads detail.

REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_bundle_compliance_by_provider;
REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_population_overview;
REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_care_gap_worklist;
REFRESH MATERIALIZED VIEW CONCURRENTLY phm_star.mv_patient_dashboard;
