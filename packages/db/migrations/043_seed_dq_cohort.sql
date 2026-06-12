-- =============================================================================
-- 043: Seed DQ specimens + feed five-tests + sample cohort (Phase 7)
-- Synthea vitals are clean — plant deliberate anomalies (the rogues' gallery).
-- temperature_f is numeric(5,2) (<=999.99), so 212F stands in for the
-- compendium's misplaced-decimal fever. Deterministic.
-- =============================================================================

-- Impossible height (985.32 in) for the 1st vital-sign patient
INSERT INTO phm_edw.vital_sign (patient_id, recorded_datetime, height_in)
SELECT patient_id, NOW(), 985.32
FROM (SELECT DISTINCT patient_id FROM phm_edw.vital_sign WHERE active_ind = 'Y' ORDER BY patient_id LIMIT 1) x;

-- Impossible temperature (212 F) for the 2nd
INSERT INTO phm_edw.vital_sign (patient_id, recorded_datetime, temperature_f)
SELECT patient_id, NOW(), 212.00
FROM (SELECT DISTINCT patient_id FROM phm_edw.vital_sign WHERE active_ind = 'Y' ORDER BY patient_id OFFSET 1 LIMIT 1) x;

-- Impossible weight + jump (1480 lbs) for the 3rd
INSERT INTO phm_edw.vital_sign (patient_id, recorded_datetime, weight_lbs)
SELECT patient_id, NOW(), 1480.00
FROM (SELECT DISTINCT patient_id FROM phm_edw.vital_sign WHERE active_ind = 'Y' ORDER BY patient_id OFFSET 2 LIMIT 1) x;

-- Trailing-space provider display_name (the invisible-character identity bug)
UPDATE phm_edw.provider
SET display_name = display_name || ' '
WHERE provider_id = (SELECT MAX(provider_id) FROM phm_edw.provider);

-- ─── Five-tests per feed + freshness ─────────────────────────────────────────
INSERT INTO phm_edw.dq_feed (feed_name, source, accurate, timely, complete, understood, trusted, latency, last_refreshed, notes) VALUES
  ('Vitals (HL7)',       'eGate interface engine', TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  'real-time', NOW(), 'Streamed; bedside-verifiable'),
  ('Labs (CDIS)',        'CDIS nightly warehouse', TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  'nightly',   NOW() - INTERVAL '8 hours', NULL),
  ('Problem List',       'Clarity / problem_list', TRUE,  TRUE,  FALSE, TRUE,  TRUE,  'nightly',   NOW() - INTERVAL '8 hours', 'Recognition gap: conditions evident in labs but not coded'),
  ('Glucose stream',     'Point-of-care / eGate',  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  'real-time', NOW(), NULL),
  ('Provider directory', 'HR / credentialing',     TRUE,  TRUE,  TRUE,  FALSE, FALSE, 'nightly',   NOW() - INTERVAL '1 day', 'Name mismatches / trailing spaces seen')
ON CONFLICT (feed_name) DO NOTHING;

-- ─── Sample specialist cohort ────────────────────────────────────────────────
INSERT INTO phm_edw.cohort_definition (name, description, criteria, created_by) VALUES
  ('CKD Stage 3-4, GFR-flagged',
   'Nephrology cohort: chronic kidney disease stage 3-4 with a low-GFR flag.',
   '{"conditions":["N18.3","N18.31","N18.32","N18.4"],"flags":["GFR_LOW"]}'::jsonb,
   'system')
ON CONFLICT DO NOTHING;
