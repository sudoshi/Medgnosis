-- =====================================================================
-- 022_demo_oncology_research.sql
-- Phase: Demo Account — Oncology Cohort + Clinical Trials + Patient Portal
-- Populates: cancer_staging, tumor_registry, genomic_marker, biomarker_result,
--            chemo_regimen, chemo_cycle, infusion_administration, toxicity_assessment,
--            radiation_plan, survivor_care_plan, surveillance_schedule,
--            treatment_outcome, tumor_board_case, tumor_board_recommendation,
--            research_site, clinical_trial, trial_criteria, informed_consent,
--            trial_enrollment, patient_message, patient_feedback
-- =====================================================================

DO $$
DECLARE
    v_prov_id         INT := 2816;
    v_org_id          INT;
    -- 5 oncology patients
    v_pat1            INT;
    v_pat2            INT;
    v_pat3            INT;
    v_pat4            INT;
    v_pat5            INT;
    v_stg_id          INT;
    v_stg2_id         INT;
    v_stg3_id         INT;
    v_stg4_id         INT;
    v_stg5_id         INT;
    v_reg_id          INT;
    v_cycle_id        INT;
    v_tb_id           INT;
    v_site_id         INT;
    v_trial1_id       INT;
    v_trial2_id       INT;
    v_trial3_id       INT;
    v_trial4_id       INT;
    v_trial5_id       INT;
    v_consent_id      INT;
    rec               RECORD;
    v_rn              INT;
BEGIN
    SELECT org_id INTO v_org_id FROM phm_edw.organization
    WHERE organization_name = 'Medgnosis Primary Care Associates' LIMIT 1;

    -- Select 5 oncology patients from panel (deterministic — oldest patients)
    SELECT patient_id INTO v_pat1 FROM phm_edw.patient
    WHERE pcp_provider_id = v_prov_id AND active_ind = 'Y'
    ORDER BY patient_id ASC LIMIT 1 OFFSET 0;

    SELECT patient_id INTO v_pat2 FROM phm_edw.patient
    WHERE pcp_provider_id = v_prov_id AND active_ind = 'Y'
    ORDER BY patient_id ASC LIMIT 1 OFFSET 1;

    SELECT patient_id INTO v_pat3 FROM phm_edw.patient
    WHERE pcp_provider_id = v_prov_id AND active_ind = 'Y'
    ORDER BY patient_id ASC LIMIT 1 OFFSET 2;

    SELECT patient_id INTO v_pat4 FROM phm_edw.patient
    WHERE pcp_provider_id = v_prov_id AND active_ind = 'Y'
    ORDER BY patient_id ASC LIMIT 1 OFFSET 3;

    SELECT patient_id INTO v_pat5 FROM phm_edw.patient
    WHERE pcp_provider_id = v_prov_id AND active_ind = 'Y'
    ORDER BY patient_id ASC LIMIT 1 OFFSET 4;

    -- ─────────────────────────────────────────────────────────────────
    -- PART A: Cancer Staging — 5 patients, 5 cancer types
    -- Patient 1: Stage III Breast Cancer (HER2+)
    -- Patient 2: Stage II Colorectal Cancer (MSI-H)
    -- Patient 3: Stage IV Non-Small Cell Lung Cancer (EGFR+)
    -- Patient 4: Stage II Prostate Cancer (Intermediate Risk)
    -- Patient 5: Stage I/II Endometrial Cancer
    -- ─────────────────────────────────────────────────────────────────

    INSERT INTO phm_edw.cancer_staging (
        patient_id, cancer_type, primary_site, icd10_code,
        staging_system, t_stage, n_stage, m_stage,
        clinical_stage, pathologic_stage, grade,
        diagnosis_date, staging_date, staged_by, notes
    ) VALUES (
        v_pat1, 'Breast Cancer', 'Left Breast', 'C50.912',
        'AJCC_8', 'T2', 'N1', 'M0',
        'Stage IIB', 'Stage IIIA', 'Grade 2',
        '2023-03-15', '2023-03-22', v_prov_id,
        'HER2+, ER+, PR-. Neoadjuvant chemotherapy initiated.'
    ) RETURNING staging_id INTO v_stg_id;

    INSERT INTO phm_edw.cancer_staging (
        patient_id, cancer_type, primary_site, icd10_code,
        staging_system, t_stage, n_stage, m_stage,
        clinical_stage, pathologic_stage, grade,
        diagnosis_date, staging_date, staged_by, notes
    ) VALUES (
        v_pat2, 'Colorectal Cancer', 'Sigmoid Colon', 'C18.7',
        'AJCC_8', 'T3', 'N1', 'M0',
        'Stage III', 'Stage IIIB', 'Grade 2',
        '2022-08-20', '2022-09-01', v_prov_id,
        'MSI-H / dMMR. Adjuvant FOLFOX initiated post-resection.'
    ) RETURNING staging_id INTO v_stg2_id;

    INSERT INTO phm_edw.cancer_staging (
        patient_id, cancer_type, primary_site, icd10_code,
        staging_system, t_stage, n_stage, m_stage,
        clinical_stage, pathologic_stage, grade,
        diagnosis_date, staging_date, staged_by, notes
    ) VALUES (
        v_pat3, 'Non-Small Cell Lung Cancer', 'Right Lower Lobe', 'C34.31',
        'AJCC_8', 'T2b', 'N2', 'M1a',
        'Stage IVA', NULL, 'Grade 3',
        '2024-01-10', '2024-01-18', v_prov_id,
        'EGFR Exon 19 deletion. Targeted therapy with osimertinib.'
    ) RETURNING staging_id INTO v_stg3_id;

    INSERT INTO phm_edw.cancer_staging (
        patient_id, cancer_type, primary_site, icd10_code,
        staging_system, t_stage, n_stage, m_stage,
        clinical_stage, pathologic_stage, grade,
        diagnosis_date, staging_date, staged_by, notes
    ) VALUES (
        v_pat4, 'Prostate Cancer', 'Prostate', 'C61',
        'AJCC_8', 'T2b', 'N0', 'M0',
        'Stage II', 'Stage IIB', 'Gleason 4+3=7',
        '2023-11-05', '2023-11-12', v_prov_id,
        'Intermediate-risk. Active surveillance vs definitive therapy discussion ongoing.'
    ) RETURNING staging_id INTO v_stg4_id;

    INSERT INTO phm_edw.cancer_staging (
        patient_id, cancer_type, primary_site, icd10_code,
        staging_system, t_stage, n_stage, m_stage,
        clinical_stage, pathologic_stage, grade,
        diagnosis_date, staging_date, staged_by, notes
    ) VALUES (
        v_pat5, 'Endometrial Cancer', 'Uterus', 'C54.1',
        'FIGO', 'T1b', 'N0', 'M0',
        'Stage IB', 'Stage IB', 'Grade 2',
        '2024-04-22', '2024-04-30', v_prov_id,
        'Type I endometrioid adenocarcinoma. Total hysterectomy performed.'
    ) RETURNING staging_id INTO v_stg5_id;

    RAISE NOTICE 'Cancer staging records created';

    -- ─────────────────────────────────────────────────────────────────
    -- PART B: Tumor Registry
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.tumor_registry (
        patient_id, staging_id, cancer_type, histology, laterality,
        behavior, sequence_number, diagnosis_date, first_course_date,
        treatment_summary, registry_status, last_contact_date
    ) VALUES
    (v_pat1, v_stg_id,  'Breast Cancer', 'Invasive ductal carcinoma', 'Left',
     'Malignant', 1, '2023-03-15', '2023-04-01',
     'Neoadjuvant AC-T chemotherapy followed by lumpectomy and radiation',
     'Active', CURRENT_DATE - INTERVAL '14 days'),
    (v_pat2, v_stg2_id, 'Colorectal Cancer', 'Adenocarcinoma', 'Not applicable',
     'Malignant', 1, '2022-08-20', '2022-09-15',
     'Laparoscopic sigmoid colectomy + adjuvant FOLFOX x 12 cycles. Completed.',
     'NED', CURRENT_DATE - INTERVAL '30 days'),
    (v_pat3, v_stg3_id, 'Non-Small Cell Lung Cancer', 'Adenocarcinoma', 'Right',
     'Malignant', 1, '2024-01-10', '2024-02-01',
     'Targeted therapy: osimertinib 80mg daily. Partial response at 3 months.',
     'Active', CURRENT_DATE - INTERVAL '7 days'),
    (v_pat4, v_stg4_id, 'Prostate Cancer', 'Acinar adenocarcinoma', 'Not applicable',
     'Malignant', 1, '2023-11-05', '2024-01-15',
     'Radical prostatectomy performed. PSA surveillance initiated.',
     'Active', CURRENT_DATE - INTERVAL '21 days'),
    (v_pat5, v_stg5_id, 'Endometrial Cancer', 'Endometrioid adenocarcinoma', 'Not applicable',
     'Malignant', 1, '2024-04-22', '2024-05-10',
     'Total hysterectomy + bilateral salpingo-oophorectomy. Adjuvant vaginal brachytherapy.',
     'NED', CURRENT_DATE - INTERVAL '10 days');

    -- ─────────────────────────────────────────────────────────────────
    -- PART C: Genomic Markers
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.genomic_marker (
        patient_id, staging_id, gene_name, alteration_type, variant_detail,
        result, test_date, test_platform, lab_name,
        clinical_significance, actionable, therapy_implication
    ) VALUES
    (v_pat1, v_stg_id,  'HER2', 'amplification', 'HER2 3+ by IHC; FISH amplified',
     'Positive', '2023-03-20', 'IHC/FISH', 'UCSF Pathology',
     'Pathogenic', TRUE, 'Trastuzumab + pertuzumab added to chemotherapy regimen'),
    (v_pat1, v_stg_id,  'BRCA2', 'mutation', 'c.5946delT (pathogenic)',
     'Positive', '2023-04-01', 'NGS Panel (Foundation One)', 'Foundation Medicine',
     'Pathogenic', TRUE, 'PARP inhibitor consideration for future lines of therapy. Refer for genetic counseling.'),
    (v_pat2, v_stg2_id, 'MLH1', 'expression', 'MSI-H (dMMR — MLH1 loss)',
     'Positive', '2022-09-05', 'PCR/IHC', 'Quest Genomics',
     'Pathogenic', TRUE, 'Immunotherapy eligibility in recurrent setting. Lynch syndrome screening.'),
    (v_pat3, v_stg3_id, 'EGFR', 'mutation', 'Exon 19 deletion (p.E746_A750del)',
     'Positive', '2024-01-20', 'NGS ctDNA (Guardant360)', 'Guardant Health',
     'Pathogenic', TRUE, 'First-line osimertinib. Monitor for T790M resistance.'),
    (v_pat3, v_stg3_id, 'TP53', 'mutation', 'p.R248W',
     'Positive', '2024-01-20', 'NGS ctDNA (Guardant360)', 'Guardant Health',
     'Likely Pathogenic', FALSE, 'Prognostic marker. No specific targeted therapy available.'),
    (v_pat4, v_stg4_id, 'AR', 'expression', 'Androgen receptor positive',
     'Positive', '2023-11-12', 'IHC', 'Stanford Pathology',
     'Pathogenic', TRUE, 'Androgen deprivation therapy consideration if disease recurs.');

    -- ─────────────────────────────────────────────────────────────────
    -- PART D: Biomarker Results (PSA, CEA, CA-125, etc.)
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.biomarker_result (
        patient_id, staging_id, biomarker_name, result_value, result_unit,
        reference_range, result_date, is_abnormal, clinical_note
    ) VALUES
    -- Breast: CA 15-3
    (v_pat1, v_stg_id,  'CA 15-3', '45.2', 'U/mL', '< 30 U/mL',
     '2024-01-15', TRUE, 'Elevated CA 15-3 — monitoring for recurrence'),
    -- Colorectal: CEA
    (v_pat2, v_stg2_id, 'CEA', '1.8', 'ng/mL', '< 3.0 ng/mL',
     '2024-02-01', FALSE, 'CEA within normal range — NED confirmed'),
    -- Lung: CEA + NSE
    (v_pat3, v_stg3_id, 'CEA', '12.4', 'ng/mL', '< 3.0 ng/mL',
     '2024-03-01', TRUE, 'Elevated CEA consistent with active metastatic disease'),
    -- Prostate: PSA
    (v_pat4, v_stg4_id, 'PSA', '0.04', 'ng/mL', '< 0.1 ng/mL post-prostatectomy',
     '2024-02-15', FALSE, 'Undetectable PSA — excellent response post-prostatectomy'),
    -- Endometrial: CA-125
    (v_pat5, v_stg5_id, 'CA-125', '8.2', 'U/mL', '< 35 U/mL',
     '2024-07-01', FALSE, 'CA-125 normal — no evidence of disease post-surgery');

    RAISE NOTICE 'Genomics and biomarkers seeded';

    -- ─────────────────────────────────────────────────────────────────
    -- PART E: Chemo Regimens + Cycles
    -- ─────────────────────────────────────────────────────────────────

    -- Patient 1: AC-T + Herceptin
    INSERT INTO phm_edw.chemo_regimen (
        patient_id, staging_id, regimen_name, regimen_type,
        drugs, planned_cycles, start_date, end_date, status, oncologist_id
    ) VALUES (
        v_pat1, v_stg_id, 'AC-T + Trastuzumab/Pertuzumab', 'neoadjuvant',
        '[{"name":"Doxorubicin","dose":"60 mg/m2","route":"IV","schedule":"Q2W"},
          {"name":"Cyclophosphamide","dose":"600 mg/m2","route":"IV","schedule":"Q2W"},
          {"name":"Paclitaxel","dose":"80 mg/m2","route":"IV","schedule":"Weekly"},
          {"name":"Trastuzumab","dose":"8 mg/kg loading, 6 mg/kg","route":"IV","schedule":"Q3W"},
          {"name":"Pertuzumab","dose":"840 mg loading, 420 mg","route":"IV","schedule":"Q3W"}]'::JSONB,
        8, '2023-04-01', '2023-08-15', 'Completed', v_prov_id
    ) RETURNING regimen_id INTO v_reg_id;

    -- Add 8 cycles
    INSERT INTO phm_edw.chemo_cycle (
        regimen_id, patient_id, cycle_number, planned_date, administered_date, cycle_status
    )
    SELECT v_reg_id, v_pat1, gs.n, '2023-04-01'::DATE + ((gs.n - 1) * 21)::INT,
           '2023-04-01'::DATE + ((gs.n - 1) * 21 + 1)::INT,
           'Administered'
    FROM generate_series(1, 8) gs(n);

    -- Infusion for cycle 1
    SELECT cycle_id INTO v_cycle_id FROM phm_edw.chemo_cycle
    WHERE regimen_id = v_reg_id AND cycle_number = 1 LIMIT 1;

    INSERT INTO phm_edw.infusion_administration (
        cycle_id, patient_id, drug_name, dose, route,
        start_datetime, end_datetime, administered_by
    ) VALUES (
        v_cycle_id, v_pat1, 'Doxorubicin + Cyclophosphamide', '60/600 mg/m2', 'IV',
        '2023-04-02 09:00'::TIMESTAMP, '2023-04-02 12:30'::TIMESTAMP,
        'Infusion Center RN'
    );

    -- Patient 2: FOLFOX (completed)
    INSERT INTO phm_edw.chemo_regimen (
        patient_id, staging_id, regimen_name, regimen_type,
        drugs, planned_cycles, start_date, end_date, status, oncologist_id
    ) VALUES (
        v_pat2, v_stg2_id, 'FOLFOX', 'adjuvant',
        '[{"name":"Oxaliplatin","dose":"85 mg/m2","route":"IV","schedule":"Q2W"},
          {"name":"Leucovorin","dose":"400 mg/m2","route":"IV","schedule":"Q2W"},
          {"name":"5-Fluorouracil","dose":"400 mg/m2 bolus + 2400 mg/m2 CI","route":"IV","schedule":"Q2W"}]'::JSONB,
        12, '2022-10-01', '2023-03-30', 'Completed', v_prov_id
    ) RETURNING regimen_id INTO v_reg_id;

    INSERT INTO phm_edw.chemo_cycle (
        regimen_id, patient_id, cycle_number, planned_date, administered_date, cycle_status
    )
    SELECT v_reg_id, v_pat2, gs.n, '2022-10-01'::DATE + ((gs.n - 1) * 14)::INT,
           '2022-10-01'::DATE + ((gs.n - 1) * 14 + 1)::INT, 'Administered'
    FROM generate_series(1, 12) gs(n);

    -- ─────────────────────────────────────────────────────────────────
    -- PART F: Toxicity Assessments
    -- ─────────────────────────────────────────────────────────────────
    SELECT cycle_id INTO v_cycle_id FROM phm_edw.chemo_cycle
    WHERE patient_id = v_pat1 AND cycle_number = 3 LIMIT 1;

    INSERT INTO phm_edw.toxicity_assessment (
        patient_id, cycle_id, assessment_date, toxicity_type,
        ctcae_grade, description, management, resolved_date
    ) VALUES
    (v_pat1, v_cycle_id, '2023-05-15', 'Nausea/Vomiting',
     2, 'Grade 2 nausea limiting oral intake.',
     'Ondansetron 8mg Q8H + prochlorperazine PRN. Encourage small frequent meals.',
     '2023-05-20'),
    (v_pat1, v_cycle_id, '2023-05-15', 'Fatigue',
     2, 'Significant fatigue limiting activities of daily living.',
     'Energy conservation counseling. Iron studies ordered.',
     '2023-06-01'),
    (v_pat2, NULL, '2023-01-10', 'Peripheral Neuropathy',
     1, 'Grade 1 sensory neuropathy — fingertip tingling.',
     'Oxaliplatin dose reduction to 75%. Gabapentin initiated.',
     '2023-04-15');

    -- ─────────────────────────────────────────────────────────────────
    -- PART G: Radiation Plans
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.radiation_plan (
        patient_id, staging_id, plan_name, radiation_type,
        target_site, total_dose_gy, fractions, fraction_dose_gy,
        start_date, end_date, status, radiation_oncologist_id, concurrent_chemo
    ) VALUES
    -- Breast: adjuvant radiation post-lumpectomy
    (v_pat1, v_stg_id, 'Whole Breast RT + Boost', 'IMRT',
     'Left Breast + Tumor Bed Boost', 50.40, 28, 1.800,
     '2023-10-01', '2023-11-05', 'Completed', v_prov_id, FALSE),
    -- Endometrial: vaginal brachytherapy
    (v_pat5, v_stg5_id, 'Vaginal Cuff Brachytherapy', 'Brachytherapy',
     'Vaginal Cuff', 21.00, 3, 7.000,
     '2024-06-15', '2024-07-01', 'Completed', v_prov_id, FALSE);

    -- ─────────────────────────────────────────────────────────────────
    -- PART H: Survivor Care Plans + Surveillance
    -- ─────────────────────────────────────────────────────────────────
    -- Patient 2 (CRC - NED) and Patient 5 (Endometrial - NED)
    INSERT INTO phm_edw.survivor_care_plan (
        patient_id, staging_id, plan_created_date,
        treatment_summary, late_effects_risk, screening_plan,
        lifestyle_recommendations, pcp_instructions, author_id, next_review_date, status
    ) VALUES
    (v_pat2, v_stg2_id, '2023-04-15',
     'Completed laparoscopic sigmoid colectomy (2022-09-15) followed by 12 cycles of adjuvant FOLFOX (completed 2023-03-30).',
     'Peripheral neuropathy (resolved). Risk of secondary colorectal cancer. Lynch syndrome implications for family members.',
     'CEA every 3 months × 2 years, then every 6 months × 3 years. CT chest/abdomen/pelvis annually × 3 years. Colonoscopy at 1 year.',
     'Mediterranean diet. Regular exercise 150 min/week. Maintain healthy weight. Avoid tobacco.',
     'Monitor for neuropathy recurrence. Coordinate genetic counseling for Lynch syndrome. Annual colonoscopy coordination.',
     v_prov_id, '2024-04-15', 'Active'),
    (v_pat5, v_stg5_id, '2024-07-15',
     'Total abdominal hysterectomy + bilateral salpingo-oophorectomy (2024-05-10). Adjuvant vaginal brachytherapy (3 fractions, completed 2024-07-01).',
     'Early menopause symptoms. Risk of vaginal stenosis. Bone density concerns.',
     'CA-125 every 6 months × 2 years. Pelvic exam every 3-6 months × 2 years, then annually. DEXA scan at 1 year.',
     'Calcium + Vitamin D supplementation. Regular weight-bearing exercise. Vaginal dilator use per radiation oncology instructions.',
     'Manage menopausal symptoms. Consider HRT risk/benefit discussion. DEXA scan and bone health monitoring.',
     v_prov_id, '2025-01-15', 'Active');

    -- Surveillance schedules
    INSERT INTO phm_edw.surveillance_schedule (
        patient_id, test_name, frequency, next_due_date, last_completed_date, status
    ) VALUES
    (v_pat2, 'CEA Level', 'Every 3 months', CURRENT_DATE + INTERVAL '45 days', CURRENT_DATE - INTERVAL '45 days', 'Pending'),
    (v_pat2, 'CT Chest/Abdomen/Pelvis', 'Annual', CURRENT_DATE + INTERVAL '8 months', CURRENT_DATE - INTERVAL '4 months', 'Pending'),
    (v_pat2, 'Colonoscopy', 'Every 1 year (then every 3–5 years)', CURRENT_DATE + INTERVAL '7 months', '2023-09-01', 'Pending'),
    (v_pat4, 'PSA Level', 'Every 3 months', CURRENT_DATE + INTERVAL '30 days', CURRENT_DATE - INTERVAL '60 days', 'Pending'),
    (v_pat5, 'CA-125', 'Every 6 months', CURRENT_DATE + INTERVAL '3 months', '2024-07-01', 'Pending'),
    (v_pat1, 'CA 15-3 + CT', 'Every 3 months', CURRENT_DATE + INTERVAL '15 days', CURRENT_DATE - INTERVAL '75 days', 'Overdue');

    -- ─────────────────────────────────────────────────────────────────
    -- PART I: Treatment Outcomes
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.treatment_outcome (
        patient_id, staging_id, assessment_date, response_type,
        assessment_method, survival_status, performance_status, notes
    ) VALUES
    (v_pat1, v_stg_id,  '2024-01-10', 'Partial Response',
     'CT + Mammogram', 'Alive-With-Disease', '1',
     'Significant tumor reduction post-neoadjuvant therapy. Surgery planned.'),
    (v_pat2, v_stg2_id, '2024-02-01', 'Complete Response',
     'CT + CEA', 'Alive-NED', '0',
     'No evidence of disease at 17-month follow-up. Surveillance ongoing.'),
    (v_pat3, v_stg3_id, '2024-04-15', 'Partial Response',
     'CT chest', 'Alive-With-Disease', '1',
     '35% reduction in target lesions. Continuing osimertinib.'),
    (v_pat4, v_stg4_id, '2024-02-20', 'Complete Response',
     'PSA', 'Alive-NED', '0',
     'Undetectable PSA post-prostatectomy. Surveillance continued.'),
    (v_pat5, v_stg5_id, '2024-10-01', 'Complete Response',
     'Clinical + CA-125', 'Alive-NED', '0',
     'No evidence of disease at 5-month follow-up.');

    RAISE NOTICE 'Oncology data seeded (staging, genomics, chemo, radiation, outcomes)';

    -- ─────────────────────────────────────────────────────────────────
    -- PART J: Tumor Board Cases
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.tumor_board_case (
        patient_id, staging_id, presentation_date, case_summary,
        clinical_question, attendees, status
    ) VALUES
    (v_pat1, v_stg_id,  '2023-05-01',
     'HER2+ ER+ Breast Cancer — Stage IIIA. Post 4 cycles AC-T. Reassessment imaging shows partial response.',
     'Optimal timing for surgery? Continue neoadjuvant vs proceed to resection?',
     'Dr. Udoshi (PCP), Medical Oncology, Surgical Oncology, Radiation Oncology, Pathology',
     'Presented'),
    (v_pat3, v_stg3_id, '2024-02-15',
     'Stage IVA NSCLC EGFR+ — 3 months on osimertinib. Partial response. Performance status ECOG 1.',
     'Role of consolidation vs maintenance? Clinical trial eligibility assessment?',
     'Dr. Udoshi (PCP), Thoracic Oncology, Pulmonology, Radiation Oncology, Palliative Care',
     'Presented');

    -- Tumor board recommendations
    FOR rec IN
        SELECT tb_case_id, patient_id FROM phm_edw.tumor_board_case
        WHERE patient_id IN (v_pat1, v_pat3)
        ORDER BY tb_case_id
    LOOP
        INSERT INTO phm_edw.tumor_board_recommendation (
            tb_case_id, recommendation_type, recommendation_text,
            rationale, assigned_to_id, due_date, status
        )
        VALUES
        (rec.tb_case_id, 'treatment',
         'Proceed with lumpectomy after 2 additional cycles (total 6 neoadjuvant). Re-evaluate margins.',
         'Partial response indicates tumor sensitivity. Additional cycles may improve pCR rate.',
         v_prov_id, CURRENT_DATE + INTERVAL '30 days', 'Pending'),
        (rec.tb_case_id, 'surveillance',
         'Repeat imaging with MRI breast in 6 weeks to reassess treatment response.',
         'MRI provides superior soft tissue resolution for breast tumor assessment.',
         v_prov_id, CURRENT_DATE + INTERVAL '45 days', 'Pending'),
        (rec.tb_case_id, 'trial',
         'Evaluate for clinical trial eligibility — PI3K pathway inhibitor study.',
         'Patient meets preliminary eligibility criteria. Refer to research team.',
         v_prov_id, CURRENT_DATE + INTERVAL '14 days', 'In Progress');
    END LOOP;

    RAISE NOTICE 'Tumor board cases seeded';

    -- ─────────────────────────────────────────────────────────────────
    -- PART K: Research Site
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.research_site (
        site_name, org_id, pi_name, address, city, state, irb_number
    ) VALUES (
        'Medgnosis Clinical Research Center',
        v_org_id,
        'Dr. Sanjay Udoshi, MD',
        '2200 Medical Center Dr, Suite 400',
        'San Jose', 'CA',
        'IRB-2023-00442'
    ) RETURNING site_id INTO v_site_id;

    -- ─────────────────────────────────────────────────────────────────
    -- PART L: Clinical Trials (5 trials)
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.clinical_trial (
        nct_number, trial_name, sponsor, phase, trial_type,
        therapeutic_area, conditions, interventions, primary_endpoint,
        start_date, estimated_end_date, status,
        target_enrollment, current_enrollment,
        primary_site_id, principal_investigator
    ) VALUES (
        'NCT05123456',
        'Abigail AI-Assisted Care Gap Closure in Primary Care — Phase III RCT',
        'Medgnosis Health',
        'Phase III', 'interventional',
        'Health Services Research',
        'Diabetes mellitus type 2, Hypertension, Heart failure',
        'AI-assisted care gap management platform vs standard of care',
        'Proportion of care gaps closed at 12 months',
        '2024-06-01', '2026-06-01', 'Recruiting',
        200, 87,
        v_site_id, v_prov_id
    ) RETURNING trial_id INTO v_trial1_id;

    INSERT INTO phm_edw.clinical_trial (
        nct_number, trial_name, sponsor, phase, trial_type,
        therapeutic_area, conditions, interventions, primary_endpoint,
        start_date, estimated_end_date, status,
        target_enrollment, current_enrollment,
        primary_site_id, principal_investigator
    ) VALUES (
        'NCT04987321',
        'GLP-1 Receptor Agonist vs DPP-4 Inhibitor for T2DM + CKD',
        'Novo Nordisk',
        'Phase IV', 'interventional',
        'Endocrinology/Nephrology',
        'Type 2 Diabetes, Chronic Kidney Disease Stage 3-4',
        'Semaglutide 1.0mg weekly vs Sitagliptin 100mg daily',
        'Change in eGFR at 24 weeks',
        '2024-01-15', '2025-07-15', 'Active Not Recruiting',
        150, 142,
        v_site_id, v_prov_id
    ) RETURNING trial_id INTO v_trial2_id;

    INSERT INTO phm_edw.clinical_trial (
        nct_number, trial_name, sponsor, phase, trial_type,
        therapeutic_area, conditions, interventions, primary_endpoint,
        start_date, estimated_end_date, status,
        target_enrollment, current_enrollment,
        primary_site_id, principal_investigator
    ) VALUES (
        'NCT05234567',
        'Collaborative Care Model for Depression + Diabetes — TEAM-D Trial',
        'PCORI',
        'Phase III', 'interventional',
        'Behavioral Health',
        'Major depressive disorder, Diabetes mellitus type 2',
        'Integrated behavioral health + diabetes management vs usual care',
        'PHQ-9 score reduction + HbA1c at 6 months',
        '2024-09-01', '2026-03-01', 'Recruiting',
        180, 43,
        v_site_id, v_prov_id
    ) RETURNING trial_id INTO v_trial3_id;

    INSERT INTO phm_edw.clinical_trial (
        nct_number, trial_name, sponsor, phase, trial_type,
        therapeutic_area, conditions, interventions, primary_endpoint,
        start_date, estimated_end_date, status,
        target_enrollment, current_enrollment,
        primary_site_id, principal_investigator
    ) VALUES (
        'NCT04876543',
        'DAPA-HF Extension: Long-Term Outcomes of SGLT2i in Heart Failure with Preserved EF',
        'AstraZeneca',
        'Phase IV', 'interventional',
        'Cardiology',
        'Heart failure with preserved ejection fraction',
        'Dapagliflozin 10mg daily vs placebo',
        'Composite cardiovascular death / HF hospitalization at 3 years',
        '2023-11-01', '2026-11-01', 'Recruiting',
        300, 112,
        v_site_id, v_prov_id
    ) RETURNING trial_id INTO v_trial4_id;

    INSERT INTO phm_edw.clinical_trial (
        nct_number, trial_name, sponsor, phase, trial_type,
        therapeutic_area, conditions, interventions, primary_endpoint,
        start_date, estimated_end_date, status,
        target_enrollment, current_enrollment,
        primary_site_id, principal_investigator
    ) VALUES (
        'NCT05456789',
        'Population Health Management Platform Adoption and Clinical Outcomes (PHMPACO)',
        'AHRQ',
        'Phase II', 'observational',
        'Health Services Research',
        'Multiple chronic conditions, Care gap management',
        'PHM platform adoption rates and care quality outcomes',
        'HEDIS composite score at 12 months',
        '2025-01-01', '2026-12-31', 'Recruiting',
        500, 234,
        v_site_id, v_prov_id
    ) RETURNING trial_id INTO v_trial5_id;

    RAISE NOTICE 'Clinical trials seeded (5 trials)';

    -- ─────────────────────────────────────────────────────────────────
    -- PART M: Trial Criteria
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.trial_criteria (trial_id, criteria_type, criteria_text)
    VALUES
    -- Trial 1 (Abigail AI)
    (v_trial1_id, 'inclusion', 'Adults ≥18 with 2+ active chronic conditions managed in primary care'),
    (v_trial1_id, 'inclusion', 'Active patient in panel with ≥1 open care gap'),
    (v_trial1_id, 'exclusion', 'Life expectancy < 6 months'),
    (v_trial1_id, 'exclusion', 'Enrolled in another interventional trial'),
    -- Trial 2 (GLP-1)
    (v_trial2_id, 'inclusion', 'T2DM with HbA1c 7.5–11.0% on ≥1 oral agent'),
    (v_trial2_id, 'inclusion', 'eGFR 25–60 mL/min/1.73m2 (CKD stage 3-4)'),
    (v_trial2_id, 'exclusion', 'Prior GLP-1 or DPP-4 use within 6 months'),
    -- Trial 3 (TEAM-D)
    (v_trial3_id, 'inclusion', 'T2DM + PHQ-9 score ≥10 at screening'),
    (v_trial3_id, 'exclusion', 'Active suicidal ideation or severe psychiatric illness');

    -- ─────────────────────────────────────────────────────────────────
    -- PART N: Trial Enrollments (15 patients across 5 trials)
    -- ─────────────────────────────────────────────────────────────────
    v_rn := 0;
    FOR rec IN
        SELECT p.patient_id, (ROW_NUMBER() OVER (ORDER BY p.patient_id))::INT AS rn
        FROM phm_edw.patient p
        WHERE p.pcp_provider_id = v_prov_id AND p.active_ind = 'Y'
        ORDER BY p.patient_id
        LIMIT 15
    LOOP
        v_rn := rec.rn;

        -- Assign to trial based on rn
        INSERT INTO phm_edw.informed_consent (
            patient_id, trial_id, consented_datetime, consent_version,
            consented_by, consent_method, is_active
        ) VALUES (
            rec.patient_id,
            CASE v_rn % 5
                WHEN 0 THEN v_trial1_id
                WHEN 1 THEN v_trial2_id
                WHEN 2 THEN v_trial3_id
                WHEN 3 THEN v_trial4_id
                ELSE        v_trial5_id
            END,
            CURRENT_DATE - ((v_rn * 15) || ' days')::INTERVAL,
            '2.0',
            v_prov_id,
            'in-person',
            TRUE
        ) RETURNING consent_id INTO v_consent_id;

        INSERT INTO phm_edw.trial_enrollment (
            trial_id, patient_id, site_id, consent_id,
            enrolled_date, arm,
            enrollment_status
        ) VALUES (
            CASE v_rn % 5
                WHEN 0 THEN v_trial1_id
                WHEN 1 THEN v_trial2_id
                WHEN 2 THEN v_trial3_id
                WHEN 3 THEN v_trial4_id
                ELSE        v_trial5_id
            END,
            rec.patient_id,
            v_site_id,
            v_consent_id,
            CURRENT_DATE - ((v_rn * 15 - 3) || ' days')::INTERVAL,
            CASE v_rn % 2 WHEN 0 THEN 'Intervention' ELSE 'Control' END,
            CASE v_rn % 6
                WHEN 5 THEN 'Withdrawn'
                ELSE        'Active'
            END
        );
    END LOOP;

    RAISE NOTICE 'Trial enrollments seeded (15 patients)';

    -- ─────────────────────────────────────────────────────────────────
    -- PART O: Patient Messages — portal inbox for Dr. Udoshi
    -- ─────────────────────────────────────────────────────────────────
    FOR rec IN
        SELECT p.patient_id, p.first_name, p.last_name,
               (ROW_NUMBER() OVER (ORDER BY p.patient_id DESC))::INT AS rn
        FROM phm_edw.patient p
        WHERE p.pcp_provider_id = v_prov_id AND p.active_ind = 'Y'
        ORDER BY p.patient_id DESC
        LIMIT 25
    LOOP
        INSERT INTO phm_edw.patient_message (
            patient_id, provider_id,
            subject, message_body, category, direction, priority,
            sent_datetime, is_read, requires_response, active_ind
        ) VALUES (
            rec.patient_id, v_prov_id,
            CASE rec.rn % 6
                WHEN 0 THEN 'Question about my medication refill'
                WHEN 1 THEN 'Lab results question'
                WHEN 2 THEN 'Appointment request'
                WHEN 3 THEN 'Feeling worse — should I come in?'
                WHEN 4 THEN 'Thank you for my care'
                ELSE        'Question about my blood pressure readings'
            END,
            CASE rec.rn % 6
                WHEN 0 THEN FORMAT('Hi Dr. Udoshi, I am running low on my metformin. Can you please send a refill to my pharmacy? Thank you, %s %s', rec.first_name, rec.last_name)
                WHEN 1 THEN FORMAT('Hello, I received my lab results but am not sure what they mean. My HbA1c came back as 8.2%%. Should I be worried? — %s', rec.first_name)
                WHEN 2 THEN FORMAT('I would like to schedule an appointment to discuss my blood pressure. It has been consistently above 140/90 at home. — %s %s', rec.first_name, rec.last_name)
                WHEN 3 THEN FORMAT('Dr. Udoshi, I have been having more shortness of breath the past 2 days and my legs feel swollen. Should I come to the office? — %s', rec.first_name)
                WHEN 4 THEN FORMAT('Dear Dr. Udoshi, I just wanted to say thank you for everything you do. My diabetes is much better controlled now! — %s %s', rec.first_name, rec.last_name)
                ELSE        FORMAT('My home blood pressure monitor shows 152/94 this morning. Is this something to worry about? — %s', rec.first_name)
            END,
            'general',
            'inbound',
            CASE rec.rn % 6 WHEN 3 THEN 'urgent' ELSE 'normal' END,
            NOW() - ((rec.rn * 2 + 1) || ' hours')::INTERVAL,
            CASE WHEN rec.rn > 15 THEN TRUE ELSE FALSE END,
            CASE rec.rn % 6 WHEN 4 THEN FALSE ELSE TRUE END,
            'Y'
        );
    END LOOP;

    RAISE NOTICE 'Patient messages seeded';

    -- ─────────────────────────────────────────────────────────────────
    -- PART P: Patient Feedback — portal satisfaction surveys
    -- ─────────────────────────────────────────────────────────────────
    INSERT INTO phm_edw.patient_feedback (
        patient_id, provider_id, survey_type,
        satisfaction_score, score_communication, score_wait_time, score_care_quality,
        verbatim_comment, feedback_date, active_ind
    )
    SELECT
        p.patient_id,
        v_prov_id,
        'visit_satisfaction',
        (4 + (p.patient_id % 2))::SMALLINT,
        (4 + (p.patient_id % 2))::SMALLINT,
        (3 + (p.patient_id % 3))::SMALLINT,
        (4 + (p.patient_id % 2))::SMALLINT,
        CASE p.patient_id % 5
            WHEN 0 THEN 'Dr. Udoshi is incredibly thorough and patient. Best primary care experience I have had.'
            WHEN 1 THEN 'Excellent visit. The doctor listened to all my concerns and explained everything clearly.'
            WHEN 2 THEN 'Wait time was a bit long but the care was outstanding. Very happy with my treatment plan.'
            WHEN 3 THEN 'The staff was very friendly and the doctor addressed all my questions about my diabetes management.'
            ELSE        'Great experience overall. Abigail tool was very helpful in identifying my care gaps.'
        END,
        CURRENT_DATE - ((p.patient_id % 45 + 1) || ' days')::INTERVAL,
        'Y'
    FROM phm_edw.patient p
    WHERE p.pcp_provider_id = v_prov_id AND p.active_ind = 'Y'
    ORDER BY p.patient_id
    LIMIT 60;

    RAISE NOTICE 'Patient feedback surveys seeded';
    RAISE NOTICE 'Migration 022 complete — Oncology, Research, Patient Portal seeded';

END $$;

-- Validation
SELECT COUNT(*) AS cancer_patients  FROM phm_edw.cancer_staging cs JOIN phm_edw.patient p ON cs.patient_id = p.patient_id WHERE p.pcp_provider_id = 2816;
SELECT COUNT(*) AS genomic_markers  FROM phm_edw.genomic_marker gm JOIN phm_edw.patient p ON gm.patient_id = p.patient_id WHERE p.pcp_provider_id = 2816;
SELECT COUNT(*) AS clinical_trials  FROM phm_edw.clinical_trial WHERE principal_investigator = 2816;
SELECT COUNT(*) AS trial_enrollments FROM phm_edw.trial_enrollment te JOIN phm_edw.patient p ON te.patient_id = p.patient_id WHERE p.pcp_provider_id = 2816;
SELECT COUNT(*) AS patient_messages FROM phm_edw.patient_message WHERE provider_id = 2816;
SELECT COUNT(*) AS feedback_surveys FROM phm_edw.patient_feedback WHERE provider_id = 2816;
