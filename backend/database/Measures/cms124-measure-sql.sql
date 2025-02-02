-- CMS124v12: Cervical Cancer Screening
-- Using PHM EDW Schema

-- Step 1: Define measurement period
WITH measurement_period AS (
    SELECT 
        '2025-01-01'::DATE AS start_date,
        '2025-12-31'::DATE AS end_date
),

-- Step 2: Initial population - women 24-64 with encounter
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
        AND DATE_PART('year', AGE(mp.end_date, p.date_of_birth)) BETWEEN 24 AND 64
        AND e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
        AND e.active_ind = 'Y'
),

-- Step 3: Identify exclusions
-- Hysterectomy, absence of cervix, hospice care
exclusions AS (
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Hysterectomy with no residual cervix
        (c.condition_code IN ('Z90.710', 'Q51.5') AND c.code_system = 'ICD-10')
        -- Absence of cervix (congenital or acquired)
        OR (c.condition_code IN ('Z90.710', 'Q51.5') AND c.code_system = 'ICD-10')
        -- Hospice care
        OR (c.condition_code = 'Z51.5' AND c.code_system = 'ICD-10')
        AND cd.onset_date <= mp.end_date
        AND (cd.resolution_date IS NULL OR cd.resolution_date >= mp.start_date)
),

-- Step 4: Check for cervical cytology (within 3 years)
cervical_cytology AS (
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
        o.observation_code IN ('10524-7', '18500-9', '19762-4', '19764-0', '19765-7', '19766-5', '19774-9', '33717-0', '47527-7', '47528-5')  -- LOINC codes for Pap test
        AND o.observation_datetime BETWEEN (mp.start_date - INTERVAL '3 years') AND mp.end_date
        AND o.active_ind = 'Y'
),

-- Step 5: Check for HPV testing (within 5 years, age 30+)
hpv_testing AS (
    SELECT DISTINCT 
        o.patient_id,
        o.observation_datetime,
        ROW_NUMBER() OVER (
            PARTITION BY o.patient_id 
            ORDER BY o.observation_datetime DESC
        ) as result_rank
    FROM phm_edw.observation o
    CROSS JOIN measurement_period mp
    JOIN initial_population ip ON o.patient_id = ip.patient_id
    WHERE 
        o.observation_code IN ('21440-3', '30167-1', '38372-9', '59263-4', '59264-2', '59420-0', '69002-4', '71431-1', '75694-0', '77379-6', '77399-4', '77400-0', '82354-2', '82456-5', '82675-0', '95548-7', '95549-5')  -- LOINC codes for HPV
        AND o.observation_datetime BETWEEN (mp.start_date - INTERVAL '5 years') AND mp.end_date
        AND DATE_PART('year', AGE(o.observation_datetime, ip.date_of_birth)) >= 30
        AND o.active_ind = 'Y'
),

-- Step 6: Final measure calculation
final_calc AS (
    SELECT 
        ip.patient_id,
        CASE 
            WHEN ex.patient_id IS NOT NULL THEN 'Excluded'
            WHEN cc.patient_id IS NOT NULL THEN 'Numerator-Cytology'
            WHEN hpv.patient_id IS NOT NULL AND ip.age_at_end >= 30 THEN 'Numerator-HPV'
            ELSE 'Denominator-Only'
        END as patient_status
    FROM initial_population ip
    LEFT JOIN exclusions ex ON ip.patient_id = ex.patient_id
    LEFT JOIN cervical_cytology cc ON ip.patient_id = cc.patient_id AND cc.result_rank = 1
    LEFT JOIN hpv_testing hpv ON ip.patient_id = hpv.patient_id AND hpv.result_rank = 1
)

-- Output measure results
SELECT 
    COUNT(DISTINCT patient_id) as initial_population,
    COUNT(DISTINCT CASE WHEN patient_status = 'Excluded' THEN patient_id END) as excluded_count,
    COUNT(DISTINCT CASE WHEN patient_status LIKE 'Numerator%' THEN patient_id END) as numerator_count,
    COUNT(DISTINCT CASE WHEN patient_status = 'Denominator-Only' THEN patient_id END) as denominator_only_count,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN patient_status LIKE 'Numerator%' THEN patient_id END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN patient_status != 'Excluded' THEN patient_id END), 0) * 100,
        1
    ) as performance_rate
FROM final_calc;

-- Optional: Detailed patient-level results
SELECT 
    p.patient_id,
    p.first_name,
    p.last_name,
    fc.patient_status,
    cc.observation_datetime as latest_cytology_date,
    hpv.observation_datetime as latest_hpv_date
FROM final_calc fc
JOIN phm_edw.patient p ON fc.patient_id = p.patient_id
LEFT JOIN cervical_cytology cc ON fc.patient_id = cc.patient_id AND cc.result_rank = 1
LEFT JOIN hpv_testing hpv ON fc.patient_id = hpv.patient_id AND hpv.result_rank = 1
ORDER BY p.last_name, p.first_name;