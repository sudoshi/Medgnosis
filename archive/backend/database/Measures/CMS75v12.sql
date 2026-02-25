-- Using Inmon 3NF model (phm_edw)
WITH measurement_period AS (
    SELECT 
        '2024-01-01'::date as start_date,
        '2024-12-31'::date as end_date
),
age_at_start AS (
    SELECT 
        p.patient_id,
        DATE_PART('year', AGE(mp.start_date, p.date_of_birth)) as age_years
    FROM phm_edw.patient p
    CROSS JOIN measurement_period mp
),
initial_population AS (
    -- Children 1-20 with dental evaluation
    SELECT DISTINCT
        p.patient_id
    FROM phm_edw.patient p
    JOIN age_at_start a ON p.patient_id = a.patient_id
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    JOIN phm_edw.provider prov ON e.provider_id = prov.provider_id
    CROSS JOIN measurement_period mp
    WHERE 
        a.age_years BETWEEN 1 AND 20
        AND e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
        AND prov.provider_type = 'DENTIST'
        AND e.encounter_type = 'DENTAL_EVAL'
),
denominator_exclusions AS (
    -- Hospice patients
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        c.condition_code = 'Z51.5'  -- Hospice care
        AND cd.diagnosis_status = 'ACTIVE'
        AND cd.effective_start_date <= mp.end_date
        AND (cd.effective_end_date IS NULL OR cd.effective_end_date >= mp.start_date)
),
dental_decay AS (
    -- Patients with dental decay/cavity diagnosis
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        c.code_system = 'ICD-10'
        AND c.condition_code LIKE 'K02%'  -- ICD-10 codes for dental caries
        AND cd.diagnosis_status = 'ACTIVE'
        AND cd.onset_date BETWEEN mp.start_date AND mp.end_date
)
-- Final Results
SELECT 
    'Overall' as population,
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL THEN ip.patient_id END) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL AND dd.patient_id IS NOT NULL THEN ip.patient_id END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN de.patient_id IS NULL AND dd.patient_id IS NOT NULL THEN ip.patient_id END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN de.patient_id IS NULL THEN ip.patient_id END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_id = de.patient_id
LEFT JOIN dental_decay dd ON ip.patient_id = dd.patient_id;

-- Using Kimball star schema (phm_star)
WITH measurement_period AS (
    SELECT 
        '2024-01-01'::date as start_date,
        '2024-12-31'::date as end_date,
        20240101 as start_key,
        20241231 as end_key
),
age_at_start AS (
    SELECT 
        dp.patient_key,
        DATE_PART('year', AGE(mp.start_date, dp.date_of_birth)) as age_years
    FROM phm_star.dim_patient dp
    CROSS JOIN measurement_period mp
    WHERE dp.is_current = TRUE
),
initial_population AS (
    -- Children 1-20 with dental evaluation
    SELECT DISTINCT
        fe.patient_key
    FROM phm_star.fact_encounter fe
    JOIN age_at_start a ON fe.patient_key = a.patient_key
    JOIN phm_star.dim_provider dp ON fe.provider_key = dp.provider_key
    CROSS JOIN measurement_period mp
    WHERE 
        a.age_years BETWEEN 1 AND 20
        AND fe.date_key_encounter BETWEEN mp.start_key AND mp.end_key
        AND dp.provider_type = 'DENTIST'
        AND fe.encounter_type = 'DENTAL_EVAL'
),
denominator_exclusions AS (
    -- Hospice patients
    SELECT DISTINCT fd.patient_key
    FROM phm_star.fact_diagnosis fd
    JOIN phm_star.dim_condition dc ON fd.condition_key = dc.condition_key
    CROSS JOIN measurement_period mp
    WHERE 
        dc.icd10_code = 'Z51.5'  -- Hospice care
        AND fd.diagnosis_status = 'ACTIVE'
),
dental_decay AS (
    -- Patients with dental decay/cavity diagnosis
    SELECT DISTINCT fd.patient_key
    FROM phm_star.fact_diagnosis fd
    JOIN phm_star.dim_condition dc ON fd.condition_key = dc.condition_key
    JOIN phm_star.dim_date dd ON fd.date_key_onset = dd.date_key
    CROSS JOIN measurement_period mp
    WHERE 
        dc.icd10_code LIKE 'K02%'  -- ICD-10 codes for dental caries
        AND fd.diagnosis_status = 'ACTIVE'
        AND dd.full_date BETWEEN mp.start_date AND mp.end_date
)
-- Final Results
SELECT 
    'Overall' as population,
    COUNT(DISTINCT ip.patient_key) as initial_population,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL THEN ip.patient_key END) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL AND dd.patient_key IS NOT NULL THEN ip.patient_key END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN de.patient_key IS NULL AND dd.patient_key IS NOT NULL THEN ip.patient_key END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN de.patient_key IS NULL THEN ip.patient_key END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_key = de.patient_key
LEFT JOIN dental_decay dd ON ip.patient_key = dd.patient_key;