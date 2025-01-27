import type { StandardAlert, AlertCategory } from "@/types/standardized-alerts";

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
];

// Organize alerts by category
export const alertCategories: AlertCategory[] = [
  {
    name: "CBC",
    description: "Complete Blood Count",
    alerts: standardizedAlerts.filter((alert) => alert.category === "CBC"),
  },
  {
    name: "BMP",
    description: "Basic Metabolic Panel",
    alerts: standardizedAlerts.filter((alert) => alert.category === "BMP"),
  },
  {
    name: "Imaging",
    description: "Imaging Studies",
    alerts: standardizedAlerts.filter((alert) => alert.category === "Imaging"),
  },
  {
    name: "Preventive",
    description: "Preventive Care",
    alerts: standardizedAlerts.filter(
      (alert) => alert.category === "Preventive",
    ),
  },
  {
    name: "Vital Signs",
    description: "Patient Vital Signs",
    alerts: standardizedAlerts.filter(
      (alert) => alert.category === "Vital Signs",
    ),
  },
  {
    name: "Medication",
    description: "Medication Management",
    alerts: standardizedAlerts.filter(
      (alert) => alert.category === "Medication",
    ),
  },
  {
    name: "Chronic Disease",
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
