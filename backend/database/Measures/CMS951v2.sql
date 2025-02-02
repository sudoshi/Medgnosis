-- Using Inmon 3NF model (phm_edw)
WITH measurement_period AS (
    SELECT 
        '2024-01-01'::date as start_date,
        '2024-12-31'::date as end_date
),
initial_population AS (
    SELECT DISTINCT
        p.patient_id,
        cd.onset_date as diabetes_diagnosis_date
    FROM phm_edw.patient p
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    JOIN phm_edw.condition_diagnosis cd ON p.patient_id = cd.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        DATE_PART('year', AGE(mp.start_date, p.date_of_birth)) BETWEEN 18 AND 75
        AND c.condition_code LIKE 'E11%' -- Type 2 Diabetes
        AND cd.diagnosis_status = 'ACTIVE'
        AND e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
),
denominator_exclusions AS (
    -- ESRD, CKD Stage 5, or hospice care
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        (c.condition_code IN ('N18.6', 'Z99.2') -- ESRD
        OR c.condition_code = 'N18.5' -- CKD Stage 5
        OR c.condition_code = 'Z51.5') -- Hospice care
        AND cd.diagnosis_status = 'ACTIVE'
        AND cd.onset_date <= mp.end_date
        AND (cd.resolution_date IS NULL OR cd.resolution_date >= mp.start_date)
),
kidney_tests AS (
    -- Both eGFR and uACR tests within period
    SELECT 
        o.patient_id,
        MAX(CASE WHEN o.observation_code = '62238-1' THEN 1 ELSE 0 END) as has_egfr,
        MAX(CASE WHEN o.observation_code = '14959-1' THEN 1 ELSE 0 END) as has_uacr
    FROM phm_edw.observation o
    CROSS JOIN measurement_period mp
    WHERE 
        o.observation_code IN ('62238-1', '14959-1') -- LOINC codes for eGFR and uACR
        AND o.observation_datetime BETWEEN mp.start_date AND mp.end_date
    GROUP BY o.patient_id
)
-- Final Results
SELECT 
    'Overall' as population,
    COUNT(DISTINCT i.patient_id) as initial_population,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL THEN i.patient_id END) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NULL 
        AND kt.has_egfr = 1 AND kt.has_uacr = 1 THEN i.patient_id END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN de.patient_id IS NULL 
            AND kt.has_egfr = 1 AND kt.has_uacr = 1 THEN i.patient_id END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN de.patient_id IS NULL THEN i.patient_id END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population i
LEFT JOIN denominator_exclusions de ON i.patient_id = de.patient_id
LEFT JOIN kidney_tests kt ON i.patient_id = kt.patient_id;

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
        fd.date_key_onset as diabetes_diagnosis_key
    FROM phm_star.dim_patient dp
    JOIN phm_star.fact_encounter fe ON dp.patient_key = fe.patient_key
    JOIN phm_star.fact_diagnosis fd ON dp.patient_key = fd.patient_key
    JOIN phm_star.dim_condition dc ON fd.condition_key = dc.condition_key
    JOIN phm_star.dim_date dd ON fd.date_key_onset = dd.date_key
    CROSS JOIN measurement_period mp
    WHERE 
        DATE_PART('year', AGE(mp.start_date, dp.date_of_birth)) BETWEEN 18 AND 75
        AND dc.icd10_code LIKE 'E11%'
        AND fd.diagnosis_status = 'ACTIVE'
        AND fe.date_key_encounter BETWEEN mp.start_key AND mp.end_key
),
denominator_exclusions AS (
    SELECT DISTINCT fd.patient_key
    FROM phm_star.fact_diagnosis fd
    JOIN phm_star.dim_condition dc ON fd.condition_key = dc.condition_key
    WHERE 
        (dc.icd10_code IN ('N18.6', 'Z99.2', 'N18.5', 'Z51.5'))
        AND fd.diagnosis_status = 'ACTIVE'
),
kidney_tests AS (
    SELECT 
        fo.patient_key,
        MAX(CASE WHEN fo.observation_code = '62238-1' THEN 1 ELSE 0 END) as has_egfr,
        MAX(CASE WHEN fo.observation_code = '14959-1' THEN 1 ELSE 0 END) as has_uacr
    FROM phm_star.fact_observation fo
    CROSS JOIN measurement_period mp
    WHERE 
        fo.observation_code IN ('62238-1', '14959-1')
        AND fo.date_key_obs BETWEEN mp.start_key AND mp.end_key
    GROUP BY fo.patient_key
)
-- Final Results
SELECT 
    'Overall' as population,
    COUNT(DISTINCT i.patient_key) as initial_population,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL THEN i.patient_key END) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_key IS NULL 
        AND kt.has_egfr = 1 AND kt.has_uacr = 1 THEN i.patient_key END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN de.patient_key IS NULL 
            AND kt.has_egfr = 1 AND kt.has_uacr = 1 THEN i.patient_key END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN de.patient_key IS NULL THEN i.patient_key END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population i
LEFT JOIN denominator_exclusions de ON i.patient_key = de.patient_key
LEFT JOIN kidney_tests kt ON i.patient_key = kt.patient_key;