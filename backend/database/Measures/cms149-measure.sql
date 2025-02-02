-- CMS149v12: Dementia Cognitive Assessment
-- Using PHM EDW Schema

WITH measurement_period AS (
    SELECT 
        DATE '2024-01-01' as start_date,
        DATE '2024-12-31' as end_date
),

-- Initial Population: Patients with dementia diagnosis and 2+ encounters
patient_encounters AS (
    SELECT 
        p.patient_id,
        COUNT(DISTINCT e.encounter_id) as encounter_count
    FROM phm_edw.patient p
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    JOIN measurement_period mp ON 1=1
    WHERE e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
    GROUP BY p.patient_id
    HAVING COUNT(DISTINCT e.encounter_id) >= 2
),

dementia_diagnosis AS (
    SELECT DISTINCT 
        cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    JOIN phm_edw.encounter e ON cd.encounter_id = e.encounter_id
    JOIN measurement_period mp ON 1=1
    WHERE 
        -- Dementia diagnosis codes (ICD-10)
        c.condition_code IN (
            'F01', 'F02', 'F03', -- Dementia codes
            'G30', -- Alzheimer's disease
            'G31.83' -- Lewy body dementia
        )
        AND cd.diagnosis_status = 'ACTIVE'
        AND e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
),

-- Initial Population (patients with dementia and 2+ encounters)
initial_population AS (
    SELECT pe.patient_id
    FROM patient_encounters pe
    JOIN dementia_diagnosis dd ON pe.patient_id = dd.patient_id
),

-- Numerator: Cognitive assessment performed
cognitive_assessment AS (
    SELECT DISTINCT 
        o.patient_id,
        o.observation_datetime
    FROM phm_edw.observation o
    JOIN measurement_period mp ON 1=1
    WHERE 
        -- Cognitive assessment LOINC codes
        o.observation_code IN (
            '72106-8', -- MMSE Total score
            '72137-3', -- MOCA Total score
            '85392-3'  -- Clock Drawing Test score
        )
        AND o.observation_datetime BETWEEN 
            mp.start_date - INTERVAL '12 months' 
            AND mp.end_date
),

-- Denominator Exceptions: Patient reasons for not performing assessment
denominator_exceptions AS (
    SELECT DISTINCT 
        cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE 
        -- Conditions that prevent cognitive assessment
        c.condition_code IN (
            'select codes for patient reasons',
            'for not performing assessment'
        )
),

-- Final Results
final_results AS (
    SELECT
        COUNT(DISTINCT i.patient_id) as initial_population,
        COUNT(DISTINCT i.patient_id) as denominator,
        COUNT(DISTINCT CASE 
            WHEN de.patient_id IS NULL THEN i.patient_id 
        END) as denominator_after_exceptions,
        COUNT(DISTINCT CASE 
            WHEN de.patient_id IS NULL AND ca.patient_id IS NOT NULL 
            THEN i.patient_id 
        END) as numerator,
        ROUND(
            CAST(COUNT(DISTINCT CASE 
                WHEN de.patient_id IS NULL AND ca.patient_id IS NOT NULL 
                THEN i.patient_id 
            END) AS DECIMAL) /
            NULLIF(COUNT(DISTINCT CASE 
                WHEN de.patient_id IS NULL THEN i.patient_id 
            END), 0)
            * 100, 2
        ) as performance_rate
    FROM initial_population i
    LEFT JOIN denominator_exceptions de ON i.patient_id = de.patient_id
    LEFT JOIN cognitive_assessment ca ON i.patient_id = ca.patient_id
),

-- Patient-Level Detail
patient_detail AS (
    SELECT 
        p.patient_id,
        p.first_name,
        p.last_name,
        CASE 
            WHEN de.patient_id IS NOT NULL THEN 'Exception'
            WHEN ca.patient_id IS NOT NULL THEN 'Met'
            ELSE 'Not Met'
        END as measure_status,
        ca.observation_datetime as assessment_date
    FROM initial_population i
    JOIN phm_edw.patient p ON i.patient_id = p.patient_id
    LEFT JOIN denominator_exceptions de ON i.patient_id = de.patient_id
    LEFT JOIN cognitive_assessment ca ON i.patient_id = ca.patient_id
    ORDER BY p.last_name, p.first_name
)

-- Return both summary and detail
SELECT 'Summary' as report_type, * FROM final_results
UNION ALL
SELECT 'Detail' as report_type, * FROM patient_detail;

-- Note: This SQL needs actual codes for:
-- 1. Dementia ICD-10 codes (currently using examples)
-- 2. Cognitive assessment LOINC codes (currently using examples)
-- 3. Patient reason codes for denominator exceptions