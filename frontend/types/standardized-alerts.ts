export type AlertPriority = "High" | "Moderate" | "Low";

export type AlertCategoryType =
  | "CBC"
  | "BMP"
  | "Imaging"
  | "Preventive"
  | "Vital Signs"
  | "Medication"
  | "Chronic Disease"
  | "Cardiovascular"
  | "Endocrine"
  | "Renal"
  | "Respiratory"
  | "Mental Health"
  | "Neurological"
  | "Musculoskeletal"
  | "Oncology"
  | "Metabolic";

export interface AlertCategoryGroup {
  name: AlertCategoryType;
  description: string;
  alerts: StandardizedAlert[];
}

export interface DiseaseMetadata {
  condition: string;
  metrics?: Array<{
    name: string;
    value: string | number;
    unit: string;
    trend: "improving" | "stable" | "worsening";
  }>;
  complications?: string[];
  medications?: string[];
  lastAssessment: string;
  nextFollowUp: string;
}

export interface AlertPreferenceState {
  selectedPriorities: {
    High: boolean;
    Moderate: boolean;
    Low: boolean;
  };
  selectedCategories: {
    CBC: boolean;
    BMP: boolean;
    Imaging: boolean;
    Preventive: boolean;
    "Vital Signs": boolean;
    Medication: boolean;
    "Chronic Disease": boolean;
    Cardiovascular: boolean;
    Endocrine: boolean;
    Renal: boolean;
    Respiratory: boolean;
    "Mental Health": boolean;
    Neurological: boolean;
    Musculoskeletal: boolean;
    Oncology: boolean;
    Metabolic: boolean;
  };
  enabledAlerts: Set<string>;
}

export interface StandardizedAlert {
  id: string;
  type: "lab" | "imaging" | "medication" | "condition";
  severity: "low" | "moderate" | "high" | "critical";
  category: AlertCategoryType;
  priority: AlertPriority;
  timestamp: string;
  details: {
    title: string;
    description: string;
    value?: string;
    unit?: string;
    referenceRange?: string;
    trend?: "improving" | "stable" | "worsening";
    diseaseMetadata?: DiseaseMetadata;
  };
}
