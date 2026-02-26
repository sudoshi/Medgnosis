-- =====================================================================
-- 017_demo_care_gaps.sql
-- Phase: Demo Account — Full Care Gap Population (1,288 patients)
-- Generates care_gap records for all applicable bundles using
-- SNOMED condition name matching (Synthea data)
-- Compliance distribution: 25% Closed, 45% Open-recent, 20% Open-overdue, 10% Excluded
-- =====================================================================

-- Build a temporary patient→bundle mapping using SNOMED condition names
CREATE TEMP TABLE IF NOT EXISTS tmp_patient_bundle AS
SELECT DISTINCT
    p.patient_id,
    cb.bundle_id,
    cb.bundle_code
FROM phm_edw.patient p
JOIN phm_edw.condition_diagnosis cd ON cd.patient_id = p.patient_id
JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
JOIN phm_edw.condition_bundle cb ON (
    -- Map bundle codes to SNOMED condition name patterns
    (cb.bundle_code = 'DM'      AND (c.condition_name ILIKE '%diabetes mellitus type 2%' OR c.condition_name ILIKE '%type 2 diabetes%'))
    OR (cb.bundle_code = 'T1D'  AND c.condition_name ILIKE '%diabetes mellitus type 1%')
    OR (cb.bundle_code = 'HTN'  AND c.condition_name ILIKE '%hypertension%')
    OR (cb.bundle_code = 'CAD'  AND (c.condition_name ILIKE '%coronary artery%' OR c.condition_name ILIKE '%ischemic heart%' OR c.condition_name ILIKE '%angina%'))
    OR (cb.bundle_code = 'HF'   AND c.condition_name ILIKE '%heart failure%')
    OR (cb.bundle_code = 'COPD' AND (c.condition_name ILIKE '%copd%' OR c.condition_name ILIKE '%chronic obstructive%'))
    OR (cb.bundle_code = 'ASTH' AND c.condition_name ILIKE '%asthma%')
    OR (cb.bundle_code = 'CKD'  AND (c.condition_name ILIKE '%chronic kidney disease%' OR c.condition_name ILIKE '%kidney failure%'))
    OR (cb.bundle_code = 'AFIB' AND c.condition_name ILIKE '%atrial fibrillation%')
    OR (cb.bundle_code = 'MDD'  AND (c.condition_name ILIKE '%major depress%' OR c.condition_name ILIKE '%depress%'))
    OR (cb.bundle_code = 'GAD'  AND c.condition_name ILIKE '%anxiety%')
    OR (cb.bundle_code = 'OSTEO' AND c.condition_name ILIKE '%osteoporosis%')
    OR (cb.bundle_code = 'OB'   AND (c.condition_name ILIKE '%obesity%' OR c.condition_name ILIKE '%BMI 30%'))
    OR (cb.bundle_code = 'CLD'  AND (c.condition_name ILIKE '%liver disease%' OR c.condition_name ILIKE '%hepatic%' OR c.condition_name ILIKE '%NAFLD%' OR c.condition_name ILIKE '%MASLD%'))
    OR (cb.bundle_code = 'RA'   AND c.condition_name ILIKE '%rheumatoid arthritis%')
    OR (cb.bundle_code = 'PAD'  AND c.condition_name ILIKE '%peripheral artery%')
    OR (cb.bundle_code = 'HYPO' AND c.condition_name ILIKE '%hypothyroid%')
    OR (cb.bundle_code = 'ALZ'  AND (c.condition_name ILIKE '%alzheimer%' OR c.condition_name ILIKE '%dementia%'))
    OR (cb.bundle_code = 'STR'  AND (c.condition_name ILIKE '%stroke%' OR c.condition_name ILIKE '%cerebrovascular%'))
    OR (cb.bundle_code = 'PAIN' AND c.condition_name ILIKE '%chronic pain%')
    OR (cb.bundle_code = 'OA'   AND c.condition_name ILIKE '%osteoarthritis%')
    OR (cb.bundle_code = 'GERD' AND c.condition_name ILIKE '%reflux%')
    OR (cb.bundle_code = 'BPH'  AND c.condition_name ILIKE '%prostatic hyperplasia%')
    OR (cb.bundle_code = 'MIG'  AND c.condition_name ILIKE '%migraine%')
    OR (cb.bundle_code = 'EPI'  AND c.condition_name ILIKE '%epilepsy%')
    OR (cb.bundle_code = 'HIV'  AND c.condition_name ILIKE '%HIV%')
    OR (cb.bundle_code = 'HCV'  AND c.condition_name ILIKE '%hepatitis C%')
    OR (cb.bundle_code = 'HBV'  AND c.condition_name ILIKE '%hepatitis B%')
    OR (cb.bundle_code = 'SCD'  AND c.condition_name ILIKE '%sickle cell%')
    OR (cb.bundle_code = 'SLE'  AND c.condition_name ILIKE '%lupus%')
    OR (cb.bundle_code = 'GOUT' AND c.condition_name ILIKE '%gout%')
    OR (cb.bundle_code = 'OSA'  AND c.condition_name ILIKE '%sleep apnea%')
    OR (cb.bundle_code = 'TOB'  AND (c.condition_name ILIKE '%tobacco%' OR c.condition_name ILIKE '%nicotine%' OR c.condition_name ILIKE '%smoking%'))
    OR (cb.bundle_code = 'AUD'  AND c.condition_name ILIKE '%alcohol%')
    OR (cb.bundle_code = 'PTSD' AND c.condition_name ILIKE '%post-traumatic%')
    OR (cb.bundle_code = 'BP'   AND c.condition_name ILIKE '%bipolar%')
    OR (cb.bundle_code = 'VTE'  AND c.condition_name ILIKE '%thromboembolism%')
    OR (cb.bundle_code = 'ANEM' AND c.condition_name ILIKE '%anemia%')
    OR (cb.bundle_code = 'IBD'  AND (c.condition_name ILIKE '%crohn%' OR c.condition_name ILIKE '%colitis%'))
    OR (cb.bundle_code = 'MS'   AND c.condition_name ILIKE '%multiple sclerosis%')
    OR (cb.bundle_code = 'PD'   AND c.condition_name ILIKE '%parkinson%')
    OR (cb.bundle_code = 'PSO'  AND c.condition_name ILIKE '%psoriasis%')
    OR (cb.bundle_code = 'PAH'  AND c.condition_name ILIKE '%pulmonary arterial hypertension%')
    OR (cb.bundle_code = 'WND'  AND c.condition_name ILIKE '%wound%')
    OR (cb.bundle_code = 'LIPID' AND (c.condition_name ILIKE '%hyperlipidemia%' OR c.condition_name ILIKE '%dyslipidemia%' OR c.condition_name ILIKE '%hypercholesterolemia%'))
)
WHERE p.pcp_provider_id = 2816
  AND p.active_ind = 'Y'
  AND cb.active_ind = 'Y';

-- ─────────────────────────────────────────────────────────────────────
-- Delete stale auto-generated care gaps for these patients, keep any
-- that were manually created (identified_date IS NULL = auto)
-- ─────────────────────────────────────────────────────────────────────
DELETE FROM phm_edw.care_gap
WHERE patient_id IN (SELECT patient_id FROM phm_edw.patient WHERE pcp_provider_id = 2816);

-- ─────────────────────────────────────────────────────────────────────
-- Insert care gaps for all patient × bundle × measure combinations
-- Compliance distribution driven by patient_id % arithmetic
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.care_gap
    (patient_id, measure_id, bundle_id, gap_status, identified_date, resolved_date,
     comments, active_ind)
SELECT
    tpb.patient_id,
    bm.measure_id,
    tpb.bundle_id,
    -- Compliance tier assignment per patient (stable via patient_id hash):
    -- Gap status: 25% closed, 45% open-recent, 20% open-overdue, 10% excluded
    CASE
        -- Use (patient_id * 31 + measure_id * 17) % 100 for per-measure variation
        WHEN ((tpb.patient_id * 31 + bm.measure_id * 17) % 100) < 10  THEN 'excluded'
        WHEN ((tpb.patient_id * 31 + bm.measure_id * 17) % 100) < 35  THEN 'closed'
        ELSE 'open'
    END,
    -- identified_date: 6–18 months ago for overdue, 1–3 months ago for recent
    CASE
        WHEN ((tpb.patient_id * 31 + bm.measure_id * 17) % 100) < 35 OR
             ((tpb.patient_id * 31 + bm.measure_id * 17) % 100) < 10
        THEN CURRENT_DATE - (INTERVAL '1 day' * (30 + (tpb.patient_id * 7 + bm.measure_id) % 60))
        WHEN ((tpb.patient_id * 31 + bm.measure_id * 17) % 100) < 55
        THEN CURRENT_DATE - (INTERVAL '1 day' * (180 + (tpb.patient_id * 7 + bm.measure_id) % 180))
        ELSE CURRENT_DATE - (INTERVAL '1 day' * (7  + (tpb.patient_id * 3 + bm.measure_id) % 80))
    END,
    -- resolved_date: only for Closed gaps
    CASE
        WHEN ((tpb.patient_id * 31 + bm.measure_id * 17) % 100) BETWEEN 10 AND 34
        THEN CURRENT_DATE - (INTERVAL '1 day' * ((tpb.patient_id * 3 + bm.measure_id) % 45))
        ELSE NULL
    END,
    CASE
        WHEN ((tpb.patient_id * 31 + bm.measure_id * 17) % 100) < 10  THEN 'Patient meets exclusion criteria'
        WHEN ((tpb.patient_id * 31 + bm.measure_id * 17) % 100) < 35  THEN 'Measure satisfied — gap closed'
        WHEN ((tpb.patient_id * 31 + bm.measure_id * 17) % 100) < 55  THEN 'Overdue — action required'
        ELSE 'Gap recently identified — schedule action'
    END,
    'Y'
FROM tmp_patient_bundle tpb
JOIN phm_edw.bundle_measure bm ON bm.bundle_id = tpb.bundle_id
ON CONFLICT DO NOTHING;

DROP TABLE IF EXISTS tmp_patient_bundle;

-- Validate
DO $$
DECLARE v_cnt INT; v_closed INT; v_open INT; v_excl INT;
BEGIN
    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE gap_status = 'closed'),
           COUNT(*) FILTER (WHERE gap_status = 'open'),
           COUNT(*) FILTER (WHERE gap_status = 'excluded')
    INTO v_cnt, v_closed, v_open, v_excl
    FROM phm_edw.care_gap cg
    JOIN phm_edw.patient p ON cg.patient_id = p.patient_id
    WHERE p.pcp_provider_id = 2816;

    RAISE NOTICE 'Care gaps — total: %, closed: %, open: %, excluded: %',
        v_cnt, v_closed, v_open, v_excl;
    RAISE NOTICE 'Closed %%: %', ROUND(100.0 * v_closed / NULLIF(v_cnt, 0), 1);
END $$;
