-- =============================================================================
-- Migration 027: Critical missing patient_id indexes on high-cardinality EDW tables
--
-- Context: phm_edw tables had no patient_id indexes, causing full sequential scans
-- on 28M (encounter), 42M (condition_diagnosis), 72M (medication_order), and
-- 1B (observation) row tables.  Every patient detail page and dashboard query
-- was hitting multi-second to multi-minute scan times.
--
-- NOTE: On the current dev instance these were applied CONCURRENTLY via psql.
-- For fresh installs the migration runner runs inside a transaction (no CONCURRENTLY)
-- which is fine on an empty or small DB.  IF NOT EXISTS makes this idempotent.
-- =============================================================================

-- Encounter: composite (patient_id, datetime) for patient detail,
--            plus separate partial index on datetime for dashboard ORDER BY / LIMIT queries
CREATE INDEX IF NOT EXISTS idx_encounter_patient_datetime
  ON phm_edw.encounter(patient_id, encounter_datetime DESC)
  WHERE active_ind = 'Y';

CREATE INDEX IF NOT EXISTS idx_encounter_datetime_active
  ON phm_edw.encounter(encounter_datetime DESC)
  WHERE active_ind = 'Y';

-- Condition diagnosis: patient lookup (42M rows)
CREATE INDEX IF NOT EXISTS idx_condition_diagnosis_patient
  ON phm_edw.condition_diagnosis(patient_id)
  WHERE active_ind = 'Y';

-- Medication orders: patient lookup (72M rows)
CREATE INDEX IF NOT EXISTS idx_medication_order_patient
  ON phm_edw.medication_order(patient_id)
  WHERE active_ind = 'Y';

-- Patient allergy: patient lookup (~900K rows)
CREATE INDEX IF NOT EXISTS idx_patient_allergy_patient
  ON phm_edw.patient_allergy(patient_id)
  WHERE active_ind = 'Y';

-- Patient insurance coverage: patient lookup
CREATE INDEX IF NOT EXISTS idx_patient_insurance_patient
  ON phm_edw.patient_insurance_coverage(patient_id)
  WHERE active_ind = 'Y';

-- Care gap: composite for patient-scoped status queries
CREATE INDEX IF NOT EXISTS idx_care_gap_patient_status
  ON phm_edw.care_gap(patient_id, gap_status)
  WHERE active_ind = 'Y';

-- Observation (1B rows): composite (patient_id, datetime) for patient detail.
-- On a fresh install this runs inside a transaction (non-concurrent).
-- On a live system, run via scripts/027_observation_index.sql using CONCURRENTLY.
CREATE INDEX IF NOT EXISTS idx_observation_patient_datetime
  ON phm_edw.observation(patient_id, observation_datetime DESC)
  WHERE active_ind = 'Y';
