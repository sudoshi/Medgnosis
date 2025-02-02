-- CMS154v12: Appropriate Treatment for URI
-- Using PHM EDW Schema

WITH measurement_period AS (
    SELECT 
        DATE '2024-01-01' as start_date,
        DATE '2024-12-28' as end_date  -- Note: Dec 28 per measure spec
),

-- Initial Population: Patients 3+ months old with URI diagnosis
initial_population AS (
    SELECT DISTINCT
        e.encounter_id,
        e.patient_id,
        e.encounter_datetime,
        p.date_of_birth,
        DATE_PART('year', AGE(mp.start_date, p.date_of_birth)) +
            CASE 
                WHEN DATE_PART('month', p.date_of_birth) > DATE_PART('month', mp.start_date) THEN -1
                WHEN DATE_PART('month', p.date_of_birth) = DATE_PART('month', mp.start_date) AND
                     DATE_PART('day', p.date_of_birth) > DATE_PART('day', mp.start_date) THEN -1
                ELSE 0
            END as age_in_years,
        EXTRACT(EPOCH FROM AGE(mp.start_date, p.date_of_birth))/2592000 as age_in_months -- 2592000 seconds in a month
    FROM phm_edw.encounter e
    JOIN phm_edw.patient p ON e.patient_id = p.patient_id
    JOIN phm_edw.condition_diagnosis cd ON e.encounter_id = cd.encounter_id
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    CROSS JOIN measurement_period mp
    WHERE 
        -- Encounter within measurement period
        e.encounter_datetime BETWEEN mp.start_date AND mp.end_date
        -- URI diagnosis codes (ICD-10)
        AND c.condition_code IN ('J00', 'J06.9')  -- Common URI codes
        -- Encounter types
        AND e.encounter_type IN ('Outpatient', 'Telephone', 'Online', 'Observation', 'ED')
        -- Patient at least 3 months old
        AND EXTRACT(EPOCH FROM AGE(e.encounter_datetime, p.date_of_birth))/2592000 >= 3
),

-- Denominator Exclusions
denominator_exclusions AS (
    SELECT DISTINCT i.encounter_id
    FROM initial_population i
    LEFT JOIN phm_edw.condition_diagnosis cd 
        ON i.patient_id = cd.patient_id
    LEFT JOIN phm_edw.condition c 
        ON cd.condition_id = c.condition_id
    WHERE 
        -- Hospice care
        EXISTS (
            SELECT 1 
            FROM phm_edw.condition_diagnosis cd2
            JOIN phm_edw.condition c2 ON cd2.condition_id = c2.condition_id
            WHERE cd2.patient_id = i.patient_id
            AND c2.condition_code = 'Z51.5'  -- Hospice care
        )
        -- Comorbid conditions in prior 12 months
        OR EXISTS (
            SELECT 1
            FROM phm_edw.condition_diagnosis cd3
            JOIN phm_edw.condition c3 ON cd3.condition_id = c3.condition_id
            WHERE cd3.patient_id = i.patient_id
            AND c3.condition_code IN (
                'select codes for comorbid conditions'
            )
            AND cd3.onset_date BETWEEN 
                i.encounter_datetime - INTERVAL '12 months'
                AND i.encounter_datetime
        )
        -- Prior antibiotic use within 30 days
        OR EXISTS (
            SELECT 1
            FROM phm_edw.medication_order mo
            JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
            WHERE mo.patient_id = i.patient_id
            AND m.medication_code IN (
                'select antibiotic medication codes'
            )
            AND mo.start_datetime BETWEEN 
                i.encounter_datetime - INTERVAL '30 days'
                AND i.encounter_datetime
        )
        -- Competing diagnosis within 3 days
        OR EXISTS (
            SELECT 1
            FROM phm_edw.condition_diagnosis cd4
            JOIN phm_edw.condition c4 ON cd4.condition_id = c4.condition_id
            WHERE cd4.patient_id = i.patient_id
            AND c4.condition_code IN (
                'select competing diagnosis codes'
            )
            AND cd4.onset_date BETWEEN 
                i.encounter_datetime
                AND i.encounter_datetime + INTERVAL '3 days'
        )
),

-- Numerator: No antibiotic prescribed
numerator AS (
    SELECT DISTINCT i.encounter_id
    FROM initial_population i
    WHERE NOT EXISTS (
        SELECT 1
        FROM phm_edw.medication_order mo
        JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
        WHERE mo.patient_id = i.patient_id
        AND m.medication_code IN (
            'select antibiotic medication codes'
        )
        AND mo.start_datetime BETWEEN 
            i.encounter_datetime
            AND i.encounter_datetime + INTERVAL '3 days'
    )
),

-- Final Results including stratification
final_results AS (
    SELECT
        CASE 
            WHEN i.age_in_years < 18 THEN '3mo-17'
            WHEN i.age_in_years BETWEEN 18 AND 64 THEN '18-64'
            ELSE '65+'
        END as age_strata,
        COUNT(DISTINCT i.encounter_id) as initial_population,
        COUNT(DISTINCT i.encounter_id) as denominator,
        COUNT(DISTINCT CASE 
            WHEN de.encounter_id IS NULL THEN i.encounter_id 
        END) as denominator_after_exclusions,
        COUNT(DISTINCT CASE 
            WHEN de.encounter_id IS NULL AND n.encounter_id IS NOT NULL 
            THEN i.encounter_id 
        END) as numerator,
        ROUND(
            CAST(COUNT(DISTINCT CASE 
                WHEN de.encounter_id IS NULL AND n.encounter_id IS NOT NULL 
                THEN i.encounter_id 
            END) AS DECIMAL) /
            NULLIF(COUNT(DISTINCT CASE 
                WHEN de.encounter_id IS NULL THEN i.encounter_id 
            END), 0)
            * 100, 2
        ) as performance_rate
    FROM initial_population i
    LEFT JOIN denominator_exclusions de ON i.encounter_id = de.encounter_id
    LEFT JOIN numerator n ON i.encounter_id = n.encounter_id
    GROUP BY 
        CASE 
            WHEN i.age_in_years < 18 THEN '3mo-17'
            WHEN i.age_in_years BETWEEN 18 AND 64 THEN '18-64'
            ELSE '65+'
        END
    ORDER BY age_strata
),

-- Patient-Level Detail
patient_detail AS (
    SELECT 
        p.patient_id,
        p.first_name,
        p.last_name,
        i.age_in_years,
        i.age_in_months,
        e.encounter_datetime,
        CASE 
            WHEN de.encounter_id IS NOT NULL THEN 'Excluded'
            WHEN n.encounter_id IS NOT NULL THEN 'Appropriate (No Antibiotics)'
            ELSE 'Inappropriate (Antibiotics)'
        END as measure_status,
        CASE 
            WHEN i.age_in_years < 18 THEN '3mo-17'
            WHEN i.age_in_years BETWEEN 18 AND 64 THEN '18-64'
            ELSE '65+'
        END as age_strata
    FROM initial_population i
    JOIN phm_edw.patient p ON i.patient_id = p.patient_id
    JOIN phm_edw.encounter e ON i.encounter_id = e.encounter_id
    LEFT JOIN denominator_exclusions de ON i.encounter_id = de.encounter_id
    LEFT JOIN numerator n ON i.encounter_id = n.encounter_id
    ORDER BY e.encounter_datetime, p.last_name, p.first_name
)

-- Return both summary and detail
SELECT 'Summary' as report_type, * FROM final_results
UNION ALL
SELECT 'Detail' as report_type, * FROM patient_detail;

-- Note: This SQL needs actual codes for:
-- 1. URI ICD-10 codes (more comprehensive list)
-- 2. Comorbid condition codes
-- 3. Antibiotic medication codes
-- 4. Competing diagnosis codes