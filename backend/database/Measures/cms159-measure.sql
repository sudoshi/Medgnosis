WITH measurement_period AS (
    SELECT 
        DATE '2024-01-01' as start_date,
        DATE '2024-12-31' as end_date
),

-- Initial Population: Get qualifying encounters with PHQ-9 scores
initial_encounters AS (
    SELECT DISTINCT
        e.encounter_id,
        e.patient_id,
        e.encounter_datetime,
        p.date_of_birth,
        cd.condition_id,
        c.condition_code,
        o.observation_id as phq9_id,
        o.value_numeric as phq9_score,
        o.observation_datetime as phq9_date,
        -- Calculate age at encounter
        DATE_PART('year', AGE(e.encounter_datetime, p.date_of_birth)) as patient_age
    FROM phm_edw.encounter e
    JOIN phm_edw.patient p ON e.patient_id = p.patient_id
    -- Join to get depression diagnosis
    JOIN phm_edw.condition_diagnosis cd ON e.patient_id = cd.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    -- Join to get PHQ-9 scores
    JOIN phm_edw.observation o ON e.patient_id = o.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Encounter in denominator identification period (14 to 2 months prior to measurement period)
        e.encounter_datetime BETWEEN 
            mp.start_date - INTERVAL '14 months' AND 
            mp.start_date - INTERVAL '2 months'
        -- Depression diagnosis codes (you would add actual codes here)
        AND c.condition_code IN ('F32.0', 'F32.1', 'F32.2', 'F32.3', 'F32.4', 'F32.5', 'F33.0', 'F33.1', 'F33.2', 'F33.3', 'F33.41', 'F33.9', 'F34.1')
        -- PHQ-9 LOINC codes
        AND o.observation_code IN ('44261-6', '89204-2')  -- PHQ-9 and PHQ-9M LOINC codes
        -- PHQ-9 score > 9
        AND o.value_numeric > 9
        -- PHQ-9 within 7 days prior to encounter
        AND o.observation_datetime BETWEEN 
            e.encounter_datetime - INTERVAL '7 days' AND 
            e.encounter_datetime
        -- Patient age >= 12
        AND DATE_PART('year', AGE(e.encounter_datetime, p.date_of_birth)) >= 12
),

-- Get the first qualifying encounter per patient (index event)
index_events AS (
    SELECT DISTINCT ON (patient_id)
        *
    FROM initial_encounters
    ORDER BY patient_id, encounter_datetime
),

-- Denominator Exclusions
exclusions AS (
    SELECT DISTINCT ie.patient_id
    FROM index_events ie
    -- Join to get exclusionary diagnoses
    LEFT JOIN phm_edw.condition_diagnosis cd ON ie.patient_id = cd.patient_id
    LEFT JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE 
        -- Bipolar disorder
        c.condition_code LIKE 'F31%'
        -- Personality disorder
        OR c.condition_code LIKE 'F60%'
        -- Schizophrenia
        OR c.condition_code LIKE 'F20%'
        -- Psychotic disorder
        OR c.condition_code LIKE 'F23%'
        -- Pervasive developmental disorder
        OR c.condition_code LIKE 'F84%'
),

-- Get follow-up PHQ-9 scores at 12 months
followup_scores AS (
    SELECT 
        ie.patient_id,
        ie.encounter_id as index_encounter_id,
        ie.phq9_date as index_phq9_date,
        o.value_numeric as followup_score,
        o.observation_datetime as followup_date,
        -- Flag if this is the last score in the follow-up period
        ROW_NUMBER() OVER (
            PARTITION BY ie.patient_id 
            ORDER BY o.observation_datetime DESC
        ) as score_rank
    FROM index_events ie
    JOIN phm_edw.observation o ON ie.patient_id = o.patient_id
    WHERE 
        -- PHQ-9 LOINC codes
        o.observation_code IN ('44261-6', '89204-2')
        -- Within 12 months +/- 60 days of index event
        AND o.observation_datetime BETWEEN 
            ie.phq9_date + INTERVAL '10 months' AND 
            ie.phq9_date + INTERVAL '14 months'
),

-- Final measure calculation
measure_calc AS (
    SELECT
        ie.patient_id,
        ie.encounter_id,
        ie.patient_age,
        CASE WHEN ie.patient_age BETWEEN 12 AND 17 THEN 1
             WHEN ie.patient_age >= 18 THEN 2
        END as stratum,
        CASE WHEN ex.patient_id IS NOT NULL THEN 0
             WHEN fs.followup_score < 5 THEN 1
             ELSE 0
        END as numerator,
        CASE WHEN ex.patient_id IS NOT NULL THEN 0
             ELSE 1
        END as denominator
    FROM index_events ie
    LEFT JOIN exclusions ex ON ie.patient_id = ex.patient_id
    LEFT JOIN followup_scores fs ON 
        ie.patient_id = fs.patient_id 
        AND fs.score_rank = 1  -- Get only the last score
)

-- Output results with stratification
SELECT 
    'Overall' as population,
    COUNT(*) as denominator_size,
    SUM(denominator) as denominator_count,
    SUM(CASE WHEN denominator = 1 THEN numerator ELSE 0 END) as numerator_count,
    ROUND(
        CAST(SUM(CASE WHEN denominator = 1 THEN numerator ELSE 0 END) AS DECIMAL) /
        NULLIF(SUM(denominator), 0) * 100,
        1
    ) as performance_rate
FROM measure_calc

UNION ALL

SELECT 
    CASE stratum 
        WHEN 1 THEN 'Age 12-17'
        WHEN 2 THEN 'Age 18+'
    END as population,
    COUNT(*) as denominator_size,
    SUM(denominator) as denominator_count,
    SUM(CASE WHEN denominator = 1 THEN numerator ELSE 0 END) as numerator_count,
    ROUND(
        CAST(SUM(CASE WHEN denominator = 1 THEN numerator ELSE 0 END) AS DECIMAL) /
        NULLIF(SUM(denominator), 0) * 100,
        1
    ) as performance_rate
FROM measure_calc
GROUP BY stratum
ORDER BY population;