-- Using Inmon 3NF model (phm_edw)
WITH measurement_period AS (
    SELECT 
        '2024-01-01'::date as start_date,
        '2024-12-31'::date as end_date
),
initial_population AS (
    -- Patients 18+ with heart failure and 2 encounters
    SELECT DISTINCT
        p.patient_id,
        MIN(e1.encounter_datetime) as first_encounter_date,
        MIN(e2.encounter_datetime) as second_encounter_date,
        MIN(cd.onset_date) as hf_diagnosis_date,
        o1.observation_code as assessment_tool,
        o1.observation_datetime as initial_assessment_date,
        o2.observation_datetime as followup_assessment_date,
        o1.value_numeric as initial_score,
        o2.value_numeric as followup_score
    FROM phm_edw.patient p
    JOIN phm_edw.encounter e1 ON p.patient_id = e1.patient_id
    JOIN phm_edw.encounter e2 ON p.patient_id = e2.patient_id
    JOIN phm_edw.condition_diagnosis cd ON p.patient_id = cd.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    JOIN phm_edw.observation o1 ON p.patient_id = o1.patient_id -- Initial assessment
    JOIN phm_edw.observation o2 ON p.patient_id = o2.patient_id -- Follow-up assessment
    CROSS JOIN measurement_period mp
    WHERE 
        DATE_PART('year', AGE(mp.start_date, p.date_of_birth)) >= 18
        AND c.condition_code IN ('I50.1', 'I50.2', 'I50.20', 'I50.21', 'I50.22', 'I50.23', 'I50.3', 'I50.30', 'I50.31', 'I50.32', 'I50.33', 'I50.4', 'I50.40', 'I50.41', 'I50.42', 'I50.43', 'I50.8', 'I50.81', 'I50.82', 'I50.83', 'I50.84', 'I50.89', 'I50.9') -- Heart failure ICD-10 codes
        AND cd.diagnosis_status = 'ACTIVE'
        AND e1.encounter_datetime BETWEEN mp.start_date AND mp.end_date
        AND e2.encounter_datetime BETWEEN e1.encounter_datetime + INTERVAL '1 day' AND mp.end_date
        AND o1.observation_code IN ('PROMIS10', 'PROMIS29', 'VR12-OBL', 'VR12-ORTH', 'VR36-OBL', 'VR36-ORTH', 'MLHFQ', 'KCCQ12', 'KCCQ')
        AND o2.observation_code = o1.observation_code -- Same tool used
        AND o2.observation_datetime BETWEEN o1.observation_datetime + INTERVAL '30 days' 
            AND o1.observation_datetime + INTERVAL '180 days'
    GROUP BY 
        p.patient_id, o1.observation_code, o1.observation_datetime, 
        o2.observation_datetime, o1.value_numeric, o2.value_numeric
),
denominator_exclusions AS (
    -- Hospice care or severe cognitive impairment
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        (c.condition_code = 'Z51.5' -- Hospice care
        OR c.condition_code IN ('F02.80', 'F02.81', 'F03.90', 'F03.91')) -- Severe cognitive impairment
        AND cd.diagnosis_status = 'ACTIVE'
        AND cd.onset_date <= mp.end_date
        AND (cd.resolution_date IS NULL OR cd.resolution_date >= mp.start_date)
)
-- Final Results
SELECT 
    'Overall' as population,
    COUNT(DISTINCT i.patient_id) as initial_population,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL THEN i.patient_id END) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL 
        AND i.initial_assessment_date IS NOT NULL 
        AND i.followup_assessment_date IS NOT NULL THEN i.patient_id END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN de.patient_id IS NULL 
            AND i.initial_assessment_date IS NOT NULL 
            AND i.followup_assessment_date IS NOT NULL THEN i.patient_id END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN de.patient_id IS NULL THEN i.patient_id END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population i
LEFT JOIN denominator_exclusions de ON i.patient_id = de.patient_id;

-- Using Kimball star schema (phm_star)
WITH measurement_period AS (
    SELECT 
        '2024-01-01'::date as start_date,
        '2024-12-31'::date as end_date,
        20240101 as start_key,
        20241231 as end_key
),
initial_population AS (
    SELECT DISTINCT
        dp.patient_key,
        MIN(fe1.date_key_encounter) as first_encounter_key,
        MIN(fe2.date_key_encounter) as second_encounter_key,
        fo1.observation_code as assessment_tool,
        d1.full_date as initial_assessment_date,
        d2.full_date as followup_assessment_date,
        fo1.value_numeric as initial_score,
        fo2.value_numeric as followup_score
    FROM phm_star.dim_patient dp
    JOIN phm_star.fact_encounter fe1 ON dp.patient_key = fe1.patient_key
    JOIN phm_star.fact_encounter fe2 ON dp.patient_key = fe2.patient_key
    JOIN phm_star.fact_diagnosis fd ON dp.patient_key = fd.patient_key
    JOIN phm_star.dim_condition dc ON fd.condition_key = dc.condition_key
    JOIN phm_star.fact_observation fo1 ON dp.patient_key = fo1.patient_key
    JOIN phm_star.dim_date d1 ON fo1.date_key_obs = d1.date_key
    JOIN phm_star.fact_observation fo2 ON dp.patient_key = fo2.patient_key
    JOIN phm_star.dim_date d2 ON fo2.date_key_obs = d2.date_key
    CROSS JOIN measurement_period mp
    WHERE 
        DATE_PART('year', AGE(mp.start_date, dp.date_of_birth)) >= 18
        AND dc.icd10_code LIKE 'I50%' -- Heart failure codes
        AND fd.diagnosis_status = 'ACTIVE'
        AND fe1.date_key_encounter BETWEEN mp.start_key AND mp.end_key
        AND fe2.date_key_encounter > fe1.date_key_encounter
        AND fo1.observation_code IN ('PROMIS10', 'PROMIS29', 'VR12-OBL', 'VR12-ORTH', 'VR36-OBL', 'VR36-ORTH', 'MLHFQ', 'KCCQ12', 'KCCQ')
        AND fo2.observation_code = fo1.observation_code
        AND d2.full_date BETWEEN d1.full_date + INTERVAL '30 days' 
            AND d1.full_date + INTERVAL '180 days'
    GROUP BY 
        dp.patient_key, fo1.observation_code, d1.full_date, 
        d2.full_date, fo1.value_numeric, fo2.value_numeric
),
denominator_exclusions AS (
    SELECT DISTINCT fd.patient_key
    FROM phm_star.fact_diagnosis fd
    JOIN phm_star.dim_condition dc ON fd.condition_key = dc.condition_key
    WHERE 
        (dc.icd10_code = 'Z51.5' 
        OR dc.icd10_code IN ('F02.80', 'F02.81', 'F03.90', 'F03.91'))
        AND fd.diagnosis_status = 'ACTIVE'
)
-- Final Results
SELECT 
    'Overall' as population,
    COUNT(DISTINCT i.patient_key) as initial_population,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL THEN i.patient_key END) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL 
        AND i.initial_assessment_date IS NOT NULL 
        AND i.followup_assessment_date IS NOT NULL THEN i.patient_key END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN de.patient_key IS NULL 
            AND i.initial_assessment_date IS NOT NULL 
            AND i.followup_assessment_date IS NOT NULL THEN i.patient_key END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN de.patient_key IS NULL THEN i.patient_key END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population i
LEFT JOIN denominator_exclusions de ON i.patient_key = de.patient_key;