-- =====================================================================
-- 013_etl_star_v2.sql
-- Phase 6: ETL Steps 16–27 — New star schema fact population
--
-- IMPORTANT — TRANSACTION NOTES:
--   This file runs inside the migration runner's sql.begin() transaction.
--   Do NOT add BEGIN; / COMMIT; here — the runner owns the transaction.
--   SAVEPOINT before_composite is valid inside the runner's transaction.
--
-- IMPORTANT — MATERIALIZED VIEW REFRESH:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run inside a transaction.
--   Step 27 refresh calls are in: packages/db/scripts/refresh_star_views.sql
--   Run that script separately after each ETL cycle (no transaction wrapper).
--
-- Extends the ETL begun in 004_etl_edw_to_star.sql (Steps 1–15).
-- Run AFTER that ETL completes each cycle.
--
-- STEP 16: Load dim_payer
-- STEP 17: Load dim_allergy
-- STEP 18: Load dim_care_gap_bundle
-- STEP 19: Load bridge_bundle_measure
-- STEP 20: UPSERT fact_care_gap (gap closures + new columns)
-- STEP 21: Populate fact_patient_bundle
-- STEP 22: Populate fact_patient_bundle_detail (with dedup)
-- STEP 23: Populate fact_patient_composite (SAVEPOINT guard)
-- STEP 24: Populate fact_provider_quality
-- STEP 25: Populate fact_population_snapshot
-- STEP 26: Incremental fact_immunization, fact_patient_insurance, fact_sdoh
-- STEP 27: REFRESH MATERIALIZED VIEWS CONCURRENTLY
--
-- All steps run in a single transaction.
-- SAVEPOINT before Step 23 allows partial recovery if composite fails.
-- =====================================================================

-------------------------------------------------------------------------------
-- STEP 16: Refresh dim_payer (Type 1 — truncate/reload)
-- Source: phm_edw.payer WHERE active_ind = 'Y'
-------------------------------------------------------------------------------

TRUNCATE phm_star.dim_payer RESTART IDENTITY CASCADE;

INSERT INTO phm_star.dim_payer (
    payer_id,
    payer_name,
    payer_type,
    is_current,
    effective_start_date,
    effective_end_date,
    created_at,
    updated_at
)
SELECT
    p.payer_id,
    p.payer_name,
    p.payer_type,
    TRUE,
    COALESCE(p.effective_start_date, CURRENT_DATE),
    COALESCE(p.effective_end_date, '9999-12-31'::DATE),
    NOW(),
    NOW()
FROM phm_edw.payer p
WHERE p.active_ind = 'Y';


-------------------------------------------------------------------------------
-- STEP 17: Refresh dim_allergy (Type 1 — truncate/reload)
-- Source: phm_edw.allergy WHERE active_ind = 'Y'
-------------------------------------------------------------------------------

TRUNCATE phm_star.dim_allergy RESTART IDENTITY;

INSERT INTO phm_star.dim_allergy (
    allergy_id,
    allergy_code,
    allergy_name,
    code_system,
    category,
    created_at,
    updated_at
)
SELECT
    a.allergy_id,
    a.allergy_code,
    a.allergy_name,
    a.code_system,
    a.category,
    NOW(),
    NOW()
FROM phm_edw.allergy a
WHERE a.active_ind = 'Y';


-------------------------------------------------------------------------------
-- STEP 18: Refresh dim_care_gap_bundle (Type 1 — truncate/reload)
-- Source: phm_edw.condition_bundle WHERE active_ind = 'Y'
-- disease_category mapped via CASE (not in EDW; hard-coded here)
-------------------------------------------------------------------------------

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
    cb.condition_name,
    CASE cb.bundle_code
        WHEN 'DM'      THEN 'Endocrine'
        WHEN 'T1D'     THEN 'Endocrine'
        WHEN 'OBESITY' THEN 'Endocrine'
        WHEN 'HYPO'    THEN 'Endocrine'
        WHEN 'HTN'     THEN 'Cardiovascular'
        WHEN 'CAD'     THEN 'Cardiovascular'
        WHEN 'HF'      THEN 'Cardiovascular'
        WHEN 'AFIB'    THEN 'Cardiovascular'
        WHEN 'PAD'     THEN 'Cardiovascular'
        WHEN 'PAH'     THEN 'Cardiovascular'
        WHEN 'HLD'     THEN 'Cardiovascular'
        WHEN 'VTE'     THEN 'Cardiovascular'
        WHEN 'COPD'    THEN 'Respiratory'
        WHEN 'ASTHMA'  THEN 'Respiratory'
        WHEN 'OSA'     THEN 'Respiratory'
        WHEN 'CKD'     THEN 'Renal'
        WHEN 'NAFLD'   THEN 'Hepatic'
        WHEN 'MDD'     THEN 'Behavioral Health'
        WHEN 'GAD'     THEN 'Behavioral Health'
        WHEN 'PTSD'    THEN 'Behavioral Health'
        WHEN 'BIPOLAR' THEN 'Behavioral Health'
        WHEN 'OSTEO'   THEN 'Musculoskeletal'
        WHEN 'RA'      THEN 'Musculoskeletal'
        WHEN 'OA'      THEN 'Musculoskeletal'
        WHEN 'GOUT'    THEN 'Musculoskeletal'
        WHEN 'ALZ'     THEN 'Neurological'
        WHEN 'STROKE'  THEN 'Neurological'
        WHEN 'MIGRAINE'THEN 'Neurological'
        WHEN 'EPILEPSY'THEN 'Neurological'
        WHEN 'MS'      THEN 'Neurological'
        WHEN 'PARK'    THEN 'Neurological'
        WHEN 'GERD'    THEN 'Gastrointestinal'
        WHEN 'IBD'     THEN 'Gastrointestinal'
        WHEN 'BPH'     THEN 'Urological'
        WHEN 'HIV'     THEN 'Infectious Disease'
        WHEN 'HCV'     THEN 'Infectious Disease'
        WHEN 'HBV'     THEN 'Infectious Disease'
        WHEN 'SCD'     THEN 'Hematological'
        WHEN 'ANEMIA'  THEN 'Hematological'
        WHEN 'SLE'     THEN 'Autoimmune'
        WHEN 'PSO'     THEN 'Dermatological'
        WHEN 'WOUNDS'  THEN 'Dermatological'
        WHEN 'PAIN'    THEN 'Pain/Substance Use'
        WHEN 'TOBACCO' THEN 'Substance Use'
        WHEN 'AUD'     THEN 'Substance Use'
        ELSE 'Other'
    END                     AS disease_category,
    cb.icd10_pattern        AS icd10_codes,
    cb.bundle_size::SMALLINT,
    45::SMALLINT            AS total_diseases,
    (cb.active_ind = 'Y')   AS is_active,
    NOW(),
    NOW()
FROM phm_edw.condition_bundle cb
WHERE cb.active_ind = 'Y'
ORDER BY cb.bundle_id;


-------------------------------------------------------------------------------
-- STEP 19: Refresh bridge_bundle_measure (Type 1 — truncate/reload)
-- Source: phm_edw.bundle_measure + overlap rules for dedup metadata
-------------------------------------------------------------------------------

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
    bm.ordinal                    AS measure_sequence,
    bm.frequency,
    FALSE                         AS is_shared_measure,   -- set below
    NULL                          AS dedup_domain          -- set below
FROM phm_edw.bundle_measure bm
JOIN phm_edw.condition_bundle cb
    ON cb.bundle_id = bm.bundle_id AND cb.active_ind = 'Y'
JOIN phm_star.dim_care_gap_bundle dcgb
    ON dcgb.bundle_code = cb.bundle_code
JOIN phm_edw.measure_definition md
    ON md.measure_id = bm.measure_id AND md.active_ind = 'Y'
JOIN phm_star.dim_measure dm
    ON dm.measure_code = md.measure_code
WHERE bm.active_ind = 'Y'
ON CONFLICT (bundle_key, measure_key) DO UPDATE
    SET measure_sequence = EXCLUDED.measure_sequence,
        frequency        = EXCLUDED.frequency;

-- Mark shared measures (appear in > 1 bundle)
UPDATE phm_star.bridge_bundle_measure bbm
SET is_shared_measure = TRUE
FROM (
    SELECT measure_key
    FROM phm_star.bridge_bundle_measure
    GROUP BY measure_key
    HAVING COUNT(DISTINCT bundle_key) > 1
) shared
WHERE bbm.measure_key = shared.measure_key;

-- Apply dedup_domain from bundle_overlap_rule (canonical measure match)
UPDATE phm_star.bridge_bundle_measure bbm
SET dedup_domain = bor.shared_domain
FROM phm_edw.bundle_overlap_rule bor
JOIN phm_star.dim_measure dm ON dm.measure_code = bor.canonical_measure_code
WHERE dm.measure_key = bbm.measure_key
  AND bor.active_ind = 'Y'
  AND bbm.is_shared_measure = TRUE;

-- Apply dedup_domain fallback via measure name patterns
UPDATE phm_star.bridge_bundle_measure bbm
SET dedup_domain = CASE
    WHEN dm.measure_name ILIKE '%blood pressure%'        THEN 'Blood Pressure Control'
    WHEN dm.measure_name ILIKE '%statin%'
      OR dm.measure_name ILIKE '%lipid%'                 THEN 'Statin/Lipid Therapy'
    WHEN dm.measure_name ILIKE '%a1c%'
      OR dm.measure_name ILIKE '%hba1c%'
      OR dm.measure_name ILIKE '%glyc%'                  THEN 'A1C Monitoring'
    WHEN dm.measure_name ILIKE '%bmi%'
      OR dm.measure_name ILIKE '%body mass%'             THEN 'BMI Assessment'
    WHEN dm.measure_name ILIKE '%depression%'
      OR dm.measure_name ILIKE '%phq%'                   THEN 'Depression Screening (PHQ-9)'
    WHEN dm.measure_name ILIKE '%tobacco%'
      OR dm.measure_name ILIKE '%smoking%'
      OR dm.measure_name ILIKE '%cessation%'             THEN 'Tobacco Cessation'
    WHEN dm.measure_name ILIKE '%fall%'                  THEN 'Fall Risk Assessment'
    WHEN dm.measure_name ILIKE '%egfr%'
      OR dm.measure_name ILIKE '%creatinine%'
      OR dm.measure_name ILIKE '%renal function%'        THEN 'Renal Function (eGFR/Cr)'
    WHEN dm.measure_name ILIKE '%liver%'
      OR dm.measure_name ILIKE '%hepatic%'
      OR dm.measure_name ILIKE '%lft%'                   THEN 'Hepatic Function (LFTs)'
    WHEN dm.measure_name ILIKE '%cbc%'
      OR dm.measure_name ILIKE '%hemoglobin%'
      OR dm.measure_name ILIKE '%hematol%'               THEN 'CBC/Hematology'
    WHEN dm.measure_name ILIKE '%thyroid%'
      OR dm.measure_name ILIKE '%tsh%'                   THEN 'Thyroid Function'
    WHEN dm.measure_name ILIKE '%bone density%'
      OR dm.measure_name ILIKE '%dexa%'                  THEN 'Bone Density (DEXA)'
    WHEN dm.measure_name ILIKE '%influenza%'
      OR dm.measure_name ILIKE '%pneumo%'
      OR dm.measure_name ILIKE '%vaccin%'
      OR dm.measure_name ILIKE '%immuniz%'               THEN 'Immunizations (Flu/Pneumo)'
    WHEN dm.measure_name ILIKE '%medication reconcil%'   THEN 'Medication Reconciliation'
    WHEN dm.measure_name ILIKE '%advance care%'
      OR dm.measure_name ILIKE '%advance directive%'     THEN 'Advance Care Planning'
    WHEN dm.measure_name ILIKE '%pain assess%'
      OR dm.measure_name ILIKE '%pain screen%'           THEN 'Pain Assessment'
    WHEN dm.measure_name ILIKE '%cognitive%'
      OR dm.measure_name ILIKE '%moca%'
      OR dm.measure_name ILIKE '%mmse%'                  THEN 'Cognitive Screening'
    WHEN dm.measure_name ILIKE '%substance use%'
      OR dm.measure_name ILIKE '%alcohol screen%'        THEN 'Substance Use Screening'
    WHEN dm.measure_name ILIKE '%nutrition%'
      OR dm.measure_name ILIKE '%diet counsel%'          THEN 'Nutritional Counseling'
    ELSE bbm.dedup_domain
END
FROM phm_star.dim_measure dm
WHERE dm.measure_key = bbm.measure_key
  AND bbm.is_shared_measure = TRUE
  AND bbm.dedup_domain IS NULL;


-------------------------------------------------------------------------------
-- STEP 20: UPSERT fact_care_gap
-- a) Update rows where gap_status changed in the EDW (gap closures)
-- b) Backfill new columns: bundle_key, provider_key, org_key, days_open
-------------------------------------------------------------------------------

-- 20a: Update gap_status and resolved date for newly-closed gaps
UPDATE phm_star.fact_care_gap fcg
SET
    gap_status       = cg.gap_status,
    date_key_resolved = CASE
        WHEN cg.resolved_date IS NOT NULL
        THEN TO_CHAR(cg.resolved_date, 'YYYYMMDD')::INT
        ELSE NULL
    END,
    days_open        = CASE
        WHEN cg.resolved_date IS NOT NULL
        THEN (cg.resolved_date::DATE - cg.identified_date::DATE)
        ELSE (CURRENT_DATE - cg.identified_date::DATE)
    END
FROM phm_edw.care_gap cg
JOIN phm_star.dim_patient dp
    ON dp.patient_id = cg.patient_id AND dp.is_current = TRUE
JOIN phm_star.dim_measure dm
    ON dm.measure_id = cg.measure_id
WHERE fcg.patient_key = dp.patient_key
  AND fcg.measure_key = dm.measure_key
  AND fcg.gap_status <> cg.gap_status
  AND cg.active_ind = 'Y';

-- 20b: Backfill bundle_key where still NULL (from migrated EDW care_gap.bundle_id)
UPDATE phm_star.fact_care_gap fcg
SET bundle_key = dcgb.bundle_key
FROM phm_edw.care_gap cg
JOIN phm_edw.condition_bundle cb
    ON cb.bundle_id = cg.bundle_id AND cb.active_ind = 'Y'
JOIN phm_star.dim_care_gap_bundle dcgb
    ON dcgb.bundle_code = cb.bundle_code
JOIN phm_star.dim_patient dp
    ON dp.patient_id = cg.patient_id AND dp.is_current = TRUE
JOIN phm_star.dim_measure dm
    ON dm.measure_id = cg.measure_id
WHERE fcg.patient_key = dp.patient_key
  AND fcg.measure_key = dm.measure_key
  AND fcg.bundle_key IS NULL
  AND cg.bundle_id IS NOT NULL
  AND cg.active_ind = 'Y';

-- 20c: Backfill provider_key and org_key via patient PCP attribution
UPDATE phm_star.fact_care_gap fcg
SET
    provider_key = dp.pcp_provider_key,
    org_key      = dprov.org_key
FROM phm_star.dim_patient dp
LEFT JOIN phm_star.dim_provider dprov
    ON dprov.provider_key = dp.pcp_provider_key AND dprov.is_current = TRUE
WHERE fcg.patient_key = dp.patient_key
  AND dp.is_current = TRUE
  AND fcg.provider_key IS NULL;

-- 20d: Recalculate days_open for all still-open gaps
UPDATE phm_star.fact_care_gap fcg
SET days_open = (CURRENT_DATE - dd.full_date)
FROM phm_star.dim_date dd
WHERE dd.date_key = fcg.date_key_identified
  AND fcg.gap_status = 'Open'
  AND fcg.date_key_resolved IS NULL;


-------------------------------------------------------------------------------
-- STEP 21: Populate fact_patient_bundle
-- Grain: one row per active patient per qualifying disease bundle
-- A patient qualifies for a bundle if they have an ACTIVE CHRONIC diagnosis
-- whose ICD-10 code matches the bundle's icd10_codes LIKE patterns
-------------------------------------------------------------------------------

TRUNCATE phm_star.fact_patient_bundle RESTART IDENTITY CASCADE;

INSERT INTO phm_star.fact_patient_bundle (
    patient_key,
    bundle_key,
    provider_key,
    org_key,
    date_key_assigned,
    date_key_last_eval,
    total_measures,
    measures_met,
    measures_open,
    compliance_pct,
    risk_tier,
    is_active
)
WITH
-- Find all active chronic diagnoses per patient with ICD-10 code
patient_diagnoses AS (
    SELECT DISTINCT
        fd.patient_key,
        dc.icd10_code
    FROM phm_star.fact_diagnosis fd
    JOIN phm_star.dim_condition dc ON dc.condition_key = fd.condition_key
    WHERE fd.diagnosis_type   = 'CHRONIC'
      AND fd.diagnosis_status = 'ACTIVE'
),
-- Cross-match patient ICD-10 codes against bundle patterns
patient_bundle_qualification AS (
    SELECT DISTINCT
        pd.patient_key,
        dcgb.bundle_key,
        dcgb.bundle_size
    FROM patient_diagnoses pd
    JOIN phm_star.dim_care_gap_bundle dcgb ON dcgb.is_active = TRUE
    WHERE EXISTS (
        -- Check if any pattern in the comma-separated icd10_codes matches
        SELECT 1
        FROM unnest(string_to_array(dcgb.icd10_codes, ',')) AS pattern
        WHERE pd.icd10_code LIKE TRIM(pattern)
    )
),
-- Count measures_met and measures_open per patient-bundle from fact_care_gap
gap_counts AS (
    SELECT
        fcg.patient_key,
        fcg.bundle_key,
        COUNT(CASE WHEN fcg.gap_status = 'Closed' THEN 1 END)  AS measures_met,
        COUNT(CASE WHEN fcg.gap_status = 'Open'   THEN 1 END)  AS measures_open
    FROM phm_star.fact_care_gap fcg
    WHERE fcg.bundle_key IS NOT NULL
    GROUP BY fcg.patient_key, fcg.bundle_key
),
-- Get earliest care gap date as the "assigned" date for the bundle
earliest_gap AS (
    SELECT
        fcg.patient_key,
        fcg.bundle_key,
        MIN(fcg.date_key_identified) AS date_key_assigned
    FROM phm_star.fact_care_gap fcg
    WHERE fcg.bundle_key IS NOT NULL
    GROUP BY fcg.patient_key, fcg.bundle_key
)
SELECT
    pbq.patient_key,
    pbq.bundle_key,
    dp.pcp_provider_key                                         AS provider_key,
    dprov.org_key,
    COALESCE(eg.date_key_assigned,
        -- Fallback: today if no care gaps recorded yet
        TO_CHAR(CURRENT_DATE, 'YYYYMMDD')::INT)                AS date_key_assigned,
    TO_CHAR(CURRENT_DATE, 'YYYYMMDD')::INT                     AS date_key_last_eval,
    pbq.bundle_size::SMALLINT                                   AS total_measures,
    COALESCE(gc.measures_met, 0)::SMALLINT                     AS measures_met,
    COALESCE(gc.measures_open, 0)::SMALLINT                    AS measures_open,
    CASE WHEN pbq.bundle_size > 0
        THEN ROUND(
            COALESCE(gc.measures_met, 0)::NUMERIC / pbq.bundle_size * 100, 2
        )
        ELSE 0
    END                                                         AS compliance_pct,
    -- Risk tier: based on compliance_pct thresholds
    CASE
        WHEN pbq.bundle_size = 0 THEN 'Low'
        WHEN (COALESCE(gc.measures_met, 0)::NUMERIC / pbq.bundle_size) < 0.33 THEN 'High'
        WHEN (COALESCE(gc.measures_met, 0)::NUMERIC / pbq.bundle_size) < 0.67 THEN 'Medium'
        ELSE 'Low'
    END                                                         AS risk_tier,
    TRUE                                                        AS is_active
FROM patient_bundle_qualification pbq
JOIN phm_star.dim_patient dp
    ON dp.patient_key = pbq.patient_key AND dp.is_current = TRUE
LEFT JOIN phm_star.dim_provider dprov
    ON dprov.provider_key = dp.pcp_provider_key AND dprov.is_current = TRUE
LEFT JOIN gap_counts gc
    ON gc.patient_key = pbq.patient_key AND gc.bundle_key = pbq.bundle_key
LEFT JOIN earliest_gap eg
    ON eg.patient_key = pbq.patient_key AND eg.bundle_key = pbq.bundle_key;


-------------------------------------------------------------------------------
-- STEP 22: Populate fact_patient_bundle_detail
-- Grain: one row per patient × bundle × measure
-- Applies cross-bundle deduplication using dedup_domain from bridge table
-- "Owner" of a shared measure = bundle with the lowest bundle_key
-------------------------------------------------------------------------------

TRUNCATE phm_star.fact_patient_bundle_detail RESTART IDENTITY;

WITH
-- All patient-bundle-measure combinations
pbm_base AS (
    SELECT
        fpb.patient_bundle_key,
        fpb.patient_key,
        fpb.bundle_key,
        bbm.measure_key,
        bbm.frequency,
        bbm.is_shared_measure,
        bbm.dedup_domain
    FROM phm_star.fact_patient_bundle fpb
    JOIN phm_star.bridge_bundle_measure bbm
        ON bbm.bundle_key = fpb.bundle_key
    WHERE fpb.is_active = TRUE
),
-- Determine dedup ownership: for each patient + dedup_domain, the bundle with lowest bundle_key owns it
-- Non-shared measures (dedup_domain IS NULL) always own themselves
dedup_ownership AS (
    SELECT
        patient_key,
        bundle_key,
        measure_key,
        dedup_domain,
        CASE
            WHEN dedup_domain IS NULL THEN bundle_key  -- not shared; owns itself
            ELSE FIRST_VALUE(bundle_key) OVER (
                PARTITION BY patient_key, dedup_domain
                ORDER BY bundle_key ASC
                ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
            )
        END AS owner_bundle_key
    FROM pbm_base
),
-- Determine gap status from fact_care_gap for each patient-measure
gap_status_lookup AS (
    SELECT
        fcg.patient_key,
        fcg.measure_key,
        fcg.gap_status,
        fcg.date_key_identified,
        fcg.date_key_resolved,
        fcg.days_open,
        ROW_NUMBER() OVER (
            PARTITION BY fcg.patient_key, fcg.measure_key
            ORDER BY fcg.date_key_identified DESC
        ) AS rn  -- Take the most recent care gap row for this patient-measure
    FROM phm_star.fact_care_gap fcg
),
latest_gap AS (
    SELECT * FROM gap_status_lookup WHERE rn = 1
),
-- Determine days_since_last_action from latest satisfying observation or procedure
last_obs AS (
    SELECT
        fo.patient_key,
        dm.measure_key,
        MAX(fo.date_key_obs) AS last_obs_date_key
    FROM phm_star.fact_observation fo
    JOIN phm_star.dim_measure dm
        ON dm.loinc_code IS NOT NULL AND fo.observation_code = dm.loinc_code
    GROUP BY fo.patient_key, dm.measure_key
),
last_proc AS (
    SELECT
        fp.patient_key,
        dm.measure_key,
        MAX(fp.date_key_procedure) AS last_proc_date_key
    FROM phm_star.fact_procedure fp
    JOIN phm_star.dim_measure dm
        ON dm.cpt_codes IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM unnest(string_to_array(dm.cpt_codes, ',')) AS c
            WHERE fp.procedure_key IN (
                SELECT procedure_key FROM phm_star.dim_procedure
                WHERE procedure_code = TRIM(c)
            )
        )
    GROUP BY fp.patient_key, dm.measure_key
),
last_action AS (
    SELECT
        COALESCE(lo.patient_key, lp.patient_key)   AS patient_key,
        COALESCE(lo.measure_key, lp.measure_key)   AS measure_key,
        GREATEST(lo.last_obs_date_key, lp.last_proc_date_key) AS last_action_date_key
    FROM last_obs lo
    FULL OUTER JOIN last_proc lp
        ON lp.patient_key = lo.patient_key AND lp.measure_key = lo.measure_key
)
INSERT INTO phm_star.fact_patient_bundle_detail (
    patient_bundle_key,
    patient_key,
    bundle_key,
    measure_key,
    date_key_last_action,
    gap_status,
    is_overdue,
    days_since_last_action,
    dedup_applied,
    dedup_source_bundle
)
SELECT
    pb.patient_bundle_key,
    pb.patient_key,
    pb.bundle_key,
    pb.measure_key,
    la.last_action_date_key                               AS date_key_last_action,
    COALESCE(lg.gap_status, 'Open')                       AS gap_status,
    -- is_overdue: depends on measure frequency vs days since last action
    CASE
        WHEN la.last_action_date_key IS NULL THEN TRUE  -- Never done = overdue
        WHEN dm.frequency = 'Annual'
            AND (CURRENT_DATE - dd_action.full_date) > 365  THEN TRUE
        WHEN dm.frequency = 'Every 6 months'
            AND (CURRENT_DATE - dd_action.full_date) > 183  THEN TRUE
        WHEN dm.frequency = 'Every visit'                   THEN FALSE  -- Handled at encounter
        WHEN dm.frequency = 'Once'                          THEN FALSE  -- Satisfied once = done
        ELSE FALSE
    END                                                    AS is_overdue,
    CASE WHEN la.last_action_date_key IS NOT NULL
        THEN (CURRENT_DATE - dd_action.full_date)
        ELSE NULL
    END                                                    AS days_since_last_action,
    -- dedup_applied: TRUE if this bundle does not own this measure
    (ddup.owner_bundle_key IS DISTINCT FROM pb.bundle_key) AS dedup_applied,
    -- dedup_source_bundle: the owning bundle (NULL if this bundle owns it)
    CASE
        WHEN ddup.owner_bundle_key IS DISTINCT FROM pb.bundle_key
        THEN ddup.owner_bundle_key
        ELSE NULL
    END                                                    AS dedup_source_bundle
FROM pbm_base pb
JOIN dedup_ownership ddup
    ON ddup.patient_key = pb.patient_key
    AND ddup.bundle_key = pb.bundle_key
    AND ddup.measure_key = pb.measure_key
JOIN phm_star.dim_measure dm ON dm.measure_key = pb.measure_key
LEFT JOIN latest_gap lg
    ON lg.patient_key = pb.patient_key AND lg.measure_key = pb.measure_key
LEFT JOIN last_action la
    ON la.patient_key = pb.patient_key AND la.measure_key = pb.measure_key
LEFT JOIN phm_star.dim_date dd_action
    ON dd_action.date_key = la.last_action_date_key
ON CONFLICT (patient_key, bundle_key, measure_key) DO UPDATE
    SET gap_status             = EXCLUDED.gap_status,
        is_overdue             = EXCLUDED.is_overdue,
        days_since_last_action = EXCLUDED.days_since_last_action,
        date_key_last_action   = EXCLUDED.date_key_last_action,
        dedup_applied          = EXCLUDED.dedup_applied,
        dedup_source_bundle    = EXCLUDED.dedup_source_bundle;


-------------------------------------------------------------------------------
-- STEP 23: Populate fact_patient_composite
-- Grain: one row per active patient — the wide "dashboard row"
-- SAVEPOINT guard: if this fails, rollback to this point only
-------------------------------------------------------------------------------

SAVEPOINT before_composite;

TRUNCATE phm_star.fact_patient_composite RESTART IDENTITY;

INSERT INTO phm_star.fact_patient_composite (
    patient_key,
    provider_key,
    org_key,
    payer_key,
    age,
    gender,
    race,
    primary_language,
    active_bundle_count,
    total_measures_due,
    total_measures_met,
    total_measures_open,
    overall_compliance_pct,
    worst_bundle_code,
    worst_bundle_pct,
    has_diabetes,
    has_hypertension,
    has_cad,
    has_heart_failure,
    has_copd,
    has_ckd,
    has_depression,
    chronic_condition_count,
    hcc_risk_score,
    readmission_risk,
    ed_utilization_risk,
    abigail_priority_score,
    risk_tier,
    encounters_last_12mo,
    ed_visits_last_12mo,
    inpatient_last_12mo,
    last_encounter_date_key,
    days_since_last_visit,
    food_insecurity,
    housing_instability,
    transportation_barrier,
    social_isolation_score,
    mips_eligible,
    date_key_snapshot,
    etl_refreshed_at
)
WITH

-- 1. Bundle aggregates per patient
bundle_agg AS (
    SELECT
        patient_key,
        COUNT(*)                                AS active_bundle_count,
        SUM(total_measures)                     AS total_measures_due,
        SUM(measures_met)                       AS total_measures_met,
        SUM(measures_open)                      AS total_measures_open,
        CASE WHEN SUM(total_measures) > 0
            THEN ROUND(SUM(measures_met)::NUMERIC / SUM(total_measures) * 100, 2)
            ELSE 0
        END                                     AS overall_compliance_pct
    FROM phm_star.fact_patient_bundle
    WHERE is_active = TRUE
    GROUP BY patient_key
),

-- 2. Worst bundle per patient (lowest compliance)
worst_bundle AS (
    SELECT DISTINCT ON (fpb.patient_key)
        fpb.patient_key,
        dcgb.bundle_code          AS worst_bundle_code,
        fpb.compliance_pct        AS worst_bundle_pct
    FROM phm_star.fact_patient_bundle fpb
    JOIN phm_star.dim_care_gap_bundle dcgb ON dcgb.bundle_key = fpb.bundle_key
    WHERE fpb.is_active = TRUE
    ORDER BY fpb.patient_key, fpb.compliance_pct ASC NULLS LAST
),

-- 3. Chronic condition flags (fast boolean check via ICD-10 prefix)
condition_flags AS (
    SELECT
        fd.patient_key,
        BOOL_OR(dc.icd10_code LIKE 'E11%')                               AS has_diabetes,
        BOOL_OR(dc.icd10_code LIKE 'I10%')                               AS has_hypertension,
        BOOL_OR(dc.icd10_code LIKE 'I25%' OR dc.icd10_code LIKE 'I20%') AS has_cad,
        BOOL_OR(dc.icd10_code LIKE 'I50%')                               AS has_heart_failure,
        BOOL_OR(dc.icd10_code LIKE 'J44%')                               AS has_copd,
        BOOL_OR(dc.icd10_code LIKE 'N18%')                               AS has_ckd,
        BOOL_OR(dc.icd10_code LIKE 'F32%' OR dc.icd10_code LIKE 'F33%') AS has_depression,
        COUNT(DISTINCT fd.condition_key)                                  AS chronic_condition_count
    FROM phm_star.fact_diagnosis fd
    JOIN phm_star.dim_condition dc ON dc.condition_key = fd.condition_key
    WHERE fd.diagnosis_type   = 'CHRONIC'
      AND fd.diagnosis_status = 'ACTIVE'
    GROUP BY fd.patient_key
),

-- 4. Encounter utilization — last 12 months
cutoff_date_key AS (
    SELECT date_key FROM phm_star.dim_date
    WHERE full_date = CURRENT_DATE - INTERVAL '12 months'
    LIMIT 1
),
utilization AS (
    SELECT
        fe.patient_key,
        COUNT(*)                                                              AS encounters_last_12mo,
        COUNT(CASE WHEN fe.encounter_type ILIKE '%Emergency%'
                     OR fe.encounter_type ILIKE '%ED%'   THEN 1 END)         AS ed_visits_last_12mo,
        COUNT(CASE WHEN fe.encounter_type ILIKE '%Inpatient%'                 THEN 1 END) AS inpatient_last_12mo,
        MAX(fe.date_key_encounter)                                            AS last_encounter_date_key
    FROM phm_star.fact_encounter fe
    WHERE fe.date_key_encounter >= (SELECT date_key FROM cutoff_date_key)
    GROUP BY fe.patient_key
),

-- 5. Latest AI risk scores per patient (one row per model, take latest scored)
hcc_scores AS (
    SELECT DISTINCT ON (patient_key) patient_key, score_value AS hcc_risk_score
    FROM phm_star.fact_ai_risk_score
    JOIN phm_star.dim_risk_model drm USING (risk_model_key)
    WHERE drm.model_code = 'HCC_V28' AND drm.is_active = TRUE
    ORDER BY patient_key, date_key_scored DESC
),
readmit_scores AS (
    SELECT DISTINCT ON (patient_key) patient_key, score_value AS readmission_risk
    FROM phm_star.fact_ai_risk_score
    JOIN phm_star.dim_risk_model drm USING (risk_model_key)
    WHERE drm.model_code = 'READMIT_30D' AND drm.is_active = TRUE
    ORDER BY patient_key, date_key_scored DESC
),
ed_scores AS (
    SELECT DISTINCT ON (patient_key) patient_key, score_value AS ed_utilization_risk
    FROM phm_star.fact_ai_risk_score
    JOIN phm_star.dim_risk_model drm USING (risk_model_key)
    WHERE drm.model_code = 'ED_RISK' AND drm.is_active = TRUE
    ORDER BY patient_key, date_key_scored DESC
),
abigail_scores AS (
    SELECT DISTINCT ON (patient_key) patient_key, score_value AS abigail_priority_score
    FROM phm_star.fact_ai_risk_score
    JOIN phm_star.dim_risk_model drm USING (risk_model_key)
    WHERE drm.model_code = 'ABIGAIL_COMPOSITE' AND drm.is_active = TRUE
    ORDER BY patient_key, date_key_scored DESC
),

-- 6. Latest SDOH assessment per patient
latest_sdoh AS (
    SELECT DISTINCT ON (patient_key)
        patient_key,
        (food_insecurity    = TRUE)                AS food_insecurity,
        (housing_status NOT IN ('Stable') OR housing_status IS NULL) AS housing_instability,
        (transportation_barrier = TRUE)            AS transportation_barrier,
        social_isolation_score
    FROM phm_star.fact_sdoh
    ORDER BY patient_key, date_key_assessment DESC
),

-- 7. Primary payer per patient (primary coverage, currently active)
primary_payer AS (
    SELECT DISTINCT ON (fpi.patient_key)
        fpi.patient_key,
        fpi.payer_key
    FROM phm_star.fact_patient_insurance fpi
    WHERE fpi.primary_indicator = TRUE AND fpi.is_active = TRUE
    ORDER BY fpi.patient_key, fpi.date_key_start DESC
)

SELECT
    dp.patient_key,
    dp.pcp_provider_key                                        AS provider_key,
    dprov.org_key,
    pp.payer_key,
    -- Age calculated from dim_patient date_of_birth
    EXTRACT(YEAR FROM AGE(dp.date_of_birth))::SMALLINT         AS age,
    dp.gender,
    dp.race,
    dp.primary_language,
    -- Bundle aggregates (default 0 if no bundles)
    COALESCE(ba.active_bundle_count, 0)::SMALLINT,
    COALESCE(ba.total_measures_due, 0)::SMALLINT,
    COALESCE(ba.total_measures_met, 0)::SMALLINT,
    COALESCE(ba.total_measures_open, 0)::SMALLINT,
    COALESCE(ba.overall_compliance_pct, NULL),
    wb.worst_bundle_code,
    wb.worst_bundle_pct,
    -- Clinical flags
    COALESCE(cf.has_diabetes,      FALSE),
    COALESCE(cf.has_hypertension,  FALSE),
    COALESCE(cf.has_cad,           FALSE),
    COALESCE(cf.has_heart_failure, FALSE),
    COALESCE(cf.has_copd,          FALSE),
    COALESCE(cf.has_ckd,           FALSE),
    COALESCE(cf.has_depression,    FALSE),
    COALESCE(cf.chronic_condition_count, 0)::SMALLINT,
    -- AI risk scores
    hs.hcc_risk_score,
    rs.readmission_risk,
    es.ed_utilization_risk,
    ab.abigail_priority_score,
    -- Risk tier from composite score thresholds
    CASE
        WHEN ab.abigail_priority_score >= 80 THEN 'Critical'
        WHEN ab.abigail_priority_score >= 60 THEN 'High'
        WHEN ab.abigail_priority_score >= 35 THEN 'Medium'
        WHEN ab.abigail_priority_score IS NOT NULL THEN 'Low'
        -- Fallback: derive from bundle compliance if no AI score yet
        WHEN COALESCE(ba.overall_compliance_pct, 100) < 33 THEN 'High'
        WHEN COALESCE(ba.overall_compliance_pct, 100) < 67 THEN 'Medium'
        ELSE 'Low'
    END                                                        AS risk_tier,
    -- Utilization
    COALESCE(ut.encounters_last_12mo, 0)::SMALLINT,
    COALESCE(ut.ed_visits_last_12mo,  0)::SMALLINT,
    COALESCE(ut.inpatient_last_12mo,  0)::SMALLINT,
    ut.last_encounter_date_key,
    CASE WHEN ut.last_encounter_date_key IS NOT NULL
        THEN (CURRENT_DATE - dd_enc.full_date)
        ELSE NULL
    END                                                        AS days_since_last_visit,
    -- SDOH
    COALESCE(sd.food_insecurity,        FALSE),
    COALESCE(sd.housing_instability,    FALSE),
    COALESCE(sd.transportation_barrier, FALSE),
    sd.social_isolation_score,
    -- MIPS eligibility: true if provider has NPI (simplistic proxy)
    (dprov.npi_number IS NOT NULL)                             AS mips_eligible,
    -- Metadata
    TO_CHAR(CURRENT_DATE, 'YYYYMMDD')::INT                    AS date_key_snapshot,
    NOW()                                                      AS etl_refreshed_at

FROM phm_star.dim_patient dp
LEFT JOIN phm_star.dim_provider    dprov ON dprov.provider_key = dp.pcp_provider_key AND dprov.is_current = TRUE
LEFT JOIN bundle_agg               ba    ON ba.patient_key     = dp.patient_key
LEFT JOIN worst_bundle             wb    ON wb.patient_key     = dp.patient_key
LEFT JOIN condition_flags          cf    ON cf.patient_key     = dp.patient_key
LEFT JOIN utilization              ut    ON ut.patient_key     = dp.patient_key
LEFT JOIN phm_star.dim_date        dd_enc ON dd_enc.date_key  = ut.last_encounter_date_key
LEFT JOIN hcc_scores               hs    ON hs.patient_key     = dp.patient_key
LEFT JOIN readmit_scores           rs    ON rs.patient_key     = dp.patient_key
LEFT JOIN ed_scores                es    ON es.patient_key     = dp.patient_key
LEFT JOIN abigail_scores           ab    ON ab.patient_key     = dp.patient_key
LEFT JOIN latest_sdoh              sd    ON sd.patient_key     = dp.patient_key
LEFT JOIN primary_payer            pp    ON pp.patient_key     = dp.patient_key
WHERE dp.is_current = TRUE;


-------------------------------------------------------------------------------
-- STEP 24: Populate fact_provider_quality
-- Grain: provider × bundle × reporting period (current month)
-- Includes PERCENT_RANK for percentile scoring
-------------------------------------------------------------------------------

TRUNCATE phm_star.fact_provider_quality RESTART IDENTITY;

WITH
period_date_key AS (
    -- Use the first day of the current month as the reporting period key
    SELECT date_key
    FROM phm_star.dim_date
    WHERE full_date = DATE_TRUNC('month', CURRENT_DATE)::DATE
    LIMIT 1
),
provider_bundle_agg AS (
    SELECT
        fpb.provider_key,
        fpb.bundle_key,
        fpb.org_key,
        COUNT(DISTINCT fpb.patient_key)                              AS attributed_patients,
        COUNT(DISTINCT fpb.patient_key)                              AS patients_with_bundle,
        SUM(fpb.measures_open)                                       AS total_gaps_open,
        SUM(fpb.measures_met)                                        AS total_gaps_closed,
        ROUND(AVG(fpb.compliance_pct), 2)                           AS compliance_rate
    FROM phm_star.fact_patient_bundle fpb
    WHERE fpb.is_active = TRUE AND fpb.provider_key IS NOT NULL
    GROUP BY fpb.provider_key, fpb.bundle_key, fpb.org_key
)
INSERT INTO phm_star.fact_provider_quality (
    provider_key,
    org_key,
    bundle_key,
    date_key_period,
    attributed_patients,
    patients_with_bundle,
    total_gaps_open,
    total_gaps_closed,
    compliance_rate,
    mips_quality_score,
    percentile_rank
)
SELECT
    pba.provider_key,
    pba.org_key,
    pba.bundle_key,
    (SELECT date_key FROM period_date_key),
    pba.attributed_patients,
    pba.patients_with_bundle,
    pba.total_gaps_open,
    pba.total_gaps_closed,
    pba.compliance_rate,
    NULL                                          AS mips_quality_score,  -- Populated by MIPS calc
    ROUND(
        PERCENT_RANK() OVER (
            PARTITION BY pba.bundle_key
            ORDER BY pba.compliance_rate ASC NULLS FIRST
        )::NUMERIC * 100, 1
    )                                             AS percentile_rank
FROM provider_bundle_agg pba;


-------------------------------------------------------------------------------
-- STEP 25: Populate fact_population_snapshot
-- Grain: org × snapshot date × bundle (NULL = org-wide)
-- One org-wide row + one row per bundle per org
-------------------------------------------------------------------------------

TRUNCATE phm_star.fact_population_snapshot RESTART IDENTITY;

WITH snapshot_date_key AS (
    SELECT date_key FROM phm_star.dim_date
    WHERE full_date = CURRENT_DATE
    LIMIT 1
),
-- Org-wide aggregate (bundle_key = NULL)
org_wide AS (
    SELECT
        fpc.org_key,
        NULL::INT                                                       AS bundle_key,
        COUNT(DISTINCT fpc.patient_key)                                 AS total_patients,
        COUNT(DISTINCT fpc.patient_key)                                 AS patients_with_bundle,
        ROUND(AVG(fpc.overall_compliance_pct), 2)                      AS avg_compliance_pct,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY fpc.overall_compliance_pct
        )::NUMERIC, 2)                                                  AS median_compliance_pct,
        SUM(fpc.total_measures_open)                                    AS open_gaps_total,
        SUM(fpc.total_measures_met)                                     AS closed_gaps_total,
        COUNT(CASE WHEN fpc.risk_tier = 'High'     THEN 1 END)         AS high_risk_patients,
        COUNT(CASE WHEN fpc.risk_tier = 'Critical' THEN 1 END)         AS critical_risk_patients,
        ROUND(AVG(fpc.hcc_risk_score)::NUMERIC, 3)                     AS avg_hcc_score,
        ROUND(AVG(fpc.chronic_condition_count)::NUMERIC, 1)            AS avg_chronic_conditions,
        COUNT(CASE WHEN fpc.food_insecurity
                     OR fpc.housing_instability
                     OR fpc.transportation_barrier THEN 1 END)          AS sdoh_flagged_patients
    FROM phm_star.fact_patient_composite fpc
    WHERE fpc.org_key IS NOT NULL
    GROUP BY fpc.org_key
),
-- Per-bundle aggregate per org
bundle_agg AS (
    SELECT
        fpb.org_key,
        fpb.bundle_key,
        COUNT(DISTINCT fpb.patient_key)                                 AS total_patients,
        COUNT(DISTINCT fpb.patient_key)                                 AS patients_with_bundle,
        ROUND(AVG(fpb.compliance_pct), 2)                              AS avg_compliance_pct,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY fpb.compliance_pct
        )::NUMERIC, 2)                                                  AS median_compliance_pct,
        SUM(fpb.measures_open)                                          AS open_gaps_total,
        SUM(fpb.measures_met)                                           AS closed_gaps_total,
        COUNT(CASE WHEN fpb.risk_tier = 'High'     THEN 1 END)         AS high_risk_patients,
        COUNT(CASE WHEN fpb.risk_tier = 'Critical' THEN 1 END)         AS critical_risk_patients,
        NULL::DECIMAL(6,3)                                              AS avg_hcc_score,
        NULL::DECIMAL(4,1)                                              AS avg_chronic_conditions,
        NULL::INT                                                        AS sdoh_flagged_patients
    FROM phm_star.fact_patient_bundle fpb
    WHERE fpb.is_active = TRUE AND fpb.org_key IS NOT NULL
    GROUP BY fpb.org_key, fpb.bundle_key
)
INSERT INTO phm_star.fact_population_snapshot (
    org_key,
    date_key_snapshot,
    bundle_key,
    total_patients,
    patients_with_bundle,
    avg_compliance_pct,
    median_compliance_pct,
    open_gaps_total,
    closed_gaps_total,
    high_risk_patients,
    critical_risk_patients,
    avg_hcc_score,
    avg_chronic_conditions,
    sdoh_flagged_patients
)
SELECT
    org_key,
    (SELECT date_key FROM snapshot_date_key),
    bundle_key,
    total_patients,
    patients_with_bundle,
    avg_compliance_pct,
    median_compliance_pct,
    open_gaps_total,
    closed_gaps_total,
    high_risk_patients,
    critical_risk_patients,
    avg_hcc_score,
    avg_chronic_conditions,
    sdoh_flagged_patients
FROM org_wide
UNION ALL
SELECT
    org_key,
    (SELECT date_key FROM snapshot_date_key),
    bundle_key,
    total_patients,
    patients_with_bundle,
    avg_compliance_pct,
    median_compliance_pct,
    open_gaps_total,
    closed_gaps_total,
    high_risk_patients,
    critical_risk_patients,
    avg_hcc_score,
    avg_chronic_conditions,
    sdoh_flagged_patients
FROM bundle_agg;


-------------------------------------------------------------------------------
-- STEP 26: Incremental inserts — fact_immunization, fact_patient_insurance,
--          fact_sdoh
-- Only insert rows not yet in the star schema (NK-based dedup)
-------------------------------------------------------------------------------

-- 26a: fact_immunization — incremental by immunization_id
INSERT INTO phm_star.fact_immunization (
    immunization_id,
    patient_key,
    provider_key,
    date_key_administered,
    vaccine_code,
    vaccine_name,
    status,
    count_immunization
)
SELECT
    imm.immunization_id,
    dp.patient_key,
    dprov.provider_key,
    TO_CHAR(imm.administration_datetime, 'YYYYMMDD')::INT   AS date_key_administered,
    imm.vaccine_code,
    imm.vaccine_name,
    imm.status,
    1
FROM phm_edw.immunization imm
JOIN phm_star.dim_patient dp
    ON dp.patient_id = imm.patient_id AND dp.is_current = TRUE
LEFT JOIN phm_star.dim_provider dprov
    ON dprov.provider_id = imm.provider_id AND dprov.is_current = TRUE
WHERE imm.active_ind = 'Y'
  AND NOT EXISTS (
    SELECT 1 FROM phm_star.fact_immunization fi
    WHERE fi.immunization_id = imm.immunization_id
  );

-- 26b: fact_patient_insurance — UPSERT on coverage_id
INSERT INTO phm_star.fact_patient_insurance (
    coverage_id,
    patient_key,
    payer_key,
    date_key_start,
    date_key_end,
    primary_indicator,
    is_active
)
SELECT
    pic.coverage_id,
    dp.patient_key,
    dpay.payer_key,
    TO_CHAR(pic.coverage_start_date, 'YYYYMMDD')::INT           AS date_key_start,
    CASE WHEN pic.coverage_end_date IS NOT NULL
        THEN TO_CHAR(pic.coverage_end_date, 'YYYYMMDD')::INT
        ELSE NULL
    END                                                          AS date_key_end,
    (pic.primary_indicator = 'Y')                               AS primary_indicator,
    (pic.active_ind = 'Y')                                      AS is_active
FROM phm_edw.patient_insurance_coverage pic
JOIN phm_star.dim_patient dp
    ON dp.patient_id = pic.patient_id AND dp.is_current = TRUE
JOIN phm_star.dim_payer dpay
    ON dpay.payer_id = pic.payer_id
ON CONFLICT (coverage_id) DO UPDATE
    SET date_key_end    = EXCLUDED.date_key_end,
        is_active       = EXCLUDED.is_active;

-- 26c: fact_sdoh — incremental by sdoh_assessment_id
INSERT INTO phm_star.fact_sdoh (
    sdoh_assessment_id,
    patient_key,
    date_key_assessment,
    housing_status,
    food_insecurity,
    transportation_barrier,
    social_isolation_score
)
SELECT
    sa.sdoh_assessment_id,
    dp.patient_key,
    TO_CHAR(sa.assessment_date, 'YYYYMMDD')::INT               AS date_key_assessment,
    sa.housing_status,
    (sa.food_insecurity_ind = 'Y')                             AS food_insecurity,
    (sa.transportation_ind  = 'Y')                             AS transportation_barrier,
    sa.social_isolation_score
FROM phm_edw.sdoh_assessment sa
JOIN phm_star.dim_patient dp
    ON dp.patient_id = sa.patient_id AND dp.is_current = TRUE
WHERE sa.active_ind = 'Y'
  AND NOT EXISTS (
    SELECT 1 FROM phm_star.fact_sdoh fs
    WHERE fs.sdoh_assessment_id = sa.sdoh_assessment_id
  );


-- =====================================================================
-- STEP 27: Refresh materialized views
-- NOTE: REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run inside a
--       transaction. These statements are in the separate script:
--         packages/db/scripts/refresh_star_views.sql
--       Run that script after this ETL completes.
-- =====================================================================

-- =====================================================================
-- End of 013_etl_star_v2.sql
-- Steps 16–26 complete. Run refresh_star_views.sql separately for Step 27.
-- =====================================================================
