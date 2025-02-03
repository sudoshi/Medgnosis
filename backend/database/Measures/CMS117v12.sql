-- CMS117v12 Childhood Immunization Status
-- Using PHM EDW Schema

-- Step 1: Create a CTE for children who turn 2 during measurement period
WITH measurement_period AS (
    SELECT 
        '2025-01-01'::DATE AS start_date,
        '2025-12-31'::DATE AS end_date
),

eligible_patients AS (
    SELECT DISTINCT 
        p.patient_id,
        p.date_of_birth,
        (DATE_PART('year', mp.end_date) - DATE_PART('year', p.date_of_birth)) * 12 +
        (DATE_PART('month', mp.end_date) - DATE_PART('month', p.date_of_birth)) AS months_old
    FROM phm_edw.patient p
    CROSS JOIN measurement_period mp
    WHERE p.date_of_birth BETWEEN 
        (mp.start_date - INTERVAL '2 years') AND 
        (mp.end_date - INTERVAL '2 years')
),

-- Step 2: Identify denominator exclusions
denominator_exclusions AS (
    SELECT DISTINCT cd.patient_id
    FROM phm_edw.condition_diagnosis cd
    JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
    JOIN eligible_patients ep ON cd.patient_id = ep.patient_id
    WHERE 
        -- Check for exclusion conditions before 2nd birthday
        cd.onset_date <= (ep.date_of_birth + INTERVAL '2 years')
        AND (
            -- Severe combined immunodeficiency
            (c.condition_code IN ('D81.0', 'D81.1', 'D81.2') AND c.code_system = 'ICD-10')
            -- HIV
            OR (c.condition_code LIKE 'B20%' AND c.code_system = 'ICD-10')
            -- Cancer conditions
            OR (c.condition_code IN ('C81%', 'C82%', 'C83%', 'C84%', 'C85%', 'C88%', 'C90%', 'C91%', 'C92%', 'C93%') 
                AND c.code_system = 'ICD-10')
            -- Intussusception
            OR (c.condition_code = 'K56.1' AND c.code_system = 'ICD-10')
        )
),

-- Step 3: Create CTEs for each vaccine type
dtap_compliance AS (
    SELECT 
        i.patient_id,
        COUNT(*) as vaccine_count
    FROM phm_edw.immunization i
    JOIN eligible_patients ep ON i.patient_id = ep.patient_id
    WHERE 
        i.vaccine_code IN ('20', '106', '107', '146', '110', '50', '120', '130', '132') -- DTaP CVX codes
        AND i.administration_datetime <= (ep.date_of_birth + INTERVAL '2 years')
    GROUP BY i.patient_id
    HAVING COUNT(*) >= 4
),

ipv_compliance AS (
    SELECT 
        i.patient_id,
        COUNT(*) as vaccine_count
    FROM phm_edw.immunization i
    JOIN eligible_patients ep ON i.patient_id = ep.patient_id
    WHERE 
        i.vaccine_code IN ('10', '89', '110', '120') -- IPV CVX codes
        AND i.administration_datetime <= (ep.date_of_birth + INTERVAL '2 years')
    GROUP BY i.patient_id
    HAVING COUNT(*) >= 3
),

mmr_compliance AS (
    SELECT 
        i.patient_id,
        COUNT(*) as vaccine_count
    FROM phm_edw.immunization i
    JOIN eligible_patients ep ON i.patient_id = ep.patient_id
    WHERE 
        i.vaccine_code IN ('03', '94') -- MMR CVX codes
        AND i.administration_datetime <= (ep.date_of_birth + INTERVAL '2 years')
    GROUP BY i.patient_id
    HAVING COUNT(*) >= 1
),

hib_compliance AS (
    SELECT 
        i.patient_id,
        COUNT(*) as vaccine_count
    FROM phm_edw.immunization i
    JOIN eligible_patients ep ON i.patient_id = ep.patient_id
    WHERE 
        i.vaccine_code IN ('17', '46', '47', '48', '49', '50', '51', '120', '148') -- Hib CVX codes
        AND i.administration_datetime <= (ep.date_of_birth + INTERVAL '2 years')
    GROUP BY i.patient_id
    HAVING COUNT(*) >= 3
),

hepb_compliance AS (
    SELECT 
        i.patient_id,
        COUNT(*) as vaccine_count
    FROM phm_edw.immunization i
    JOIN eligible_patients ep ON i.patient_id = ep.patient_id
    WHERE 
        i.vaccine_code IN ('08', '44', '51', '110') -- Hep B CVX codes
        AND i.administration_datetime <= (ep.date_of_birth + INTERVAL '2 years')
    GROUP BY i.patient_id
    HAVING COUNT(*) >= 3
),

vzv_compliance AS (
    SELECT 
        i.patient_id,
        COUNT(*) as vaccine_count
    FROM phm_edw.immunization i
    JOIN eligible_patients ep ON i.patient_id = ep.patient_id
    WHERE 
        i.vaccine_code IN ('21', '94') -- VZV CVX codes
        AND i.administration_datetime <= (ep.date_of_birth + INTERVAL '2 years')
    GROUP BY i.patient_id
    HAVING COUNT(*) >= 1
),

pcv_compliance AS (
    SELECT 
        i.patient_id,
        COUNT(*) as vaccine_count
    FROM phm_edw.immunization i
    JOIN eligible_patients ep ON i.patient_id = ep.patient_id
    WHERE 
        i.vaccine_code IN ('133', '152') -- PCV CVX codes
        AND i.administration_datetime <= (ep.date_of_birth + INTERVAL '2 years')
    GROUP BY i.patient_id
    HAVING COUNT(*) >= 4
),

hepa_compliance AS (
    SELECT 
        i.patient_id,
        COUNT(*) as vaccine_count
    FROM phm_edw.immunization i
    JOIN eligible_patients ep ON i.patient_id = ep.patient_id
    WHERE 
        i.vaccine_code IN ('83', '84') -- Hep A CVX codes
        AND i.administration_datetime <= (ep.date_of_birth + INTERVAL '2 years')
    GROUP BY i.patient_id
    HAVING COUNT(*) >= 1
),

rotavirus_compliance AS (
    SELECT 
        i.patient_id,
        COUNT(*) as vaccine_count
    FROM phm_edw.immunization i
    JOIN eligible_patients ep ON i.patient_id = ep.patient_id
    WHERE 
        i.vaccine_code IN ('119', '116', '122') -- Rotavirus CVX codes
        AND i.administration_datetime <= (ep.date_of_birth + INTERVAL '2 years')
    GROUP BY i.patient_id
    HAVING COUNT(*) >= 2
),

flu_compliance AS (
    SELECT 
        i.patient_id,
        COUNT(*) as vaccine_count
    FROM phm_edw.immunization i
    JOIN eligible_patients ep ON i.patient_id = ep.patient_id
    WHERE 
        i.vaccine_code IN ('88', '135', '140', '141', '150', '155', '158', '161') -- Influenza CVX codes
        AND i.administration_datetime <= (ep.date_of_birth + INTERVAL '2 years')
    GROUP BY i.patient_id
    HAVING COUNT(*) >= 2
)

-- Final measure calculation
SELECT 
    COUNT(DISTINCT ep.patient_id) as denominator,
    COUNT(DISTINCT CASE WHEN de.patient_id IS NOT NULL THEN ep.patient_id END) as exclusions,
    COUNT(DISTINCT 
        CASE WHEN de.patient_id IS NULL 
             AND dtap.patient_id IS NOT NULL
             AND ipv.patient_id IS NOT NULL
             AND mmr.patient_id IS NOT NULL
             AND hib.patient_id IS NOT NULL
             AND hepb.patient_id IS NOT NULL
             AND vzv.patient_id IS NOT NULL
             AND pcv.patient_id IS NOT NULL
             AND hepa.patient_id IS NOT NULL
             AND rotavirus.patient_id IS NOT NULL
             AND flu.patient_id IS NOT NULL
        THEN ep.patient_id END
    ) as numerator
FROM eligible_patients ep
LEFT JOIN denominator_exclusions de ON ep.patient_id = de.patient_id
LEFT JOIN dtap_compliance dtap ON ep.patient_id = dtap.patient_id
LEFT JOIN ipv_compliance ipv ON ep.patient_id = ipv.patient_id
LEFT JOIN mmr_compliance mmr ON ep.patient_id = mmr.patient_id
LEFT JOIN hib_compliance hib ON ep.patient_id = hib.patient_id
LEFT JOIN hepb_compliance hepb ON ep.patient_id = hepb.patient_id
LEFT JOIN vzv_compliance vzv ON ep.patient_id = vzv.patient_id
LEFT JOIN pcv_compliance pcv ON ep.patient_id = pcv.patient_id
LEFT JOIN hepa_compliance hepa ON ep.patient_id = hepa.patient_id
LEFT JOIN rotavirus_compliance rotavirus ON ep.patient_id = rotavirus.patient_id
LEFT JOIN flu_compliance flu ON ep.patient_id = flu.patient_id;

-- Optional: Detailed patient-level results
SELECT 
    p.patient_id,
    p.first_name,
    p.last_name,
    p.date_of_birth,
    CASE WHEN de.patient_id IS NOT NULL THEN 'Excluded'
         WHEN dtap.patient_id IS NULL THEN 'Missing DTaP'
         WHEN ipv.patient_id IS NULL THEN 'Missing IPV'
         WHEN mmr.patient_id IS NULL THEN 'Missing MMR'
         WHEN hib.patient_id IS NULL THEN 'Missing HiB'
         WHEN hepb.patient_id IS NULL THEN 'Missing HepB'
         WHEN vzv.patient_id IS NULL THEN 'Missing VZV'
         WHEN pcv.patient_id IS NULL THEN 'Missing PCV'
         WHEN hepa.patient_id IS NULL THEN 'Missing HepA'
         WHEN rotavirus.patient_id IS NULL THEN 'Missing Rotavirus'
         WHEN flu.patient_id IS NULL THEN 'Missing Flu'
         ELSE 'Compliant'
    END as status
FROM eligible_patients ep
JOIN phm_edw.patient p ON ep.patient_id = p.patient_id
LEFT JOIN denominator_exclusions de ON ep.patient_id = de.patient_id
LEFT JOIN dtap_compliance dtap ON ep.patient_id = dtap.patient_id
LEFT JOIN ipv_compliance ipv ON ep.patient_id = ipv.patient_id
LEFT JOIN mmr_compliance mmr ON ep.patient_id = mmr.patient_id
LEFT JOIN hib_compliance hib ON ep.patient_id = hib.patient_id
LEFT JOIN hepb_compliance hepb ON ep.patient_id = hepb.patient_id
LEFT JOIN vzv_compliance vzv ON ep.patient_id = vzv.patient_id
LEFT JOIN pcv_compliance pcv ON ep.patient_id = pcv.patient_id
LEFT JOIN hepa_compliance hepa ON ep.patient_id = hepa.patient_id
LEFT JOIN rotavirus_compliance rotavirus ON ep.patient_id = rotavirus.patient_id
LEFT JOIN flu_compliance flu ON ep.patient_id = flu.patient_id
ORDER BY p.last_name, p.first_name;
