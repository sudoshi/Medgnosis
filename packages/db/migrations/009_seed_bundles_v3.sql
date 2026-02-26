-- =====================================================================
-- 009_seed_bundles_v3.sql
-- Phase 10.6c: Seed bundles 31-45 (15 conditions, ~130 measures)
-- from Medgnosis_CareGap_Bundles_31-45.xlsx
-- =====================================================================


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 31: Type 1 Diabetes Mellitus  (E10.x)  — 12 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('T1D', 'Type 1 Diabetes Mellitus', 'E10%', 12,
  'CMS122v12, ADA Standards, CMS131v12, CMS134v12...',
  'HbA1c monitoring, CGM review, insulin optimization, hypoglycemia assessment, retinal exam, nephropathy screening, lipids, BP control, thyroid screening, celiac screening, mental health, foot exam.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'T1D';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('T1D-01','HbA1c Monitoring','chronic','Order and document HbA1c; assess against individualized glycemic target (typically <7.0% for most adults)','Y'),
    ('T1D-02','Continuous Glucose Monitor (CGM) Review','chronic','Download and review CGM data: Time in Range (TIR 70–180 mg/dL target >70%), Time Below Range (<4%), and GMI','Y'),
    ('T1D-03','Insulin Regimen Optimization','chronic','Review basal-bolus or insulin pump settings; adjust ICR, ISF, and basal rates based on CGM patterns','Y'),
    ('T1D-04','Hypoglycemia Assessment','chronic','Document frequency of Level 1 (<70), Level 2 (<54), and Level 3 (severe) hypoglycemic events; assess awareness','Y'),
    ('T1D-05','Dilated Retinal Eye Exam','chronic','Refer for annual dilated fundoscopic exam by ophthalmology; begin 5 years after diagnosis for T1D','Y'),
    ('T1D-06','Nephropathy Screening (uACR)','chronic','Order urine albumin-to-creatinine ratio; begin 5 years after diagnosis for T1D','Y'),
    ('T1D-07','Lipid Panel & Statin Assessment','chronic','Order fasting lipid panel; consider statin for patients aged ≥40 or with additional ASCVD risk factors','Y'),
    ('T1D-08','Blood Pressure Control','chronic','Measure seated BP; target <130/80 mmHg for diabetic patients','Y'),
    ('T1D-09','Thyroid Function Screening','chronic','Order TSH to screen for autoimmune thyroiditis (high prevalence comorbidity with T1D)','Y'),
    ('T1D-10','Celiac Disease Screening','chronic','Screen for tissue transglutaminase (tTG-IgA) in patients with GI symptoms or at diagnosis in younger patients','Y'),
    ('T1D-11','Diabetes Distress & Mental Health Screen','chronic','Screen for diabetes distress, depression (PHQ-9), and disordered eating behaviors; T1D burnout is prevalent','Y'),
    ('T1D-12','Foot Examination','chronic','Perform comprehensive foot exam: monofilament, pedal pulses, skin inspection','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('T1D-01',1,'Every 3 months (minimum quarterly)','CMS122v12 / ADA Standards'),
    ('T1D-02',2,'Every visit','ADA Standards / Endocrine Society'),
    ('T1D-03',3,'Every visit','ADA Standards'),
    ('T1D-04',4,'Every visit','ADA Standards / Endocrine Society'),
    ('T1D-05',5,'Annually (5 yrs post-dx)','CMS131v12 / ADA'),
    ('T1D-06',6,'Annually (5 yrs post-dx)','CMS134v12 / ADA'),
    ('T1D-07',7,'Annually','CMS347v7 / ADA'),
    ('T1D-08',8,'Every visit','CMS165v12 / ADA'),
    ('T1D-09',9,'Every 1–2 years','ADA Standards / Endocrine Society'),
    ('T1D-10',10,'At diagnosis + symptom-driven','ADA Standards'),
    ('T1D-11',11,'Annually','ADA Standards / CMS159v12'),
    ('T1D-12',12,'Annually','ADA Standards')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 32: Inflammatory Bowel Disease (Crohn's & UC)  (K50.x / K51.x)  — 9 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('IBD', 'Inflammatory Bowel Disease (Crohn''s & UC)', 'K50%,K51%', 9,
  'ACG, ACG CRC Screening Guideline, ACR Osteoporosis',
  'Disease activity assessment, fecal calprotectin, endoscopic surveillance, biologic monitoring, immunizations, bone density, nutritional assessment, CRC risk stratification, mental health screening.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'IBD';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('IBD-01','Disease Activity Assessment','chronic','Document clinical activity using validated indices: Harvey-Bradshaw Index (Crohn''s) or Partial Mayo Score (UC)','Y'),
    ('IBD-02','Fecal Calprotectin Monitoring','chronic','Order fecal calprotectin as non-invasive biomarker of mucosal inflammation; correlates with endoscopic activity','Y'),
    ('IBD-03','Endoscopic Surveillance (Dysplasia)','chronic','For UC/Crohn''s colitis ≥8 years duration: schedule surveillance colonoscopy with chromoendoscopy for dysplasia','Y'),
    ('IBD-04','Biologic / Immunomodulator Monitoring','chronic','For patients on biologics (anti-TNF, vedolizumab, ustekinumab) or thiopurines: order therapeutic drug levels and safety labs (CBC, LFTs)','Y'),
    ('IBD-05','Immunization Status Review','chronic','Confirm influenza, pneumococcal, HBV, HPV, and COVID vaccines; administer live vaccines BEFORE starting immunosuppression','Y'),
    ('IBD-06','Bone Density Screening','chronic','For patients with cumulative glucocorticoid exposure (≥3 months) or malabsorption: order DXA scan','Y'),
    ('IBD-07','Nutritional Assessment (Iron, B12, D)','chronic','Order iron studies, vitamin B12, folate, vitamin D, and albumin; Crohn''s ileal disease at high risk for deficiencies','Y'),
    ('IBD-08','Colorectal Cancer Risk Stratification','chronic','Document CRC risk category (low/intermediate/high) based on disease extent, duration, PSC comorbidity, and family history','Y'),
    ('IBD-09','Mental Health & Quality of Life Screen','chronic','Screen for anxiety and depression (PHQ-9/GAD-7); IBD-specific QOL tools (IBDQ) recommended','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('IBD-01',1,'Every visit','ACG / AGA Guideline'),
    ('IBD-02',2,'Every 3–6 months (or per flare)','ACG / AGA Guideline'),
    ('IBD-03',3,'Every 1–3 years (per risk)','ACG CRC Screening Guideline'),
    ('IBD-04',4,'Every 3–6 months','ACG / AGA Guideline'),
    ('IBD-05',5,'Annually','ACG / ACIP / IDSA'),
    ('IBD-06',6,'Per glucocorticoid use / every 2 years','ACR Osteoporosis / ACG'),
    ('IBD-07',7,'Every 6–12 months','ACG / AGA Guideline'),
    ('IBD-08',8,'At 8 years post-diagnosis','ACG / AGA Guideline'),
    ('IBD-09',9,'Annually','ACG / APA')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 33: Multiple Sclerosis (MS)  (G35)  — 9 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('MS', 'Multiple Sclerosis (MS)', 'G35%', 9,
  'AAN Guideline, AAN, FDA Labels',
  'EDSS disability scoring, relapse tracking, MRI surveillance, DMT review, safety lab monitoring, JCV antibody testing, bladder/bowel assessment, depression/fatigue screening, vaccination review.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'MS';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('MS-01','Neurological Disability Assessment (EDSS)','chronic','Document Expanded Disability Status Scale score; track longitudinally for disease progression','Y'),
    ('MS-02','Relapse Frequency Documentation','chronic','Document annualized relapse rate, date of last relapse, and recovery status; classify RRMS vs. SPMS vs. PPMS','Y'),
    ('MS-03','MRI Surveillance (Brain + Spine)','chronic','Order MRI brain (and cervical spine if indicated) to monitor for new/enlarging T2 lesions and gadolinium-enhancing activity','Y'),
    ('MS-04','Disease-Modifying Therapy (DMT) Review','chronic','Review DMT efficacy, adherence, and side effects; escalate if breakthrough disease activity (clinical or radiological)','Y'),
    ('MS-05','DMT Safety Lab Monitoring','chronic','Per DMT: lymphocyte counts (fingolimod, dimethyl fumarate), LFTs (teriflunomide), JCV antibody index (natalizumab)','Y'),
    ('MS-06','JCV Antibody Testing (if on Natalizumab)','chronic','Order JCV antibody index every 6 months; PML risk stratification for natalizumab continuation decision','Y'),
    ('MS-07','Bladder & Bowel Function Assessment','chronic','Screen for neurogenic bladder (urgency, frequency, retention) and bowel dysfunction; refer for urodynamics if indicated','Y'),
    ('MS-08','Depression & Fatigue Screening','chronic','Screen for depression (PHQ-9) and MS-related fatigue (Modified Fatigue Impact Scale); both are highly prevalent','Y'),
    ('MS-09','Vaccination Review (Pre-DMT & Ongoing)','chronic','Confirm vaccines per ACIP; live vaccines contraindicated on most DMTs; VZV and HBV ideally given before DMT initiation','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('MS-01',1,'Every 6–12 months','AAN Guideline'),
    ('MS-02',2,'Every visit','AAN Guideline'),
    ('MS-03',3,'Every 6–12 months (annually if stable)','AAN / MAGNIMS Guideline'),
    ('MS-04',4,'Every visit','AAN Guideline'),
    ('MS-05',5,'Per DMT protocol (every 3–6 months)','FDA Labels / AAN'),
    ('MS-06',6,'Every 6 months','AAN / FDA REMS'),
    ('MS-07',7,'Annually','AAN Guideline'),
    ('MS-08',8,'Annually','AAN / CMS159v12'),
    ('MS-09',9,'At DMT start + annually','AAN / ACIP')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 34: Parkinson's Disease  (G20.x)  — 10 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('PD', 'Parkinson''s Disease', 'G20%', 10,
  'AAN, AAN Guideline, MDS',
  'Motor assessment (MDS-UPDRS), levodopa optimization, non-motor symptom screening, cognitive assessment, fall risk, depression/anxiety, swallowing/speech, impulse control, orthostatic hypotension, advance care planning.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'PD';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('PD-01','Motor Symptom Assessment (MDS-UPDRS)','chronic','Administer MDS-Unified Parkinson''s Disease Rating Scale Parts II–III; document motor severity and fluctuations','Y'),
    ('PD-02','Levodopa/Dopaminergic Therapy Optimization','chronic','Review medication timing, wearing-off patterns, on/off fluctuations, and dyskinesias; optimize levodopa dosing intervals','Y'),
    ('PD-03','Non-Motor Symptom Screening (NMS-Quest)','chronic','Screen for constipation, REM sleep behavior disorder, orthostatic hypotension, anosmia, pain, and cognitive changes','Y'),
    ('PD-04','Cognitive Assessment (MoCA)','chronic','Administer Montreal Cognitive Assessment to screen for PD-related cognitive impairment and dementia (PDD)','Y'),
    ('PD-05','Fall Risk & Gait Assessment','chronic','Evaluate postural instability (pull test), freezing of gait, and fall frequency; refer for PT (LSVT BIG or equivalent)','Y'),
    ('PD-06','Depression & Anxiety Screening','chronic','Screen for PD-related depression (GDS-15 or PHQ-9) and anxiety (GAD-7); prevalence 40–50% in PD','Y'),
    ('PD-07','Swallowing & Speech Assessment','chronic','Screen for dysphagia (aspiration risk) and hypophonia; refer for speech therapy (LSVT LOUD) if indicated','Y'),
    ('PD-08','Impulse Control Disorder Screening','chronic','For patients on dopamine agonists: screen for pathological gambling, hypersexuality, compulsive shopping, and binge eating','Y'),
    ('PD-09','Orthostatic Hypotension Assessment','chronic','Measure lying and standing BP (1 min and 3 min); document if drop ≥20/10 mmHg; adjust medications accordingly','Y'),
    ('PD-10','Advance Care Planning & Palliative Referral','chronic','Document goals of care and advance directives; consider palliative care referral for advanced disease stages','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('PD-01',1,'Every visit','AAN / MDS Guideline'),
    ('PD-02',2,'Every visit','AAN Guideline'),
    ('PD-03',3,'Every 6 months','MDS / AAN Guideline'),
    ('PD-04',4,'Annually','AAN / MDS Guideline'),
    ('PD-05',5,'Every visit','AAN Guideline'),
    ('PD-06',6,'Every 6 months','AAN / MDS / CMS159v12'),
    ('PD-07',7,'Annually','AAN Guideline'),
    ('PD-08',8,'Every visit (if on DA agonist)','AAN / MDS Guideline'),
    ('PD-09',9,'Every visit','AAN / Autonomic Guideline'),
    ('PD-10',10,'Annually (or at stage progression)','AAN / ACP Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 35: Psoriasis / Psoriatic Arthritis  (L40.x / M07.3)  — 8 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('PSO', 'Psoriasis / Psoriatic Arthritis', 'L40%,M07%', 8,
  'AAD, ACR',
  'Disease severity (BSA/PASI), joint assessment, biologic/systemic monitoring, TB screening, cardiovascular risk, metabolic syndrome, mental health, hepatic monitoring.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'PSO';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('PSO-01','Disease Severity Assessment (BSA / PASI)','chronic','Document Body Surface Area and/or Psoriasis Area and Severity Index score; classify mild (<3% BSA), moderate (3–10%), severe (>10%)','Y'),
    ('PSO-02','Joint Assessment (if PsA)','chronic','For psoriatic arthritis: document tender/swollen joint count, dactylitis, enthesitis; calculate DAPSA or MDA score','Y'),
    ('PSO-03','Biologic / Systemic Therapy Monitoring','chronic','For patients on biologics (IL-17, IL-23, TNF inhibitors) or methotrexate: order CBC, LFTs, and infection screening labs','Y'),
    ('PSO-04','TB Screening (Pre-Biologic)','chronic','Order QuantiFERON-TB Gold or PPD before initiating biologic therapy; repeat annually if ongoing risk','Y'),
    ('PSO-05','Cardiovascular Risk Assessment','chronic','Assess ASCVD risk; severe psoriasis confers independent CV risk (1.5–2x); manage lipids and BP aggressively','Y'),
    ('PSO-06','Metabolic Syndrome Screening','chronic','Order fasting glucose/HbA1c and lipid panel; psoriasis is associated with insulin resistance, obesity, and NAFLD','Y'),
    ('PSO-07','Mental Health Screening','chronic','Screen for depression (PHQ-9), anxiety, and body image distress; psoriasis has significant psychosocial impact','Y'),
    ('PSO-08','Hepatic Monitoring (if on Methotrexate)','chronic','For MTX patients: order CBC, AST/ALT, and albumin regularly; FIB-4 or elastography for cumulative dose assessment','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('PSO-01',1,'Every visit','AAD / NPF Guideline'),
    ('PSO-02',2,'Every visit (if PsA)','ACR / GRAPPA Guideline'),
    ('PSO-03',3,'Every 3–6 months','AAD / ACR Guideline'),
    ('PSO-04',4,'Before biologic + annually if risk','AAD / CDC'),
    ('PSO-05',5,'Annually','AAD / ACC/AHA'),
    ('PSO-06',6,'Annually','AAD / NPF Guideline'),
    ('PSO-07',7,'Annually','AAD / APA / CMS159v12'),
    ('PSO-08',8,'Every 3 months (MTX)','AAD / ACR Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 36: Chronic Hepatitis B  (B18.1)  — 9 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('HBV', 'Chronic Hepatitis B', 'B18.1%', 9,
  'AASLD HBV Guideline, AASLD HCC Guideline, AASLD',
  'HBV DNA viral load, ALT monitoring, HBeAg status, antiviral therapy review, HCC surveillance, fibrosis assessment, hepatitis A vaccination, HDV co-infection screening, family/contact screening.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'HBV';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('HBV-01','HBV DNA Viral Load','chronic','Order quantitative HBV DNA to assess viral replication and guide treatment decisions','Y'),
    ('HBV-02','ALT Monitoring','chronic','Order ALT level; persistent elevation >2x ULN with active viremia is a treatment indication','Y'),
    ('HBV-03','HBeAg / Anti-HBe Status','chronic','Document HBeAg and anti-HBe to classify disease phase (immune tolerant, immune active, inactive carrier, reactivation)','Y'),
    ('HBV-04','Antiviral Therapy Review','chronic','For patients on entecavir or tenofovir: confirm adherence, assess HBV DNA suppression, and monitor renal/bone safety','Y'),
    ('HBV-05','HCC Surveillance','chronic','For patients with cirrhosis, or Asian males >40, Asian females >50, African/African Americans >20, or family history of HCC: order abdominal ultrasound ± AFP every 6 months','Y'),
    ('HBV-06','Liver Fibrosis Assessment','chronic','Calculate FIB-4 score or order elastography (FibroScan); determines treatment urgency and surveillance intensity','Y'),
    ('HBV-07','Hepatitis A Vaccination','chronic','Confirm HAV immunity; vaccinate if non-immune to prevent HAV superinfection in chronic HBV','Y'),
    ('HBV-08','Hepatitis D Co-Infection Screening','chronic','Order anti-HDV antibody at least once to rule out delta hepatitis co-infection, which accelerates liver damage','Y'),
    ('HBV-09','Family & Sexual Contact Screening','chronic','Screen household members and sexual partners for HBsAg and anti-HBs; vaccinate susceptible contacts','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('HBV-01',1,'Every 3–6 months (on treatment); every 6–12 months (monitoring)','AASLD HBV Guideline'),
    ('HBV-02',2,'Every 3–6 months','AASLD HBV Guideline'),
    ('HBV-03',3,'Every 6–12 months','AASLD HBV Guideline'),
    ('HBV-04',4,'Every 6 months','AASLD HBV Guideline'),
    ('HBV-05',5,'Every 6 months','AASLD HCC Guideline'),
    ('HBV-06',6,'Annually','AASLD HBV Guideline'),
    ('HBV-07',7,'At diagnosis','AASLD / ACIP'),
    ('HBV-08',8,'At diagnosis (once)','AASLD HBV Guideline'),
    ('HBV-09',9,'At diagnosis + ongoing','AASLD / CDC')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 37: Pulmonary Arterial Hypertension (PAH)  (I27.0 / I27.2x)  — 8 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('PAH', 'Pulmonary Arterial Hypertension (PAH)', 'I27.0%,I27.2%', 8,
  'ESC/ERS, ESC/ERS Guideline',
  'Functional class assessment, 6-minute walk test, NT-proBNP monitoring, echocardiogram, PAH-targeted therapy review, right heart catheterization, hepatic/renal monitoring, pregnancy counseling.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'PAH';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('PAH-01','Functional Class Assessment (WHO FC)','chronic','Document WHO Functional Class (I–IV) at every visit; correlates with prognosis and guides treatment escalation','Y'),
    ('PAH-02','6-Minute Walk Test (6MWT)','chronic','Perform 6-minute walk distance; document meters walked, Borg dyspnea score, and SpO2 nadir','Y'),
    ('PAH-03','NT-proBNP / BNP Monitoring','chronic','Order NT-proBNP or BNP as biomarker of right ventricular strain; trend over time for treatment response','Y'),
    ('PAH-04','Echocardiogram (RV Function)','chronic','Order transthoracic echo to assess RVSP, TAPSE, RV dilation, and pericardial effusion; track RV remodeling','Y'),
    ('PAH-05','PAH-Targeted Therapy Review','chronic','Review combination therapy: PDE5i (sildenafil/tadalafil), ERA (ambrisentan/macitentan), prostacyclin pathway (selexipag, treprostinil); escalate per risk stratification','Y'),
    ('PAH-06','Right Heart Catheterization (Follow-up)','chronic','For treatment-refractory or worsening patients: repeat RHC to confirm hemodynamics and guide escalation or transplant referral','Y'),
    ('PAH-07','Hepatic & Renal Function Monitoring','chronic','Order LFTs (ERA hepatotoxicity) and BMP/eGFR; monitor for right heart failure–related hepatic congestion and cardiorenal syndrome','Y'),
    ('PAH-08','Pregnancy Counseling & Contraception','chronic','Document that pregnancy is contraindicated in PAH (maternal mortality 30–50%); confirm effective contraception in reproductive-age women; bosentan reduces OC efficacy','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('PAH-01',1,'Every visit','ESC/ERS / CHEST Guideline'),
    ('PAH-02',2,'Every 3–6 months','ESC/ERS Guideline'),
    ('PAH-03',3,'Every 3–6 months','ESC/ERS Guideline'),
    ('PAH-04',4,'Every 6–12 months','ESC/ERS Guideline'),
    ('PAH-05',5,'Every visit','ESC/ERS / CHEST Guideline'),
    ('PAH-06',6,'As clinically indicated','ESC/ERS Guideline'),
    ('PAH-07',7,'Every 3–6 months','ESC/ERS / FDA Labels'),
    ('PAH-08',8,'Annually (reproductive-age women)','ESC/ERS Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 38: Iron Deficiency Anemia / Anemia of Chronic Disease  (D50.x / D63.x)  — 7 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('ANEM', 'Iron Deficiency Anemia / Anemia of Chronic Disease', 'D50%,D63%', 7,
  'ASH, ASH Guideline, ACG',
  'CBC with reticulocyte count, iron studies, iron replacement therapy, treatment response, GI evaluation, underlying cause assessment, B12/folate check.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'ANEM';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('ANEM-01','CBC with Reticulocyte Count','chronic','Order CBC with RBC indices (MCV, MCH, MCHC, RDW) and reticulocyte count to classify anemia type','Y'),
    ('ANEM-02','Iron Studies Panel','chronic','Order serum ferritin, serum iron, TIBC, and transferrin saturation (TSAT); ferritin <30 confirms IDA; ferritin 30–100 with low TSAT suggests mixed','Y'),
    ('ANEM-03','Iron Replacement Therapy','chronic','For confirmed IDA: prescribe oral iron (ferrous sulfate 325mg TID) or IV iron (ferric carboxymaltose, iron sucrose) if oral-intolerant or CKD','Y'),
    ('ANEM-04','Treatment Response Assessment','chronic','Check Hgb and ferritin 4–8 weeks after initiating iron; expect Hgb rise of 1–2 g/dL; if no response, evaluate for ongoing loss or malabsorption','Y'),
    ('ANEM-05','GI Evaluation for Occult Blood Loss','chronic','For unexplained IDA in men and postmenopausal women: order fecal immunochemical test (FIT) and/or refer for EGD + colonoscopy to rule out GI malignancy','Y'),
    ('ANEM-06','Underlying Cause Assessment','chronic','Evaluate for contributing causes: celiac disease (tTG-IgA), H. pylori, menorrhagia, CKD (eGFR), chronic inflammation (CRP, ESR)','Y'),
    ('ANEM-07','B12 & Folate Level Check','chronic','Order vitamin B12 and folate to rule out concurrent megaloblastic anemia; especially if macrocytic or mixed picture','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('ANEM-01',1,'Every 3–6 months (until stable)','ASH / ACP Guideline'),
    ('ANEM-02',2,'Every 3–6 months','ASH Guideline'),
    ('ANEM-03',3,'Per protocol until replete','ASH / KDIGO'),
    ('ANEM-04',4,'4–8 weeks post-initiation','ASH Guideline'),
    ('ANEM-05',5,'At diagnosis (once)','ACG / USPSTF'),
    ('ANEM-06',6,'At diagnosis','ASH / ACP Guideline'),
    ('ANEM-07',7,'At diagnosis','ASH Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 39: Familial / Severe Hyperlipidemia  (E78.x)  — 9 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('LIPID', 'Familial / Severe Hyperlipidemia', 'E78%', 9,
  'CMS347v7, ACC/AHA, ACC/AHA Guideline, NLA',
  'Fasting lipid panel, LDL-C goal assessment, statin optimization, non-statin therapy, ASCVD risk calculation, FH screening, hepatic safety, SAMS assessment, lipoprotein(a) testing.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'LIPID';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('LIPID-01','Fasting Lipid Panel','chronic','Order fasting lipid panel: total cholesterol, LDL-C (direct if TG >400), HDL-C, triglycerides, and non-HDL-C','Y'),
    ('LIPID-02','LDL-C Goal Assessment','chronic','Document LDL-C target per risk: <70 for ASCVD/high-risk; <100 for moderate risk; <55 for very high-risk (FH with ASCVD)','Y'),
    ('LIPID-03','Statin Therapy Optimization','chronic','Confirm maximum tolerated statin dose; document statin intensity (high: atorvastatin 40–80, rosuvastatin 20–40)','Y'),
    ('LIPID-04','Non-Statin LDL-Lowering Therapy','chronic','If LDL not at goal on max statin: add ezetimibe first, then PCSK9 inhibitor (evolocumab, alirocumab), or bempedoic acid','Y'),
    ('LIPID-05','ASCVD 10-Year Risk Calculation','chronic','Calculate 10-year ASCVD risk using Pooled Cohort Equations; for FH patients, risk may be underestimated—use clinical judgment','Y'),
    ('LIPID-06','Familial Hypercholesterolemia Screening','chronic','For LDL ≥190 or clinical suspicion: calculate Dutch Lipid Clinic Network Score; consider genetic testing for LDLR/APOB/PCSK9 mutations','Y'),
    ('LIPID-07','Hepatic Safety Monitoring','chronic','Order ALT at baseline and as clinically indicated on statins; for PCSK9i or bempedoic acid, per FDA labeling','Y'),
    ('LIPID-08','Statin-Associated Muscle Symptoms (SAMS) Assessment','chronic','Document SAMS Clinical Index score if myalgia reported; rechallenge with alternate statin or lower dose before declaring intolerance','Y'),
    ('LIPID-09','Lipoprotein(a) Testing','chronic','Order Lp(a) at least once for patients with premature ASCVD, FH, or recurrent events despite LDL at goal; Lp(a) ≥50 nmol/L = elevated','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('LIPID-01',1,'Every 3–6 months (titrating); annually (at goal)','CMS347v7 / ACC/AHA'),
    ('LIPID-02',2,'Every visit during titration','ACC/AHA / NLA Guideline'),
    ('LIPID-03',3,'Every 3–6 months','CMS347v7 / ACC/AHA'),
    ('LIPID-04',4,'Per titration schedule','ACC/AHA / NLA Expert Consensus'),
    ('LIPID-05',5,'Every 4–6 years (or annually if borderline)','ACC/AHA Guideline'),
    ('LIPID-06',6,'At diagnosis (once)','NLA / FH Foundation'),
    ('LIPID-07',7,'At baseline + as indicated','ACC/AHA / FDA'),
    ('LIPID-08',8,'As reported','ACC/AHA / NLA'),
    ('LIPID-09',9,'Once (lifetime)','ACC/AHA / EAS Consensus')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 40: Post-Traumatic Stress Disorder (PTSD)  (F43.1x)  — 8 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('PTSD', 'Post-Traumatic Stress Disorder (PTSD)', 'F43.1%', 8,
  'VA/DoD CPG, CMS159v12',
  'PCL-5 assessment, trauma-focused psychotherapy, pharmacotherapy management, prazosin/sleep assessment, substance use screening, suicide risk, comorbid depression/anxiety, functional assessment.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'PTSD';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('PTSD-01','PTSD Symptom Assessment (PCL-5)','chronic','Administer PTSD Checklist for DSM-5 (PCL-5); document total score (clinical cutoff ≥31–33); track longitudinally','Y'),
    ('PTSD-02','Trauma-Focused Psychotherapy Engagement','chronic','Document referral to or engagement in evidence-based trauma therapy: CPT (Cognitive Processing Therapy) or PE (Prolonged Exposure)','Y'),
    ('PTSD-03','Pharmacotherapy Management','chronic','Review first-line SSRI/SNRI (sertraline, paroxetine, venlafaxine); document dose optimization and response','Y'),
    ('PTSD-04','Prazosin / Sleep Disturbance Assessment','chronic','For trauma-related nightmares: document sleep quality and consider prazosin trial; screen for comorbid OSA','Y'),
    ('PTSD-05','Comorbid Substance Use Screening','chronic','Screen for alcohol (AUDIT-C) and substance use (DAST-10); PTSD-SUD comorbidity rate is 40–60%','Y'),
    ('PTSD-06','Suicide Risk Assessment','chronic','Screen for suicidal ideation (C-SSRS or PHQ-9 Item 9); PTSD significantly elevates suicide risk; document safety plan','Y'),
    ('PTSD-07','Comorbid Depression/Anxiety Screening','chronic','Administer PHQ-9 and GAD-7; PTSD, MDD, and GAD frequently co-occur and require integrated treatment','Y'),
    ('PTSD-08','Functional & Occupational Assessment','chronic','Document impact on work capacity, social relationships, daily functioning, and quality of life','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('PTSD-01',1,'Every visit (minimum quarterly)','VA/DoD CPG / APA'),
    ('PTSD-02',2,'At diagnosis + ongoing','VA/DoD CPG / APA'),
    ('PTSD-03',3,'Every visit during titration','VA/DoD CPG / APA'),
    ('PTSD-04',4,'Every visit','VA/DoD CPG'),
    ('PTSD-05',5,'Every visit','VA/DoD CPG / SAMHSA'),
    ('PTSD-06',6,'Every visit','VA/DoD CPG / Joint Commission'),
    ('PTSD-07',7,'Every visit','CMS159v12 / VA/DoD CPG'),
    ('PTSD-08',8,'Every visit','VA/DoD CPG / APA')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 41: Bipolar Disorder  (F31.x)  — 9 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('BP', 'Bipolar Disorder', 'F31%', 9,
  'APA Guideline, APA, ADA/APA Metabolic Monitoring',
  'Mood episode assessment, mood stabilizer/antipsychotic review, lithium level/safety, valproate level/safety, metabolic monitoring, suicide risk, substance use, women health/contraception, functional/cognitive assessment.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'BP';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('BP-01','Mood Episode Assessment','chronic','Document current mood state (depressive, manic, hypomanic, mixed, euthymic) using clinical interview and mood charting','Y'),
    ('BP-02','Mood Stabilizer / Atypical Antipsychotic Review','chronic','Review lithium, valproate, lamotrigine, or atypical antipsychotic therapy; assess efficacy for current phase and maintenance','Y'),
    ('BP-03','Lithium Level & Safety Labs','chronic','For lithium patients: order serum lithium level (target 0.6–1.0 mEq/L maintenance), TSH, creatinine/eGFR, and calcium','Y'),
    ('BP-04','Valproate Level & Safety Labs','chronic','For valproate patients: order serum valproate level (50–125 mcg/mL), CBC with platelets, LFTs, and ammonia if symptomatic','Y'),
    ('BP-05','Metabolic Monitoring (Atypical Antipsychotics)','chronic','For SGAs (quetiapine, olanzapine, aripiprazole): order fasting glucose, HbA1c, lipid panel, weight, and waist circumference','Y'),
    ('BP-06','Suicide Risk Assessment','chronic','Screen for suicidal ideation at every visit; bipolar disorder carries 15–20x suicide risk vs. general population; document safety plan','Y'),
    ('BP-07','Substance Use Screening','chronic','Screen for alcohol and drug use; bipolar-SUD comorbidity rate is 40–70%; integrated treatment essential','Y'),
    ('BP-08','Women''s Health: Contraception & Pregnancy Planning','chronic','For reproductive-age women: document contraceptive counseling (valproate is teratogenic Category X); pre-conception mood stabilizer transition planning','Y'),
    ('BP-09','Functional & Cognitive Assessment','chronic','Document psychosocial functioning, occupational status, and screen for cognitive deficits (common in bipolar, especially with frequent episodes)','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('BP-01',1,'Every visit','APA Guideline'),
    ('BP-02',2,'Every visit','APA / CANMAT Guideline'),
    ('BP-03',3,'Every 3–6 months','APA Guideline'),
    ('BP-04',4,'Every 3–6 months','APA Guideline'),
    ('BP-05',5,'Every 3–12 months per ADA/APA','ADA/APA Metabolic Monitoring'),
    ('BP-06',6,'Every visit','APA / Joint Commission'),
    ('BP-07',7,'Every visit','APA / SAMHSA'),
    ('BP-08',8,'Annually (reproductive-age women)','APA / ACOG Guideline'),
    ('BP-09',9,'Annually','APA Guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 42: Tobacco Use Disorder  (F17.2x / Z87.891)  — 7 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('TOB', 'Tobacco Use Disorder', 'F17.2%,Z87.891%', 7,
  'CMS138v12, USPSTF, PHS Clinical Practice Guideline, PHS Guideline...',
  'Tobacco use documentation, cessation counseling (5 As), pharmacotherapy, quit date/follow-up, quitline referral, lung cancer screening (LDCT), comorbid condition impact.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'TOB';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('TOB-01','Tobacco Use Status Documentation','chronic','Document current tobacco use type (cigarettes, e-cigarettes, smokeless), quantity (pack-years), and quit history','Y'),
    ('TOB-02','Cessation Counseling (5 A''s)','chronic','Deliver the 5 A''s intervention: Ask, Advise, Assess readiness, Assist with quit plan, Arrange follow-up','Y'),
    ('TOB-03','Pharmacotherapy for Cessation','chronic','For patients ready to quit: prescribe first-line pharmacotherapy—varenicline (preferred), combination NRT (patch + gum/lozenge), or bupropion','Y'),
    ('TOB-04','Quit Date & Follow-Up Plan','chronic','Document target quit date; schedule follow-up within 1 week and again at 1 month; relapse prevention counseling','Y'),
    ('TOB-05','Quitline / Behavioral Support Referral','chronic','Refer to state tobacco quitline (1-800-QUIT-NOW) or digital cessation program; document referral','Y'),
    ('TOB-06','Lung Cancer Screening (LDCT)','chronic','For patients aged 50–80 with ≥20 pack-year history (current or quit <15 years): order annual low-dose CT chest','Y'),
    ('TOB-07','Comorbid Condition Impact Assessment','chronic','Document how tobacco use is impacting other chronic conditions: COPD, CAD, PAD, diabetes, wound healing, cancer risk','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('TOB-01',1,'Every visit','CMS138v12 / NQF 0028'),
    ('TOB-02',2,'Every visit','CMS138v12 / USPSTF'),
    ('TOB-03',3,'At quit attempt','USPSTF / PHS Guideline'),
    ('TOB-04',4,'Per quit attempt','PHS Clinical Practice Guideline'),
    ('TOB-05',5,'Per quit attempt','PHS Guideline / CMS'),
    ('TOB-06',6,'Annually (if eligible)','CMS / USPSTF Grade B'),
    ('TOB-07',7,'Annually','CMS / Multi-guideline')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 43: Alcohol Use Disorder (AUD)  (F10.x)  — 8 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('AUD', 'Alcohol Use Disorder (AUD)', 'F10%', 8,
  'CMS, USPSTF, APA, AASLD...',
  'AUDIT-C/AUDIT screening, brief intervention, pharmacotherapy, hepatic function, nutritional deficiency assessment, mental health screening, CIWA-Ar withdrawal risk, peer support referral.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'AUD';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('AUD-01','AUDIT-C / AUDIT Screening','chronic','Administer AUDIT-C (score ≥4 men, ≥3 women = positive) or full AUDIT (≥8 = hazardous); document severity','Y'),
    ('AUD-02','Brief Intervention & Motivational Counseling','chronic','For positive screen: deliver brief motivational intervention (SBIRT model); document readiness to change','Y'),
    ('AUD-03','Pharmacotherapy for AUD','chronic','For moderate-severe AUD: discuss FDA-approved medications—naltrexone (oral or injectable), acamprosate, or disulfiram','Y'),
    ('AUD-04','Hepatic Function Monitoring','chronic','Order hepatic panel (AST, ALT, GGT, albumin, bilirubin); GGT and AST:ALT ratio >2 suggest alcoholic liver injury','Y'),
    ('AUD-05','Nutritional Deficiency Assessment','chronic','Order thiamine (B1), folate, B12, magnesium, and phosphorus; thiamine supplementation critical to prevent Wernicke''s encephalopathy','Y'),
    ('AUD-06','Mental Health Comorbidity Screening','chronic','Screen for depression (PHQ-9), anxiety (GAD-7), PTSD (PC-PTSD-5), and other substance use; AUD-psychiatric comorbidity is >50%','Y'),
    ('AUD-07','CIWA-Ar Withdrawal Risk Assessment','chronic','For patients reducing or stopping heavy use: assess withdrawal risk using CIWA-Ar; medical detox if score ≥10 or seizure history','Y'),
    ('AUD-08','Peer Support & Recovery Program Referral','chronic','Document referral to mutual aid (AA/SMART Recovery), peer recovery support, or intensive outpatient program (IOP)','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('AUD-01',1,'Annually (every visit if AUD)','CMS / USPSTF Grade B'),
    ('AUD-02',2,'Every visit','USPSTF / SAMHSA'),
    ('AUD-03',3,'At diagnosis + ongoing','APA / SAMHSA / VA/DoD'),
    ('AUD-04',4,'Every 3–6 months','AASLD / APA'),
    ('AUD-05',5,'At diagnosis + every 6 months','APA / ASAM Guideline'),
    ('AUD-06',6,'Every visit','APA / SAMHSA / CMS159v12'),
    ('AUD-07',7,'At acute presentation','ASAM / APA Guideline'),
    ('AUD-08',8,'At diagnosis + ongoing','SAMHSA / APA')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 44: Venous Thromboembolism (VTE) – Chronic Anticoagulation  (I26.x / I82.x)  — 8 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('VTE', 'Venous Thromboembolism (VTE) – Chronic Anticoagulation', 'I26%,I82%', 8,
  'ASH, CHEST Guideline, CHEST',
  'Anticoagulation documentation, duration decision, INR monitoring, renal function for DOAC dosing, bleeding risk assessment, post-thrombotic syndrome screening, thrombophilia testing, compression therapy.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'VTE';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('VTE-01','Anticoagulation Therapy Documentation','chronic','Document current anticoagulant (DOAC preferred: rivaroxaban, apixaban; or warfarin if APS/mechanical valve); confirm duration plan (3–6 months vs. indefinite)','Y'),
    ('VTE-02','Duration of Therapy Decision','chronic','For unprovoked VTE: assess extended anticoagulation vs. discontinuation using HERDOO2 (women) or VTE-BLEED score; document shared decision','Y'),
    ('VTE-03','INR Monitoring (if on Warfarin)','chronic','For warfarin patients: order INR; target 2.0–3.0 (or 2.5–3.5 for APS); calculate time in therapeutic range (TTR target >70%)','Y'),
    ('VTE-04','Renal Function for DOAC Dosing','chronic','Order BMP/eGFR to guide DOAC dosing: apixaban dose reduction if eGFR 15–29 or age ≥80 + weight ≤60kg + Cr ≥1.5; rivaroxaban avoid if eGFR <30','Y'),
    ('VTE-05','Bleeding Risk Assessment','chronic','Calculate and document HAS-BLED score or VTE-BLEED; identify and address modifiable bleeding risk factors (uncontrolled HTN, concurrent antiplatelet, alcohol)','Y'),
    ('VTE-06','Post-Thrombotic Syndrome (PTS) Screening','chronic','For DVT patients: assess for PTS symptoms (leg swelling, pain, skin changes) using Villalta score at 3–6 months and annually','Y'),
    ('VTE-07','Thrombophilia Testing (if Indicated)','chronic','For unprovoked VTE in patients <50 or strong family history: consider antiphospholipid antibodies, factor V Leiden, prothrombin mutation; do NOT test on anticoagulation','Y'),
    ('VTE-08','Compression Therapy Assessment (DVT)','chronic','For proximal DVT patients with PTS symptoms: assess for graduated compression stockings (20–30 mmHg); evidence evolving','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('VTE-01',1,'At diagnosis + every visit','ASH / CHEST Guideline'),
    ('VTE-02',2,'At 3–6 months + annually','ASH / CHEST Guideline'),
    ('VTE-03',3,'Every 1–4 weeks','CHEST Guideline'),
    ('VTE-04',4,'Every 6–12 months','CHEST / FDA Labeling'),
    ('VTE-05',5,'Annually','CHEST / ASH Guideline'),
    ('VTE-06',6,'At 3–6 months + annually','ASH / ISTH Guideline'),
    ('VTE-07',7,'Once (off anticoagulation)','ASH / CHEST Guideline'),
    ('VTE-08',8,'At diagnosis + annually','ASH / ISTH')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- BUNDLE 45: Chronic Wound Management (Diabetic, Venous, Pressure)  (L97.x / L89.x / E11.621)  — 9 measures
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO phm_edw.condition_bundle (bundle_code, condition_name, icd10_pattern, bundle_size, key_ecqm_refs, description)
VALUES ('WND', 'Chronic Wound Management (Diabetic, Venous, Pressure)', 'L97%,L89%,E11.621%', 9,
  'WHS, SVS, IDSA DFI Guideline, IWGDF Guideline...',
  'Wound assessment/documentation, etiology classification, vascular assessment (ABI), infection surveillance, offloading (DFU), compression therapy (VLU), glycemic optimization, nutritional status, advanced therapy consideration.')
ON CONFLICT (bundle_code) DO NOTHING;

DO $$
DECLARE v_bid INT;
BEGIN
  SELECT bundle_id INTO v_bid FROM phm_edw.condition_bundle WHERE bundle_code = 'WND';

  INSERT INTO phm_edw.measure_definition (measure_code, measure_name, measure_type, description, active_ind)
  VALUES
    ('WND-01','Wound Assessment & Documentation','chronic','Measure and document wound dimensions (length × width × depth), location, wound bed (granulation, slough, necrotic), edges, periwound skin, and photograph','Y'),
    ('WND-02','Wound Etiology Classification','chronic','Classify wound type: neuropathic/diabetic foot ulcer (DFU), venous leg ulcer (VLU), arterial ulcer, or pressure injury; stage pressure injuries per NPUAP','Y'),
    ('WND-03','Vascular Assessment (ABI / Duplex)','chronic','For lower extremity wounds: order ABI to rule out arterial insufficiency (ABI <0.9 = PAD; >1.3 = calcification); venous duplex if suspected VLU','Y'),
    ('WND-04','Infection Surveillance & Culture','chronic','Assess for clinical signs of infection (erythema, warmth, purulence, odor); obtain tissue culture (not swab) if infection suspected; avoid routine antibiotics','Y'),
    ('WND-05','Offloading Device (DFU)','chronic','For plantar diabetic foot ulcers: prescribe total contact cast (TCC) or irremovable knee-high walker as gold standard offloading','Y'),
    ('WND-06','Compression Therapy (VLU)','chronic','For venous leg ulcers with ABI ≥0.8: prescribe multi-layer compression bandaging or compression wraps (30–40 mmHg); critical for healing','Y'),
    ('WND-07','Glycemic Optimization (DFU)','chronic','For diabetic wound patients: assess HbA1c and optimize glycemic control; target HbA1c <8% during active wound healing (avoid hypoglycemia)','Y'),
    ('WND-08','Nutritional Status Assessment','chronic','Order prealbumin, albumin, and assess caloric/protein intake; malnutrition significantly impairs wound healing; supplement as needed','Y'),
    ('WND-09','Advanced Therapy Consideration','chronic','For wounds not progressing (≥40% reduction in 4 weeks): document consideration of advanced therapies: NPWT, skin substitutes, hyperbaric oxygen','Y')
  ON CONFLICT DO NOTHING;

  INSERT INTO phm_edw.bundle_measure (bundle_id, measure_id, ordinal, frequency, ecqm_reference)
  SELECT v_bid, md.measure_id, x.ord, x.freq, x.ecqm
  FROM (VALUES
    ('WND-01',1,'Every visit (weekly during active tx)','WHS / WOCN Guideline'),
    ('WND-02',2,'At initial assessment','WHS / NPUAP / SVS'),
    ('WND-03',3,'At initial assessment','SVS / WHS Guideline'),
    ('WND-04',4,'Every visit','IDSA DFI Guideline / WHS'),
    ('WND-05',5,'At diagnosis + every visit','IWGDF Guideline'),
    ('WND-06',6,'At diagnosis + every visit','SVS / WHS Guideline'),
    ('WND-07',7,'Every 3 months','ADA / IWGDF'),
    ('WND-08',8,'At initial assessment + monthly','WHS / NPUAP'),
    ('WND-09',9,'At 4-week reassessment','WHS / CMS Coverage')
  ) AS x(code, ord, freq, ecqm)
  JOIN phm_edw.measure_definition md ON md.measure_code = x.code
  ON CONFLICT ON CONSTRAINT uq_bundle_measure DO NOTHING;
END $$;


-- ═════════════════════════════════════════════════════════════════════
-- OVERLAP RULES — Final cumulative update for all 45 bundles
-- ═════════════════════════════════════════════════════════════════════

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'MDD,T1D,PD,MS,IBD,PSO,PTSD,BP,AUD,ALZ,STR,MIG,OSA,GAD,PAIN,DM,HF',
  dedup_rule = 'Single PHQ-9 per visit; document in all applicable problem lists; for Bipolar: PHQ-9 screens depressive phase but does NOT replace mood episode assessment',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-PHQ9';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'GAD,PTSD,MIG,PAIN,MDD,IBD,BP,T1D,PD,MS',
  dedup_rule = 'Single GAD-7 covers all; for PTSD: supplement with PCL-5 for trauma-specific symptoms',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-GAD7';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'DM,HTN,CAD,HF,CKD,AFIB,PAD,STR,GOUT,OSA,T1D,PAH,VTE',
  dedup_rule = 'Single BP reading satisfies all 13+ conditions; strictest target applies: <130/80 for DM/CKD/Stroke/CAD',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-BP';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'DM,HTN,CAD,PAD,RA,STR,LIPID,T1D,PSO,HIV',
  dedup_rule = 'One annual fasting lipid panel satisfies all; one active statin covers all indications; use highest intensity required',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-STATIN';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'CKD,DM,HTN,AFIB,GOUT,EPI,HIV,SLE,BPH,VTE,T1D,PAH,ANEM,HF',
  dedup_rule = 'One BMP satisfies all 14+ conditions; use most frequent interval; flag drug dosing for DOACs, ASMs, antivirals, ULT',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-EGFR';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'OSTEO,RA,CKD,EPI,HIV,SLE,IBD,MS',
  dedup_rule = 'One DXA satisfies all; document which medication/condition triggered screening; shortest interval applies',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-DXA';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'COPD,ASTH,DM,CKD,HF,HIV,SCD,SLE,EPI,IBD,MS,PSO,HBV',
  dedup_rule = 'One annual vaccine review covers all; CRITICAL: live vaccines contraindicated on biologics/immunosuppression',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-FLU';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'HTN,DM,CAD,RA,GOUT,OSA,SLE,HIV,STR,PSO,LIPID',
  dedup_rule = 'One ASCVD calculation covers all; apply disease-specific multipliers; Lp(a) testing once for FH/premature ASCVD',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-ASCVD';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'CLD,RA,CKD,HCV,HIV,HBV',
  dedup_rule = 'One-time screening satisfies all; for HIV: annual re-screening if ongoing risk behavior',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-HEPBC';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'COPD,ASTH,CAD,PAD,HTN,STR,TOB,WND',
  dedup_rule = 'One tobacco screen + cessation intervention per visit; LDCT annually for eligible patients (50-80, >=20 pack-year)',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-SMOKING';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'OSTEO,PAD,MDD,ALZ,EPI,PD',
  dedup_rule = 'One annual fall risk screen covers all; for PD: include postural instability and freezing of gait assessment',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-FALLS';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'GAD,PAIN,HCV,ALZ,CLD,MDD,AUD,TOB,PTSD,BP',
  dedup_rule = 'One AUDIT-C + DAST-10 panel per visit covers all conditions; AUD requires full AUDIT if AUDIT-C positive',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-SUBSTANCE';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'ALZ,HF,SCD,HIV,PD,PAH,MS',
  dedup_rule = 'One ACP document satisfies all; update annually or at significant disease progression; include POLST for advanced disease',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-ACP';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'HCV,CLD,HBV',
  dedup_rule = 'One q6-month abdominal ultrasound satisfies all; continues indefinitely if cirrhosis present, even after viral cure',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-HCC';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'CAD,PAD,STR,AFIB,VTE',
  dedup_rule = 'Single anticoagulant/antiplatelet covers all; DOAC preferred unless APS or mechanical valve',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-ANTIPLATELET';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'OSA,OA,GOUT,OB,DM,HTN,WND',
  dedup_rule = 'Single BMI + counseling session covers all; document condition-specific weight loss benefits',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-WEIGHT';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'ALZ,STR,EPI,SCD,PD,MS',
  dedup_rule = 'One caregiver assessment per visit; use condition-specific tools; expand to include PD and MS caregivers',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-CAREGIVER';

UPDATE phm_edw.bundle_overlap_rule SET
  applicable_bundles = 'SLE,SCD,DM,T1D,PSO',
  dedup_rule = 'Coordinate into single annual eye exam when possible; document separate indications for each condition',
  updated_date = NOW()
WHERE rule_code = 'OVERLAP-OPHTHO';

-- Insert new overlap rules for set 31-45
INSERT INTO phm_edw.bundle_overlap_rule (rule_code, shared_domain, applicable_bundles, canonical_measure_code, dedup_rule)
VALUES
  ('OVERLAP-SUICIDE', 'Suicide Risk Assessment', 'BP,MDD,PTSD,AUD,PAIN,EPI,PD,GAD,SCD', NULL,
   'One C-SSRS or PHQ-9 Item 9 per visit satisfies all; Bipolar and PTSD have highest risk—always document safety plan'),
  ('OVERLAP-HEPATIC', 'Hepatic Panel (LFTs)', 'HBV,AUD,IBD,PSO,BP,LIPID,CLD,RA,HCV', NULL,
   'One hepatic panel covers all; frequency driven by highest-risk medication: q3 months for MTX/valproate, q6 months for biologics'),
  ('OVERLAP-TB', 'TB Screening (Pre-Biologic/Immunosuppression)', 'PSO,IBD,RA,SLE,MS', NULL,
   'One QuantiFERON satisfies all; repeat annually only if ongoing exposure risk; document before EACH new biologic class'),
  ('OVERLAP-WOMENS', 'Women''''s Health: Contraception & Teratogen Counseling', 'BP,EPI,PAH,SLE,PSO,RA', NULL,
   'One contraception counseling session covers all; document EACH teratogenic medication; pre-conception transition planning required'),
  ('OVERLAP-WOUND', 'Wound / Foot Examination', 'WND,T1D,DM,PAD,SCD,VTE', NULL,
   'One comprehensive lower extremity exam covers all; document vascular status (ABI), neuropathy (monofilament), and skin integrity separately'),
  ('OVERLAP-IRON', 'Iron / Nutritional Panel', 'ANEM,IBD,CKD,AUD,WND,SCD,HF', NULL,
   'One comprehensive panel (ferritin, TSAT, B12, folate, D) covers all; add thiamine for AUD, prealbumin for wounds'),
  ('OVERLAP-ANTICOAG', 'Anticoagulation Management', 'VTE,AFIB,HF,PAH', NULL,
   'One anticoagulant covers all indications; DOAC preferred unless APS or mechanical valve; one INR/renal monitoring schedule satisfies all')
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
WHERE cb.bundle_code IN ('T1D','IBD','MS','PD','PSO','HBV','PAH','ANEM','LIPID','PTSD','BP','TOB','AUD','VTE','WND');