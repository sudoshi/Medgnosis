-- CMS139v12: Falls: Screening for Future Fall Risk
-- Using the 3NF EDW schema for direct source data access

WITH measurement_period AS (
    SELECT 
        '2024-01-01'::DATE as start_date,
        '2024-12-31'::DATE as end_date
),

-- Initial Population: Patients 65+ at start of measurement period with eligible encounter
initial_population AS (
    SELECT DISTINCT
        p.patient_id
    FROM phm_edw.patient p
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Age 65+ at start of measurement period
        EXTRACT(YEAR FROM AGE(mp.start_date, p.date_of_birth)) >= 65
        -- Encounter during measurement period
        AND e.encounter_datetime::DATE BETWEEN mp.start_date AND mp.end_date
        -- Eligible encounter types
        AND e.encounter_type IN ('OUTPATIENT', 'ANNUAL_WELLNESS', 'OFFICE_VISIT')
        AND e.status = 'COMPLETED'
        AND p.active_ind = 'Y'
),

-- Denominator Exclusions: Patients in hospice during measurement period
hospice_patients AS (
    SELECT DISTINCT
        e.patient_id
    FROM phm_edw.encounter e
    CROSS JOIN measurement_period mp
    WHERE 
        e.encounter_type = 'HOSPICE'
        AND e.encounter_datetime::DATE BETWEEN mp.start_date AND mp.end_date
),

-- Numerator: Patients screened for fall risk during measurement period
fall_risk_screening AS (
    SELECT DISTINCT
        o.patient_id
    FROM phm_edw.observation o
    CROSS JOIN measurement_period mp
    WHERE 
        o.observation_code IN ('FALL_RISK_ASSESSMENT', 'FALL_SCREENING')  -- Replace with actual codes
        AND o.observation_datetime::DATE BETWEEN mp.start_date AND mp.end_date
        AND o.active_ind = 'Y'
),

-- Measure calculation
measure_calc AS (
    SELECT 
        'Falls Screening' as measure_name,
        COUNT(DISTINCT ip.patient_id) as initial_population,
        COUNT(DISTINCT CASE WHEN hp.patient_id IS NOT NULL THEN ip.patient_id END) as excluded_count,
        COUNT(DISTINCT CASE 
            WHEN hp.patient_id IS NULL AND frs.patient_id IS NOT NULL 
            THEN ip.patient_id 
        END) as numerator_count
    FROM initial_population ip
    LEFT JOIN hospice_patients hp ON ip.patient_id = hp.patient_id
    LEFT JOIN fall_risk_screening frs ON ip.patient_id = frs.patient_id
)

-- Final Results
SELECT 
    measure_name,
    initial_population as denominator,
    excluded_count as exclusions,
    numerator_count as numerator,
    ROUND(
        CAST(numerator_count AS DECIMAL) / 
        NULLIF((initial_population - excluded_count), 0) * 100,
        2
    ) as performance_rate
FROM measure_calc;

-- Detailed Patient List for Validation
SELECT 
    p.patient_id,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    CASE 
        WHEN hp.patient_id IS NOT NULL THEN 'Excluded - Hospice'
        WHEN frs.patient_id IS NOT NULL THEN 'Met - Screened'
        ELSE 'Not Met - No Screening'
    END as measure_status,
    MAX(o.observation_datetime) as screening_date
FROM initial_population ip
JOIN phm_edw.patient p ON ip.patient_id = p.patient_id
LEFT JOIN hospice_patients hp ON ip.patient_id = hp.patient_id
LEFT JOIN fall_risk_screening frs ON ip.patient_id = frs.patient_id
LEFT JOIN phm_edw.observation o ON 
    p.patient_id = o.patient_id 
    AND o.observation_code IN ('FALL_RISK_ASSESSMENT', 'FALL_SCREENING')
GROUP BY 
    p.patient_id,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    hp.patient_id,
    frs.patient_id
ORDER BY 
    p.last_name, 
    p.first_name;