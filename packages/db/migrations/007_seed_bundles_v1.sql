-- =====================================================================
-- 007_seed_bundles_v1.sql
-- Phase 10.6: Seed 15 condition bundles, 106 measures, 16 overlap rules
-- from Medgnosis_CareGap_Bundles.xlsx
--
-- PATTERN: Each bundle is a self-contained block.
-- To add a new bundle: copy a block, change the values.
-- =====================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 1: Type 2 Diabetes Mellitus  (E11.x)  — 8 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('DM', 'Type 2 Diabetes Mellitus', 'E11%', 8,
  'CMS122v12, CMS131v12, CMS134v12, CMS165v12, CMS347v7',
  'Comprehensive diabetes management: glycemic control, kidney, eye, foot, cardiovascular risk, and self-management.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'DM';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('DM-01','HbA1c Testing','chronic','Order and document HbA1c result; assess glycemic control against patient-specific target','Y'),
    ('DM-02','HbA1c Poor Control Screening','chronic','Flag patients with most recent HbA1c > 9.0%; initiate medication adjustment or referral','Y'),
    ('DM-03','Dilated Retinal Eye Exam','chronic','Refer for or document completed dilated fundoscopic exam by ophthalmology/optometry','Y'),
    ('DM-04','Nephropathy Screening (uACR)','chronic','Order urine albumin-to-creatinine ratio to screen for diabetic nephropathy','Y'),
    ('DM-05','Blood Pressure Control (<140/90)','chronic','Measure and document BP; confirm most recent reading < 140/90 mmHg','Y'),
    ('DM-06','Statin Therapy Prescribed','chronic','Confirm active statin prescription for patients aged 40-75 with diabetes and LDL >= 70','Y'),
    ('DM-07','Foot Examination','chronic','Perform comprehensive foot exam including monofilament, pedal pulses, and skin inspection','Y'),
    ('DM-08','Diabetes Self-Management Education','chronic','Refer to or document completion of DSME/DSMS program; assess self-care behaviors','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('DM-01',1,'Every 6 months (minimum annually)','CMS122v12 / NQF 0059'),
    ('DM-02',2,'Annually','CMS122v12 / NQF 0059'),
    ('DM-03',3,'Annually','CMS131v12 / NQF 0055'),
    ('DM-04',4,'Annually','CMS134v12 / NQF 0062'),
    ('DM-05',5,'Every visit (assess annually)','CMS165v12 / NQF 0018'),
    ('DM-06',6,'Annually','CMS347v7 / NQF 0543'),
    ('DM-07',7,'Annually','ADA Standard of Care'),
    ('DM-08',8,'At diagnosis + annually','ADA Standard / HEDIS')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 2: Hypertension (HTN)  (I10–I16)  — 6 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('HTN', 'Hypertension', 'I10%,I11%,I12%,I13%,I14%,I15%,I16%', 6,
  'CMS165v12, CMS347v7, ACC/AHA Guideline',
  'Blood pressure management, medication review, metabolic monitoring, cardiovascular risk assessment, and lifestyle counseling.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'HTN';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('HTN-01','Blood Pressure Measurement','chronic','Measure and document seated BP using proper technique; confirm < 140/90 (or < 130/80 if high-risk)','Y'),
    ('HTN-02','Antihypertensive Medication Review','chronic','Review current antihypertensive regimen; assess adherence and side effects','Y'),
    ('HTN-03','Basic Metabolic Panel (BMP)','chronic','Order BMP to monitor renal function (creatinine/eGFR) and electrolytes for medication safety','Y'),
    ('HTN-04','Lipid Panel','chronic','Order fasting lipid panel; assess cardiovascular risk and statin eligibility','Y'),
    ('HTN-05','ASCVD Risk Assessment','chronic','Calculate 10-year ASCVD risk score using Pooled Cohort Equations','Y'),
    ('HTN-06','Lifestyle Counseling Documented','chronic','Document counseling on DASH diet, sodium restriction, physical activity, weight management, and alcohol moderation','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('HTN-01',1,'Every visit','CMS165v12 / NQF 0018'),
    ('HTN-02',2,'Every visit','CMS165v12'),
    ('HTN-03',3,'Annually (or per med change)','ACC/AHA Guideline'),
    ('HTN-04',4,'Annually','CMS347v7'),
    ('HTN-05',5,'Every 4-6 years (or annually if borderline)','ACC/AHA Guideline'),
    ('HTN-06',6,'Annually','ACC/AHA / CMS Quality')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 3: Coronary Artery Disease (CAD)  (I25.x)  — 8 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('CAD', 'Coronary Artery Disease', 'I25%', 8,
  'CMS164v12, CMS347v7, CMS144v12, CMS138v12',
  'Secondary prevention: antiplatelet therapy, statin, beta-blocker, ACE-I/ARB, BP control, lipids, smoking cessation, cardiac rehab.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'CAD';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('CAD-01','Antiplatelet/Anticoagulant Therapy','chronic','Confirm active prescription for aspirin or P2Y12 inhibitor (or anticoagulant if AF comorbid)','Y'),
    ('CAD-02','Statin Therapy (High-Intensity)','chronic','Confirm high-intensity statin prescribed; document LDL target achievement','Y'),
    ('CAD-03','Beta-Blocker Post-MI','chronic','For patients with prior MI: confirm beta-blocker prescription','Y'),
    ('CAD-04','ACE-I/ARB if EF Reduced','chronic','For patients with reduced EF (<=40%): confirm ACE inhibitor or ARB prescribed','Y'),
    ('CAD-05','Blood Pressure Control','chronic','Measure BP; target < 130/80 mmHg per ACC/AHA secondary prevention guidelines','Y'),
    ('CAD-06','Lipid Panel & LDL Assessment','chronic','Order fasting lipid panel; assess LDL reduction >=50% from baseline on high-intensity statin','Y'),
    ('CAD-07','Smoking Cessation Intervention','chronic','Screen tobacco use; provide cessation counseling and/or pharmacotherapy if active smoker','Y'),
    ('CAD-08','Cardiac Rehabilitation Referral','chronic','For qualifying events (MI, PCI, CABG): document referral to cardiac rehab program','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('CAD-01',1,'Annually','CMS164v12 / NQF 0068'),
    ('CAD-02',2,'Annually','CMS347v7 / NQF 0543'),
    ('CAD-03',3,'Annually (if applicable)','ACC/AHA Guideline'),
    ('CAD-04',4,'Annually','CMS144v12 / NQF 0081'),
    ('CAD-05',5,'Every visit','CMS165v12'),
    ('CAD-06',6,'Annually','ACC/AHA Guideline'),
    ('CAD-07',7,'Every visit','CMS138v12 / NQF 0028'),
    ('CAD-08',8,'Post-event','CMS Quality / ACC')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 4: Heart Failure (HF)  (I50.x)  — 7 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('HF', 'Heart Failure', 'I50%', 7,
  'CMS144v12, CMS145v12, ACC/AHA HF Guideline',
  'LVEF documentation, RAAS inhibitor, beta-blocker, daily weight education, symptom assessment, diuretic optimization, SGLT2i.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'HF';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('HF-01','LVEF Documentation','chronic','Document most recent left ventricular ejection fraction from echocardiogram','Y'),
    ('HF-02','ACEi/ARB/ARNI Prescribed (HFrEF)','chronic','Confirm RAAS inhibitor (ACEi, ARB, or sacubitril/valsartan) for EF <=40%','Y'),
    ('HF-03','Beta-Blocker Prescribed (HFrEF)','chronic','Confirm evidence-based beta-blocker (carvedilol, metoprolol succinate, or bisoprolol) for EF <=40%','Y'),
    ('HF-04','Daily Weight Monitoring Education','chronic','Document patient education on daily weights and fluid restriction; confirm monitoring plan','Y'),
    ('HF-05','Symptom & Functional Assessment','chronic','Document NYHA functional class; assess exercise tolerance and symptom burden','Y'),
    ('HF-06','Diuretic Dose Optimization','chronic','Review loop diuretic dosing relative to volume status; assess for signs of congestion or dehydration','Y'),
    ('HF-07','SGLT2 Inhibitor Consideration','chronic','For HFrEF and HFpEF: document consideration/prescription of SGLT2 inhibitor','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('HF-01',1,'At diagnosis + as clinically indicated','CMS144v12 / NQF 0081'),
    ('HF-02',2,'Annually','CMS144v12 / NQF 0081'),
    ('HF-03',3,'Annually','CMS145v12 / NQF 0083'),
    ('HF-04',4,'At diagnosis + annually','ACC/AHA HF Guideline'),
    ('HF-05',5,'Every visit','ACC/AHA HF Guideline'),
    ('HF-06',6,'Every visit','ACC/AHA HF Guideline'),
    ('HF-07',7,'Annually','ACC/AHA 2022 Update')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 5: COPD  (J44.x)  — 8 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('COPD', 'Chronic Obstructive Pulmonary Disease', 'J44%', 8,
  'GOLD Guideline, CMS127v12, CMS138v12',
  'Spirometry, inhaler technique, bronchodilator review, vaccinations, smoking cessation, exacerbation management, pulmonary rehab.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'COPD';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('COPD-01','Spirometry Documented','chronic','Confirm FEV1/FVC ratio < 0.70 with post-bronchodilator spirometry; document GOLD stage','Y'),
    ('COPD-02','Inhaler Technique Assessment','chronic','Observe and document proper inhaler/nebulizer technique; correct errors','Y'),
    ('COPD-03','Bronchodilator Therapy Review','chronic','Review short-acting and long-acting bronchodilator regimen (SABA, LAMA, LABA); step therapy per GOLD','Y'),
    ('COPD-04','Annual Influenza Vaccination','chronic','Administer or document influenza vaccine','Y'),
    ('COPD-05','Pneumococcal Vaccination','chronic','Administer or document pneumococcal vaccination per ACIP schedule (PCV20 or PCV15+PPSV23)','Y'),
    ('COPD-06','Smoking Cessation Intervention','chronic','Screen for tobacco use; provide counseling and/or pharmacotherapy (varenicline, NRT)','Y'),
    ('COPD-07','Exacerbation History & Action Plan','chronic','Document exacerbation frequency in past 12 months; provide written COPD action plan','Y'),
    ('COPD-08','Pulmonary Rehabilitation Referral','chronic','For GOLD stage B-D or post-exacerbation: refer to pulmonary rehabilitation','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('COPD-01',1,'At diagnosis + as indicated','CMS Quality / ATS'),
    ('COPD-02',2,'Every visit','GOLD Guideline'),
    ('COPD-03',3,'Every visit','GOLD Guideline'),
    ('COPD-04',4,'Annually (fall)','CMS127v12 / NQF 0041'),
    ('COPD-05',5,'Per ACIP schedule','CMS127v12 / ACIP'),
    ('COPD-06',6,'Every visit','CMS138v12 / NQF 0028'),
    ('COPD-07',7,'Annually','GOLD Guideline'),
    ('COPD-08',8,'As indicated','GOLD Guideline / CMS')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 6: Asthma  (J45.x)  — 7 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('ASTH', 'Asthma', 'J45%', 7,
  'NAEPP EPR-4, CMS138v12, CMS127v12',
  'Asthma control assessment, controller medications, action plan, inhaler technique, smoking, spirometry, vaccination.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'ASTH';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('ASTH-01','Asthma Control Assessment (ACT/ACQ)','chronic','Administer validated asthma control tool (ACT score >= 20 = well controlled)','Y'),
    ('ASTH-02','Controller Medication Review','chronic','Assess ICS adherence and step therapy; adjust controller per NAEPP stepwise approach','Y'),
    ('ASTH-03','Written Asthma Action Plan','chronic','Provide or update personalized asthma action plan (green/yellow/red zones)','Y'),
    ('ASTH-04','Inhaler Technique Assessment','chronic','Observe and correct MDI/DPI technique; document competency','Y'),
    ('ASTH-05','Tobacco Smoke Exposure Screening','chronic','Screen for active smoking and secondhand smoke exposure; counsel on avoidance','Y'),
    ('ASTH-06','Spirometry (Lung Function)','chronic','Perform or document spirometry to assess airflow obstruction and reversibility','Y'),
    ('ASTH-07','Influenza Vaccination','chronic','Administer or document annual influenza vaccine','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('ASTH-01',1,'Every visit','NAEPP EPR-4 / CMS'),
    ('ASTH-02',2,'Every visit','CMS Quality'),
    ('ASTH-03',3,'Annually','NAEPP EPR-4'),
    ('ASTH-04',4,'Every visit','NAEPP EPR-4'),
    ('ASTH-05',5,'Every visit','CMS138v12 / NAEPP'),
    ('ASTH-06',6,'At diagnosis + annually','NAEPP EPR-4'),
    ('ASTH-07',7,'Annually (fall)','CMS127v12 / ACIP')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 7: Chronic Kidney Disease (CKD)  (N18.x)  — 9 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('CKD', 'Chronic Kidney Disease', 'N18%', 9,
  'KDIGO Guideline, CMS134v12, CMS165v12',
  'eGFR, uACR, BP control, RAAS inhibitor, metabolic panel, anemia screening, nephrotoxin review, nephrology referral, SGLT2i.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'CKD';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('CKD-01','eGFR Measurement','chronic','Order serum creatinine and calculate eGFR (CKD-EPI); document CKD stage (G1-G5)','Y'),
    ('CKD-02','Urine Albumin-to-Creatinine Ratio','chronic','Order uACR to quantify proteinuria; classify albuminuria category (A1-A3)','Y'),
    ('CKD-03','Blood Pressure Control (<130/80)','chronic','Measure BP; target < 130/80 per KDIGO; preferentially use ACEi/ARB if albuminuria present','Y'),
    ('CKD-04','RAAS Inhibitor if Proteinuric','chronic','Confirm ACEi or ARB prescribed for patients with uACR >= 30 mg/g (category A2-A3)','Y'),
    ('CKD-05','Metabolic Panel (Ca/Phos/PTH/Bicarb)','chronic','Order calcium, phosphorus, PTH (stage 3b+), and serum bicarbonate to monitor CKD-MBD and acidosis','Y'),
    ('CKD-06','Anemia Screening (CBC + Iron Studies)','chronic','Order CBC and iron studies (ferritin, TSAT); initiate ESA or iron if Hgb < 10 and iron-deficient','Y'),
    ('CKD-07','Nephrotoxin Avoidance Review','chronic','Review medication list for nephrotoxins (NSAIDs, contrast, aminoglycosides); document avoidance counseling','Y'),
    ('CKD-08','Nephrology Referral (Stage 4+)','chronic','For eGFR < 30 or rapid decline (>5 mL/min/year): document nephrology referral and AV fistula planning','Y'),
    ('CKD-09','SGLT2 Inhibitor Consideration','chronic','For CKD with eGFR 20-75 and albuminuria: document consideration/prescription of SGLT2 inhibitor','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('CKD-01',1,'Every 6 months (quarterly if stage 4-5)','KDIGO Guideline'),
    ('CKD-02',2,'Annually (quarterly if A3)','CMS134v12 / KDIGO'),
    ('CKD-03',3,'Every visit','CMS165v12 / KDIGO'),
    ('CKD-04',4,'Annually','KDIGO Guideline'),
    ('CKD-05',5,'Every 6-12 months per stage','KDIGO Guideline'),
    ('CKD-06',6,'Annually (more often stage 4-5)','KDIGO Guideline'),
    ('CKD-07',7,'Every visit','KDIGO / Patient Safety'),
    ('CKD-08',8,'As indicated (stage 4-5)','KDIGO Guideline'),
    ('CKD-09',9,'Annually','KDIGO 2024 Update')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 8: Atrial Fibrillation (AFib)  (I48.x)  — 6 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('AFIB', 'Atrial Fibrillation', 'I48%', 6,
  'CMS164v12, ACC/AHA Guideline',
  'Stroke risk scoring, anticoagulation, INR monitoring, heart rate control, bleeding risk, renal function monitoring.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'AFIB';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('AFIB-01','CHA2DS2-VASc Score Calculation','chronic','Calculate and document CHA2DS2-VASc score to determine stroke risk and anticoagulation indication','Y'),
    ('AFIB-02','Oral Anticoagulation Prescribed','chronic','For CHA2DS2-VASc >= 2 (men) or >= 3 (women): confirm DOAC or warfarin prescribed','Y'),
    ('AFIB-03','INR Monitoring (if on Warfarin)','chronic','For warfarin patients: document TTR (time in therapeutic range 2.0-3.0); target TTR > 70%','Y'),
    ('AFIB-04','Heart Rate Control Assessment','chronic','Document resting heart rate; target < 110 bpm (lenient) or < 80 bpm (strict) per strategy','Y'),
    ('AFIB-05','Bleeding Risk Assessment (HAS-BLED)','chronic','Calculate and document HAS-BLED score; address modifiable bleeding risk factors','Y'),
    ('AFIB-06','Renal Function Monitoring','chronic','Order serum creatinine/eGFR to guide DOAC dosing; adjust dose per renal function thresholds','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('AFIB-01',1,'At diagnosis + annually','CMS Quality / ACC/AHA'),
    ('AFIB-02',2,'Annually','CMS164v12 / NQF 0068'),
    ('AFIB-03',3,'Monthly (or per protocol)','ACC/AHA Guideline'),
    ('AFIB-04',4,'Every visit','ACC/AHA Guideline'),
    ('AFIB-05',5,'Annually','ACC/AHA / ESC Guideline'),
    ('AFIB-06',6,'Every 6-12 months','DOAC Prescribing / CMS')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 9: Major Depressive Disorder (MDD)  (F32–F33)  — 7 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('MDD', 'Major Depressive Disorder', 'F32%,F33%', 7,
  'CMS159v12, CMS128v12, APA Guideline',
  'PHQ-9 screening, remission assessment, antidepressant management, suicide risk, functional status, psychotherapy.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'MDD';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('MDD-01','PHQ-9 Depression Screening','chronic','Administer PHQ-9; document score and severity category (mild/moderate/severe)','Y'),
    ('MDD-02','Remission Assessment at 12 Months','chronic','For new episodes: document PHQ-9 < 5 (remission) at 12-month follow-up','Y'),
    ('MDD-03','Antidepressant Medication Management (Acute)','chronic','For new prescriptions: confirm follow-up within 84 days of starting antidepressant','Y'),
    ('MDD-04','Antidepressant Continuation Phase','chronic','Document continuation of antidepressant for >= 180 days from initial prescription','Y'),
    ('MDD-05','Suicide Risk Assessment','chronic','Screen for suicidal ideation using validated tool (C-SSRS or PHQ-9 Item 9); document safety plan if positive','Y'),
    ('MDD-06','Functional Status Assessment','chronic','Document impact on work, relationships, and daily functioning; assess disability level','Y'),
    ('MDD-07','Psychotherapy Referral/Documentation','chronic','Document referral to or engagement in evidence-based psychotherapy (CBT, IPT)','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('MDD-01',1,'Every visit (minimum every 3 months)','CMS159v12 / NQF 0710'),
    ('MDD-02',2,'12 months from index','CMS159v12 / NQF 0710'),
    ('MDD-03',3,'84 days post-initiation','CMS128v12 / HEDIS AMM'),
    ('MDD-04',4,'180 days post-initiation','CMS128v12 / HEDIS AMM'),
    ('MDD-05',5,'Every visit','CMS Quality / Joint Commission'),
    ('MDD-06',6,'Every visit','APA Guideline'),
    ('MDD-07',7,'At diagnosis + ongoing','APA Guideline / HEDIS')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 10: Osteoporosis  (M80–M81)  — 6 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('OSTEO', 'Osteoporosis', 'M80%,M81%', 6,
  'CMS249v5, NOF, AACE Guideline',
  'DXA scan, FRAX assessment, pharmacotherapy, calcium/vitamin D, fall risk, post-fracture care.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'OSTEO';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('OSTEO-01','DXA Bone Density Scan','chronic','Order DXA scan of hip and lumbar spine; document T-score and diagnosis (osteopenia vs. osteoporosis)','Y'),
    ('OSTEO-02','FRAX Risk Assessment','chronic','Calculate 10-year fracture probability using FRAX; document major osteoporotic and hip fracture risk','Y'),
    ('OSTEO-03','Pharmacologic Treatment Prescribed','chronic','For T-score <= -2.5 or FRAX-indicated: confirm bisphosphonate, denosumab, or anabolic agent prescribed','Y'),
    ('OSTEO-04','Calcium & Vitamin D Assessment','chronic','Document dietary calcium intake and serum 25(OH)D level; supplement to target D > 30 ng/mL','Y'),
    ('OSTEO-05','Fall Risk Assessment','chronic','Screen for fall risk (Timed Up and Go, balance assessment); address modifiable risk factors','Y'),
    ('OSTEO-06','Post-Fracture Care Coordination','chronic','For patients with fragility fracture: confirm osteoporosis workup initiated and treatment started','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('OSTEO-01',1,'Every 2 years (or per risk)','CMS249v5 / NQF 0053'),
    ('OSTEO-02',2,'At diagnosis + every 2 years','NOF / AACE Guideline'),
    ('OSTEO-03',3,'Annually','CMS249v5 / NOF'),
    ('OSTEO-04',4,'Annually','NOF / Endocrine Society'),
    ('OSTEO-05',5,'Annually','CMS Quality / AGS'),
    ('OSTEO-06',6,'Within 6 months of fracture','CMS249v5 / FLS Model')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 11: Obesity  (E66.x)  — 6 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('OB', 'Obesity', 'E66%', 6,
  'CMS69v12, USPSTF, ACC/AHA Obesity Guideline',
  'BMI screening, follow-up plan, nutritional counseling, physical activity, comorbidity screening, pharmacotherapy review.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'OB';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('OB-01','BMI Screening & Documentation','chronic','Measure height and weight; calculate and document BMI; classify obesity severity (Class I-III)','Y'),
    ('OB-02','Follow-up Plan Documented','chronic','For BMI >= 25: document follow-up plan including dietary counseling, exercise, or referral','Y'),
    ('OB-03','Nutritional Counseling Referral','chronic','Refer to registered dietitian or intensive behavioral therapy (IBT) program','Y'),
    ('OB-04','Physical Activity Assessment','chronic','Document current physical activity level; counsel on 150 min/week moderate-intensity goal','Y'),
    ('OB-05','Comorbidity Screening Panel','chronic','Order screening labs: fasting glucose or HbA1c, lipid panel, liver function (NAFLD screening)','Y'),
    ('OB-06','Weight Management Pharmacotherapy Review','chronic','For BMI >= 30 (or >= 27 with comorbidity): discuss anti-obesity medication options (GLP-1 RA, etc.)','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('OB-01',1,'Every visit (minimum annually)','CMS69v12 / NQF 0421'),
    ('OB-02',2,'Annually','CMS69v12 / NQF 0421'),
    ('OB-03',3,'Annually','USPSTF Grade B / CMS'),
    ('OB-04',4,'Annually','ACC/AHA Obesity Guideline'),
    ('OB-05',5,'Annually','ACC/AHA / Endocrine Society'),
    ('OB-06',6,'Annually','Endocrine Society / AGA')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 12: Chronic Liver Disease / NAFLD-MASLD  (K76.0/K74.x)  — 7 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('CLD', 'Chronic Liver Disease / NAFLD-MASLD', 'K76%,K74%,K75%,K70%,K71%,K72%,K73%', 7,
  'AASLD Guideline, CMS349v6',
  'Liver function monitoring, fibrosis staging, hepatitis screening, HCC surveillance, alcohol screening, vaccination, hepatology referral.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'CLD';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('CLD-01','Liver Function Panel','chronic','Order comprehensive metabolic panel including AST, ALT, alkaline phosphatase, bilirubin, albumin','Y'),
    ('CLD-02','Fibrosis Assessment (FIB-4 / Elastography)','chronic','Calculate FIB-4 index or order transient elastography (FibroScan) to stage fibrosis','Y'),
    ('CLD-03','Hepatitis B/C Screening','chronic','Screen for HBV (HBsAg, anti-HBs, anti-HBc) and HCV (anti-HCV) per USPSTF/AASLD','Y'),
    ('CLD-04','HCC Surveillance (if cirrhotic)','chronic','For cirrhosis: order liver ultrasound +/- AFP every 6 months for hepatocellular carcinoma screening','Y'),
    ('CLD-05','Alcohol Use Screening (AUDIT-C)','chronic','Administer AUDIT-C; document score and counseling if positive','Y'),
    ('CLD-06','Hepatitis A/B Vaccination','chronic','Administer or document hepatitis A and B vaccination series if non-immune','Y'),
    ('CLD-07','Hepatology/GI Referral','chronic','For advanced fibrosis (F3-F4) or decompensated liver disease: document specialist referral','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('CLD-01',1,'Every 6-12 months','AASLD Guideline'),
    ('CLD-02',2,'At diagnosis + annually','AASLD Guideline'),
    ('CLD-03',3,'One-time (repeat per risk)','CMS349v6 / USPSTF'),
    ('CLD-04',4,'Every 6 months (if cirrhotic)','AASLD HCC Guideline'),
    ('CLD-05',5,'Annually','AASLD / USPSTF'),
    ('CLD-06',6,'Per vaccination schedule','AASLD / ACIP'),
    ('CLD-07',7,'As indicated','AASLD Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 13: Rheumatoid Arthritis (RA)  (M05–M06)  — 8 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('RA', 'Rheumatoid Arthritis', 'M05%,M06%', 8,
  'ACR Guideline, ACC/AHA',
  'Disease activity monitoring, DMARD therapy, cardiovascular risk, bone density, TB screening, vaccination, hepatitis screening, functional assessment.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'RA';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('RA-01','Disease Activity Assessment (DAS28/CDAI)','chronic','Administer validated disease activity score; document and track longitudinally','Y'),
    ('RA-02','DMARD Therapy Prescribed','chronic','Confirm conventional or biologic DMARD prescribed per ACR treat-to-target guidelines','Y'),
    ('RA-03','Cardiovascular Risk Assessment','chronic','Calculate ASCVD risk with 1.5x RA multiplier; manage lipids and BP accordingly','Y'),
    ('RA-04','Bone Density Screening (if on glucocorticoids)','chronic','For patients on chronic glucocorticoids: order DXA and assess fracture risk','Y'),
    ('RA-05','TB Screening (pre-biologic)','chronic','Before initiating biologic therapy: document TB screening (TST or IGRA)','Y'),
    ('RA-06','Vaccination Review (pre-biologic)','chronic','Before biologics: update pneumococcal, influenza, hepatitis B, and shingles vaccines','Y'),
    ('RA-07','Hepatitis B/C Screening (pre-biologic)','chronic','Before immunosuppressive therapy: screen for HBV and HCV','Y'),
    ('RA-08','Functional Status Assessment (HAQ-DI)','chronic','Administer Health Assessment Questionnaire; document functional disability level','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('RA-01',1,'Every visit','ACR Guideline'),
    ('RA-02',2,'Annually','ACR Guideline'),
    ('RA-03',3,'Every 5 years (or annually if high-risk)','ACC/AHA'),
    ('RA-04',4,'At glucocorticoid initiation + every 2 years','ACR Osteoporosis Guideline'),
    ('RA-05',5,'Before biologic initiation','ACR'),
    ('RA-06',6,'Before biologic initiation','ACR / ACIP'),
    ('RA-07',7,'Before biologic initiation','ACR'),
    ('RA-08',8,'Every visit','ACR Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 14: Peripheral Artery Disease (PAD)  (I73.9/I70.2x)  — 7 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('PAD', 'Peripheral Artery Disease', 'I73%,I70%', 7,
  'ACC/AHA PAD Guideline, CMS164v12, CMS347v7',
  'ABI testing, antiplatelet, statin, BP control, smoking cessation, exercise therapy, vascular referral.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'PAD';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('PAD-01','Ankle-Brachial Index (ABI) Testing','chronic','Perform or document ABI; diagnose and classify PAD severity','Y'),
    ('PAD-02','Antiplatelet Therapy Prescribed','chronic','Confirm aspirin or clopidogrel prescribed for symptomatic PAD','Y'),
    ('PAD-03','Statin Therapy (High-Intensity)','chronic','Confirm high-intensity statin prescribed for ASCVD risk reduction','Y'),
    ('PAD-04','Blood Pressure Control','chronic','Measure BP; target < 130/80 per ACC/AHA PAD guidelines','Y'),
    ('PAD-05','Smoking Cessation Intervention','chronic','Screen for tobacco use; provide cessation counseling and/or pharmacotherapy','Y'),
    ('PAD-06','Supervised Exercise Therapy Referral','chronic','Refer to supervised exercise program (walking therapy) for claudication management','Y'),
    ('PAD-07','Vascular Surgery Referral (if severe)','chronic','For critical limb ischemia or lifestyle-limiting claudication: document vascular surgery referral','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('PAD-01',1,'At diagnosis + as indicated','ACC/AHA PAD Guideline'),
    ('PAD-02',2,'Annually','CMS164v12 / NQF 0068'),
    ('PAD-03',3,'Annually','CMS347v7 / NQF 0543'),
    ('PAD-04',4,'Every visit','CMS165v12'),
    ('PAD-05',5,'Every visit','CMS138v12 / NQF 0028'),
    ('PAD-06',6,'At diagnosis','ACC/AHA PAD Guideline'),
    ('PAD-07',7,'As indicated','ACC/AHA PAD Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- BUNDLE 15: Hypothyroidism  (E03.x)  — 6 measures
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('HYPO', 'Hypothyroidism', 'E03%', 6,
  'ATA Guideline',
  'TSH monitoring, dose titration, symptom assessment, lipid panel, bone density consideration, pregnancy screening.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'HYPO';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('HYPO-01','TSH Monitoring','chronic','Order TSH level; confirm within target range (0.4-4.0 mIU/L or patient-specific goal)','Y'),
    ('HYPO-02','Levothyroxine Dose Optimization','chronic','Review levothyroxine dose relative to TSH; adjust if outside target range','Y'),
    ('HYPO-03','Symptom Assessment','chronic','Document hypothyroid symptom status (fatigue, weight, cold intolerance, cognition)','Y'),
    ('HYPO-04','Lipid Panel','chronic','Order fasting lipid panel; hypothyroidism can elevate LDL cholesterol','Y'),
    ('HYPO-05','Bone Density Consideration','chronic','For patients on suppressive doses or postmenopausal women: consider DXA screening','Y'),
    ('HYPO-06','Pregnancy/Fertility Screening','chronic','For women of childbearing age: document TSH target < 2.5 mIU/L if planning pregnancy','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('HYPO-01',1,'Every 6-12 months (6-8 weeks after dose change)','ATA Guideline'),
    ('HYPO-02',2,'At each TSH check','ATA Guideline'),
    ('HYPO-03',3,'Every visit','ATA Guideline'),
    ('HYPO-04',4,'Annually','ATA'),
    ('HYPO-05',5,'Per risk assessment','ATA / Endocrine Society'),
    ('HYPO-06',6,'Annually (reproductive age)','ATA Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- OVERLAP RULES (16 deduplication rules from Sheet 4)
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.bundle_overlap_rule (rule_code, shared_domain, applicable_bundles, canonical_measure_code, dedup_rule)
VALUES
  ('OVERLAP-BP', 'Blood Pressure Control', 'DM,HTN,CAD,HF,CKD,AFIB,PAD', 'HTN-01',
   'Single BP reading satisfies all conditions; use strictest target (CKD/CAD: <130/80)'),
  ('OVERLAP-STATIN', 'Statin Therapy', 'DM,HTN,CAD,PAD,RA', 'CAD-02',
   'One active statin prescription satisfies all; use highest indicated intensity (CAD/PAD: high-intensity)'),
  ('OVERLAP-SMOKING', 'Smoking Cessation', 'COPD,ASTH,CAD,PAD,HTN', 'COPD-06',
   'One tobacco screening + intervention per visit covers all conditions'),
  ('OVERLAP-ANTIPLATELET', 'Antiplatelet Therapy', 'CAD,PAD', 'CAD-01',
   'Single antiplatelet order satisfies both; if AFib present, anticoagulant replaces antiplatelet'),
  ('OVERLAP-RAAS', 'ACEi/ARB/ARNI Therapy', 'HF,CKD,DM,HTN', 'HF-02',
   'One RAAS inhibitor prescription covers all; prioritize ARNI for HFrEF'),
  ('OVERLAP-SGLT2', 'SGLT2 Inhibitor', 'DM,HF,CKD', 'CKD-09',
   'One SGLT2i prescription satisfies all three indications simultaneously'),
  ('OVERLAP-UACR', 'Nephropathy Screening (uACR)', 'DM,CKD', 'CKD-02',
   'One uACR order satisfies both DM-04 and CKD-02; use CKD frequency (quarterly if A3)'),
  ('OVERLAP-EGFR', 'eGFR / Renal Function', 'CKD,DM,HTN,AFIB', 'CKD-01',
   'One BMP satisfies all; use most frequent interval (quarterly for CKD stage 3b+)'),
  ('OVERLAP-LIPIDS', 'Lipid Panel', 'HTN,CAD,DM,PAD,HYPO,RA', 'HTN-04',
   'One annual lipid panel satisfies all conditions'),
  ('OVERLAP-FLU', 'Influenza Vaccination', 'COPD,ASTH,DM,CKD,HF', 'COPD-04',
   'One annual flu vaccine satisfies all conditions'),
  ('OVERLAP-PNEUMO', 'Pneumococcal Vaccination', 'COPD,ASTH,CKD,DM', 'COPD-05',
   'One vaccination series per ACIP schedule covers all conditions'),
  ('OVERLAP-DXA', 'Bone Density (DXA)', 'OSTEO,RA,CKD', 'OSTEO-01',
   'One DXA scan satisfies all; shortest indicated interval applies'),
  ('OVERLAP-FALLS', 'Fall Risk Assessment', 'OSTEO,PAD,MDD', 'OSTEO-05',
   'One annual fall risk screening covers all conditions'),
  ('OVERLAP-HEPBC', 'Hepatitis B/C Screening', 'CLD,RA,CKD', 'CLD-03',
   'One-time screening satisfies all; repeat only per risk-factor triggers'),
  ('OVERLAP-ASCVD', 'ASCVD Risk Score', 'HTN,DM,CAD,RA', 'HTN-05',
   'One ASCVD calculation covers all; apply RA 1.5x multiplier if applicable'),
  ('OVERLAP-PHQ9', 'PHQ-9 Screening', 'MDD,DM,HF', 'MDD-01',
   'One PHQ-9 per visit satisfies all; document in all relevant problem lists')
ON CONFLICT (rule_code) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════
-- UPDATE bundle_size counts from actual linked measures
-- ═══════════════════════════════════════════════════════════════════════
UPDATE phm_edw.condition_bundle cb
SET bundle_size = (
  SELECT COUNT(*)
  FROM phm_edw.bundle_measure bm
  WHERE bm.bundle_id = cb.bundle_id AND bm.active_ind = 'Y'
),
updated_date = NOW();
