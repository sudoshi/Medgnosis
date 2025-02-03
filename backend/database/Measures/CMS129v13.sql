-- CMS129v13: Prostate Cancer Bone Scan Avoidance
-- Using PHM EDW Schema

-- Step 1: Define measurement period
WITH measurement_period AS (
    SELECT 
        '2025-01-01'::DATE AS start_date,
        '2025-12-31'::DATE AS end_date
),

-- Step 2: Initial population - patients with prostate cancer
initial_population AS (
    SELECT DISTINCT 
        p.patient_id,
        cd.onset_date as diagnosis_date
    FROM phm_edw.patient p
    JOIN phm_edw.condition_diagnosis cd ON p.patient_id = cd.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        c.condition_code LIKE 'C61%'  -- ICD-10 code for prostate cancer
        AND c.code_system = 'ICD-10'
        AND cd.onset_date <= mp.end_date
        AND cd.active_ind = 'Y'
),

-- Step 3: Check for low-risk criteria
tumor_staging AS (
    SELECT DISTINCT
        cd.patient_id,
        CASE WHEN c.condition_code IN ('cT1a', 'cT1b', 'cT1c', 'cT2a') THEN 1 ELSE 0 END as low_risk_stage
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    JOIN initial_population ip ON cd.patient_id = ip.patient_id
    WHERE cd.active_ind = 'Y'
),

psa_results AS (
    SELECT 
        o.patient_id,
        o.observation_datetime,
        o.value_numeric as psa_value,
        ROW_NUMBER() OVER (PARTITION BY o.patient_id ORDER BY o.observation_datetime DESC) as result_rank
    FROM phm_edw.observation o
    JOIN initial_population ip ON o.patient_id = ip.patient_id
    WHERE 
        o.observation_code = '2857-1'  -- LOINC code for PSA
        AND o.active_ind = 'Y'
),

gleason_score AS (
    SELECT DISTINCT
        o.patient_id,
        CASE WHEN o.value_numeric <= 6 THEN 1 ELSE 0 END as low_risk_gleason
    FROM phm_edw.observation o
    JOIN initial_population ip ON o.patient_id = ip.patient_id
    WHERE 
        o.observation_code = '44641-9'  -- LOINC code for Gleason score
        AND o.active_ind = 'Y'
),

-- Step 4: Check for treatments during measurement period
prostate_treatments AS (
    SELECT DISTINCT
        pp.patient_id,
        pp.procedure_datetime as treatment_date,
        p.procedure_code,
        p.procedure_desc
    FROM phm_edw.procedure_performed pp
    JOIN phm_edw.procedure p ON pp.procedure_id = p.procedure_id
    CROSS JOIN measurement_period mp
    WHERE 
        p.procedure_code IN (
            '55866',      -- Radical prostatectomy
            '77427',      -- External beam radiation
            '55875'       -- Brachytherapy
        )
        AND pp.procedure_datetime BETWEEN mp.start_date AND mp.end_date
        AND pp.active_ind = 'Y'
),

-- Step 5: Check for bone scans
bone_scans AS (
    SELECT DISTINCT
        pp.patient_id,
        MIN(pp.procedure_datetime) as first_scan_date
    FROM phm_edw.procedure_performed pp
    JOIN phm_edw.procedure p ON pp.procedure_id = p.procedure_id
    JOIN initial_population ip ON pp.patient_id = ip.patient_id
    WHERE 
        p.procedure_code IN ('78306', '78300')  -- CPT codes for bone scan
        AND pp.procedure_datetime >= ip.diagnosis_date
        AND pp.active_ind = 'Y'
    GROUP BY pp.patient_id
),

-- Step 6: Check for exceptions
exceptions AS (
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE 
        -- Pain diagnosis
        (c.condition_code LIKE 'M54%' OR c.condition_code LIKE 'R52%')
        -- Salvage therapy
        OR c.condition_code IN ('Z92.3')  -- History of irradiation
        AND cd.active_ind = 'Y'
),

-- Step 7: Final measure calculation
final_calc AS (
    SELECT 
        ip.patient_id,
        CASE 
            WHEN ex.patient_id IS NOT NULL THEN 'Excluded'
            WHEN bs.patient_id IS NULL THEN 'Numerator'
            ELSE 'Denominator-Only'
        END as patient_status
    FROM initial_population ip
    JOIN tumor_staging ts ON ip.patient_id = ts.patient_id AND ts.low_risk_stage = 1
    JOIN psa_results psa ON ip.patient_id = psa.patient_id AND psa.result_rank = 1 AND psa.psa_value < 10
    JOIN gleason_score gs ON ip.patient_id = gs.patient_id AND gs.low_risk_gleason = 1
    JOIN prostate_treatments pt ON ip.patient_id = pt.patient_id
    LEFT JOIN bone_scans bs ON ip.patient_id = bs.patient_id
    LEFT JOIN exceptions ex ON ip.patient_id = ex.patient_id
)

-- Output measure results
SELECT 
    COUNT(DISTINCT patient_id) as initial_population,
    COUNT(DISTINCT CASE WHEN patient_status = 'Excluded' THEN patient_id END) as excluded_count,
    COUNT(DISTINCT CASE WHEN patient_status = 'Numerator' THEN patient_id END) as numerator_count,
    COUNT(DISTINCT CASE WHEN patient_status = 'Denominator-Only' THEN patient_id END) as denominator_only_count,
    ROUND(
        CAST(COUNT(DISTINCT CASE WHEN patient_status = 'Numerator' THEN patient_id END) AS DECIMAL) /
        NULLIF(COUNT(DISTINCT CASE WHEN patient_status != 'Excluded' THEN patient_id END), 0) * 100,
        1
    ) as performance_rate
FROM final_calc;

-- Optional: Detailed patient-level results
SELECT 
    p.patient_id,
    p.first_name,
    p.last_name,
    ts.low_risk_stage,
    psa.psa_value,
    gs.low_risk_gleason,
    pt.treatment_date,
    pt.procedure_desc as treatment_type,
    bs.first_scan_date,
    fc.patient_status
FROM final_calc fc
JOIN phm_edw.patient p ON fc.patient_id = p.patient_id
LEFT JOIN tumor_staging ts ON fc.patient_id = ts.patient_id
LEFT JOIN psa_results psa ON fc.patient_id = psa.patient_id AND psa.result_rank = 1
LEFT JOIN gleason_score gs ON fc.patient_id = gs.patient_id
LEFT JOIN prostate_treatments pt ON fc.patient_id = pt.patient_id
LEFT JOIN bone_scans bs ON fc.patient_id = bs.patient_id
ORDER BY p.last_name, p.first_name;
