import type { AlertCategoryGroup } from "@/types/standardized-alerts";

export const alertCategories: AlertCategoryGroup[] = [
  {
    name: "CBC",
    description: "Complete Blood Count test results and abnormalities",
    alerts: [
      {
        id: "cbc-1",
        type: "lab",
        severity: "high",
        category: "CBC",
        priority: "High",
        timestamp: new Date().toISOString(),
        details: {
          title: "Low Hemoglobin",
          description: "Hemoglobin levels below normal range",
          value: "10.5",
          unit: "g/dL",
          referenceRange: "12.0-15.5",
          trend: "worsening",
        },
      },
    ],
  },
  {
    name: "BMP",
    description: "Basic Metabolic Panel test results and abnormalities",
    alerts: [
      {
        id: "bmp-1",
        type: "lab",
        severity: "moderate",
        category: "BMP",
        priority: "Moderate",
        timestamp: new Date().toISOString(),
        details: {
          title: "Elevated Creatinine",
          description: "Creatinine levels above normal range",
          value: "1.8",
          unit: "mg/dL",
          referenceRange: "0.7-1.3",
          trend: "stable",
        },
      },
    ],
  },
  {
    name: "Cardiovascular",
    description: "Heart-related conditions and risk factors",
    alerts: [
      {
        id: "cardio-1",
        type: "condition",
        severity: "critical",
        category: "Cardiovascular",
        priority: "High",
        timestamp: new Date().toISOString(),
        details: {
          title: "Uncontrolled Hypertension",
          description: "Blood pressure consistently elevated",
          diseaseMetadata: {
            condition: "Hypertension",
            metrics: [
              {
                name: "Systolic BP",
                value: 165,
                unit: "mmHg",
                trend: "worsening",
              },
              {
                name: "Diastolic BP",
                value: 95,
                unit: "mmHg",
                trend: "stable",
              },
            ],
            complications: ["Left Ventricular Hypertrophy"],
            medications: ["Lisinopril", "Amlodipine"],
            lastAssessment: new Date().toISOString(),
            nextFollowUp: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
        },
      },
    ],
  },
  {
    name: "Endocrine",
    description: "Hormone-related conditions and metabolic disorders",
    alerts: [
      {
        id: "endo-1",
        type: "condition",
        severity: "high",
        category: "Endocrine",
        priority: "High",
        timestamp: new Date().toISOString(),
        details: {
          title: "Uncontrolled Diabetes",
          description: "HbA1c above target range",
          diseaseMetadata: {
            condition: "Type 2 Diabetes",
            metrics: [
              {
                name: "HbA1c",
                value: 8.5,
                unit: "%",
                trend: "worsening",
              },
              {
                name: "Fasting Glucose",
                value: 180,
                unit: "mg/dL",
                trend: "stable",
              },
            ],
            complications: ["Diabetic Neuropathy"],
            medications: ["Metformin", "Glipizide"],
            lastAssessment: new Date().toISOString(),
            nextFollowUp: new Date(
              Date.now() + 14 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
        },
      },
    ],
  },
];
