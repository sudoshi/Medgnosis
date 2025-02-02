-- CMS145v12: CAD Beta-Blocker Therapy
-- Using the 3NF EDW schema for direct source data access

WITH measurement_period AS (
    SELECT 
        '2024-01-01'::DATE as start_date,
        '2024-12-31'::DATE as end_date
),

-- Initial Population (shared logic for both populations)
-- Patients 18+ with CAD diagnosis or cardiac surgery
cad_patients AS (
    SELECT DISTINCT
        cd.patient_id,
        cd.encounter_id,
        cd.onset_date,
        e.encounter_datetime,
        e.provider_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    JOIN phm_edw.encounter e ON cd.encounter_id = e.encounter_id
    JOIN phm_edw.patient p ON cd.patient_id = p.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- CAD diagnosis codes
        (c.condition_code IN ('I25.1', 'I25.10', 'I25.11', 'I25.2') -- Replace with actual CAD codes
        OR EXISTS (
            -- Cardiac surgery before end of encounter
            SELECT 1 
            FROM phm_edw.procedure_performed pp
            JOIN phm_edw.procedure pr ON pp.procedure_id = pr.procedure_id
            WHERE pp.patient_id = cd.patient_id
            AND pr.procedure_code IN ('CABG', 'PCI') -- Replace with actual surgery codes
            AND pp.procedure_datetime <= e.encounter_datetime
        ))
        AND cd.diagnosis_status = 'ACTIVE'
        -- Age 18+ at start of period
        AND EXTRACT(YEAR FROM AGE(mp.start_date, p.date_of_birth)) >= 18
        -- Two qualifying encounters
        AND EXISTS (
            SELECT 1 FROM phm_edw.encounter e2
            WHERE e2.patient_id = cd.patient_id
            AND e2.encounter_type IN ('OUTPATIENT', 'OFFICE_VISIT')
            AND e2.encounter_datetime::DATE BETWEEN mp.start_date AND mp.end_date
            AND e2.status = 'COMPLETED'
            GROUP BY e2.patient_id
            HAVING COUNT(*) >= 2
        )
        AND cd.active_ind = 'Y'
        AND e.active_ind = 'Y'
),

-- Population 1: LVSD Patients
lvsd_patients AS (
    SELECT DISTINCT
        cp.patient_id,
        cp.encounter_id,
        o.observation_datetime
    FROM cad_patients cp
    JOIN phm_edw.observation o ON cp.patient_id = o.patient_id
    WHERE (
        (o.observation_code = 'LVEF_PERCENTAGE' 
         AND o.value_numeric <= 40)
        OR 
        (o.observation_code = 'LVSD_SEVERITY'
         AND o.value_text IN ('MODERATE', 'SEVERE'))
    )
    AND o.active_ind = 'Y'
),

-- Population 2: Recent MI Patients (within 3 years)
mi_patients AS (
    SELECT DISTINCT
        cp.patient_id,
        cp.encounter_id,
        cd.onset_date
    FROM cad_patients cp
    JOIN phm_edw.condition_diagnosis cd ON cp.patient_id = cd.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE c.condition_code IN ('I21.%') -- Replace with actual MI codes
    AND cd.onset_date >= (mp.start_date - INTERVAL '3 years')
    AND cd.onset_date <= mp.end_date
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
        o.encounter_id,
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

-- Population 1 Results (LVSD)
pop1_results AS (
    SELECT 
        COUNT(DISTINCT lp.patient_id) as denominator,
        COUNT(DISTINCT CASE WHEN bb.patient_id IS NOT NULL THEN lp.patient_id END) as numerator,
        COUNT(DISTINCT CASE WHEN te.patient_id IS NOT NULL THEN lp.patient_id END) as exceptions
    FROM lvsd_patients lp
    LEFT JOIN beta_blockers bb ON lp.patient_id = bb.patient_id
    LEFT JOIN therapy_exceptions te ON lp.patient_id = te.patient_id
),

-- Population 2 Results (MI)
pop2_results AS (
    SELECT 
        COUNT(DISTINCT mp.patient_id) as denominator,
        COUNT(DISTINCT CASE WHEN bb.patient_id IS NOT NULL THEN mp.patient_id END) as numerator,
        COUNT(DISTINCT CASE WHEN te.patient_id IS NOT NULL THEN mp.patient_id END) as exceptions
    FROM mi_patients mp
    LEFT JOIN beta_blockers bb ON mp.patient_id = bb.patient_id
    LEFT JOIN therapy_exceptions te ON mp.patient_id = te.patient_id
),

-- Combined Results
combined_results AS (
    SELECT 
        'CAD Beta-Blocker Therapy' as measure_name,
        (SELECT denominator FROM pop1_results) + 
        (SELECT denominator FROM pop2_results) as total_denominator,
        (SELECT numerator FROM pop1_results) + 
        (SELECT numerator FROM pop2_results) as total_numerator,
        (SELECT exceptions FROM pop1_results) + 
        (SELECT exceptions FROM pop2_results) as total_exceptions
)

-- Final Results
SELECT 
    measure_name,
    total_denominator as denominator,
    total_numerator as numerator,
    total_exceptions as exceptions,
    ROUND(
        CAST(total_numerator AS DECIMAL) / 
        NULLIF((total_denominator - total_exceptions), 0) * 100,
        2
    ) as performance_rate
FROM combined_results;

-- Detailed Patient List for Validation
SELECT 
    p.patient_id,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    CASE 
        WHEN lp.patient_id IS NOT NULL THEN 'LVSD'
        WHEN mp.patient_id IS NOT NULL THEN 'Recent MI'
        ELSE 'Neither'
    END as qualifying_condition,
    CASE 
        WHEN bb.patient_id IS NOT NULL THEN 'Met - ' || bb.status
        WHEN te.patient_id IS NOT NULL THEN 'Exception - ' || te.exception_type
        ELSE 'Not Met'
    END as measure_status,
    te.reason as exception_reason,
    bb.start_datetime as medication_date
FROM cad_patients cp
JOIN phm_edw.patient p ON cp.patient_id = p.patient_id
LEFT JOIN lvsd_patients lp ON cp.patient_id = lp.patient_id
LEFT JOIN mi_patients mp ON cp.patient_id = mp.patient_id
LEFT JOIN beta_blockers bb ON cp.patient_id = bb.patient_id
LEFT JOIN therapy_exceptions te ON cp.patient_id = te.patient_id
ORDER BY 
    p.last_name, 
    p.first_name;