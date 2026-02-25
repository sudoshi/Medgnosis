-- CMS135v12 Heart Failure Treatment Measure
-- Using Inmon-style EDW schema (phm_edw)

WITH patient_age AS (
    -- Calculate patient age at end of measurement period
    SELECT 
        p.patient_id,
        DATE_PART('year', AGE('2024-12-31', p.date_of_birth)) as age_at_period_end
    FROM phm_edw.patient p
),

qualifying_encounters AS (
    -- Identify patients with two eligible encounters
    SELECT 
        patient_id,
        COUNT(DISTINCT encounter_id) as encounter_count
    FROM phm_edw.encounter
    WHERE encounter_datetime BETWEEN '2024-01-01' AND '2024-12-31'
    AND encounter_type IN ('OUTPATIENT', 'OFFICE VISIT')
    GROUP BY patient_id
    HAVING COUNT(DISTINCT encounter_id) >= 2
),

heart_failure_diagnosis AS (
    -- Identify patients with heart failure diagnosis
    SELECT DISTINCT
        cd.patient_id,
        cd.onset_date,
        cd.diagnosis_status
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE c.condition_code LIKE 'I50%' -- ICD-10 codes for heart failure
    AND cd.diagnosis_status = 'ACTIVE'
),

lvef_observations AS (
    -- Track LVEF measurements
    SELECT 
        o.patient_id,
        o.observation_datetime,
        o.value_numeric as lvef_value,
        o.value_text
    FROM phm_edw.observation o
    WHERE o.observation_code IN ('8834-4', '8835-1') -- LOINC codes for LVEF
    AND (o.value_numeric <= 40 OR 
         o.value_text LIKE '%severe%' OR 
         o.value_text LIKE '%moderate%')
),

initial_population AS (
    -- Combine age, encounters, and HF diagnosis criteria
    SELECT DISTINCT 
        p.patient_id,
        pa.age_at_period_end,
        hf.onset_date as hf_diagnosis_date
    FROM phm_edw.patient p
    JOIN patient_age pa ON p.patient_id = pa.patient_id
    JOIN qualifying_encounters qe ON p.patient_id = qe.patient_id
    JOIN heart_failure_diagnosis hf ON p.patient_id = hf.patient_id
    WHERE pa.age_at_period_end >= 18
),

denominator_exclusions AS (
    -- Identify patients with transplant or LVAD
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE c.condition_code IN (
        'Z94.1',  -- Heart transplant
        'Z95.811' -- LVAD presence
    )
    AND cd.onset_date <= '2024-12-31'
),

medication_orders AS (
    -- Track ACE/ARB/ARNI prescriptions
    SELECT DISTINCT 
        mo.patient_id,
        mo.start_datetime,
        mo.end_datetime,
        m.medication_code,
        CASE 
            WHEN m.medication_code LIKE 'C09A%' THEN 'ACE'
            WHEN m.medication_code LIKE 'C09C%' THEN 'ARB'
            WHEN m.medication_code = 'C09DX04' THEN 'ARNI'
        END as med_type
    FROM phm_edw.medication_order mo
    JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
    WHERE m.medication_code LIKE 'C09A%' -- ACE inhibitors
       OR m.medication_code LIKE 'C09C%' -- ARBs
       OR m.medication_code = 'C09DX04'  -- Sacubitril/valsartan (ARNI)
    AND mo.prescription_status = 'ACTIVE'
    AND (mo.end_datetime IS NULL OR mo.end_datetime > '2024-12-31')
),

denominator_exceptions AS (
    -- Track documented reasons for not prescribing
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE (
        -- Medical contraindications
        c.condition_code IN (
            'T88.6',    -- Anaphylaxis
            'N17',      -- Acute kidney failure
            'I95.1'     -- Orthostatic hypotension
        )
        AND cd.diagnosis_status = 'ACTIVE'
    )
    -- Add patient refusal and other exceptions as needed
)

-- Final measure calculation
SELECT 
    'Overall' as measure_group,
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT ip.patient_id) - 
        COUNT(DISTINCT de.patient_id) as denominator,
    COUNT(DISTINCT CASE 
        WHEN mo.patient_id IS NOT NULL 
        AND de.patient_id IS NULL 
        AND dx.patient_id IS NULL 
        THEN ip.patient_id 
    END) as numerator,
    COUNT(DISTINCT dx.patient_id) as denominator_exceptions,
    ROUND(
        CAST(COUNT(DISTINCT CASE 
            WHEN mo.patient_id IS NOT NULL 
            AND de.patient_id IS NULL 
            AND dx.patient_id IS NULL 
            THEN ip.patient_id 
        END) AS DECIMAL) / 
        NULLIF((COUNT(DISTINCT ip.patient_id) - 
                COUNT(DISTINCT de.patient_id) - 
                COUNT(DISTINCT dx.patient_id)), 0) * 100,
        2
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_id = de.patient_id
LEFT JOIN medication_orders mo ON ip.patient_id = mo.patient_id
LEFT JOIN denominator_exceptions dx ON ip.patient_id = dx.patient_id

UNION ALL

-- Detailed results for validation
SELECT
    'Detail' as measure_group,
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT CASE 
        WHEN de.patient_id IS NULL THEN ip.patient_id 
    END) as denominator,
    COUNT(DISTINCT CASE 
        WHEN mo.patient_id IS NOT NULL 
        AND de.patient_id IS NULL 
        AND dx.patient_id IS NULL 
        THEN ip.patient_id 
    END) as numerator,
    COUNT(DISTINCT dx.patient_id) as denominator_exceptions,
    ROUND(
        CAST(COUNT(DISTINCT CASE 
            WHEN mo.patient_id IS NOT NULL 
            AND de.patient_id IS NULL 
            AND dx.patient_id IS NULL 
            THEN ip.patient_id 
        END) AS DECIMAL) / 
        NULLIF((COUNT(DISTINCT ip.patient_id) - 
                COUNT(DISTINCT de.patient_id) - 
                COUNT(DISTINCT dx.patient_id)), 0) * 100,
        2
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_id = de.patient_id
LEFT JOIN medication_orders mo ON ip.patient_id = mo.patient_id
LEFT JOIN denominator_exceptions dx ON ip.patient_id = dx.patient_id;
