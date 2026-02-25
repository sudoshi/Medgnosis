-- Using the Kimball star schema (phm_star)
WITH measurement_period AS (
    SELECT 
        '2024-01-01'::date as start_date,
        '2024-12-31'::date as end_date
),
initial_population AS (
    -- Patients 18+ with eligible encounter during measurement period
    SELECT DISTINCT
        p.patient_key,
        p.patient_id,
        e.encounter_key
    FROM phm_star.fact_encounter e
    JOIN phm_star.dim_patient p ON e.patient_key = p.patient_key
    JOIN phm_star.dim_date d ON e.date_key_encounter = d.date_key
    CROSS JOIN measurement_period mp
    WHERE d.full_date BETWEEN mp.start_date AND mp.end_date
    AND DATE_PART('year', AGE(d.full_date, p.date_of_birth)) >= 18
),
denominator_exclusions AS (
    -- Pregnant patients or those in palliative/hospice care
    SELECT DISTINCT i.patient_key
    FROM initial_population i
    LEFT JOIN phm_star.fact_diagnosis fd ON i.patient_key = fd.patient_key
    LEFT JOIN phm_star.dim_condition c ON fd.condition_key = c.condition_key
    CROSS JOIN measurement_period mp
    WHERE 
        -- Pregnancy diagnoses (example ICD-10 codes)
        (c.icd10_code LIKE 'Z34%' OR c.icd10_code LIKE 'O0%' OR c.icd10_code LIKE 'Z33%')
        -- Active during measurement period
        AND fd.diagnosis_status = 'ACTIVE'
        OR
        -- Palliative care (example codes)
        (c.icd10_code IN ('Z51.5', 'Z51.1'))
),
bmi_observations AS (
    -- Get BMI measurements during measurement period
    SELECT 
        fo.patient_key,
        fo.encounter_key,
        fo.value_numeric as bmi_value,
        d.full_date as measurement_date,
        CASE 
            WHEN fo.value_numeric >= 18.5 AND fo.value_numeric < 25 THEN 'NORMAL'
            WHEN fo.value_numeric >= 25 THEN 'HIGH'
            WHEN fo.value_numeric < 18.5 THEN 'LOW'
        END as bmi_category
    FROM phm_star.fact_observation fo
    JOIN phm_star.dim_date d ON fo.date_key_obs = d.date_key
    CROSS JOIN measurement_period mp
    WHERE 
        fo.observation_code = '39156-5' -- LOINC code for BMI
        AND d.full_date BETWEEN mp.start_date AND mp.end_date
),
followup_documentation AS (
    -- Check for follow-up plan documentation for out-of-range BMI
    SELECT DISTINCT
        b.patient_key,
        b.encounter_key,
        TRUE as has_followup
    FROM bmi_observations b
    JOIN phm_star.fact_observation fo ON b.patient_key = fo.patient_key
    JOIN phm_star.dim_date d ON fo.date_key_obs = d.date_key
    WHERE 
        b.bmi_category IN ('HIGH', 'LOW')
        AND fo.observation_code IN (
            -- Example codes for follow-up documentation
            '69-8', -- Nutrition counseling
            '63893-2', -- Physical activity counseling
            '418995-0' -- Weight management plan
        )
        AND d.full_date <= b.measurement_date + INTERVAL '1 day'
),
denominator_exceptions AS (
    -- Medical or patient reasons for not measuring/following up
    SELECT DISTINCT
        fo.patient_key
    FROM phm_star.fact_observation fo
    JOIN phm_star.dim_date d ON fo.date_key_obs = d.date_key
    CROSS JOIN measurement_period mp
    WHERE 
        fo.observation_code IN (
            -- Example codes for medical/patient reasons
            'REASON-BMI-1',  -- Medical reason for not measuring BMI
            'REASON-BMI-2',  -- Patient reason for declining measurement
            'REASON-FUP-1'   -- Medical reason for not providing follow-up
        )
        AND d.full_date BETWEEN mp.start_date AND mp.end_date
),
numerator_patients AS (
    SELECT DISTINCT b.patient_key
    FROM bmi_observations b
    LEFT JOIN followup_documentation f ON 
        b.patient_key = f.patient_key 
        AND b.encounter_key = f.encounter_key
    WHERE 
        b.bmi_category = 'NORMAL'
        OR (b.bmi_category IN ('HIGH', 'LOW') AND f.has_followup)
)
-- Final measure calculation
SELECT 
    COUNT(DISTINCT ip.patient_key) as initial_population,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL THEN ip.patient_key END) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL AND dx.patient_key IS NULL THEN ip.patient_key END) as denominator_exceptions,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL AND dx.patient_key IS NULL AND n.patient_key IS NOT NULL THEN ip.patient_key END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN de.patient_key IS NULL AND dx.patient_key IS NULL AND n.patient_key IS NOT NULL THEN ip.patient_key END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN de.patient_key IS NULL AND dx.patient_key IS NULL THEN ip.patient_key END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_key = de.patient_key
LEFT JOIN denominator_exceptions dx ON ip.patient_key = dx.patient_key
LEFT JOIN numerator_patients n ON ip.patient_key = n.patient_key;

-- Using the Inmon 3NF model (phm_edw)
WITH measurement_period AS (
    SELECT 
        '2024-01-01'::date as start_date,
        '2024-12-31'::date as end_date
),
initial_population AS (
    SELECT DISTINCT
        p.patient_id,
        e.encounter_id
    FROM phm_edw.patient p
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
        AND DATE_PART('year', AGE(e.encounter_datetime, p.date_of_birth)) >= 18
),
denominator_exclusions AS (
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        (c.condition_code LIKE 'Z34%' OR c.condition_code LIKE 'O0%' OR c.condition_code LIKE 'Z33%')
        AND cd.diagnosis_status = 'ACTIVE'
        AND mp.start_date BETWEEN cd.effective_start_date 
            AND COALESCE(cd.effective_end_date, '9999-12-31')
        OR
        (c.condition_code IN ('Z51.5', 'Z51.1'))
),
bmi_observations AS (
    SELECT 
        o.patient_id,
        o.encounter_id,
        o.value_numeric as bmi_value,
        o.observation_datetime as measurement_date,
        CASE 
            WHEN o.value_numeric >= 18.5 AND o.value_numeric < 25 THEN 'NORMAL'
            WHEN o.value_numeric >= 25 THEN 'HIGH'
            WHEN o.value_numeric < 18.5 THEN 'LOW'
        END as bmi_category
    FROM phm_edw.observation o
    CROSS JOIN measurement_period mp
    WHERE 
        o.observation_code = '39156-5'
        AND o.observation_datetime BETWEEN mp.start_date AND mp.end_date
),
followup_documentation AS (
    SELECT DISTINCT
        b.patient_id,
        b.encounter_id,
        TRUE as has_followup
    FROM bmi_observations b
    JOIN phm_edw.observation o ON b.patient_id = o.patient_id
    WHERE 
        b.bmi_category IN ('HIGH', 'LOW')
        AND o.observation_code IN ('69-8', '63893-2', '418995-0')
        AND o.observation_datetime <= b.measurement_date + INTERVAL '1 day'
),
denominator_exceptions AS (
    SELECT DISTINCT
        o.patient_id
    FROM phm_edw.observation o
    CROSS JOIN measurement_period mp
    WHERE 
        o.observation_code IN ('REASON-BMI-1', 'REASON-BMI-2', 'REASON-FUP-1')
        AND o.observation_datetime BETWEEN mp.start_date AND mp.end_date
),
numerator_patients AS (
    SELECT DISTINCT b.patient_id
    FROM bmi_observations b
    LEFT JOIN followup_documentation f ON 
        b.patient_id = f.patient_id 
        AND b.encounter_id = f.encounter_id
    WHERE 
        b.bmi_category = 'NORMAL'
        OR (b.bmi_category IN ('HIGH', 'LOW') AND f.has_followup)
)
-- Final measure calculation
SELECT 
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL THEN ip.patient_id END) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL AND dx.patient_id IS NULL THEN ip.patient_id END) as denominator_exceptions,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL AND dx.patient_id IS NULL AND n.patient_id IS NOT NULL THEN ip.patient_id END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN de.patient_id IS NULL AND dx.patient_id IS NULL AND n.patient_id IS NOT NULL THEN ip.patient_id END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN de.patient_id IS NULL AND dx.patient_id IS NULL THEN ip.patient_id END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_id = de.patient_id
LEFT JOIN denominator_exceptions dx ON ip.patient_id = dx.patient_id
LEFT JOIN numerator_patients n ON ip.patient_id = n.patient_id;