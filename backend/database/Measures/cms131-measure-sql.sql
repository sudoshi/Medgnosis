-- CMS131v12 Diabetes Eye Exam Measure
-- Using Inmon-style EDW schema (phm_edw)

WITH patient_age AS (
    -- Calculate patient age at end of measurement period
    SELECT 
        p.patient_id,
        DATE_PART('year', AGE('2024-12-31', p.date_of_birth)) as age_at_period_end
    FROM phm_edw.patient p
),

diabetes_diagnosis AS (
    -- Identify patients with diabetes diagnosis
    SELECT DISTINCT 
        cd.patient_id,
        MIN(cd.onset_date) as earliest_diabetes_date
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE c.condition_code LIKE 'E11%' -- Type 2 Diabetes ICD-10 codes
        OR c.condition_code LIKE 'E10%' -- Type 1 Diabetes ICD-10 codes
    GROUP BY cd.patient_id
),

retinopathy_diagnosis AS (
    -- Identify patients with retinopathy diagnosis
    SELECT DISTINCT 
        cd.patient_id,
        CASE 
            WHEN COUNT(*) > 0 THEN true 
            ELSE false 
        END as has_retinopathy
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE c.condition_code LIKE 'E11.3%' -- Diabetic retinopathy codes
        OR c.condition_code LIKE 'E10.3%'
    GROUP BY cd.patient_id
),

initial_population AS (
    -- Patients 18-75 with diabetes and eligible encounter
    SELECT DISTINCT 
        p.patient_id,
        pa.age_at_period_end,
        dd.earliest_diabetes_date,
        COALESCE(rd.has_retinopathy, false) as has_retinopathy
    FROM phm_edw.patient p
    JOIN patient_age pa ON p.patient_id = pa.patient_id
    JOIN diabetes_diagnosis dd ON p.patient_id = dd.patient_id
    LEFT JOIN retinopathy_diagnosis rd ON p.patient_id = rd.patient_id
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    WHERE pa.age_at_period_end BETWEEN 18 AND 75
    AND e.encounter_datetime BETWEEN '2024-01-01' AND '2024-12-31'
),

denominator_exclusions AS (
    -- Combine all exclusion criteria
    SELECT DISTINCT p.patient_id
    FROM initial_population p
    LEFT JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    WHERE 
        -- Hospice care
        EXISTS (
            SELECT 1 
            FROM phm_edw.encounter e2
            WHERE e2.patient_id = p.patient_id
            AND e2.encounter_type = 'HOSPICE'
            AND e2.encounter_datetime BETWEEN '2024-01-01' AND '2024-12-31'
        )
        -- Age 66+ in nursing home
        OR (
            p.age_at_period_end >= 66
            AND EXISTS (
                SELECT 1
                FROM phm_edw.encounter e3
                WHERE e3.patient_id = p.patient_id
                AND e3.encounter_type = 'NURSING_HOME'
                AND e3.encounter_datetime <= '2024-12-31'
            )
        )
        -- Age 66+ with advanced illness and frailty
        OR (
            p.age_at_period_end >= 66
            AND EXISTS (
                SELECT 1
                FROM phm_edw.condition_diagnosis cd
                JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
                WHERE cd.patient_id = p.patient_id
                AND cd.diagnosis_type = 'CHRONIC'
                AND cd.diagnosis_status = 'ACTIVE'
                -- Add specific advanced illness codes here
            )
            AND EXISTS (
                SELECT 1
                FROM phm_edw.encounter e4
                WHERE e4.patient_id = p.patient_id
                AND e4.encounter_type IN ('OUTPATIENT', 'INPATIENT')
                AND e4.encounter_datetime BETWEEN '2023-01-01' AND '2024-12-31'
            )
        )
        -- Palliative care
        OR EXISTS (
            SELECT 1
            FROM phm_edw.encounter e5
            WHERE e5.patient_id = p.patient_id
            AND e5.encounter_type = 'PALLIATIVE_CARE'
            AND e5.encounter_datetime BETWEEN '2024-01-01' AND '2024-12-31'
        )
),

eye_exams AS (
    -- Identify qualifying eye exams
    SELECT DISTINCT 
        pp.patient_id,
        MAX(pp.procedure_datetime) as last_eye_exam_date
    FROM phm_edw.procedure_performed pp
    JOIN phm_edw.procedure p ON pp.procedure_id = p.procedure_id
    WHERE p.procedure_code IN (
        '92002', '92004', '92012', '92014', -- Ophthalmological services
        '92227', '92228', '92229',          -- Remote imaging
        '92230', '92235', '92240',          -- Retinal imaging
        '92250', '92260'                    -- Fundus photography
    )
    AND pp.procedure_datetime BETWEEN '2023-01-01' AND '2024-12-31'
    GROUP BY pp.patient_id
),

numerator_compliance AS (
    -- Identify patients meeting numerator criteria
    SELECT DISTINCT p.patient_id
    FROM initial_population p
    JOIN eye_exams e ON p.patient_id = e.patient_id
    WHERE 
        -- Patients with retinopathy must have current year exam
        (p.has_retinopathy = true 
         AND e.last_eye_exam_date BETWEEN '2024-01-01' AND '2024-12-31')
        -- Patients without retinopathy can have previous year exam
        OR (p.has_retinopathy = false 
            AND e.last_eye_exam_date BETWEEN '2023-01-01' AND '2024-12-31')
)

-- Final measure calculation
SELECT 
    'Overall' as population_group,
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT ip.patient_id) - COUNT(DISTINCT de.patient_id) as denominator,
    COUNT(DISTINCT nc.patient_id) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT nc.patient_id) AS DECIMAL) / 
        NULLIF((COUNT(DISTINCT ip.patient_id) - COUNT(DISTINCT de.patient_id)), 0) * 100,
        2
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_id = de.patient_id
LEFT JOIN numerator_compliance nc ON ip.patient_id = nc.patient_id
WHERE de.patient_id IS NULL;