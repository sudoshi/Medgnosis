-- CMS125v12: Breast Cancer Screening
-- Using PHM EDW Schema

-- Step 1: Define measurement period
WITH measurement_period AS (
    SELECT 
        '2025-01-01'::DATE AS start_date,
        '2025-12-31'::DATE AS end_date,
        '2023-10-01'::DATE AS lookback_start  -- October 1 two years prior
),

-- Step 2: Initial population - women 52-74 with encounter
initial_population AS (
    SELECT DISTINCT 
        p.patient_id,
        p.date_of_birth,
        DATE_PART('year', AGE(mp.end_date, p.date_of_birth)) as age_at_end
    FROM phm_edw.patient p
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        p.gender = 'F'
        AND DATE_PART('year', AGE(mp.end_date, p.date_of_birth)) BETWEEN 52 AND 74
        AND e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
        AND e.active_ind = 'Y'
),

-- Step 3: Identify exclusions

-- Step 3a: Bilateral mastectomy
bilateral_mastectomy AS (
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        (c.condition_code IN ('Z90.13') AND c.code_system = 'ICD-10')  -- Bilateral mastectomy status
        AND cd.onset_date <= mp.end_date
),

-- Step 3b: Unilateral mastectomies
unilateral_mastectomies AS (
    SELECT 
        cd.patient_id,
        COUNT(DISTINCT CASE 
            WHEN c.condition_code IN ('Z90.11') THEN 'RIGHT'
            WHEN c.condition_code IN ('Z90.12') THEN 'LEFT'
        END) as mastectomy_count
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        c.condition_code IN ('Z90.11', 'Z90.12')  -- Right and left mastectomy
        AND cd.onset_date <= mp.end_date
    GROUP BY cd.patient_id
    HAVING COUNT(DISTINCT CASE 
        WHEN c.condition_code IN ('Z90.11') THEN 'RIGHT'
        WHEN c.condition_code IN ('Z90.12') THEN 'LEFT'
    END) = 2
),

-- Step 3c: Hospice care
hospice_patients AS (
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        c.condition_code = 'Z51.5'  -- Hospice care
        AND cd.onset_date <= mp.end_date
        AND (cd.resolution_date IS NULL OR cd.resolution_date >= mp.start_date)
),

-- Step 3d: Nursing home patients (age 66+)
nursing_home_patients AS (
    SELECT DISTINCT ip.patient_id
    FROM initial_population ip
    JOIN phm_edw.encounter e ON ip.patient_id = e.patient_id
    WHERE 
        ip.age_at_end >= 66
        AND e.encounter_type = 'NH'  -- Nursing Home encounter
),

-- Step 3e: Advanced illness patients (age 66+)
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
            c.condition_code LIKE 'G30%'  -- Alzheimer's
            OR c.condition_code LIKE 'F01%'  -- Vascular dementia
            OR c.condition_code LIKE 'F02%'  -- Dementia in other diseases
            OR c.condition_code LIKE 'F03%'  -- Unspecified dementia
        )
        AND cd.onset_date <= mp.end_date
),

-- Step 4: Check for mammogram screening
mammogram_screening AS (
    SELECT DISTINCT 
        o.patient_id,
        o.observation_datetime,
        ROW_NUMBER() OVER (
            PARTITION BY o.patient_id 
            ORDER BY o.observation_datetime DESC
        ) as result_rank
    FROM phm_edw.observation o
    CROSS JOIN measurement_period mp
    WHERE 
        o.observation_code IN ('24604-1', '24605-8', '24606-6', '24610-8')  -- LOINC codes for mammogram
        AND o.observation_datetime BETWEEN mp.lookback_start AND mp.end_date
        AND o.active_ind = 'Y'
),

-- Step 5: Final measure calculation
final_calc AS (
    SELECT 
        ip.patient_id,
        CASE 
            WHEN bm.patient_id IS NOT NULL THEN 'Excluded-BilateralMastectomy'
            WHEN um.patient_id IS NOT NULL THEN 'Excluded-UnilateralMastectomies'
            WHEN hp.patient_id IS NOT NULL THEN 'Excluded-Hospice'
            WHEN nhp.patient_id IS NOT NULL THEN 'Excluded-NursingHome'
            WHEN aip.patient_id IS NOT NULL THEN 'Excluded-AdvancedIllness'
            WHEN ms.patient_id IS NOT NULL THEN 'Numerator-Screened'
            ELSE 'Denominator-Only'
        END as patient_status
    FROM initial_population ip
    LEFT JOIN bilateral_mastectomy bm ON ip.patient_id = bm.patient_id
    LEFT JOIN unilateral_mastectomies um ON ip.patient_id = um.patient_id
    LEFT JOIN hospice_patients hp ON ip.patient_id = hp.patient_id
    LEFT JOIN nursing_home_patients nhp ON ip.patient_id = nhp.patient_id
    LEFT JOIN advanced_illness_patients aip ON ip.patient_id = aip.patient_id
    LEFT JOIN mammogram_screening ms ON ip.patient_id = ms.patient_id AND ms.result_rank = 1
)

-- Output measure results
SELECT 
    COUNT(DISTINCT patient_id) as initial_population,
    COUNT(DISTINCT CASE WHEN patient_status LIKE 'Excluded%' THEN patient_id END) as excluded_count,
    COUNT(DISTINCT CASE WHEN patient_status = 'Numerator-Screened' THEN patient_id END) as numerator_count,
    COUNT(DISTINCT CASE WHEN patient_status = 'Denominator-Only' THEN patient_id END) as denominator_only_count,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN patient_status = 'Numerator-Screened' THEN patient_id END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN patient_status NOT LIKE 'Excluded%' THEN patient_id END), 0) * 100,
        1
    ) as performance_rate
FROM final_calc;

-- Optional: Detailed patient-level results
SELECT 
    p.patient_id,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    fc.patient_status,
    ms.observation_datetime as latest_mammogram_date
FROM final_calc fc
JOIN phm_edw.patient p ON fc.patient_id = p.patient_id
LEFT JOIN mammogram_screening ms ON fc.patient_id = ms.patient_id AND ms.result_rank = 1
ORDER BY p.last_name, p.first_name;
