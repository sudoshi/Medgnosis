-- CMS138v12: Tobacco Use Screening and Cessation Intervention
-- Using the Star Schema tables for optimal performance

-- Common CTE for measurement period
WITH measurement_period AS (
    SELECT 
        date_key_start,
        date_key_end
    FROM (
        SELECT 
            -- Assuming we're using a date dimension with YYYYMMDD format
            20240101 as date_key_start,  -- January 1, 2024
            20241231 as date_key_end     -- December 31, 2024
    ) mp
),

-- Initial Population (shared across all 3 populations)
-- Patients 12+ with 2+ encounters or 1 preventive encounter
initial_population AS (
    SELECT DISTINCT 
        p.patient_key,
        p.patient_id
    FROM phm_star.dim_patient p
    JOIN phm_star.fact_encounter e ON p.patient_key = e.patient_key
    JOIN phm_star.dim_date d ON e.date_key_encounter = d.date_key
    CROSS JOIN measurement_period mp
    WHERE d.date_key BETWEEN mp.date_key_start AND mp.date_key_end
    AND EXTRACT(YEAR FROM AGE(d.full_date, p.date_of_birth)) >= 12
    GROUP BY p.patient_key, p.patient_id
    HAVING COUNT(*) >= 2 
    OR COUNT(CASE WHEN e.encounter_type = 'PREVENTIVE' THEN 1 END) >= 1
),

-- Denominator Exclusions (patients in hospice)
hospice_exclusions AS (
    SELECT DISTINCT 
        e.patient_key
    FROM phm_star.fact_encounter e
    JOIN phm_star.dim_date d ON e.date_key_encounter = d.date_key
    CROSS JOIN measurement_period mp
    WHERE e.encounter_type = 'HOSPICE'
    AND d.date_key BETWEEN mp.date_key_start AND mp.date_key_end
),

-- Tobacco Use Screening
tobacco_screening AS (
    SELECT 
        o.patient_key,
        o.date_key_obs as screening_date_key,
        CASE 
            WHEN o.value_text IN ('TOBACCO_USER', 'CURRENT_TOBACCO_USER') THEN 'USER'
            WHEN o.value_text IN ('NON_TOBACCO_USER', 'FORMER_TOBACCO_USER') THEN 'NON_USER'
        END as tobacco_status
    FROM phm_star.fact_observation o
    JOIN phm_star.dim_date d ON o.date_key_obs = d.date_key
    CROSS JOIN measurement_period mp
    WHERE o.observation_code = 'TOBACCO_USE_SCREEN'  -- Replace with actual code
    AND d.date_key BETWEEN mp.date_key_start AND mp.date_key_end
),

-- Tobacco Cessation Intervention
tobacco_intervention AS (
    SELECT DISTINCT
        o.patient_key,
        o.date_key_obs as intervention_date_key
    FROM phm_star.fact_observation o
    JOIN phm_star.dim_date d ON o.date_key_obs = d.date_key
    CROSS JOIN measurement_period mp
    WHERE o.observation_code IN ('TOBACCO_CESSATION_COUNSELING', 'TOBACCO_CESSATION_MEDICATION')  -- Replace with actual codes
    AND d.date_key BETWEEN 
        -- Include 6 months prior to measurement period
        (SELECT date_key FROM phm_star.dim_date WHERE full_date = (SELECT full_date - INTERVAL '6 months' FROM phm_star.dim_date WHERE date_key = mp.date_key_start))
        AND mp.date_key_end
),

-- Population 1: Screening Rate
-- Numerator: Patients screened for tobacco use
population1_numerator AS (
    SELECT DISTINCT 
        ip.patient_key
    FROM initial_population ip
    JOIN tobacco_screening ts ON ip.patient_key = ts.patient_key
    WHERE ip.patient_key NOT IN (SELECT patient_key FROM hospice_exclusions)
),

-- Population 2: Intervention Rate for Tobacco Users
-- Denominator: Patients identified as tobacco users
population2_denominator AS (
    SELECT DISTINCT 
        ip.patient_key
    FROM initial_population ip
    JOIN tobacco_screening ts ON ip.patient_key = ts.patient_key
    WHERE ts.tobacco_status = 'USER'
    AND ip.patient_key NOT IN (SELECT patient_key FROM hospice_exclusions)
),

-- Population 2 Numerator: Tobacco users who received intervention
population2_numerator AS (
    SELECT DISTINCT 
        p2d.patient_key
    FROM population2_denominator p2d
    JOIN tobacco_intervention ti ON p2d.patient_key = ti.patient_key
),

-- Population 3: Combined Screening and Intervention
-- Numerator: Non-users + Users with intervention
population3_numerator AS (
    SELECT DISTINCT 
        ip.patient_key
    FROM initial_population ip
    LEFT JOIN tobacco_screening ts ON ip.patient_key = ts.patient_key
    LEFT JOIN tobacco_intervention ti ON ip.patient_key = ti.patient_key
    WHERE ip.patient_key NOT IN (SELECT patient_key FROM hospice_exclusions)
    AND (
        ts.tobacco_status = 'NON_USER'
        OR (ts.tobacco_status = 'USER' AND ti.patient_key IS NOT NULL)
    )
)

-- Final Results
SELECT 
    'Population 1' as measure_population,
    COUNT(DISTINCT ip.patient_key) as denominator,
    COUNT(DISTINCT p1n.patient_key) as numerator,
    ROUND(COUNT(DISTINCT p1n.patient_key)::DECIMAL / NULLIF(COUNT(DISTINCT ip.patient_key), 0) * 100, 2) as percentage
FROM initial_population ip
LEFT JOIN population1_numerator p1n ON ip.patient_key = p1n.patient_key
WHERE ip.patient_key NOT IN (SELECT patient_key FROM hospice_exclusions)

UNION ALL

SELECT 
    'Population 2' as measure_population,
    COUNT(DISTINCT p2d.patient_key) as denominator,
    COUNT(DISTINCT p2n.patient_key) as numerator,
    ROUND(COUNT(DISTINCT p2n.patient_key)::DECIMAL / NULLIF(COUNT(DISTINCT p2d.patient_key), 0) * 100, 2) as percentage
FROM population2_denominator p2d
LEFT JOIN population2_numerator p2n ON p2d.patient_key = p2n.patient_key

UNION ALL

SELECT 
    'Population 3' as measure_population,
    COUNT(DISTINCT ip.patient_key) as denominator,
    COUNT(DISTINCT p3n.patient_key) as numerator,
    ROUND(COUNT(DISTINCT p3n.patient_key)::DECIMAL / NULLIF(COUNT(DISTINCT ip.patient_key), 0) * 100, 2) as percentage
FROM initial_population ip
LEFT JOIN population3_numerator p3n ON ip.patient_key = p3n.patient_key
WHERE ip.patient_key NOT IN (SELECT patient_key FROM hospice_exclusions);
