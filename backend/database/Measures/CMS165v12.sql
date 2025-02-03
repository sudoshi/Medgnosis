WITH measurement_period AS (
    SELECT 
        DATE '2024-01-01' as start_date,
        DATE '2024-12-31' as end_date
),

-- Initial Population: Patients 18-85 with essential HTN diagnosis
initial_population AS (
    SELECT DISTINCT
        p.patient_id,
        p.date_of_birth,
        cd.condition_diagnosis_id,
        c.condition_code,
        cd.onset_date,
        e.encounter_id,
        e.encounter_datetime,
        -- Calculate age at end of measurement period
        DATE_PART('year', AGE(mp.end_date, p.date_of_birth)) as age_at_end
    FROM phm_edw.patient p
    JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
    JOIN phm_edw.condition_diagnosis cd ON p.patient_id = cd.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Age between 18-85 at end of measurement period
        DATE_PART('year', AGE(mp.end_date, p.date_of_birth)) BETWEEN 18 AND 85
        -- Essential hypertension diagnosis codes
        AND c.condition_code IN ('I10', 'I10.0', 'I10.1', 'I10.9')
        -- HTN diagnosis starts before or during first 6 months of measurement period
        AND (cd.onset_date < mp.start_date 
             OR cd.onset_date <= mp.start_date + INTERVAL '6 months')
        -- Active diagnosis
        AND cd.diagnosis_status = 'ACTIVE'
        -- Visit during measurement period
        AND e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
),

-- Denominator Exclusions
exclusions AS (
    SELECT DISTINCT i.patient_id
    FROM initial_population i
    -- Join to conditions and procedures for exclusions
    LEFT JOIN phm_edw.condition_diagnosis cd ON i.patient_id = cd.patient_id
    LEFT JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    LEFT JOIN phm_edw.procedure_performed pp ON i.patient_id = pp.patient_id
    LEFT JOIN phm_edw.procedure p ON pp.procedure_id = p.procedure_id
    WHERE 
        -- Pregnancy
        c.condition_code LIKE 'O%'  -- Any pregnancy diagnosis
        -- ESRD
        OR c.condition_code IN ('N18.6')  -- End stage renal disease
        OR p.procedure_code IN ('90935', '90937')  -- Dialysis procedures
        -- Ages ≥ 66 in nursing home
        OR (i.age_at_end >= 66 
            AND EXISTS (
                SELECT 1 
                FROM phm_edw.encounter e2 
                WHERE e2.patient_id = i.patient_id
                AND e2.encounter_type = 'NURSING_HOME'
            ))
        -- Ages 66-80 with frailty and advanced illness
        OR (i.age_at_end BETWEEN 66 AND 80
            AND EXISTS (
                -- Check for frailty diagnoses/procedures
                SELECT 1 
                FROM phm_edw.condition_diagnosis cd2
                JOIN phm_edw.condition c2 ON cd2.condition_id = c2.condition_id
                WHERE cd2.patient_id = i.patient_id
                AND c2.condition_code IN ('R54', 'L89%')  -- Frailty and pressure ulcer codes
            )
            AND EXISTS (
                -- Check for advanced illness encounters/medications
                SELECT 1 
                FROM phm_edw.encounter e3
                WHERE e3.patient_id = i.patient_id
                AND e3.encounter_type IN ('INPATIENT', 'OUTPATIENT')
                -- Add more advanced illness criteria as needed
            ))
        -- Ages ≥ 81 with frailty
        OR (i.age_at_end >= 81
            AND EXISTS (
                SELECT 1 
                FROM phm_edw.condition_diagnosis cd3
                JOIN phm_edw.condition c3 ON cd3.condition_id = c3.condition_id
                WHERE cd3.patient_id = i.patient_id
                AND c3.condition_code LIKE 'R54%'  -- Frailty codes
            ))
),

-- Get most recent BP readings during measurement period
bp_readings AS (
    SELECT 
        o.patient_id,
        o.observation_datetime,
        o.observation_code,
        o.value_numeric,
        ROW_NUMBER() OVER (
            PARTITION BY o.patient_id, 
            CASE WHEN o.observation_code IN ('8480-6', '8459-0') THEN 'SYSTOLIC'
                 WHEN o.observation_code IN ('8462-4', '8453-3') THEN 'DIASTOLIC'
            END
            ORDER BY o.observation_datetime DESC
        ) as reading_rank
    FROM initial_population i
    JOIN phm_edw.observation o ON i.patient_id = o.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- BP reading codes (LOINC)
        o.observation_code IN (
            '8480-6', '8459-0',  -- Systolic BP
            '8462-4', '8453-3'   -- Diastolic BP
        )
        -- During measurement period
        AND o.observation_datetime BETWEEN mp.start_date AND mp.end_date
),

-- Final measure calculation
measure_calc AS (
    SELECT 
        i.patient_id,
        i.age_at_end,
        CASE WHEN ex.patient_id IS NULL THEN 1 ELSE 0 END as denominator,
        CASE WHEN ex.patient_id IS NULL 
             AND MAX(CASE WHEN bp.observation_code IN ('8480-6', '8459-0') 
                         AND bp.reading_rank = 1 
                         THEN bp.value_numeric END) < 140
             AND MAX(CASE WHEN bp.observation_code IN ('8462-4', '8453-3') 
                         AND bp.reading_rank = 1 
                         THEN bp.value_numeric END) < 90
             THEN 1 ELSE 0 
        END as numerator
    FROM initial_population i
    LEFT JOIN exclusions ex ON i.patient_id = ex.patient_id
    LEFT JOIN bp_readings bp ON i.patient_id = bp.patient_id
    GROUP BY i.patient_id, i.age_at_end, ex.patient_id
)

-- Output results
SELECT 
    'Overall' as population,
    COUNT(*) as initial_population,
    SUM(denominator) as denominator,
    SUM(numerator) as numerator,
    ROUND(
        CAST(SUM(numerator) AS DECIMAL) / 
        NULLIF(SUM(denominator), 0) * 100, 
        1
    ) as performance_rate
FROM measure_calc;
