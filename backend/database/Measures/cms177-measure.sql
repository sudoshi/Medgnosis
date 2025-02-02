-- CMS177v12: Child and Adolescent Major Depressive Disorder (MDD): Suicide Risk Assessment
WITH measurement_period AS (
    SELECT 
        DATE '2024-01-01' as start_date,
        DATE '2024-12-31' as end_date
),

-- Initial Population: Patients 6-16 with MDD diagnosis
encounters_with_mdd AS (
    SELECT DISTINCT
        e.encounter_id,
        e.patient_id,
        e.encounter_datetime,
        p.date_of_birth,
        c.condition_code,
        c.condition_name,
        cd.diagnosis_status,
        -- Calculate age at start of measurement period
        DATE_PART('year', AGE(mp.start_date, p.date_of_birth)) as age_at_start
    FROM phm_edw.encounter e
    JOIN phm_edw.patient p ON e.patient_id = p.patient_id
    JOIN phm_edw.condition_diagnosis cd ON e.patient_id = cd.patient_id
        AND e.encounter_id = cd.encounter_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Age between 6-16 at start of measurement period
        DATE_PART('year', AGE(mp.start_date, p.date_of_birth)) BETWEEN 6 AND 16
        -- Major Depressive Disorder ICD-10 codes
        AND c.condition_code IN (
            'F32.0', 'F32.1', 'F32.2', 'F32.3',  -- Major depressive disorder, single episode
            'F33.0', 'F33.1', 'F33.2', 'F33.3'   -- Major depressive disorder, recurrent
        )
        -- Active diagnosis
        AND cd.diagnosis_status = 'ACTIVE'
        -- Encounter during measurement period
        AND e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
),

-- Get suicide risk assessments
suicide_assessments AS (
    SELECT
        o.encounter_id,
        o.patient_id,
        o.observation_datetime,
        o.observation_code,
        o.observation_desc,
        CASE 
            WHEN o.value_text IS NOT NULL OR o.value_numeric IS NOT NULL 
            THEN 1 
            ELSE 0 
        END as has_assessment
    FROM encounters_with_mdd e
    JOIN phm_edw.observation o ON e.patient_id = o.patient_id 
        AND e.encounter_id = o.encounter_id
    WHERE 
        -- Suicide risk assessment LOINC codes
        o.observation_code IN (
            '44261-6',    -- PHQ-9 screening instrument
            '89204-2',    -- PHQ-9 Modified for teens
            '69725-0',    -- Columbia Suicide Severity Rating Scale
            '75626-2',    -- Total score CSSRS
            '81987-0'     -- PHQ-9 Modified for adolescents
        )
),

-- Final measure calculation
measure_calc AS (
    SELECT 
        e.encounter_id,
        e.patient_id,
        e.age_at_start,
        1 as denominator,  -- All qualifying encounters go to denominator
        COALESCE(MAX(sa.has_assessment), 0) as numerator  -- 1 if any assessment exists
    FROM encounters_with_mdd e
    LEFT JOIN suicide_assessments sa ON e.encounter_id = sa.encounter_id
    GROUP BY 
        e.encounter_id,
        e.patient_id,
        e.age_at_start
)

-- Output results
SELECT 
    'Overall' as population,
    COUNT(*) as denominator_size,
    SUM(denominator) as denominator_count,
    SUM(numerator) as numerator_count,
    ROUND(
        CAST(SUM(numerator) AS DECIMAL) / 
        NULLIF(SUM(denominator), 0) * 100, 
        1
    ) as performance_rate
FROM measure_calc

UNION ALL

-- Age stratification
SELECT 
    CASE 
        WHEN age_at_start BETWEEN 6 AND 11 THEN 'Ages 6-11'
        WHEN age_at_start BETWEEN 12 AND 16 THEN 'Ages 12-16'
    END as population,
    COUNT(*) as denominator_size,
    SUM(denominator) as denominator_count,
    SUM(numerator) as numerator_count,
    ROUND(
        CAST(SUM(numerator) AS DECIMAL) / 
        NULLIF(SUM(denominator), 0) * 100, 
        1
    ) as performance_rate
FROM measure_calc
GROUP BY 
    CASE 
        WHEN age_at_start BETWEEN 6 AND 11 THEN 'Ages 6-11'
        WHEN age_at_start BETWEEN 12 AND 16 THEN 'Ages 12-16'
    END
ORDER BY population;