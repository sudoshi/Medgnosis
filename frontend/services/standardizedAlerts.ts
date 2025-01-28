import type {
  StandardAlert,
  AlertCategoryGroup,
  AlertCategoryType,
} from "@/types/standardized-alerts";

const standardizedAlerts: StandardAlert[] = [
  // CBC
  {
    id: 1,
    category: "CBC",
    testParameter: "WBC",
    alertType: "Normal",
    priority: "Low",
    comment: "WBC within normal range (approx. 4k-11k)",
  },
  {
    id: 2,
    category: "CBC",
    testParameter: "WBC",
    alertType: "Abnormal",
    priority: "High",
    comment: "Significantly elevated WBC >30k",
  },
  {
    id: 3,
    category: "CBC",
    testParameter: "Hemoglobin",
    alertType: "Normal",
    priority: "Low",
    comment: "Hemoglobin within normal range",
  },
  {
    id: 4,
    category: "CBC",
    testParameter: "Hemoglobin",
    alertType: "Abnormal",
    priority: "High",
    comment: "Low hemoglobin (severe anemia <7 g/dL)",
  },
  {
    id: 5,
    category: "CBC",
    testParameter: "Platelets",
    alertType: "Normal",
    priority: "Low",
    comment: "Platelet count in normal range",
  },
  {
    id: 6,
    category: "CBC",
    testParameter: "Platelets",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severely low platelets <50k",
  },
  {
    id: 7,
    category: "CBC",
    testParameter: "Platelets",
    alertType: "Abnormal",
    priority: "Moderate",
    comment: "Elevated platelets >450k",
  },

  // BMP
  {
    id: 11,
    category: "BMP",
    testParameter: "Sodium",
    alertType: "Normal",
    priority: "Low",
    comment: "Sodium 135-145 mEq/L",
  },
  {
    id: 12,
    category: "BMP",
    testParameter: "Sodium",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe hyponatremia <125 mEq/L",
  },
  {
    id: 13,
    category: "BMP",
    testParameter: "Sodium",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe hypernatremia >155 mEq/L",
  },
  {
    id: 14,
    category: "BMP",
    testParameter: "Potassium",
    alertType: "Normal",
    priority: "Low",
    comment: "Potassium 3.5-5.0 mEq/L",
  },
  {
    id: 15,
    category: "BMP",
    testParameter: "Potassium",
    alertType: "Abnormal",
    priority: "High",
    comment: "Hyperkalemia >6.0 mEq/L",
  },

  // Imaging
  {
    id: 36,
    category: "Imaging",
    testParameter: "Chest X-ray",
    alertType: "Normal",
    priority: "Low",
    comment: "No acute findings",
  },
  {
    id: 37,
    category: "Imaging",
    testParameter: "Chest X-ray",
    alertType: "Abnormal",
    priority: "High",
    comment: "Suggestive of pneumonia",
  },
  {
    id: 38,
    category: "Imaging",
    testParameter: "Abdominal Ultrasound",
    alertType: "Normal",
    priority: "Low",
    comment: "No abnormalities detected",
  },
  {
    id: 39,
    category: "Imaging",
    testParameter: "Abdominal Ultrasound",
    alertType: "Abnormal",
    priority: "Moderate",
    comment: "Gallstones noted",
  },

  // Preventive Care
  {
    id: 46,
    category: "Preventive",
    testParameter: "Annual Wellness Visit",
    alertType: "Due",
    priority: "Moderate",
    comment: "Annual exam recommended",
  },
  {
    id: 47,
    category: "Preventive",
    testParameter: "Colonoscopy",
    alertType: "Due",
    priority: "Moderate",
    comment: "Screening due (age >50 or per guidelines)",
  },
  {
    id: 48,
    category: "Preventive",
    testParameter: "Pap Smear",
    alertType: "Due",
    priority: "Moderate",
    comment: "Routine cervical cancer screening",
  },

  // Vital Signs
  {
    id: 66,
    category: "Vital Signs",
    testParameter: "Blood Pressure",
    alertType: "Abnormal",
    priority: "Moderate",
    comment: "High BP >140/90",
  },
  {
    id: 67,
    category: "Vital Signs",
    testParameter: "Blood Pressure",
    alertType: "Normal",
    priority: "Low",
    comment: "Within normal range ~120/80",
  },
  {
    id: 71,
    category: "Vital Signs",
    testParameter: "O2 Saturation",
    alertType: "Normal",
    priority: "Low",
    comment: "Normal SpO2 95-100%",
  },
  {
    id: 72,
    category: "Vital Signs",
    testParameter: "O2 Saturation",
    alertType: "Abnormal",
    priority: "High",
    comment: "Hypoxia <90%",
  },

  // Medication
  {
    id: 76,
    category: "Medication",
    testParameter: "Refill",
    alertType: "Overdue",
    priority: "Moderate",
    comment: "Patient requires medication refill",
  },
  {
    id: 77,
    category: "Medication",
    testParameter: "Drug Interaction",
    alertType: "Flagged",
    priority: "High",
    comment: "Potential interaction identified",
  },
  {
    id: 78,
    category: "Medication",
    testParameter: "Non-Adherence",
    alertType: "Suspected",
    priority: "Moderate",
    comment: "Rx refills not picked up",
  },

  // Chronic Disease
  {
    id: 81,
    category: "Chronic Disease",
    testParameter: "Hemoglobin A1c",
    alertType: "Abnormal",
    priority: "High",
    comment: "Elevated A1c >9%",
  },
  {
    id: 82,
    category: "Chronic Disease",
    testParameter: "Hemoglobin A1c",
    alertType: "Normal",
    priority: "Low",
    comment: "A1c <5.7% (non-diabetic)",
  },
  {
    id: 85,
    category: "Chronic Disease",
    testParameter: "BNP",
    alertType: "Abnormal",
    priority: "High",
    comment: "Elevated BNP >400 pg/mL (heart failure)",
  },

  // Cardiovascular
  {
    id: 101,
    category: "Cardiovascular",
    testParameter: "Blood Pressure",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe hypertension >180/120",
    diseaseMetadata: {
      condition: "Hypertension",
      metrics: [
        {
          name: "Systolic BP",
          value: 185,
          unit: "mmHg",
          referenceRange: "120-139",
          trend: "worsening",
        },
        {
          name: "Diastolic BP",
          value: 125,
          unit: "mmHg",
          referenceRange: "80-89",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-26",
      nextFollowUp: "2024-01-28",
      complications: ["Left ventricular hypertrophy"],
      medications: ["Lisinopril 20mg daily", "Amlodipine 5mg daily"],
    },
  },
  {
    id: 102,
    category: "Cardiovascular",
    testParameter: "Lipid Panel",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe hyperlipidemia, LDL >190",
    diseaseMetadata: {
      condition: "Hyperlipidemia",
      metrics: [
        {
          name: "Total Cholesterol",
          value: 280,
          unit: "mg/dL",
          referenceRange: "<200",
          trend: "worsening",
        },
        {
          name: "LDL",
          value: 195,
          unit: "mg/dL",
          referenceRange: "<100",
          trend: "worsening",
        },
        {
          name: "HDL",
          value: 35,
          unit: "mg/dL",
          referenceRange: ">40",
          trend: "stable",
        },
      ],
      lastAssessment: "2024-01-20",
      nextFollowUp: "2024-02-20",
      complications: ["Atherosclerosis"],
      medications: ["Atorvastatin 40mg daily"],
    },
  },
  {
    id: 103,
    category: "Cardiovascular",
    testParameter: "Cardiac Enzymes",
    alertType: "Abnormal",
    priority: "High",
    comment: "Elevated troponin indicating possible ACS",
    diseaseMetadata: {
      condition: "Coronary Artery Disease",
      metrics: [
        {
          name: "Troponin I",
          value: 0.5,
          unit: "ng/mL",
          referenceRange: "<0.04",
          trend: "worsening",
        },
        {
          name: "CK-MB",
          value: 25,
          unit: "ng/mL",
          referenceRange: "<6.3",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-27",
      nextFollowUp: "2024-01-28",
      complications: ["Acute Coronary Syndrome"],
      medications: [
        "Aspirin 81mg daily",
        "Metoprolol 25mg BID",
        "Nitroglycerin PRN",
      ],
    },
  },

  // Endocrine
  {
    id: 201,
    category: "Endocrine",
    testParameter: "HbA1c",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe hyperglycemia, A1c >9%",
    diseaseMetadata: {
      condition: "Type 2 Diabetes",
      metrics: [
        {
          name: "HbA1c",
          value: 9.8,
          unit: "%",
          referenceRange: "4.0-5.6",
          trend: "worsening",
        },
        {
          name: "Fasting Glucose",
          value: 180,
          unit: "mg/dL",
          referenceRange: "70-99",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-20",
      nextFollowUp: "2024-01-27",
      complications: ["Diabetic neuropathy"],
      medications: ["Metformin 1000mg BID", "Glipizide 5mg daily"],
    },
  },
  {
    id: 202,
    category: "Endocrine",
    testParameter: "Blood Glucose",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe hypoglycemia <50 mg/dL",
    diseaseMetadata: {
      condition: "Type 1 Diabetes",
      metrics: [
        {
          name: "Blood Glucose",
          value: 45,
          unit: "mg/dL",
          referenceRange: "70-140",
          trend: "worsening",
        },
        {
          name: "HbA1c",
          value: 7.8,
          unit: "%",
          referenceRange: "4.0-5.6",
          trend: "stable",
        },
      ],
      lastAssessment: "2024-01-26",
      nextFollowUp: "2024-01-27",
      complications: ["Frequent hypoglycemic episodes"],
      medications: [
        "Insulin glargine 20 units daily",
        "Insulin lispro with meals",
      ],
    },
  },
  {
    id: 203,
    category: "Endocrine",
    testParameter: "Diabetes Complications",
    alertType: "Abnormal",
    priority: "High",
    comment: "Multiple diabetes complications requiring attention",
    diseaseMetadata: {
      condition: "Type 2 Diabetes",
      metrics: [
        {
          name: "Microalbumin/Creatinine",
          value: 150,
          unit: "mg/g",
          referenceRange: "<30",
          trend: "worsening",
        },
        {
          name: "eGFR",
          value: 45,
          unit: "mL/min/1.73m²",
          referenceRange: ">60",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-25",
      nextFollowUp: "2024-02-01",
      complications: [
        "Diabetic nephropathy",
        "Diabetic retinopathy",
        "Peripheral neuropathy",
      ],
      medications: [
        "Metformin 1000mg BID",
        "Empagliflozin 10mg daily",
        "Lisinopril 20mg daily",
      ],
    },
  },

  // Renal
  {
    id: 301,
    category: "Renal",
    testParameter: "eGFR",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe CKD, eGFR <30",
    diseaseMetadata: {
      condition: "Chronic Kidney Disease",
      metrics: [
        {
          name: "eGFR",
          value: 25,
          unit: "mL/min/1.73m²",
          referenceRange: ">60",
          trend: "worsening",
        },
        {
          name: "Creatinine",
          value: 2.8,
          unit: "mg/dL",
          referenceRange: "0.7-1.3",
          trend: "worsening",
        },
        {
          name: "BUN",
          value: 45,
          unit: "mg/dL",
          referenceRange: "7-20",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-25",
      nextFollowUp: "2024-01-28",
      complications: ["Anemia", "Secondary Hyperparathyroidism"],
      medications: [
        "Losartan 50mg daily",
        "Furosemide 40mg daily",
        "Epoetin alfa weekly",
      ],
    },
  },
  {
    id: 302,
    category: "Renal",
    testParameter: "Electrolytes",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe hyperkalemia in CKD patient",
    diseaseMetadata: {
      condition: "Chronic Kidney Disease",
      metrics: [
        {
          name: "Potassium",
          value: 6.5,
          unit: "mEq/L",
          referenceRange: "3.5-5.0",
          trend: "worsening",
        },
        {
          name: "Bicarbonate",
          value: 18,
          unit: "mEq/L",
          referenceRange: "22-29",
          trend: "stable",
        },
      ],
      lastAssessment: "2024-01-26",
      nextFollowUp: "2024-01-27",
      complications: ["Metabolic Acidosis", "Hyperkalemia"],
      medications: ["Sodium bicarbonate 650mg TID", "Calcium resonium PRN"],
    },
  },
  {
    id: 303,
    category: "Renal",
    testParameter: "Urine Studies",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe proteinuria with declining function",
    diseaseMetadata: {
      condition: "Chronic Kidney Disease",
      metrics: [
        {
          name: "Urine Protein/Creatinine",
          value: 3500,
          unit: "mg/g",
          referenceRange: "<150",
          trend: "worsening",
        },
        {
          name: "Serum Albumin",
          value: 2.8,
          unit: "g/dL",
          referenceRange: "3.5-5.0",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-24",
      nextFollowUp: "2024-01-31",
      complications: ["Nephrotic Syndrome", "Peripheral Edema"],
      medications: [
        "Lisinopril 40mg daily",
        "Furosemide 80mg BID",
        "Spironolactone 25mg daily",
      ],
    },
  },

  // Respiratory
  {
    id: 401,
    category: "Respiratory",
    testParameter: "Pulmonary Function",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe COPD exacerbation",
    diseaseMetadata: {
      condition: "COPD",
      metrics: [
        {
          name: "FEV1",
          value: 35,
          unit: "% predicted",
          referenceRange: ">80",
          trend: "worsening",
        },
        {
          name: "FEV1/FVC",
          value: 0.55,
          unit: "ratio",
          referenceRange: ">0.70",
          trend: "worsening",
        },
        {
          name: "SpO2",
          value: 88,
          unit: "%",
          referenceRange: "95-100",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-26",
      nextFollowUp: "2024-01-27",
      complications: ["Acute Exacerbation", "Hypoxemia"],
      medications: [
        "Tiotropium 18mcg daily",
        "Fluticasone/Salmeterol BID",
        "Prednisone 40mg daily",
      ],
    },
  },
  {
    id: 402,
    category: "Respiratory",
    testParameter: "Peak Flow",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe asthma exacerbation",
    diseaseMetadata: {
      condition: "Asthma",
      metrics: [
        {
          name: "Peak Flow",
          value: 150,
          unit: "L/min",
          referenceRange: "400-600",
          trend: "worsening",
        },
        {
          name: "FEV1",
          value: 45,
          unit: "% predicted",
          referenceRange: ">80",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-26",
      nextFollowUp: "2024-01-27",
      complications: ["Status Asthmaticus"],
      medications: [
        "Albuterol PRN",
        "Fluticasone/Salmeterol BID",
        "Montelukast 10mg daily",
      ],
    },
  },
  {
    id: 403,
    category: "Respiratory",
    testParameter: "Sleep Study",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe sleep apnea with COPD overlap",
    diseaseMetadata: {
      condition: "COPD with OSA Overlap",
      metrics: [
        {
          name: "AHI",
          value: 45,
          unit: "events/hour",
          referenceRange: "<5",
          trend: "worsening",
        },
        {
          name: "Minimum SpO2",
          value: 82,
          unit: "%",
          referenceRange: ">90",
          trend: "stable",
        },
      ],
      lastAssessment: "2024-01-25",
      nextFollowUp: "2024-02-01",
      complications: ["Pulmonary Hypertension", "Right Heart Failure"],
      medications: [
        "CPAP therapy",
        "Tiotropium 18mcg daily",
        "Furosemide 40mg daily",
      ],
    },
  },

  // Mental Health
  {
    id: 501,
    category: "Mental Health",
    testParameter: "PHQ-9 Score",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe depression with suicidal ideation",
    diseaseMetadata: {
      condition: "Major Depressive Disorder",
      metrics: [
        {
          name: "PHQ-9 Score",
          value: 22,
          unit: "points",
          referenceRange: "<5",
          trend: "worsening",
        },
        {
          name: "Suicidal Ideation",
          value: "Present",
          referenceRange: "Absent",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-26",
      nextFollowUp: "2024-01-27",
      complications: ["Suicidal Ideation", "Social Isolation"],
      medications: ["Sertraline 100mg daily", "Trazodone 50mg at bedtime"],
    },
  },
  {
    id: 502,
    category: "Mental Health",
    testParameter: "GAD-7 Score",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe anxiety with panic attacks",
    diseaseMetadata: {
      condition: "Generalized Anxiety Disorder",
      metrics: [
        {
          name: "GAD-7 Score",
          value: 19,
          unit: "points",
          referenceRange: "<5",
          trend: "worsening",
        },
        {
          name: "Panic Attacks",
          value: "Multiple/week",
          referenceRange: "None",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-25",
      nextFollowUp: "2024-01-28",
      complications: ["Panic Disorder", "Insomnia"],
      medications: ["Escitalopram 20mg daily", "Alprazolam 0.5mg PRN"],
    },
  },
  {
    id: 503,
    category: "Mental Health",
    testParameter: "AUDIT Score",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe alcohol use disorder with withdrawal risk",
    diseaseMetadata: {
      condition: "Alcohol Use Disorder",
      metrics: [
        {
          name: "AUDIT Score",
          value: 28,
          unit: "points",
          referenceRange: "<8",
          trend: "worsening",
        },
        {
          name: "Last Drink",
          value: "12 hours ago",
          referenceRange: "N/A",
          trend: "stable",
        },
      ],
      lastAssessment: "2024-01-26",
      nextFollowUp: "2024-01-27",
      complications: ["Withdrawal Risk", "Liver Disease"],
      medications: ["Chlordiazepoxide taper", "Thiamine supplementation"],
    },
  },

  // Neurological
  {
    id: 601,
    category: "Neurological",
    testParameter: "MMSE Score",
    alertType: "Abnormal",
    priority: "High",
    comment: "Significant cognitive decline in Alzheimer's patient",
    diseaseMetadata: {
      condition: "Alzheimer's Disease",
      metrics: [
        {
          name: "MMSE Score",
          value: 15,
          unit: "points",
          referenceRange: "24-30",
          trend: "worsening",
        },
        {
          name: "MoCA Score",
          value: 12,
          unit: "points",
          referenceRange: "26-30",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-20",
      nextFollowUp: "2024-02-20",
      complications: [
        "Behavioral Changes",
        "Activities of Daily Living Impairment",
      ],
      medications: ["Donepezil 10mg daily", "Memantine 10mg BID"],
    },
  },
  {
    id: 602,
    category: "Neurological",
    testParameter: "NIHSS Score",
    alertType: "Abnormal",
    priority: "High",
    comment: "Acute stroke with significant neurological deficits",
    diseaseMetadata: {
      condition: "Acute Ischemic Stroke",
      metrics: [
        {
          name: "NIHSS Score",
          value: 15,
          unit: "points",
          referenceRange: "0",
          trend: "worsening",
        },
        {
          name: "Blood Pressure",
          value: 185,
          unit: "mmHg",
          referenceRange: "<140/90",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-26",
      nextFollowUp: "2024-01-27",
      complications: ["Right-sided Hemiparesis", "Aphasia"],
      medications: [
        "Aspirin 325mg daily",
        "Clopidogrel 75mg daily",
        "Atorvastatin 80mg daily",
      ],
    },
  },
  {
    id: 603,
    category: "Neurological",
    testParameter: "Post-Stroke Assessment",
    alertType: "Abnormal",
    priority: "High",
    comment: "Post-stroke complications requiring intervention",
    diseaseMetadata: {
      condition: "Post-Stroke Syndrome",
      metrics: [
        {
          name: "Modified Rankin Scale",
          value: 4,
          unit: "points",
          referenceRange: "0-1",
          trend: "stable",
        },
        {
          name: "Barthel Index",
          value: 45,
          unit: "points",
          referenceRange: "100",
          trend: "improving",
        },
      ],
      lastAssessment: "2024-01-25",
      nextFollowUp: "2024-02-01",
      complications: ["Deep Vein Thrombosis", "Depression", "Spasticity"],
      medications: [
        "Enoxaparin 40mg daily",
        "Baclofen 10mg TID",
        "Sertraline 50mg daily",
      ],
    },
  },

  // Musculoskeletal
  {
    id: 701,
    category: "Musculoskeletal",
    testParameter: "Joint Assessment",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe rheumatoid arthritis flare",
    diseaseMetadata: {
      condition: "Rheumatoid Arthritis",
      metrics: [
        {
          name: "DAS28 Score",
          value: 6.2,
          unit: "points",
          referenceRange: "<2.6",
          trend: "worsening",
        },
        {
          name: "CRP",
          value: 45,
          unit: "mg/L",
          referenceRange: "<5",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-25",
      nextFollowUp: "2024-01-28",
      complications: ["Joint Deformity", "Synovitis"],
      medications: [
        "Methotrexate 20mg weekly",
        "Adalimumab 40mg biweekly",
        "Prednisone 10mg daily",
      ],
    },
  },
  {
    id: 702,
    category: "Musculoskeletal",
    testParameter: "Osteoarthritis Evaluation",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe osteoarthritis with functional decline",
    diseaseMetadata: {
      condition: "Osteoarthritis",
      metrics: [
        {
          name: "WOMAC Score",
          value: 75,
          unit: "points",
          referenceRange: "<30",
          trend: "worsening",
        },
        {
          name: "Pain Score",
          value: 8,
          unit: "/10",
          referenceRange: "<3",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-24",
      nextFollowUp: "2024-01-31",
      complications: ["Limited Mobility", "Chronic Pain"],
      medications: [
        "Celecoxib 200mg daily",
        "Tramadol 50mg PRN",
        "Duloxetine 60mg daily",
      ],
    },
  },
  {
    id: 703,
    category: "Musculoskeletal",
    testParameter: "Bone Density",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe osteoporosis with fracture risk",
    diseaseMetadata: {
      condition: "Osteoporosis",
      metrics: [
        {
          name: "T-Score",
          value: -3.5,
          unit: "SD",
          referenceRange: ">-2.5",
          trend: "stable",
        },
        {
          name: "FRAX Score",
          value: 25,
          unit: "%",
          referenceRange: "<10",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-20",
      nextFollowUp: "2024-02-20",
      complications: ["Multiple Vertebral Fractures", "Height Loss"],
      medications: ["Alendronate 70mg weekly", "Calcium/Vitamin D daily"],
    },
  },

  // Oncology
  {
    id: 801,
    category: "Oncology",
    testParameter: "Tumor Markers",
    alertType: "Abnormal",
    priority: "High",
    comment: "Rising tumor markers in breast cancer patient",
    diseaseMetadata: {
      condition: "Breast Cancer",
      metrics: [
        {
          name: "CA 15-3",
          value: 85,
          unit: "U/mL",
          referenceRange: "<30",
          trend: "worsening",
        },
        {
          name: "CEA",
          value: 12.5,
          unit: "ng/mL",
          referenceRange: "<5",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-20",
      nextFollowUp: "2024-01-27",
      complications: ["Bone Metastases", "Fatigue"],
      medications: [
        "Letrozole 2.5mg daily",
        "Palbociclib 125mg daily",
        "Zoledronic acid monthly",
      ],
    },
  },
  {
    id: 802,
    category: "Oncology",
    testParameter: "Treatment Response",
    alertType: "Abnormal",
    priority: "High",
    comment: "Disease progression on current therapy",
    diseaseMetadata: {
      condition: "Non-Small Cell Lung Cancer",
      metrics: [
        {
          name: "Target Lesion Size",
          value: 35,
          unit: "mm",
          referenceRange: "Baseline: 25",
          trend: "worsening",
        },
        {
          name: "Performance Status",
          value: 2,
          unit: "ECOG",
          referenceRange: "0-1",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-15",
      nextFollowUp: "2024-01-22",
      complications: ["Pleural Effusion", "Weight Loss"],
      medications: [
        "Pembrolizumab 200mg q3weeks",
        "Pemetrexed 500mg/m2 q3weeks",
      ],
    },
  },
  {
    id: 803,
    category: "Oncology",
    testParameter: "Treatment Toxicity",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe chemotherapy-induced neutropenia",
    diseaseMetadata: {
      condition: "Colorectal Cancer",
      metrics: [
        {
          name: "ANC",
          value: 0.4,
          unit: "K/µL",
          referenceRange: ">1.5",
          trend: "worsening",
        },
        {
          name: "Temperature",
          value: 38.5,
          unit: "°C",
          referenceRange: "<38.0",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-26",
      nextFollowUp: "2024-01-27",
      complications: ["Febrile Neutropenia", "Mucositis"],
      medications: [
        "FOLFOX regimen",
        "Filgrastim 5mcg/kg daily",
        "Broad-spectrum antibiotics",
      ],
    },
  },

  // Metabolic
  {
    id: 901,
    category: "Metabolic",
    testParameter: "BMI Assessment",
    alertType: "Abnormal",
    priority: "High",
    comment: "Severe obesity with metabolic complications",
    diseaseMetadata: {
      condition: "Obesity",
      metrics: [
        {
          name: "BMI",
          value: 42.5,
          unit: "kg/m²",
          referenceRange: "18.5-24.9",
          trend: "worsening",
        },
        {
          name: "Waist Circumference",
          value: 120,
          unit: "cm",
          referenceRange: "<88 (F) or <102 (M)",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-20",
      nextFollowUp: "2024-02-20",
      complications: ["Metabolic Syndrome", "Sleep Apnea"],
      medications: ["Phentermine 37.5mg daily", "Metformin 1000mg BID"],
    },
  },
  {
    id: 902,
    category: "Metabolic",
    testParameter: "Metabolic Panel",
    alertType: "Abnormal",
    priority: "High",
    comment: "Metabolic syndrome with multiple abnormalities",
    diseaseMetadata: {
      condition: "Metabolic Syndrome",
      metrics: [
        {
          name: "Fasting Glucose",
          value: 125,
          unit: "mg/dL",
          referenceRange: "<100",
          trend: "worsening",
        },
        {
          name: "Triglycerides",
          value: 250,
          unit: "mg/dL",
          referenceRange: "<150",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-25",
      nextFollowUp: "2024-02-01",
      complications: ["Pre-diabetes", "Dyslipidemia"],
      medications: ["Metformin 500mg BID", "Fenofibrate 145mg daily"],
    },
  },
  {
    id: 903,
    category: "Metabolic",
    testParameter: "Weight Management",
    alertType: "Abnormal",
    priority: "High",
    comment: "Rapid weight gain with complications",
    diseaseMetadata: {
      condition: "Obesity",
      metrics: [
        {
          name: "Weight Change",
          value: 15,
          unit: "kg/6mo",
          referenceRange: "stable",
          trend: "worsening",
        },
        {
          name: "Body Fat %",
          value: 45,
          unit: "%",
          referenceRange: "<32 (F) or <25 (M)",
          trend: "worsening",
        },
      ],
      lastAssessment: "2024-01-24",
      nextFollowUp: "2024-01-31",
      complications: ["Joint Pain", "Hypertension"],
      medications: ["Semaglutide 2.4mg weekly", "Topiramate 50mg BID"],
    },
  },
];

// Organize alerts by category
export const alertCategories: AlertCategoryGroup[] = [
  {
    name: "Metabolic" as AlertCategoryType,
    description: "Metabolic Disease Management",
    alerts: standardizedAlerts.filter(
      (alert) => alert.category === "Metabolic",
    ),
  },
  {
    name: "Oncology" as AlertCategoryType,
    description: "Cancer Management",
    alerts: standardizedAlerts.filter((alert) => alert.category === "Oncology"),
  },
  {
    name: "Musculoskeletal" as AlertCategoryType,
    description: "Musculoskeletal Disease Management",
    alerts: standardizedAlerts.filter(
      (alert) => alert.category === "Musculoskeletal",
    ),
  },
  {
    name: "Neurological" as AlertCategoryType,
    description: "Neurological Disease Management",
    alerts: standardizedAlerts.filter(
      (alert) => alert.category === "Neurological",
    ),
  },
  {
    name: "Mental Health" as AlertCategoryType,
    description: "Mental Health Management",
    alerts: standardizedAlerts.filter(
      (alert) => alert.category === "Mental Health",
    ),
  },
  {
    name: "Respiratory" as AlertCategoryType,
    description: "Respiratory Disease Management",
    alerts: standardizedAlerts.filter(
      (alert) => alert.category === "Respiratory",
    ),
  },
  {
    name: "Renal" as AlertCategoryType,
    description: "Renal Disease Management",
    alerts: standardizedAlerts.filter((alert) => alert.category === "Renal"),
  },
  {
    name: "Endocrine" as AlertCategoryType,
    description: "Endocrine Disease Management",
    alerts: standardizedAlerts.filter(
      (alert) => alert.category === "Endocrine",
    ),
  },
  {
    name: "Cardiovascular" as AlertCategoryType,
    description: "Cardiovascular Disease Management",
    alerts: standardizedAlerts.filter(
      (alert) => alert.category === "Cardiovascular",
    ),
  },
  {
    name: "CBC" as AlertCategoryType,
    description: "Complete Blood Count",
    alerts: standardizedAlerts.filter((alert) => alert.category === "CBC"),
  },
  {
    name: "BMP" as AlertCategoryType,
    description: "Basic Metabolic Panel",
    alerts: standardizedAlerts.filter((alert) => alert.category === "BMP"),
  },
  {
    name: "Imaging" as AlertCategoryType,
    description: "Imaging Studies",
    alerts: standardizedAlerts.filter((alert) => alert.category === "Imaging"),
  },
  {
    name: "Preventive" as AlertCategoryType,
    description: "Preventive Care",
    alerts: standardizedAlerts.filter(
      (alert) => alert.category === "Preventive",
    ),
  },
  {
    name: "Vital Signs" as AlertCategoryType,
    description: "Patient Vital Signs",
    alerts: standardizedAlerts.filter(
      (alert) => alert.category === "Vital Signs",
    ),
  },
  {
    name: "Medication" as AlertCategoryType,
    description: "Medication Management",
    alerts: standardizedAlerts.filter(
      (alert) => alert.category === "Medication",
    ),
  },
  {
    name: "Chronic Disease" as AlertCategoryType,
    description: "Chronic Disease Management",
    alerts: standardizedAlerts.filter(
      (alert) => alert.category === "Chronic Disease",
    ),
  },
];

// Helper function to get alert by ID
export const getAlertById = (id: number): StandardAlert | undefined => {
  return standardizedAlerts.find((alert) => alert.id === id);
};

// Helper function to get all alerts
export const getAllAlerts = (): StandardAlert[] => {
  return standardizedAlerts;
};

// Helper function to get unique categories
export const getUniqueCategories = (): string[] => {
  return Array.from(new Set(standardizedAlerts.map((alert) => alert.category)));
};

// Helper function to get alerts by category
export const getAlertsByCategory = (category: string): StandardAlert[] => {
  return standardizedAlerts.filter((alert) => alert.category === category);
};

// Helper function to get alerts by priority
export const getAlertsByPriority = (priority: string): StandardAlert[] => {
  return standardizedAlerts.filter((alert) => alert.priority === priority);
};
