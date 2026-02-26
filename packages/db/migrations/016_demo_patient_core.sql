-- =====================================================================
-- 016_demo_patient_core.sql
-- Phase: Demo Account — Problem List, Vital Signs, Clinical Notes
-- Augments existing Synthea SNOMED-coded data for Dr. Udoshi's 1,288 patients
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- PART A: Problem List — derived from condition_diagnosis (SNOMED names)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO phm_edw.problem_list
    (patient_id, condition_id, problem_name, icd10_code, onset_date,
     problem_status, problem_type, severity, provider_id)
SELECT DISTINCT ON (cd.patient_id, cd.condition_id)
    cd.patient_id,
    cd.condition_id,
    c.condition_name,
    -- Map SNOMED names to ICD-10 for the problem list icd10_code field
    CASE
        WHEN c.condition_name ILIKE '%hypertension%'                 THEN 'I10'
        WHEN c.condition_name ILIKE '%diabetes mellitus type 2%'     THEN 'E11.9'
        WHEN c.condition_name ILIKE '%diabetes mellitus type 1%'     THEN 'E10.9'
        WHEN c.condition_name ILIKE '%prediabetes%'                  THEN 'R73.09'
        WHEN c.condition_name ILIKE '%chronic kidney disease%'
          AND c.condition_name ILIKE '%stage 1%'                     THEN 'N18.1'
        WHEN c.condition_name ILIKE '%chronic kidney disease%'
          AND c.condition_name ILIKE '%stage 2%'                     THEN 'N18.2'
        WHEN c.condition_name ILIKE '%chronic kidney disease%'
          AND c.condition_name ILIKE '%stage 3%'                     THEN 'N18.3'
        WHEN c.condition_name ILIKE '%chronic kidney disease%'
          AND c.condition_name ILIKE '%stage 4%'                     THEN 'N18.4'
        WHEN c.condition_name ILIKE '%chronic kidney disease%'
          AND c.condition_name ILIKE '%stage 5%'                     THEN 'N18.5'
        WHEN c.condition_name ILIKE '%kidney%'                       THEN 'N18.9'
        WHEN c.condition_name ILIKE '%heart failure%'                THEN 'I50.9'
        WHEN c.condition_name ILIKE '%atrial fibrillation%'         THEN 'I48.91'
        WHEN c.condition_name ILIKE '%copd%'
          OR c.condition_name ILIKE '%pulmonary disease%'           THEN 'J44.1'
        WHEN c.condition_name ILIKE '%obesity%'
          OR c.condition_name ILIKE '%BMI 30%'                      THEN 'E66.9'
        WHEN c.condition_name ILIKE '%depress%'                     THEN 'F32.1'
        WHEN c.condition_name ILIKE '%anxiety%'                     THEN 'F41.1'
        WHEN c.condition_name ILIKE '%coronary%'                    THEN 'I25.10'
        WHEN c.condition_name ILIKE '%asthma%'                      THEN 'J45.40'
        WHEN c.condition_name ILIKE '%hyperlipidemia%'
          OR c.condition_name ILIKE '%dyslipidemia%'                THEN 'E78.5'
        WHEN c.condition_name ILIKE '%hypothyroid%'                 THEN 'E03.9'
        WHEN c.condition_name ILIKE '%osteoporosis%'                THEN 'M81.0'
        WHEN c.condition_name ILIKE '%osteoarthritis%'              THEN 'M17.9'
        WHEN c.condition_name ILIKE '%pain%'                        THEN 'G89.29'
        ELSE NULL
    END,
    cd.onset_date,
    'Active',
    CASE
        WHEN c.condition_name ILIKE '%acute%' OR c.condition_name ILIKE '%sinusitis%'
          OR c.condition_name ILIKE '%pharyngitis%' OR c.condition_name ILIKE '%bronchitis%'
        THEN 'Acute'
        ELSE 'Chronic'
    END,
    'Moderate',
    2816
FROM phm_edw.condition_diagnosis cd
JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
JOIN phm_edw.patient p ON cd.patient_id = p.patient_id
WHERE p.pcp_provider_id = 2816
  AND c.condition_name NOT ILIKE '%situation%'
  AND c.condition_name NOT ILIKE '%finding%'
  AND c.condition_name NOT ILIKE '%employment%'
  AND c.condition_name NOT ILIKE '%education%'
ORDER BY cd.patient_id, cd.condition_id, cd.onset_date DESC
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- PART B: Vital Signs — one row per encounter (2023-01-01 onward)
-- Uses condition name patterns for SNOMED-coded Synthea data
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    rec RECORD;
    v_has_htn   BOOLEAN;
    v_has_copd  BOOLEAN;
    v_has_dm    BOOLEAN;
    v_has_hf    BOOLEAN;
    v_has_obese BOOLEAN;
    v_has_afib  BOOLEAN;
    v_sys       SMALLINT;
    v_dia       SMALLINT;
    v_hr        SMALLINT;
    v_rr        SMALLINT;
    v_spo2      NUMERIC(5,2);
    v_temp      NUMERIC(5,2);
    v_weight    NUMERIC(7,2);
    v_height    NUMERIC(6,2);
    v_bmi       NUMERIC(6,2);
    v_pain      SMALLINT;
    v_rhythm    VARCHAR(20);
    v_offset    INT;
BEGIN
    FOR rec IN
        SELECT e.encounter_id, e.patient_id, e.encounter_datetime,
               p.date_of_birth, p.gender
        FROM phm_edw.encounter e
        JOIN phm_edw.patient p ON e.patient_id = p.patient_id
        WHERE p.pcp_provider_id = 2816
          AND e.encounter_datetime >= '2023-01-01'
          AND e.active_ind = 'Y'
        ORDER BY e.encounter_id
    LOOP
        IF EXISTS (SELECT 1 FROM phm_edw.vital_sign WHERE encounter_id = rec.encounter_id) THEN
            CONTINUE;
        END IF;

        -- Check conditions via SNOMED name patterns
        SELECT
            BOOL_OR(c.condition_name ILIKE '%hypertension%'),
            BOOL_OR(c.condition_name ILIKE '%copd%' OR c.condition_name ILIKE '%pulmonary disease%'),
            BOOL_OR(c.condition_name ILIKE '%diabetes mellitus type%' OR c.condition_name ILIKE '%type 2 diabetes%'),
            BOOL_OR(c.condition_name ILIKE '%heart failure%'),
            BOOL_OR(c.condition_name ILIKE '%obesity%' OR c.condition_name ILIKE '%BMI 30%'),
            BOOL_OR(c.condition_name ILIKE '%atrial fibrillation%')
        INTO v_has_htn, v_has_copd, v_has_dm, v_has_hf, v_has_obese, v_has_afib
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
        WHERE cd.patient_id = rec.patient_id;

        v_offset := (rec.patient_id % 37);

        -- BP
        IF COALESCE(v_has_htn, FALSE) THEN
            v_sys := 128 + (v_offset % 45);
            v_dia := 78  + (v_offset % 22);
            IF EXTRACT(EPOCH FROM rec.encounter_datetime)::BIGINT % 3 = 0 THEN
                v_sys := 118 + (v_offset % 16);
                v_dia := 72  + (v_offset % 12);
            END IF;
        ELSE
            v_sys := 108 + (v_offset % 22);
            v_dia := 65  + (v_offset % 15);
        END IF;

        -- HR / rhythm
        IF COALESCE(v_has_afib, FALSE) THEN
            v_hr := 65 + (v_offset % 55);
            v_rhythm := 'Irregular';
        ELSIF COALESCE(v_has_hf, FALSE) THEN
            v_hr := 72 + (v_offset % 28);
            v_rhythm := 'Regular';
        ELSE
            v_hr := 58 + (v_offset % 32);
            v_rhythm := 'Regular';
        END IF;

        -- RR
        IF COALESCE(v_has_copd, FALSE) AND EXTRACT(EPOCH FROM rec.encounter_datetime)::BIGINT % 4 = 0 THEN
            v_rr := 20 + (v_offset % 6);
        ELSE
            v_rr := 14 + (v_offset % 5);
        END IF;

        -- SpO2
        IF COALESCE(v_has_copd, FALSE) AND EXTRACT(EPOCH FROM rec.encounter_datetime)::BIGINT % 5 = 0 THEN
            v_spo2 := 88.0 + (v_offset % 5);
        ELSE
            v_spo2 := 95.0 + (v_offset % 5);
        END IF;

        -- Temp
        v_temp := 97.8 + ROUND((v_offset % 12) * 0.1, 1);

        -- Weight / Height / BMI
        IF COALESCE(v_has_obese, FALSE) THEN
            v_weight := 195.0 + (v_offset % 80);
            v_height := CASE WHEN rec.gender = 'M' THEN 67.0 + (v_offset % 8) ELSE 62.0 + (v_offset % 7) END;
        ELSE
            IF rec.gender = 'M' THEN
                v_weight := 155.0 + (v_offset % 50);
                v_height := 67.0  + (v_offset % 8);
            ELSE
                v_weight := 130.0 + (v_offset % 40);
                v_height := 62.0  + (v_offset % 7);
            END IF;
        END IF;
        v_bmi := ROUND(703.0 * v_weight / (v_height * v_height), 1);

        v_pain := CASE (v_offset % 3)
            WHEN 0 THEN 0
            WHEN 1 THEN (v_offset % 4)
            ELSE (2 + v_offset % 5)
        END;

        INSERT INTO phm_edw.vital_sign (
            patient_id, encounter_id, recorded_by, recorded_datetime,
            bp_systolic, bp_diastolic, bp_position,
            heart_rate, heart_rhythm,
            temperature_f, temp_route,
            respiratory_rate,
            spo2_percent, o2_delivery,
            weight_lbs, height_in, bmi,
            pain_score
        ) VALUES (
            rec.patient_id, rec.encounter_id, 2816, rec.encounter_datetime,
            v_sys, v_dia, 'sitting',
            v_hr, v_rhythm,
            v_temp, 'oral',
            v_rr,
            v_spo2, 'Room Air',
            v_weight, v_height, v_bmi,
            v_pain
        );
    END LOOP;
    RAISE NOTICE 'Vital signs loop complete';
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- PART C: Clinical Notes — one SOAP note per encounter (2023+)
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    rec         RECORD;
    v_user_id   UUID;
    v_subjective TEXT;
    v_objective  TEXT;
    v_assessment TEXT;
    v_plan       TEXT;
    v_dx_cat     TEXT;
    v_has_dm     BOOLEAN;
    v_has_htn    BOOLEAN;
    v_has_copd   BOOLEAN;
    v_has_hf     BOOLEAN;
    v_has_mdd    BOOLEAN;
    v_has_ckd    BOOLEAN;
BEGIN
    SELECT id INTO v_user_id FROM public.app_users WHERE email = 'dr.udoshi@medgnosis.app' LIMIT 1;

    FOR rec IN
        SELECT e.encounter_id, e.patient_id, e.encounter_datetime,
               e.encounter_type, e.encounter_reason,
               p.first_name, p.last_name,
               EXTRACT(YEAR FROM AGE(p.date_of_birth))::INT AS age,
               p.gender
        FROM phm_edw.encounter e
        JOIN phm_edw.patient p ON e.patient_id = p.patient_id
        WHERE p.pcp_provider_id = 2816
          AND e.encounter_datetime >= '2023-01-01'
          AND e.active_ind = 'Y'
        ORDER BY e.encounter_id
    LOOP
        IF EXISTS (SELECT 1 FROM phm_edw.clinical_note WHERE encounter_id = rec.encounter_id) THEN
            CONTINUE;
        END IF;

        SELECT
            BOOL_OR(c.condition_name ILIKE '%diabetes mellitus type%' OR c.condition_name ILIKE '%type 2 diabetes%'),
            BOOL_OR(c.condition_name ILIKE '%hypertension%'),
            BOOL_OR(c.condition_name ILIKE '%copd%' OR c.condition_name ILIKE '%pulmonary disease%'),
            BOOL_OR(c.condition_name ILIKE '%heart failure%'),
            BOOL_OR(c.condition_name ILIKE '%depress%'),
            BOOL_OR(c.condition_name ILIKE '%chronic kidney disease%' OR c.condition_name ILIKE '%kidney failure%')
        INTO v_has_dm, v_has_htn, v_has_copd, v_has_hf, v_has_mdd, v_has_ckd
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
        WHERE cd.patient_id = rec.patient_id;

        v_dx_cat := CASE
            WHEN rec.encounter_type = 'wellness'   THEN 'WELLNESS'
            WHEN rec.encounter_type IN ('urgentcare','emergency') THEN 'URGENT'
            WHEN rec.encounter_type = 'virtual'    THEN 'TELEHEALTH'
            WHEN COALESCE(v_has_dm,  FALSE)        THEN 'DM'
            WHEN COALESCE(v_has_hf,  FALSE)        THEN 'HF'
            WHEN COALESCE(v_has_copd,FALSE)        THEN 'COPD'
            WHEN COALESCE(v_has_ckd, FALSE)        THEN 'CKD'
            WHEN COALESCE(v_has_mdd, FALSE)        THEN 'MDD'
            WHEN COALESCE(v_has_htn, FALSE)        THEN 'HTN'
            ELSE 'GENERAL'
        END;

        v_subjective := CASE v_dx_cat
            WHEN 'DM' THEN FORMAT('%s %s, a %s-year-old with T2DM, presents for diabetes follow-up. Reports adherence to metformin. Home fasting glucose 110–180 mg/dL. No hypoglycemic episodes. No new visual changes or foot symptoms.', rec.first_name, rec.last_name, rec.age)
            WHEN 'HTN' THEN FORMAT('%s %s, a %s-year-old, presents for hypertension management. Takes antihypertensive medications as prescribed. Home BP averaging 138/86 mmHg. Denies headache, chest pain, or visual changes.', rec.first_name, rec.last_name, rec.age)
            WHEN 'COPD' THEN FORMAT('%s %s, a %s-year-old with COPD, presents for routine follow-up. Stable symptoms. Uses rescue inhaler 2–3×/week. Dyspnea on moderate exertion (mMRC 2). No recent exacerbations. Former smoker.', rec.first_name, rec.last_name, rec.age)
            WHEN 'HF' THEN FORMAT('%s %s, a %s-year-old with heart failure, presents for follow-up. Reports mild lower extremity edema, improved. Dyspnea on exertion (NYHA II). Compliant with fluid restriction. No orthopnea.', rec.first_name, rec.last_name, rec.age)
            WHEN 'MDD' THEN FORMAT('%s %s, a %s-year-old, presents for depression follow-up. Reports improved mood on current medication. PHQ-9 score 8 today (down from 14). Sleeping better. No suicidal ideation.', rec.first_name, rec.last_name, rec.age)
            WHEN 'CKD' THEN FORMAT('%s %s, a %s-year-old with CKD, presents for nephrology monitoring. Recent labs show eGFR stable. No new urinary symptoms. Medication compliant. Dietary protein restriction maintained.', rec.first_name, rec.last_name, rec.age)
            WHEN 'WELLNESS' THEN FORMAT('%s %s, a %s-year-old, presents for annual wellness visit. No acute complaints. Exercises 3×/week. Non-smoker. Occasional alcohol use. Requests review of medications and preventive screenings.', rec.first_name, rec.last_name, rec.age)
            WHEN 'URGENT' THEN FORMAT('%s %s, a %s-year-old, presents urgently. Chief complaint: %s. Onset acute. No fever or recent travel.', rec.first_name, rec.last_name, rec.age, COALESCE(rec.encounter_reason, 'acute illness'))
            WHEN 'TELEHEALTH' THEN FORMAT('%s %s, a %s-year-old, presents via telehealth for medication management. Doing well overall. No urgent concerns. Requests prescription refills.', rec.first_name, rec.last_name, rec.age)
            ELSE FORMAT('%s %s, a %s-year-old, presents for follow-up. Doing well overall. No significant new complaints.', rec.first_name, rec.last_name, rec.age)
        END;

        v_objective := CASE v_dx_cat
            WHEN 'DM' THEN 'Alert, oriented, no acute distress. CV: RRR, no murmurs. Pulm: CTAB. Feet: intact skin, no ulcerations, monofilament sensation intact bilaterally. Labs pending: HbA1c ordered.'
            WHEN 'HTN' THEN 'Alert, well-appearing. CV: RRR, S1 S2 normal. Pulm: clear. Extremities: no significant edema. BMP ordered.'
            WHEN 'COPD' THEN 'Alert. Mild expiratory wheeze on auscultation. Prolonged expiratory phase. No accessory muscle use. SpO2 reviewed. GOLD II–III.'
            WHEN 'HF' THEN 'Alert, mildly dyspneic. JVD: mild. CV: S3 gallop present. Pulm: bibasilar crackles. 1+ pitting edema bilateral ankles.'
            WHEN 'MDD' THEN 'Alert, appropriate affect, improved eye contact. Mood: euthymic. Thought process: linear. PHQ-9 administered: score recorded. No active SI/HI.'
            WHEN 'CKD' THEN 'Alert, well-appearing. No pallor. CV: RRR. Pulm: clear. No peripheral edema. eGFR trend stable, creatinine unchanged. BP well-controlled.'
            WHEN 'WELLNESS' THEN 'Alert, well-appearing. Age-appropriate exam performed. HEENT: normocephalic, PERRLA. CV: RRR. Pulm: CTAB. Abd: soft, NT, ND. Skin: no lesions. Neuro: intact.'
            ELSE 'Alert, oriented ×3. No acute distress. Vitals reviewed. Physical exam appropriate to chief complaint.'
        END;

        v_assessment := CASE v_dx_cat
            WHEN 'DM'       THEN 'Type 2 Diabetes Mellitus (E11.9) — suboptimally controlled. Nephropathy screening current.'
            WHEN 'HTN'      THEN 'Essential Hypertension (I10) — approaching goal. Medication compliance confirmed.'
            WHEN 'COPD'     THEN 'COPD, moderate severity (J44.1) — stable. Inhaler technique reviewed.'
            WHEN 'HF'       THEN 'Systolic Heart Failure (I50.20) — NYHA Class II, stable on current regimen.'
            WHEN 'MDD'      THEN 'Major Depressive Disorder (F32.1), moderate — improving on current therapy.'
            WHEN 'CKD'      THEN 'Chronic Kidney Disease, Stage 3 (N18.3) — stable GFR. Conservative management continuing.'
            WHEN 'WELLNESS' THEN 'Annual Wellness Visit — preventive screenings reviewed and updated.'
            WHEN 'URGENT'   THEN FORMAT('Acute: %s — evaluated and managed.', COALESCE(rec.encounter_reason, 'acute illness'))
            WHEN 'TELEHEALTH' THEN 'Telehealth visit for medication management — stable, prescriptions renewed.'
            ELSE 'Follow-up visit — stable chronic conditions. No acute issues.'
        END;

        v_plan := CASE v_dx_cat
            WHEN 'DM'  THEN E'1. Continue Metformin 1000mg BID.\n2. HbA1c ordered today.\n3. Annual dilated eye exam — referral placed.\n4. Foot exam completed. Continue daily foot inspection.\n5. Return in 3 months.'
            WHEN 'HTN' THEN E'1. Continue Lisinopril 10mg daily.\n2. BMP ordered.\n3. Sodium restriction <2g/day reinforced.\n4. Home BP goal <130/80.\n5. Return in 6–8 weeks.'
            WHEN 'COPD' THEN E'1. Continue Tiotropium daily.\n2. Rescue inhaler (Albuterol PRN) — technique reviewed.\n3. Annual influenza vaccine administered.\n4. COPD action plan reviewed. Return in 3 months.'
            WHEN 'HF'  THEN E'1. Continue Carvedilol 12.5mg BID and Furosemide 40mg daily.\n2. BMP ordered.\n3. Echo ordered.\n4. Fluid restriction <2L/day reinforced.\n5. Return in 6–8 weeks.'
            WHEN 'MDD' THEN E'1. Continue Sertraline 100mg daily.\n2. PHQ-9: 8 today — continue current dose.\n3. CBT ongoing — continue.\n4. Safety plan reviewed.\n5. Return in 4 weeks.'
            WHEN 'CKD' THEN E'1. Continue ACE inhibitor.\n2. BMP + phosphorus + PTH ordered.\n3. Protein restriction 0.8g/kg/day.\n4. Nephrology follow-up in 3 months.'
            WHEN 'WELLNESS' THEN E'1. Preventive screenings ordered.\n2. Vaccinations updated.\n3. Healthy lifestyle counseling.\n4. Labs: CBC, CMP, lipids.\n5. Return for AWV in 12 months.'
            ELSE E'1. Medications reviewed and renewed.\n2. Labs ordered as indicated.\n3. Patient educated on condition management.\n4. Follow-up in 3–6 months.'
        END;

        INSERT INTO phm_edw.clinical_note (
            patient_id, encounter_id, author_user_id, visit_type, status,
            chief_complaint, subjective, objective, assessment, plan_text,
            finalized_at, active_ind
        ) VALUES (
            rec.patient_id, rec.encounter_id, v_user_id,
            CASE rec.encounter_type WHEN 'wellness' THEN 'wellness' WHEN 'virtual' THEN 'telehealth' ELSE 'followup' END,
            'signed',
            COALESCE(rec.encounter_reason, 'Follow-up visit'),
            v_subjective, v_objective, v_assessment, v_plan,
            rec.encounter_datetime + INTERVAL '1 hour',
            'Y'
        );
    END LOOP;
    RAISE NOTICE 'Clinical notes loop complete';
END $$;

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
