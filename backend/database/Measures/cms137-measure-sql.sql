-- CMS137v12 SUD Treatment Initiation and Engagement Measure
-- Using Inmon-style EDW schema (phm_edw)

WITH patient_age AS (
    -- Calculate patient age at start of measurement period
    SELECT 
        p.patient_id,
        DATE_PART('year', AGE('2024-01-01', p.date_of_birth)) as age_at_start
    FROM phm_edw.patient p
),

sud_diagnoses AS (
    -- Identify new SUD diagnoses with lookback period
    SELECT DISTINCT 
        cd.patient_id,
        cd.encounter_id,
        e.encounter_datetime as diagnosis_date,
        -- Check for prior SUD dx or treatment in 60 days
        NOT EXISTS (
            SELECT 1
            FROM phm_edw.condition_diagnosis cd2
            JOIN phm_edw.condition c2 ON cd2.condition_id = c2.condition_id
            WHERE cd2.patient_id = cd.patient_id
            AND cd2.onset_date BETWEEN e.encounter_datetime - INTERVAL '60 days' 
                AND e.encounter_datetime - INTERVAL '1 day'
            AND c2.condition_code LIKE 'F1%' -- ICD-10 SUD codes
        ) as is_new_episode
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    JOIN phm_edw.encounter e ON cd.encounter_id = e.encounter_id
    WHERE c.condition_code LIKE 'F1%' -- ICD-10 SUD codes
    AND e.encounter_datetime BETWEEN '2024-01-01' AND '2024-11-14'
),

qualifying_encounters AS (
    -- Identify qualifying encounters
    SELECT 
        e.patient_id,
        e.encounter_id,
        e.encounter_datetime
    FROM phm_edw.encounter e
    WHERE e.encounter_type IN ('OFFICE VISIT', 'OUTPATIENT')
    AND e.encounter_datetime BETWEEN '2024-01-01' AND '2024-12-31'
),

initial_population AS (
    -- Combine age, diagnosis, and encounter criteria
    SELECT DISTINCT 
        pa.patient_id,
        pa.age_at_start,
        sd.diagnosis_date,
        sd.encounter_id as index_encounter_id
    FROM patient_age pa
    JOIN sud_diagnoses sd ON pa.patient_id = sd.patient_id
    JOIN qualifying_encounters qe ON sd.patient_id = qe.patient_id
    WHERE pa.age_at_start >= 13
    AND sd.is_new_episode = true
),

denominator_exclusions AS (
    -- Identify patients in hospice
    SELECT DISTINCT e.patient_id
    FROM phm_edw.encounter e
    WHERE e.encounter_type = 'HOSPICE'
    AND e.encounter_datetime BETWEEN '2024-01-01' AND '2024-12-31'
),

initiation_visits AS (
    -- Track SUD treatment visits within 14 days
    SELECT DISTINCT
        ip.patient_id,
        ip.diagnosis_date,
        qe.encounter_datetime as visit_date,
        CASE 
            WHEN qe.encounter_datetime BETWEEN ip.diagnosis_date 
                AND ip.diagnosis_date + INTERVAL '14 days' THEN 1
            ELSE 0
        END as is_initiation_visit
    FROM initial_population ip
    JOIN qualifying_encounters qe ON ip.patient_id = qe.patient_id
    WHERE qe.encounter_datetime > ip.diagnosis_date
),

initiation_medications AS (
    -- Track SUD medications within 14 days
    SELECT DISTINCT
        ip.patient_id,
        ip.diagnosis_date,
        mo.start_datetime as med_start_date,
        CASE 
            WHEN mo.start_datetime BETWEEN ip.diagnosis_date 
                AND ip.diagnosis_date + INTERVAL '14 days' THEN 1
            ELSE 0
        END as is_initiation_med
    FROM initial_population ip
    JOIN phm_edw.medication_order mo ON ip.patient_id = mo.patient_id
    JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
    WHERE m.medication_code LIKE 'N07B%' -- ATC codes for SUD medications
),

engagement_visits AS (
    -- Track additional treatment visits within 34 days of initiation
    SELECT DISTINCT
        iv.patient_id,
        iv.diagnosis_date,
        COUNT(DISTINCT qe.encounter_id) as engagement_visit_count
    FROM initiation_visits iv
    JOIN qualifying_encounters qe ON iv.patient_id = qe.patient_id
    WHERE qe.encounter_datetime BETWEEN 
        iv.diagnosis_date + INTERVAL '1 day'
        AND iv.diagnosis_date + INTERVAL '34 days'
    GROUP BY iv.patient_id, iv.diagnosis_date
),

long_acting_meds AS (
    -- Track long-acting SUD medications
    SELECT DISTINCT
        ip.patient_id,
        ip.diagnosis_date,
        mo.start_datetime,
        mo.end_datetime
    FROM initial_population ip
    JOIN phm_edw.medication_order mo ON ip.patient_id = mo.patient_id
    JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
    WHERE m.medication_code IN (
        'N07BC01', -- Buprenorphine
        'N07BC02', -- Methadone
        'N07BC05'  -- Naltrexone LA
    )
    AND mo.start_datetime BETWEEN 
        ip.diagnosis_date + INTERVAL '1 day'
        AND ip.diagnosis_date + INTERVAL '34 days'
    AND (mo.end_datetime IS NULL OR 
         mo.end_datetime >= ip.diagnosis_date + INTERVAL '34 days')
)

-- Rate 1: Initiation of Treatment
SELECT 
    CASE 
        WHEN ip.age_at_start BETWEEN 13 AND 17 THEN 'Age 13-17'
        WHEN ip.age_at_start BETWEEN 18 AND 64 THEN 'Age 18-64'
        ELSE 'Age 65+'
    END as age_group,
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT ip.patient_id) - 
        COUNT(DISTINCT de.patient_id) as denominator,
    COUNT(DISTINCT CASE 
        WHEN (iv.is_initiation_visit = 1 OR im.is_initiation_med = 1)
        AND de.patient_id IS NULL 
        THEN ip.patient_id 
    END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE 
            WHEN (iv.is_initiation_visit = 1 OR im.is_initiation_med = 1)
            AND de.patient_id IS NULL 
            THEN ip.patient_id 
        END) AS DECIMAL) / 
        NULLIF((COUNT(DISTINCT ip.patient_id) - 
                COUNT(DISTINCT de.patient_id)), 0) * 100,
        2
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_id = de.patient_id
LEFT JOIN initiation_visits iv ON ip.patient_id = iv.patient_id
LEFT JOIN initiation_medications im ON ip.patient_id = im.patient_id
GROUP BY 
    CASE 
        WHEN ip.age_at_start BETWEEN 13 AND 17 THEN 'Age 13-17'
        WHEN ip.age_at_start BETWEEN 18 AND 64 THEN 'Age 18-64'
        ELSE 'Age 65+'
    END

UNION ALL

-- Rate 2: Engagement in Treatment
SELECT 
    CASE 
        WHEN ip.age_at_start BETWEEN 13 AND 17 THEN 'Age 13-17'
        WHEN ip.age_at_start BETWEEN 18 AND 64 THEN 'Age 18-64'
        ELSE 'Age 65+'
    END as age_group,
    COUNT(DISTINCT ip.patient_id) as initial_population,
    COUNT(DISTINCT ip.patient_id) - 
        COUNT(DISTINCT de.patient_id) as denominator,
    COUNT(DISTINCT CASE 
        WHEN (
            lam.patient_id IS NOT NULL OR
            (ev.engagement_visit_count >= 2) OR
            (ev.engagement_visit_count >= 1 AND im.is_initiation_med = 1)
        )
        AND de.patient_id IS NULL 
        THEN ip.patient_id 
    END) as numerator,
    ROUND(
        CAST(COUNT(DISTINCT CASE 
            WHEN (
                lam.patient_id IS NOT NULL OR
                (ev.engagement_visit_count >= 2) OR
                (ev.engagement_visit_count >= 1 AND im.is_initiation_med = 1)
            )
            AND de.patient_id IS NULL 
            THEN ip.patient_id 
        END) AS DECIMAL) / 
        NULLIF((COUNT(DISTINCT ip.patient_id) - 
                COUNT(DISTINCT de.patient_id)), 0) * 100,
        2
    ) as performance_rate
FROM initial_population ip
LEFT JOIN denominator_exclusions de ON ip.patient_id = de.patient_id
LEFT JOIN engagement_visits ev ON ip.patient_id = ev.patient_id
LEFT JOIN initiation_medications im ON ip.patient_id = im.patient_id
LEFT JOIN long_acting_meds lam ON ip.patient_id = lam.patient_id
GROUP BY 
    CASE 
        WHEN ip.age_at_start BETWEEN 13 AND 17 THEN 'Age 13-17'
        WHEN ip.age_at_start BETWEEN 18 AND 64 THEN 'Age 18-64'
        ELSE 'Age 65+'
    END;