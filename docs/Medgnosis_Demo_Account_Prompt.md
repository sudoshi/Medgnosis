# Claude Code Prompt: Instantiate Medgnosis Demo Account

## Mission

Create a **complete, clinically plausible demo environment** for the Medgnosis Population Health Management EHR platform. The demo must populate **every screen** of the application with realistic data so that a live product demonstration is indistinguishable from a production system.

**Demo Provider:** Dr. Udoshi — `dr.udoshi@medgnosis.app`
**Patient Panel:** Exactly **1,288 patients** exclusively assigned to Dr. Udoshi
**Database:** PostgreSQL — schemas `phm_edw` (3NF EDW) and `phm_star` (Kimball star schema)

---

## Attached Reference Files

You have access to these files which define the existing schema and application architecture:

1. `phm-edw-ddl.sql` — Current 3NF EDW (19 tables)
2. `phm-star-ddl.sql` — Current Kimball star schema (8 dimensions, 7 fact tables)
3. `ETL_edw_to_star.sql` — Current 15-step ETL
4. `Medgnosis_Platform_Architecture.docx` — Complete platform architecture (100+ screens across 17 modules)
5. `Medgnosis_CareGap_Bundles.xlsx` — Care gap bundles for diseases 1–15 (109 measures)
6. `Medgnosis_CareGap_Bundles_16-30.xlsx` — Care gap bundles for diseases 16–30 (117 measures)
7. `Medgnosis_CareGap_Bundles_31-45.xlsx` — Care gap bundles for diseases 31–45 (124 measures)
8. `Medgnosis_Claude_Code_Prompt.md` — Star schema enhancement prompt (new dimensions, facts, indexes, materialized views, ETL steps 16–27)

**IMPORTANT:** Read the star schema enhancement prompt (`Medgnosis_Claude_Code_Prompt.md`) first — it defines new tables (dim_care_gap_bundle, bridge_bundle_measure, fact_patient_bundle, fact_patient_composite, fact_ai_risk_score, etc.) that must be created before data can be populated.

---

## Part 1: Schema Audit & Missing Tables

The current EDW supports only basic clinical data. The platform architecture defines 100+ screens that require additional backend tables. **Before generating any data**, audit the existing schema against every screen below and add the missing tables to `phm_edw`.

### 1.1 Screens → Required Tables Mapping

Below is the complete screen inventory organized by module, with the EDW tables each screen needs. Tables marked with **(NEW)** do not exist in the current schema and must be created.

---

#### MODULE A: Core Clinical (Screens 1–11)

**A1. Practitioner Dashboard**
- Daily schedule → `appointment` **(NEW)**
- Pending lab results → `lab_order` **(NEW)**, `order_result` **(NEW)**
- Urgent notifications → `notification` **(NEW)**
- Recent patient activity → `encounter` (exists), `audit_log` **(NEW)**

**A2. Patient Search & Directory**
- Patient list with filters → `patient` (exists), `patient_insurance_coverage` (exists)
- Status indicators → `appointment` **(NEW)**, `care_gap` (exists)

**A3. Patient Summary Chart**
- Medical history → `condition_diagnosis` (exists)
- Active medications → `medication_order` (exists)
- Allergies → `patient_allergy` (exists)
- Recent vitals → `vital_sign` **(NEW)** (structured vitals, separate from generic observation)
- Immunizations → `immunization` (exists)
- Problem list → `problem_list` **(NEW)** (persistent patient problem list, distinct from encounter diagnoses)

**A4. Clinical Notes & Encounter**
- SOAP documentation → `clinical_note` **(NEW)**
- ICD-10 coding → `encounter_diagnosis_code` **(NEW)** (coding-specific, links to billing)
- AI scribe suggestions → `ai_insight` **(NEW)**

**A5. E-Prescribing & Med Management**
- Current medications → `medication_order` (exists)
- Drug interactions → `drug_interaction_alert` **(NEW)**
- Pharmacy routing → `pharmacy` **(NEW)**
- Prescription transmission → `e_prescription` **(NEW)**

**A6. Lab & Imaging Results**
- Lab trend charts → `observation` (exists), `lab_order` **(NEW)**
- Radiology images → `imaging_order` **(NEW)**, `imaging_result` **(NEW)**

**A7. Scheduling & Calendar**
- Appointments → `appointment` **(NEW)**
- Provider schedule → `provider_schedule` **(NEW)**
- Check-in status → `patient_check_in` **(NEW)**
- Room/resource → `clinic_resource` **(NEW)**

**A8–A9. Telehealth Video Call & Patient Portal Telehealth**
- Session tracking → `telehealth_session` **(NEW)**

**A10. Patient Portal Dashboard**
- Messages → `patient_message` **(NEW)**
- Medication refill requests → `refill_request` **(NEW)**

**A11. Clinical Data Flowsheets**
- Longitudinal vitals/labs → `vital_sign` **(NEW)**, `observation` (exists)

---

#### MODULE B: Orders (Screens 12–15)

**B12. Orders & Results Management**
- Active orders → `clinical_order` **(NEW)** (unified order table: lab, imaging, referral, procedure)
- Results → `order_result` **(NEW)**

**B13. New Order Entry Flow**
- Order sets → `order_set` **(NEW)**, `order_set_item` **(NEW)**
- Pending basket → `order_basket` **(NEW)**

**B14. Order Set Builder**
- Protocol definitions → `order_set` **(NEW)**, `order_set_item` **(NEW)**
- Version history → `order_set_version` **(NEW)**

**B15. Order Insurance Verification**
- Prior auth → `prior_authorization` **(NEW)**
- Coverage check → `insurance_eligibility` **(NEW)**

---

#### MODULE C: Population Health & Quality (Screens 16–23)

**C16. Population Health Dashboard**
- Cohort analytics → `fact_population_snapshot` (from star schema enhancement)
- Care gap summary → `fact_patient_bundle` (from star schema enhancement)

**C17. Diabetic Cohort Detail View**
- A1C trends → `observation` (exists, filtered by LOINC)
- Complication rates → `condition_diagnosis` (exists)

**C18. MIPS & MACRA Quality Dashboard**
- Performance scores → `quality_reporting_period` **(NEW)**, `quality_score` **(NEW)**
- CMS benchmarks → `cms_benchmark` **(NEW)**

**C19. Quality Measure Patient Detail**
- Patient-level measure status → `fact_measure_result` (exists in star)

**C20. Provider Comparison**
- Provider metrics → `fact_provider_quality` (from star schema enhancement)

**C21. Chronic Disease Executive View**
- 14/45-condition heatmap → `fact_population_snapshot` (from star schema enhancement)

**C22. Condition Drill-Down**
- Per-condition provider comparison → `fact_provider_quality` (from star schema enhancement)

**C23. Patient-Level Performance Audit**
- Individual encounter audit → `fact_patient_bundle_detail` (from star schema enhancement)

---

#### MODULE D: Abigail AI (Screens 24–35)

**D24. Abigail AI Physician Assistant (sidebar)**
- Priority patients → `ai_priority_queue` **(NEW)**
- Coding suggestions → `ai_insight` **(NEW)**
- Care team tasks → `care_team_task` **(NEW)**

**D25. Care Team Coordination Hub**
- Kanban board → `care_team_task` **(NEW)**
- Team members → `care_team` **(NEW)**, `care_team_member` **(NEW)**
- Integrated chat → `team_message` **(NEW)**

**D26. Abigail Clinical Logic Settings**
- Alert configuration → `alert_rule` **(NEW)**
- AI preferences → `provider_preference` **(NEW)**

**D27. Abigail's Morning Briefing**
- Today's schedule → `appointment` **(NEW)**
- Complex patients → `ai_priority_queue` **(NEW)**
- Pending tasks → `care_team_task` **(NEW)**

**D28. Pre-Visit Preparation**
- Patient summary → `fact_patient_composite` (from star schema enhancement)
- Open care gaps → `fact_patient_bundle_detail` (from star schema enhancement)
- Recent labs/trends → `observation` (exists)

**D29. Post-Clinic Impact Summary**
- Gaps closed today → `care_gap` (exists), tracking daily delta
- Documentation status → `clinical_note` **(NEW)**
- Revenue impact → `billing_claim` **(NEW)**

**D30. AI Note Review**
- AI-generated SOAP → `ai_generated_note` **(NEW)**
- Coding suggestions → `ai_insight` **(NEW)**

**D31. Abigail Reasoning Board**
- Differential diagnosis → `differential_diagnosis` **(NEW)**
- Evidence links → `ai_insight` **(NEW)**

---

#### MODULE E: Exam Templates (Screens 36–45)

**E36–E43. System Exam Templates** (CV, Respiratory, Abdominal, Neuro, MSK, HEENT, Skin, Psych)
- Structured findings → `exam_finding` **(NEW)**
- Template definitions → `exam_template` **(NEW)**, `exam_template_item` **(NEW)**

**E44. Master ROS Template**
- System-by-system review → `review_of_systems` **(NEW)**

**E45. PE Summary Roll-up**
- Compiled findings → `exam_finding` **(NEW)** (aggregated)

---

#### MODULE F: Referrals & Care Coordination (Screens 46–56)

**F46. Specialist Referral Directory**
- Specialist network → `specialist_directory` **(NEW)**

**F47. Abigail Referral Generator**
- Referral document → `referral` **(NEW)**

**F48. Referral Loop Closer**
- Referral status tracking → `referral` **(NEW)** (status field: Sent, Scheduled, Completed, Report Received)

**F49. Consult Note Review**
- Specialist response → `consult_note` **(NEW)**

**F50. Post-Referral Med Reconciliation**
- External medication changes → `medication_reconciliation` **(NEW)**

**F51. Multi-Specialty Coordination Hub**
- Multi-specialist timeline → `referral` **(NEW)**, `consult_note` **(NEW)**

**F52. Multi-Specialty Huddle**
- Virtual collaboration → `huddle_session` **(NEW)**, `huddle_recommendation` **(NEW)**

---

#### MODULE G: Patient Portal (Screens 53–56 cont.)

**G53. Patient ROS (Pre-Visit)**
- Patient-entered symptoms → `patient_reported_outcome` **(NEW)**

**G54. My Care Plan Summary**
- Care plan → `care_plan` **(NEW)**, `care_plan_item` **(NEW)**

**G55. Patient Feedback**
- Survey responses → `patient_feedback` **(NEW)**

**G56. Global Care Plan**
- Multi-provider plan → `care_plan` **(NEW)**

---

#### MODULE H: Peer Review & Incentives (Screens 57–59)

**H57. Clinical Peer Review Workflow**
- Case review → `peer_review` **(NEW)**, `peer_review_score` **(NEW)**

**H58. Incentive & Bonus Calculator**
- Financial calculations → `provider_incentive` **(NEW)**

**H59. My Performance & Bonus Tracking**
- Provider self-view → `provider_incentive` **(NEW)**, `fact_provider_quality` (star)

---

#### MODULE I: Administrative (Screens 60–63)

**I60. Administrative & Billing Hub**
- Billing → `billing_claim` **(NEW)**, `billing_line_item` **(NEW)**
- Revenue cycle → `payment` **(NEW)**
- Coding review → `encounter_diagnosis_code` **(NEW)**

**I61. Satisfaction Analytics**
- Aggregated feedback → `patient_feedback` **(NEW)**

**I62. Service Recovery Workflow**
- Recovery cases → `service_recovery_case` **(NEW)**

**I63. Specialist Performance Report**
- External specialist metrics → `specialist_directory` **(NEW)** (response time, quality fields)

---

#### MODULE J: Mobile (Screens 64–67)

**J64–J67.** Mobile screens use the same backend tables as their desktop counterparts. No additional tables needed.

---

#### MODULE K: Specialty Templates (Screens 68–91)

**K68–K91.** 12 specialties × 2 templates (initial + follow-up)
- Specialty findings → `specialty_note` **(NEW)**
- Specialty-specific data:
  - Cardiology: `ecg_result` **(NEW)**, `echo_result` **(NEW)**
  - Dermatology: `lesion_documentation` **(NEW)** (body map pins)
  - Ophthalmology: `visual_acuity` **(NEW)**, `retinal_image` **(NEW)**
  - OB/GYN: `pregnancy_record` **(NEW)**
  - Pulmonology: `pulmonary_function_test` **(NEW)**
  - ENT: `audiogram` **(NEW)**
  - All specialties: `specialty_note` **(NEW)**

---

#### MODULE L: Oncology Suite (Screens 92–100)

**L92. Oncology Precision Dashboard**
- Genomic data → `genomic_marker` **(NEW)**, `biomarker_result` **(NEW)**
- Staging → `cancer_staging` **(NEW)**
- Tumor registry → `tumor_registry` **(NEW)**

**L93. Tumor Board**
- Cases → `tumor_board_case` **(NEW)**
- Recommendations → `tumor_board_recommendation` **(NEW)**

**L94. Chemo & Infusion Flowsheet**
- Regimens → `chemo_regimen` **(NEW)**, `chemo_cycle` **(NEW)**
- Administration → `infusion_administration` **(NEW)**
- Toxicity → `toxicity_assessment` **(NEW)**

**L95. Radiation Therapy Plan**
- Plan → `radiation_plan` **(NEW)**

**L96. Oncology Survivor Care Plan**
- Survivorship → `survivor_care_plan` **(NEW)**, `surveillance_schedule` **(NEW)**

**L97. PCP Survivor Transition Dashboard**
- Transition data → `survivor_care_plan` **(NEW)**

**L98. Oncology Outcomes Tracker**
- Survival data → `treatment_outcome` **(NEW)**

**L99. Clinical Trial Impact**
- Enrollment metrics → `clinical_trial` **(NEW)**, `trial_enrollment` **(NEW)**

**L100. Molecular Outlier View**
- Outlier identification → `genomic_marker` **(NEW)**, `treatment_outcome` **(NEW)**

---

#### MODULE M: Research (Screens 101–106)

**M101. Clinical Trial Matching**
- Trial criteria → `clinical_trial` **(NEW)**, `trial_criteria` **(NEW)**

**M102. Research Enrollment Workflow**
- Consent → `informed_consent` **(NEW)**
- Enrollment → `trial_enrollment` **(NEW)**

**M103. Research Publication Tool**
- Abstracts → `research_publication` **(NEW)**

**M104. Conference Presentation Mode**
- Presentation data → same as outcomes tracker

**M105. Multi-Center Research Hub**
- Multi-site data → `research_site` **(NEW)**, `research_collaboration` **(NEW)**

**M106. Multi-Site Trial Coordinator**
- Enrollment tracking → `trial_enrollment` **(NEW)** with site_id

---

#### MODULE N: Workflow & Infrastructure

**N107. Workflow Hub**
- Navigation state → `provider_preference` **(NEW)**

**N108. Medgnosis Style Guide**
- No backend needed (frontend only)

---

### 1.2 Consolidated New Tables Required

Create these **~65 new EDW tables** in `phm_edw`. Each table must follow the existing EDW conventions: `SERIAL` PK, `active_ind CHAR(1) DEFAULT 'Y'`, `created_date TIMESTAMP DEFAULT NOW()`, `updated_date TIMESTAMP NULL`.

**Scheduling & Workflow:**
```
appointment, provider_schedule, patient_check_in, clinic_resource
```

**Clinical Documentation:**
```
clinical_note, exam_finding, exam_template, exam_template_item,
review_of_systems, problem_list, vital_sign, specialty_note
```

**Orders:**
```
clinical_order, order_result, order_set, order_set_item,
order_set_version, order_basket
```

**Prescribing:**
```
pharmacy, e_prescription, drug_interaction_alert, refill_request
```

**Referrals & Coordination:**
```
referral, consult_note, specialist_directory, care_team,
care_team_member, care_team_task, team_message, huddle_session,
huddle_recommendation, medication_reconciliation
```

**Care Planning:**
```
care_plan, care_plan_item, patient_reported_outcome
```

**Billing & Admin:**
```
billing_claim, billing_line_item, payment, encounter_diagnosis_code,
prior_authorization, insurance_eligibility
```

**Quality & Performance:**
```
quality_reporting_period, quality_score, cms_benchmark,
peer_review, peer_review_score, provider_incentive
```

**Patient Experience:**
```
patient_message, patient_feedback, service_recovery_case
```

**AI & Notifications:**
```
notification, ai_insight, ai_priority_queue, ai_generated_note,
differential_diagnosis, alert_rule, provider_preference, audit_log
```

**Oncology:**
```
genomic_marker, biomarker_result, cancer_staging, tumor_registry,
tumor_board_case, tumor_board_recommendation, chemo_regimen,
chemo_cycle, infusion_administration, toxicity_assessment,
radiation_plan, survivor_care_plan, surveillance_schedule,
treatment_outcome
```

**Research:**
```
clinical_trial, trial_criteria, trial_enrollment, informed_consent,
research_publication, research_site, research_collaboration
```

**Specialty-Specific:**
```
ecg_result, echo_result, lesion_documentation, visual_acuity,
retinal_image, pregnancy_record, pulmonary_function_test, audiogram
```

---

## Part 2: Provider & Organization Setup

### 2.1 Organization Hierarchy

```
Medgnosis Health System (parent org)
  └── Medgnosis Primary Care Associates (clinic — org_id for Dr. Udoshi)
        └── Address: 2200 Medical Center Drive, Suite 300, San Jose, CA 95128
```

### 2.2 Provider Record

| Field | Value |
|---|---|
| first_name | Sanjay |
| middle_name | M |
| last_name | Udoshi |
| display_name | Dr. Sanjay Udoshi, MD, FACP |
| npi_number | 1234567890 |
| license_number | A123456 |
| license_state | CA |
| provider_type | MD |
| specialty | Internal Medicine |
| email | dr.udoshi@medgnosis.app |
| org_id | (Medgnosis Primary Care Associates) |

### 2.3 User Account

Create an application user account:
- username: `dr.udoshi@medgnosis.app`
- role: `Physician`
- permissions: Full clinical access
- default_landing: Practitioner Dashboard
- theme: Dark Mode
- ai_assistant: Abigail (enabled, all features on)

### 2.4 Provider Schedule Template

Dr. Udoshi's clinic schedule:
- Monday–Friday: 8:00 AM – 5:00 PM (30-min slots, 4 slots/hour)
- 1 hour lunch: 12:00–1:00 PM
- Slots per day: 16 patient slots + 2 admin slots
- Telehealth: Tuesdays & Thursdays 3:00–5:00 PM (virtual slots)

---

## Part 3: Patient Population Design (1,288 Patients)

### 3.1 Demographics Distribution

Generate **exactly 1,288 patients** with demographics reflecting a realistic US ambulatory internal medicine practice:

**Age Distribution:**
| Age Range | % | Count |
|---|---|---|
| 18–29 | 8% | 103 |
| 30–39 | 12% | 154 |
| 40–49 | 16% | 206 |
| 50–59 | 22% | 283 |
| 60–69 | 24% | 309 |
| 70–79 | 13% | 167 |
| 80+ | 5% | 66 |

**Gender:** 54% Female, 44% Male, 2% Non-binary

**Race/Ethnicity (reflecting diverse Bay Area):**
| Race | % |
|---|---|
| White | 32% |
| Hispanic/Latino | 28% |
| Asian (Indian, Chinese, Filipino, Vietnamese, Korean) | 22% |
| Black/African American | 12% |
| Multiracial/Other | 6% |

**Primary Language:** English 72%, Spanish 15%, Mandarin 4%, Hindi 3%, Vietnamese 2%, Tagalog 2%, Other 2%

**Insurance Mix:**
| Payer Type | % |
|---|---|
| Medicare | 28% |
| Commercial (BCBS, Aetna, UHC, Cigna) | 42% |
| Medicare Advantage | 12% |
| Medicaid/Medi-Cal | 10% |
| Dual-Eligible | 5% |
| Self-Pay | 3% |

### 3.2 Chronic Disease Prevalence

Assign **active chronic diagnoses** using clinically realistic prevalence for a US internal medicine panel. Patients can (and should) have multiple conditions — this is essential for demonstrating care gap bundle additivity.

| Condition | bundle_code | Prevalence (%) | ~Patients |
|---|---|---|---|
| Hypertension | HTN | 48% | 618 |
| Hyperlipidemia | HLD | 42% | 541 |
| Type 2 Diabetes | DM2 | 24% | 309 |
| Obesity (BMI ≥ 30) | OBESITY | 35% | 451 |
| Major Depressive Disorder | MDD | 14% | 180 |
| Generalized Anxiety | GAD | 11% | 142 |
| COPD | COPD | 8% | 103 |
| Asthma | ASTHMA | 10% | 129 |
| CKD (Stages 1–4) | CKD | 12% | 154 |
| CAD | CAD | 9% | 116 |
| Heart Failure | HF | 5% | 64 |
| Atrial Fibrillation | AFIB | 6% | 77 |
| Hypothyroidism | HYPO | 11% | 142 |
| Osteoarthritis | OA | 18% | 232 |
| GERD | GERD | 15% | 193 |
| Osteoporosis | OSTEO | 7% | 90 |
| PAD | PAD | 4% | 52 |
| RA | RA | 2% | 26 |
| NAFLD/CLD | NAFLD | 8% | 103 |
| Chronic Pain/Opioid Mgmt | PAIN | 6% | 77 |
| BPH | BPH | 5% | 64 |
| Chronic Migraine | MIGRAINE | 4% | 52 |
| OSA | OSA | 9% | 116 |
| Tobacco Use | TOBACCO | 12% | 154 |
| AUD | AUD | 3% | 39 |
| PTSD | PTSD | 3% | 39 |
| Bipolar | BIPOLAR | 1.5% | 19 |
| Type 1 Diabetes | DM1 | 1% | 13 |
| Gout | GOUT | 3% | 39 |
| SLE | SLE | 0.5% | 6 |
| Epilepsy | EPILEPSY | 1% | 13 |
| VTE history | VTE | 2% | 26 |
| IBD | IBD | 1.5% | 19 |
| MS | MS | 0.5% | 6 |
| Psoriasis/PsA | PSO | 2% | 26 |
| HIV | HIV | 0.5% | 6 |
| HCV | HCV | 1% | 13 |
| HBV | HBV | 0.3% | 4 |
| Parkinson's | PARK | 0.5% | 6 |
| Alzheimer's/Dementia | ALZ | 1.5% | 19 |
| Sickle Cell | SCD | 0.3% | 4 |
| PAH | PAH | 0.2% | 3 |
| Chronic Anemia | ANEMIA | 4% | 52 |
| Chronic Wounds | WOUNDS | 1% | 13 |
| Stroke history | STROKE | 2% | 26 |

**Multi-Morbidity Rules:**
- Patients with DM2 should have 60% chance of also having HTN, 55% HLD, 30% CKD, 25% OBESITY, 15% CAD
- Patients with CAD should have 70% HTN, 65% HLD, 25% DM2, 20% PAD
- Patients with HF should have 60% CAD, 50% AFIB, 40% CKD
- Patients with COPD should have 40% co-occurrence of TOBACCO
- Depression/Anxiety frequently co-occur (40% overlap)
- Obesity correlates with DM2 (50%), HTN (45%), OSA (30%), OA (35%)
- Use clinically logical age correlations (e.g., ALZ/PARK mostly 70+, ASTHMA skews younger)

### 3.3 Multi-Morbidity Targets

Ensure the patient panel shows realistic complexity:
| Chronic Condition Count | % of Patients | ~Count |
|---|---|---|
| 0 (healthy) | 15% | 193 |
| 1 | 20% | 258 |
| 2 | 22% | 283 |
| 3 | 18% | 232 |
| 4 | 12% | 154 |
| 5+ | 13% | 168 |

---

## Part 4: Clinical Data Generation

For each of the 1,288 patients, generate the following clinical data spanning the last **3 years** (Jan 2023 – Feb 2026):

### 4.1 Encounters

Each patient should have **4–12 encounters** over 3 years depending on complexity:
- Healthy patients: 1–2 per year (annual wellness + 1 sick visit)
- 1–2 conditions: 2–3 per year
- 3+ conditions: 3–5 per year
- Complex (5+ conditions): 4–6 per year

**Total encounters:** ~8,000–12,000

Encounter types: Office Visit (70%), Telehealth (15%), Annual Wellness (10%), Urgent (5%)

For each encounter, generate:
- `encounter_datetime` (distributed across 3 years, weighted toward recent 12 months)
- `encounter_type`, `encounter_reason` (chief complaint relevant to conditions)
- `status` = 'Completed' for past, 'Scheduled' for future
- Linked `clinical_note` with SOAP structure
- Linked `vital_sign` records
- Linked `observation` records (labs ordered at that visit)
- Linked `exam_finding` records (physical exam)
- Linked `encounter_diagnosis_code` (ICD-10 + CPT codes)

### 4.2 Vital Signs

For every encounter, record vitals in `vital_sign`:
- Blood Pressure (systolic/diastolic) — hypertensive patients should show some readings above 140/90, some controlled
- Heart Rate — AFib patients show irregular rates 60–120
- Temperature — usually normal (97.8–99.0°F)
- Respiratory Rate — COPD/asthma patients occasionally elevated
- Weight/BMI — obese patients BMI 30–45, track weight trends over time
- SpO2 — COPD patients occasionally 88–93%, others 95–100%
- Height — recorded at first visit

### 4.3 Lab Results (Observations)

Generate lab results in `observation` using LOINC codes. Labs should be ordered at clinically appropriate intervals:

**Diabetes labs (DM1/DM2 patients):**
- HbA1c (LOINC 4548-4): Every 3–6 months. Values: 5.5–12.0%. ~60% at goal (<7%), ~25% 7–9%, ~15% >9%
- Fasting glucose (LOINC 1558-6): With each A1c
- Lipid panel: Annually
- Comprehensive metabolic panel (BMP/CMP): Every 6 months
- Urine albumin/creatinine ratio (LOINC 9318-7): Annually

**CKD labs:**
- eGFR (LOINC 48642-3): Every 3–6 months. Stage distribution: Stage 1 (20%), Stage 2 (30%), Stage 3a (25%), Stage 3b (15%), Stage 4 (10%)
- Creatinine (LOINC 2160-0)
- BUN (LOINC 3094-0)
- Potassium, Phosphorus, Calcium, PTH as appropriate

**Cardiovascular labs:**
- Lipid panel (total cholesterol, LDL, HDL, triglycerides): Annually
- BNP (LOINC 42637-9) for HF patients: Every 3–6 months
- INR (LOINC 6301-6) for AFib patients on warfarin: Monthly
- Troponin (for CAD patients with events): Rare, 1–2 patients

**Liver labs (NAFLD/HBV/HCV):**
- ALT, AST, ALP, bilirubin, albumin: Every 6 months
- HCV viral load, HBV viral load/surface antigen as appropriate

**Thyroid:**
- TSH (LOINC 3016-3): Every 6–12 months for hypothyroid patients

**Mental Health:**
- PHQ-9 score (LOINC 44249-1): Every visit for MDD patients. Scores: 30% <5 (remission), 40% 5–14 (mild-moderate), 20% 15–19, 10% ≥20
- GAD-7 score (LOINC 69737-5): Every visit for GAD patients

**Preventive:**
- CBC: Annually for most, more frequent for anemia/SCD
- Vitamin D (LOINC 1989-3): Annually
- PSA (males >50): Annually

**Total lab results:** ~30,000–50,000 observation records

### 4.4 Medications

Assign active medications appropriate to each patient's conditions. Each patient should have **2–15 active medications** depending on condition count.

**Diabetes medications:** Metformin, Glipizide, Sitagliptin, Empagliflozin, Semaglutide, Insulin Glargine, Insulin Lispro
**HTN medications:** Lisinopril, Amlodipine, Losartan, Metoprolol, HCTZ, Chlorthalidone
**Cardiac:** Atorvastatin, Rosuvastatin, Aspirin, Clopidogrel, Apixaban, Warfarin, Carvedilol, Entresto
**Respiratory:** Albuterol, Tiotropium, Fluticasone/Salmeterol, Budesonide/Formoterol, Montelukast
**Mental Health:** Sertraline, Escitalopram, Bupropion, Duloxetine, Quetiapine, Lithium, Lamotrigine
**Pain:** Gabapentin, Pregabalin, Tramadol, Acetaminophen, Meloxicam
**GI:** Omeprazole, Pantoprazole, Famotidine
**Thyroid:** Levothyroxine
**Other:** Alendronate, Tamsulosin, Finasteride, Hydroxychloroquine, Methotrexate

Generate `medication_order` records with proper dosage, frequency, route, start date, and prescription_status.

**Total medication orders:** ~6,000–10,000

### 4.5 Allergies

Assign 0–4 allergies per patient:
- 30% of patients have no allergies (NKDA)
- 40% have 1 allergy
- 20% have 2 allergies
- 10% have 3–4 allergies

Common allergies: Penicillin, Sulfa, Aspirin, Ibuprofen, Codeine, Latex, Shellfish, Peanuts, Morphine, ACE inhibitors (cough)

### 4.6 Immunizations

Generate immunization records:
- Flu vaccine: Annually for most patients (85% compliance)
- Pneumovax/Prevnar: For patients 65+, diabetics, CKD, COPD
- COVID-19: Initial + boosters (varied compliance 70–90%)
- Shingrix: For patients 50+ (60% compliance)
- Tdap: Every 10 years
- Hepatitis B: For HBV patients, healthcare workers

### 4.7 SDOH Assessments

Generate SDOH data for ~40% of patients:
- Food insecurity: 8% of panel
- Housing instability: 4%
- Transportation barrier: 6%
- Social isolation: Score 0–10, higher for elderly/depression patients

### 4.8 Problem List

Maintain a persistent `problem_list` for each patient (distinct from encounter-level diagnoses):
- All active chronic diagnoses
- Resolved conditions (10% of patients have resolved conditions like past pneumonia, fracture)
- Date of onset for each problem

---

## Part 5: Care Gap Bundle Population

### 5.1 Measure Definitions

Seed `phm_edw.measure_definition` with all **350 measures** from the three care gap bundle workbooks. Each measure needs:
- `measure_code` (e.g., 'CMS122v12')
- `measure_name` (e.g., 'Diabetes: Hemoglobin A1c Poor Control')
- `measure_type` ('Chronic' for most, 'Preventive' for screening measures)
- `denominator_criteria`, `numerator_criteria`, `exclusion_criteria`

### 5.2 Care Gap Records

For each patient, evaluate all applicable bundles (based on their active diagnoses) and generate `care_gap` records:

**Compliance Distribution:**
- 25% of gap measures should be **Closed** (numerator met) — patient is compliant
- 45% should be **Open** (overdue but not yet critical) — recently due
- 20% should be **Open** (significantly overdue > 6 months)
- 10% should be **Excluded** (patient meets exclusion criteria)

This means Dr. Udoshi's panel will show:
- ~75% of applicable measures have actionable gaps
- This creates urgency and demonstrates the Care Gap Action Task List

**Realistic variation:** Some patients should be "star patients" (90%+ compliance), others "high risk" (< 30% compliance). Distribution:
| Compliance Tier | % of Patients with Bundles |
|---|---|
| Excellent (80–100%) | 15% |
| Good (60–79%) | 25% |
| Fair (40–59%) | 30% |
| Poor (20–39%) | 20% |
| Critical (<20%) | 10% |

---

## Part 6: Appointments & Schedule

### 6.1 Historical Appointments

Link every past encounter to an `appointment` record:
- Status: Completed
- Check-in time, start time, end time
- Room assignment

### 6.2 Future Appointments (Next 30 Days)

Generate **~80 future appointments** for the next 30 days:
- 16 patient slots per clinic day × ~20 clinic days = 320 slots
- Fill ~75% = 240 appointments
- Show 80 in the next 30-day window for demo
- Mix of:
  - Follow-ups for chronic disease (60%)
  - Annual wellness visits (15%)
  - New patient visits (5%)
  - Telehealth visits (15%)
  - Urgent same-day (5%)

### 6.3 Today's Schedule (Critical for Morning Briefing)

Generate **16 appointments for "today"** with specific patients chosen to demonstrate key features:
- Patient 1: DM2 + CKD + HTN — 3 open bundles, A1c overdue, demonstrates care gap bundle drill-down
- Patient 2: New patient with chest pain — demonstrates Abigail reasoning board
- Patient 3: Cancer survivor (post-chemo) — demonstrates oncology survivor care plan
- Patient 4: Complex elderly (80+) with 5 conditions — demonstrates multi-morbidity bundling
- Patient 5: Depression + anxiety — demonstrates PHQ-9/GAD-7 trending, psych template
- Patient 6: COPD exacerbation follow-up — demonstrates respiratory template
- Patient 7: Telehealth visit for med refill — demonstrates telehealth workflow
- Patient 8: Annual wellness for healthy 35-year-old — demonstrates preventive care
- Patients 9–16: Mix of follow-ups for various chronic conditions

---

## Part 7: Orders & Prescriptions

### 7.1 Clinical Orders

Generate ~3,000–5,000 `clinical_order` records across the panel:
- Lab orders (60%): CBC, CMP, lipid panel, A1c, TSH, UA, etc.
- Imaging orders (15%): Chest X-ray, DEXA scan, CT, MRI, Echo
- Referral orders (15%): To the 12 specialties
- Procedure orders (10%): Colonoscopy, EGD, spirometry, skin biopsy

Each order has a status progression: Ordered → Resulted (for labs/imaging), or Ordered → Scheduled → Completed (for referrals/procedures)

### 7.2 Order Sets

Create 10 standard order sets:
1. Annual Wellness Visit (adult)
2. Diabetes Quarterly Follow-up
3. Heart Failure Follow-up
4. COPD Management
5. New Patient Workup
6. Hypertension Follow-up
7. Pre-Operative Clearance
8. Depression Follow-up
9. CKD Monitoring
10. Anticoagulation Management

### 7.3 Pending Orders (for demo)

Leave **15–20 orders** in "Pending" status for Dr. Udoshi to sign during demo (shows Order Basket feature).

### 7.4 Active Referrals

Generate **50–80 referral records** in various statuses:
- Sent (awaiting scheduling): 20%
- Scheduled: 30%
- Completed (awaiting report): 15%
- Report Received: 25%
- Closed (reviewed by PCP): 10%

Include at least 2 referrals to each of the 12 specialties.

### 7.5 Consult Notes

For referrals with status "Report Received" or "Closed," generate corresponding `consult_note` records with specialty-appropriate findings and recommendations.

---

## Part 8: AI & Abigail Data

### 8.1 AI Insights

Generate **200–300 `ai_insight` records** representing Abigail's analysis:
- Coding suggestions (30%): "Consider adding E11.65 (DM2 with hyperglycemia) based on A1c 9.2"
- Care gap alerts (30%): "Patient overdue for diabetic eye exam by 8 months"
- Drug interaction warnings (10%): "Potential interaction: Warfarin + Fluconazole"
- Risk escalation (15%): "Patient's eGFR declined from 52 to 38 in 6 months — consider nephrology referral"
- Documentation improvement (15%): "HCC opportunity: Document CKD stage explicitly for risk adjustment"

### 8.2 AI Priority Queue

Populate `ai_priority_queue` with **today's top 20 priority patients** based on:
- Overdue critical care gaps (5 patients)
- Deteriorating lab trends (4 patients)
- Recently hospitalized / ED visit (3 patients)
- High-risk score patients (4 patients)
- Documentation opportunities (4 patients)

### 8.3 AI Risk Scores

Generate `fact_ai_risk_score` data for all patients with at least 1 chronic condition:
- HCC Risk Score: 0.5–4.5 (higher for multi-morbid)
- 30-Day Readmission Risk: 0.01–0.45
- ED Utilization Risk: 0.02–0.55
- Abigail Composite Priority: 0–100

**Risk Tier Distribution:**
| Tier | Score Range | % of Panel |
|---|---|---|
| Critical | 80–100 | 5% |
| High | 60–79 | 12% |
| Medium | 30–59 | 35% |
| Low | 0–29 | 48% |

### 8.4 AI-Generated Notes

Create **5 sample `ai_generated_note` records** for today's patients showing Abigail's scribe output — complete SOAP notes with ICD-10 suggestions, ready for physician approval.

### 8.5 Morning Briefing Data

Pre-compute data for today's morning briefing:
- 16 scheduled patients with complexity flags
- 3 critical lab results from overnight
- 5 care gaps closable today
- 2 pending peer review items
- Revenue projection for the day ($X based on scheduled visit types)

---

## Part 9: Quality & Performance Data

### 9.1 Quality Scores

Generate `quality_score` records for 4 quarterly reporting periods (Q1 2025 – Q4 2025):
- Score Dr. Udoshi on each of the 45 bundle-level measures
- Overall MIPS composite: 82/100 (good but room for improvement)
- Quality category: 78/100
- Promoting Interoperability: 90/100
- Improvement Activities: 85/100

### 9.2 CMS Benchmarks

Populate `cms_benchmark` with national/regional benchmarks for each measure so the dashboard can show Dr. Udoshi vs. peers.

### 9.3 Peer Review

Generate **8 `peer_review` records** — mock peer reviews of Dr. Udoshi's cases with scores and qualitative feedback.

### 9.4 Provider Incentive

Calculate bonus projections based on quality scores:
- Base compensation target
- Quality bonus potential: $25,000
- Current projected bonus: $18,500 (74% of potential)
- Show which measures, if improved, would increase the bonus

---

## Part 10: Billing & Financial Data

### 10.1 Billing Claims

Generate `billing_claim` records for all completed encounters:
- CPT codes: 99213 (established, moderate - 40%), 99214 (established, high - 30%), 99215 (established, complex - 10%), 99395/99396 (wellness - 10%), 99441-99443 (telehealth - 10%)
- Status: Submitted (60%), Paid (30%), Denied (5%), Pending (5%)
- Average reimbursement by code

### 10.2 Revenue Summary

Pre-calculate for the Administrative & Billing Hub:
- Monthly revenue trend (last 12 months)
- Payer mix revenue breakdown
- Denial rate by payer
- Average days to payment

---

## Part 11: Oncology Data (Small Cohort)

Create a small but complete oncology cohort within the panel:

**5 cancer patients** (current or historical):
1. **Breast cancer** — Stage IIA, completed chemo + radiation, now in 5-year surveillance (Year 2)
2. **Colon cancer** — Stage IIIB, active chemo (FOLFOX cycle 8 of 12), genomic markers show MSI-H
3. **Prostate cancer** — Gleason 3+3, active surveillance (no treatment), PSA monitoring
4. **Lung cancer (NSCLC)** — Stage IV, EGFR+, on targeted therapy (Osimertinib), responding well
5. **Melanoma** — Stage IB, post-excision, immunotherapy completed, now surveillance

For each, generate:
- `cancer_staging`, `tumor_registry` records
- `genomic_marker` / `biomarker_result` (BRCA, MSI, EGFR, BRAF, PD-L1)
- `chemo_regimen`, `chemo_cycle`, `infusion_administration` (as applicable)
- `radiation_plan` (as applicable)
- `survivor_care_plan`, `surveillance_schedule`
- `treatment_outcome` with response assessment
- `tumor_board_case` + `tumor_board_recommendation` for at least 3 patients

---

## Part 12: Research & Clinical Trials

### 12.1 Clinical Trials

Create **5 active clinical trials** in `clinical_trial`:
1. "EMPOWER-DM2" — Semaglutide vs Tirzepatide for DM2 with obesity (Phase III)
2. "BREATHE-COPD" — Novel inhaler for COPD exacerbation prevention (Phase II)
3. "HEART-SAFE" — AI-guided heart failure management (Phase II)
4. "MIND-CLEAR" — Digital cognitive behavioral therapy for depression (Phase III)
5. "SHIELD-CKD" — Finerenone for early CKD with DM2 (Phase III)

### 12.2 Trial Enrollment

Enroll **15 patients** across these 5 trials (3 per trial) in `trial_enrollment` with proper informed consent records.

### 12.3 Trial Criteria

Populate `trial_criteria` with realistic inclusion/exclusion criteria for each trial.

---

## Part 13: Patient Portal & Messaging

### 13.1 Patient Messages

Generate **200 `patient_message` records** over the last 6 months:
- Medication questions (30%)
- Appointment requests (25%)
- Lab result inquiries (20%)
- Symptom reports (15%)
- Referral follow-up (10%)

Include both patient-to-provider and provider-to-patient messages.

### 13.2 Patient Feedback

Generate **150 `patient_feedback` records** from the last 12 months:
- NPS scores: Mean 72, range 20–100
- Satisfaction distribution: Very Satisfied 45%, Satisfied 30%, Neutral 15%, Dissatisfied 8%, Very Dissatisfied 2%
- 20% include text comments

### 13.3 Patient-Reported Outcomes

Generate `patient_reported_outcome` data for patients using the pre-visit portal:
- ~30% of patients complete pre-visit ROS questionnaires
- PHQ-9 / GAD-7 self-reports for behavioral health patients

---

## Part 14: Care Teams & Coordination

### 14.1 Care Team

Create Dr. Udoshi's care team in `care_team` + `care_team_member`:

| Name | Role | Specialty |
|---|---|---|
| Dr. Sanjay Udoshi | Lead Physician | Internal Medicine |
| Maria Santos, RN | Nurse Manager | Nursing |
| James Chen, PA-C | Physician Assistant | Internal Medicine |
| Priya Patel, MA | Medical Assistant | Clinical Support |
| Emily Rodriguez, RN | Care Coordinator | Care Management |
| Sarah Kim, PharmD | Clinical Pharmacist | Pharmacy |
| David Okafor, LCSW | Social Worker | Behavioral Health |

### 14.2 Care Team Tasks

Generate **50 active `care_team_task` records** in various states:
- To-Do (30%): "Call Mrs. Hernandez re: abnormal A1c", "Schedule Mr. Lee for DEXA scan"
- In Progress (25%): "Prior auth for MRI — awaiting Aetna response"
- Completed (45%): Historical completed tasks

### 14.3 Notifications

Generate **30 unread `notification` records** for Dr. Udoshi:
- Critical lab results (5)
- Care gap alerts (8)
- Referral reports received (5)
- Patient messages needing response (7)
- Peer review assignments (2)
- System notifications (3)

---

## Part 15: Star Schema & ETL Execution

After all EDW data is populated:

1. **Run the enhanced ETL** (original 15 steps + new steps 16–27 from `Medgnosis_Claude_Code_Prompt.md`) to populate all star schema tables
2. **Refresh all materialized views**
3. **Verify data integrity:**
   - All 1,288 patients appear in `dim_patient`
   - All patients with chronic conditions have corresponding `fact_patient_bundle` rows
   - `fact_patient_composite` has exactly 1,288 rows
   - `fact_patient_bundle_detail` has the correct measure counts per bundle
   - All materialized views return data
   - Care gap compliance percentages are calculated correctly
   - AI risk scores are populated

---

## Part 16: Data Validation Queries

After populating everything, run these validation queries and report results:

```sql
-- 1. Patient count
SELECT COUNT(*) FROM phm_edw.patient WHERE pcp_provider_id = (SELECT provider_id FROM phm_edw.provider WHERE email = 'dr.udoshi@medgnosis.app');
-- Expected: 1288

-- 2. Encounter volume
SELECT COUNT(*) FROM phm_edw.encounter e JOIN phm_edw.patient p ON e.patient_id = p.patient_id WHERE p.pcp_provider_id = ?;
-- Expected: 8000–12000

-- 3. Active chronic diagnoses
SELECT COUNT(DISTINCT cd.patient_id) FROM phm_edw.condition_diagnosis cd WHERE cd.diagnosis_type = 'CHRONIC' AND cd.diagnosis_status = 'ACTIVE';
-- Expected: ~1095 (85% of 1288 have at least 1 chronic condition)

-- 4. Care gap records
SELECT gap_status, COUNT(*) FROM phm_edw.care_gap GROUP BY gap_status;
-- Expected: Mix of Open and Closed

-- 5. Multi-morbidity check
SELECT chronic_count, COUNT(*) as patients FROM (
  SELECT cd.patient_id, COUNT(DISTINCT cd.condition_id) as chronic_count
  FROM phm_edw.condition_diagnosis cd
  WHERE cd.diagnosis_type = 'CHRONIC' AND cd.diagnosis_status = 'ACTIVE'
  GROUP BY cd.patient_id
) sub GROUP BY chronic_count ORDER BY chronic_count;
-- Expected: Distribution matching Part 3.3

-- 6. Star schema composite
SELECT COUNT(*) FROM phm_star.fact_patient_composite;
-- Expected: 1288

-- 7. Bundle assignments
SELECT b.bundle_code, COUNT(*) as patients
FROM phm_star.fact_patient_bundle fpb
JOIN phm_star.dim_care_gap_bundle b ON fpb.bundle_key = b.bundle_key
WHERE fpb.is_active = TRUE
GROUP BY b.bundle_code ORDER BY patients DESC;
-- Expected: HTN highest (~618), followed by HLD (~541), etc.

-- 8. Today's schedule
SELECT COUNT(*) FROM phm_edw.appointment WHERE provider_id = ? AND appointment_date = CURRENT_DATE;
-- Expected: 16

-- 9. Unread notifications
SELECT COUNT(*) FROM phm_edw.notification WHERE provider_id = ? AND read_ind = 'N';
-- Expected: 30

-- 10. Active orders pending signature
SELECT COUNT(*) FROM phm_edw.clinical_order WHERE ordering_provider_id = ? AND order_status = 'Pending';
-- Expected: 15–20
```

---

## Deliverables

1. **`phm-edw-ddl-complete.sql`** — Updated EDW DDL with all ~65 new tables added
2. **`phm-star-ddl-complete.sql`** — Updated star schema with all enhancements from `Medgnosis_Claude_Code_Prompt.md`
3. **`ETL_edw_to_star_complete.sql`** — Updated ETL with all 27 steps
4. **`seed_demo_data.sql`** (or Python script) — Populates all EDW tables with the 1,288-patient demo dataset
5. **`seed_bundles.sql`** — Populates dim_care_gap_bundle (45 bundles) and bridge_bundle_measure (350 measures)
6. **`validate_demo.sql`** — Runs the validation queries from Part 16 and reports results

**Execution order:**
1. Run `phm-edw-ddl-complete.sql`
2. Run `phm-star-ddl-complete.sql`
3. Run `seed_bundles.sql`
4. Run `seed_demo_data.sql`
5. Run `ETL_edw_to_star_complete.sql`
6. Run `validate_demo.sql`

---

## Critical Reminders

- **All 1,288 patients** must have `pcp_provider_id` pointing to Dr. Udoshi's `provider_id`
- **Clinical plausibility matters** — medications must match diagnoses, lab values must be physiologically possible, age-appropriate conditions, logical multi-morbidity patterns
- **HIPAA:** All patient data is synthetic. Use realistic but fictional names. Do NOT use real patient data. Generate diverse names matching the ethnic distribution.
- **Dates:** All data should span Jan 2023 – Feb 2026. Use `CURRENT_DATE` for snapshot calculations.
- **The care gap bundle framework** (45 diseases, 350 measures, 19 deduplication domains) is the centerpiece of the platform. Every patient with a qualifying chronic diagnosis MUST have their bundles evaluated and care gaps generated.
- **Additive bundling with deduplication:** If Mrs. Hernandez has DM2 + HTN + CKD, she gets all three bundles (8 + 6 + 9 = 23 measures) minus deduplicated overlaps (BP control counted once, etc.) for a net of ~18–20 unique measures.
