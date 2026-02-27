-- Run this OUTSIDE a transaction (e.g. directly via psql) to build the
-- observation index concurrently on a live system with 1B+ rows.
-- Expected build time: 30-90 minutes depending on hardware.
--
-- psql "postgresql://..." -f packages/db/scripts/027_observation_index_concurrent.sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_observation_patient_datetime
  ON phm_edw.observation(patient_id, observation_datetime DESC)
  WHERE active_ind = 'Y';
