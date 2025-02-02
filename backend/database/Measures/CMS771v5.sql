-- Using Inmon 3NF model (phm_edw)
WITH measurement_period AS (
    SELECT 
        '2024-01-01'::date as start_date,
        '2024-12-31'::date as end_date
),
initial_population AS (
    -- Male patients with BPH diagnosis and valid IPSS/AUA scores
    SELECT DISTINCT
        p.patient_id,
        cd.onset_date as diagnosis_date,
        o1.value_numeric as initial_score,
        o1.observation_datetime as initial_score_date,
        o2.value_numeric as followup_score,
        o2.observation_datetime as followup_score_date,
        e.encounter_id
    FROM phm_edw.patient p
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    JOIN phm_edw.condition_diagnosis cd ON p.patient_id = cd.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    JOIN phm_edw.observation o1 ON p.patient_id = o1.patient_id -- Initial score
    JOIN phm_edw.observation o2 ON p.patient_id = o2.patient_id -- Follow-up score
    CROSS JOIN measurement_period mp
    WHERE 
        p.gender = 'M'
        AND e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
        AND c.condition_code IN ('N40.0', 'N40.1') -- BPH ICD-10 codes
        AND cd.onset_date BETWEEN mp.start_date - INTERVAL '6 months' AND mp.start_date
        AND o1.observation_code IN ('47503-6', '75296-1') -- IPSS/AUA codes
        AND o1.observation_datetime <= cd.onset_date + INTERVAL '1 month'
        AND o2.observation_code IN ('47503-6', '75296-1')
        AND o2.observation_datetime BETWEEN cd.onset_date + INTERVAL '6 months' 
            AND cd.onset_date + INTERVAL '12 months'
),
denominator_exclusions AS (
    -- Urinary retention, hospitalization-related BPH, or morbid obesity/high BMI
    SELECT DISTINCT i.patient_id
    FROM initial_population i
    LEFT JOIN phm_edw.condition_diagnosis cd ON i.patient_id = cd.patient_id
    LEFT JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    LEFT JOIN phm_edw.observation o ON i.patient_id = o.patient_id
    WHERE 
        -- Urinary retention within 1 year
        (c.condition_code = 'R33.9' 
        AND cd.onset_date BETWEEN i.diagnosis_date AND i.diagnosis_date + INTERVAL '1 year')
        OR
        -- BPH diagnosis during/within 30 days of hospitalization
        (i.encounter_id IN (
            SELECT encounter_id 
            FROM phm_edw.encounter 
            WHERE encounter_type = 'INPATIENT'
        )
        AND i.diagnosis_date BETWEEN cd.onset_date - INTERVAL '30 days' 
            AND cd.onset_date + INTERVAL '30 days')
        OR
        -- Morbid obesity/BMI >= 40
        (c.condition_code = 'E66.01' -- Morbid obesity
        OR (o.observation_code = '39156-5' -- BMI LOINC
            AND o.value_numeric >= 40
            AND o.observation_datetime <= i.followup_score_date))
)
-- Final Results 
SELECT 
    'Overall' as population,
    COUNT(DISTINCT i.patient_id) as initial_population,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL THEN i.patient_id END) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL 
        AND (i.followup_score - i.initial_score) >= 3 THEN i.patient_id END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN de.patient_id IS NULL 
            AND (i.followup_score - i.initial_score) >= 3 THEN i.patient_id END) AS DECIMAL) /
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
    -- Male patients with BPH diagnosis and valid IPSS/AUA scores
    SELECT DISTINCT
        dp.patient_key,
        dd.full_date as diagnosis_date,
        fo1.value_numeric as initial_score,
        d1.full_date as initial_score_date,
        fo2.value_numeric as followup_score,
        d2.full_date as followup_score_date,
        fe.encounter_key
    FROM phm_star.fact_encounter fe
    JOIN phm_star.dim_patient dp ON fe.patient_key = dp.patient_key
    JOIN phm_star.fact_diagnosis fd ON dp.patient_key = fd.patient_key
    JOIN phm_star.dim_condition dc ON fd.condition_key = dc.condition_key
    JOIN phm_star.dim_date dd ON fd.date_key_onset = dd.date_key
    JOIN phm_star.fact_observation fo1 ON dp.patient_key = fo1.patient_key
    JOIN phm_star.dim_date d1 ON fo1.date_key_obs = d1.date_key
    JOIN phm_star.fact_observation fo2 ON dp.patient_key = fo2.patient_key
    JOIN phm_star.dim_date d2 ON fo2.date_key_obs = d2.date_key
    CROSS JOIN measurement_period mp
    WHERE 
        dp.gender = 'M'
        AND dp.is_current = TRUE
        AND fe.date_key_encounter BETWEEN mp.start_key AND mp.end_key
        AND dc.icd10_code IN ('N40.0', 'N40.1')
        AND dd.full_date BETWEEN mp.start_date - INTERVAL '6 months' AND mp.start_date
        AND fo1.observation_code IN ('47503-6', '75296-1')
        AND d1.full_date <= dd.full_date + INTERVAL '1 month'
        AND fo2.observation_code IN ('47503-6', '75296-1')
        AND d2.full_date BETWEEN dd.full_date + INTERVAL '6 months' 
            AND dd.full_date + INTERVAL '12 months'
),
denominator_exclusions AS (
    SELECT DISTINCT i.patient_key
    FROM initial_population i
    LEFT JOIN phm_star.fact_diagnosis fd ON i.patient_key = fd.patient_key
    LEFT JOIN phm_star.dim_condition dc ON fd.condition_key = dc.condition_key
    LEFT JOIN phm_star.fact_observation fo ON i.patient_key = fo.patient_key
    WHERE 
        -- Urinary retention within 1 year
        (dc.icd10_code = 'R33.9'
        AND i.diagnosis_date <= fd.date_key_onset + INTERVAL '1 year')
        OR
        -- BPH diagnosis during/within 30 days of hospitalization
        (i.encounter_key IN (
            SELECT encounter_key 
            FROM phm_star.fact_encounter 
            WHERE encounter_type = 'INPATIENT'
        ))
        OR
        -- Morbid obesity/BMI >= 40
        (dc.icd10_code = 'E66.01'
        OR (fo.observation_code = '39156-5'
            AND fo.value_numeric >= 40))
)
-- Final Results
SELECT 
    'Overall' as population,
    COUNT(DISTINCT i.patient_key) as initial_population,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL THEN i.patient_key END) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL 
        AND (i.followup_score - i.initial_score) >= 3 THEN i.patient_key END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN de.patient_key IS NULL 
            AND (i.followup_score - i.initial_score) >= 3 THEN i.patient_key END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN de.patient_key IS NULL THEN i.patient_key END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population i
LEFT JOIN denominator_exclusions de ON i.patient_key = de.patient_key;