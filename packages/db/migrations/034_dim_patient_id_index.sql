-- =============================================================================
-- 034: Index dim_patient(patient_id) (CDS parity Phase 2 — finder performance)
-- dim_patient (~1M rows) had only a PK on patient_key, so patient_id lookups
-- seq-scanned 1M rows. The population finder maps patient_id -> patient_key to
-- reach fact_observation's code-filtered (patient_key, observation_code) index;
-- without this, the per-patient eGFR lookup is pathological. Cheap to build.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_dim_patient_patient_id
  ON phm_star.dim_patient (patient_id);
