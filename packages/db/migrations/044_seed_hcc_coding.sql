-- =============================================================================
-- 044: Backfill historical HCC coding (CDS parity Phase 8: D16)
-- note_coded_diagnosis was sparse (Phase-6 test rows only). Simulate prior
-- SuperNote coding for ~60% of each HCC patient's evident conditions so the
-- capture report is realistic and the gap (the recognition story) is visible.
-- Deterministic (rn % 5 < 3 ≈ 60%); one synthetic finalized note per patient.
-- =============================================================================

WITH hcc_patients AS (
  SELECT DISTINCT patient_id
  FROM phm_edw.problem_list
  WHERE active_ind = 'Y' AND problem_status = 'Active'
    AND (icd10_code LIKE 'E11%' OR icd10_code LIKE 'I50%' OR icd10_code LIKE 'N18%'
      OR icd10_code LIKE 'E66%' OR icd10_code LIKE 'I48%')
),
new_notes AS (
  INSERT INTO phm_edw.clinical_note
    (note_id, patient_id, author_user_id, visit_type, status, assessment, finalized_at)
  SELECT gen_random_uuid(), hp.patient_id,
         (SELECT id FROM app_users WHERE email = 'admin@acumenus.net' LIMIT 1),
         'supernote_historical', 'final', 'Historical coding backfill', NOW()
  FROM hcc_patients hp
  RETURNING note_id, patient_id
),
hcc_conditions AS (
  SELECT pl.patient_id, pl.icd10_code, pl.problem_name,
         row_number() OVER (PARTITION BY pl.patient_id ORDER BY pl.problem_id) AS rn
  FROM phm_edw.problem_list pl
  WHERE pl.active_ind = 'Y' AND pl.problem_status = 'Active'
    AND (pl.icd10_code LIKE 'E11%' OR pl.icd10_code LIKE 'I50%' OR pl.icd10_code LIKE 'N18%'
      OR pl.icd10_code LIKE 'E66%' OR pl.icd10_code LIKE 'I48%')
)
INSERT INTO phm_edw.note_coded_diagnosis
  (note_id, patient_id, icd10_code, diagnosis_name, ontology_id, disease_process, hcc_relevant, source)
SELECT nn.note_id, hc.patient_id, hc.icd10_code, hc.problem_name,
       o.ontology_id, o.disease_process, TRUE, 'historical'
FROM hcc_conditions hc
JOIN new_notes nn ON nn.patient_id = hc.patient_id
LEFT JOIN LATERAL (
  SELECT ontology_id, disease_process FROM phm_edw.dx_ontology
  WHERE icd10_code = hc.icd10_code AND active_ind = 'Y' ORDER BY ontology_id LIMIT 1
) o ON TRUE
WHERE hc.rn % 5 < 3;
