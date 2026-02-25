-- CMS128v12: Anti-depressant Medication Management
-- Using PHM EDW Schema

-- Step 1: Define measurement period and key dates
WITH measurement_period AS (
    SELECT 
        '2025-01-01'::DATE AS start_date,
        '2025-12-31'::DATE AS end_date,
        '2025-04-30'::DATE AS age_reference_date
),

-- Step 2: Initial population - patients 18+ with depression diagnosis and antidepressant
initial_population AS (
    SELECT DISTINCT 
        p.patient_id,
        mo.medication_order_id,
        mo.start_datetime as ipsd,  -- Index Prescription Start Date
        p.date_of_birth,
        DATE_PART('year', AGE(mp.age_reference_date, p.date_of_birth)) as age_at_period
    FROM phm_edw.patient p
    JOIN phm_edw.medication_order mo ON p.patient_id = mo.patient_id
    JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    JOIN phm_edw.condition_diagnosis cd ON p.patient_id = cd.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Age 18+ as of April 30th
        DATE_PART('year', AGE(mp.age_reference_date, p.date_of_birth)) >= 18
        -- Antidepressant medication during intake period
        AND m.medication_code IN (
            SELECT medication_code 
            FROM phm_edw.medication 
            WHERE medication_name LIKE '%antidepressant%'
        )
        AND mo.start_datetime BETWEEN mp.start_date AND mp.end_date
        -- Major depression diagnosis within 60 days before/after med start
        AND c.condition_code LIKE 'F32%'  -- ICD-10 codes for major depression
        AND cd.onset_date BETWEEN (mo.start_datetime - INTERVAL '60 days') AND (mo.start_datetime + INTERVAL '60 days')
        -- Eligible encounter within 60 days before/after med start
        AND e.encounter_datetime BETWEEN (mo.start_datetime - INTERVAL '60 days') AND (mo.start_datetime + INTERVAL '60 days')
        AND mo.active_ind = 'Y'
        AND e.active_ind = 'Y'
        AND cd.active_ind = 'Y'
),

-- Step 3: Identify exclusions
exclusions AS (
    SELECT DISTINCT ip.patient_id
    FROM initial_population ip
    LEFT JOIN phm_edw.medication_order mo ON ip.patient_id = mo.patient_id
    LEFT JOIN phm_edw.condition_diagnosis cd ON ip.patient_id = cd.patient_id
    LEFT JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE 
        -- Prior antidepressant medication in 105 days before IPSD
        (mo.start_datetime BETWEEN (ip.ipsd - INTERVAL '105 days') AND ip.ipsd)
        -- Hospice care
        OR (c.condition_code = 'Z51.5' AND c.code_system = 'ICD-10'
            AND cd.onset_date <= ip.ipsd + INTERVAL '232 days'  -- Using longer treatment period
            AND (cd.resolution_date IS NULL OR cd.resolution_date >= ip.ipsd))
),

-- Step 4a: Check 84-day (12 week) continuous treatment
treatment_84_days AS (
    SELECT DISTINCT 
        ip.patient_id,
        ip.ipsd,
        COUNT(DISTINCT DATE_TRUNC('day', mo.start_datetime)) as treatment_days
    FROM initial_population ip
    JOIN phm_edw.medication_order mo ON ip.patient_id = mo.patient_id
    JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
    WHERE 
        m.medication_code IN (
            SELECT medication_code 
            FROM phm_edw.medication 
            WHERE medication_name LIKE '%antidepressant%'
        )
        AND mo.start_datetime BETWEEN ip.ipsd AND (ip.ipsd + INTERVAL '114 days')
        AND mo.active_ind = 'Y'
    GROUP BY ip.patient_id, ip.ipsd
    HAVING COUNT(DISTINCT DATE_TRUNC('day', mo.start_datetime)) >= 84
),

-- Step 4b: Check 180-day (6 month) continuous treatment
treatment_180_days AS (
    SELECT DISTINCT 
        ip.patient_id,
        ip.ipsd,
        COUNT(DISTINCT DATE_TRUNC('day', mo.start_datetime)) as treatment_days
    FROM initial_population ip
    JOIN phm_edw.medication_order mo ON ip.patient_id = mo.patient_id
    JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
    WHERE 
        m.medication_code IN (
            SELECT medication_code 
            FROM phm_edw.medication 
            WHERE medication_name LIKE '%antidepressant%'
        )
        AND mo.start_datetime BETWEEN ip.ipsd AND (ip.ipsd + INTERVAL '231 days')
        AND mo.active_ind = 'Y'
    GROUP BY ip.patient_id, ip.ipsd
    HAVING COUNT(DISTINCT DATE_TRUNC('day', mo.start_datetime)) >= 180
)

-- Step 5: Calculate final measure results
SELECT 
    'Rate 1 (84 days)' as measure,
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT CASE WHEN ex.patient_id IS NOT NULL THEN ip.patient_id END) as excluded_count,
    COUNT(DISTINCT CASE WHEN ex.patient_id IS NULL AND t84.patient_id IS NOT NULL THEN ip.patient_id END) as numerator_count,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN ex.patient_id IS NULL AND t84.patient_id IS NOT NULL THEN ip.patient_id END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN ex.patient_id IS NULL THEN ip.patient_id END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population ip
LEFT JOIN exclusions ex ON ip.patient_id = ex.patient_id
LEFT JOIN treatment_84_days t84 ON ip.patient_id = t84.patient_id

UNION ALL

SELECT 
    'Rate 2 (180 days)' as measure,
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT CASE WHEN ex.patient_id IS NOT NULL THEN ip.patient_id END) as excluded_count,
    COUNT(DISTINCT CASE WHEN ex.patient_id IS NULL AND t180.patient_id IS NOT NULL THEN ip.patient_id END) as numerator_count,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN ex.patient_id IS NULL AND t180.patient_id IS NOT NULL THEN ip.patient_id END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN ex.patient_id IS NULL THEN ip.patient_id END), 0) * 100,
        1
    ) as performance_rate
FROM initial_population ip
LEFT JOIN exclusions ex ON ip.patient_id = ex.patient_id
LEFT JOIN treatment_180_days t180 ON ip.patient_id = t180.patient_id;

-- Optional: Detailed patient-level results
SELECT 
    p.patient_id,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    ip.ipsd as index_prescription_date,
    CASE 
        WHEN ex.patient_id IS NOT NULL THEN 'Excluded'
        WHEN t84.patient_id IS NOT NULL THEN 'Met 84-day Treatment'
        ELSE 'Did Not Meet 84-day Treatment'
    END as treatment_84_days_status,
    CASE 
        WHEN ex.patient_id IS NOT NULL THEN 'Excluded'
        WHEN t180.patient_id IS NOT NULL THEN 'Met 180-day Treatment'
        ELSE 'Did Not Meet 180-day Treatment'
    END as treatment_180_days_status
FROM initial_population ip
JOIN phm_edw.patient p ON ip.patient_id = p.patient_id
LEFT JOIN exclusions ex ON ip.patient_id = ex.patient_id
LEFT JOIN treatment_84_days t84 ON ip.patient_id = t84.patient_id
LEFT JOIN treatment_180_days t180 ON ip.patient_id = t180.patient_id
ORDER BY p.last_name, p.first_name;
