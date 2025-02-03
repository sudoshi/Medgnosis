-- CMS122v12: Diabetes: Hemoglobin A1c Poor Control (>9%)
-- Using PHM EDW Schema

-- Step 1: Define measurement period
WITH measurement_period AS (
    SELECT 
        '2025-01-01'::DATE AS start_date,
        '2025-12-31'::DATE AS end_date
),

-- Step 2: Initial population - patients 18-75 with diabetes
initial_population AS (
    SELECT DISTINCT 
        p.patient_id,
        p.date_of_birth,
        DATE_PART('year', AGE(mp.end_date, p.date_of_birth)) as age_at_end
    FROM phm_edw.patient p
    JOIN phm_edw.condition_diagnosis cd ON p.patient_id = cd.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Age between 18-75 at end of measurement period
        DATE_PART('year', AGE(mp.end_date, p.date_of_birth)) BETWEEN 18 AND 75
        -- Diabetes diagnosis (using ICD-10 codes for diabetes)
        AND c.condition_code LIKE 'E11%'  -- Type 2 Diabetes
        AND c.code_system = 'ICD-10'
        -- Active diagnosis overlapping measurement period
        AND cd.onset_date <= mp.end_date
        AND (cd.resolution_date IS NULL OR cd.resolution_date >= mp.start_date)
        -- Had encounter during measurement period
        AND e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
        AND e.active_ind = 'Y'
),

-- Step 3: Identify patients in hospice care
hospice_patients AS (
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        c.condition_code IN ('Z51.5')  -- Encounter for palliative care
        AND cd.onset_date <= mp.end_date
        AND (cd.resolution_date IS NULL OR cd.resolution_date >= mp.start_date)
),

-- Step 4: Identify nursing home patients (age 66+)
nursing_home_patients AS (
    SELECT DISTINCT ip.patient_id
    FROM initial_population ip
    JOIN phm_edw.encounter e ON ip.patient_id = e.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        ip.age_at_end >= 66
        AND e.encounter_type = 'NH'  -- Nursing Home encounter type
        AND e.encounter_datetime <= mp.end_date
),

-- Step 5: Identify advanced illness patients (age 66+)
advanced_illness_patients AS (
    SELECT DISTINCT ip.patient_id
    FROM initial_population ip
    JOIN phm_edw.condition_diagnosis cd ON ip.patient_id = cd.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        ip.age_at_end >= 66
        AND (
            -- Advanced illness diagnoses
            c.condition_code IN ('G30%', 'F01%', 'F02%', 'F03%')  -- Dementia codes
            OR c.condition_code IN ('C00%', 'C97%')  -- Cancer codes
        )
        AND cd.onset_date <= mp.end_date
        AND (cd.resolution_date IS NULL OR cd.resolution_date >= mp.start_date)
),

-- Step 6: Get most recent HbA1c result
recent_hba1c AS (
    SELECT 
        o.patient_id,
        o.observation_datetime,
        o.value_numeric,
        ROW_NUMBER() OVER (
            PARTITION BY o.patient_id 
            ORDER BY o.observation_datetime DESC
        ) as result_rank
    FROM phm_edw.observation o
    CROSS JOIN measurement_period mp
    WHERE 
        o.observation_code = '4548-4'  -- LOINC code for HbA1c
        AND o.observation_datetime BETWEEN mp.start_date AND mp.end_date
        AND o.active_ind = 'Y'
),

-- Step 7: Final measure calculation
final_calc AS (
    SELECT 
        ip.patient_id,
        CASE 
            WHEN hp.patient_id IS NOT NULL THEN 'Excluded-Hospice'
            WHEN nhp.patient_id IS NOT NULL THEN 'Excluded-NursingHome'
            WHEN aip.patient_id IS NOT NULL THEN 'Excluded-AdvancedIllness'
            WHEN rh.patient_id IS NULL THEN 'Numerator-NoTest'
            WHEN rh.value_numeric > 9.0 THEN 'Numerator-PoorControl'
            ELSE 'Denominator-Only'
        END as patient_status
    FROM initial_population ip
    LEFT JOIN hospice_patients hp ON ip.patient_id = hp.patient_id
    LEFT JOIN nursing_home_patients nhp ON ip.patient_id = nhp.patient_id
    LEFT JOIN advanced_illness_patients aip ON ip.patient_id = aip.patient_id
    LEFT JOIN recent_hba1c rh ON ip.patient_id = rh.patient_id AND rh.result_rank = 1
)

-- Output measure results
SELECT 
    COUNT(DISTINCT patient_id) as initial_population,
    COUNT(DISTINCT CASE WHEN patient_status LIKE 'Excluded%' THEN patient_id END) as excluded_count,
    COUNT(DISTINCT CASE WHEN patient_status LIKE 'Numerator%' THEN patient_id END) as numerator_count,
    COUNT(DISTINCT CASE WHEN patient_status = 'Denominator-Only' THEN patient_id END) as denominator_only_count,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN patient_status LIKE 'Numerator%' THEN patient_id END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN patient_status NOT LIKE 'Excluded%' THEN patient_id END), 0) * 100,
        1
    ) as performance_rate
FROM final_calc;

-- Optional: Detailed patient-level results
SELECT 
    p.patient_id,
    p.first_name,
    p.last_name,
    fc.patient_status,
    rh.observation_datetime as latest_hba1c_date,
    rh.value_numeric as latest_hba1c_result
FROM final_calc fc
JOIN phm_edw.patient p ON fc.patient_id = p.patient_id
LEFT JOIN recent_hba1c rh ON fc.patient_id = rh.patient_id AND rh.result_rank = 1
ORDER BY p.last_name, p.first_name;
