-- =====================================================================
-- 008_seed_bundles_v2.sql
-- Phase 10.6b: Seed bundles 16-30 (15 conditions, ~118 measures)
-- from Medgnosis_CareGap_Bundles_16-30.xlsx
-- =====================================================================


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 16: Alzheimer's Disease & Related Dementias  (G30.x / F02.x)  — 9 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('ALZ', 'Alzheimer''s Disease & Related Dementias', 'G30%,F02%', 9,
  'CMS149v12, APA, AGS Beers Criteria, CMS Quality...',
  'Cognitive assessment, dementia care plan, ADL/IADL, behavioral symptoms, medication safety, caregiver support, advance care planning, fall risk, depression screening.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'ALZ';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('ALZ-01','Cognitive Assessment (Standardized)','chronic','Administer and document standardized cognitive tool (MMSE, MoCA, or SLUMS); track score longitudinally','Y'),
    ('ALZ-02','Dementia Care Plan Created','chronic','Establish and document a person-centered care plan addressing cognition, function, behavioral symptoms, caregiver needs, and safety','Y'),
    ('ALZ-03','Functional Status Assessment (ADL/IADL)','chronic','Document activities of daily living and instrumental ADL status using validated scale (Katz ADL, Lawton IADL)','Y'),
    ('ALZ-04','Behavioral & Psychological Symptom Review','chronic','Screen for agitation, depression, psychosis, sleep disturbance, and wandering; document non-pharmacologic interventions first','Y'),
    ('ALZ-05','Medication Safety Review','chronic','Review all medications for anticholinergic burden, sedatives, and potentially inappropriate medications (Beers Criteria); deprescribe as appropriate','Y'),
    ('ALZ-06','Caregiver Assessment & Support','chronic','Screen primary caregiver for burden and depression (Zarit Burden Interview or PHQ-2); document referral to support services','Y'),
    ('ALZ-07','Advance Care Planning Documented','chronic','Document goals of care discussion, advance directives, healthcare proxy designation, and POLST/MOLST if appropriate','Y'),
    ('ALZ-08','Fall Risk & Safety Assessment','chronic','Evaluate fall risk, driving safety, home environment hazards, and wandering risk; document safety plan','Y'),
    ('ALZ-09','Depression Screening (PHQ-9)','chronic','Screen for comorbid depression which is highly prevalent in dementia; distinguish from apathy','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('ALZ-01',1,'Annually (every 6 months if declining)','CMS149v12 / NQF 0553'),
    ('ALZ-02',2,'At diagnosis + annually','CMS149v12 / NQF 0553'),
    ('ALZ-03',3,'Every 6 months','CMS149v12 / Alzheimer''s Assn'),
    ('ALZ-04',4,'Every visit','APA / AGS Guideline'),
    ('ALZ-05',5,'Every 6 months','AGS Beers Criteria / CMS'),
    ('ALZ-06',6,'Annually','CMS149v12 / NIA'),
    ('ALZ-07',7,'At diagnosis + annually','CMS Quality / ACP'),
    ('ALZ-08',8,'Every 6 months','AGS / Alzheimer''s Assn'),
    ('ALZ-09',9,'Annually','CMS159v12 / APA')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 17: Stroke / Cerebrovascular Disease (Secondary Prevention)  (I63.x / I67.x)  — 8 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('STR', 'Stroke / Cerebrovascular Disease (Secondary Prevention)', 'I63%,I67%', 8,
  'CMS164v12, CMS347v7, CMS165v12, CMS122v12...',
  'Secondary prevention: antithrombotic therapy, statin, BP control, LDL assessment, carotid imaging, rehabilitation, depression screening, dysphagia screening.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'STR';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('STR-01','Antiplatelet or Anticoagulant Therapy','chronic','Confirm aspirin, clopidogrel, or aspirin/dipyridamole for ischemic stroke; anticoagulant if cardioembolic (AFib)','Y'),
    ('STR-02','High-Intensity Statin Therapy','chronic','Confirm high-intensity statin prescribed for atherosclerotic ischemic stroke/TIA','Y'),
    ('STR-03','Blood Pressure Control (<130/80)','chronic','Measure and document BP; target <130/80 for secondary stroke prevention','Y'),
    ('STR-04','HbA1c / Glucose Management (if Diabetic)','chronic','For patients with comorbid DM: ensure HbA1c monitoring and glycemic control','Y'),
    ('STR-05','Smoking Cessation Intervention','chronic','Screen tobacco use; provide cessation counseling and pharmacotherapy','Y'),
    ('STR-06','Carotid Imaging (if Anterior Circulation)','chronic','For anterior circulation stroke: document carotid duplex ultrasound or CTA; refer for CEA/CAS if >70% stenosis','Y'),
    ('STR-07','Functional & Disability Assessment','chronic','Document modified Rankin Scale (mRS) score; assess need for rehabilitation services (PT, OT, Speech)','Y'),
    ('STR-08','Post-Stroke Depression Screening','chronic','Screen for depression using PHQ-9; post-stroke depression affects 30–50% of survivors','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('STR-01',1,'Annually','CMS164v12 / AHA/ASA'),
    ('STR-02',2,'Annually','CMS347v7 / AHA/ASA'),
    ('STR-03',3,'Every visit','CMS165v12 / AHA/ASA'),
    ('STR-04',4,'Every 6 months','CMS122v12 / AHA/ASA'),
    ('STR-05',5,'Every visit','CMS138v12 / AHA/ASA'),
    ('STR-06',6,'At event + per indication','AHA/ASA Guideline'),
    ('STR-07',7,'Every visit (first year)','AHA/ASA Guideline'),
    ('STR-08',8,'Every visit (first year), then annually','AHA/ASA / CMS159v12')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 18: Chronic Pain & Opioid Use Management  (G89.x / F11.x)  — 9 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('PAIN', 'Chronic Pain & Opioid Use Management', 'G89%,F11%', 9,
  'CDC Opioid Guideline 2022, CDC Opioid Guideline, CDC Guideline',
  'Multimodal pain assessment, opioid risk stratification, PDMP check, naloxone co-prescribing, non-opioid alternatives, functional assessment, behavioral health screening, urine drug testing, opioid taper assessment.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'PAIN';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('PAIN-01','Pain Functional Assessment (PEG Scale)','chronic','Document pain intensity and functional interference using PEG (Pain, Enjoyment, General Activity) or similar validated tool','Y'),
    ('PAIN-02','Opioid Risk Stratification (ORT)','chronic','For patients on or being considered for opioids: complete Opioid Risk Tool or DIRE score; document risk category','Y'),
    ('PAIN-03','Prescription Drug Monitoring Program (PDMP) Check','chronic','Query state PDMP before prescribing opioids and at minimum every 3 months during chronic therapy','Y'),
    ('PAIN-04','Urine Drug Screening','chronic','Order urine drug screen to confirm adherence and detect undisclosed substances; document results','Y'),
    ('PAIN-05','Opioid Treatment Agreement','chronic','Document signed controlled substance agreement outlining expectations, monitoring, and tapering conditions','Y'),
    ('PAIN-06','Naloxone Co-Prescribing','chronic','Prescribe naloxone for patients on ≥50 MME/day or with concurrent benzodiazepine use or substance use history','Y'),
    ('PAIN-07','Non-Opioid & Multimodal Therapy Review','chronic','Document consideration/use of non-opioid therapies: NSAIDs, duloxetine, gabapentinoids, PT, CBT, acupuncture, interventional procedures','Y'),
    ('PAIN-08','MME Dose Assessment & Tapering Plan','chronic','Calculate total daily MME; document tapering plan if ≥90 MME/day or if risks outweigh benefits','Y'),
    ('PAIN-09','Behavioral Health Screening','chronic','Screen for comorbid depression, anxiety, PTSD, and substance use disorder; refer for co-management','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('PAIN-01',1,'Every visit','CDC Opioid Guideline 2022'),
    ('PAIN-02',2,'At initiation + annually','CDC Opioid Guideline'),
    ('PAIN-03',3,'Every 3 months (minimum)','CDC Guideline / State Law'),
    ('PAIN-04',4,'At initiation + at least annually','CDC Opioid Guideline'),
    ('PAIN-05',5,'At initiation + annually','CDC Guideline / CMS'),
    ('PAIN-06',6,'At initiation + annually','CDC Guideline / CMS Quality'),
    ('PAIN-07',7,'Every visit','CDC Guideline / AHRQ'),
    ('PAIN-08',8,'Every visit','CDC Opioid Guideline 2022'),
    ('PAIN-09',9,'Annually','CDC Guideline / CMS159v12')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 19: Osteoarthritis (OA)  (M15–M19)  — 7 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('OA', 'Osteoarthritis (OA)', 'M15%,M16%,M17%,M18%,M19%', 7,
  'ACR, ACR Guideline, AAOS, AAOS Appropriateness Criteria',
  'Joint assessment, weight management, physical therapy referral, pharmacotherapy review, surgical candidacy, fall risk, radiographic staging.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'OA';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('OA-01','Pain & Functional Assessment','chronic','Document pain severity (NRS 0–10) and functional status using validated tool (WOMAC, KOOS, or HOOS)','Y'),
    ('OA-02','Weight Management Counseling','chronic','For BMI ≥25: document weight loss counseling; 5–10% weight loss reduces knee load by 20–40%','Y'),
    ('OA-03','Exercise & Physical Therapy Prescription','chronic','Prescribe structured exercise program (low-impact aerobic + strengthening); refer to PT for supervised program','Y'),
    ('OA-04','Pharmacotherapy Optimization','chronic','Review analgesic regimen: topical NSAIDs first-line for knee, oral NSAIDs with GI/CV risk assessment, avoid chronic opioids','Y'),
    ('OA-05','GI & CV Risk Assessment (if on NSAIDs)','chronic','For patients on oral NSAIDs: assess GI bleeding risk (H. pylori, PPI co-therapy) and cardiovascular risk','Y'),
    ('OA-06','Radiographic Staging (if Progression)','chronic','Document KL grade or joint space assessment when symptoms change or surgical evaluation is considered','Y'),
    ('OA-07','Surgical Referral Assessment','chronic','For refractory symptoms with structural damage: document discussion of TKA/THA referral; use appropriateness criteria','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('OA-01',1,'Every visit','ACR / AAOS Guideline'),
    ('OA-02',2,'Annually','ACR Guideline / CMS69v12'),
    ('OA-03',3,'Annually','ACR / OARSI Guideline'),
    ('OA-04',4,'Every visit','ACR / OARSI Guideline'),
    ('OA-05',5,'Annually','ACR / AGA Guideline'),
    ('OA-06',6,'As clinically indicated','AAOS / ACR'),
    ('OA-07',7,'As indicated','AAOS Appropriateness Criteria')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 20: Gastroesophageal Reflux Disease (GERD)  (K21.x)  — 7 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('GERD', 'Gastroesophageal Reflux Disease (GERD)', 'K21%', 7,
  'ACG Guideline, ACG, AGA, ACG Barrett''s Guideline',
  'Symptom assessment, PPI step-down, alarm symptom screening, H. pylori testing, lifestyle counseling, Barrett esophagus surveillance, bone health monitoring.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'GERD';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('GERD-01','Symptom Severity Assessment (GerdQ)','chronic','Administer GerdQ or equivalent; document frequency and severity of heartburn, regurgitation, and alarm symptoms','Y'),
    ('GERD-02','PPI Step-Down / Deprescribing Review','chronic','For patients on chronic PPI >8 weeks: attempt step-down to lowest effective dose or H2RA; document rationale if continuing','Y'),
    ('GERD-03','Alarm Symptom Screening','chronic','Screen for dysphagia, odynophagia, unintentional weight loss, GI bleeding, and anemia; refer for EGD if present','Y'),
    ('GERD-04','H. pylori Testing (if Indicated)','chronic','Test for H. pylori in patients with uninvestigated dyspepsia or before long-term PPI use; treat if positive','Y'),
    ('GERD-05','Lifestyle Modification Counseling','chronic','Document counseling on weight loss, head-of-bed elevation, meal timing (no eating 3h before bed), trigger food avoidance','Y'),
    ('GERD-06','Long-Term PPI Adverse Effect Monitoring','chronic','For chronic PPI users: monitor magnesium (annually), bone density (per risk), vitamin B12, and C. difficile awareness','Y'),
    ('GERD-07','Barrett''s Esophagus Surveillance (if Applicable)','chronic','For confirmed Barrett''s: follow ACG surveillance intervals based on dysplasia status; document last EGD date','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('GERD-01',1,'Every visit','ACG Guideline'),
    ('GERD-02',2,'Every 6–12 months','ACG / AGA Guideline'),
    ('GERD-03',3,'Every visit','ACG Guideline'),
    ('GERD-04',4,'Once (or per indication)','ACG / AGA Guideline'),
    ('GERD-05',5,'Annually','ACG Guideline'),
    ('GERD-06',6,'Annually','AGA / FDA Safety Communication'),
    ('GERD-07',7,'Per ACG protocol (1–3 years)','ACG Barrett''s Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 21: Benign Prostatic Hyperplasia (BPH)  (N40.x)  — 6 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('BPH', 'Benign Prostatic Hyperplasia (BPH)', 'N40%', 6,
  'AUA Guideline, AUA',
  'IPSS symptom scoring, medication management, PSA monitoring, renal function, post-void residual, urological referral.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'BPH';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('BPH-01','IPSS / AUA Symptom Score','chronic','Administer International Prostate Symptom Score; classify mild (0–7), moderate (8–19), severe (20–35)','Y'),
    ('BPH-02','PSA & Digital Rectal Exam','chronic','Document PSA level and DRE findings; use for prostate cancer risk stratification (not BPH diagnosis alone)','Y'),
    ('BPH-03','Medication Review (Alpha-Blocker / 5-ARI)','chronic','Review BPH pharmacotherapy: alpha-blocker efficacy, 5-ARI for prostate >30g, combination therapy assessment','Y'),
    ('BPH-04','Post-Void Residual Assessment','chronic','Measure PVR by bladder scan or catheterization; PVR >200 mL suggests significant obstruction','Y'),
    ('BPH-05','Renal Function Monitoring','chronic','Order BMP/creatinine to screen for obstructive nephropathy, especially with high PVR or hydronephrosis history','Y'),
    ('BPH-06','Surgical Referral Assessment','chronic','For refractory LUTS, recurrent UTI, retention, or renal insufficiency: document urology referral for TURP/laser evaluation','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('BPH-01',1,'Every 6–12 months','AUA Guideline'),
    ('BPH-02',2,'Annually (shared decision)','AUA / USPSTF'),
    ('BPH-03',3,'Every 6 months','AUA Guideline'),
    ('BPH-04',4,'Annually (or if worsening)','AUA Guideline'),
    ('BPH-05',5,'Annually','AUA Guideline'),
    ('BPH-06',6,'As indicated','AUA Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 22: Chronic Migraine  (G43.7x)  — 7 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('MIG', 'Chronic Migraine', 'G43.7%', 7,
  'AHS, AHS Consensus, AAN Guideline, AHS Guideline...',
  'Headache frequency tracking, acute medication optimization, preventive therapy, medication overuse assessment, comorbid mood screening, trigger identification, neuroimaging appropriateness.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'MIG';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('MIG-01','Headache Frequency & Disability Assessment','chronic','Document monthly headache days and administer MIDAS or HIT-6 disability scale; track longitudinally','Y'),
    ('MIG-02','Acute Medication Use Tracking','chronic','Document monthly acute medication days; screen for medication overuse headache (≥10 triptan or ≥15 simple analgesic days/month)','Y'),
    ('MIG-03','Preventive Therapy Review','chronic','Review preventive medication (topiramate, amitriptyline, propranolol, valproate) or CGRP mAb; assess efficacy and tolerability','Y'),
    ('MIG-04','CGRP Therapy Assessment','chronic','For ≥4 monthly headache days with failed ≥2 traditional preventives: document CGRP inhibitor trial or rationale for/against','Y'),
    ('MIG-05','Comorbid Depression/Anxiety Screening','chronic','Screen for comorbid mood disorders (PHQ-9, GAD-7); migraine and depression have bidirectional relationship','Y'),
    ('MIG-06','Lifestyle & Trigger Management','chronic','Document counseling on sleep hygiene, hydration, regular meals, exercise, stress management, and identified triggers','Y'),
    ('MIG-07','Neuroimaging Review (if Red Flags)','chronic','Document that neuroimaging is not routinely needed; order MRI brain if atypical features, new neurological signs, or thunderclap onset','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('MIG-01',1,'Every visit (minimum quarterly)','AHS / AAN Guideline'),
    ('MIG-02',2,'Every visit','AHS / AAN Guideline'),
    ('MIG-03',3,'Every 3 months','AHS / AAN Guideline'),
    ('MIG-04',4,'Annually','AHS Consensus / Payer Criteria'),
    ('MIG-05',5,'Annually','AAN Guideline / CMS159v12'),
    ('MIG-06',6,'Annually','AHS Guideline'),
    ('MIG-07',7,'As indicated','AAN Choosing Wisely')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 23: Epilepsy / Seizure Disorder  (G40.x)  — 8 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('EPI', 'Epilepsy / Seizure Disorder', 'G40%', 8,
  'AAN, AAN Guideline, AAN Practice Guideline',
  'Seizure frequency documentation, ASM optimization, drug level monitoring, bone health screening, women health counseling, depression screening, driving/safety counseling, seizure action plan.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'EPI';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('EPI-01','Seizure Frequency Documentation','chronic','Document seizure type(s), frequency, and date of last seizure; classify per ILAE 2017 criteria','Y'),
    ('EPI-02','Antiseizure Medication (ASM) Review','chronic','Review ASM regimen: efficacy, adherence, serum drug levels (if applicable), and drug interactions','Y'),
    ('EPI-03','ASM Drug Level Monitoring','chronic','For narrow therapeutic index ASMs (phenytoin, carbamazepine, valproate, phenobarbital): order serum trough levels','Y'),
    ('EPI-04','Hepatic & Hematologic Safety Labs','chronic','Order CBC and hepatic panel for ASMs with hematologic or hepatotoxic risk (valproate, carbamazepine, felbamate)','Y'),
    ('EPI-05','Women of Childbearing Age: Contraception & Folate','chronic','Document contraceptive counseling (enzyme-inducing ASMs reduce OC efficacy); prescribe high-dose folic acid (1–4 mg/day)','Y'),
    ('EPI-06','Bone Health Assessment','chronic','For chronic enzyme-inducing ASMs: assess vitamin D (25-OH-D), calcium, and DXA if risk factors present','Y'),
    ('EPI-07','Driving & Safety Counseling','chronic','Document state-specific driving restriction counseling; review seizure-free interval requirements; assess workplace and water safety','Y'),
    ('EPI-08','SUDEP Risk Counseling','chronic','For patients with uncontrolled seizures: document Sudden Unexpected Death in Epilepsy (SUDEP) risk discussion','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('EPI-01',1,'Every visit','AAN / ILAE Guideline'),
    ('EPI-02',2,'Every visit','AAN Guideline'),
    ('EPI-03',3,'Every 6–12 months (or per dose change)','AAN Guideline'),
    ('EPI-04',4,'Every 6–12 months','AAN / FDA Label'),
    ('EPI-05',5,'Annually','AAN / ACOG Guideline'),
    ('EPI-06',6,'Every 1–2 years','AAN Guideline / Endocrine'),
    ('EPI-07',7,'At diagnosis + annually','AAN / State Law'),
    ('EPI-08',8,'Annually','AAN Practice Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 24: HIV / AIDS (Chronic Management)  (B20 / Z21)  — 10 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('HIV', 'HIV / AIDS (Chronic Management)', 'B20%,Z21%', 10,
  'DHHS, DHHS Guideline, CDC STI Guidelines, CDC',
  'CD4 and viral load monitoring, ART adherence, resistance testing, STI screening, cervical/anal cancer screening, bone density, renal function, lipid panel, immunizations, mental health screening.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'HIV';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('HIV-01','Viral Load Monitoring','chronic','Order HIV-1 RNA viral load; confirm sustained virologic suppression (<200 copies/mL = undetectable)','Y'),
    ('HIV-02','CD4 Count Monitoring','chronic','Order CD4 cell count and percentage; can extend to annually if VL suppressed and CD4 >500 for >2 years','Y'),
    ('HIV-03','ART Adherence Assessment','chronic','Assess antiretroviral therapy adherence using validated tool; address barriers (cost, side effects, pill burden)','Y'),
    ('HIV-04','ART Resistance & Regimen Review','chronic','Review current ART regimen for drug interactions, tolerability, and resistance history; consider simplification if suppressed','Y'),
    ('HIV-05','STI Screening Panel','chronic','Screen for syphilis (RPR), gonorrhea/chlamydia (NAAT), and HCV (anti-HCV) per risk behavior','Y'),
    ('HIV-06','Cervical/Anal Cancer Screening','chronic','Women: cervical cytology per ASCCP guidelines. MSM/high-risk: consider anal cytology/HRA for HSIL','Y'),
    ('HIV-07','Metabolic Comorbidity Panel','chronic','Order fasting lipid panel, glucose/HbA1c, and assess ASCVD risk; ART-associated metabolic effects common','Y'),
    ('HIV-08','Renal & Hepatic Function Monitoring','chronic','Order BMP (eGFR) and hepatic panel; especially important for tenofovir (renal) and PI-based regimens (hepatic)','Y'),
    ('HIV-09','Bone Density Assessment','chronic','For patients >50 or with fracture risk factors: order DXA; tenofovir disoproxil associated with BMD loss','Y'),
    ('HIV-10','Immunization Status Review','chronic','Confirm age-appropriate vaccines: influenza, pneumococcal (PCV20), hepatitis A/B, HPV, COVID-19, Td/Tdap; live vaccines per CD4','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('HIV-01',1,'Every 3–6 months (every 6 months if stable)','DHHS / IAS-USA Guideline'),
    ('HIV-02',2,'Every 6–12 months','DHHS Guideline'),
    ('HIV-03',3,'Every visit','DHHS / IAS-USA Guideline'),
    ('HIV-04',4,'Annually','DHHS Guideline'),
    ('HIV-05',5,'Annually (more if high-risk)','CDC STI Guidelines / DHHS'),
    ('HIV-06',6,'Per ASCCP / annually (anal)','DHHS / ASCCP Guideline'),
    ('HIV-07',7,'Annually','DHHS / ACC/AHA'),
    ('HIV-08',8,'Every 6–12 months','DHHS Guideline'),
    ('HIV-09',9,'Per risk factors (age 50+)','DHHS / Endocrine Society'),
    ('HIV-10',10,'Annually','CDC / ACIP / DHHS')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 25: Hepatitis C (Chronic)  (B18.2)  — 8 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('HCV', 'Hepatitis C (Chronic)', 'B18.2%', 8,
  'AASLD/IDSA HCV Guideline, AASLD/IDSA Guideline, AASLD HCC Guideline, AASLD...',
  'HCV RNA viral load, genotype/treatment history, fibrosis staging, DAA therapy monitoring, SVR confirmation, HCC surveillance, substance use screening, reinfection counseling.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'HCV';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('HCV-01','HCV RNA Viral Load (Quantitative)','chronic','Order quantitative HCV RNA to confirm active viremia after positive anti-HCV antibody','Y'),
    ('HCV-02','HCV Genotype / NS5A Resistance Testing','chronic','Order HCV genotype (and NS5A RAS testing if indicated) to guide DAA regimen selection','Y'),
    ('HCV-03','Liver Fibrosis Staging','chronic','Assess fibrosis using FIB-4, APRI, or elastography (FibroScan); determines urgency and post-SVR surveillance needs','Y'),
    ('HCV-04','DAA Treatment Initiation / Completion','chronic','Prescribe pan-genotypic DAA regimen (sofosbuvir/velpatasvir or glecaprevir/pibrentasvir); document treatment start/end dates','Y'),
    ('HCV-05','SVR12 Confirmation (Cure)','chronic','Order HCV RNA at 12 weeks post-treatment completion; undetectable = sustained virologic response (cure)','Y'),
    ('HCV-06','HCC Surveillance (if Cirrhotic)','chronic','For patients with cirrhosis (even after SVR): continue abdominal ultrasound ± AFP every 6 months indefinitely','Y'),
    ('HCV-07','Hepatitis A & B Vaccination','chronic','Confirm HAV and HBV immunity; vaccinate if non-immune to prevent superinfection and accelerated liver damage','Y'),
    ('HCV-08','Substance Use & Reinfection Counseling','chronic','Screen for ongoing injection drug use; provide harm reduction education and reinfection prevention counseling','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('HCV-01',1,'At diagnosis + SVR12 + SVR24','AASLD/IDSA HCV Guideline'),
    ('HCV-02',2,'At diagnosis (before treatment)','AASLD/IDSA Guideline'),
    ('HCV-03',3,'At diagnosis + post-SVR if cirrhotic','AASLD/IDSA Guideline'),
    ('HCV-04',4,'Once (8–12 weeks)','AASLD/IDSA Guideline'),
    ('HCV-05',5,'12 weeks post-treatment','AASLD/IDSA Guideline'),
    ('HCV-06',6,'Every 6 months','AASLD HCC Guideline'),
    ('HCV-07',7,'At diagnosis','AASLD / ACIP'),
    ('HCV-08',8,'Every visit (pre and post-treatment)','AASLD/IDSA / SAMHSA')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 26: Sickle Cell Disease (SCD)  (D57.x)  — 8 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('SCD', 'Sickle Cell Disease (SCD)', 'D57%', 8,
  'ASH, NHLBI, ASH Guideline, ACIP',
  'CBC with reticulocyte count, hydroxyurea management, iron overload monitoring, transcranial Doppler, pain crisis prevention, immunizations, renal function, ophthalmologic screening.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'SCD';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('SCD-01','Hydroxyurea Eligibility & Monitoring','chronic','For HbSS/Sβ0: assess hydroxyurea candidacy (≥9 months of age); monitor CBC every 4–8 weeks during titration, then every 2–3 months','Y'),
    ('SCD-02','Transcranial Doppler (TCD) Screening','chronic','For children ages 2–16 with HbSS/Sβ0: annual TCD to screen for stroke risk; conditional/abnormal → chronic transfusion','Y'),
    ('SCD-03','Pain Crisis Assessment & Management Plan','chronic','Document acute pain crisis frequency, ED/hospital utilization, and individualized pain management plan','Y'),
    ('SCD-04','Renal Function Monitoring','chronic','Order BMP (creatinine/eGFR) and urinalysis with uACR; sickle nephropathy screening','Y'),
    ('SCD-05','Pulmonary Hypertension Screening','chronic','Screen with NT-proBNP and/or echocardiogram for TRV; refer for RHC if TRV ≥2.5 m/s or elevated NT-proBNP','Y'),
    ('SCD-06','Retinopathy Screening','chronic','Refer for dilated retinal exam to screen for proliferative sickle retinopathy','Y'),
    ('SCD-07','Iron Overload Assessment (if Transfused)','chronic','For patients on chronic transfusion: monitor serum ferritin every 3 months and liver iron by MRI annually; chelation if ferritin >1000','Y'),
    ('SCD-08','Immunization & Penicillin Prophylaxis','chronic','Confirm pneumococcal, meningococcal, influenza, and COVID vaccines; penicillin prophylaxis through age 5 (at minimum)','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('SCD-01',1,'Every 2–3 months','ASH / NHLBI Guideline'),
    ('SCD-02',2,'Annually (ages 2–16)','NHLBI / ASH Guideline'),
    ('SCD-03',3,'Every visit','ASH Guideline'),
    ('SCD-04',4,'Annually','ASH / KDIGO'),
    ('SCD-05',5,'Annually (adults)','ASH / ATS Guideline'),
    ('SCD-06',6,'Annually (beginning age 10)','ASH Guideline'),
    ('SCD-07',7,'Every 3 months (ferritin) / annually (MRI)','ASH / NHLBI Guideline'),
    ('SCD-08',8,'Annually','ACIP / NHLBI Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 27: Systemic Lupus Erythematosus (SLE)  (M32.x)  — 9 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('SLE', 'Systemic Lupus Erythematosus (SLE)', 'M32%', 9,
  'ACR, AAO, ACC/AHA, ACR Osteoporosis Guideline',
  'Disease activity monitoring, autoantibody panel, renal monitoring, HCQ retinal screening, cardiovascular risk, bone density, immunization review, mental health screening, pregnancy planning.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'SLE';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('SLE-01','Disease Activity Assessment (SLEDAI/BILAG)','chronic','Calculate and document composite disease activity score (SLEDAI-2K or BILAG); classify remission/low/moderate/high activity','Y'),
    ('SLE-02','Hydroxychloroquine Adherence & Monitoring','chronic','Confirm HCQ prescribed (unless contraindicated); foundation of all SLE treatment regimens','Y'),
    ('SLE-03','Ophthalmologic Screening (HCQ Toxicity)','chronic','Refer for annual retinal screening (OCT + visual fields) for hydroxychloroquine retinal toxicity; baseline within first year','Y'),
    ('SLE-04','Renal Monitoring (Lupus Nephritis)','chronic','Order urinalysis with microscopy, uACR or uPCR, and serum creatinine/eGFR to screen for lupus nephritis','Y'),
    ('SLE-05','Serologic Activity Markers','chronic','Order complement levels (C3, C4), anti-dsDNA antibody titers, and CBC to monitor immunologic activity and cytopenias','Y'),
    ('SLE-06','Cardiovascular Risk Assessment','chronic','Assess ASCVD risk (SLE confers 2–10x CV risk); manage hypertension, dyslipidemia, and diabetes aggressively','Y'),
    ('SLE-07','Bone Health & Glucocorticoid Monitoring','chronic','For chronic prednisone use: order DXA, vitamin D, calcium; initiate osteoporosis prevention per ACR glucocorticoid guideline','Y'),
    ('SLE-08','Immunization Review','chronic','Confirm influenza, pneumococcal, COVID-19 vaccines; avoid live vaccines on immunosuppression; HPV vaccine if age-appropriate','Y'),
    ('SLE-09','Pregnancy Planning Counseling','chronic','For women of childbearing age: assess anti-Ro/La, antiphospholipid antibodies; counsel on disease quiescence before conception; review teratogenic meds','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('SLE-01',1,'Every visit (every 3–6 months)','ACR / EULAR Guideline'),
    ('SLE-02',2,'Every visit','ACR / EULAR Guideline'),
    ('SLE-03',3,'Annually (after 5 years, or annually if risk factors)','AAO / ACR Guideline'),
    ('SLE-04',4,'Every 3–6 months','ACR / KDIGO / EULAR'),
    ('SLE-05',5,'Every 3–6 months','ACR / EULAR Guideline'),
    ('SLE-06',6,'Annually','ACC/AHA / EULAR'),
    ('SLE-07',7,'Annually (if on steroids)','ACR Osteoporosis Guideline'),
    ('SLE-08',8,'Annually','ACR / ACIP / EULAR'),
    ('SLE-09',9,'Annually (reproductive-age women)','ACR / EULAR Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 28: Gout  (M10.x)  — 7 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('GOUT', 'Gout', 'M10%', 7,
  'ACR 2020 Guideline, ACR 2020, ACC/AHA',
  'Uric acid monitoring, ULT therapy, flare prophylaxis, renal function, cardiovascular risk, dietary counseling, medication interaction review.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'GOUT';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('GOUT-01','Serum Uric Acid Monitoring','chronic','Order serum urate level; target < 6.0 mg/dL (< 5.0 if tophaceous gout) on urate-lowering therapy (ULT)','Y'),
    ('GOUT-02','Urate-Lowering Therapy Initiation','chronic','For patients with ≥2 flares/year, tophi, or urate nephrolithiasis: initiate allopurinol (start low, titrate) or febuxostat','Y'),
    ('GOUT-03','Flare Prophylaxis During ULT Initiation','chronic','Prescribe colchicine 0.6 mg daily (or low-dose NSAID) for ≥3–6 months when starting/titrating ULT to prevent mobilization flares','Y'),
    ('GOUT-04','Renal Function Assessment','chronic','Order BMP (creatinine/eGFR); adjust ULT dosing per renal function; allopurinol can be titrated above 300 mg even with CKD','Y'),
    ('GOUT-05','Cardiovascular Risk Screening','chronic','Assess ASCVD risk; gout independently associated with increased CV events; screen for HTN, dyslipidemia, metabolic syndrome','Y'),
    ('GOUT-06','Dietary & Lifestyle Counseling','chronic','Document counseling on purine-rich food moderation, alcohol reduction (especially beer), sugar-sweetened beverage avoidance, and weight management','Y'),
    ('GOUT-07','Medication Interaction Review','chronic','Review medications that affect urate: thiazides (increase), losartan (decrease); discontinue unnecessary urate-elevating drugs','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('GOUT-01',1,'Every 6 months (until target, then annually)','ACR 2020 Guideline'),
    ('GOUT-02',2,'At indication + ongoing','ACR 2020 Guideline'),
    ('GOUT-03',3,'First 3–6 months of ULT','ACR 2020 Guideline'),
    ('GOUT-04',4,'Every 6–12 months','ACR 2020 / KDIGO'),
    ('GOUT-05',5,'Annually','ACC/AHA / ACR'),
    ('GOUT-06',6,'Annually','ACR 2020 Guideline'),
    ('GOUT-07',7,'Annually','ACR 2020 Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 29: Obstructive Sleep Apnea (OSA)  (G47.33)  — 7 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('OSA', 'Obstructive Sleep Apnea (OSA)', 'G47.33%', 7,
  'AASM Guideline, AASM',
  'AHI documentation, PAP adherence, residual AHI, daytime sleepiness, weight management, cardiovascular risk, comorbid insomnia/mood screening.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'OSA';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('OSA-01','AHI / Severity Documentation','chronic','Document most recent AHI from polysomnography or home sleep test; classify mild (5–14), moderate (15–29), severe (≥30)','Y'),
    ('OSA-02','PAP Therapy Adherence Monitoring','chronic','Download and review CPAP/BiPAP usage data; target ≥4 hours/night on ≥70% of nights (CMS adherence threshold)','Y'),
    ('OSA-03','Residual AHI Assessment','chronic','Review PAP device-reported residual AHI; target < 5 events/hour; adjust pressure settings or mask if elevated','Y'),
    ('OSA-04','Daytime Sleepiness Assessment (ESS)','chronic','Administer Epworth Sleepiness Scale; document score (>10 = excessive); assess driving and occupational risk','Y'),
    ('OSA-05','Weight Management Assessment','chronic','Document BMI and weight trend; for BMI ≥30: counsel on weight loss as adjunctive OSA therapy; 10% weight loss can reduce AHI by 26%','Y'),
    ('OSA-06','Cardiovascular Risk Optimization','chronic','Screen and manage associated CV risks: hypertension, atrial fibrillation, heart failure, and stroke; OSA independently increases CV risk','Y'),
    ('OSA-07','Comorbid Insomnia / Mood Screening','chronic','Screen for comorbid insomnia (COMISA), depression (PHQ-9), and anxiety (GAD-7); high overlap with OSA','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('OSA-01',1,'At diagnosis + if clinical change','AASM Guideline'),
    ('OSA-02',2,'Every 3 months (first year), then annually','AASM / CMS Coverage'),
    ('OSA-03',3,'Every 3–6 months','AASM Guideline'),
    ('OSA-04',4,'Every 6–12 months','AASM Guideline'),
    ('OSA-05',5,'Annually','AASM / CMS69v12'),
    ('OSA-06',6,'Annually','AASM / ACC/AHA'),
    ('OSA-07',7,'Annually','AASM / APA')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 30: Generalized Anxiety Disorder (GAD)  (F41.1)  — 8 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('GAD', 'Generalized Anxiety Disorder (GAD)', 'F41.1%', 8,
  'CMS Quality, APA Guideline, APA, CMS159v12...',
  'GAD-7 assessment, treatment response, SSRI/SNRI management, benzodiazepine assessment, psychotherapy referral, depression screening, substance use screening, functional impairment.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'GAD';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('GAD-01','GAD-7 Anxiety Assessment','chronic','Administer GAD-7; document score and severity (mild 5–9, moderate 10–14, severe 15–21); track longitudinally','Y'),
    ('GAD-02','Treatment Response Monitoring','chronic','For patients on pharmacotherapy or psychotherapy: document ≥50% GAD-7 reduction as response; <5 as remission target','Y'),
    ('GAD-03','SSRI/SNRI Medication Management','chronic','Review anxiolytic medication: first-line SSRI/SNRI efficacy, dose optimization, and side effect assessment','Y'),
    ('GAD-04','Benzodiazepine Use Assessment','chronic','If benzodiazepine prescribed: document indication, duration, dose, and tapering plan; avoid chronic use; monitor for dependence','Y'),
    ('GAD-05','Psychotherapy Referral & Engagement','chronic','Document referral to or engagement in evidence-based psychotherapy (CBT preferred); assess treatment adherence','Y'),
    ('GAD-06','Comorbid Depression Screening (PHQ-9)','chronic','Screen for comorbid MDD; GAD and MDD co-occur in ≥60% of cases; integrated treatment approach needed','Y'),
    ('GAD-07','Substance Use Screening (AUDIT-C / DAST)','chronic','Screen for self-medication with alcohol or substances; anxiety disorders increase substance use risk','Y'),
    ('GAD-08','Functional Impairment Assessment','chronic','Document impact on work productivity, social functioning, relationships, and sleep quality','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('GAD-01',1,'Every visit (minimum quarterly)','CMS Quality / APA'),
    ('GAD-02',2,'Every visit','APA Guideline'),
    ('GAD-03',3,'Every visit (monthly during titration)','APA Guideline'),
    ('GAD-04',4,'Every visit','APA / VA/DoD Guideline'),
    ('GAD-05',5,'At diagnosis + ongoing','APA Guideline / NICE'),
    ('GAD-06',6,'Every visit','CMS159v12 / APA'),
    ('GAD-07',7,'Annually','USPSTF / SAMHSA'),
    ('GAD-08',8,'Every visit','APA Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- OVERLAP RULES — Update/expand from set 1 + add new rules for 16-30
-- ═════════════════════════════════════════════════════════════════════

-- Update existing rules with expanded applicable_bundles
UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'MDD,ALZ,STR,MIG,OSA,GAD,DM,HF,PAIN',
  dedup_rule = 'Single PHQ-9 per visit satisfies all conditions; document in each applicable problem list; score <5 = remission target',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-PHQ9';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'DM,HTN,CAD,HF,CKD,AFIB,PAD,STR,GOUT,OSA',
  dedup_rule = 'Single BP reading satisfies all; use strictest target: <130/80 for stroke/CKD/CAD secondary prevention',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-BP';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'DM,HTN,CAD,PAD,RA,STR',
  dedup_rule = 'One active statin prescription satisfies all; stroke/CAD/PAD require high-intensity statin',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-STATIN';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'CAD,PAD,STR,AFIB',
  dedup_rule = 'Single antiplatelet/anticoagulant covers all; if AFib comorbid, anticoagulant replaces antiplatelet',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-ANTIPLATELET';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'COPD,ASTH,CAD,PAD,HTN,STR',
  dedup_rule = 'One tobacco screen + intervention per visit covers all conditions',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-SMOKING';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'CKD,DM,HTN,AFIB,GOUT,EPI,HIV,SLE,BPH',
  dedup_rule = 'One BMP satisfies all; use most frequent interval; flag drug dosing adjustments (ULT, ASMs, DOACs, antivirals)',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-EGFR';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'OSTEO,RA,CKD,EPI,HIV,SLE',
  dedup_rule = 'One DXA satisfies all; shortest indicated interval applies; document which medication triggered screening',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-DXA';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'HTN,DM,CAD,RA,GOUT,OSA,SLE,HIV,STR',
  dedup_rule = 'One ASCVD calculation covers all; apply disease-specific multipliers (SLE 2-10x, RA 1.5x)',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-ASCVD';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'CLD,RA,CKD,HCV,HIV',
  dedup_rule = 'One-time screening satisfies all; for HIV: annual re-screening if ongoing risk behavior',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-HEPBC';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'COPD,ASTH,DM,CKD,HF,HIV,SCD,SLE,EPI',
  dedup_rule = 'One annual vaccination review satisfies all; note: avoid live vaccines in HIV (CD4<200), SLE, RA on biologics',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-FLU';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'OSTEO,PAD,MDD,ALZ,EPI',
  dedup_rule = 'One annual fall risk screen covers all; for dementia/epilepsy: add wandering and seizure-related injury risk',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-FALLS';

-- Insert new overlap rules for set 16-30
INSERT INTO phm_edw.bundle_overlap_rule (rule_code, shared_domain, applicable_bundles, canonical_measure_code, dedup_rule)
VALUES
  ('OVERLAP-GAD7', 'GAD-7 Anxiety Screening', 'GAD,MIG,PAIN,MDD,EPI', 'GAD-01',
   'Single GAD-7 per visit covers all conditions; document alongside PHQ-9 for bidirectional mood screening'),
  ('OVERLAP-SUBSTANCE', 'Substance Use Screening (AUDIT-C/DAST)', 'GAD,PAIN,HCV,ALZ,CLD,MDD', 'CLD-05',
   'One AUDIT-C per visit covers all conditions; DAST-10 added if substance use history'),
  ('OVERLAP-ACP', 'Advance Care Planning', 'ALZ,HF,SCD,HIV', NULL,
   'One ACP document satisfies all; update annually or with significant disease progression'),
  ('OVERLAP-CAREGIVER', 'Caregiver Burden Assessment', 'ALZ,STR,EPI,SCD', 'ALZ-06',
   'One caregiver assessment per visit; use condition-specific tools (Zarit for dementia, modified for pediatric SCD)'),
  ('OVERLAP-OPHTHO', 'Ophthalmologic Screening', 'SLE,SCD,DM', NULL,
   'Coordinate into single annual eye exam when possible; document separate indications for each condition'),
  ('OVERLAP-WEIGHT', 'Weight Management / BMI', 'OSA,OA,GOUT,OB,DM,HTN', 'OB-01',
   'Single BMI + counseling session covers all; for OSA: document that 10% weight loss reduces AHI by 26%'),
  ('OVERLAP-HCC', 'HCC Surveillance (Ultrasound +/- AFP)', 'HCV,CLD', 'CLD-04',
   'One q6-month ultrasound satisfies both; continues indefinitely even after HCV cure if cirrhosis was present')
ON CONFLICT (rule_code) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════
-- UPDATE bundle_size counts from actual linked measures
-- ═════════════════════════════════════════════════════════════════════
UPDATE phm_edw.condition_bundle cb
SET bundle_size = (
  SELECT COUNT(*)
  FROM phm_edw.bundle_measure bm
  WHERE bm.bundle_id = cb.bundle_id AND bm.active_ind = 'Y'
),
updated_date = NOW()
WHERE cb.bundle_code IN ('ALZ','STR','PAIN','OA','GERD','BPH','MIG','EPI','HIV','HCV','SCD','SLE','GOUT','OSA','GAD');