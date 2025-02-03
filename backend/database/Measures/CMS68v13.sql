-- CMS68v13: Documentation of Current Medications
WITH measurement_period AS (
  SELECT 
    '2024-01-01'::date as period_start,
    '2024-12-31'::date as period_end
),

-- Initial Population: Patients 18+ with eligible encounter
initial_population AS (
  SELECT 
    e.encounter_id,
    e.patient_id,
    e.provider_id,
    e.encounter_datetime
  FROM phm_edw.encounter e
  JOIN phm_edw.patient p ON e.patient_id = p.patient_id
  JOIN measurement_period mp ON true
  WHERE 
    -- Age 18+ at encounter
    EXTRACT(YEAR FROM age(e.encounter_datetime, p.date_of_birth)) >= 18
    -- During measurement period
    AND e.encounter_datetime BETWEEN mp.period_start AND mp.period_end
    -- Active records only
    AND e.active_ind = 'Y'
    AND p.active_ind = 'Y'
),

-- Numerator: Medication list reviewed
numerator AS (
  SELECT DISTINCT 
    i.encounter_id
  FROM initial_population i
  JOIN phm_edw.observation o ON i.encounter_id = o.encounter_id
  WHERE 
    -- Medication list review documentation
    o.observation_code IN (
      '428191000124101',  -- Documentation of current medications (SNOMED)
      '1159011', -- Medication List Reviewed (CPT Category II)
      'G8427'    -- Eligible clinician attests to documenting in the medical record they obtained, updated, or reviewed the patient's current medications
    )
    AND o.observation_datetime = i.encounter_datetime
    AND o.active_ind = 'Y'
),

-- Denominator Exceptions: Medical reason
denominator_exceptions AS (
  SELECT DISTINCT 
    i.encounter_id
  FROM initial_population i
  JOIN phm_edw.observation o ON i.encounter_id = o.encounter_id
  WHERE 
    -- Medical reason for not reviewing medications
    o.observation_code IN (
      'G8430',   -- Documentation of medical reason(s) for not documenting medications
      'MEDEX01'  -- Medical Exception (custom code)
    )
    AND o.observation_datetime = i.encounter_datetime
    AND o.active_ind = 'Y'
)

-- Final measure calculation
SELECT 
  COUNT(DISTINCT n.encounter_id)::FLOAT / 
  NULLIF(COUNT(DISTINCT 
    CASE WHEN i.encounter_id NOT IN (
      SELECT encounter_id FROM denominator_exceptions
    ) THEN i.encounter_id END
  ), 0) * 100 as performance_rate,
  COUNT(DISTINCT i.encounter_id) as initial_population,
  COUNT(DISTINCT CASE WHEN i.encounter_id NOT IN 
    (SELECT encounter_id FROM denominator_exceptions) 
    THEN i.encounter_id END) as denominator,
  COUNT(DISTINCT n.encounter_id) as numerator,
  COUNT(DISTINCT CASE WHEN i.encounter_id IN 
    (SELECT encounter_id FROM denominator_exceptions)
    THEN i.encounter_id END) as denominator_exceptions
FROM initial_population i
LEFT JOIN numerator n ON i.encounter_id = n.encounter_id;

-- Detailed episode-level results
SELECT 
  e.encounter_id,
  e.encounter_datetime,
  p.first_name,
  p.last_name,
  prov.display_name as provider_name,
  CASE 
    WHEN de.encounter_id IS NOT NULL THEN 'Exception'
    WHEN n.encounter_id IS NOT NULL THEN 'Reviewed'
    ELSE 'Not Reviewed'
  END as med_review_status
FROM initial_population i
JOIN phm_edw.encounter e ON i.encounter_id = e.encounter_id
JOIN phm_edw.patient p ON e.patient_id = p.patient_id
JOIN phm_edw.provider prov ON e.provider_id = prov.provider_id
LEFT JOIN numerator n ON i.encounter_id = n.encounter_id
LEFT JOIN denominator_exceptions de ON i.encounter_id = de.encounter_id
ORDER BY e.encounter_datetime;
