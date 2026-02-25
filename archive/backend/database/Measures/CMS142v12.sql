-- CMS142v12: Diabetic Retinopathy Communication with Managing Physician
-- Using the 3NF EDW schema for direct source data access

WITH measurement_period AS (
    SELECT 
        '2024-01-01'::DATE as start_date,
        '2024-12-31'::DATE as end_date
),

-- Initial Population: Patients 18+ with diabetic retinopathy diagnosis
retinopathy_patients AS (
    SELECT DISTINCT
        cd.patient_id,
        cd.onset_date,
        cd.provider_id as diagnosing_provider_id,
        e.encounter_id,
        e.provider_id as encounter_provider_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    JOIN phm_edw.encounter e ON cd.encounter_id = e.encounter_id
    JOIN phm_edw.patient p ON cd.patient_id = p.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Diabetic retinopathy diagnosis codes
        c.condition_code IN ('E11.311', 'E11.319', 'E10.311', 'E10.319') -- Replace with actual codes
        AND cd.diagnosis_status = 'ACTIVE'
        -- Age 18+ at start of measurement period
        AND EXTRACT(YEAR FROM AGE(mp.start_date, p.date_of_birth)) >= 18
        -- Encounter during measurement period
        AND e.encounter_datetime::DATE BETWEEN mp.start_date AND mp.end_date
        AND e.status = 'COMPLETED'
        AND cd.active_ind = 'Y'
),

-- Denominator: Patients with dilated eye exam
eye_exams AS (
    SELECT DISTINCT
        pp.patient_id,
        pp.procedure_datetime,
        pp.encounter_id,
        pp.provider_id as examining_provider_id,
        -- Capture structured exam findings
        o.observation_id,
        o.value_text as severity_finding,
        o.comments as exam_comments
    FROM phm_edw.procedure_performed pp
    JOIN phm_edw.procedure p ON pp.procedure_id = p.procedure_id
    LEFT JOIN phm_edw.observation o ON pp.encounter_id = o.encounter_id
        AND o.observation_code IN ('RETINOPATHY_SEVERITY', 'MACULAR_EDEMA')
    CROSS JOIN measurement_period mp
    WHERE 
        -- Dilated eye exam codes
        p.procedure_code IN ('92227', '92228', '92229') -- Replace with actual codes
        AND pp.procedure_datetime::DATE BETWEEN mp.start_date AND mp.end_date
        AND pp.active_ind = 'Y'
),

-- Provider Communications
provider_communications AS (
    SELECT DISTINCT
        o.patient_id,
        o.encounter_id,
        o.observation_datetime,
        o.value_text as communication_content,
        o.provider_id as communicating_provider
    FROM phm_edw.observation o
    CROSS JOIN measurement_period mp
    WHERE 
        o.observation_code = 'RETINOPATHY_COMMUNICATION'  -- Replace with actual code
        AND o.observation_datetime::DATE BETWEEN mp.start_date AND mp.end_date
        AND o.active_ind = 'Y'
),

-- Exception Documentation
communication_exceptions AS (
    SELECT DISTINCT
        o.patient_id,
        o.observation_datetime,
        o.value_text as exception_reason,
        CASE 
            WHEN o.observation_code = 'MEDICAL_EXCEPTION' THEN 'MEDICAL'
            WHEN o.observation_code = 'PATIENT_EXCEPTION' THEN 'PATIENT'
        END as exception_type
    FROM phm_edw.observation o
    CROSS JOIN measurement_period mp
    WHERE 
        o.observation_code IN ('MEDICAL_EXCEPTION', 'PATIENT_EXCEPTION')
        AND o.observation_datetime::DATE BETWEEN mp.start_date AND mp.end_date
        AND o.active_ind = 'Y'
),

-- Measure calculation
measure_calc AS (
    SELECT 
        'Diabetic Retinopathy Communication' as measure_name,
        COUNT(DISTINCT rp.patient_id) as initial_population,
        COUNT(DISTINCT CASE WHEN ee.patient_id IS NOT NULL THEN rp.patient_id END) as denominator,
        COUNT(DISTINCT CASE WHEN pc.patient_id IS NOT NULL THEN rp.patient_id END) as numerator,
        COUNT(DISTINCT CASE WHEN ce.patient_id IS NOT NULL THEN rp.patient_id END) as exceptions
    FROM retinopathy_patients rp
    LEFT JOIN eye_exams ee ON rp.patient_id = ee.patient_id
    LEFT JOIN provider_communications pc ON ee.patient_id = pc.patient_id
        AND pc.observation_datetime > ee.procedure_datetime
    LEFT JOIN communication_exceptions ce ON rp.patient_id = ce.patient_id
)

-- Final Results
SELECT 
    measure_name,
    initial_population,
    denominator,
    numerator,
    exceptions,
    ROUND(
        CAST(numerator AS DECIMAL) / 
        NULLIF((denominator - exceptions), 0) * 100,
        2
    ) as performance_rate
FROM measure_calc;

-- Detailed Patient List for Validation
SELECT 
    p.patient_id,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    cd.onset_date as retinopathy_diagnosis_date,
    ee.procedure_datetime as eye_exam_date,
    ee.severity_finding,
    pc.observation_datetime as communication_date,
    pc.communication_content,
    ce.exception_reason,
    CASE 
        WHEN pc.patient_id IS NOT NULL THEN 'Met'
        WHEN ce.patient_id IS NOT NULL THEN 'Exception - ' || ce.exception_type
        WHEN ee.patient_id IS NOT NULL THEN 'Not Met - No Communication'
        ELSE 'Not Met - No Eye Exam'
    END as measure_status
FROM retinopathy_patients rp
JOIN phm_edw.patient p ON rp.patient_id = p.patient_id
JOIN phm_edw.condition_diagnosis cd ON rp.patient_id = cd.patient_id
LEFT JOIN eye_exams ee ON rp.patient_id = ee.patient_id
LEFT JOIN provider_communications pc ON ee.patient_id = pc.patient_id
    AND pc.observation_datetime > ee.procedure_datetime
LEFT JOIN communication_exceptions ce ON rp.patient_id = ce.patient_id
ORDER BY 
    p.last_name, 
    p.first_name;