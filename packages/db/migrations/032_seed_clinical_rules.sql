-- =============================================================================
-- 032: Seed clinical rules + diagnosis ontology (CDS parity Phase 1: D1+D2)
-- All values transcribed from cited sources — no invented clinical content.
-- Scoring-band jsonb convention: {"parameter","min","max","points"} where
--   min is inclusive, max is inclusive, null = unbounded. The Phase 5 scoring
--   engine selects the single band matching a value; bands are mutually
--   exclusive by construction.
-- SNOMED codes deliberately left NULL (terminology-service enrichment is a
-- follow-up) rather than guessed.
-- =============================================================================

-- ─── Entity: ALERT_THRESHOLDS ────────────────────────────────────────────────
-- Mirrors packages/shared/src/constants/index.ts ALERT_THRESHOLDS. The alert
-- worker reads these with the constant as fallback (migration of hardcoded logic
-- into data — Geisinger rules-engine doctrine).
INSERT INTO phm_edw.clinical_rule (entity, attribute, value_numeric, unit, source) VALUES
  ('ALERT_THRESHOLDS', 'CARE_GAP_WARNING_DAYS',        14,   'days',  'shared/constants ALERT_THRESHOLDS'),
  ('ALERT_THRESHOLDS', 'CARE_GAP_CRITICAL_DAYS',       30,   'days',  'shared/constants ALERT_THRESHOLDS'),
  ('ALERT_THRESHOLDS', 'RISK_HIGH_THRESHOLD',          70,   'score', 'shared/constants ALERT_THRESHOLDS'),
  ('ALERT_THRESHOLDS', 'RISK_CRITICAL_THRESHOLD',      85,   'score', 'shared/constants ALERT_THRESHOLDS'),
  ('ALERT_THRESHOLDS', 'MEASURE_COMPLIANCE_WARNING',   0.7,  'ratio', 'shared/constants ALERT_THRESHOLDS'),
  ('ALERT_THRESHOLDS', 'MEASURE_COMPLIANCE_CRITICAL',  0.5,  'ratio', 'shared/constants ALERT_THRESHOLDS'),
  ('ALERT_THRESHOLDS', 'LAB_CRITICAL_CHECK_HOURS',     24,   'hours', 'shared/constants ALERT_THRESHOLDS'),
  ('ALERT_THRESHOLDS', 'MED_ADHERENCE_WARNING_DAYS',   3,    'days',  'shared/constants ALERT_THRESHOLDS'),
  ('ALERT_THRESHOLDS', 'MED_ADHERENCE_CRITICAL_DAYS',  7,    'days',  'shared/constants ALERT_THRESHOLDS'),
  ('ALERT_THRESHOLDS', 'FOLLOWUP_OVERDUE_DAYS',        7,    'days',  'shared/constants ALERT_THRESHOLDS'),
  ('ALERT_THRESHOLDS', 'POPULATION_DRIFT_THRESHOLD',   0.05, 'ratio', 'shared/constants ALERT_THRESHOLDS');

-- ─── Entity: CKD_STAGING (KDIGO 2012 GFR categories) ─────────────────────────
INSERT INTO phm_edw.clinical_rule (entity, attribute, value_jsonb, unit, display_order, source) VALUES
  ('CKD_STAGING', 'GFR_BAND', '{"stage":"G1","label":"Normal/high (with kidney damage)","gfr_min":90,"gfr_max":null}'::jsonb,  'mL/min/1.73m2', 1, 'KDIGO 2012 CKD guideline'),
  ('CKD_STAGING', 'GFR_BAND', '{"stage":"G2","label":"Mildly decreased","gfr_min":60,"gfr_max":89}'::jsonb,                    'mL/min/1.73m2', 2, 'KDIGO 2012 CKD guideline'),
  ('CKD_STAGING', 'GFR_BAND', '{"stage":"G3a","label":"Mild-moderate","gfr_min":45,"gfr_max":59}'::jsonb,                      'mL/min/1.73m2', 3, 'KDIGO 2012 CKD guideline'),
  ('CKD_STAGING', 'GFR_BAND', '{"stage":"G3b","label":"Moderate-severe","gfr_min":30,"gfr_max":44}'::jsonb,                    'mL/min/1.73m2', 4, 'KDIGO 2012 CKD guideline'),
  ('CKD_STAGING', 'GFR_BAND', '{"stage":"G4","label":"Severely decreased","gfr_min":15,"gfr_max":29}'::jsonb,                  'mL/min/1.73m2', 5, 'KDIGO 2012 CKD guideline'),
  ('CKD_STAGING', 'GFR_BAND', '{"stage":"G5","label":"Kidney failure","gfr_min":null,"gfr_max":14}'::jsonb,                    'mL/min/1.73m2', 6, 'KDIGO 2012 CKD guideline');

-- ─── Entity: GLUCOMETRICS (compendium ch.03 — two transparent rules) ─────────
INSERT INTO phm_edw.clinical_rule (entity, attribute, value_numeric, unit, source) VALUES
  ('GLUCOMETRICS', 'HIGH_RISK_SINGLE_MGDL', 300, 'mg/dL', 'Geisinger CDS Compendium ch.03'),
  ('GLUCOMETRICS', 'HIGH_RISK_AVG_24H_MGDL', 180, 'mg/dL', 'Geisinger CDS Compendium ch.03'),
  ('GLUCOMETRICS', 'LOOKBACK_HOURS',          24, 'hours', 'Geisinger CDS Compendium ch.03');

-- ─── Entity: MEWS — scoring bands (compendium ch.04 matrix) ──────────────────
INSERT INTO phm_edw.clinical_rule (entity, attribute, value_jsonb, display_order, source) VALUES
  -- Temperature (°C)
  ('MEWS', 'SCORING_BAND', '{"parameter":"temp_c","min":null,"max":35.0,"points":2}'::jsonb,   10, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"temp_c","min":35.1,"max":38.4,"points":0}'::jsonb,   11, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"temp_c","min":38.5,"max":null,"points":2}'::jsonb,   12, 'Geisinger CDS Compendium ch.04'),
  -- Heart rate (bpm)
  ('MEWS', 'SCORING_BAND', '{"parameter":"heart_rate","min":null,"max":39,"points":2}'::jsonb, 20, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"heart_rate","min":40,"max":50,"points":1}'::jsonb,   21, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"heart_rate","min":51,"max":100,"points":0}'::jsonb,  22, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"heart_rate","min":101,"max":110,"points":1}'::jsonb, 23, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"heart_rate","min":111,"max":129,"points":2}'::jsonb, 24, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"heart_rate","min":130,"max":null,"points":3}'::jsonb,25, 'Geisinger CDS Compendium ch.04'),
  -- Systolic BP (mmHg)
  ('MEWS', 'SCORING_BAND', '{"parameter":"systolic_bp","min":null,"max":70,"points":3}'::jsonb, 30, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"systolic_bp","min":71,"max":80,"points":2}'::jsonb,   31, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"systolic_bp","min":81,"max":100,"points":1}'::jsonb,  32, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"systolic_bp","min":101,"max":199,"points":0}'::jsonb, 33, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"systolic_bp","min":200,"max":null,"points":2}'::jsonb,34, 'Geisinger CDS Compendium ch.04'),
  -- Respiratory rate (per min)
  ('MEWS', 'SCORING_BAND', '{"parameter":"resp_rate","min":null,"max":8,"points":2}'::jsonb,    40, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"resp_rate","min":9,"max":9,"points":1}'::jsonb,       41, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"resp_rate","min":10,"max":18,"points":0}'::jsonb,     42, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"resp_rate","min":19,"max":20,"points":1}'::jsonb,     43, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"resp_rate","min":21,"max":29,"points":2}'::jsonb,     44, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"resp_rate","min":30,"max":null,"points":3}'::jsonb,   45, 'Geisinger CDS Compendium ch.04'),
  -- Coma scale (GCS)
  ('MEWS', 'SCORING_BAND', '{"parameter":"gcs","min":15,"max":15,"points":0}'::jsonb,           50, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"gcs","min":13,"max":14,"points":1}'::jsonb,           51, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"gcs","min":10,"max":12,"points":2}'::jsonb,           52, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"gcs","min":6,"max":9,"points":3}'::jsonb,             53, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'SCORING_BAND', '{"parameter":"gcs","min":null,"max":5,"points":4}'::jsonb,          54, 'Geisinger CDS Compendium ch.04');

-- ─── Entity: MEWS — action ladder (compendium ch.04) ─────────────────────────
INSERT INTO phm_edw.clinical_rule (entity, attribute, value_jsonb, display_order, source) VALUES
  ('MEWS', 'ACTION_LADDER', '{"score_min":0,"score_max":2,"action":"Routine monitoring","owner":"Bedside RN"}'::jsonb,                                   1, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'ACTION_LADDER', '{"score_min":3,"score_max":3,"action":"Increased nursing surveillance","owner":"Bedside RN"}'::jsonb,                        2, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'ACTION_LADDER', '{"score_min":4,"score_max":4,"action":"Increased surveillance + notify provider","owner":"RN -> Provider"}'::jsonb,          3, 'Geisinger CDS Compendium ch.04'),
  ('MEWS', 'ACTION_LADDER', '{"score_min":5,"score_max":null,"action":"Rapid-response team + notify provider stat","owner":"RRT"}'::jsonb,                4, 'Geisinger CDS Compendium ch.04');

-- ─── Entity: NEWS2 — scoring bands (RCP National Early Warning Score 2, 2017) ─
-- SpO2 Scale 1 (default target range). Scale 2 (hypercapnic) deferred.
INSERT INTO phm_edw.clinical_rule (entity, attribute, value_jsonb, display_order, source) VALUES
  -- Respiration rate
  ('NEWS2', 'SCORING_BAND', '{"parameter":"resp_rate","min":null,"max":8,"points":3}'::jsonb,    10, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"resp_rate","min":9,"max":11,"points":1}'::jsonb,      11, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"resp_rate","min":12,"max":20,"points":0}'::jsonb,     12, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"resp_rate","min":21,"max":24,"points":2}'::jsonb,     13, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"resp_rate","min":25,"max":null,"points":3}'::jsonb,   14, 'RCP NEWS2 (2017)'),
  -- SpO2 (Scale 1)
  ('NEWS2', 'SCORING_BAND', '{"parameter":"spo2","min":null,"max":91,"points":3}'::jsonb,        20, 'RCP NEWS2 (2017) Scale 1'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"spo2","min":92,"max":93,"points":2}'::jsonb,          21, 'RCP NEWS2 (2017) Scale 1'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"spo2","min":94,"max":95,"points":1}'::jsonb,          22, 'RCP NEWS2 (2017) Scale 1'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"spo2","min":96,"max":null,"points":0}'::jsonb,        23, 'RCP NEWS2 (2017) Scale 1'),
  -- Air or supplemental oxygen
  ('NEWS2', 'SCORING_BAND', '{"parameter":"on_oxygen","value":false,"points":0}'::jsonb,         30, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"on_oxygen","value":true,"points":2}'::jsonb,          31, 'RCP NEWS2 (2017)'),
  -- Systolic BP
  ('NEWS2', 'SCORING_BAND', '{"parameter":"systolic_bp","min":null,"max":90,"points":3}'::jsonb, 40, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"systolic_bp","min":91,"max":100,"points":2}'::jsonb,  41, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"systolic_bp","min":101,"max":110,"points":1}'::jsonb, 42, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"systolic_bp","min":111,"max":219,"points":0}'::jsonb, 43, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"systolic_bp","min":220,"max":null,"points":3}'::jsonb,44, 'RCP NEWS2 (2017)'),
  -- Pulse
  ('NEWS2', 'SCORING_BAND', '{"parameter":"heart_rate","min":null,"max":40,"points":3}'::jsonb,  50, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"heart_rate","min":41,"max":50,"points":1}'::jsonb,    51, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"heart_rate","min":51,"max":90,"points":0}'::jsonb,    52, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"heart_rate","min":91,"max":110,"points":1}'::jsonb,   53, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"heart_rate","min":111,"max":130,"points":2}'::jsonb,  54, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"heart_rate","min":131,"max":null,"points":3}'::jsonb, 55, 'RCP NEWS2 (2017)'),
  -- Consciousness (ACVPU: Alert=0, Confusion/Voice/Pain/Unresponsive=3)
  ('NEWS2', 'SCORING_BAND', '{"parameter":"consciousness","value":"A","points":0}'::jsonb,       60, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"consciousness","value":"CVPU","points":3}'::jsonb,    61, 'RCP NEWS2 (2017)'),
  -- Temperature
  ('NEWS2', 'SCORING_BAND', '{"parameter":"temp_c","min":null,"max":35.0,"points":3}'::jsonb,    70, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"temp_c","min":35.1,"max":36.0,"points":1}'::jsonb,    71, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"temp_c","min":36.1,"max":38.0,"points":0}'::jsonb,    72, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"temp_c","min":38.1,"max":39.0,"points":1}'::jsonb,    73, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'SCORING_BAND', '{"parameter":"temp_c","min":39.1,"max":null,"points":2}'::jsonb,    74, 'RCP NEWS2 (2017)');

-- ─── Entity: NEWS2 — trigger thresholds (RCP 2017 clinical response) ─────────
INSERT INTO phm_edw.clinical_rule (entity, attribute, value_jsonb, display_order, source) VALUES
  ('NEWS2', 'TRIGGER', '{"band":"low","aggregate_min":0,"aggregate_max":4,"response":"Ward-based response"}'::jsonb,                                1, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'TRIGGER', '{"band":"low-medium","single_param_score":3,"response":"Urgent ward-based review by clinician"}'::jsonb,                    2, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'TRIGGER', '{"band":"medium","aggregate_min":5,"aggregate_max":6,"response":"Urgent response by clinical team"}'::jsonb,                3, 'RCP NEWS2 (2017)'),
  ('NEWS2', 'TRIGGER', '{"band":"high","aggregate_min":7,"aggregate_max":null,"response":"Emergency response / critical care"}'::jsonb,             4, 'RCP NEWS2 (2017)');

-- =============================================================================
-- Diagnosis ontology (D2). ICD-10-CM codes; SNOMED enrichment deferred.
-- specialty_lists drives role-based preference lists (Geisinger taxonomy doctrine).
-- =============================================================================

-- ─── CKD (staged, KDIGO-anchored) ────────────────────────────────────────────
INSERT INTO phm_edw.dx_ontology (icd10_code, dx_name, disease_process, organ_system, generate_plan, stage_label, stage_criteria, specialty_lists, display_order) VALUES
  ('N18.1',  'Chronic kidney disease, stage 1 (GFR >=90 with kidney damage)', 'CKD', 'Renal', TRUE, 'Stage 1',  '{"gfr_min":90,"gfr_max":null}'::jsonb, '{pcp,nephrology}', 1),
  ('N18.2',  'Chronic kidney disease, stage 2 (GFR 60-89)',                   'CKD', 'Renal', TRUE, 'Stage 2',  '{"gfr_min":60,"gfr_max":89}'::jsonb,   '{pcp,nephrology}', 2),
  ('N18.31', 'Chronic kidney disease, stage 3a (GFR 45-59)',                  'CKD', 'Renal', TRUE, 'Stage 3a', '{"gfr_min":45,"gfr_max":59}'::jsonb,   '{pcp,nephrology}', 3),
  ('N18.32', 'Chronic kidney disease, stage 3b (GFR 30-44)',                  'CKD', 'Renal', TRUE, 'Stage 3b', '{"gfr_min":30,"gfr_max":44}'::jsonb,   '{pcp,nephrology}', 4),
  ('N18.4',  'Chronic kidney disease, stage 4 (GFR 15-29)',                   'CKD', 'Renal', TRUE, 'Stage 4',  '{"gfr_min":15,"gfr_max":29}'::jsonb,   '{pcp,nephrology}', 5),
  ('N18.5',  'Chronic kidney disease, stage 5 (GFR <15)',                     'CKD', 'Renal', TRUE, 'Stage 5',  '{"gfr_min":null,"gfr_max":14}'::jsonb, '{pcp,nephrology}', 6),
  ('N18.6',  'End-stage renal disease',                                       'CKD', 'Renal', TRUE, 'ESRD',     NULL,                                  '{pcp,nephrology}', 7),
  ('N18.9',  'Chronic kidney disease, stage to be determined',               'CKD', 'Renal', TRUE, 'TBD',      NULL,                                  '{pcp,nephrology}', 8);

-- ─── Heart failure (function x etiology taxonomy; compendium ch.08) ──────────
INSERT INTO phm_edw.dx_ontology (icd10_code, dx_name, disease_process, organ_system, generate_plan, specialty_lists, display_order) VALUES
  ('I50.22',  'Heart failure, systolic (HFrEF), due to coronary artery disease', 'Heart Failure', 'Cardiovascular', TRUE, '{pcp,hospitalist,cardiology}', 10),
  ('I50.32',  'Heart failure, diastolic (HFpEF), due to hypertension',           'Heart Failure', 'Cardiovascular', TRUE, '{pcp,hospitalist,cardiology}', 11),
  ('I50.22',  'Heart failure, systolic, due to valvular disease',               'Heart Failure', 'Cardiovascular', TRUE, '{pcp,hospitalist,cardiology}', 12),
  ('I42.0',   'Idiopathic dilated cardiomyopathy with heart failure',          'Heart Failure', 'Cardiovascular', TRUE, '{pcp,hospitalist,cardiology}', 13),
  ('I27.81',  'Cor pulmonale, chronic',                                        'Heart Failure', 'Cardiovascular', TRUE, '{pcp,hospitalist,cardiology}', 14),
  ('I50.9',   'Heart failure, type/etiology to be determined',                 'Heart Failure', 'Cardiovascular', TRUE, '{pcp,hospitalist,cardiology}', 15),
  ('I50.21',  'Acute decompensated systolic heart failure',                    'Heart Failure', 'Cardiovascular', TRUE, '{hospitalist,cardiology}',     16),
  ('I50.31',  'Acute decompensated diastolic heart failure',                   'Heart Failure', 'Cardiovascular', TRUE, '{hospitalist,cardiology}',     17),
  ('I50.811', 'Acute right heart failure',                                     'Heart Failure', 'Cardiovascular', TRUE, '{hospitalist,cardiology}',     18),
  ('I50.23',  'Acute on chronic systolic heart failure',                       'Heart Failure', 'Cardiovascular', TRUE, '{hospitalist,cardiology}',     19),
  ('I50.33',  'Acute on chronic diastolic heart failure',                      'Heart Failure', 'Cardiovascular', TRUE, '{hospitalist,cardiology}',     20),
  ('I42.1',   'Hypertrophic obstructive cardiomyopathy',                       'Heart Failure', 'Cardiovascular', TRUE, '{cardiology}',                 21),
  ('I42.2',   'Hypertrophic cardiomyopathy, non-obstructive',                  'Heart Failure', 'Cardiovascular', TRUE, '{cardiology}',                 22),
  ('I42.5',   'Restrictive cardiomyopathy',                                    'Heart Failure', 'Cardiovascular', TRUE, '{cardiology}',                 23),
  ('I50.814', 'Right heart failure due to left heart failure',                 'Heart Failure', 'Cardiovascular', TRUE, '{cardiology}',                 24),
  ('I42.7',   'Cardiomyopathy due to drug or external agent (incl. chemo)',    'Heart Failure', 'Cardiovascular', TRUE, '{cardiology}',                 25),
  ('I42.8',   'Other cardiomyopathy (e.g., amyloid)',                          'Heart Failure', 'Cardiovascular', TRUE, '{cardiology}',                 26),
  ('I31.1',   'Chronic constrictive pericarditis',                            'Heart Failure', 'Cardiovascular', TRUE, '{cardiology}',                 27);

-- ─── Obesity (BMI-banded; compendium ch.08) ──────────────────────────────────
INSERT INTO phm_edw.dx_ontology (icd10_code, dx_name, disease_process, organ_system, generate_plan, stage_label, stage_criteria, specialty_lists, display_order) VALUES
  ('E66.3',  'Overweight (BMI 25.0-29.9)',                             'Obesity', 'Endocrine', TRUE, 'Overweight', '{"bmi_min":25,"bmi_max":29.9}'::jsonb,  '{pcp,endocrinology}', 30),
  ('E66.9',  'Obesity, Class I (BMI 30.0-34.9)',                       'Obesity', 'Endocrine', TRUE, 'Class I',    '{"bmi_min":30,"bmi_max":34.9}'::jsonb,  '{pcp,endocrinology}', 31),
  ('E66.9',  'Obesity, Class II (BMI 35.0-39.9)',                      'Obesity', 'Endocrine', TRUE, 'Class II',   '{"bmi_min":35,"bmi_max":39.9}'::jsonb,  '{pcp,endocrinology}', 32),
  ('E66.01', 'Morbid (severe) obesity, Class III (BMI >=40)',          'Obesity', 'Endocrine', TRUE, 'Class III',  '{"bmi_min":40,"bmi_max":null}'::jsonb,  '{pcp,endocrinology}', 33),
  ('E66.2',  'Morbid obesity with alveolar hypoventilation',          'Obesity', 'Endocrine', TRUE, NULL,         NULL,                                    '{pcp,endocrinology,pulmonology}', 34),
  ('E66.9',  'Obesity, BMI to be determined',                         'Obesity', 'Endocrine', TRUE, 'TBD',        NULL,                                    '{pcp,endocrinology}', 35);

-- ─── Dual-mapping exemplars (one code -> multiple disease processes) ─────────
INSERT INTO phm_edw.dx_ontology (icd10_code, dx_name, disease_process, organ_system, generate_plan, specialty_lists, display_order, notes) VALUES
  ('E11.22', 'Type 2 diabetes mellitus with diabetic chronic kidney disease', 'CKD',             'Renal',     TRUE, '{pcp,nephrology}',     40, 'Dual-mapped: same code drives both nephrology and endocrine care plans'),
  ('E11.22', 'Type 2 diabetes mellitus with diabetic chronic kidney disease', 'Chronic Diabetes','Endocrine', TRUE, '{pcp,endocrinology}', 41, 'Dual-mapped: same code drives both nephrology and endocrine care plans');

-- ─── Placeholder exemplar (uncomfortable generic) ────────────────────────────
INSERT INTO phm_edw.dx_ontology (icd10_code, dx_name, disease_process, organ_system, generate_plan, stage_label, specialty_lists, display_order) VALUES
  ('J45.909', 'Asthma, severity to be determined', 'Asthma', 'Pulmonary', TRUE, 'TBD', '{pcp,pulmonology}', 50);
