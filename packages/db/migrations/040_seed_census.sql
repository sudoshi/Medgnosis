-- =============================================================================
-- 040: Seed synthetic inpatient census (CDS parity Phase 5: D12/D13/D14)
-- Real DM/HF patients, simulated admission + one initial reading each.
-- Deterministic (no random — the streamer adds live variation at runtime).
-- A few intentionally deteriorating cases so the census shows action.
-- =============================================================================

-- ~30 admissions across three units
INSERT INTO phm_rt.admission (patient_id, unit, bed, admitting_dx)
SELECT c.patient_id,
  (ARRAY['HFAM8', 'SCU5', 'MED3'])[1 + (c.rn % 3)],
  'B' || (1 + (c.rn % 20))::text,
  c.dx
FROM (
  SELECT pl.patient_id,
    row_number() OVER (ORDER BY pl.patient_id) AS rn,
    CASE
      WHEN bool_or(pl.icd10_code LIKE 'I50%') THEN 'Acute heart failure exacerbation'
      WHEN bool_or(pl.icd10_code LIKE 'E11%') THEN 'Diabetes with hyperglycemia'
      ELSE 'General medical'
    END AS dx
  FROM phm_edw.problem_list pl
  WHERE pl.active_ind = 'Y' AND pl.problem_status = 'Active'
    AND (pl.icd10_code LIKE 'E11%' OR pl.icd10_code LIKE 'I50%')
  GROUP BY pl.patient_id
  ORDER BY pl.patient_id
  LIMIT 30
) c;

-- One initial vital reading per admission. admission_id 1 = MEWS-positive
-- (SBP 95 / HR 118 / RR 22), admission_id 2 = hypoxic + on oxygen.
INSERT INTO phm_rt.vital_stream
  (admission_id, patient_id, temp_c, heart_rate, systolic_bp, resp_rate, spo2, on_oxygen, consciousness, gcs)
SELECT a.admission_id, a.patient_id,
  36.5 + (a.admission_id % 3) * 0.3,
  CASE WHEN a.admission_id = 1 THEN 118 ELSE 70 + (a.admission_id % 5) * 4 END,
  CASE WHEN a.admission_id = 1 THEN 95 WHEN a.admission_id = 3 THEN 100 ELSE 118 + (a.admission_id % 4) * 5 END,
  CASE WHEN a.admission_id = 1 THEN 22 ELSE 16 + (a.admission_id % 3) END,
  CASE WHEN a.admission_id = 2 THEN 93 ELSE 97 END,
  (a.admission_id = 2),
  'A', 15
FROM phm_rt.admission a;

-- One glucose reading per admission. admission_id 2 = severe excursion (320).
INSERT INTO phm_rt.glucose_stream (admission_id, patient_id, glucose_mgdl, source)
SELECT a.admission_id, a.patient_id,
  CASE WHEN a.admission_id = 2 THEN 320 WHEN a.admission_id = 4 THEN 240 ELSE 110 + (a.admission_id % 6) * 15 END,
  'fingerstick'
FROM phm_rt.admission a;

-- One insulin administration per admission.
INSERT INTO phm_rt.insulin_admin (admission_id, patient_id, dose_units, product)
SELECT a.admission_id, a.patient_id,
  6 + (a.admission_id % 4) * 2,
  'Insulin Lispro 100 UNT/ML Injectable Solution [Humalog]'
FROM phm_rt.admission a;
