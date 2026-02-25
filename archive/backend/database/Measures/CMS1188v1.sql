-- CMS1188v1: STI Testing for People with HIV
-- Using PHM EDW Schema

-- Step 1: Define measurement period
WITH measurement_period AS (
    SELECT 
        '2025-01-01'::DATE AS start_date,
        '2025-12-31'::DATE AS end_date
),

-- Step 2: Initial population - patients 13+ with HIV diagnosis and encounter
initial_population AS (
    SELECT DISTINCT 
        p.patient_id,
        p.date_of_birth
    FROM phm_edw.patient p
    JOIN phm_edw.condition_diagnosis cd ON p.patient_id = cd.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Age 13+ at start of measurement period
        DATE_PART('year', AGE(mp.start_date, p.date_of_birth)) >= 13
        -- HIV diagnosis (using ICD-10 codes)
        AND c.condition_code LIKE 'B20%'
        AND c.code_system = 'ICD-10'
        -- HIV diagnosis before end of measurement period
        AND cd.onset_date <= mp.end_date
        -- Had encounter during measurement period
        AND e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
        AND e.active_ind = 'Y'
),

-- Step 3: Check for chlamydia testing
chlamydia_testing AS (
    SELECT DISTINCT 
        o.patient_id,
        MAX(o.observation_datetime) as latest_test_date
    FROM phm_edw.observation o
    JOIN measurement_period mp ON o.observation_datetime BETWEEN mp.start_date AND mp.end_date
    WHERE 
        -- Using LOINC codes for chlamydia tests
        o.observation_code IN ('43304-5', '43305-2', '43306-0')  -- Example LOINC codes
        AND o.active_ind = 'Y'
    GROUP BY o.patient_id
),

-- Step 4: Check for gonorrhea testing
gonorrhea_testing AS (
    SELECT DISTINCT 
        o.patient_id,
        MAX(o.observation_datetime) as latest_test_date
    FROM phm_edw.observation o
    JOIN measurement_period mp ON o.observation_datetime BETWEEN mp.start_date AND mp.end_date
    WHERE 
        -- Using LOINC codes for gonorrhea tests
        o.observation_code IN ('43304-5', '43305-2', '43306-0')  -- Example LOINC codes
        AND o.active_ind = 'Y'
    GROUP BY o.patient_id
),

-- Step 5: Check for syphilis testing
syphilis_testing AS (
    SELECT DISTINCT 
        o.patient_id,
        MAX(o.observation_datetime) as latest_test_date
    FROM phm_edw.observation o
    JOIN measurement_period mp ON o.observation_datetime BETWEEN mp.start_date AND mp.end_date
    WHERE 
        -- Using LOINC codes for syphilis tests
        o.observation_code IN ('21414-0', '5292-8', '5293-6')  -- Example LOINC codes
        AND o.active_ind = 'Y'
    GROUP BY o.patient_id
),

-- Step 6: Final measure calculation
measure_calc AS (
    SELECT 
        ip.patient_id,
        CASE WHEN ct.patient_id IS NOT NULL 
             AND gt.patient_id IS NOT NULL 
             AND st.patient_id IS NOT NULL
        THEN 1 ELSE 0 END as numerator_flag
    FROM initial_population ip
    LEFT JOIN chlamydia_testing ct ON ip.patient_id = ct.patient_id
    LEFT JOIN gonorrhea_testing gt ON ip.patient_id = gt.patient_id
    LEFT JOIN syphilis_testing st ON ip.patient_id = st.patient_id
)

-- Step 7: Output measure results
SELECT 
    COUNT(DISTINCT patient_id) as denominator,
    SUM(numerator_flag) as numerator,
    ROUND(CAST(SUM(numerator_flag) AS DECIMAL) / COUNT(DISTINCT patient_id) * 100, 2) as performance_rate
FROM measure_calc;

-- Optional: Detailed patient-level results for gap analysis
SELECT 
    p.patient_id,
    p.first_name,
    p.last_name,
    ct.latest_test_date as last_chlamydia_test,
    gt.latest_test_date as last_gonorrhea_test,
    st.latest_test_date as last_syphilis_test,
    CASE 
        WHEN ct.patient_id IS NULL THEN 'Missing Chlamydia Test'
        WHEN gt.patient_id IS NULL THEN 'Missing Gonorrhea Test'
        WHEN st.patient_id IS NULL THEN 'Missing Syphilis Test'
        ELSE 'Compliant'
    END as status
FROM initial_population ip
JOIN phm_edw.patient p ON ip.patient_id = p.patient_id
LEFT JOIN chlamydia_testing ct ON ip.patient_id = ct.patient_id
LEFT JOIN gonorrhea_testing gt ON ip.patient_id = gt.patient_id
LEFT JOIN syphilis_testing st ON ip.patient_id = st.patient_id
ORDER BY p.last_name, p.first_name;
