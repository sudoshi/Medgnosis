-- CMS136v13 ADHD Follow-up Care Measure
-- Using Inmon-style EDW schema (phm_edw)

WITH patient_age AS (
    -- Calculate patient age as of IPSD
    SELECT 
        p.patient_id,
        mo.medication_order_id,
        mo.start_datetime as ipsd,
        DATE_PART('year', AGE(mo.start_datetime, p.date_of_birth)) as age_at_ipsd
    FROM phm_edw.patient p
    JOIN phm_edw.medication_order mo ON p.patient_id = mo.patient_id
    JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
    WHERE m.medication_code LIKE 'N06BA%' -- ATC code for ADHD medications
    AND mo.start_datetime BETWEEN '2024-01-01' AND '2024-12-31'
),

prior_adhd_meds AS (
    -- Check for prior ADHD medication use
    SELECT DISTINCT
        mo.patient_id,
        mo.start_datetime as ipsd
    FROM phm_edw.medication_order mo
    JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
    WHERE m.medication_code LIKE 'N06BA%'
    AND EXISTS (
        SELECT 1
        FROM phm_edw.medication_order mo2
        JOIN phm_edw.medication m2 ON mo2.medication_id = m2.medication_id
        WHERE mo2.patient_id = mo.patient_id
        AND m2.medication_code LIKE 'N06BA%'
        AND mo2.start_datetime BETWEEN mo.start_datetime - INTERVAL '120 days' 
            AND mo.start_datetime
    )
),

qualified_encounters AS (
    -- Identify qualifying encounters
    SELECT 
        e.patient_id,
        e.encounter_datetime,
        p.provider_id,
        pr.provider_type
    FROM phm_edw.encounter e
    JOIN phm_edw.provider p ON e.provider_id = p.provider_id
    JOIN phm_edw.provider pr ON p.provider_id = pr.provider_id
    WHERE e.encounter_type IN ('OFFICE VISIT', 'OUTPATIENT')
    AND pr.provider_type IN ('MD', 'DO', 'NP', 'PA')
    AND e.encounter_datetime BETWEEN '2024-01-01' AND '2024-12-31'
),

initial_population_1 AS (
    -- Identify initial population for first rate
    SELECT DISTINCT 
        pa.patient_id,
        pa.ipsd,
        pa.age_at_ipsd
    FROM patient_age pa
    WHERE pa.age_at_ipsd BETWEEN 6 AND 12
    AND NOT EXISTS (
        SELECT 1 FROM prior_adhd_meds pam
        WHERE pam.patient_id = pa.patient_id
        AND pam.ipsd = pa.ipsd
    )
    AND EXISTS (
        SELECT 1 FROM qualified_encounters qe
        WHERE qe.patient_id = pa.patient_id
        AND qe.encounter_datetime BETWEEN pa.ipsd - INTERVAL '6 months' 
            AND pa.ipsd
    )
),

denominator_exclusions AS (
    -- Identify patients with narcolepsy or hospice care
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    WHERE (
        c.condition_code = 'G47.4' -- ICD-10 for narcolepsy
        OR EXISTS (
            SELECT 1 
            FROM phm_edw.encounter e
            WHERE e.patient_id = cd.patient_id
            AND e.encounter_type = 'HOSPICE'
            AND e.encounter_datetime BETWEEN '2024-01-01' AND '2024-12-31'
        )
    )
),

initiation_phase_visits AS (
    -- Track follow-up visits during 30-day initiation phase
    SELECT DISTINCT
        ip.patient_id,
        ip.ipsd,
        qe.encounter_datetime as visit_date
    FROM initial_population_1 ip
    JOIN qualified_encounters qe ON ip.patient_id = qe.patient_id
    WHERE qe.encounter_datetime BETWEEN ip.ipsd AND ip.ipsd + INTERVAL '30 days'
),

continuation_phase_population AS (
    -- Identify population for continuation phase (Rate 2)
    SELECT 
        ip.patient_id,
        ip.ipsd,
        COUNT(DISTINCT mo.medication_order_id) as treatment_days
    FROM initial_population_1 ip
    JOIN phm_edw.medication_order mo ON ip.patient_id = mo.patient_id
    JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
    WHERE m.medication_code LIKE 'N06BA%'
    AND mo.start_datetime BETWEEN ip.ipsd AND ip.ipsd + INTERVAL '300 days'
    GROUP BY ip.patient_id, ip.ipsd
    HAVING COUNT(DISTINCT mo.medication_order_id) >= 210
),

continuation_phase_visits AS (
    -- Track follow-up visits during continuation phase
    SELECT DISTINCT
        cp.patient_id,
        cp.ipsd,
        qe.encounter_datetime as visit_date,
        ROW_NUMBER() OVER (
            PARTITION BY cp.patient_id, cp.ipsd 
            ORDER BY qe.encounter_datetime
        ) as visit_number
    FROM continuation_phase_population cp
    JOIN qualified_encounters qe ON cp.patient_id = qe.patient_id
    WHERE qe.encounter_datetime BETWEEN 
        cp.ipsd + INTERVAL '31 days' AND 
        cp.ipsd + INTERVAL '300 days'
)

-- Rate 1: Initiation Phase
SELECT 
    'Rate 1 - Initiation Phase' as measure_component,
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT ip.patient_id) - COUNT(DISTINCT de.patient_id) as denominator,
    COUNT(DISTINCT CASE 
        WHEN ipv.patient_id IS NOT NULL 
        AND de.patient_id IS NULL 
        THEN ip.patient_id 
    END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE 
            WHEN ipv.patient_id IS NOT NULL 
            AND de.patient_id IS NULL 
            THEN ip.patient_id 
        END) AS DECIMAL) / 
        NULLIF((COUNT(DISTINCT ip.patient_id) - 
                COUNT(DISTINCT de.patient_id)), 0) * 100,
        2
    ) as performance_rate
FROM initial_population_1 ip
LEFT JOIN denominator_exclusions de ON ip.patient_id = de.patient_id
LEFT JOIN initiation_phase_visits ipv ON ip.patient_id = ipv.patient_id

UNION ALL

-- Rate 2: Continuation Phase
SELECT 
    'Rate 2 - Continuation Phase' as measure_component,
    COUNT(DISTINCT cp.patient_id) as initial_population,
    COUNT(DISTINCT cp.patient_id) - COUNT(DISTINCT de.patient_id) as denominator,
    COUNT(DISTINCT CASE 
        WHEN cpv.visit_number >= 2 
        AND ipv.patient_id IS NOT NULL 
        AND de.patient_id IS NULL 
        THEN cp.patient_id 
    END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE 
            WHEN cpv.visit_number >= 2 
            AND ipv.patient_id IS NOT NULL 
            AND de.patient_id IS NULL 
            THEN cp.patient_id 
        END) AS DECIMAL) / 
        NULLIF((COUNT(DISTINCT cp.patient_id) - 
                COUNT(DISTINCT de.patient_id)), 0) * 100,
        2
    ) as performance_rate
FROM continuation_phase_population cp
LEFT JOIN denominator_exclusions de ON cp.patient_id = de.patient_id
LEFT JOIN initiation_phase_visits ipv ON cp.patient_id = ipv.patient_id
LEFT JOIN continuation_phase_visits cpv ON cp.patient_id = cpv.patient_id;
