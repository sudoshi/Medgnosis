-- =====================================================================
-- 011_seed_star_bundles.sql
-- Phase 6: Seed phm_star bundle dimensions from phm_edw reference data
--
-- Populates:
--   phm_star.dim_care_gap_bundle   — 45 disease bundles (from condition_bundle)
--   phm_star.bridge_bundle_measure — ~350 bundle-measure links (from bundle_measure)
--
-- Requires:
--   010_star_schema_v2.sql (tables created)
--   007/008/009_seed_bundles_v*.sql (EDW source data seeded)
--   phm_star.dim_measure must be populated (ETL Step 9 must have run at least once)
--
-- Notes:
--   - disease_category is hard-coded here (not present in phm_edw.condition_bundle)
--   - is_shared_measure is set by detecting measures appearing in > 1 bundle
--   - dedup_domain is mapped from phm_edw.bundle_overlap_rule where available
-- =====================================================================

-- Runs inside migration runner's transaction — no BEGIN/COMMIT needed here.

-- =====================================================================
-- STEP 1: Load dim_care_gap_bundle from phm_edw.condition_bundle
-- Adds disease_category via CASE on bundle_code
-- =====================================================================

TRUNCATE phm_star.dim_care_gap_bundle RESTART IDENTITY CASCADE;

INSERT INTO phm_star.dim_care_gap_bundle (
    bundle_code,
    bundle_name,
    disease_category,
    icd10_codes,
    bundle_size,
    total_diseases,
    is_active,
    created_at,
    updated_at
)
SELECT
    cb.bundle_code,
    cb.condition_name                           AS bundle_name,
    CASE cb.bundle_code
        -- Endocrine
        WHEN 'DM'      THEN 'Endocrine'
        WHEN 'T1D'     THEN 'Endocrine'
        WHEN 'OBESITY' THEN 'Endocrine'
        WHEN 'HYPO'    THEN 'Endocrine'
        -- Cardiovascular
        WHEN 'HTN'     THEN 'Cardiovascular'
        WHEN 'CAD'     THEN 'Cardiovascular'
        WHEN 'HF'      THEN 'Cardiovascular'
        WHEN 'AFIB'    THEN 'Cardiovascular'
        WHEN 'PAD'     THEN 'Cardiovascular'
        WHEN 'PAH'     THEN 'Cardiovascular'
        WHEN 'HLD'     THEN 'Cardiovascular'
        WHEN 'VTE'     THEN 'Cardiovascular'
        -- Respiratory
        WHEN 'COPD'    THEN 'Respiratory'
        WHEN 'ASTHMA'  THEN 'Respiratory'
        WHEN 'OSA'     THEN 'Respiratory'
        -- Renal
        WHEN 'CKD'     THEN 'Renal'
        -- Hepatic
        WHEN 'NAFLD'   THEN 'Hepatic'
        -- Behavioral Health
        WHEN 'MDD'     THEN 'Behavioral Health'
        WHEN 'GAD'     THEN 'Behavioral Health'
        WHEN 'PTSD'    THEN 'Behavioral Health'
        WHEN 'BIPOLAR' THEN 'Behavioral Health'
        -- Musculoskeletal
        WHEN 'OSTEO'   THEN 'Musculoskeletal'
        WHEN 'RA'      THEN 'Musculoskeletal'
        WHEN 'OA'      THEN 'Musculoskeletal'
        WHEN 'GOUT'    THEN 'Musculoskeletal'
        -- Neurological
        WHEN 'ALZ'     THEN 'Neurological'
        WHEN 'STROKE'  THEN 'Neurological'
        WHEN 'MIGRAINE'THEN 'Neurological'
        WHEN 'EPILEPSY'THEN 'Neurological'
        WHEN 'MS'      THEN 'Neurological'
        WHEN 'PARK'    THEN 'Neurological'
        -- Gastrointestinal
        WHEN 'GERD'    THEN 'Gastrointestinal'
        WHEN 'IBD'     THEN 'Gastrointestinal'
        -- Urological
        WHEN 'BPH'     THEN 'Urological'
        -- Infectious Disease
        WHEN 'HIV'     THEN 'Infectious Disease'
        WHEN 'HCV'     THEN 'Infectious Disease'
        WHEN 'HBV'     THEN 'Infectious Disease'
        -- Hematological
        WHEN 'SCD'     THEN 'Hematological'
        WHEN 'ANEMIA'  THEN 'Hematological'
        -- Autoimmune
        WHEN 'SLE'     THEN 'Autoimmune'
        -- Dermatological
        WHEN 'PSO'     THEN 'Dermatological'
        WHEN 'WOUNDS'  THEN 'Dermatological'
        -- Substance Use / Pain
        WHEN 'PAIN'    THEN 'Pain/Substance Use'
        WHEN 'TOBACCO' THEN 'Substance Use'
        WHEN 'AUD'     THEN 'Substance Use'
        ELSE 'Other'
    END                                          AS disease_category,
    cb.icd10_pattern                             AS icd10_codes,
    cb.bundle_size::SMALLINT,
    45::SMALLINT                                 AS total_diseases,
    (cb.active_ind = 'Y')                        AS is_active,
    NOW(),
    NOW()
FROM phm_edw.condition_bundle cb
ORDER BY cb.bundle_id;

DO $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM phm_star.dim_care_gap_bundle;
    RAISE NOTICE 'dim_care_gap_bundle loaded: % rows', v_count;
    IF v_count < 45 THEN
        RAISE WARNING 'Expected 45 bundles, got %. Ensure 007/008/009 seed migrations ran.', v_count;
    END IF;
END;
$$;


-- =====================================================================
-- STEP 2: Load bridge_bundle_measure
-- Maps EDW bundle_measure rows to star dimension keys
-- Requires phm_star.dim_measure to be populated (ETL must have run)
-- =====================================================================

TRUNCATE phm_star.bridge_bundle_measure RESTART IDENTITY;

INSERT INTO phm_star.bridge_bundle_measure (
    bundle_key,
    measure_key,
    measure_sequence,
    frequency,
    is_shared_measure,
    dedup_domain
)
SELECT
    dcgb.bundle_key,
    dm.measure_key,
    bm.ordinal                       AS measure_sequence,
    bm.frequency,
    FALSE                            AS is_shared_measure,   -- Updated in Step 3
    NULL                             AS dedup_domain         -- Updated in Step 4
FROM phm_edw.bundle_measure bm
JOIN phm_edw.condition_bundle cb
    ON cb.bundle_id = bm.bundle_id
    AND cb.active_ind = 'Y'
JOIN phm_star.dim_care_gap_bundle dcgb
    ON dcgb.bundle_code = cb.bundle_code
JOIN phm_edw.measure_definition md
    ON md.measure_id = bm.measure_id
    AND md.active_ind = 'Y'
JOIN phm_star.dim_measure dm
    ON dm.measure_code = md.measure_code
WHERE bm.active_ind = 'Y'
ON CONFLICT (bundle_key, measure_key) DO UPDATE
    SET measure_sequence = EXCLUDED.measure_sequence,
        frequency        = EXCLUDED.frequency;

DO $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM phm_star.bridge_bundle_measure;
    RAISE NOTICE 'bridge_bundle_measure loaded: % rows', v_count;
    IF v_count < 300 THEN
        RAISE WARNING 'Expected ~350 bridge rows, got %. Check dim_measure population.', v_count;
    END IF;
END;
$$;


-- =====================================================================
-- STEP 3: Mark shared measures (appear in > 1 bundle)
-- =====================================================================

UPDATE phm_star.bridge_bundle_measure bbm
SET is_shared_measure = TRUE
FROM (
    SELECT measure_key
    FROM phm_star.bridge_bundle_measure
    GROUP BY measure_key
    HAVING COUNT(DISTINCT bundle_key) > 1
) shared
WHERE bbm.measure_key = shared.measure_key;

DO $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM phm_star.bridge_bundle_measure WHERE is_shared_measure = TRUE;
    RAISE NOTICE 'Shared measures marked: % bridge rows', v_count;
END;
$$;


-- =====================================================================
-- STEP 4: Set dedup_domain from phm_edw.bundle_overlap_rule
-- Matches canonical_measure_code to dim_measure to find the bridge rows
-- =====================================================================

UPDATE phm_star.bridge_bundle_measure bbm
SET dedup_domain = bor.shared_domain
FROM phm_edw.bundle_overlap_rule bor
JOIN phm_star.dim_measure dm
    ON dm.measure_code = bor.canonical_measure_code
WHERE dm.measure_key = bbm.measure_key
  AND bor.active_ind = 'Y'
  AND bbm.is_shared_measure = TRUE;

-- Fallback: set dedup_domain for shared measures not covered by overlap rules
-- Use measure_name pattern matching for the 19 known deduplication domains
UPDATE phm_star.bridge_bundle_measure bbm
SET dedup_domain = CASE
    WHEN dm.measure_name ILIKE '%blood pressure%'           THEN 'Blood Pressure Control'
    WHEN dm.measure_name ILIKE '%statin%'
      OR dm.measure_name ILIKE '%lipid%'                    THEN 'Statin/Lipid Therapy'
    WHEN dm.measure_name ILIKE '%a1c%'
      OR dm.measure_name ILIKE '%hba1c%'
      OR dm.measure_name ILIKE '%glyc%'                     THEN 'A1C Monitoring'
    WHEN dm.measure_name ILIKE '%bmi%'
      OR dm.measure_name ILIKE '%body mass%'
      OR dm.measure_name ILIKE '%weight%counsel%'           THEN 'BMI Assessment'
    WHEN dm.measure_name ILIKE '%depression%'
      OR dm.measure_name ILIKE '%phq%'                      THEN 'Depression Screening (PHQ-9)'
    WHEN dm.measure_name ILIKE '%tobacco%'
      OR dm.measure_name ILIKE '%smoking%'
      OR dm.measure_name ILIKE '%cessation%'                THEN 'Tobacco Cessation'
    WHEN dm.measure_name ILIKE '%fall%'                     THEN 'Fall Risk Assessment'
    WHEN dm.measure_name ILIKE '%egfr%'
      OR dm.measure_name ILIKE '%creatinine%'
      OR dm.measure_name ILIKE '%renal function%'
      OR dm.measure_name ILIKE '%kidney%'                   THEN 'Renal Function (eGFR/Cr)'
    WHEN dm.measure_name ILIKE '%liver%'
      OR dm.measure_name ILIKE '%hepatic%'
      OR dm.measure_name ILIKE '%lft%'
      OR dm.measure_name ILIKE '%alt%'
      OR dm.measure_name ILIKE '%ast%'                      THEN 'Hepatic Function (LFTs)'
    WHEN dm.measure_name ILIKE '%cbc%'
      OR dm.measure_name ILIKE '%hemoglobin%'
      OR dm.measure_name ILIKE '%hematol%'                  THEN 'CBC/Hematology'
    WHEN dm.measure_name ILIKE '%thyroid%'
      OR dm.measure_name ILIKE '%tsh%'                      THEN 'Thyroid Function'
    WHEN dm.measure_name ILIKE '%bone density%'
      OR dm.measure_name ILIKE '%dexa%'
      OR dm.measure_name ILIKE '%osteoporos%'               THEN 'Bone Density (DEXA)'
    WHEN dm.measure_name ILIKE '%influenza%'
      OR dm.measure_name ILIKE '%pneumo%'
      OR dm.measure_name ILIKE '%immuniz%'
      OR dm.measure_name ILIKE '%vaccin%'                   THEN 'Immunizations (Flu/Pneumo)'
    WHEN dm.measure_name ILIKE '%medication reconcili%'     THEN 'Medication Reconciliation'
    WHEN dm.measure_name ILIKE '%advance care%'
      OR dm.measure_name ILIKE '%advance directive%'        THEN 'Advance Care Planning'
    WHEN dm.measure_name ILIKE '%pain assess%'
      OR dm.measure_name ILIKE '%pain screen%'              THEN 'Pain Assessment'
    WHEN dm.measure_name ILIKE '%cognitive%'
      OR dm.measure_name ILIKE '%dementia screen%'
      OR dm.measure_name ILIKE '%moca%'
      OR dm.measure_name ILIKE '%mmse%'                     THEN 'Cognitive Screening'
    WHEN dm.measure_name ILIKE '%substance use%'
      OR dm.measure_name ILIKE '%alcohol screen%'
      OR dm.measure_name ILIKE '%drug screen%'              THEN 'Substance Use Screening'
    WHEN dm.measure_name ILIKE '%nutrition%'
      OR dm.measure_name ILIKE '%diet counsel%'
      OR dm.measure_name ILIKE '%dietary%'                  THEN 'Nutritional Counseling'
    ELSE bbm.dedup_domain  -- Keep existing value (don't overwrite with NULL)
END
FROM phm_star.dim_measure dm
WHERE dm.measure_key = bbm.measure_key
  AND bbm.is_shared_measure = TRUE
  AND bbm.dedup_domain IS NULL;

DO $$
DECLARE v_with_domain INT;
DECLARE v_without_domain INT;
BEGIN
    SELECT COUNT(*) INTO v_with_domain
    FROM phm_star.bridge_bundle_measure
    WHERE is_shared_measure = TRUE AND dedup_domain IS NOT NULL;

    SELECT COUNT(*) INTO v_without_domain
    FROM phm_star.bridge_bundle_measure
    WHERE is_shared_measure = TRUE AND dedup_domain IS NULL;

    RAISE NOTICE 'Shared measures with dedup_domain: %, without: %',
        v_with_domain, v_without_domain;
END;
$$;


-- =====================================================================
-- STEP 5: Seed dim_risk_model with the 4 initial Abigail AI models
-- These are reference rows; actual scores populated by AI engine
-- =====================================================================

INSERT INTO phm_star.dim_risk_model
    (model_code, model_name, model_version, model_type, description, is_active, effective_start)
VALUES
    ('HCC_V28',
     'HCC Risk Adjustment Model v28',
     'v28',
     'Risk Adjustment',
     'CMS Hierarchical Condition Category (HCC) risk adjustment model v28. Predicts annual cost of care.',
     TRUE,
     '2024-01-01'),

    ('READMIT_30D',
     '30-Day Hospital Readmission Risk',
     'v1.0',
     'Predictive',
     'Logistic regression model predicting 30-day readmission probability based on clinical and utilization features.',
     TRUE,
     '2025-01-01'),

    ('ED_RISK',
     'ED Utilization Risk Score',
     'v1.0',
     'Predictive',
     'Gradient boosted model predicting probability of ED visit in the next 90 days.',
     TRUE,
     '2025-01-01'),

    ('ABIGAIL_COMPOSITE',
     'Abigail AI Composite Priority Score',
     'v2.0',
     'Classification',
     'Composite priority score (0–100) synthesizing care gap burden, risk scores, SDOH, and utilization. Powers patient list ranking.',
     TRUE,
     '2025-06-01')

ON CONFLICT (model_code) DO UPDATE
    SET model_name    = EXCLUDED.model_name,
        model_version = EXCLUDED.model_version,
        description   = EXCLUDED.description;

DO $$ BEGIN RAISE NOTICE 'dim_risk_model seeded: 4 AI models'; END; $$;

-- =====================================================================
-- End of 011_seed_star_bundles.sql
-- Run next: 012_etl_star_v2.sql (ETL Steps 16-27)
-- =====================================================================
