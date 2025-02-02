-- CMS153v12: Chlamydia Screening in Women
-- Using PHM EDW Schema

WITH measurement_period AS (
    SELECT 
        DATE '2024-01-01' as start_date,
        DATE '2024-12-31' as end_date
),

-- Initial Population: Women 16-24 years old
eligible_patients AS (
    SELECT DISTINCT
        p.patient_id,
        p.date_of_birth,
        DATE_PART('year', AGE(mp.end_date, p.date_of_birth)) as age_at_end
    FROM phm_edw.patient p
    CROSS JOIN measurement_period mp
    WHERE 
        p.gender = 'F'
        AND DATE_PART('year', AGE(mp.end_date, p.date_of_birth)) BETWEEN 16 AND 24
),

-- Evidence of sexual activity through various means
sexually_active AS (
    SELECT DISTINCT patient_id
    FROM (
        -- Diagnosis evidence
        SELECT cd.patient_id
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
        WHERE c.condition_code IN (
            'Z32.00',  -- Encounter for pregnancy test, result unknown
            'Z32.01',  -- Encounter for pregnancy test, positive
            'Z32.02'   -- Encounter for pregnancy test, negative
        )
        
        UNION
        
        -- Medication evidence
        SELECT mo.patient_id
        FROM phm_edw.medication_order mo
        JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
        WHERE m.medication_code IN (
            'select codes for contraceptives',
            'and related medications'
        )
        
        UNION
        
        -- Procedure evidence
        SELECT pp.patient_id
        FROM phm_edw.procedure_performed pp
        JOIN phm_edw.procedure p ON pp.procedure_id = p.procedure_id
        WHERE p.procedure_code IN (
            'select codes for relevant procedures',
            'related to sexual activity'
        )
        
        UNION
        
        -- Lab test evidence
        SELECT o.patient_id
        FROM phm_edw.observation o
        WHERE o.observation_code IN (
            'select LOINC codes for',
            'pregnancy tests and related labs'
        )
    ) evidence
),

-- Initial Population (combining age and sexual activity criteria)
initial_population AS (
    SELECT ep.patient_id, ep.age_at_end
    FROM eligible_patients ep
    JOIN sexually_active sa ON ep.patient_id = sa.patient_id
),

-- Denominator Exclusions
denominator_exclusions AS (
    SELECT DISTINCT i.patient_id
    FROM initial_population i
    LEFT JOIN phm_edw.condition_diagnosis cd 
        ON i.patient_id = cd.patient_id
    LEFT JOIN phm_edw.condition c 
        ON cd.condition_id = c.condition_id
    WHERE 
        -- Hospice care
        c.condition_code IN ('Z51.5')
        
        -- Pregnancy test with X-ray or medication exclusion
        OR EXISTS (
            SELECT 1
            FROM phm_edw.observation o
            WHERE o.patient_id = i.patient_id
            AND o.observation_code IN (
                'select pregnancy test codes'
            )
            AND EXISTS (
                SELECT 1
                FROM phm_edw.procedure_performed pp
                JOIN phm_edw.procedure p ON pp.procedure_id = p.procedure_id
                WHERE pp.patient_id = i.patient_id
                AND p.procedure_code IN ('select x-ray codes')
                AND pp.procedure_datetime BETWEEN o.observation_datetime
                    AND o.observation_datetime + INTERVAL '6 days'
            )
        )
),

-- Numerator: Chlamydia Tests
numerator AS (
    SELECT DISTINCT i.patient_id
    FROM initial_population i
    JOIN phm_edw.observation o ON i.patient_id = o.patient_id
    JOIN measurement_period mp ON 1=1
    WHERE 
        o.observation_code IN (
            'select LOINC codes for chlamydia tests'
        )
        AND o.observation_datetime BETWEEN mp.start_date AND mp.end_date
),

-- Final Results including stratification
final_results AS (
    SELECT
        CASE 
            WHEN age_at_end BETWEEN 16 AND 20 THEN '16-20'
            WHEN age_at_end BETWEEN 21 AND 24 THEN '21-24'
        END as age_strata,
        COUNT(DISTINCT i.patient_id) as initial_population,
        COUNT(DISTINCT i.patient_id) as denominator,
        COUNT(DISTINCT CASE 
            WHEN de.patient_id IS NULL THEN i.patient_id 
        END) as denominator_after_exclusions,
        COUNT(DISTINCT CASE 
            WHEN de.patient_id IS NULL AND n.patient_id IS NOT NULL 
            THEN i.patient_id 
        END) as numerator,
        ROUND(
            CAST(COUNT(DISTINCT CASE 
                WHEN de.patient_id IS NULL AND n.patient_id IS NOT NULL 
                THEN i.patient_id 
            END) AS DECIMAL) /
            NULLIF(COUNT(DISTINCT CASE 
                WHEN de.patient_id IS NULL THEN i.patient_id 
            END), 0)
            * 100, 2
        ) as performance_rate
    FROM initial_population i
    LEFT JOIN denominator_exclusions de ON i.patient_id = de.patient_id
    LEFT JOIN numerator n ON i.patient_id = n.patient_id
    GROUP BY 
        CASE 
            WHEN age_at_end BETWEEN 16 AND 20 THEN '16-20'
            WHEN age_at_end BETWEEN 21 AND 24 THEN '21-24'
        END
    ORDER BY age_strata
),

-- Patient-Level Detail
patient_detail AS (
    SELECT 
        p.patient_id,
        p.first_name,
        p.last_name,
        p.date_of_birth,
        i.age_at_end,
        CASE 
            WHEN de.patient_id IS NOT NULL THEN 'Excluded'
            WHEN n.patient_id IS NOT NULL THEN 'Numerator'
            ELSE 'Denominator Only'
        END as measure_status,
        CASE 
            WHEN age_at_end BETWEEN 16 AND 20 THEN '16-20'
            WHEN age_at_end BETWEEN 21 AND 24 THEN '21-24'
        END as age_strata
    FROM initial_population i
    JOIN phm_edw.patient p ON i.patient_id = p.patient_id
    LEFT JOIN denominator_exclusions de ON i.patient_id = de.patient_id
    LEFT JOIN numerator n ON i.patient_id = n.patient_id
    ORDER BY p.last_name, p.first_name
)

-- Return both summary and detail
SELECT 'Summary' as report_type, * FROM final_results
UNION ALL
SELECT 'Detail' as report_type, * FROM patient_detail;

-- Note: This SQL needs actual codes for:
-- 1. Sexual activity evidence (diagnoses, medications, procedures)
-- 2. Pregnancy test codes
-- 3. X-ray codes for exclusions
-- 4. Chlamydia test LOINC codes