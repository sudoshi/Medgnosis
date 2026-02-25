-- CMS646v4: Intravesical BCG for Non-muscle Invasive Bladder Cancer
-- Using the Inmon-style EDW schema (phm_edw)

-- Common date parameters for measurement period
WITH measurement_period AS (
  SELECT 
    '2024-01-01'::date as period_start,
    '2024-12-31'::date as period_end
),

-- Initial Population: Patients with non-muscle invasive bladder cancer
initial_population AS (
  SELECT DISTINCT 
    p.patient_id,
    cd.onset_date as diagnosis_date,
    cd.created_date as staging_date  -- Using created_date as proxy for staging date
  FROM phm_edw.patient p
  JOIN measurement_period mp ON true
  -- Bladder Cancer Diagnosis
  JOIN phm_edw.condition_diagnosis cd ON p.patient_id = cd.patient_id
  JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
  -- Encounter during measurement period
  JOIN phm_edw.encounter e ON p.patient_id = e.patient_id
  WHERE 
    -- Non-muscle invasive bladder cancer (T1, Tis, or high-grade Ta)
    c.condition_code IN (
      'C67.0', -- Bladder - trigone
      'C67.1', -- Bladder - dome
      'C67.2', -- Bladder - lateral wall
      'C67.3', -- Bladder - anterior wall
      'C67.4', -- Bladder - posterior wall
      'C67.5', -- Bladder - neck 
      'C67.6', -- Bladder - ureteric orifice
      'C67.7', -- Bladder - urachus
      'C67.8', -- Bladder - overlapping sites
      'C67.9'  -- Bladder - unspecified
    )
    -- Cancer stage indicators (T1, Tis, high-grade Ta)
    AND EXISTS (
      SELECT 1 
      FROM phm_edw.observation o 
      WHERE o.patient_id = p.patient_id
      AND o.observation_code IN (
        '21908-9', -- Stage (T1)
        '21899-0', -- Stage (Tis)
        '44648-4'  -- Grade (high-grade Ta)
      )
      AND o.active_ind = 'Y'
    )
    -- Staging within timeframe
    AND cd.created_date BETWEEN mp.period_start - INTERVAL '6 months' 
        AND mp.period_end + INTERVAL '6 months'
    -- Active diagnosis
    AND cd.diagnosis_status = 'ACTIVE'
    -- Encounter during measurement period
    AND e.encounter_datetime BETWEEN mp.period_start AND mp.period_end
    AND e.active_ind = 'Y'
    AND p.active_ind = 'Y'
    AND cd.active_ind = 'Y'
),

-- Denominator Exclusions
denominator_exclusions AS (
  SELECT DISTINCT i.patient_id
  FROM initial_population i
  LEFT JOIN phm_edw.condition_diagnosis cd ON i.patient_id = cd.patient_id
  LEFT JOIN phm_edw.condition c ON cd.condition_id = c.condition_id
  LEFT JOIN phm_edw.procedure_performed pp ON i.patient_id = pp.patient_id
  LEFT JOIN phm_edw.procedure p ON pp.procedure_id = p.procedure_id
  WHERE 
    -- Immunosuppression
    (c.condition_code IN (
      'B20',     -- HIV
      'D80-D89'  -- Immunodeficiency disorders
    )
    AND cd.onset_date <= i.staging_date)
    -- Immunosuppressive medications
    OR EXISTS (
      SELECT 1 
      FROM phm_edw.medication_order mo
      JOIN phm_edw.medication m ON mo.medication_id = m.medication_id
      WHERE mo.patient_id = i.patient_id
      AND m.medication_code LIKE 'L04%' -- ATC code for immunosuppressants
      AND mo.start_datetime <= i.staging_date
      AND mo.active_ind = 'Y'
    )
    -- Active tuberculosis
    OR (c.condition_code LIKE 'A15%' 
        AND cd.diagnosis_status = 'ACTIVE'
        AND cd.onset_date <= i.staging_date)
    -- Mixed histology
    OR EXISTS (
      SELECT 1 
      FROM phm_edw.observation o
      WHERE o.patient_id = i.patient_id
      AND o.observation_code IN (
        '85300-3', -- Micropapillary
        '85301-1', -- Plasmacytoid
        '85302-9', -- Sarcomatoid
        '85303-7', -- Adenocarcinoma
        '85304-5'  -- Squamous
      )
      AND o.observation_datetime <= i.staging_date
      AND o.active_ind = 'Y'
    )
    -- Treatment exclusions
    OR EXISTS (
      SELECT 1
      FROM phm_edw.procedure_performed pp2
      JOIN phm_edw.procedure p2 ON pp2.procedure_id = p2.procedure_id
      WHERE pp2.patient_id = i.patient_id
      AND p2.procedure_code IN (
        '51570', -- Cystectomy
        '96401', -- Chemotherapy
        '77261'  -- Radiation therapy
      )
      AND pp2.procedure_datetime BETWEEN i.staging_date 
          AND i.staging_date + INTERVAL '6 months'
      AND pp2.active_ind = 'Y'
    )
),

-- Numerator: BCG treatment
numerator AS (
  SELECT DISTINCT i.patient_id
  FROM initial_population i
  JOIN phm_edw.procedure_performed pp ON i.patient_id = pp.patient_id
  JOIN phm_edw.procedure p ON pp.procedure_id = p.procedure_id
  WHERE 
    -- BCG instillation procedure
    p.procedure_code IN (
      '51720',   -- Bladder instillation
      '90585'    -- BCG vaccine
    )
    -- Within 6 months of staging
    AND pp.procedure_datetime BETWEEN i.staging_date 
        AND i.staging_date + INTERVAL '6 months'
    AND pp.active_ind = 'Y'
),

-- Denominator Exceptions: BCG unavailability
denominator_exceptions AS (
  SELECT DISTINCT i.patient_id
  FROM initial_population i
  JOIN phm_edw.observation o ON i.patient_id = o.patient_id
  WHERE 
    o.observation_code = '96523-2' -- BCG unavailability
    AND o.observation_datetime BETWEEN i.staging_date 
        AND i.staging_date + INTERVAL '6 months'
    AND o.active_ind = 'Y'
)

-- Final measure calculation
SELECT 
  COUNT(DISTINCT n.patient_id)::FLOAT / 
  NULLIF(COUNT(DISTINCT 
    CASE WHEN i.patient_id NOT IN (
      SELECT patient_id FROM denominator_exclusions
      UNION
      SELECT patient_id FROM denominator_exceptions
    ) THEN i.patient_id END
  ), 0) * 100 as performance_rate,
  COUNT(DISTINCT i.patient_id) as initial_population,
  COUNT(DISTINCT CASE WHEN i.patient_id NOT IN 
    (SELECT patient_id FROM denominator_exclusions) 
    THEN i.patient_id END) as denominator,
  COUNT(DISTINCT n.patient_id) as numerator,
  COUNT(DISTINCT CASE WHEN i.patient_id IN 
    (SELECT patient_id FROM denominator_exclusions)
    THEN i.patient_id END) as denominator_exclusions,
  COUNT(DISTINCT CASE WHEN i.patient_id IN 
    (SELECT patient_id FROM denominator_exceptions)
    THEN i.patient_id END) as denominator_exceptions
FROM initial_population i
LEFT JOIN numerator n ON i.patient_id = n.patient_id;

-- Detailed patient-level results
SELECT 
  p.patient_id,
  p.first_name,
  p.last_name,
  i.diagnosis_date,
  i.staging_date,
  CASE WHEN de.patient_id IS NOT NULL 
    THEN 'Excluded' 
    WHEN dex.patient_id IS NOT NULL 
    THEN 'Exception'
    WHEN n.patient_id IS NOT NULL 
    THEN 'Received BCG'
    ELSE 'No BCG' 
  END as status
FROM initial_population i
JOIN phm_edw.patient p ON i.patient_id = p.patient_id
LEFT JOIN numerator n ON i.patient_id = n.patient_id
LEFT JOIN denominator_exclusions de ON i.patient_id = de.patient_id
LEFT JOIN denominator_exceptions dex ON i.patient_id = dex.patient_id
ORDER BY p.last_name, p.first_name;
