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
    -- Children 1-20 years with dental evaluation
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
fluoride_applications AS (
    -- Count fluoride varnish applications
    SELECT 
        p.patient_id,
        COUNT(DISTINCT pp.procedure_datetime) as application_count
    FROM initial_population ip
    JOIN phm_edw.patient p ON ip.patient_id = p.patient_id
    JOIN phm_edw.procedure_performed pp ON p.patient_id = pp.patient_id
    JOIN phm_edw.procedure proc ON pp.procedure_id = proc.procedure_id
    CROSS JOIN measurement_period mp
    WHERE 
        proc.procedure_code = '99188'  -- Fluoride varnish application
        AND pp.procedure_datetime BETWEEN mp.start_date AND mp.end_date
    GROUP BY p.patient_id
),
numerator_patients AS (
    -- Patients with 2+ fluoride applications
    SELECT patient_id
    FROM fluoride_applications
    WHERE application_count >= 2
),
stratification AS (
    -- Age stratification
    SELECT 
        ip.patient_id,
        CASE 
            WHEN a.age_years BETWEEN 1 AND 5 THEN 1
            WHEN a.age_years BETWEEN 6 AND 12 THEN 2
            WHEN a.age_years BETWEEN 13 AND 20 THEN 3
        END as strata
    FROM initial_population ip
    JOIN age_at_start a ON ip.patient_id = a.patient_id
)
-- Final results with stratification
SELECT 
    'Overall' as population,
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL THEN ip.patient_id END) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL AND n.patient_id IS NOT NULL THEN ip.patient_id END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN de.patient_id IS NULL AND n.patient_id IS NOT NULL THEN ip.patient_id END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN de.patient_id IS NULL THEN ip.patient_id END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_id = de.patient_id
LEFT JOIN numerator_patients n ON ip.patient_id = n.patient_id

UNION ALL

-- Stratified results
SELECT 
    'Stratum ' || s.strata::text as population,
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL THEN ip.patient_id END) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL AND n.patient_id IS NOT NULL THEN ip.patient_id END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN de.patient_id IS NULL AND n.patient_id IS NOT NULL THEN ip.patient_id END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN de.patient_id IS NULL THEN ip.patient_id END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_id = de.patient_id
LEFT JOIN numerator_patients n ON ip.patient_id = n.patient_id
JOIN stratification s ON ip.patient_id = s.patient_id
GROUP BY s.strata
ORDER BY s.strata;

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
    -- Children 1-20 years with dental evaluation
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
fluoride_applications AS (
    -- Count fluoride varnish applications
    SELECT 
        fp.patient_key,
        COUNT(DISTINCT fp.procedure_perf_key) as application_count
    FROM initial_population ip
    JOIN phm_star.fact_procedure fp ON ip.patient_key = fp.patient_key
    JOIN phm_star.dim_procedure dp ON fp.procedure_key = dp.procedure_key
    CROSS JOIN measurement_period mp
    WHERE 
        dp.procedure_code = '99188'  -- Fluoride varnish application
        AND fp.date_key_procedure BETWEEN mp.start_key AND mp.end_key
    GROUP BY fp.patient_key
),
numerator_patients AS (
    -- Patients with 2+ fluoride applications
    SELECT patient_key
    FROM fluoride_applications
    WHERE application_count >= 2
),
stratification AS (
    -- Age stratification
    SELECT 
        ip.patient_key,
        CASE 
            WHEN a.age_years BETWEEN 1 AND 5 THEN 1
            WHEN a.age_years BETWEEN 6 AND 12 THEN 2
            WHEN a.age_years BETWEEN 13 AND 20 THEN 3
        END as strata
    FROM initial_population ip
    JOIN age_at_start a ON ip.patient_key = a.patient_key
)
-- Final results with stratification
SELECT 
    'Overall' as population,
    COUNT(DISTINCT ip.patient_key) as initial_population,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL THEN ip.patient_key END) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL AND n.patient_key IS NOT NULL THEN ip.patient_key END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN de.patient_key IS NULL AND n.patient_key IS NOT NULL THEN ip.patient_key END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN de.patient_key IS NULL THEN ip.patient_key END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_key = de.patient_key
LEFT JOIN numerator_patients n ON ip.patient_key = n.patient_key

UNION ALL

-- Stratified results
SELECT 
    'Stratum ' || s.strata::text as population,
    COUNT(DISTINCT ip.patient_key) as initial_population,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL THEN ip.patient_key END) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL AND n.patient_key IS NOT NULL THEN ip.patient_key END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN de.patient_key IS NULL AND n.patient_key IS NOT NULL THEN ip.patient_key END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN de.patient_key IS NULL THEN ip.patient_key END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_key = de.patient_key
LEFT JOIN numerator_patients n ON ip.patient_key = n.patient_key
JOIN stratification s ON ip.patient_key = s.patient_key
GROUP BY s.strata
ORDER BY s.strata;