-- CMS22v12: BP Screening and Follow-Up Documentation
WITH measurement_period AS (
    SELECT 
        DATE '2024-01-01' as start_date,
        DATE '2024-12-31' as end_date
),

-- Initial Population: Patients 18+ with encounter
initial_population AS (
    SELECT DISTINCT
        e.encounter_id,
        e.patient_id,
        e.encounter_datetime,
        p.date_of_birth,
        -- Calculate age at start of measurement period
        DATE_PART('year', AGE(mp.start_date, p.date_of_birth)) as age_at_start
    FROM phm_edw.encounter e
    JOIN phm_edw.patient p ON e.patient_id = p.patient_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Age 18+ at start of measurement period
        DATE_PART('year', AGE(mp.start_date, p.date_of_birth)) >= 18
        -- Encounter during measurement period
        AND e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
),

-- Denominator Exclusions: Prior HTN diagnosis
prior_htn AS (
    SELECT DISTINCT i.encounter_id
    FROM initial_population i
    JOIN phm_edw.condition_diagnosis cd ON i.patient_id = cd.patient_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE 
        -- HTN diagnosis before encounter
        cd.onset_date < i.encounter_datetime
        AND cd.diagnosis_status = 'ACTIVE'
        AND c.condition_code LIKE 'I10%'  -- HTN ICD-10 codes
),

-- Get BP readings for encounters
bp_readings AS (
    SELECT 
        o.encounter_id,
        o.observation_datetime,
        CASE 
            WHEN o.observation_code = '8480-6' THEN value_numeric 
        END as systolic_bp,
        CASE 
            WHEN o.observation_code = '8462-4' THEN value_numeric
        END as diastolic_bp,
        -- Look back 6 months for prior elevated readings
        EXISTS (
            SELECT 1 
            FROM phm_edw.observation o2
            WHERE o2.patient_id = o.patient_id
            AND o2.observation_datetime BETWEEN 
                o.observation_datetime - INTERVAL '6 months' 
                AND o.observation_datetime
            AND ((o2.observation_code = '8480-6' AND o2.value_numeric >= 120)  -- Elevated systolic
                OR (o2.observation_code = '8462-4' AND o2.value_numeric >= 80)) -- Elevated diastolic
        ) as has_prior_elevated_bp
    FROM initial_population i
    JOIN phm_edw.observation o ON i.encounter_id = o.encounter_id
    WHERE o.observation_code IN ('8480-6', '8462-4')  -- Systolic and Diastolic BP LOINC codes
),

-- Consolidate BP readings per encounter
bp_categories AS (
    SELECT
        encounter_id,
        MAX(systolic_bp) as systolic_bp,
        MAX(diastolic_bp) as diastolic_bp,
        BOOL_OR(has_prior_elevated_bp) as has_prior_elevated_bp,
        CASE
            WHEN MAX(systolic_bp) < 120 AND MAX(diastolic_bp) < 80 
            THEN 'NORMAL'
            WHEN MAX(systolic_bp) BETWEEN 120 AND 129 AND MAX(diastolic_bp) <= 80 
            THEN 'ELEVATED'
            WHEN (MAX(systolic_bp) BETWEEN 130 AND 139 OR MAX(diastolic_bp) BETWEEN 80 AND 89)
                AND NOT BOOL_OR(has_prior_elevated_bp)
            THEN 'HYPERTENSIVE_1_FIRST'
            WHEN (MAX(systolic_bp) BETWEEN 130 AND 139 OR MAX(diastolic_bp) BETWEEN 80 AND 89)
                AND BOOL_OR(has_prior_elevated_bp)
            THEN 'HYPERTENSIVE_1_SECOND'
            WHEN (MAX(systolic_bp) >= 140 OR MAX(diastolic_bp) >= 90)
                AND NOT BOOL_OR(has_prior_elevated_bp)
            THEN 'HYPERTENSIVE_2_FIRST'
            WHEN (MAX(systolic_bp) >= 140 OR MAX(diastolic_bp) >= 90)
                AND BOOL_OR(has_prior_elevated_bp)
            THEN 'HYPERTENSIVE_2_SECOND'
        END as bp_category
    FROM bp_readings
    GROUP BY encounter_id
),

-- Get follow-up plans
followup_plans AS (
    SELECT DISTINCT
        e.encounter_id,
        BOOL_OR(CASE 
            WHEN p.procedure_code IN ('99401', '99402')  -- Preventive counseling codes
            THEN TRUE ELSE FALSE 
        END) as has_counseling,
        BOOL_OR(CASE 
            WHEN p.procedure_code IN ('99241', '99242', '99243')  -- Referral codes
            THEN TRUE ELSE FALSE 
        END) as has_referral,
        EXISTS (
            SELECT 1 
            FROM phm_edw.encounter e2
            WHERE e2.patient_id = e.patient_id
            AND e2.encounter_datetime BETWEEN 
                e.encounter_datetime + INTERVAL '2 weeks'
                AND e.encounter_datetime + INTERVAL '6 months'
        ) as has_followup_scheduled,
        EXISTS (
            SELECT 1 
            FROM phm_edw.procedure_performed pp2
            JOIN phm_edw.procedure p2 ON pp2.procedure_id = p2.procedure_id
            WHERE pp2.encounter_id = e.encounter_id
            AND p2.procedure_code IN ('93000', '80053')  -- ECG and Basic Metabolic Panel
        ) as has_lab_or_ecg
    FROM initial_population i
    JOIN phm_edw.encounter e ON i.encounter_id = e.encounter_id
    LEFT JOIN phm_edw.procedure_performed pp ON e.encounter_id = pp.encounter_id
    LEFT JOIN phm_edw.procedure p ON pp.procedure_id = p.procedure_id
),

-- Denominator Exceptions
exceptions AS (
    SELECT DISTINCT e.encounter_id
    FROM initial_population i
    JOIN phm_edw.encounter e ON i.encounter_id = e.encounter_id
    WHERE e.encounter_reason IN ('PATIENT_DECLINED', 'MEDICAL_REASON')
),

-- Final measure calculation
measure_calc AS (
    SELECT 
        i.encounter_id,
        i.patient_id,
        CASE WHEN pe.encounter_id IS NOT NULL THEN 0 ELSE 1 END as denominator,
        CASE WHEN ex.encounter_id IS NOT NULL THEN 0
             WHEN b.bp_category = 'NORMAL' THEN 1
             WHEN b.bp_category = 'ELEVATED' 
                  AND f.has_counseling 
                  AND (f.has_referral OR f.has_followup_scheduled)
             THEN 1
             WHEN b.bp_category IN ('HYPERTENSIVE_1_FIRST', 'HYPERTENSIVE_2_FIRST')
                  AND f.has_counseling 
                  AND (f.has_referral OR f.has_followup_scheduled)
             THEN 1
             WHEN b.bp_category = 'HYPERTENSIVE_1_SECOND'
                  AND f.has_counseling 
                  AND f.has_lab_or_ecg
                  AND (f.has_referral OR f.has_followup_scheduled)
             THEN 1
             WHEN b.bp_category = 'HYPERTENSIVE_2_SECOND'
                  AND f.has_counseling 
                  AND f.has_lab_or_ecg
                  AND f.has_referral
             THEN 1
             ELSE 0
        END as numerator,
        CASE WHEN ex.encounter_id IS NOT NULL THEN 1 ELSE 0 END as denominator_exception
    FROM initial_population i
    LEFT JOIN prior_htn pe ON i.encounter_id = pe.encounter_id
    LEFT JOIN bp_categories b ON i.encounter_id = b.encounter_id
    LEFT JOIN followup_plans f ON i.encounter_id = f.encounter_id
    LEFT JOIN exceptions ex ON i.encounter_id = ex.encounter_id
)

-- Output results
SELECT 
    'Overall' as population,
    COUNT(*) as initial_population,
    SUM(denominator) as denominator_count,
    SUM(CASE WHEN denominator = 1 AND denominator_exception = 0 THEN numerator ELSE 0 END) as numerator_count,
    ROUND(
        CAST(SUM(CASE WHEN denominator = 1 AND denominator_exception = 0 THEN numerator ELSE 0 END) AS DECIMAL) / 
        NULLIF(SUM(CASE WHEN denominator = 1 AND denominator_exception = 0 THEN 1 ELSE 0 END), 0) * 100,
        1
    ) as performance_rate
FROM measure_calc;