-- CMS50v12: Closing the Referral Loop: Receipt of Specialist Report
-- Using the Inmon-style EDW schema (phm_edw)

-- Common date parameters for measurement period
WITH measurement_period AS (
  SELECT 
    '2024-01-01'::date as period_start,
    '2024-12-31'::date as period_end,
    '2024-10-31'::date as referral_cutoff  -- Last date for initial referrals
),

-- Initial Population: Patients with eligible encounter and referral
initial_population AS (
  SELECT DISTINCT 
    e.patient_id,
    e.provider_id as referring_provider_id,
    pp.provider_id as referred_provider_id,
    pp.procedure_datetime as referral_date,
    e.encounter_id
  FROM phm_edw.encounter e
  JOIN phm_edw.procedure_performed pp ON e.patient_id = pp.patient_id
  JOIN phm_edw.procedure p ON pp.procedure_id = p.procedure_id
  JOIN measurement_period mp ON true
  WHERE 
    -- Eligible encounter during measurement period
    e.encounter_datetime BETWEEN mp.period_start AND mp.period_end
    AND e.active_ind = 'Y'
    -- Referral procedure (using CPT codes for referrals)
    AND p.procedure_code IN (
      '99241', -- Outpatient consultation codes
      '99242',
      '99243',
      '99244',
      '99245'
    )
    -- Referral must occur on or before October 31st
    AND pp.procedure_datetime <= mp.referral_cutoff
    AND pp.active_ind = 'Y'
),

-- Numerator: Receipt of specialist report
numerator AS (
  SELECT DISTINCT 
    i.patient_id
  FROM initial_population i
  JOIN phm_edw.observation o ON i.patient_id = o.patient_id
  WHERE 
    -- Consultation report received
    o.observation_code IN (
      '11488-4',   -- Consultation note
      '34839-1',   -- Referral note
      '68448-7'    -- Referral summary doc
    )
    -- Report must be received after referral
    AND o.observation_datetime > i.referral_date
    AND o.provider_id = i.referred_provider_id
    AND o.active_ind = 'Y'
)

-- Final measure calculation
SELECT 
  COUNT(DISTINCT n.patient_id)::FLOAT / 
  NULLIF(COUNT(DISTINCT i.patient_id), 0) * 100 as performance_rate,
  COUNT(DISTINCT i.patient_id) as initial_population,
  COUNT(DISTINCT i.patient_id) as denominator,
  COUNT(DISTINCT n.patient_id) as numerator
FROM initial_population i
LEFT JOIN numerator n ON i.patient_id = n.patient_id;

-- Detailed patient-level results
SELECT 
  p.patient_id,
  p.first_name,
  p.last_name,
  prov_ref.display_name as referring_provider,
  prov_spec.display_name as specialist,
  i.referral_date,
  CASE WHEN n.patient_id IS NOT NULL 
    THEN 'Yes' 
    ELSE 'No' 
  END as report_received
FROM initial_population i
JOIN phm_edw.patient p ON i.patient_id = p.patient_id
JOIN phm_edw.provider prov_ref ON i.referring_provider_id = prov_ref.provider_id
JOIN phm_edw.provider prov_spec ON i.referred_provider_id = prov_spec.provider_id
LEFT JOIN numerator n ON i.patient_id = n.patient_id
ORDER BY p.last_name, p.first_name;
