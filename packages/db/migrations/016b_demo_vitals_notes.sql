-- =====================================================================
-- 016b_demo_vitals_notes.sql
-- Phase: Demo Account — Vital Signs, Clinical Notes, Encounter Dx Codes
-- Rewrite of migration 016 Parts B, C, D using set-based INSERTs
-- (Part A problem list already applied via 016_demo_patient_core.sql)
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- PART B (fast): Vital Signs — set-based INSERT using CTE
-- One vital_sign row per encounter (2023-01-01 onward)
-- ─────────────────────────────────────────────────────────────────────
WITH patient_conditions AS (
    SELECT
        p.patient_id,
        BOOL_OR(c.condition_name ILIKE '%hypertension%')                                                              AS has_htn,
        BOOL_OR(c.condition_name ILIKE '%copd%' OR c.condition_name ILIKE '%pulmonary disease%')                      AS has_copd,
        BOOL_OR(c.condition_name ILIKE '%diabetes mellitus type%' OR c.condition_name ILIKE '%type 2 diabetes%')      AS has_dm,
        BOOL_OR(c.condition_name ILIKE '%heart failure%')                                                             AS has_hf,
        BOOL_OR(c.condition_name ILIKE '%obesity%' OR c.condition_name ILIKE '%BMI 30%')                              AS has_obese,
        BOOL_OR(c.condition_name ILIKE '%atrial fibrillation%')                                                       AS has_afib
    FROM phm_edw.patient p
    JOIN phm_edw.condition_diagnosis cd ON cd.patient_id = p.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE p.pcp_provider_id = 2816
    GROUP BY p.patient_id
),
enc_base AS (
    SELECT
        e.encounter_id,
        e.patient_id,
        e.encounter_datetime,
        p.gender,
        COALESCE(pc.has_htn,   FALSE) AS has_htn,
        COALESCE(pc.has_copd,  FALSE) AS has_copd,
        COALESCE(pc.has_dm,    FALSE) AS has_dm,
        COALESCE(pc.has_hf,    FALSE) AS has_hf,
        COALESCE(pc.has_obese, FALSE) AS has_obese,
        COALESCE(pc.has_afib,  FALSE) AS has_afib,
        (p.patient_id % 37)           AS v_off,
        EXTRACT(EPOCH FROM e.encounter_datetime)::BIGINT % 3 AS ep3,
        EXTRACT(EPOCH FROM e.encounter_datetime)::BIGINT % 4 AS ep4,
        EXTRACT(EPOCH FROM e.encounter_datetime)::BIGINT % 5 AS ep5
    FROM phm_edw.encounter e
    JOIN phm_edw.patient p ON e.patient_id = p.patient_id
    LEFT JOIN patient_conditions pc ON pc.patient_id = p.patient_id
    WHERE p.pcp_provider_id = 2816
      AND e.encounter_datetime >= '2023-01-01'
      AND e.active_ind = 'Y'
),
enc_computed AS (
    SELECT
        eb.*,
        -- Pre-compute weight and height for BMI calculation
        CASE WHEN has_obese THEN 195.0 + (v_off % 80)
             WHEN gender = 'M' THEN 155.0 + (v_off % 50)
             ELSE 130.0 + (v_off % 40) END  AS weight_val,
        CASE WHEN gender = 'M' THEN 67.0 + (v_off % 8)
             ELSE 62.0 + (v_off % 7) END    AS height_val
    FROM enc_base eb
)
INSERT INTO phm_edw.vital_sign (
    patient_id, encounter_id, recorded_by, recorded_datetime,
    bp_systolic, bp_diastolic, bp_position,
    heart_rate, heart_rhythm,
    temperature_f, temp_route,
    respiratory_rate,
    spo2_percent, o2_delivery,
    weight_lbs, height_in, bmi,
    pain_score
)
SELECT
    ec.patient_id,
    ec.encounter_id,
    2816,
    ec.encounter_datetime,
    -- BP systolic
    CASE WHEN ec.has_htn THEN
             CASE WHEN ec.ep3 = 0 THEN 118 + (ec.v_off % 16)
                  ELSE                 128 + (ec.v_off % 45) END
         ELSE 108 + (ec.v_off % 22) END,
    -- BP diastolic
    CASE WHEN ec.has_htn THEN
             CASE WHEN ec.ep3 = 0 THEN 72 + (ec.v_off % 12)
                  ELSE                 78 + (ec.v_off % 22) END
         ELSE 65 + (ec.v_off % 15) END,
    'sitting',
    -- Heart rate
    CASE WHEN ec.has_afib THEN 65 + (ec.v_off % 55)
         WHEN ec.has_hf   THEN 72 + (ec.v_off % 28)
         ELSE                  58 + (ec.v_off % 32) END,
    -- Heart rhythm
    CASE WHEN ec.has_afib THEN 'Irregular' ELSE 'Regular' END,
    -- Temperature
    ROUND((97.8 + (ec.v_off % 12) * 0.1)::NUMERIC, 1),
    'oral',
    -- Respiratory rate
    CASE WHEN ec.has_copd AND ec.ep4 = 0 THEN 20 + (ec.v_off % 6)
         ELSE 14 + (ec.v_off % 5) END,
    -- SpO2
    CASE WHEN ec.has_copd AND ec.ep5 = 0 THEN ROUND((88.0 + (ec.v_off % 5))::NUMERIC, 2)
         ELSE ROUND((95.0 + (ec.v_off % 5))::NUMERIC, 2) END,
    'Room Air',
    -- Weight, Height, BMI
    ROUND(ec.weight_val::NUMERIC, 2),
    ROUND(ec.height_val::NUMERIC, 2),
    ROUND((703.0 * ec.weight_val / (ec.height_val * ec.height_val))::NUMERIC, 1),
    -- Pain score
    CASE (ec.v_off % 3)
        WHEN 0 THEN 0
        WHEN 1 THEN ec.v_off % 4
        ELSE        2 + (ec.v_off % 5)
    END
FROM enc_computed ec
WHERE NOT EXISTS (
    SELECT 1 FROM phm_edw.vital_sign vs WHERE vs.encounter_id = ec.encounter_id
);

DO $$ BEGIN RAISE NOTICE 'Vital signs inserted'; END $$;

-- ─────────────────────────────────────────────────────────────────────
-- PART C (fast): Clinical Notes — set-based INSERT using CTE
-- One SOAP note per encounter (2023-01-01 onward)
-- ─────────────────────────────────────────────────────────────────────
WITH patient_conditions AS (
    SELECT
        p.patient_id,
        BOOL_OR(c.condition_name ILIKE '%diabetes mellitus type%' OR c.condition_name ILIKE '%type 2 diabetes%') AS has_dm,
        BOOL_OR(c.condition_name ILIKE '%hypertension%')                                                         AS has_htn,
        BOOL_OR(c.condition_name ILIKE '%copd%' OR c.condition_name ILIKE '%pulmonary disease%')                 AS has_copd,
        BOOL_OR(c.condition_name ILIKE '%heart failure%')                                                        AS has_hf,
        BOOL_OR(c.condition_name ILIKE '%depress%')                                                              AS has_mdd,
        BOOL_OR(c.condition_name ILIKE '%chronic kidney disease%' OR c.condition_name ILIKE '%kidney failure%')  AS has_ckd
    FROM phm_edw.patient p
    JOIN phm_edw.condition_diagnosis cd ON cd.patient_id = p.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE p.pcp_provider_id = 2816
    GROUP BY p.patient_id
),
enc_notes AS (
    SELECT
        e.encounter_id,
        e.patient_id,
        e.encounter_datetime,
        e.encounter_type,
        e.encounter_reason,
        p.first_name,
        p.last_name,
        p.gender,
        DATE_PART('year', AGE(p.date_of_birth))::INT AS age,
        COALESCE(pc.has_dm,   FALSE) AS has_dm,
        COALESCE(pc.has_htn,  FALSE) AS has_htn,
        COALESCE(pc.has_copd, FALSE) AS has_copd,
        COALESCE(pc.has_hf,   FALSE) AS has_hf,
        COALESCE(pc.has_mdd,  FALSE) AS has_mdd,
        COALESCE(pc.has_ckd,  FALSE) AS has_ckd,
        -- Determine note category
        CASE
            WHEN e.encounter_type = 'wellness'                  THEN 'WELLNESS'
            WHEN e.encounter_type IN ('urgentcare','emergency') THEN 'URGENT'
            WHEN e.encounter_type = 'virtual'                   THEN 'TELEHEALTH'
            WHEN COALESCE(pc.has_dm,   FALSE)                   THEN 'DM'
            WHEN COALESCE(pc.has_hf,   FALSE)                   THEN 'HF'
            WHEN COALESCE(pc.has_copd, FALSE)                   THEN 'COPD'
            WHEN COALESCE(pc.has_ckd,  FALSE)                   THEN 'CKD'
            WHEN COALESCE(pc.has_mdd,  FALSE)                   THEN 'MDD'
            WHEN COALESCE(pc.has_htn,  FALSE)                   THEN 'HTN'
            ELSE 'GENERAL'
        END AS dx_cat
    FROM phm_edw.encounter e
    JOIN phm_edw.patient p ON e.patient_id = p.patient_id
    LEFT JOIN patient_conditions pc ON pc.patient_id = p.patient_id
    WHERE p.pcp_provider_id = 2816
      AND e.encounter_datetime >= '2023-01-01'
      AND e.active_ind = 'Y'
)
INSERT INTO phm_edw.clinical_note (
    patient_id, encounter_id, author_user_id, visit_type, status,
    chief_complaint, subjective, objective, assessment, plan_text,
    finalized_at, active_ind
)
SELECT
    en.patient_id,
    en.encounter_id,
    au.id,
    CASE en.encounter_type WHEN 'wellness' THEN 'wellness' WHEN 'virtual' THEN 'telehealth' ELSE 'followup' END,
    'signed',
    COALESCE(en.encounter_reason, 'Follow-up visit'),
    -- Subjective
    CASE en.dx_cat
        WHEN 'DM'      THEN FORMAT('%s %s, a %s-year-old with T2DM, presents for diabetes follow-up. Reports adherence to metformin. Home fasting glucose 110–180 mg/dL. No hypoglycemic episodes. No new visual changes or foot symptoms.', en.first_name, en.last_name, en.age)
        WHEN 'HTN'     THEN FORMAT('%s %s, a %s-year-old, presents for hypertension management. Takes antihypertensive medications as prescribed. Home BP averaging 138/86 mmHg. Denies headache, chest pain, or visual changes.', en.first_name, en.last_name, en.age)
        WHEN 'COPD'    THEN FORMAT('%s %s, a %s-year-old with COPD, presents for routine follow-up. Stable symptoms. Uses rescue inhaler 2–3×/week. Dyspnea on moderate exertion (mMRC 2). No recent exacerbations. Former smoker.', en.first_name, en.last_name, en.age)
        WHEN 'HF'      THEN FORMAT('%s %s, a %s-year-old with heart failure, presents for follow-up. Reports mild lower extremity edema, improved. Dyspnea on exertion (NYHA II). Compliant with fluid restriction. No orthopnea.', en.first_name, en.last_name, en.age)
        WHEN 'MDD'     THEN FORMAT('%s %s, a %s-year-old, presents for depression follow-up. Reports improved mood on current medication. PHQ-9 score 8 today (down from 14). Sleeping better. No suicidal ideation.', en.first_name, en.last_name, en.age)
        WHEN 'CKD'     THEN FORMAT('%s %s, a %s-year-old with CKD, presents for nephrology monitoring. Recent labs show eGFR stable. No new urinary symptoms. Medication compliant. Dietary protein restriction maintained.', en.first_name, en.last_name, en.age)
        WHEN 'WELLNESS' THEN FORMAT('%s %s, a %s-year-old, presents for annual wellness visit. No acute complaints. Exercises 3×/week. Non-smoker. Occasional alcohol use. Requests review of medications and preventive screenings.', en.first_name, en.last_name, en.age)
        WHEN 'URGENT'  THEN FORMAT('%s %s, a %s-year-old, presents urgently. Chief complaint: %s. Onset acute. No fever or recent travel.', en.first_name, en.last_name, en.age, COALESCE(en.encounter_reason, 'acute illness'))
        WHEN 'TELEHEALTH' THEN FORMAT('%s %s, a %s-year-old, presents via telehealth for medication management. Doing well overall. No urgent concerns. Requests prescription refills.', en.first_name, en.last_name, en.age)
        ELSE FORMAT('%s %s, a %s-year-old, presents for follow-up. Doing well overall. No significant new complaints.', en.first_name, en.last_name, en.age)
    END,
    -- Objective
    CASE en.dx_cat
        WHEN 'DM'      THEN 'Alert, oriented, no acute distress. CV: RRR, no murmurs. Pulm: CTAB. Feet: intact skin, no ulcerations, monofilament sensation intact bilaterally. Labs pending: HbA1c ordered.'
        WHEN 'HTN'     THEN 'Alert, well-appearing. CV: RRR, S1 S2 normal. Pulm: clear. Extremities: no significant edema. BMP ordered.'
        WHEN 'COPD'    THEN 'Alert. Mild expiratory wheeze on auscultation. Prolonged expiratory phase. No accessory muscle use. SpO2 reviewed. GOLD II–III.'
        WHEN 'HF'      THEN 'Alert, mildly dyspneic. JVD: mild. CV: S3 gallop present. Pulm: bibasilar crackles. 1+ pitting edema bilateral ankles.'
        WHEN 'MDD'     THEN 'Alert, appropriate affect, improved eye contact. Mood: euthymic. Thought process: linear. PHQ-9 administered: score recorded. No active SI/HI.'
        WHEN 'CKD'     THEN 'Alert, well-appearing. No pallor. CV: RRR. Pulm: clear. No peripheral edema. eGFR trend stable, creatinine unchanged. BP well-controlled.'
        WHEN 'WELLNESS' THEN 'Alert, well-appearing. Age-appropriate exam performed. HEENT: normocephalic, PERRLA. CV: RRR. Pulm: CTAB. Abd: soft, NT, ND. Skin: no lesions. Neuro: intact.'
        ELSE 'Alert, oriented ×3. No acute distress. Vitals reviewed. Physical exam appropriate to chief complaint.'
    END,
    -- Assessment
    CASE en.dx_cat
        WHEN 'DM'       THEN 'Type 2 Diabetes Mellitus (E11.9) — suboptimally controlled. Nephropathy screening current.'
        WHEN 'HTN'      THEN 'Essential Hypertension (I10) — approaching goal. Medication compliance confirmed.'
        WHEN 'COPD'     THEN 'COPD, moderate severity (J44.1) — stable. Inhaler technique reviewed.'
        WHEN 'HF'       THEN 'Systolic Heart Failure (I50.20) — NYHA Class II, stable on current regimen.'
        WHEN 'MDD'      THEN 'Major Depressive Disorder (F32.1), moderate — improving on current therapy.'
        WHEN 'CKD'      THEN 'Chronic Kidney Disease, Stage 3 (N18.3) — stable GFR. Conservative management continuing.'
        WHEN 'WELLNESS' THEN 'Annual Wellness Visit — preventive screenings reviewed and updated.'
        WHEN 'URGENT'   THEN FORMAT('Acute: %s — evaluated and managed.', COALESCE(en.encounter_reason, 'acute illness'))
        WHEN 'TELEHEALTH' THEN 'Telehealth visit for medication management — stable, prescriptions renewed.'
        ELSE 'Follow-up visit — stable chronic conditions. No acute issues.'
    END,
    -- Plan
    CASE en.dx_cat
        WHEN 'DM'  THEN '1. Continue Metformin 1000mg BID.' || E'\n' || '2. HbA1c ordered today.' || E'\n' || '3. Annual dilated eye exam — referral placed.' || E'\n' || '4. Foot exam completed. Continue daily foot inspection.' || E'\n' || '5. Return in 3 months.'
        WHEN 'HTN' THEN '1. Continue Lisinopril 10mg daily.' || E'\n' || '2. BMP ordered.' || E'\n' || '3. Sodium restriction <2g/day reinforced.' || E'\n' || '4. Home BP goal <130/80.' || E'\n' || '5. Return in 6–8 weeks.'
        WHEN 'COPD' THEN '1. Continue Tiotropium daily.' || E'\n' || '2. Rescue inhaler (Albuterol PRN) — technique reviewed.' || E'\n' || '3. Annual influenza vaccine administered.' || E'\n' || '4. COPD action plan reviewed. Return in 3 months.'
        WHEN 'HF'  THEN '1. Continue Carvedilol 12.5mg BID and Furosemide 40mg daily.' || E'\n' || '2. BMP ordered.' || E'\n' || '3. Echo ordered.' || E'\n' || '4. Fluid restriction <2L/day reinforced.' || E'\n' || '5. Return in 6–8 weeks.'
        WHEN 'MDD' THEN '1. Continue Sertraline 100mg daily.' || E'\n' || '2. PHQ-9: 8 today — continue current dose.' || E'\n' || '3. CBT ongoing — continue.' || E'\n' || '4. Safety plan reviewed.' || E'\n' || '5. Return in 4 weeks.'
        WHEN 'CKD' THEN '1. Continue ACE inhibitor.' || E'\n' || '2. BMP + phosphorus + PTH ordered.' || E'\n' || '3. Protein restriction 0.8g/kg/day.' || E'\n' || '4. Nephrology follow-up in 3 months.'
        WHEN 'WELLNESS' THEN '1. Preventive screenings ordered.' || E'\n' || '2. Vaccinations updated.' || E'\n' || '3. Healthy lifestyle counseling.' || E'\n' || '4. Labs: CBC, CMP, lipids.' || E'\n' || '5. Return for AWV in 12 months.'
        ELSE '1. Medications reviewed and renewed.' || E'\n' || '2. Labs ordered as indicated.' || E'\n' || '3. Patient educated on condition management.' || E'\n' || '4. Follow-up in 3–6 months.'
    END,
    en.encounter_datetime + INTERVAL '1 hour',
    'Y'
FROM enc_notes en
CROSS JOIN LATERAL (
    SELECT id FROM public.app_users WHERE email = 'dr.udoshi@medgnosis.app' LIMIT 1
) au
WHERE NOT EXISTS (
    SELECT 1 FROM phm_edw.clinical_note cn WHERE cn.encounter_id = en.encounter_id
);

DO $$ BEGIN RAISE NOTICE 'Clinical notes inserted'; END $$;

-- ─────────────────────────────────────────────────────────────────────
-- PART D: Encounter Diagnosis Codes — CPT per encounter
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.encounter_diagnosis_code
    (encounter_id, patient_id, icd10_code, icd10_description, diagnosis_pointer, cpt_code, is_billable)
SELECT
    e.encounter_id,
    e.patient_id,
    COALESCE(dx.mapped_icd10, 'Z00.00'),
    COALESCE(dx.condition_name, 'Annual wellness exam'),
    1,
    CASE e.encounter_type
        WHEN 'wellness'   THEN '99395'
        WHEN 'virtual'    THEN '99442'
        WHEN 'urgentcare' THEN '99213'
        WHEN 'emergency'  THEN '99283'
        ELSE CASE ((e.patient_id + e.encounter_id) % 3)
            WHEN 0 THEN '99213'
            WHEN 1 THEN '99214'
            ELSE        '99215'
        END
    END,
    TRUE
FROM phm_edw.encounter e
JOIN phm_edw.patient p ON e.patient_id = p.patient_id
LEFT JOIN LATERAL (
    SELECT
        c.condition_name,
        CASE
            WHEN c.condition_name ILIKE '%hypertension%'              THEN 'I10'
            WHEN c.condition_name ILIKE '%diabetes mellitus type 2%'  THEN 'E11.9'
            WHEN c.condition_name ILIKE '%chronic kidney disease%'    THEN 'N18.3'
            WHEN c.condition_name ILIKE '%heart failure%'             THEN 'I50.9'
            WHEN c.condition_name ILIKE '%atrial fibrillation%'      THEN 'I48.91'
            WHEN c.condition_name ILIKE '%copd%'                     THEN 'J44.1'
            WHEN c.condition_name ILIKE '%obesity%'                  THEN 'E66.9'
            WHEN c.condition_name ILIKE '%depress%'                  THEN 'F32.1'
            ELSE 'Z00.00'
        END AS mapped_icd10
    FROM phm_edw.condition_diagnosis cd2
    JOIN phm_edw.condition c ON cd2.condition_id = c.condition_id
    WHERE cd2.patient_id = e.patient_id
      AND c.condition_name NOT ILIKE '%finding%'
      AND c.condition_name NOT ILIKE '%situation%'
    ORDER BY cd2.onset_date DESC
    LIMIT 1
) dx ON TRUE
WHERE p.pcp_provider_id = 2816
  AND e.encounter_datetime >= '2023-01-01'
  AND e.active_ind = 'Y'
ON CONFLICT DO NOTHING;

-- Final count report
DO $$
DECLARE v_cnt INT;
BEGIN
    SELECT COUNT(*) INTO v_cnt FROM phm_edw.problem_list pl
    JOIN phm_edw.patient p ON pl.patient_id = p.patient_id WHERE p.pcp_provider_id = 2816;
    RAISE NOTICE 'Problem list rows: %', v_cnt;

    SELECT COUNT(*) INTO v_cnt FROM phm_edw.vital_sign vs
    JOIN phm_edw.patient p ON vs.patient_id = p.patient_id WHERE p.pcp_provider_id = 2816;
    RAISE NOTICE 'Vital sign rows: %', v_cnt;

    SELECT COUNT(*) INTO v_cnt FROM phm_edw.clinical_note cn
    JOIN phm_edw.patient p ON cn.patient_id = p.patient_id WHERE p.pcp_provider_id = 2816;
    RAISE NOTICE 'Clinical note rows: %', v_cnt;

    SELECT COUNT(*) INTO v_cnt FROM phm_edw.encounter_diagnosis_code edc
    JOIN phm_edw.encounter e ON edc.encounter_id = e.encounter_id
    JOIN phm_edw.patient p ON e.patient_id = p.patient_id WHERE p.pcp_provider_id = 2816;
    RAISE NOTICE 'Encounter diagnosis code rows: %', v_cnt;
END $$;
