-- =============================================================================
-- Migration 026: Backfill care gap priority and due date
-- Deterministically assigns gap_priority (high/medium/low) and due_date
-- to care gaps that are missing these values.
-- =============================================================================

UPDATE phm_edw.care_gap
SET
  gap_priority = CASE
    WHEN ((patient_id * 31 + measure_id * 17) % 100) < 15 THEN 'high'
    WHEN ((patient_id * 31 + measure_id * 17) % 100) < 50 THEN 'medium'
    ELSE 'low'
  END,
  due_date = CASE
    WHEN gap_status = 'open'
      THEN CURRENT_DATE + (INTERVAL '1 day' * (7 + (patient_id * 3 + measure_id) % 90))
    ELSE NULL
  END
WHERE gap_priority IS NULL AND active_ind = 'Y';
