-- =====================================================================
-- 014_etl_steps_16_27.sql
-- Phase: Demo Account — ETL Enhancement (Steps 16–27)
-- Extends the EDW→Star ETL to populate the new dimensions and fact tables
-- Run this AFTER demo data is seeded (migrations 015–022)
-- Fixed: SNOMED condition name matching (no icd10_code column on condition_diagnosis)
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- STEP 15: Sync all measure_definitions into dim_measure
-- (dim_measure may only have a subset; bundle_measure needs all)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_star.dim_measure (measure_id, measure_code, measure_name, measure_type, description)
SELECT md.measure_id, md.measure_code, md.measure_name, md.measure_type, md.description
FROM phm_edw.measure_definition md
WHERE md.active_ind = 'Y'
  AND NOT EXISTS (SELECT 1 FROM phm_star.dim_measure dm WHERE dm.measure_id = md.measure_id);

-- ─────────────────────────────────────────────────────────────────────
-- STEP 15a: Ensure Dr. Udoshi's organization is in dim_organization
-- (org_id 2738 may be newer than the initial dim load)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_star.dim_organization (org_id, organization_name, organization_type)
SELECT o.org_id, o.organization_name, o.organization_type
FROM phm_edw.organization o
WHERE o.org_id = 2738
  AND NOT EXISTS (SELECT 1 FROM phm_star.dim_organization WHERE org_id = 2738);

-- ─────────────────────────────────────────────────────────────────────
-- STEP 15b: Ensure Dr. Udoshi is in dim_provider
-- (provider_id 2816 may be newer than the initial dim load)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_star.dim_provider (provider_id, first_name, last_name, npi_number, specialty, provider_type, org_key)
SELECT
    prov.provider_id,
    prov.first_name,
    prov.last_name,
    prov.npi_number,
    prov.specialty,
    prov.provider_type,
    dorg.org_key
FROM phm_edw.provider prov
LEFT JOIN phm_star.dim_organization dorg ON dorg.org_id = prov.org_id AND dorg.is_current = TRUE
WHERE prov.provider_id = 2816
  AND NOT EXISTS (SELECT 1 FROM phm_star.dim_provider WHERE provider_id = 2816);

-- ─────────────────────────────────────────────────────────────────────
-- STEP 16: Populate dim_payer from phm_edw.payer
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_star.dim_payer (payer_id, payer_name, payer_type, payer_code, is_government)
SELECT DISTINCT
    p.payer_id,
    p.payer_name,
    p.payer_type,
    p.payer_id::TEXT,
    CASE WHEN p.payer_type IN ('Medicare','Medicaid','Medicare Advantage','Dual-Eligible','Medi-Cal') THEN TRUE ELSE FALSE END
FROM phm_edw.payer p
WHERE p.active_ind = 'Y'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 17: Populate dim_allergy from phm_edw.allergy
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_star.dim_allergy (allergy_id, allergy_code, allergy_name, code_system, category)
SELECT DISTINCT
    a.allergy_id,
    a.allergy_code,
    a.allergy_name,
    a.code_system,
    a.category
FROM phm_edw.allergy a
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 18: Populate dim_care_gap_bundle from phm_edw.condition_bundle
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_star.dim_care_gap_bundle (bundle_id, bundle_code, bundle_name, disease_category, icd10_pattern, bundle_size)
SELECT
    cb.bundle_id,
    cb.bundle_code,
    cb.condition_name,
    CASE
        WHEN cb.bundle_code IN ('DM','T1D','LIPID','OB')                       THEN 'Endocrine/Metabolic'
        WHEN cb.bundle_code IN ('HTN','CAD','HF','AFIB','PAD','PAH','VTE','STR') THEN 'Cardiovascular'
        WHEN cb.bundle_code IN ('COPD','ASTH')                                  THEN 'Respiratory'
        WHEN cb.bundle_code IN ('CKD')                                           THEN 'Nephrology'
        WHEN cb.bundle_code IN ('CLD','GERD','IBD')                              THEN 'Gastroenterology'
        WHEN cb.bundle_code IN ('MDD','GAD','PTSD','BP','AUD','TOB')             THEN 'Behavioral Health'
        WHEN cb.bundle_code IN ('OSTEO','OA','RA','GOUT','PSO','SLE')            THEN 'Musculoskeletal/Rheumatology'
        WHEN cb.bundle_code IN ('ALZ','EPI','MS','PD','MIG','PAIN')              THEN 'Neurology'
        WHEN cb.bundle_code IN ('HYPO')                                          THEN 'Endocrine'
        WHEN cb.bundle_code IN ('HIV','HCV','HBV','SCD','ANEM','OSA','BPH','WND') THEN 'Other Chronic'
        ELSE 'Other'
    END,
    cb.icd10_pattern,
    cb.bundle_size
FROM phm_edw.condition_bundle cb
WHERE cb.active_ind = 'Y'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 19: Populate bridge_bundle_measure
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_star.bridge_bundle_measure (bundle_key, measure_key, measure_sequence, frequency, is_shared_measure, dedup_domain)
SELECT
    dcb.bundle_key,
    dm.measure_key,
    bm.ordinal,
    LEFT(bm.frequency, 50),
    -- Mark shared measures (BP control, statin, etc.)
    CASE WHEN bm.frequency ILIKE '%dedup%' OR bm.ecqm_reference ILIKE '%shared%' THEN TRUE ELSE FALSE END,
    -- Assign dedup domain based on measure name
    CASE
        WHEN md.measure_name ILIKE '%blood pressure%'    THEN 'Blood Pressure Control'
        WHEN md.measure_name ILIKE '%statin%'            THEN 'Statin Therapy'
        WHEN md.measure_name ILIKE '%smoking%' OR md.measure_name ILIKE '%tobacco%' THEN 'Tobacco Cessation'
        WHEN md.measure_name ILIKE '%depression%screen%' THEN 'Depression Screening'
        WHEN md.measure_name ILIKE '%bmi%' OR md.measure_name ILIKE '%weight%'      THEN 'BMI/Weight Management'
        ELSE NULL
    END
FROM phm_edw.bundle_measure bm
JOIN phm_edw.condition_bundle cb ON bm.bundle_id = cb.bundle_id
JOIN phm_edw.measure_definition md ON bm.measure_id = md.measure_id
JOIN phm_star.dim_care_gap_bundle dcb ON dcb.bundle_code = cb.bundle_code AND dcb.is_active = TRUE
JOIN phm_star.dim_measure dm ON dm.measure_id = md.measure_id
ON CONFLICT (bundle_key, measure_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 20: Populate fact_patient_bundle (set-based CTE, no loops/LATERAL)
-- Pre-aggregate condition flags once, expand via UNION ALL
-- ─────────────────────────────────────────────────────────────────────
WITH
-- Care gap stats per patient × bundle (single aggregation pass)
gap_stats AS (
    SELECT cg.patient_id, bm.bundle_id,
        COUNT(*) FILTER (WHERE cg.gap_status = 'closed')   AS closed_count,
        COUNT(*) FILTER (WHERE cg.gap_status = 'open')     AS open_count,
        COUNT(*) FILTER (WHERE cg.gap_status = 'excluded') AS excluded_count
    FROM phm_edw.care_gap cg
    JOIN phm_edw.bundle_measure bm ON bm.measure_id = cg.measure_id
    JOIN phm_edw.patient p ON cg.patient_id = p.patient_id
    WHERE p.pcp_provider_id = (SELECT provider_id FROM phm_edw.provider WHERE email = 'dr.udoshi@medgnosis.app')
    GROUP BY cg.patient_id, bm.bundle_id
),
-- Earliest diagnosis date per patient (for date_key_assigned)
earliest_onset AS (
    SELECT DISTINCT ON (cd.patient_id)
        cd.patient_id,
        REPLACE(cd.onset_date::DATE::TEXT, '-', '')::INT AS date_key
    FROM phm_edw.condition_diagnosis cd
    WHERE cd.onset_date IS NOT NULL
    ORDER BY cd.patient_id, cd.onset_date ASC
),
-- Condition flags per patient — single scan, grouped by patient
cond_flags AS (
    SELECT cd.patient_id,
        BOOL_OR(c.condition_name ILIKE '%diabetes mellitus type 2%' OR c.condition_name ILIKE '%type 2 diabetes%')                                   AS has_DM,
        BOOL_OR(c.condition_name ILIKE '%diabetes mellitus type 1%')                                                                                   AS has_T1D,
        BOOL_OR(c.condition_name ILIKE '%hypertension%')                                                                                               AS has_HTN,
        BOOL_OR(c.condition_name ILIKE '%coronary artery%' OR c.condition_name ILIKE '%ischemic heart%' OR c.condition_name ILIKE '%angina%')          AS has_CAD,
        BOOL_OR(c.condition_name ILIKE '%heart failure%')                                                                                              AS has_HF,
        BOOL_OR(c.condition_name ILIKE '%copd%' OR c.condition_name ILIKE '%chronic obstructive%')                                                     AS has_COPD,
        BOOL_OR(c.condition_name ILIKE '%asthma%')                                                                                                     AS has_ASTH,
        BOOL_OR(c.condition_name ILIKE '%chronic kidney disease%' OR c.condition_name ILIKE '%kidney failure%')                                        AS has_CKD,
        BOOL_OR(c.condition_name ILIKE '%atrial fibrillation%')                                                                                        AS has_AFIB,
        BOOL_OR(c.condition_name ILIKE '%major depress%' OR c.condition_name ILIKE '%depress%')                                                        AS has_MDD,
        BOOL_OR(c.condition_name ILIKE '%anxiety%')                                                                                                    AS has_GAD,
        BOOL_OR(c.condition_name ILIKE '%osteoporosis%')                                                                                               AS has_OSTEO,
        BOOL_OR(c.condition_name ILIKE '%obesity%' OR c.condition_name ILIKE '%BMI 30%')                                                              AS has_OB,
        BOOL_OR(c.condition_name ILIKE '%liver disease%' OR c.condition_name ILIKE '%hepatic%' OR c.condition_name ILIKE '%NAFLD%' OR c.condition_name ILIKE '%MASLD%') AS has_CLD,
        BOOL_OR(c.condition_name ILIKE '%rheumatoid arthritis%')                                                                                       AS has_RA,
        BOOL_OR(c.condition_name ILIKE '%peripheral artery%')                                                                                          AS has_PAD,
        BOOL_OR(c.condition_name ILIKE '%hypothyroid%')                                                                                                AS has_HYPO,
        BOOL_OR(c.condition_name ILIKE '%alzheimer%' OR c.condition_name ILIKE '%dementia%')                                                           AS has_ALZ,
        BOOL_OR(c.condition_name ILIKE '%stroke%' OR c.condition_name ILIKE '%cerebrovascular%')                                                      AS has_STR,
        BOOL_OR(c.condition_name ILIKE '%chronic pain%')                                                                                               AS has_PAIN,
        BOOL_OR(c.condition_name ILIKE '%osteoarthritis%')                                                                                             AS has_OA,
        BOOL_OR(c.condition_name ILIKE '%reflux%')                                                                                                     AS has_GERD,
        BOOL_OR(c.condition_name ILIKE '%prostatic hyperplasia%')                                                                                      AS has_BPH,
        BOOL_OR(c.condition_name ILIKE '%migraine%')                                                                                                   AS has_MIG,
        BOOL_OR(c.condition_name ILIKE '%epilepsy%')                                                                                                   AS has_EPI,
        BOOL_OR(c.condition_name ILIKE '%HIV%')                                                                                                        AS has_HIV,
        BOOL_OR(c.condition_name ILIKE '%hepatitis C%')                                                                                                AS has_HCV,
        BOOL_OR(c.condition_name ILIKE '%hepatitis B%')                                                                                                AS has_HBV,
        BOOL_OR(c.condition_name ILIKE '%sickle cell%')                                                                                                AS has_SCD,
        BOOL_OR(c.condition_name ILIKE '%lupus%')                                                                                                      AS has_SLE,
        BOOL_OR(c.condition_name ILIKE '%gout%')                                                                                                       AS has_GOUT,
        BOOL_OR(c.condition_name ILIKE '%sleep apnea%')                                                                                                AS has_OSA,
        BOOL_OR(c.condition_name ILIKE '%tobacco%' OR c.condition_name ILIKE '%nicotine%' OR c.condition_name ILIKE '%smoking%')                       AS has_TOB,
        BOOL_OR(c.condition_name ILIKE '%alcohol%')                                                                                                    AS has_AUD,
        BOOL_OR(c.condition_name ILIKE '%post-traumatic%')                                                                                             AS has_PTSD,
        BOOL_OR(c.condition_name ILIKE '%bipolar%')                                                                                                    AS has_BP,
        BOOL_OR(c.condition_name ILIKE '%thromboembolism%')                                                                                            AS has_VTE,
        BOOL_OR(c.condition_name ILIKE '%anemia%')                                                                                                     AS has_ANEM,
        BOOL_OR(c.condition_name ILIKE '%crohn%' OR c.condition_name ILIKE '%colitis%')                                                               AS has_IBD,
        BOOL_OR(c.condition_name ILIKE '%multiple sclerosis%')                                                                                         AS has_MS,
        BOOL_OR(c.condition_name ILIKE '%parkinson%')                                                                                                  AS has_PD,
        BOOL_OR(c.condition_name ILIKE '%psoriasis%')                                                                                                  AS has_PSO,
        BOOL_OR(c.condition_name ILIKE '%pulmonary arterial hypertension%')                                                                            AS has_PAH,
        BOOL_OR(c.condition_name ILIKE '%wound%')                                                                                                      AS has_WND,
        BOOL_OR(c.condition_name ILIKE '%hyperlipidemia%' OR c.condition_name ILIKE '%dyslipidemia%' OR c.condition_name ILIKE '%hypercholesterolemia%') AS has_LIPID
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    JOIN phm_edw.patient p ON cd.patient_id = p.patient_id
    WHERE p.pcp_provider_id = (SELECT provider_id FROM phm_edw.provider WHERE email = 'dr.udoshi@medgnosis.app')
      AND p.active_ind = 'Y'
    GROUP BY cd.patient_id
),
-- Expand to patient × bundle rows via UNION ALL (no cross join)
patient_bundles AS (
    SELECT patient_id, 'DM'    AS bundle_code FROM cond_flags WHERE has_DM    UNION ALL
    SELECT patient_id, 'T1D'                  FROM cond_flags WHERE has_T1D   UNION ALL
    SELECT patient_id, 'HTN'                  FROM cond_flags WHERE has_HTN   UNION ALL
    SELECT patient_id, 'CAD'                  FROM cond_flags WHERE has_CAD   UNION ALL
    SELECT patient_id, 'HF'                   FROM cond_flags WHERE has_HF    UNION ALL
    SELECT patient_id, 'COPD'                 FROM cond_flags WHERE has_COPD  UNION ALL
    SELECT patient_id, 'ASTH'                 FROM cond_flags WHERE has_ASTH  UNION ALL
    SELECT patient_id, 'CKD'                  FROM cond_flags WHERE has_CKD   UNION ALL
    SELECT patient_id, 'AFIB'                 FROM cond_flags WHERE has_AFIB  UNION ALL
    SELECT patient_id, 'MDD'                  FROM cond_flags WHERE has_MDD   UNION ALL
    SELECT patient_id, 'GAD'                  FROM cond_flags WHERE has_GAD   UNION ALL
    SELECT patient_id, 'OSTEO'                FROM cond_flags WHERE has_OSTEO UNION ALL
    SELECT patient_id, 'OB'                   FROM cond_flags WHERE has_OB    UNION ALL
    SELECT patient_id, 'CLD'                  FROM cond_flags WHERE has_CLD   UNION ALL
    SELECT patient_id, 'RA'                   FROM cond_flags WHERE has_RA    UNION ALL
    SELECT patient_id, 'PAD'                  FROM cond_flags WHERE has_PAD   UNION ALL
    SELECT patient_id, 'HYPO'                 FROM cond_flags WHERE has_HYPO  UNION ALL
    SELECT patient_id, 'ALZ'                  FROM cond_flags WHERE has_ALZ   UNION ALL
    SELECT patient_id, 'STR'                  FROM cond_flags WHERE has_STR   UNION ALL
    SELECT patient_id, 'PAIN'                 FROM cond_flags WHERE has_PAIN  UNION ALL
    SELECT patient_id, 'OA'                   FROM cond_flags WHERE has_OA    UNION ALL
    SELECT patient_id, 'GERD'                 FROM cond_flags WHERE has_GERD  UNION ALL
    SELECT patient_id, 'BPH'                  FROM cond_flags WHERE has_BPH   UNION ALL
    SELECT patient_id, 'MIG'                  FROM cond_flags WHERE has_MIG   UNION ALL
    SELECT patient_id, 'EPI'                  FROM cond_flags WHERE has_EPI   UNION ALL
    SELECT patient_id, 'HIV'                  FROM cond_flags WHERE has_HIV   UNION ALL
    SELECT patient_id, 'HCV'                  FROM cond_flags WHERE has_HCV   UNION ALL
    SELECT patient_id, 'HBV'                  FROM cond_flags WHERE has_HBV   UNION ALL
    SELECT patient_id, 'SCD'                  FROM cond_flags WHERE has_SCD   UNION ALL
    SELECT patient_id, 'SLE'                  FROM cond_flags WHERE has_SLE   UNION ALL
    SELECT patient_id, 'GOUT'                 FROM cond_flags WHERE has_GOUT  UNION ALL
    SELECT patient_id, 'OSA'                  FROM cond_flags WHERE has_OSA   UNION ALL
    SELECT patient_id, 'TOB'                  FROM cond_flags WHERE has_TOB   UNION ALL
    SELECT patient_id, 'AUD'                  FROM cond_flags WHERE has_AUD   UNION ALL
    SELECT patient_id, 'PTSD'                 FROM cond_flags WHERE has_PTSD  UNION ALL
    SELECT patient_id, 'BP'                   FROM cond_flags WHERE has_BP    UNION ALL
    SELECT patient_id, 'VTE'                  FROM cond_flags WHERE has_VTE   UNION ALL
    SELECT patient_id, 'ANEM'                 FROM cond_flags WHERE has_ANEM  UNION ALL
    SELECT patient_id, 'IBD'                  FROM cond_flags WHERE has_IBD   UNION ALL
    SELECT patient_id, 'MS'                   FROM cond_flags WHERE has_MS    UNION ALL
    SELECT patient_id, 'PD'                   FROM cond_flags WHERE has_PD    UNION ALL
    SELECT patient_id, 'PSO'                  FROM cond_flags WHERE has_PSO   UNION ALL
    SELECT patient_id, 'PAH'                  FROM cond_flags WHERE has_PAH   UNION ALL
    SELECT patient_id, 'WND'                  FROM cond_flags WHERE has_WND   UNION ALL
    SELECT patient_id, 'LIPID'                FROM cond_flags WHERE has_LIPID
)
INSERT INTO phm_star.fact_patient_bundle
    (patient_key, bundle_key, provider_key, org_key,
     date_key_assigned, date_key_last_eval,
     total_measures, measures_met, measures_open, measures_excluded,
     compliance_pct, risk_tier)
SELECT
    dp.patient_key,
    dcb.bundle_key,
    dprov.provider_key,
    dorg.org_key,
    COALESCE(eo.date_key, TO_CHAR(CURRENT_DATE, 'YYYYMMDD')::INT),
    TO_CHAR(CURRENT_DATE, 'YYYYMMDD')::INT,
    cb.bundle_size,
    COALESCE(gs.closed_count, 0),
    COALESCE(gs.open_count,   0),
    COALESCE(gs.excluded_count, 0),
    CASE WHEN cb.bundle_size > 0
         THEN ROUND(100.0 * COALESCE(gs.closed_count, 0) / cb.bundle_size, 1)
         ELSE NULL END,
    CASE
        WHEN cb.bundle_size = 0                                                 THEN 'Low'
        WHEN COALESCE(gs.closed_count, 0)::FLOAT / cb.bundle_size < 0.20       THEN 'Critical'
        WHEN COALESCE(gs.closed_count, 0)::FLOAT / cb.bundle_size < 0.40       THEN 'High'
        WHEN COALESCE(gs.closed_count, 0)::FLOAT / cb.bundle_size < 0.65       THEN 'Medium'
        ELSE 'Low'
    END
FROM patient_bundles pb
JOIN phm_edw.patient p ON p.patient_id = pb.patient_id
JOIN phm_edw.condition_bundle cb ON cb.bundle_code = pb.bundle_code AND cb.active_ind = 'Y'
JOIN phm_star.dim_patient dp ON dp.patient_id = p.patient_id AND dp.is_current = TRUE
JOIN phm_star.dim_provider dprov ON dprov.provider_id = p.pcp_provider_id AND dprov.is_current = TRUE
LEFT JOIN phm_star.dim_organization dorg ON dorg.org_id = (
    SELECT prov2.org_id FROM phm_edw.provider prov2 WHERE prov2.provider_id = p.pcp_provider_id
) AND dorg.is_current = TRUE
JOIN phm_star.dim_care_gap_bundle dcb ON dcb.bundle_code = pb.bundle_code AND dcb.is_active = TRUE
LEFT JOIN gap_stats gs ON gs.patient_id = p.patient_id AND gs.bundle_id = cb.bundle_id
LEFT JOIN earliest_onset eo ON eo.patient_id = p.patient_id
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 21: Populate fact_patient_bundle_detail
-- One row per patient × bundle × measure (gap status)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_star.fact_patient_bundle_detail
    (patient_bundle_key, patient_key, bundle_key, measure_key,
     date_key_last_action, gap_status, is_overdue, days_overdue)
SELECT
    fpb.patient_bundle_key,
    fpb.patient_key,
    fpb.bundle_key,
    bbm.measure_key,
    -- last action date from care_gap
    COALESCE(
        TO_CHAR(cg.resolved_date, 'YYYYMMDD')::INT,
        TO_CHAR(cg.identified_date, 'YYYYMMDD')::INT
    ),
    COALESCE(cg.gap_status, 'open'),
    -- is_overdue: open gaps identified > 90 days ago
    CASE WHEN cg.gap_status = 'open'
              AND cg.identified_date < CURRENT_DATE - INTERVAL '90 days'
         THEN TRUE ELSE FALSE END,
    CASE WHEN cg.gap_status = 'open' AND cg.identified_date IS NOT NULL
         THEN (CURRENT_DATE - cg.identified_date::DATE)::INT
         ELSE NULL END
FROM phm_star.fact_patient_bundle fpb
JOIN phm_star.bridge_bundle_measure bbm ON bbm.bundle_key = fpb.bundle_key
JOIN phm_star.dim_patient dp ON dp.patient_key = fpb.patient_key
JOIN phm_edw.patient p ON p.patient_id = dp.patient_id
JOIN phm_star.dim_measure dm ON dm.measure_key = bbm.measure_key
LEFT JOIN phm_edw.care_gap cg
    ON cg.patient_id = p.patient_id
   AND cg.measure_id = dm.measure_id
WHERE fpb.is_active = TRUE
ON CONFLICT (patient_key, bundle_key, measure_key) DO UPDATE SET
    gap_status           = EXCLUDED.gap_status,
    is_overdue           = EXCLUDED.is_overdue,
    days_overdue         = EXCLUDED.days_overdue,
    date_key_last_action = EXCLUDED.date_key_last_action,
    etl_refreshed_at     = NOW();

-- ─────────────────────────────────────────────────────────────────────
-- STEP 22: Populate fact_patient_composite (set-based CTE, no LATERAL)
-- Pre-aggregate all per-patient stats then JOIN — avoids seq scans per row
-- ─────────────────────────────────────────────────────────────────────
WITH
-- Condition flags per patient (single scan)
cond_flags22 AS (
    SELECT cd.patient_id,
        BOOL_OR(c.condition_name ILIKE '%diabetes mellitus type 2%' OR c.condition_name ILIKE '%type 2 diabetes%') AS has_dm,
        BOOL_OR(c.condition_name ILIKE '%hypertension%')                                                           AS has_htn,
        BOOL_OR(c.condition_name ILIKE '%coronary artery%' OR c.condition_name ILIKE '%ischemic heart%')           AS has_cad,
        BOOL_OR(c.condition_name ILIKE '%heart failure%')                                                          AS has_hf,
        BOOL_OR(c.condition_name ILIKE '%copd%' OR c.condition_name ILIKE '%chronic obstructive%')                 AS has_copd,
        BOOL_OR(c.condition_name ILIKE '%chronic kidney disease%')                                                 AS has_ckd,
        BOOL_OR(c.condition_name ILIKE '%depress%')                                                                AS has_mdd,
        COUNT(DISTINCT cd.condition_id)::SMALLINT                                                                  AS chronic_count
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    JOIN phm_edw.patient p ON cd.patient_id = p.patient_id
    WHERE p.pcp_provider_id = (SELECT provider_id FROM phm_edw.provider WHERE email = 'dr.udoshi@medgnosis.app')
      AND p.active_ind = 'Y'
    GROUP BY cd.patient_id
),
-- Encounter utilization per patient (single scan)
enc_agg22 AS (
    SELECT e.patient_id,
        COUNT(*) FILTER (WHERE e.encounter_datetime >= CURRENT_DATE - INTERVAL '12 months') AS enc_12mo,
        MAX(e.encounter_datetime::DATE) AS last_enc_date
    FROM phm_edw.encounter e
    JOIN phm_edw.patient p ON e.patient_id = p.patient_id
    WHERE p.pcp_provider_id = (SELECT provider_id FROM phm_edw.provider WHERE email = 'dr.udoshi@medgnosis.app')
      AND p.active_ind = 'Y' AND e.active_ind = 'Y'
    GROUP BY e.patient_id
),
-- SDOH flags per patient (single scan)
sdoh_agg22 AS (
    SELECT sa.patient_id,
        BOOL_OR(sa.food_insecurity_ind = 'Y')                          AS food_insecurity,
        BOOL_OR(sa.housing_status IN ('Unstable','Homeless','At Risk')) AS housing_instability,
        BOOL_OR(sa.transportation_ind = 'Y')                           AS transportation_barrier
    FROM phm_edw.sdoh_assessment sa
    JOIN phm_edw.patient p ON sa.patient_id = p.patient_id
    WHERE p.pcp_provider_id = (SELECT provider_id FROM phm_edw.provider WHERE email = 'dr.udoshi@medgnosis.app')
      AND sa.active_ind = 'Y'
    GROUP BY sa.patient_id
),
-- Most recent payer per patient
payer_agg22 AS (
    SELECT DISTINCT ON (pic.patient_id) pic.patient_id, dp2.payer_key
    FROM phm_edw.patient_insurance_coverage pic
    JOIN phm_star.dim_payer dp2 ON dp2.payer_id = pic.payer_id AND dp2.is_current = TRUE
    ORDER BY pic.patient_id, pic.effective_start_date DESC
),
-- Bundle aggregates per patient
bundle_agg22 AS (
    SELECT fpb.patient_key,
        COUNT(*)                    AS bundle_count,
        SUM(fpb.total_measures)     AS total_due,
        SUM(fpb.measures_met)       AS total_met,
        SUM(fpb.measures_open)      AS total_open,
        CASE WHEN SUM(fpb.total_measures) > 0
             THEN ROUND(100.0 * SUM(fpb.measures_met) / SUM(fpb.total_measures), 1)
             ELSE NULL END          AS compliance_pct
    FROM phm_star.fact_patient_bundle fpb
    WHERE fpb.is_active = TRUE
    GROUP BY fpb.patient_key
),
-- Worst-performing bundle per patient
worst_bundle22 AS (
    SELECT DISTINCT ON (fpb.patient_key)
        fpb.patient_key,
        dcb.bundle_code AS worst_bundle_code,
        fpb.compliance_pct AS worst_bundle_pct
    FROM phm_star.fact_patient_bundle fpb
    JOIN phm_star.dim_care_gap_bundle dcb ON dcb.bundle_key = fpb.bundle_key
    WHERE fpb.is_active = TRUE
    ORDER BY fpb.patient_key, fpb.compliance_pct ASC NULLS LAST
)
INSERT INTO phm_star.fact_patient_composite
    (patient_key, provider_key, org_key, payer_key,
     age, gender, race, primary_language,
     active_bundle_count, total_measures_due, total_measures_met, total_measures_open,
     overall_compliance_pct, worst_bundle_code, worst_bundle_pct,
     has_diabetes, has_hypertension, has_cad, has_heart_failure,
     has_copd, has_ckd, has_depression, chronic_condition_count,
     encounters_last_12mo, days_since_last_visit, last_encounter_date_key,
     food_insecurity, housing_instability, transportation_barrier,
     mips_eligible, date_key_snapshot)
SELECT
    dp.patient_key,
    dprov.provider_key,
    dorg.org_key,
    pa.payer_key,
    DATE_PART('year', AGE(p.date_of_birth))::SMALLINT,
    p.gender,
    p.race,
    p.primary_language,
    COALESCE(ba.bundle_count, 0),
    COALESCE(ba.total_due, 0),
    COALESCE(ba.total_met, 0),
    COALESCE(ba.total_open, 0),
    ba.compliance_pct,
    wb.worst_bundle_code,
    wb.worst_bundle_pct,
    COALESCE(cf.has_dm,   FALSE),
    COALESCE(cf.has_htn,  FALSE),
    COALESCE(cf.has_cad,  FALSE),
    COALESCE(cf.has_hf,   FALSE),
    COALESCE(cf.has_copd, FALSE),
    COALESCE(cf.has_ckd,  FALSE),
    COALESCE(cf.has_mdd,  FALSE),
    COALESCE(cf.chronic_count, 0),
    COALESCE(ea.enc_12mo, 0),
    CASE WHEN ea.last_enc_date IS NOT NULL THEN (CURRENT_DATE - ea.last_enc_date)::INT ELSE NULL END,
    CASE WHEN ea.last_enc_date IS NOT NULL THEN REPLACE(ea.last_enc_date::TEXT, '-', '')::INT ELSE NULL END,
    COALESCE(sd.food_insecurity,     FALSE),
    COALESCE(sd.housing_instability, FALSE),
    COALESCE(sd.transportation_barrier, FALSE),
    TRUE,
    TO_CHAR(CURRENT_DATE, 'YYYYMMDD')::INT
FROM phm_edw.patient p
JOIN phm_star.dim_patient dp ON dp.patient_id = p.patient_id AND dp.is_current = TRUE
JOIN phm_edw.provider prov ON prov.provider_id = p.pcp_provider_id
JOIN phm_star.dim_provider dprov ON dprov.provider_id = p.pcp_provider_id AND dprov.is_current = TRUE
LEFT JOIN phm_star.dim_organization dorg ON dorg.org_id = prov.org_id AND dorg.is_current = TRUE
LEFT JOIN payer_agg22   pa ON pa.patient_id = p.patient_id
LEFT JOIN bundle_agg22  ba ON ba.patient_key = dp.patient_key
LEFT JOIN worst_bundle22 wb ON wb.patient_key = dp.patient_key
LEFT JOIN cond_flags22  cf ON cf.patient_id = p.patient_id
LEFT JOIN enc_agg22     ea ON ea.patient_id = p.patient_id
LEFT JOIN sdoh_agg22    sd ON sd.patient_id = p.patient_id
WHERE p.pcp_provider_id = (SELECT provider_id FROM phm_edw.provider WHERE email = 'dr.udoshi@medgnosis.app')
  AND p.active_ind = 'Y'
ON CONFLICT (patient_key) DO UPDATE SET
    active_bundle_count     = EXCLUDED.active_bundle_count,
    total_measures_due      = EXCLUDED.total_measures_due,
    total_measures_met      = EXCLUDED.total_measures_met,
    total_measures_open     = EXCLUDED.total_measures_open,
    overall_compliance_pct  = EXCLUDED.overall_compliance_pct,
    worst_bundle_code       = EXCLUDED.worst_bundle_code,
    worst_bundle_pct        = EXCLUDED.worst_bundle_pct,
    has_diabetes            = EXCLUDED.has_diabetes,
    has_hypertension        = EXCLUDED.has_hypertension,
    has_cad                 = EXCLUDED.has_cad,
    has_heart_failure       = EXCLUDED.has_heart_failure,
    has_copd                = EXCLUDED.has_copd,
    has_ckd                 = EXCLUDED.has_ckd,
    has_depression          = EXCLUDED.has_depression,
    chronic_condition_count = EXCLUDED.chronic_condition_count,
    encounters_last_12mo    = EXCLUDED.encounters_last_12mo,
    days_since_last_visit   = EXCLUDED.days_since_last_visit,
    last_encounter_date_key = EXCLUDED.last_encounter_date_key,
    food_insecurity         = EXCLUDED.food_insecurity,
    housing_instability     = EXCLUDED.housing_instability,
    transportation_barrier  = EXCLUDED.transportation_barrier,
    etl_refreshed_at        = NOW();

-- ─────────────────────────────────────────────────────────────────────
-- STEP 23: Populate fact_ai_risk_score from public.patient_risk_history
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_star.fact_ai_risk_score
    (patient_key, risk_model_key, date_key_scored, score_value, score_percentile, risk_tier)
SELECT
    dp.patient_key,
    rm.risk_model_key,
    TO_CHAR(prh.computed_at::DATE, 'YYYYMMDD')::INT,
    prh.score,
    ROUND(NTILE(100) OVER (PARTITION BY rm.risk_model_key ORDER BY prh.score) * 1.0, 1),
    CASE
        WHEN prh.score >= 80 THEN 'Critical'
        WHEN prh.score >= 60 THEN 'High'
        WHEN prh.score >= 30 THEN 'Medium'
        ELSE 'Low'
    END
FROM public.patient_risk_history prh
JOIN phm_edw.patient p ON p.patient_id = prh.patient_id
JOIN phm_star.dim_patient dp ON dp.patient_id = p.patient_id AND dp.is_current = TRUE
CROSS JOIN LATERAL (
    SELECT risk_model_key FROM phm_star.dim_risk_model WHERE model_code = 'ABIGAIL_COMP' LIMIT 1
) rm
WHERE p.pcp_provider_id = (SELECT provider_id FROM phm_edw.provider WHERE email = 'dr.udoshi@medgnosis.app')
  AND p.active_ind = 'Y'
ON CONFLICT (patient_key, risk_model_key, date_key_scored) DO NOTHING;

-- Update fact_patient_composite with AI risk scores
UPDATE phm_star.fact_patient_composite fpc
SET
    abigail_priority_score = sub.latest_score,
    risk_tier = CASE
        WHEN sub.latest_score >= 80 THEN 'Critical'
        WHEN sub.latest_score >= 60 THEN 'High'
        WHEN sub.latest_score >= 30 THEN 'Medium'
        ELSE 'Low'
    END,
    etl_refreshed_at = NOW()
FROM (
    SELECT DISTINCT ON (patient_key)
        patient_key, score_value AS latest_score
    FROM phm_star.fact_ai_risk_score
    WHERE risk_model_key = (SELECT risk_model_key FROM phm_star.dim_risk_model WHERE model_code = 'ABIGAIL_COMP')
    ORDER BY patient_key, date_key_scored DESC
) sub
WHERE fpc.patient_key = sub.patient_key;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 24: Populate fact_population_snapshot (today's snapshot)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_star.fact_population_snapshot
    (org_key, date_key_snapshot, bundle_key, provider_key,
     total_patients, patients_with_bundle,
     avg_compliance_pct, open_gaps_total, closed_gaps_total,
     high_risk_patients, critical_risk_patients,
     avg_hcc_score, avg_chronic_conditions, sdoh_flagged_patients)
SELECT
    dorg.org_key,
    TO_CHAR(CURRENT_DATE, 'YYYYMMDD')::INT,
    fpb.bundle_key,
    dprov.provider_key,
    COUNT(DISTINCT fpc.patient_key)                                             AS total_patients,
    COUNT(DISTINCT fpb.patient_key)                                             AS patients_with_bundle,
    ROUND(AVG(fpb.compliance_pct), 1)                                           AS avg_compliance_pct,
    SUM(fpb.measures_open)                                                      AS open_gaps_total,
    SUM(fpb.measures_met)                                                       AS closed_gaps_total,
    COUNT(*) FILTER (WHERE fpb.risk_tier = 'High')                              AS high_risk_patients,
    COUNT(*) FILTER (WHERE fpb.risk_tier = 'Critical')                          AS critical_risk_patients,
    ROUND(AVG(fpc.hcc_risk_score), 3)                                           AS avg_hcc_score,
    ROUND(AVG(fpc.chronic_condition_count), 1)                                  AS avg_chronic_conditions,
    COUNT(*) FILTER (WHERE fpc.food_insecurity OR fpc.housing_instability OR fpc.transportation_barrier) AS sdoh_flagged_patients
FROM phm_star.fact_patient_bundle fpb
JOIN phm_star.fact_patient_composite fpc ON fpc.patient_key = fpb.patient_key
JOIN phm_star.dim_provider dprov ON dprov.provider_key = fpc.provider_key
JOIN phm_star.dim_organization dorg ON dorg.org_key = fpc.org_key
WHERE fpb.is_active = TRUE
GROUP BY dorg.org_key, fpb.bundle_key, dprov.provider_key;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 25: Populate fact_provider_quality from quality_score
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_star.fact_provider_quality
    (provider_key, org_key, bundle_key, date_key_period, reporting_year,
     attributed_patients, patients_with_bundle, total_gaps_open, total_gaps_closed,
     compliance_rate, mips_quality_score)
SELECT
    dprov.provider_key,
    dorg.org_key,
    dcb.bundle_key,
    TO_CHAR(qrp.start_date, 'YYYYMMDD')::INT,
    qrp.reporting_year,
    (SELECT COUNT(*) FROM phm_edw.patient WHERE pcp_provider_id = qs.provider_id),
    COALESCE(qs.denominator_count, 0),
    COALESCE(qs.denominator_count - qs.numerator_count, 0),
    COALESCE(qs.numerator_count, 0),
    COALESCE(qs.performance_rate, 0),
    COALESCE(qs.performance_score, 0)
FROM phm_edw.quality_score qs
JOIN phm_edw.quality_reporting_period qrp ON qrp.period_id = qs.period_id
JOIN phm_edw.provider prov ON prov.provider_id = qs.provider_id
JOIN phm_star.dim_provider dprov ON dprov.provider_id = qs.provider_id AND dprov.is_current = TRUE
LEFT JOIN phm_star.dim_organization dorg ON dorg.org_id = prov.org_id AND dorg.is_current = TRUE
LEFT JOIN phm_edw.condition_bundle cb ON cb.bundle_id = qs.bundle_id
LEFT JOIN phm_star.dim_care_gap_bundle dcb ON dcb.bundle_id = qs.bundle_id AND dcb.is_active = TRUE
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 26: Refresh all materialized views
-- ─────────────────────────────────────────────────────────────────────
REFRESH MATERIALIZED VIEW phm_star.mv_population_by_condition;
REFRESH MATERIALIZED VIEW phm_star.mv_provider_scorecard;
REFRESH MATERIALIZED VIEW phm_star.mv_patient_risk_tier;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 27: Log ETL completion and validate key counts
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_patient_count       INT;
    v_bundle_rows         INT;
    v_composite_rows      INT;
    v_detail_rows         INT;
    v_pop_snapshot_rows   INT;
BEGIN
    SELECT COUNT(*) INTO v_patient_count
    FROM phm_edw.patient WHERE pcp_provider_id = (
        SELECT provider_id FROM phm_edw.provider WHERE email = 'dr.udoshi@medgnosis.app');

    SELECT COUNT(*) INTO v_bundle_rows
    FROM phm_star.fact_patient_bundle WHERE is_active = TRUE;

    SELECT COUNT(*) INTO v_composite_rows
    FROM phm_star.fact_patient_composite;

    SELECT COUNT(*) INTO v_detail_rows
    FROM phm_star.fact_patient_bundle_detail;

    SELECT COUNT(*) INTO v_pop_snapshot_rows
    FROM phm_star.fact_population_snapshot;

    RAISE NOTICE '=== ETL Steps 16–27 Complete ===';
    RAISE NOTICE 'Dr. Udoshi patient panel: %', v_patient_count;
    RAISE NOTICE 'fact_patient_bundle rows: %', v_bundle_rows;
    RAISE NOTICE 'fact_patient_composite rows: %', v_composite_rows;
    RAISE NOTICE 'fact_patient_bundle_detail rows: %', v_detail_rows;
    RAISE NOTICE 'fact_population_snapshot rows: %', v_pop_snapshot_rows;
    RAISE NOTICE 'All materialized views refreshed.';

    INSERT INTO phm_edw.etl_log (source_system, load_start_timestamp, load_end_timestamp, rows_inserted, load_status)
    VALUES (
        'ETL_STEPS_16_27',
        NOW(),
        NOW(),
        v_bundle_rows + v_composite_rows + v_detail_rows,
        'SUCCESS'
    );
END $$;
