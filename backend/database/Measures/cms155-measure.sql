-- CMS155v12: Weight Assessment and Counseling for Children/Adolescents
-- Using PHM EDW Schema

WITH measurement_period AS (
    SELECT 
        DATE '2024-01-01' as start_date,
        DATE '2024-12-31' as end_date
),

-- Common base population (used for all three populations)
base_population AS (
    SELECT DISTINCT
        e.encounter_id,
        e.patient_id,
        e.provider_id,
        e.encounter_datetime,
        p.date_of_birth,
        pr.specialty,
        DATE_PART('year', AGE(mp.end_date, p.date_of_birth)) as age_at_end
    FROM phm_edw.encounter e
    JOIN phm_edw.patient p ON e.patient_id = p.patient_id
    JOIN phm_edw.provider pr ON e.provider_id = pr.provider_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Age 3-17 at end of measurement period
        DATE_PART('year', AGE(mp.end_date, p.date_of_birth)) BETWEEN 3 AND 17
        -- Encounter during measurement period
        AND e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
        -- PCP or OB/GYN visit
        AND (
            pr.specialty IN ('Primary Care', 'Family Medicine', 'Pediatrics', 'Internal Medicine')
            OR pr.specialty = 'Obstetrics/Gynecology'
        )
        AND e.encounter_type IN ('Outpatient', 'Office Visit')
),

-- Common exclusions (used for all three populations)
common_exclusions AS (
    SELECT DISTINCT bp.patient_id
    FROM base_population bp
    WHERE EXISTS (
        -- Pregnancy diagnosis
        SELECT 1
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
        WHERE cd.patient_id = bp.patient_id
        AND c.condition_code LIKE 'Z3[23]%'  -- Pregnancy exam/test codes
        AND cd.onset_date BETWEEN 
            (SELECT start_date FROM measurement_period)
            AND (SELECT end_date FROM measurement_period)
    )
    OR EXISTS (
        -- Hospice care
        SELECT 1
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
        WHERE cd.patient_id = bp.patient_id
        AND c.condition_code = 'Z51.5'  -- Hospice care
    )
),

-- Population 1: BMI Percentile Documentation
bmi_documentation AS (
    SELECT DISTINCT bp.patient_id
    FROM base_population bp
    WHERE EXISTS (
        SELECT 1
        FROM phm_edw.observation o
        WHERE o.patient_id = bp.patient_id
        AND o.observation_code IN (
            '77606-2',  -- BMI Percentile
            '8302-2',   -- Height
            '29463-7'   -- Weight
        )
        AND o.observation_datetime BETWEEN 
            (SELECT start_date FROM measurement_period)
            AND (SELECT end_date FROM measurement_period)
    )
),

-- Population 2: Nutrition Counseling
nutrition_counseling AS (
    SELECT DISTINCT bp.patient_id
    FROM base_population bp
    WHERE EXISTS (
        SELECT 1
        FROM phm_edw.observation o
        WHERE o.patient_id = bp.patient_id
        AND o.observation_code IN (
            'select codes for nutrition counseling'
        )
        AND o.observation_datetime BETWEEN 
            (SELECT start_date FROM measurement_period)
            AND (SELECT end_date FROM measurement_period)
    )
),

-- Population 3: Physical Activity Counseling
physical_activity_counseling AS (
    SELECT DISTINCT bp.patient_id
    FROM base_population bp
    WHERE EXISTS (
        SELECT 1
        FROM phm_edw.observation o
        WHERE o.patient_id = bp.patient_id
        AND o.observation_code IN (
            'select codes for physical activity counseling'
        )
        AND o.observation_datetime BETWEEN 
            (SELECT start_date FROM measurement_period)
            AND (SELECT end_date FROM measurement_period)
    )
),

-- Results for Population 1 (BMI Documentation)
results_pop1 AS (
    SELECT
        CASE 
            WHEN bp.age_at_end BETWEEN 3 AND 11 THEN '3-11'
            WHEN bp.age_at_end BETWEEN 12 AND 17 THEN '12-17'
        END as age_strata,
        COUNT(DISTINCT bp.patient_id) as initial_population,
        COUNT(DISTINCT bp.patient_id) as denominator,
        COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL THEN bp.patient_id END) 
            as denominator_after_exclusions,
        COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL AND bd.patient_id IS NOT NULL 
            THEN bp.patient_id END) as numerator,
        ROUND(
            CAST(COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL AND bd.patient_id IS NOT NULL 
                THEN bp.patient_id END) AS DECIMAL) /
            NULLIF(COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL 
                THEN bp.patient_id END), 0)
            * 100, 2
        ) as performance_rate
    FROM base_population bp
    LEFT JOIN common_exclusions ce ON bp.patient_id = ce.patient_id
    LEFT JOIN bmi_documentation bd ON bp.patient_id = bd.patient_id
    GROUP BY 
        CASE 
            WHEN bp.age_at_end BETWEEN 3 AND 11 THEN '3-11'
            WHEN bp.age_at_end BETWEEN 12 AND 17 THEN '12-17'
        END
),

-- Results for Population 2 (Nutrition Counseling)
results_pop2 AS (
    SELECT
        CASE 
            WHEN bp.age_at_end BETWEEN 3 AND 11 THEN '3-11'
            WHEN bp.age_at_end BETWEEN 12 AND 17 THEN '12-17'
        END as age_strata,
        COUNT(DISTINCT bp.patient_id) as initial_population,
        COUNT(DISTINCT bp.patient_id) as denominator,
        COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL THEN bp.patient_id END) 
            as denominator_after_exclusions,
        COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL AND nc.patient_id IS NOT NULL 
            THEN bp.patient_id END) as numerator,
        ROUND(
            CAST(COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL AND nc.patient_id IS NOT NULL 
                THEN bp.patient_id END) AS DECIMAL) /
            NULLIF(COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL 
                THEN bp.patient_id END), 0)
            * 100, 2
        ) as performance_rate
    FROM base_population bp
    LEFT JOIN common_exclusions ce ON bp.patient_id = ce.patient_id
    LEFT JOIN nutrition_counseling nc ON bp.patient_id = nc.patient_id
    GROUP BY 
        CASE 
            WHEN bp.age_at_end BETWEEN 3 AND 11 THEN '3-11'
            WHEN bp.age_at_end BETWEEN 12 AND 17 THEN '12-17'
        END
),

-- Results for Population 3 (Physical Activity Counseling)
results_pop3 AS (
    SELECT
        CASE 
            WHEN bp.age_at_end BETWEEN 3 AND 11 THEN '3-11'
            WHEN bp.age_at_end BETWEEN 12 AND 17 THEN '12-17'
        END as age_strata,
        COUNT(DISTINCT bp.patient_id) as initial_population,
        COUNT(DISTINCT bp.patient_id) as denominator,
        COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL THEN bp.patient_id END) 
            as denominator_after_exclusions,
        COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL AND pac.patient_id IS NOT NULL 
            THEN bp.patient_id END) as numerator,
        ROUND(
            CAST(COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL AND pac.patient_id IS NOT NULL 
                THEN bp.patient_id END) AS DECIMAL) /
            NULLIF(COUNT(DISTINCT CASE WHEN ce.patient_id IS NULL 
                THEN bp.patient_id END), 0)
            * 100, 2
        ) as performance_rate
    FROM base_population bp
    LEFT JOIN common_exclusions ce ON bp.patient_id = ce.patient_id
    LEFT JOIN physical_activity_counseling pac ON bp.patient_id = pac.patient_id
    GROUP BY 
        CASE 
            WHEN bp.age_at_end BETWEEN 3 AND 11 THEN '3-11'
            WHEN bp.age_at_end BETWEEN 12 AND 17 THEN '12-17'
        END
)

-- Return combined results for all populations
SELECT 
    'Population 1 - BMI Documentation' as measure_component,
    * 
FROM results_pop1

UNION ALL

SELECT 
    'Population 2 - Nutrition Counseling' as measure_component,
    * 
FROM results_pop2

UNION ALL

SELECT 
    'Population 3 - Physical Activity Counseling' as measure_component,
    * 
FROM results_pop3

ORDER BY 
    measure_component,
    age_strata;

-- Note: This SQL needs actual codes for:
-- 1. Provider specialty classification
-- 2. BMI/Height/Weight observation codes
-- 3. Nutrition counseling codes
-- 4. Physical activity counseling codes
-- 5. Pregnancy diagnosis codes