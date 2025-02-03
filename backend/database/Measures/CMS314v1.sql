-- CMS314v1: HIV Viral Suppression
WITH measurement_period AS (
    SELECT 
        DATE '2024-01-01' as start_date,
        DATE '2024-12-31' as end_date
),

-- Get all patients with HIV diagnosis before or within first 90 days
hiv_patients AS (
    SELECT DISTINCT
        cd.patient_id,
        MIN(cd.onset_date) as first_hiv_date
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- HIV diagnosis codes
        c.condition_code IN (
            'B20',      -- HIV disease
            'Z21'       -- Asymptomatic HIV infection status
        )
        AND cd.diagnosis_status = 'ACTIVE'
        -- Prior to or during first 90 days of measurement period
        AND cd.onset_date <= mp.start_date + INTERVAL '90 days'
    GROUP BY cd.patient_id
),

-- Get qualifying encounters within first 240 days
qualifying_encounters AS (
    SELECT DISTINCT
        h.patient_id,
        e.encounter_id,
        e.encounter_datetime,
        h.first_hiv_date
    FROM hiv_patients h
    JOIN phm_edw.encounter e ON h.patient_id = e.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Encounter in first 240 days
        e.encounter_datetime BETWEEN mp.start_date AND mp.start_date + INTERVAL '240 days'
        AND e.status = 'COMPLETED'
),

-- Get last viral load test during measurement period
viral_loads AS (
    SELECT DISTINCT ON (q.patient_id)
        q.patient_id,
        o.observation_datetime,
        o.value_numeric as viral_load
    FROM qualifying_encounters q
    JOIN phm_edw.observation o ON q.patient_id = o.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- HIV viral load LOINC codes
        o.observation_code IN (
            '25836-8',    -- HIV RNA copies/mL
            '20447-9'     -- HIV-1 RNA [Log copies/mL]
        )
        -- During measurement period
        AND o.observation_datetime BETWEEN mp.start_date AND mp.end_date
    ORDER BY 
        q.patient_id,
        o.observation_datetime DESC  -- Get most recent
),

-- Final measure calculation
measure_calc AS (
    SELECT 
        q.patient_id,
        1 as denominator,
        CASE WHEN COALESCE(v.viral_load, 999999) < 200 THEN 1 ELSE 0 END as numerator
    FROM qualifying_encounters q
    LEFT JOIN viral_loads v ON q.patient_id = v.patient_id
)

-- Output results
SELECT 
    'Overall' as population,
    COUNT(DISTINCT patient_id) as initial_population,
    SUM(denominator) as denominator_count,
    SUM(numerator) as numerator_count,
    ROUND(
        CAST(SUM(numerator) AS DECIMAL) / 
        NULLIF(SUM(denominator), 0) * 100, 
        1
    ) as performance_rate
FROM measure_calc;
