-- =====================================================================
-- 020_seed_order_catalog.sql
-- Tier 6: Seed order sets + items from Medgnosis_OrderSet_LOINC_CPT.xlsx
-- 45 order sets (one per disease bundle) + 354 order set items
-- =====================================================================

-- Step 1: Add columns to link order_set → bundles and order_set_item → measures
ALTER TABLE phm_edw.order_set
  ADD COLUMN IF NOT EXISTS bundle_code VARCHAR(10),
  ADD COLUMN IF NOT EXISTS bundle_id INT;

ALTER TABLE phm_edw.order_set_item
  ADD COLUMN IF NOT EXISTS measure_id INT,
  ADD COLUMN IF NOT EXISTS loinc_description VARCHAR(300),
  ADD COLUMN IF NOT EXISTS cpt_description VARCHAR(300),
  ADD COLUMN IF NOT EXISTS ecqm_reference VARCHAR(50),
  ADD COLUMN IF NOT EXISTS guideline_source VARCHAR(200),
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Step 2: Seed order sets and items
DO $$
DECLARE
  v_set_id INT;
  v_bundle_id INT;
  v_measure_id INT;
BEGIN

  -- ── Atrial Fibrillation (AFIB) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'AFIB' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Atrial Fibrillation Order Set', 'clinical', 'AFIB', v_bundle_id, 'Atrial Fibrillation clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'ECG / Rhythm Monitoring', 'imaging', NULL, NULL, '93000', 'ECG complete; Holter monitor', 'Every visit', NULL, 'ACC/AHA/HRS 2023', '12-lead ECG or continuous monitor', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CHA2DS2-VASc Score', 'procedure', NULL, NULL, '99214', 'Office visit; risk score calculation', 'Annual', NULL, 'ACC/AHA/HRS 2023', 'Stroke risk assessment', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Anticoagulation (DOAC/Warfarin)', 'medication', '6301-6', 'INR; DOAC level', '85610', 'PT/INR; Office visit anticoag review', 'Every visit', 'CMS164v12', 'ACC/AHA/HRS 2023', 'OAC for CHA2DS2-VASc ≥2 (men) or ≥3 (women)', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Echocardiogram', 'imaging', NULL, NULL, '93306', 'TTE complete with Doppler', 'Baseline + PRN', NULL, 'ACC/AHA/HRS 2023', 'Assess cardiac structure and function', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Thyroid Function (TSH)', 'lab', '3016-3', 'TSH in Serum', '84443', 'TSH', 'Baseline + Annual', NULL, 'ACC/AHA/HRS 2023', 'Rule out hyperthyroidism', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Rate/Rhythm Control Review', 'medication', '8867-4', 'Heart rate', '99214', 'Office visit; rate control review', 'Every visit', NULL, 'ACC/AHA/HRS 2023', 'HR target <110 resting, medication review', v_measure_id, 6);


  -- ── Alzheimer's / Dementia (ALZ) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'ALZ' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Alzheimer''s / Dementia Order Set', 'clinical', 'ALZ', v_bundle_id, 'Alzheimer''s / Dementia clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Cognitive Assessment (MMSE/MoCA)', 'procedure', '72106-8', 'MMSE total; MoCA total', '96116', 'Neurobehavioral exam; Neuropsych testing', 'Every 6 mo', 'CMS149v12', 'AAN 2023', 'Standardized cognitive screening', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Depression Screening (PHQ-9)', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Annual', 'CMS2v13', 'AAN 2023', 'Comorbid depression screening', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Functional Assessment (ADL/IADL)', 'procedure', '75261-8', 'ADL total; IADL score', '96127', 'Behavioral assessment; Office visit', 'Every 6 mo', NULL, 'AAN 2023', 'Activities of daily living evaluation', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Medication Reconciliation', 'medication', NULL, NULL, '99483', 'Cognitive assessment & care plan', 'Every visit', NULL, 'AGS Beers 2023', 'Review all meds for anticholinergic burden', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Caregiver Assessment', 'procedure', NULL, NULL, '99483', 'Cognitive care plan; Health risk interpretation', 'Annual', NULL, 'AAN 2023', 'Caregiver burden / burnout evaluation', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'B12 / Folate Level', 'lab', '2132-9', 'Cobalamin in Serum; Folate in Serum', '82607', 'Vitamin B12; Folic acid', 'Baseline', NULL, 'AAN 2023', 'Reversible dementia workup', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'TSH Level', 'lab', '3016-3', 'TSH in Serum', '84443', 'TSH', 'Baseline', NULL, 'AAN 2023', 'Reversible cause exclusion', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Fall Risk Assessment', 'procedure', '73830-2', 'Fall risk assessment', '99214', 'Office visit + Therapeutic exercises', 'Every 6 mo', 'CMS139v12', 'AGS/BGS 2023', 'Balance and gait evaluation', v_measure_id, 8);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 9
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Advance Care Planning', 'procedure', NULL, NULL, '99497', 'ACP initial 30 min; each add''l 30 min', 'Annual', 'CMS157v12', 'AAN 2023', 'Goals of care discussion', v_measure_id, 9);


  -- ── Chronic Anemia (ANEM) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'ANEM' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Chronic Anemia Order Set', 'clinical', 'ANEM', v_bundle_id, 'Chronic Anemia clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC with Differential', 'lab', '58410-2', 'CBC panel; Reticulocyte count', '85025', 'CBC with differential; Reticulocyte count', 'Every 3 mo', NULL, 'ASH 2023', 'Hemoglobin, MCV, reticulocyte count', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Iron Studies', 'lab', '2276-4', 'Ferritin; Iron+TIBC; Transferrin sat', '82728', 'Ferritin; Iron serum; Transferrin', 'Every 3-6 mo', NULL, 'ASH 2023', 'Ferritin, TIBC, iron, transferrin sat', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Vitamin B12 / Folate', 'lab', '2132-9', 'Cobalamin in Serum; Folate in Serum', '82607', 'Vitamin B12; Folic acid', 'Baseline + Annual', NULL, 'ASH 2023', 'Macrocytic anemia workup', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Reticulocyte Production Index', 'procedure', '17849-1', 'Reticulocyte count', '85044', 'Reticulocyte count; auto reticulocyte', 'Every 6 mo', NULL, 'ASH 2023', 'Bone marrow response assessment', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Comprehensive Metabolic Panel', 'lab', '24323-8', 'Comprehensive metabolic panel', '80053', 'Comprehensive metabolic panel (CMP)', 'Every 6 mo', NULL, 'ASH/KDIGO 2023', 'Renal function for EPO consideration', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Stool Guaiac / FIT', 'lab', '57905-2', 'Fecal occult blood; FIT test', '82270', 'Occult blood stool; FIT', 'Annual', NULL, 'ASH/ACG 2023', 'GI blood loss screening', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Peripheral Blood Smear', 'lab', NULL, NULL, '85060', 'Peripheral blood smear interpretation', 'Baseline + PRN', NULL, 'ASH 2023', 'Morphology review', v_measure_id, 7);


  -- ── Persistent Asthma (ASTH) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'ASTH' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Persistent Asthma Order Set', 'clinical', 'ASTH', v_bundle_id, 'Persistent Asthma clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Spirometry / PFT', 'procedure', '19926-5', 'FEV1; FVC', '94010', 'Spirometry; Bronchodilator response', 'Annual', NULL, 'GINA 2024', 'FEV1, FVC, FEV1/FVC ratio', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Asthma Control Assessment (ACT)', 'lab', '82672-8', 'Asthma control test score', '99214', 'Office visit; ACT assessment', 'Every visit', NULL, 'GINA 2024', 'Asthma Control Test or ACQ score', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Peak Flow Monitoring', 'procedure', '19935-6', 'Peak expiratory flow rate', '94150', 'Vital capacity; peak flow', 'Every visit', NULL, 'GINA 2024', 'Home peak flow meter education', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'IgE Level (if allergic)', 'procedure', '19113-0', 'IgE in Serum', '82785', 'IgE, quantitative', 'Baseline', NULL, 'GINA 2024', 'Total IgE for allergic phenotyping', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Eosinophil Count', 'procedure', '26449-9', 'Eosinophils/100 WBC in Blood', '85025', 'CBC with differential', 'Annual', NULL, 'GINA 2024', 'Peripheral eosinophil count for phenotyping', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Inhaler Technique Review', 'procedure', NULL, NULL, '94664', 'Aerosol/inhaler demonstration & evaluation', 'Every visit', NULL, 'GINA 2024', 'Assess and educate on proper technique', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Asthma Action Plan Review', 'procedure', NULL, NULL, '99214', 'Office visit + Self-management education', 'Annual', NULL, 'GINA 2024', 'Written action plan update', v_measure_id, 7);


  -- ── Alcohol Use Disorder (AUD) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'AUD' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Alcohol Use Disorder Order Set', 'clinical', 'AUD', v_bundle_id, 'Alcohol Use Disorder clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'AUDIT-C / AUDIT Screening', 'procedure', '72109-2', 'AUDIT-C total score', '99408', 'Substance screening; SBIRT alcohol', 'Every visit', NULL, 'USPSTF 2018 / NIAAA', 'Alcohol use severity', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hepatic Function Panel', 'lab', '24325-3', 'Hepatic function panel', '80076', 'Hepatic function panel', 'Every 3-6 mo', NULL, 'AASLD 2023', 'Liver function monitoring', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC with Differential', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Every 6 mo', NULL, 'NIAAA 2023', 'Macrocytosis (MCV), cytopenias', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Comprehensive Metabolic Panel', 'lab', '24323-8', 'Comprehensive metabolic panel', '80053', 'Comprehensive metabolic panel (CMP)', 'Every 6 mo', NULL, 'NIAAA 2023', 'Electrolytes, renal function', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'GGT Level', 'procedure', '2324-2', 'GGT in Serum', '82977', 'GGT', 'Every 3-6 mo', NULL, 'NIAAA 2023', 'Sensitive marker for alcohol use', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Vitamin B1 (Thiamine) / B12', 'lab', '32551-1', 'Thiamine in Blood; Cobalamin in Serum', '84425', 'Thiamine; Vitamin B12', 'Baseline + PRN', NULL, 'NIAAA 2023', 'Wernicke-Korsakoff prevention', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Depression Screening (PHQ-9)', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Every visit', 'CMS2v13', 'APA 2023', 'Mental health comorbidity', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'MAT Review', 'procedure', NULL, NULL, '99214', 'Office visit; MAT behavioral health counseling', 'Every visit', NULL, 'ASAM 2023', 'Naltrexone/acamprosate adherence', v_measure_id, 8);


  -- ── Bipolar Disorder (BP) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'BP' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Bipolar Disorder Order Set', 'clinical', 'BP', v_bundle_id, 'Bipolar Disorder clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Mood Charting / MDQ', 'procedure', NULL, NULL, '99214', 'Office visit; mood assessment', 'Every visit', NULL, 'APA 2023', 'Mood Disorder Questionnaire or life chart', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'PHQ-9 Screening', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Every visit', 'CMS2v13', 'APA 2023', 'Depression phase monitoring', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Suicide Risk Assessment', 'procedure', '93441-4', 'Columbia Suicide Severity Rating', '96160', 'Health risk assessment', 'Every visit', NULL, 'APA 2023', 'Columbia or ASQ screening', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lithium Level', 'medication', '3719-2', 'Lithium in Serum', '80178', 'Lithium level', 'Every 3-6 mo', NULL, 'APA 2023', 'Therapeutic drug monitoring', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Thyroid Function (TSH)', 'lab', '3016-3', 'TSH in Serum', '84443', 'TSH', 'Every 6 mo', NULL, 'APA 2023', 'Lithium-induced hypothyroidism', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Renal Function Panel', 'lab', '51990-0', 'BMP; eGFR', '80048', 'BMP; Creatinine', 'Every 6 mo', NULL, 'APA 2023', 'Lithium nephrotoxicity', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC / CMP', 'lab', '58410-2', 'CBC panel; CMP', '85025', 'CBC with differential; CMP', 'Every 6 mo', NULL, 'APA 2023', 'Mood stabilizer toxicity', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Metabolic Monitoring', 'lab', '39156-5', 'BMI; Lipid panel; HbA1c', '99214', 'Office visit; Lipid panel; HbA1c', 'Every 6 mo', NULL, 'ADA/APA 2023', 'Weight, glucose, lipids (antipsychotic side effects)', v_measure_id, 8);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 9
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Substance Use Screening', 'procedure', '72109-2', 'AUDIT-C; DAST-10 score', '99408', 'Substance screening; SBIRT', 'Every 6 mo', NULL, 'APA 2023', 'AUDIT/DAST for comorbidity', v_measure_id, 9);


  -- ── Benign Prostatic Hyperplasia (BPH) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'BPH' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Benign Prostatic Hyperplasia Order Set', 'clinical', 'BPH', v_bundle_id, 'Benign Prostatic Hyperplasia clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'IPSS / AUA Symptom Score', 'procedure', NULL, NULL, '99214', 'Office visit; IPSS assessment', 'Every visit', NULL, 'AUA 2021', 'International Prostate Symptom Score', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'PSA Level', 'procedure', '2857-1', 'PSA in Serum', '84153', 'PSA; total', 'Annual', NULL, 'AUA 2021', 'Prostate cancer screening', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Urinalysis', 'procedure', '24356-8', 'Urinalysis complete panel', '81003', 'Urinalysis; automated with microscopy', 'Annual', NULL, 'AUA 2021', 'UTI and hematuria screening', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Creatinine / eGFR', 'lab', '48642-3', 'eGFR CKD-EPI', '82565', 'Creatinine; blood', 'Annual', NULL, 'AUA 2021', 'Renal function on alpha-blockers', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Post-Void Residual', 'imaging', NULL, NULL, '51798', 'Post-void residual by ultrasound', 'Baseline + PRN', NULL, 'AUA 2021', 'PVR ultrasound', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Medication Review (Alpha-Blocker/5ARI)', 'medication', NULL, NULL, '99214', 'Office visit; BPH medication review', 'Every 6 mo', NULL, 'AUA 2021', 'Tamsulosin/finasteride efficacy and side effects', v_measure_id, 6);


  -- ── Coronary Artery Disease (CAD) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'CAD' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Coronary Artery Disease Order Set', 'clinical', 'CAD', v_bundle_id, 'Coronary Artery Disease clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Every 6-12 mo', 'CMS347v7', 'ACC/AHA 2018', 'LDL target <70 mg/dL for very high risk', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Blood Pressure Screening', 'lab', '85354-9', 'Blood pressure panel', '99473', 'Self-measured BP education', 'Every visit', 'CMS165v12', 'ACC/AHA 2017', 'Target <130/80 mmHg', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Antiplatelet Therapy Review', 'lab', NULL, NULL, '99214', 'Office visit; medication review', 'Every visit', NULL, 'ACC/AHA 2021', 'Aspirin or P2Y12 inhibitor adherence', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'High-Intensity Statin Therapy', 'medication', NULL, NULL, '99214', 'Office visit; statin Rx review', 'Annual review', 'CMS347v7', 'ACC/AHA 2018', 'Atorvastatin 40-80mg or Rosuvastatin 20-40mg', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Beta-Blocker Therapy (Post-MI)', 'medication', NULL, NULL, '99214', 'Office visit; beta-blocker review', 'Annual review', NULL, 'ACC/AHA 2021', 'Beta-blocker for post-MI or HFrEF', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'ACE/ARB Therapy', 'medication', NULL, NULL, '99214', 'Office visit; ACEI/ARB review', 'Annual review', NULL, 'ACC/AHA 2021', 'ACEI or ARB for LV dysfunction or DM', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Depression Screening (PHQ-9)', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Annual', 'CMS2v13', 'AHA 2008', 'Annual depression screening post-ACS', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Cardiac Rehab Referral', 'referral', NULL, NULL, '93798', 'Cardiac rehab; physician direction', 'Post-event', NULL, 'ACC/AHA 2021', 'Referral to cardiac rehabilitation', v_measure_id, 8);


  -- ── Chronic Kidney Disease (CKD) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'CKD' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Chronic Kidney Disease Order Set', 'clinical', 'CKD', v_bundle_id, 'Chronic Kidney Disease clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'eGFR / Serum Creatinine', 'lab', '48642-3', 'eGFR CKD-EPI; eGFR cystatin', '82565', 'Creatinine; blood', 'Every 3-6 mo', 'CMS134v12', 'KDIGO 2024', 'eGFR calculation for CKD staging', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Urine ACR', 'lab', '9318-7', 'Albumin/Creatinine [Mass Ratio] in Urine', '82043', 'Urinalysis; albumin quantitative', 'Every 6-12 mo', 'CMS134v12', 'KDIGO 2024', 'Albuminuria quantification', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Comprehensive Metabolic Panel', 'lab', '24323-8', 'Comprehensive metabolic panel', '80053', 'Comprehensive metabolic panel (CMP)', 'Every 3-6 mo', NULL, 'KDIGO 2024', 'Electrolytes, Ca, Phos, bicarb', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Every 6-12 mo', NULL, 'KDIGO 2024', 'Anemia of CKD screening', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'PTH Level', 'lab', '2731-8', 'Intact PTH in Serum', '83970', 'PTH, intact', 'Every 6-12 mo', NULL, 'KDIGO 2024', 'Secondary hyperparathyroidism (Stage 3+)', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Vitamin D Level', 'procedure', '1989-3', '25-Hydroxyvitamin D in Serum', '82306', 'Vitamin D; 25-hydroxy', 'Annual', NULL, 'KDIGO 2024', '25-OH Vitamin D for bone health', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Blood Pressure Screening', 'lab', '85354-9', 'Blood pressure panel', '99473', 'Self-measured BP education', 'Every visit', 'CMS165v12', 'KDIGO 2024', 'Target <120/80 per KDIGO 2024', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Annual', 'CMS347v7', 'KDIGO 2024', 'CVD risk management', v_measure_id, 8);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 9
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Nephrology Referral (Stage 4+)', 'referral', NULL, NULL, '99242', 'Nephrology consultation', 'PRN', NULL, 'KDIGO 2024', 'Referral when eGFR <30 or rapid decline', v_measure_id, 9);


  -- ── Chronic Liver Disease / NAFLD (CLD) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'CLD' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Chronic Liver Disease / NAFLD Order Set', 'clinical', 'CLD', v_bundle_id, 'Chronic Liver Disease / NAFLD clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hepatic Function Panel', 'lab', '24325-3', 'Hepatic function panel', '80076', 'Hepatic function panel', 'Every 6 mo', NULL, 'AASLD 2023', 'AST, ALT, ALP, bilirubin, albumin', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'FIB-4 Index', 'procedure', NULL, NULL, '80076', 'Hepatic panel + CBC (for calculation)', 'Annual', NULL, 'AASLD 2023', 'Non-invasive fibrosis assessment', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Annual', 'CMS347v7', 'AASLD 2023', 'CVD risk (leading cause of death in NAFLD)', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Fasting Glucose / A1c', 'lab', '1558-6', 'Fasting glucose; HbA1c', '82947', 'Glucose quantitative; HbA1c', 'Annual', 'CMS122v12', 'ADA/AASLD 2023', 'Diabetes screening', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hepatitis B/C Screening', 'procedure', '16933-4', 'HBsAg; HCV Ab', '87340', 'HBsAg; HCV antibody', 'Baseline', NULL, 'AASLD 2023', 'Rule out viral hepatitis', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Abdominal Ultrasound', 'imaging', NULL, NULL, '76700', 'US abdomen complete; US abdomen limited', 'Baseline + Annual', NULL, 'AASLD 2023', 'Hepatic steatosis assessment', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'FibroScan / Elastography', 'imaging', NULL, NULL, '91200', 'Liver elastography', 'Annual (if indicated)', NULL, 'AASLD 2023', 'Liver stiffness measurement (if FIB-4 elevated)', v_measure_id, 7);


  -- ── Chronic Obstructive Pulmonary Disease (COPD) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'COPD' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Chronic Obstructive Pulmonary Disease Order Set', 'clinical', 'COPD', v_bundle_id, 'Chronic Obstructive Pulmonary Disease clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Spirometry / PFT', 'procedure', '19926-5', 'FEV1; FVC', '94010', 'Spirometry; Bronchodilator response', 'Annual', NULL, 'GOLD 2024', 'FEV1/FVC for GOLD staging', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Pulse Oximetry', 'procedure', '2708-6', 'Oxygen saturation arterial; pulse ox', '94760', 'Pulse oximetry; multiple determinations', 'Every visit', NULL, 'GOLD 2024', 'SpO2 at rest and with exertion', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Chest X-Ray', 'imaging', NULL, NULL, '71046', 'Chest X-ray, 2 views', 'Annual or PRN', NULL, 'GOLD 2024', 'Baseline and acute exacerbation evaluation', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Annual', NULL, 'GOLD 2024', 'Rule out anemia, polycythemia', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Inhaler Technique Review', 'procedure', NULL, NULL, '94664', 'Aerosol/inhaler demonstration & evaluation', 'Every visit', NULL, 'GOLD 2024', 'Assess and educate on proper inhaler use', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Influenza Vaccination', 'procedure', NULL, NULL, '90686', 'Flu vaccine IIV4; admin', 'Annual', 'CMS147v13', 'GOLD 2024', 'Annual influenza vaccine', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Pneumococcal Vaccination', 'procedure', NULL, NULL, '90671', 'PCV15; PCV20', 'Once + booster', 'CMS127v12', 'ACIP 2023', 'PCV20 or PCV15+PPSV23', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Tobacco Cessation Counseling', 'procedure', '39240-7', 'Tobacco use status', '99406', 'Smoking cessation counseling 3-10 min; >10 min', 'Every visit', 'CMS138v12', 'USPSTF 2021', 'Smoking cessation intervention', v_measure_id, 8);


  -- ── Type 2 Diabetes Mellitus (DM) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'DM' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Type 2 Diabetes Mellitus Order Set', 'clinical', 'DM', v_bundle_id, 'Type 2 Diabetes Mellitus clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'HbA1c Monitoring', 'lab', '4548-4', 'HbA1c in Blood', '83036', 'Hemoglobin; glycosylated (A1c)', 'Every 3-6 mo', 'CMS122v12', 'ADA Standards of Care 2024', 'Hemoglobin A1c test every 3-6 months', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Fasting Glucose', 'lab', '1558-6', 'Fasting glucose [Mass/Vol]', '82947', 'Glucose; quantitative, blood', 'Every 3-6 mo', 'CMS122v12', 'ADA 2024', 'Fasting blood glucose measurement', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Annual', 'CMS347v7', 'ACC/AHA 2018', 'Complete fasting lipid panel (TC, LDL, HDL, TG)', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Blood Pressure Screening', 'lab', '85354-9', 'Blood pressure panel', '99473', 'Self-measured BP; patient education/training', 'Every visit', 'CMS165v12', 'ADA/AHA 2024', 'Office BP measurement, target <130/80 mmHg', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Urine Albumin-to-Creatinine Ratio', 'lab', '9318-7', 'Albumin/Creatinine [Mass Ratio] in Urine', '82043', 'Urinalysis; albumin, quantitative', 'Annual', 'CMS134v12', 'KDIGO 2024', 'Spot urine ACR for nephropathy screening', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Diabetic Eye Exam', 'imaging', '32451-7', 'Diabetic retinal exam', '92250', 'Fundus photography; Remote retinal imaging', 'Annual', 'CMS131v12', 'AAO/ADA 2024', 'Dilated retinal examination or retinal imaging', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Diabetic Foot Exam', 'procedure', '11428-0', 'Foot exam finding', '99213', 'Office visit + Foot exam for diabetic', 'Annual', 'CMS123v12', 'ADA 2024', 'Comprehensive foot exam (monofilament + pulse check)', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Statin Therapy', 'medication', NULL, NULL, '99214', 'Office visit; statin Rx review', 'Annual review', 'CMS347v7', 'ACC/AHA 2018 / ADA 2024', 'Moderate-to-high intensity statin for ages 40-75', v_measure_id, 8);


  -- ── Epilepsy / Seizure Disorder (EPI) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'EPI' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Epilepsy / Seizure Disorder Order Set', 'clinical', 'EPI', v_bundle_id, 'Epilepsy / Seizure Disorder clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Seizure Frequency Log', 'procedure', NULL, NULL, '99214', 'Office visit; seizure diary review', 'Every visit', NULL, 'AAN/AES 2023', 'Seizure diary review', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'AED Drug Levels', 'procedure', '3968-5', 'Valproic acid; Carbamazepine; Levetiracetam', '80164', 'Valproic acid level; Carbamazepine; Levetiracetam', 'Every 6-12 mo', NULL, 'AAN 2023', 'Therapeutic drug monitoring', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC with Differential', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Every 6 mo', NULL, 'AAN 2023', 'Monitor for AED hematologic toxicity', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hepatic Function Panel', 'lab', '24325-3', 'Hepatic function panel', '80076', 'Hepatic function panel', 'Every 6 mo', NULL, 'AAN 2023', 'AED hepatotoxicity monitoring', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Comprehensive Metabolic Panel', 'lab', '24323-8', 'Comprehensive metabolic panel', '80053', 'Comprehensive metabolic panel (CMP)', 'Every 6 mo', NULL, 'AAN 2023', 'Electrolytes, sodium for AED effects', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'EEG', 'procedure', NULL, NULL, '95816', 'EEG awake only; awake and asleep', 'Baseline + PRN', NULL, 'AAN 2023', 'Electroencephalogram baseline and PRN', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Depression/Anxiety Screening', 'procedure', '44249-1', 'PHQ-9; GAD-7 score', '96127', 'Brief emotional/behavioral assessment', 'Annual', 'CMS2v13', 'AAN 2023', 'PHQ-9 + GAD-7', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Bone Density (DEXA)', 'imaging', '38263-0', 'DXA bone density T-score', '77080', 'DEXA axial skeleton', 'Every 2 years', 'CMS249v5', 'AAN/NOF 2023', 'AED-induced osteoporosis', v_measure_id, 8);


  -- ── Generalized Anxiety Disorder (GAD) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'GAD' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Generalized Anxiety Disorder Order Set', 'clinical', 'GAD', v_bundle_id, 'Generalized Anxiety Disorder clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'GAD-7 Screening', 'procedure', '69737-5', 'GAD-7 total score', '96127', 'Brief emotional/behavioral assessment', 'Every visit', NULL, 'APA 2023', 'Standardized anxiety severity', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'PHQ-9 Screening', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Every visit', 'CMS2v13', 'APA 2023', 'Depression comorbidity screening', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Suicide Risk Assessment', 'procedure', '93441-4', 'Columbia Suicide Severity Rating', '96160', 'Health risk assessment', 'Every visit', NULL, 'APA 2023', 'Columbia or ASQ screening', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Thyroid Function (TSH)', 'lab', '3016-3', 'TSH in Serum', '84443', 'TSH', 'Baseline', NULL, 'APA 2023', 'Rule out thyroid cause of anxiety', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC / Metabolic Panel', 'lab', '58410-2', 'CBC panel; CMP', '85025', 'CBC with differential; CMP', 'Baseline', NULL, 'APA 2023', 'Medical cause exclusion', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Substance Use Screening', 'procedure', '72109-2', 'AUDIT-C; DAST-10 score', '99408', 'Substance screening; SBIRT', 'Annual', NULL, 'APA 2023 / USPSTF', 'AUDIT/DAST for comorbidity', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Medication Adherence Review', 'medication', NULL, NULL, '99214', 'Office visit; medication adherence review', 'Every visit', NULL, 'APA 2023', 'SSRI/SNRI compliance & side effects', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBT/Therapy Referral Review', 'referral', NULL, NULL, '90834', 'Psychotherapy 45 min; 60 min', 'Every 3-6 mo', NULL, 'APA 2023', 'Psychotherapy engagement tracking', v_measure_id, 8);


  -- ── GERD / Chronic Acid Reflux (GERD) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'GERD' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('GERD / Chronic Acid Reflux Order Set', 'clinical', 'GERD', v_bundle_id, 'GERD / Chronic Acid Reflux clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Symptom Assessment (GERD-Q)', 'procedure', NULL, NULL, '99214', 'Office visit; GERD-Q assessment', 'Every visit', NULL, 'ACG 2022', 'GERD questionnaire scoring', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'H. pylori Testing', 'lab', '6564-9', 'H. pylori Ab; H. pylori stool antigen', '86677', 'H. pylori antibody; H. pylori stool antigen', 'Baseline', NULL, 'ACG 2022', 'Urea breath test or stool antigen', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Annual', NULL, 'ACG 2022', 'Anemia screening from chronic GI blood loss', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Iron Studies', 'lab', '2276-4', 'Ferritin; Iron + TIBC', '82728', 'Ferritin; Iron, serum', 'Annual (if indicated)', NULL, 'ACG 2022', 'Ferritin if anemic or chronic PPI', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'PPI Step-Down Assessment', 'procedure', NULL, NULL, '99214', 'Office visit; PPI deprescribing review', 'Every 6-12 mo', NULL, 'ACG 2022', 'De-escalation attempt for chronic PPI', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Vitamin B12 Level (chronic PPI)', 'lab', '2132-9', 'Cobalamin in Serum', '82607', 'Vitamin B12 assay', 'Annual', NULL, 'ACG 2022', 'B12 deficiency on long-term PPI', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'EGD Referral (alarm symptoms)', 'referral', NULL, NULL, '43239', 'Upper endoscopy with biopsy; diagnostic EGD', 'PRN', NULL, 'ACG 2022', 'Endoscopy for dysphagia, weight loss, anemia', v_measure_id, 7);


  -- ── Gout (GOUT) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'GOUT' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Gout Order Set', 'clinical', 'GOUT', v_bundle_id, 'Gout clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Serum Uric Acid', 'lab', '3084-1', 'Urate in Serum', '84550', 'Uric acid; blood', 'Every 3-6 mo', NULL, 'ACR 2020', 'Target <6 mg/dL (or <5 with tophi)', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Comprehensive Metabolic Panel', 'lab', '24323-8', 'Comprehensive metabolic panel', '80053', 'Comprehensive metabolic panel (CMP)', 'Every 6 mo', NULL, 'ACR 2020', 'Renal function for ULT dosing', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Annual', NULL, 'ACR 2020', 'Monitor for allopurinol/febuxostat toxicity', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Annual', 'CMS347v7', 'ACR 2020', 'CVD risk (gout = independent risk factor)', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Blood Pressure Screening', 'lab', '85354-9', 'Blood pressure panel', '99214', 'Office visit; BP check', 'Every visit', 'CMS165v12', 'ACR 2020', 'HTN frequently comorbid', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'ULT Adherence Review', 'medication', NULL, NULL, '99214', 'Office visit; ULT review', 'Every visit', NULL, 'ACR 2020', 'Allopurinol/febuxostat dose optimization', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Joint Imaging (if needed)', 'imaging', NULL, NULL, '73610', 'X-ray ankle; dual-energy CT', 'Baseline + PRN', NULL, 'ACR 2020', 'X-ray or dual-energy CT for tophi', v_measure_id, 7);


  -- ── Hepatitis B (HBV) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'HBV' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Hepatitis B Order Set', 'clinical', 'HBV', v_bundle_id, 'Hepatitis B clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'HBV DNA Viral Load', 'lab', '42595-9', 'HBV DNA [IU/mL]', '87517', 'HBV DNA quantification', 'Every 3-6 mo', NULL, 'AASLD 2024', 'HBV DNA quantitative', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hepatic Function Panel', 'lab', '24325-3', 'Hepatic function panel', '80076', 'Hepatic function panel', 'Every 3-6 mo', NULL, 'AASLD 2024', 'Liver function monitoring', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'HBeAg / Anti-HBe', 'lab', '13954-3', 'HBeAg; Anti-HBe', '87350', 'HBeAg; Anti-HBe', 'Every 6-12 mo', NULL, 'AASLD 2024', 'E-antigen status for treatment decision', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'AFP (Alpha-Fetoprotein)', 'lab', '1834-1', 'Alpha-fetoprotein in Serum', '82105', 'Alpha-fetoprotein; serum', 'Every 6 mo', NULL, 'AASLD 2024', 'HCC surveillance', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Abdominal Ultrasound', 'imaging', NULL, NULL, '76700', 'US abdomen complete', 'Every 6 mo', NULL, 'AASLD 2024', 'HCC surveillance', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC with Differential', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Every 6 mo', NULL, 'AASLD 2024', 'Monitor for cirrhosis cytopenias', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'eGFR / Creatinine', 'lab', '48642-3', 'eGFR CKD-EPI', '82565', 'Creatinine; blood', 'Every 6-12 mo', NULL, 'AASLD 2024', 'Tenofovir nephrotoxicity monitoring', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hepatitis D Coinfection', 'procedure', NULL, NULL, '86692', 'Hepatitis D antibody', 'Baseline', NULL, 'AASLD 2024', 'HDV Ab screening', v_measure_id, 8);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 9
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'FibroScan / Elastography', 'imaging', NULL, NULL, '91200', 'Liver elastography', 'Annual', NULL, 'AASLD 2024', 'Liver stiffness measurement', v_measure_id, 9);


  -- ── Hepatitis C (HCV) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'HCV' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Hepatitis C Order Set', 'clinical', 'HCV', v_bundle_id, 'Hepatitis C clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'HCV Viral Load', 'lab', '11259-9', 'HCV RNA [IU/mL]', '87522', 'HCV quantification', 'Baseline + 12w post-Tx', NULL, 'AASLD/IDSA 2024', 'HCV RNA quantitative', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'HCV Genotype', 'lab', '32286-7', 'HCV genotype', '87902', 'HCV genotype', 'Baseline', NULL, 'AASLD/IDSA 2024', 'Genotype for treatment selection', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hepatic Function Panel', 'lab', '24325-3', 'Hepatic function panel', '80076', 'Hepatic function panel', 'Every 6 mo', NULL, 'AASLD/IDSA 2024', 'Liver function monitoring', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC with Differential', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Every 6 mo', NULL, 'AASLD/IDSA 2024', 'Platelet count for cirrhosis', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'FIB-4 / FibroScan', 'imaging', NULL, NULL, '80076', 'Hepatic panel + CBC; Liver elastography', 'Baseline + Annual', NULL, 'AASLD/IDSA 2024', 'Non-invasive fibrosis staging', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hepatitis B Coinfection Screen', 'procedure', '16933-4', 'HBsAg; HBcAb total', '87340', 'HBsAg; HBcAb total', 'Baseline', NULL, 'AASLD/IDSA 2024', 'HBsAg, HBcAb before DAA therapy', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'eGFR / Creatinine', 'lab', '48642-3', 'eGFR CKD-EPI', '82565', 'Creatinine; blood', 'Baseline + PRN', NULL, 'AASLD/IDSA 2024', 'Renal function for DAA dosing', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'SVR12 Confirmation', 'procedure', '11259-9', 'HCV RNA [IU/mL]', '87522', 'HCV quantification', '12 weeks post-Tx', NULL, 'AASLD/IDSA 2024', 'Sustained virologic response at 12 weeks post-Tx', v_measure_id, 8);


  -- ── Heart Failure (HF) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'HF' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Heart Failure Order Set', 'clinical', 'HF', v_bundle_id, 'Heart Failure clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'BNP / NT-proBNP', 'procedure', '42637-9', 'BNP; NT-proBNP', '83880', 'Natriuretic peptide (BNP)', 'Every 3-6 mo', NULL, 'ACC/AHA 2022', 'Natriuretic peptide for HF monitoring', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Basic Metabolic Panel', 'lab', '51990-0', 'Basic metabolic panel', '80048', 'Basic metabolic panel (BMP)', 'Every 3-6 mo', NULL, 'ACC/AHA 2022', 'Electrolytes, renal function on diuretics', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Echocardiogram', 'imaging', NULL, NULL, '93306', 'TTE complete with Doppler', 'Annual or PRN', NULL, 'ACC/AHA 2022', 'LVEF assessment baseline and follow-up', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'GDMT Optimization', 'procedure', NULL, NULL, '99214', 'Office visit; GDMT optimization', 'Every visit', NULL, 'ACC/AHA 2022', 'ACEI/ARB/ARNI + BB + MRA + SGLT2i review', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Daily Weight Monitoring Counseling', 'procedure', '29463-7', 'Body weight', '99214', 'Office visit + Self-mgmt education', 'Every visit', NULL, 'ACC/AHA 2022', 'Patient education on daily weight, fluid', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Influenza Vaccination', 'procedure', NULL, NULL, '90686', 'Flu vaccine IIV4; admin', 'Annual', 'CMS147v13', 'ACC/AHA 2022', 'Annual flu vaccine', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Depression Screening (PHQ-9)', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Annual', 'CMS2v13', 'AHA 2012', 'Depression screening for HF patients', v_measure_id, 7);


  -- ── HIV/AIDS (HIV) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'HIV' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('HIV/AIDS Order Set', 'clinical', 'HIV', v_bundle_id, 'HIV/AIDS clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'HIV Viral Load', 'lab', '25836-8', 'HIV 1 RNA [copies/mL]', '87536', 'HIV-1 quantification', 'Every 3-6 mo', NULL, 'DHHS 2024', 'HIV-1 RNA quantitative', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CD4 Count', 'procedure', '24467-3', 'CD4 cells/uL in Blood', '86360', 'T-cell absolute CD4 count', 'Every 3-6 mo', NULL, 'DHHS 2024', 'Absolute CD4+ T-cell count', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Comprehensive Metabolic Panel', 'lab', '24323-8', 'Comprehensive metabolic panel', '80053', 'Comprehensive metabolic panel (CMP)', 'Every 6 mo', NULL, 'DHHS 2024', 'ART toxicity monitoring', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC with Differential', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Every 6 mo', NULL, 'DHHS 2024', 'Monitor for cytopenias', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Annual', 'CMS347v7', 'DHHS 2024', 'ART metabolic side effects', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hepatitis B/C Screening', 'procedure', '16933-4', 'HBsAg; HCV Ab', '87340', 'HBsAg; HCV antibody', 'Baseline + Annual', NULL, 'DHHS 2024', 'Coinfection screening', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'STI Screening', 'imaging', '20507-0', 'RPR; GC NAAT; CT NAAT', '86592', 'RPR; GC NAAT; CT NAAT', 'Annual', NULL, 'DHHS/CDC 2024', 'Syphilis RPR, GC/CT NAAT', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'TB Screening', 'procedure', NULL, NULL, '86480', 'QuantiFERON-TB Gold; TB skin test', 'Annual', NULL, 'DHHS 2024', 'QuantiFERON or PPD', v_measure_id, 8);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 9
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'ART Adherence Assessment', 'medication', NULL, NULL, '99214', 'Office visit; ART adherence review', 'Every visit', NULL, 'DHHS 2024', 'Medication adherence evaluation', v_measure_id, 9);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 10
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Cervical/Anal Cancer Screening', 'lab', NULL, NULL, '88142', 'Pap smear ThinPrep; HPV high-risk; Anal cytology', 'Annual', NULL, 'DHHS/ACS 2024', 'Pap smear / HPV / anal cytology', v_measure_id, 10);


  -- ── Hypertension (HTN) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'HTN' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Hypertension Order Set', 'clinical', 'HTN', v_bundle_id, 'Hypertension clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Blood Pressure Screening', 'lab', '85354-9', 'Blood pressure panel', '99473', 'Self-measured BP education', 'Every visit', 'CMS165v12', 'ACC/AHA 2017', 'Office BP, target <130/80 per ACC/AHA', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Basic Metabolic Panel', 'lab', '51990-0', 'Basic metabolic panel', '80048', 'Basic metabolic panel (BMP)', 'Annual', 'CMS165v12', 'JNC 8 / ACC 2017', 'Electrolytes, BUN, creatinine, glucose', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Urinalysis', 'procedure', '24356-8', 'Urinalysis complete panel', '81003', 'Urinalysis; automated with microscopy', 'Annual', 'CMS165v12', 'ACC/AHA 2017', 'Screening for proteinuria / renal damage', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Annual', 'CMS347v7', 'ACC/AHA 2018', 'Cardiovascular risk assessment', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'ECG Screening', 'imaging', NULL, NULL, '93000', 'Electrocardiogram; complete', 'Baseline + PRN', NULL, 'ACC/AHA 2017', '12-lead ECG for LVH screening', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Tobacco Cessation Counseling', 'procedure', '39240-7', 'Tobacco use status', '99406', 'Smoking cessation counseling 3-10 min; >10 min', 'Annual', 'CMS138v12', 'USPSTF 2021', 'Screening & cessation intervention', v_measure_id, 6);


  -- ── Hypothyroidism (HYPO) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'HYPO' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Hypothyroidism Order Set', 'clinical', 'HYPO', v_bundle_id, 'Hypothyroidism clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'TSH Level', 'lab', '3016-3', 'TSH in Serum', '84443', 'TSH', 'Every 6-12 mo', NULL, 'ATA 2014', 'Thyroid-stimulating hormone', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Free T4 Level', 'procedure', '3024-7', 'Free T4 in Serum', '84439', 'Thyroxine; free', 'Every 6-12 mo', NULL, 'ATA 2014', 'Free thyroxine for dose adjustment', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Annual', 'CMS347v7', 'ATA 2014', 'Hypothyroidism causes dyslipidemia', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Levothyroxine Dose Review', 'procedure', NULL, NULL, '99214', 'Office visit; levothyroxine dose review', 'Every visit', NULL, 'ATA 2014', 'Dose optimization review', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Thyroid Antibodies', 'lab', '5382-1', 'Thyroid peroxidase Ab in Serum', '86376', 'Thyroid peroxidase antibody', 'Baseline', NULL, 'ATA 2014', 'TPO-Ab for Hashimoto''s confirmation', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'BMI Assessment', 'procedure', '39156-5', 'Body mass index (BMI)', '99214', 'Office visit; BMI documentation', 'Every visit', 'CMS69v12', 'ATA 2014', 'Weight gain monitoring', v_measure_id, 6);


  -- ── Inflammatory Bowel Disease (IBD) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'IBD' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Inflammatory Bowel Disease Order Set', 'clinical', 'IBD', v_bundle_id, 'Inflammatory Bowel Disease clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC with Differential', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Every 3 mo', NULL, 'ACG/AGA 2023', 'Anemia, leukocytosis monitoring', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CRP / ESR', 'lab', '1988-5', 'CRP; ESR', '86140', 'C-reactive protein; ESR', 'Every 3-6 mo', NULL, 'ACG 2023', 'Inflammatory markers', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Fecal Calprotectin', 'procedure', '38465-1', 'Calprotectin in Stool', '83993', 'Calprotectin, fecal', 'Every 6 mo', NULL, 'ACG 2023', 'Non-invasive mucosal inflammation', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Comprehensive Metabolic Panel', 'lab', '24323-8', 'Comprehensive metabolic panel', '80053', 'Comprehensive metabolic panel (CMP)', 'Every 3 mo', NULL, 'ACG 2023', 'Hepatic/renal on immunosuppression', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Iron Studies / Ferritin', 'lab', '2276-4', 'Ferritin; Iron + TIBC', '82728', 'Ferritin; Iron, serum', 'Every 6 mo', NULL, 'ACG 2023', 'Iron deficiency anemia', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Vitamin D Level', 'procedure', '1989-3', '25-Hydroxyvitamin D in Serum', '82306', 'Vitamin D; 25-hydroxy', 'Annual', NULL, 'ACG 2023', 'Bone health on steroids', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'TB Screening (pre-biologic)', 'medication', NULL, NULL, '86480', 'QuantiFERON-TB Gold', 'Before biologic initiation', NULL, 'ACG 2023', 'Quantiferon before anti-TNF', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hepatitis B Screening', 'procedure', '16933-4', 'HBsAg; HBcAb total', '87340', 'HBsAg; HBcAb total', 'Baseline', NULL, 'ACG 2023', 'Reactivation risk on immunosuppression', v_measure_id, 8);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 9
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Colonoscopy Surveillance', 'imaging', NULL, NULL, '45378', 'Colonoscopy diagnostic; with biopsy', 'Every 1-3 years', 'CMS130v12', 'ACG/AGA 2023', 'Dysplasia screening (8+ years IBD)', v_measure_id, 9);


  -- ── Hyperlipidemia (LIPID) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'LIPID' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Hyperlipidemia Order Set', 'clinical', 'LIPID', v_bundle_id, 'Hyperlipidemia clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Fasting Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Every 6-12 mo', 'CMS347v7', 'ACC/AHA 2018', 'TC, LDL-C, HDL-C, TG', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'ASCVD Risk Score (10-yr)', 'procedure', NULL, NULL, '99214', 'Office visit; ASCVD risk calculation', 'Every 5 years (or annual if borderline)', NULL, 'ACC/AHA 2018', 'Pooled cohort equations calculation', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Statin Therapy Review', 'medication', NULL, NULL, '99214', 'Office visit; statin review', 'Every visit', 'CMS347v7', 'ACC/AHA 2018', 'Intensity assessment and adherence', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hepatic Function Panel', 'lab', '24325-3', 'Hepatic function panel', '80076', 'Hepatic function panel', 'Baseline + PRN', NULL, 'ACC/AHA 2018', 'Statin hepatotoxicity monitoring', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CK Level (if symptomatic)', 'medication', '2157-6', 'CK in Serum', '82550', 'Creatine kinase; total', 'PRN', NULL, 'ACC/AHA 2018', 'Statin myopathy workup', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Fasting Glucose / A1c', 'lab', '1558-6', 'Fasting glucose; HbA1c', '82947', 'Glucose quantitative; HbA1c', 'Annual', 'CMS122v12', 'ACC/AHA 2018 / ADA', 'New-onset DM screening on statins', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Blood Pressure Screening', 'lab', '85354-9', 'Blood pressure panel', '99214', 'Office visit; BP check', 'Every visit', 'CMS165v12', 'ACC/AHA 2017', 'CVD risk factor management', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lp(a) Level', 'procedure', '10835-7', 'Lipoprotein(a) in Serum', '83695', 'Lipoprotein(a)', 'Once (lifetime)', NULL, 'ACC/AHA 2018 / ESC 2019', 'High-risk lipoprotein screening', v_measure_id, 8);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 9
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'hs-CRP', 'lab', '30522-7', 'hs-CRP in Serum', '86141', 'C-reactive protein, high sensitivity', 'Baseline (if borderline risk)', NULL, 'ACC/AHA 2018', 'Inflammatory risk marker', v_measure_id, 9);


  -- ── Major Depressive Disorder (MDD) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'MDD' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Major Depressive Disorder Order Set', 'clinical', 'MDD', v_bundle_id, 'Major Depressive Disorder clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'PHQ-9 Screening', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Every visit', 'CMS2v13', 'APA 2023', 'Standardized depression severity', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Suicide Risk Assessment', 'procedure', '93441-4', 'Columbia Suicide Severity Rating', '96160', 'Health risk assessment; admin/interpretation', 'Every visit', NULL, 'APA 2023 / Joint Commission', 'Columbia or ASQ screening', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Thyroid Function (TSH)', 'lab', '3016-3', 'TSH in Serum', '84443', 'TSH', 'Baseline', NULL, 'APA 2023', 'Rule out thyroid as cause', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Metabolic Panel', 'lab', '24323-8', 'Comprehensive metabolic panel', '80053', 'Comprehensive metabolic panel (CMP)', 'Baseline + Annual', NULL, 'APA 2023', 'Baseline before starting meds', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Baseline', NULL, 'APA 2023', 'Baseline labs', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Medication Adherence Review', 'medication', NULL, NULL, '99214', 'Office visit; medication adherence review', 'Every visit', 'CMS128v12', 'APA 2023 / HEDIS', 'Antidepressant compliance assessment', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Substance Use Screening', 'procedure', '72109-2', 'AUDIT-C total; DAST-10 score', '99408', 'Substance screening; SBIRT alcohol', 'Annual', NULL, 'APA 2023 / USPSTF', 'AUDIT/DAST screening for comorbidity', v_measure_id, 7);


  -- ── Chronic Migraine (MIG) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'MIG' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Chronic Migraine Order Set', 'clinical', 'MIG', v_bundle_id, 'Chronic Migraine clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Headache Frequency Log', 'procedure', NULL, NULL, '99214', 'Office visit; headache diary review', 'Every visit', NULL, 'AAN 2019 / AHS', 'Migraine days per month (MIDAS/HIT-6)', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'MIDAS / HIT-6 Score', 'procedure', NULL, NULL, '96127', 'Brief emotional/behavioral assessment', 'Every 3-6 mo', NULL, 'AAN 2019', 'Disability assessment', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Blood Pressure Screening', 'lab', '85354-9', 'Blood pressure panel', '99214', 'Office visit; BP check', 'Every visit', 'CMS165v12', 'AAN 2019', 'Contraindication check for triptans', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Depression/Anxiety Screening', 'procedure', '44249-1', 'PHQ-9; GAD-7 score', '96127', 'Brief emotional/behavioral assessment', 'Annual', 'CMS2v13', 'AAN 2019', 'PHQ-9 + GAD-7', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Medication Overuse Assessment', 'lab', NULL, NULL, '99214', 'Office visit; medication overuse review', 'Every visit', NULL, 'AAN 2019', 'Evaluate analgesic rebound', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Preventive Therapy Review', 'medication', NULL, NULL, '99214', 'Office visit; preventive med review', 'Every 3 mo', NULL, 'AAN 2019 / AHS 2023', 'Beta-blocker/topiramate/CGRP efficacy', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Brain MRI (if atypical)', 'imaging', NULL, NULL, '70553', 'MRI brain with and without contrast', 'Baseline (if indicated)', NULL, 'AAN 2019', 'Rule out secondary causes', v_measure_id, 7);


  -- ── Multiple Sclerosis (MS) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'MS' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Multiple Sclerosis Order Set', 'clinical', 'MS', v_bundle_id, 'Multiple Sclerosis clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Brain MRI', 'imaging', NULL, NULL, '70553', 'MRI brain with and without contrast', 'Annual', NULL, 'AAN 2023', 'Disease activity monitoring', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Spinal Cord MRI', 'imaging', NULL, NULL, '72156', 'MRI cervical spine w/ and w/o contrast', 'Baseline + PRN', NULL, 'AAN 2023', 'Spinal lesion surveillance', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC / CMP', 'lab', '58410-2', 'CBC panel; CMP', '85025', 'CBC with differential; CMP', 'Every 6 mo', NULL, 'AAN 2023', 'DMT toxicity monitoring', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'JC Virus Antibody', 'lab', '49023-6', 'JC virus Ab index', '86711', 'JC virus antibody', 'Every 6 mo (if applicable)', NULL, 'AAN 2023', 'PML risk on natalizumab', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Vitamin D Level', 'procedure', '1989-3', '25-Hydroxyvitamin D in Serum', '82306', 'Vitamin D; 25-hydroxy', 'Annual', NULL, 'AAN 2023', 'Low vitamin D = worse MS outcomes', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'EDSS / Neurologic Exam', 'procedure', NULL, NULL, '99214', 'Office visit; Neuropsych testing', 'Every 6-12 mo', NULL, 'AAN 2023', 'Expanded Disability Status Scale', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Depression Screening (PHQ-9)', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Annual', 'CMS2v13', 'AAN 2023', 'Depression common in MS', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Ophthalmologic Assessment', 'procedure', NULL, NULL, '92134', 'OCT retinal scan; Visual field exam', 'Annual', NULL, 'AAN 2023', 'Optic neuritis evaluation / OCT', v_measure_id, 8);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 9
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Bladder Function Assessment', 'procedure', NULL, NULL, '51798', 'Post-void residual; Office visit', 'Annual', NULL, 'AAN 2023', 'Neurogenic bladder screening', v_measure_id, 9);


  -- ── Osteoarthritis (OA) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'OA' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Osteoarthritis Order Set', 'clinical', 'OA', v_bundle_id, 'Osteoarthritis clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Pain & Function Assessment', 'procedure', NULL, NULL, '99214', 'Office visit; functional assessment', 'Every visit', NULL, 'ACR/AF 2019', 'WOMAC or KOOS/HOOS score', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'BMI Assessment', 'lab', '39156-5', 'Body mass index (BMI)', '99214', 'Office visit + Obesity counseling', 'Every visit', 'CMS69v12', 'ACR 2019', 'Weight management for joint protection', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'X-Ray Affected Joint', 'imaging', NULL, NULL, '73560', 'X-ray knee; knee bilateral; X-ray shoulder', 'Baseline + PRN', NULL, 'ACR 2019', 'Radiographic assessment', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Exercise/PT Referral', 'referral', NULL, NULL, '97161', 'PT evaluation; Therapeutic exercises', 'Annual', NULL, 'ACR/AF 2019', 'Structured exercise therapy', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'NSAID Safety Monitoring', 'lab', '51990-0', 'Basic metabolic panel', '80048', 'Basic metabolic panel (BMP)', 'Every 6 mo', NULL, 'ACR 2019', 'Renal function and GI risk', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Depression Screening (PHQ-9)', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Annual', 'CMS2v13', 'APA 2023', 'Chronic pain-depression comorbidity', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Fall Risk Assessment', 'procedure', '73830-2', 'Fall risk assessment', '99214', 'Office visit + Therapeutic exercises', 'Annual', 'CMS139v12', 'AGS/BGS 2023', 'Balance/gait with lower extremity OA', v_measure_id, 7);


  -- ── Obesity (OB) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'OB' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Obesity Order Set', 'clinical', 'OB', v_bundle_id, 'Obesity clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'BMI Assessment', 'procedure', '39156-5', 'Body mass index (BMI)', '99214', 'Office visit + Obesity counseling 15 min', 'Every visit', 'CMS69v12', 'USPSTF 2018', 'Calculate and document BMI', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Waist Circumference', 'procedure', '56086-2', 'Waist circumference', '99214', 'Office visit; waist measurement', 'Annual', NULL, 'AHA/ACC 2013', 'Measure waist circumference', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Fasting Glucose / A1c', 'lab', '1558-6', 'Fasting glucose; HbA1c', '82947', 'Glucose quantitative; HbA1c', 'Annual', 'CMS122v12', 'ADA 2024', 'Pre-diabetes/diabetes screening', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Annual', 'CMS347v7', 'ACC/AHA 2018', 'Cardiovascular risk assessment', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Behavioral Counseling', 'medication', NULL, NULL, 'G0447', 'Obesity counseling 15 min; Behavioral therapy', 'Monthly × 6 mo', 'CMS69v12', 'USPSTF 2018 / CMS', 'Intensive behavioral therapy for obesity', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Liver Function (ALT)', 'lab', '1742-6', 'ALT in Serum', '80076', 'Hepatic function panel', 'Annual', NULL, 'AASLD 2023', 'NAFLD screening', v_measure_id, 6);


  -- ── Obstructive Sleep Apnea (OSA) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'OSA' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Obstructive Sleep Apnea Order Set', 'clinical', 'OSA', v_bundle_id, 'Obstructive Sleep Apnea clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Epworth Sleepiness Scale (ESS)', 'procedure', '55758-7', 'Epworth Sleepiness Scale score', '99214', 'Office visit; ESS assessment', 'Every visit', NULL, 'AASM 2023', 'Daytime sleepiness assessment', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'STOP-BANG Questionnaire', 'procedure', NULL, NULL, '96160', 'Health risk assessment', 'Baseline', NULL, 'AASM 2023', 'OSA screening tool', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Polysomnography / Home Sleep Test', 'lab', NULL, NULL, '95810', 'PSG attended; Home sleep test', 'Baseline + PRN', NULL, 'AASM 2023', 'AHI determination', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CPAP Compliance Review', 'medication', NULL, NULL, '94660', 'CPAP/BiPAP initiation; Office visit compliance', 'Every 3-6 mo', NULL, 'AASM 2023', 'Download adherence data (>4h/night ≥70%)', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'BMI Assessment', 'lab', '39156-5', 'Body mass index (BMI)', '99214', 'Office visit + Obesity counseling', 'Every visit', 'CMS69v12', 'AASM 2023', 'Weight management (BMI correlates with AHI)', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Blood Pressure Screening', 'lab', '85354-9', 'Blood pressure panel', '99214', 'Office visit; BP check', 'Every visit', 'CMS165v12', 'AASM 2023', 'OSA-related hypertension', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Thyroid Function (TSH)', 'lab', '3016-3', 'TSH in Serum', '84443', 'TSH', 'Baseline', NULL, 'AASM 2023', 'Rule out hypothyroidism contribution', v_measure_id, 7);


  -- ── Osteoporosis (OSTEO) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'OSTEO' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Osteoporosis Order Set', 'clinical', 'OSTEO', v_bundle_id, 'Osteoporosis clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'DEXA Scan', 'imaging', '38263-0', 'DXA bone density T-score', '77080', 'DEXA axial; DEXA appendicular', 'Every 2 years', 'CMS249v5', 'NOF/AACE 2023', 'Bone mineral density T-score', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Vitamin D Level', 'procedure', '1989-3', '25-Hydroxyvitamin D in Serum', '82306', 'Vitamin D; 25-hydroxy', 'Annual', NULL, 'NOF 2023', '25-OH Vitamin D optimization', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Calcium Level', 'lab', '17861-6', 'Calcium in Serum', '82310', 'Calcium; total', 'Annual', NULL, 'NOF 2023', 'Serum calcium for bone metabolism', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'FRAX Score Assessment', 'procedure', NULL, NULL, '99214', 'Office visit; FRAX calculation', 'Baseline + Every 2 yr', NULL, 'NOF 2023', '10-year fracture risk calculation', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Fall Risk Assessment', 'lab', '73830-2', 'Fall risk assessment', '99214', 'Office visit + Therapeutic exercises', 'Annual', 'CMS139v12', 'USPSTF / AGS 2023', 'Timed Up and Go / balance test', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Bisphosphonate Therapy Review', 'medication', NULL, NULL, '99214', 'Office visit; bone therapy review', 'Every 6 mo', NULL, 'NOF 2023', 'Alendronate/risedronate adherence', v_measure_id, 6);


  -- ── Peripheral Artery Disease (PAD) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'PAD' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Peripheral Artery Disease Order Set', 'clinical', 'PAD', v_bundle_id, 'Peripheral Artery Disease clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Ankle-Brachial Index (ABI)', 'procedure', NULL, NULL, '93922', 'ABI bilateral; with exercise', 'Annual', NULL, 'ACC/AHA 2024', 'ABI for diagnosis and monitoring', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Annual', 'CMS347v7', 'ACC/AHA 2024', 'LDL target <70 mg/dL', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Blood Pressure Screening', 'lab', '85354-9', 'Blood pressure panel', '99473', 'Self-measured BP education', 'Every visit', 'CMS165v12', 'ACC/AHA 2024', 'Target <130/80 mmHg', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Antiplatelet Therapy Review', 'lab', NULL, NULL, '99214', 'Office visit; antiplatelet review', 'Every visit', NULL, 'ACC/AHA 2024', 'Aspirin or clopidogrel', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'High-Intensity Statin', 'medication', NULL, NULL, '99214', 'Office visit; statin review', 'Annual review', 'CMS347v7', 'ACC/AHA 2024', 'Statin therapy optimization', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Supervised Exercise Therapy', 'referral', NULL, NULL, '93668', 'Supervised exercise therapy for PAD', 'Baseline + PRN', NULL, 'ACC/AHA 2024', '12-week walking program referral', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Tobacco Cessation Counseling', 'procedure', '39240-7', 'Tobacco use status', '99406', 'Smoking cessation counseling 3-10 min; >10 min', 'Every visit', 'CMS138v12', 'USPSTF 2021', 'Smoking cessation intervention', v_measure_id, 7);


  -- ── Pulmonary Arterial Hypertension (PAH) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'PAH' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Pulmonary Arterial Hypertension Order Set', 'clinical', 'PAH', v_bundle_id, 'Pulmonary Arterial Hypertension clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, '6-Minute Walk Test', 'lab', NULL, NULL, '94618', 'Pulmonary stress test; 6MWT', 'Every 3-6 mo', NULL, 'CHEST/ESC 2023', 'Functional capacity assessment', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'BNP / NT-proBNP', 'medication', '42637-9', 'BNP; NT-proBNP', '83880', 'Natriuretic peptide (BNP)', 'Every 3 mo', NULL, 'ESC/ERS 2023', 'Right heart failure monitoring', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Echocardiogram', 'imaging', NULL, NULL, '93306', 'TTE complete with Doppler', 'Every 6-12 mo', NULL, 'ESC/ERS 2023', 'RVSP and RV function assessment', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Comprehensive Metabolic Panel', 'lab', '24323-8', 'Comprehensive metabolic panel', '80053', 'Comprehensive metabolic panel (CMP)', 'Every 3-6 mo', NULL, 'ESC/ERS 2023', 'Hepatic/renal on PAH therapies', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Every 6 mo', NULL, 'ESC/ERS 2023', 'Polycythemia from chronic hypoxemia', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hepatic Function Panel', 'lab', '24325-3', 'Hepatic function panel', '80076', 'Hepatic function panel', 'Every 3 mo', NULL, 'ESC/ERS 2023', 'ERA hepatotoxicity monitoring', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Pulse Oximetry', 'procedure', '59408-5', 'Pulse oximetry SpO2', '94760', 'Pulse oximetry; single', 'Every visit', NULL, 'ESC/ERS 2023', 'Oxygen saturation monitoring', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'WHO Functional Class Assessment', 'procedure', NULL, NULL, '99214', 'Office visit; WHO FC assessment', 'Every visit', NULL, 'ESC/ERS 2023', 'FC I-IV classification', v_measure_id, 8);


  -- ── Chronic Pain / Opioid Management (PAIN) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'PAIN' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Chronic Pain / Opioid Management Order Set', 'clinical', 'PAIN', v_bundle_id, 'Chronic Pain / Opioid Management clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Pain Assessment (NRS/VAS)', 'procedure', '72514-3', 'Pain severity - numeric rating', '99214', 'Office visit; pain assessment', 'Every visit', NULL, 'CDC Opioid Guideline 2022', 'Numeric rating scale', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Functional Assessment', 'procedure', NULL, NULL, '99214', 'Office visit; functional assessment', 'Every visit', NULL, 'CDC 2022', 'PEG scale (Pain, Enjoyment, General Activity)', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'PDMP Check', 'medication', NULL, NULL, '99214', 'Office visit; PDMP review (state-mandated)', 'Every visit (if opioid)', NULL, 'CDC 2022', 'Prescription drug monitoring program query', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Urine Drug Screen', 'lab', '19659-2', 'Drug screen panel in Urine', '80305', 'Drug screen presumptive; definitive', 'Random; 2-4x/year', NULL, 'CDC 2022', 'UDS for compliance and diversion', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Opioid Risk Tool (ORT)', 'procedure', NULL, NULL, '96160', 'Health risk assessment', 'Baseline + Annual', NULL, 'CDC 2022', 'Risk stratification for opioid misuse', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Naloxone Prescription', 'medication', NULL, NULL, '99214', 'Office visit + Naloxone Rx', 'With each opioid Rx', NULL, 'CDC 2022', 'Naloxone co-prescribing with opioids', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Depression Screening (PHQ-9)', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Every 6 mo', 'CMS2v13', 'APA 2023', 'Mental health comorbidity', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Opioid Agreement Review', 'procedure', NULL, NULL, '99214', 'Office visit; opioid agreement review', 'Annual', NULL, 'CDC 2022', 'Treatment agreement and informed consent', v_measure_id, 8);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 9
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Non-Opioid Therapy Trial', 'medication', NULL, NULL, '97110', 'Therapeutic exercises; Psychotherapy 45 min; Nerve block', 'Every 6 mo', NULL, 'CDC 2022', 'PT, CBT, NSAID, nerve block documentation', v_measure_id, 9);


  -- ── Parkinson's Disease (PD) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'PD' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Parkinson''s Disease Order Set', 'clinical', 'PD', v_bundle_id, 'Parkinson''s Disease clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'UPDRS / MDS-UPDRS', 'procedure', NULL, NULL, '99214', 'Office visit; UPDRS assessment', 'Every 3-6 mo', NULL, 'MDS/AAN 2023', 'Unified Parkinson''s Disease Rating Scale', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Orthostatic BP', 'procedure', '85354-9', 'Blood pressure panel', '99214', 'Office visit; orthostatic BP check', 'Every visit', NULL, 'MDS 2023', 'Autonomic dysfunction screening', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Depression Screening (PHQ-9)', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Every 6 mo', 'CMS2v13', 'MDS/AAN 2023', 'PD-depression is common', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Cognitive Assessment (MoCA)', 'procedure', '72172-0', 'MoCA total score', '96116', 'Neurobehavioral exam', 'Annual', 'CMS149v12', 'MDS/AAN 2023', 'PD-dementia screening', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Fall Risk Assessment', 'procedure', '73830-2', 'Fall risk assessment', '99214', 'Office visit + Therapeutic exercises', 'Every visit', 'CMS139v12', 'MDS/AGS 2023', 'Postural instability evaluation', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Swallowing Assessment', 'procedure', NULL, NULL, '92610', 'Swallowing evaluation; Motion fluoroscopy swallow', 'Annual', NULL, 'MDS 2023', 'Dysphagia screening', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Sleep Assessment (RBD/ESS)', 'procedure', '55758-7', 'Epworth Sleepiness Scale score', '99214', 'Office visit; Polysomnography', 'Annual', NULL, 'MDS 2023', 'REM sleep behavior disorder', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Bone Density (DEXA)', 'imaging', '38263-0', 'DXA bone density T-score', '77080', 'DEXA axial skeleton', 'Every 2 years', 'CMS249v5', 'NOF/MDS 2023', 'Fall risk + osteoporosis', v_measure_id, 8);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 9
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Medication Review', 'medication', NULL, NULL, '99214', 'Office visit; complex med review', 'Every visit', NULL, 'MDS 2023', 'Levodopa/carbidopa timing and wearing-off', v_measure_id, 9);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 10
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Speech/OT/PT Referral', 'referral', NULL, NULL, '92507', 'Speech therapy; Therapeutic activities; Exercises', 'Annual', NULL, 'MDS/AAN 2023', 'LSVT BIG/LOUD and functional therapy', v_measure_id, 10);


  -- ── Psoriasis / Psoriatic Arthritis (PSO) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'PSO' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Psoriasis / Psoriatic Arthritis Order Set', 'clinical', 'PSO', v_bundle_id, 'Psoriasis / Psoriatic Arthritis clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'PASI / BSA Score', 'procedure', NULL, NULL, '99214', 'Office visit; PASI assessment', 'Every 3-6 mo', NULL, 'AAD/NPF 2024', 'Psoriasis Area Severity Index', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Joint Assessment (if PsA)', 'procedure', NULL, NULL, '99214', 'Office visit; joint assessment', 'Every 3-6 mo', NULL, 'ACR/NPF 2024', 'Tender/swollen joint count, DAPSA', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC / CMP', 'lab', '58410-2', 'CBC panel; CMP', '85025', 'CBC with differential; CMP', 'Every 3 mo', NULL, 'AAD 2024', 'DMARD toxicity monitoring', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Annual', 'CMS347v7', 'AAD/ACC 2024', 'CVD risk (psoriasis = independent risk)', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Fasting Glucose / A1c', 'lab', '1558-6', 'Fasting glucose; HbA1c', '82947', 'Glucose quantitative; HbA1c', 'Annual', NULL, 'AAD 2024', 'Metabolic syndrome screening', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'TB Screening (pre-biologic)', 'medication', NULL, NULL, '86480', 'QuantiFERON-TB Gold', 'Before biologic initiation', NULL, 'AAD/ACR 2024', 'Quantiferon before anti-TNF/IL-17', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hepatitis B/C Screening', 'procedure', '16933-4', 'HBsAg; HCV Ab', '87340', 'HBsAg; HCV antibody', 'Baseline', NULL, 'AAD 2024', 'Pre-biologic screening', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Depression Screening (PHQ-9)', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Annual', 'CMS2v13', 'AAD/APA 2024', 'Psoriasis-depression comorbidity', v_measure_id, 8);


  -- ── Post-Traumatic Stress Disorder (PTSD) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'PTSD' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Post-Traumatic Stress Disorder Order Set', 'clinical', 'PTSD', v_bundle_id, 'Post-Traumatic Stress Disorder clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'PCL-5 Screening', 'procedure', NULL, NULL, '96127', 'Brief emotional/behavioral assessment', 'Every visit', NULL, 'APA/VA-DoD 2023', 'PTSD Checklist for DSM-5', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'PHQ-9 Screening', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Every visit', 'CMS2v13', 'APA 2023', 'Depression comorbidity', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Suicide Risk Assessment', 'procedure', '93441-4', 'Columbia Suicide Severity Rating', '96160', 'Health risk assessment', 'Every visit', NULL, 'VA-DoD 2023', 'Columbia or ASQ screening', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Substance Use Screening', 'procedure', '72109-2', 'AUDIT-C; DAST-10 score', '99408', 'Substance screening; SBIRT', 'Every 6 mo', NULL, 'VA-DoD 2023', 'AUDIT/DAST for comorbidity', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Sleep Assessment', 'procedure', NULL, NULL, '99214', 'Office visit; sleep assessment', 'Every visit', NULL, 'APA 2023', 'Insomnia Severity Index', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Medication Review', 'medication', NULL, NULL, '99214', 'Office visit; medication review', 'Every visit', NULL, 'APA/VA-DoD 2023', 'SSRI/prazosin efficacy and adherence', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Metabolic Panel', 'lab', '24323-8', 'Comprehensive metabolic panel', '80053', 'Comprehensive metabolic panel (CMP)', 'Annual', NULL, 'APA 2023', 'Baseline for psychotropic meds', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Therapy Engagement', 'medication', NULL, NULL, '90834', 'Psychotherapy 45 min; 60 min', 'Every 3-6 mo', NULL, 'APA/VA-DoD 2023', 'CPT/PE/EMDR engagement tracking', v_measure_id, 8);


  -- ── Rheumatoid Arthritis (RA) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'RA' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Rheumatoid Arthritis Order Set', 'clinical', 'RA', v_bundle_id, 'Rheumatoid Arthritis clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'ESR / CRP', 'lab', '30341-2', 'ESR; CRP', '85652', 'ESR; C-reactive protein', 'Every 3-6 mo', NULL, 'ACR/EULAR 2021', 'Inflammatory markers', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC with Differential', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Every 3 mo', NULL, 'ACR 2021', 'Monitor for cytopenias on DMARDs', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Comprehensive Metabolic Panel', 'lab', '24323-8', 'Comprehensive metabolic panel', '80053', 'Comprehensive metabolic panel (CMP)', 'Every 3 mo', NULL, 'ACR 2021', 'Hepatic/renal on methotrexate', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Disease Activity Score (DAS28)', 'procedure', NULL, NULL, '99214', 'Office visit; DAS28 assessment', 'Every 3-6 mo', NULL, 'ACR/EULAR 2021', 'Standardized disease activity', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'RF / Anti-CCP', 'procedure', '11572-5', 'Rheumatoid factor; Anti-CCP', '86431', 'RF quantitative; Anti-CCP antibody', 'Baseline', NULL, 'ACR 2021', 'Seropositive status confirmation', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hepatitis B/C Screening', 'procedure', '16933-4', 'HBsAg; HCV Ab', '87340', 'HBsAg; HCV antibody', 'Baseline', NULL, 'ACR 2021', 'Pre-biologic screening', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'TB Screening', 'medication', NULL, NULL, '86580', 'TB skin test; QuantiFERON', 'Annual on biologics', NULL, 'ACR 2021', 'Pre-biologic screening', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'DEXA Scan', 'imaging', '38263-0', 'DXA bone density T-score', '77080', 'DEXA axial skeleton', 'Every 2 years', 'CMS249v5', 'ACR/NOF 2023', 'Osteoporosis risk on steroids', v_measure_id, 8);


  -- ── Sickle Cell Disease (SCD) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'SCD' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Sickle Cell Disease Order Set', 'clinical', 'SCD', v_bundle_id, 'Sickle Cell Disease clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC with Reticulocyte Count', 'lab', '58410-2', 'CBC panel; Reticulocyte count', '85025', 'CBC with differential; Reticulocyte count', 'Every 3 mo', NULL, 'ASH 2023', 'Hemoglobin and reticulocyte monitoring', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Hemoglobin Electrophoresis', 'lab', '4576-5', 'Hemoglobin pattern', '83020', 'Hemoglobin electrophoresis', 'Annual', NULL, 'ASH 2023', 'HbS and HbF percentage', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Comprehensive Metabolic Panel', 'lab', '24323-8', 'Comprehensive metabolic panel', '80053', 'Comprehensive metabolic panel (CMP)', 'Every 6 mo', NULL, 'ASH 2023', 'Organ function assessment', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'LDH / Haptoglobin / Bilirubin', 'lab', '2532-0', 'LDH; Haptoglobin; Bilirubin total', '83615', 'LDH; Haptoglobin; Bilirubin total', 'Every 6 mo', NULL, 'ASH 2023', 'Hemolysis markers', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Ferritin', 'lab', '2276-4', 'Ferritin in Serum', '82728', 'Ferritin', 'Every 3-6 mo', NULL, 'ASH 2023', 'Iron overload from transfusions', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'TCD Ultrasound (if applicable)', 'imaging', NULL, NULL, '93886', 'TCD complete bilateral', 'Annual', NULL, 'ASH 2023', 'Transcranial Doppler for stroke risk', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Urinalysis / Urine ACR', 'lab', '9318-7', 'Albumin/Creatinine Ratio; Urinalysis panel', '82043', 'Urine albumin quantitative; Urinalysis', 'Annual', NULL, 'ASH 2023', 'Sickle cell nephropathy screening', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Ophthalmologic Exam', 'procedure', NULL, NULL, '92250', 'Fundus photography; Comprehensive eye exam', 'Annual', NULL, 'ASH/AAO 2023', 'Sickle cell retinopathy screening', v_measure_id, 8);


  -- ── Systemic Lupus Erythematosus (SLE) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'SLE' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Systemic Lupus Erythematosus Order Set', 'clinical', 'SLE', v_bundle_id, 'Systemic Lupus Erythematosus clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC with Differential', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Every 3 mo', NULL, 'ACR/EULAR 2023', 'Cytopenias (lupus hallmark)', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Comprehensive Metabolic Panel', 'lab', '24323-8', 'Comprehensive metabolic panel', '80053', 'Comprehensive metabolic panel (CMP)', 'Every 3 mo', NULL, 'ACR/EULAR 2023', 'Renal function (lupus nephritis)', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Urinalysis with Microscopy', 'procedure', '24356-8', 'Urinalysis complete panel', '81001', 'Urinalysis; non-automated with microscopy', 'Every 3 mo', NULL, 'ACR/EULAR 2023', 'Proteinuria, hematuria for nephritis', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Complement Levels (C3/C4)', 'lab', '4485-9', 'C3 in Serum; C4 in Serum', '86160', 'Complement C3; Complement C4', 'Every 3-6 mo', NULL, 'ACR/EULAR 2023', 'Disease activity markers', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Anti-dsDNA Antibody', 'lab', '47223-7', 'Anti-dsDNA in Serum', '86225', 'Anti-dsDNA antibody', 'Every 3-6 mo', NULL, 'ACR/EULAR 2023', 'Disease activity marker', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'ESR / CRP', 'lab', '30341-2', 'ESR; CRP', '85652', 'ESR; C-reactive protein', 'Every 3-6 mo', NULL, 'ACR/EULAR 2023', 'Inflammatory markers', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Annual', 'CMS347v7', 'ACR 2023', 'Accelerated atherosclerosis risk', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Ophthalmologic Exam', 'medication', NULL, NULL, '92250', 'Fundus photography; OCT retinal scan', 'Annual', NULL, 'AAO/ACR 2023', 'Hydroxychloroquine retinal toxicity', v_measure_id, 8);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 9
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Bone Density (DEXA)', 'imaging', '38263-0', 'DXA bone density T-score', '77080', 'DEXA axial skeleton', 'Every 2 years', 'CMS249v5', 'ACR/NOF 2023', 'Steroid-induced osteoporosis', v_measure_id, 9);


  -- ── Stroke / CVA (STR) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'STR' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Stroke / CVA Order Set', 'clinical', 'STR', v_bundle_id, 'Stroke / CVA clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Blood Pressure Screening', 'lab', '85354-9', 'Blood pressure panel', '99473', 'Self-measured BP education', 'Every visit', 'CMS165v12', 'AHA/ASA 2021', 'Target <130/80 post-stroke', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Every 6-12 mo', 'CMS347v7', 'AHA/ASA 2021', 'LDL target <70 mg/dL', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'High-Intensity Statin', 'medication', NULL, NULL, '99214', 'Office visit; statin review', 'Annual', 'CMS347v7', 'AHA/ASA 2021', 'Statin therapy optimization', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Antiplatelet/Anticoagulation Review', 'lab', NULL, NULL, '99214', 'Office visit; antithrombotic review', 'Every visit', 'CMS164v12', 'AHA/ASA 2021', 'Aspirin, clopidogrel, or DOAC for AFib', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'HbA1c (if diabetic)', 'lab', '4548-4', 'HbA1c in Blood', '83036', 'Hemoglobin; glycosylated (A1c)', 'Every 3-6 mo', 'CMS122v12', 'AHA/ASA 2021', 'Glycemic control post-stroke', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Depression Screening (PHQ-9)', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Every 3-6 mo', 'CMS2v13', 'AHA/ASA 2021', 'Post-stroke depression screening', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Carotid Imaging', 'imaging', NULL, NULL, '93880', 'Duplex carotid arteries bilateral', 'Baseline + Annual', NULL, 'AHA/ASA 2021', 'Duplex ultrasound for carotid stenosis', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Rehab/PT Assessment', 'procedure', NULL, NULL, '97161', 'PT evaluation low; moderate complexity', 'Every 3-6 mo', NULL, 'AHA/ASA 2021', 'Functional recovery assessment', v_measure_id, 8);


  -- ── Type 1 Diabetes Mellitus (T1D) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'T1D' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Type 1 Diabetes Mellitus Order Set', 'clinical', 'T1D', v_bundle_id, 'Type 1 Diabetes Mellitus clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'HbA1c Monitoring', 'lab', '4548-4', 'HbA1c in Blood', '83036', 'Hemoglobin; glycosylated (A1c)', 'Every 3 mo', 'CMS122v12', 'ADA 2024', 'A1c every 3 months, target <7%', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Fasting Glucose', 'lab', '1558-6', 'Fasting glucose [Mass/Vol]', '82947', 'Glucose; quantitative', 'Every 3 mo', 'CMS122v12', 'ADA 2024', 'Fasting blood glucose', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Annual', 'CMS347v7', 'ADA 2024', 'CVD risk assessment', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Blood Pressure Screening', 'lab', '85354-9', 'Blood pressure panel', '99473', 'Self-measured BP education', 'Every visit', 'CMS165v12', 'ADA 2024', 'Target <130/80 mmHg', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Urine ACR', 'lab', '9318-7', 'Albumin/Creatinine [Mass Ratio] in Urine', '82043', 'Urinalysis; albumin quantitative', 'Annual', 'CMS134v12', 'ADA/KDIGO 2024', 'Nephropathy screening', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'eGFR / Creatinine', 'lab', '48642-3', 'eGFR CKD-EPI', '82565', 'Creatinine; blood', 'Annual', 'CMS134v12', 'ADA/KDIGO 2024', 'Renal function monitoring', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Diabetic Eye Exam', 'imaging', '32451-7', 'Diabetic retinal exam', '92250', 'Fundus photography; Remote retinal imaging', 'Annual', 'CMS131v12', 'ADA/AAO 2024', 'Dilated retinal exam or imaging', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Diabetic Foot Exam', 'procedure', '11428-0', 'Foot exam finding', '99213', 'Office visit + Foot exam', 'Annual', 'CMS123v12', 'ADA 2024', 'Monofilament + pulse check', v_measure_id, 8);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 9
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Thyroid Function (TSH)', 'lab', '3016-3', 'TSH in Serum', '84443', 'TSH', 'Annual', NULL, 'ADA 2024', 'Autoimmune thyroid disease screening', v_measure_id, 9);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 10
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Celiac Screening (tTG-IgA)', 'procedure', '31017-7', 'Tissue transglutaminase IgA', '86364', 'tTG IgA antibody', 'Baseline + PRN', NULL, 'ADA 2024', 'Autoimmune celiac association', v_measure_id, 10);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 11
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CGM/Insulin Pump Review', 'lab', NULL, NULL, '95251', 'CGM data interpretation; Office visit', 'Every 3 mo', NULL, 'ADA 2024', 'Continuous glucose monitoring data review', v_measure_id, 11);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 12
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Depression Screening (PHQ-9)', 'procedure', '44249-1', 'PHQ-9 total score', '96127', 'Brief emotional/behavioral assessment', 'Annual', 'CMS2v13', 'ADA 2024', 'Diabetes distress screening', v_measure_id, 12);


  -- ── Tobacco Use Disorder (TOB) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'TOB' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Tobacco Use Disorder Order Set', 'clinical', 'TOB', v_bundle_id, 'Tobacco Use Disorder clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Tobacco Use Assessment', 'procedure', '39240-7', 'Tobacco use status', '99214', 'Office visit; tobacco assessment', 'Every visit', 'CMS138v12', 'USPSTF 2021', 'Smoking status and pack-years', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Readiness to Quit Assessment', 'procedure', NULL, NULL, '99214', 'Office visit; motivational assessment', 'Every visit', 'CMS138v12', 'USPSTF 2021', 'Stages of change / 5 A''s', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Cessation Counseling', 'procedure', NULL, NULL, '99406', 'Smoking cessation counseling 3-10 min; >10 min', 'Every visit', 'CMS138v12', 'USPSTF 2021', 'Brief or intensive counseling', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'NRT/Pharmacotherapy Review', 'medication', NULL, NULL, '99214', 'Office visit; NRT/pharmacotherapy review', 'Every visit', 'CMS138v12', 'USPSTF 2021', 'Varenicline, bupropion, NRT options', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Spirometry', 'procedure', '19926-5', 'FEV1; FVC', '94010', 'Spirometry', 'Baseline + Annual', NULL, 'GOLD 2024', 'COPD screening for smokers', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Low-Dose CT Chest', 'imaging', NULL, NULL, '71271', 'Low-dose CT chest for lung cancer screening', 'Annual (if eligible)', 'CMS157v12', 'USPSTF 2021', 'Lung cancer screening (20+ pack-year, age 50-80)', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Lipid Panel / CVD Risk', 'lab', '24331-1', 'Lipid panel in Serum or Plasma', '80061', 'Lipid panel', 'Annual', 'CMS347v7', 'ACC/AHA 2018', 'Cardiovascular risk assessment', v_measure_id, 7);


  -- ── Venous Thromboembolism (VTE) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'VTE' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Venous Thromboembolism Order Set', 'clinical', 'VTE', v_bundle_id, 'Venous Thromboembolism clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'INR / PT (if on warfarin)', 'lab', '6301-6', 'INR', '85610', 'PT/INR', 'Weekly → Monthly', 'CMS164v12', 'ASH/CHEST 2021', 'Anticoagulation monitoring', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC with Differential', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Every 3 mo', NULL, 'ASH 2021', 'Monitor for bleeding, HIT', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Comprehensive Metabolic Panel', 'lab', '24323-8', 'Comprehensive metabolic panel', '80053', 'Comprehensive metabolic panel (CMP)', 'Every 6 mo', NULL, 'ASH 2021', 'Renal/hepatic for DOAC dosing', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Anti-Xa Level (DOAC)', 'procedure', NULL, NULL, '85520', 'Heparin anti-Xa assay', 'PRN', NULL, 'ASH 2021', 'DOAC level if indicated', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Thrombophilia Workup', 'lab', '21668-2', 'Factor V Leiden; Prothrombin gene', '85307', 'Factor V Leiden; PT mutation; Antiphospholipid', 'Once (if indicated)', NULL, 'ASH 2021', 'Factor V Leiden, PT gene, antiphospholipid', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'D-Dimer (post-treatment)', 'procedure', '48065-7', 'D-dimer DDU', '85379', 'D-dimer; quantitative', 'After completing anticoagulation', NULL, 'ASH 2021', 'Recurrence risk assessment', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Compression Ultrasound', 'imaging', NULL, NULL, '93970', 'Duplex venous bilateral; unilateral', 'At 3-6 mo post-DVT', NULL, 'ASH 2021', 'DVT follow-up / PTS assessment', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Bleeding Risk Assessment (HAS-BLED)', 'procedure', NULL, NULL, '99214', 'Office visit; HAS-BLED assessment', 'Every 6-12 mo', NULL, 'ASH 2021', 'Bleed risk vs. thrombosis risk', v_measure_id, 8);


  -- ── Chronic Wounds (WND) ──
  SELECT bundle_id INTO v_bundle_id FROM phm_edw.condition_bundle WHERE bundle_code = 'WND' LIMIT 1;
  INSERT INTO phm_edw.order_set (set_name, set_type, bundle_code, bundle_id, description)
  VALUES ('Chronic Wounds Order Set', 'clinical', 'WND', v_bundle_id, 'Chronic Wounds clinical order set with LOINC/CPT-4 coded actions')
  RETURNING order_set_id INTO v_set_id;

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 1
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Wound Assessment & Measurement', 'procedure', NULL, NULL, '97597', 'Wound debridement first 20 sq cm; each add''l', 'Every 1-2 weeks', NULL, 'WHS 2023', 'Length × width × depth documentation', v_measure_id, 1);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 2
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Wound Culture (if infected)', 'lab', NULL, NULL, '87070', 'Culture bacterial; additional pathogens', 'PRN', NULL, 'IDSA/WHS 2023', 'Tissue culture for infected wounds', v_measure_id, 2);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 3
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'HbA1c (diabetic wounds)', 'lab', '4548-4', 'HbA1c in Blood', '83036', 'Hemoglobin; glycosylated (A1c)', 'Every 3 mo', 'CMS122v12', 'ADA/WHS 2024', 'Glycemic control assessment', v_measure_id, 3);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 4
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Albumin / Prealbumin', 'lab', '1751-7', 'Albumin in Serum; Prealbumin in Serum', '82040', 'Albumin; Prealbumin', 'Every 4-6 weeks', NULL, 'WHS 2023', 'Nutritional status for wound healing', v_measure_id, 4);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 5
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'ABI (lower extremity wounds)', 'procedure', NULL, NULL, '93922', 'ABI bilateral', 'Baseline + every 3 mo', NULL, 'SVS/WHS 2023', 'Arterial insufficiency assessment', v_measure_id, 5);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 6
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'CBC with Differential', 'lab', '58410-2', 'CBC panel', '85025', 'CBC with differential', 'Every 2-4 weeks (active)', NULL, 'WHS 2023', 'Infection markers, anemia', v_measure_id, 6);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 7
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Venous Duplex (venous ulcers)', 'procedure', NULL, NULL, '93970', 'Duplex venous bilateral', 'Baseline', NULL, 'SVS/WHS 2023', 'Venous insufficiency evaluation', v_measure_id, 7);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 8
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Wound Photography', 'procedure', NULL, NULL, '96904', 'Wound photography', 'Every visit', NULL, 'WHS 2023', 'Serial photo documentation', v_measure_id, 8);

  SELECT md.measure_id INTO v_measure_id
    FROM phm_edw.bundle_measure bm
    JOIN phm_edw.measure_definition md ON md.measure_id = bm.measure_id
    WHERE bm.bundle_id = v_bundle_id AND bm.ordinal = 9
    LIMIT 1;
  INSERT INTO phm_edw.order_set_item (order_set_id, item_name, item_type, loinc_code, loinc_description, cpt_code, cpt_description, frequency, ecqm_reference, guideline_source, description, measure_id, ordinal)
  VALUES (v_set_id, 'Nutrition Counseling', 'procedure', NULL, NULL, '97802', 'MNT initial 15 min; each add''l 15 min', 'Every visit', NULL, 'WHS/AND 2023', 'Protein/calorie optimization', v_measure_id, 9);

  RAISE NOTICE 'Seeded % order sets with items', (SELECT COUNT(*) FROM phm_edw.order_set WHERE bundle_code IS NOT NULL);
END $$;

-- Step 3: Indexes
CREATE INDEX IF NOT EXISTS idx_order_set_bundle ON phm_edw.order_set(bundle_code) WHERE active_ind = 'Y';
CREATE INDEX IF NOT EXISTS idx_order_set_item_measure ON phm_edw.order_set_item(measure_id) WHERE active_ind = 'Y';
CREATE INDEX IF NOT EXISTS idx_order_set_item_set_ord ON phm_edw.order_set_item(order_set_id, ordinal) WHERE active_ind = 'Y';