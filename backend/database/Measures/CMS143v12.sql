-- CMS143v12: Primary Open-Angle Glaucoma (POAG): Optic Nerve Evaluation
-- Using the 3NF EDW schema for direct source data access

WITH measurement_period AS (
    SELECT 
        '2024-01-01'::DATE as start_date,
        '2024-12-31'::DATE as end_date
),

-- Initial Population: Patients 18+ with POAG diagnosis
poag_patients AS (
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
        -- POAG diagnosis codes
        c.condition_code IN ('H40.11X0', 'H40.11X1', 'H40.11X2', 'H40.11X3', 'H40.11X4') -- Replace with actual codes
        AND cd.diagnosis_status = 'ACTIVE'
        -- Age 18+ at start of measurement period
        AND EXTRACT(YEAR FROM AGE(mp.start_date, p.date_of_birth)) >= 18
        -- Encounter during measurement period
        AND e.encounter_datetime::DATE BETWEEN mp.start_date AND mp.end_date
        AND e.status = 'COMPLETED'
        AND cd.active_ind = 'Y'
        AND e.active_ind = 'Y'
),

-- Optic Nerve Evaluations
nerve_evaluations AS (
    SELECT DISTINCT
        o.patient_id,
        o.encounter_id,
        o.provider_id,
        o.observation_datetime,
        o.observation_code,
        o.value_text,
        o.comments
    FROM phm_edw.observation o
    CROSS JOIN measurement_period mp
    WHERE 
        o.observation_code IN (
            'OPTIC_NERVE_EVAL',           -- Replace with actual codes
            'CUP_TO_DISC_RATIO',
            'OPTIC_DISC_STRUCTURE'
        )
        AND o.observation_datetime::DATE BETWEEN mp.start_date AND mp.end_date
        AND o.active_ind = 'Y'
),

-- Medical Exceptions
medical_exceptions AS (
    SELECT DISTINCT
        o.patient_id,
        o.observation_datetime,
        o.observation_code,
        o.value_text as exception_reason
    FROM phm_edw.observation o
    CROSS JOIN measurement_period mp
    WHERE 
        o.observation_code IN (
            'OPTIC_NERVE_EVAL_EXCEPTION',     -- Replace with actual codes
            'CUP_DISC_RATIO_EXCEPTION',
            'OPTIC_DISC_EXAM_EXCEPTION'
        )
        AND o.observation_datetime::DATE BETWEEN mp.start_date AND mp.end_date
        AND o.active_ind = 'Y'
),

-- Measure Calculation
measure_calc AS (
    SELECT 
        'POAG Optic Nerve Evaluation' as measure_name,
        COUNT(DISTINCT pp.patient_id) as initial_population,
        COUNT(DISTINCT CASE WHEN ne.patient_id IS NOT NULL THEN pp.patient_id END) as numerator,
        COUNT(DISTINCT CASE WHEN me.patient_id IS NOT NULL THEN pp.patient_id END) as exceptions
    FROM poag_patients pp
    LEFT JOIN nerve_evaluations ne ON pp.patient_id = ne.patient_id
    LEFT JOIN medical_exceptions me ON pp.patient_id = me.patient_id
)

-- Final Results
SELECT 
    measure_name,
    initial_population as denominator,
    numerator,
    exceptions,
    ROUND(
        CAST(numerator AS DECIMAL) / 
        NULLIF((initial_population - exceptions), 0) * 100,
        2
    ) as performance_rate
FROM measure_calc;

-- Detailed Patient List for Validation
SELECT 
    p.patient_id,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    pp.encounter_datetime as diagnosis_date,
    ne.observation_datetime as evaluation_date,
    ne.value_text as evaluation_result,
    me.exception_reason,
    CASE 
        WHEN ne.patient_id IS NOT NULL THEN 'Met - Evaluation Completed'
        WHEN me.patient_id IS NOT NULL THEN 'Exception - Medical Reason'
        ELSE 'Not Met - No Evaluation'
    END as measure_status
FROM poag_patients pp
JOIN phm_edw.patient p ON pp.patient_id = p.patient_id
LEFT JOIN nerve_evaluations ne ON pp.patient_id = ne.patient_id
LEFT JOIN medical_exceptions me ON pp.patient_id = me.patient_id
ORDER BY 
    p.last_name, 
    p.first_name;

-- Index recommendations:
-- CREATE INDEX idx_condition_diagnosis_condition_id ON phm_edw.condition_diagnosis(condition_id);
-- CREATE INDEX idx_condition_code ON phm_edw.condition(condition_code);
-- CREATE INDEX idx_observation_code ON phm_edw.observation(observation_code);
-- CREATE INDEX idx_observation_datetime ON phm_edw.observation(observation_datetime);
-- CREATE INDEX idx_encounter_datetime ON phm_edw.encounter(encounter_datetime);