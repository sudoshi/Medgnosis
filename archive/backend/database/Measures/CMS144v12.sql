-- CMS144v12: Heart Failure Beta-Blocker Therapy for LVSD
-- Using the 3NF EDW schema for direct source data access

WITH measurement_period AS (
    SELECT 
        '2024-01-01'::DATE as start_date,
        '2024-12-31'::DATE as end_date
),

-- Initial Population: Patients 18+ with HF diagnosis and qualifying encounters
heart_failure_patients AS (
    SELECT DISTINCT
        cd.patient_id,
        cd.encounter_id,
        cd.provider_id,
        cd.onset_date,
        e.encounter_datetime
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    JOIN phm_edw.encounter e ON cd.encounter_id = e.encounter_id
    JOIN phm_edw.patient p ON cd.patient_id = p.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Heart Failure diagnosis codes
        c.condition_code IN ('I50.1', 'I50.20', 'I50.21', 'I50.22', 'I50.23') -- Replace with actual codes
        AND cd.diagnosis_status = 'ACTIVE'
        -- Age 18+ at start of measurement period
        AND EXTRACT(YEAR FROM AGE(mp.start_date, p.date_of_birth)) >= 18
        -- Two qualifying encounters
        AND EXISTS (
            SELECT 1 FROM phm_edw.encounter e2
            WHERE e2.patient_id = cd.patient_id
            AND e2.encounter_type IN ('OUTPATIENT', 'OFFICE_VISIT')
            AND e2.encounter_datetime::DATE BETWEEN mp.start_date AND mp.end_date
            GROUP BY e2.patient_id
            HAVING COUNT(*) >= 2
        )
        AND cd.active_ind = 'Y'
        AND e.active_ind = 'Y'
),

-- LVSD Assessment (LVEF <= 40% or documented moderate/severe LVSD)
lvsd_assessments AS (
    SELECT DISTINCT
        o.patient_id,
        o.encounter_id,
        o.observation_datetime,
        CASE 
            WHEN o.observation_code = 'LVEF_PERCENTAGE' AND o.value_numeric <= 40 THEN TRUE
            WHEN o.observation_code = 'LVSD_SEVERITY' 
                AND o.value_text IN ('MODERATE', 'SEVERE') THEN TRUE
            ELSE FALSE
        END as has_qualifying_lvsd
    FROM phm_edw.observation o
    CROSS JOIN measurement_period mp
    WHERE o.observation_code IN ('LVEF_PERCENTAGE', 'LVSD_SEVERITY')
    AND o.observation_datetime::DATE <= mp.end_date
    AND o.active_ind = 'Y'
),

-- Denominator Exclusions: Heart transplant or LVAD
transplant_lvad AS (
    SELECT DISTINCT
        cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE c.condition_code IN (
        'Z94.1',     -- Heart transplant status
        'Z95.811'    -- LVAD status
    )
    AND cd.diagnosis_status = 'ACTIVE'
    AND cd.active_ind = 'Y'
),

-- Beta Blocker Medications (both prescribed and active)
beta_blockers AS (
    SELECT DISTINCT
        mo.patient_id,
        mo.encounter_id,
        mo.start_datetime,
        'PRESCRIBED' as status
    FROM phm_edw.medication_order mo
    JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
    CROSS JOIN measurement_period mp
    WHERE m.medication_code IN (
        'CARVEDILOL', 'METOPROLOL', 'BISOPROLOL'  -- Replace with actual codes
    )
    AND mo.start_datetime::DATE BETWEEN mp.start_date AND mp.end_date
    AND mo.active_ind = 'Y'
    
    UNION
    
    SELECT DISTINCT
        o.patient_id,
        o.encounter_id,
        o.observation_datetime,
        'ACTIVE' as status
    FROM phm_edw.observation o
    CROSS JOIN measurement_period mp
    WHERE o.observation_code = 'ACTIVE_BETA_BLOCKER'
    AND o.observation_datetime::DATE BETWEEN mp.start_date AND mp.end_date
    AND o.active_ind = 'Y'
),

-- Medical and Patient Exceptions
therapy_exceptions AS (
    SELECT DISTINCT
        o.patient_id,
        o.observation_datetime,
        CASE 
            WHEN o.observation_code = 'MEDICAL_EXCEPTION' THEN 'MEDICAL'
            ELSE 'PATIENT'
        END as exception_type,
        o.value_text as reason
    FROM phm_edw.observation o
    CROSS JOIN measurement_period mp
    WHERE o.observation_code IN (
        'MEDICAL_EXCEPTION_BETA_BLOCKER',
        'PATIENT_EXCEPTION_BETA_BLOCKER'
    )
    AND o.observation_datetime::DATE BETWEEN mp.start_date AND mp.end_date
    AND o.active_ind = 'Y'
),

-- Measure Calculation
measure_calc AS (
    SELECT 
        'Heart Failure Beta-Blocker Therapy' as measure_name,
        COUNT(DISTINCT hf.patient_id) as initial_population,
        COUNT(DISTINCT CASE 
            WHEN la.has_qualifying_lvsd THEN hf.patient_id 
        END) as denominator,
        COUNT(DISTINCT CASE 
            WHEN tl.patient_id IS NOT NULL THEN hf.patient_id 
        END) as denominator_exclusions,
        COUNT(DISTINCT CASE 
            WHEN te.patient_id IS NOT NULL THEN hf.patient_id 
        END) as denominator_exceptions,
        COUNT(DISTINCT CASE 
            WHEN bb.patient_id IS NOT NULL THEN hf.patient_id 
        END) as numerator
    FROM heart_failure_patients hf
    LEFT JOIN lvsd_assessments la ON hf.patient_id = la.patient_id
    LEFT JOIN transplant_lvad tl ON hf.patient_id = tl.patient_id
    LEFT JOIN beta_blockers bb ON hf.patient_id = bb.patient_id
    LEFT JOIN therapy_exceptions te ON hf.patient_id = te.patient_id
)

-- Final Results
SELECT 
    measure_name,
    initial_population,
    denominator,
    denominator_exclusions,
    denominator_exceptions,
    numerator,
    ROUND(
        CAST(numerator AS DECIMAL) / 
        NULLIF((denominator - denominator_exclusions - denominator_exceptions), 0) * 100,
        2
    ) as performance_rate
FROM measure_calc;

-- Detailed Patient List for Validation
SELECT 
    p.patient_id,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    hf.encounter_datetime as diagnosis_date,
    la.observation_datetime as lvsd_assessment_date,
    CASE 
        WHEN tl.patient_id IS NOT NULL THEN 'Excluded - Transplant/LVAD'
        WHEN te.patient_id IS NOT NULL THEN 'Exception - ' || te.exception_type
        WHEN bb.patient_id IS NOT NULL THEN 'Met - ' || bb.status
        ELSE 'Not Met - No Beta Blocker'
    END as measure_status,
    te.reason as exception_reason
FROM heart_failure_patients hf
JOIN phm_edw.patient p ON hf.patient_id = p.patient_id
LEFT JOIN lvsd_assessments la ON hf.patient_id = la.patient_id
LEFT JOIN transplant_lvad tl ON hf.patient_id = tl.patient_id
LEFT JOIN beta_blockers bb ON hf.patient_id = bb.patient_id
LEFT JOIN therapy_exceptions te ON hf.patient_id = te.patient_id
ORDER BY 
    p.last_name, 
    p.first_name;