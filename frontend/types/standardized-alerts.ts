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

export interface DiseaseMetadata {
  condition: string;
  metrics: {
    name: string;
    value: number | string;
    unit?: string;
    referenceRange?: string;
    trend?: "improving" | "stable" | "worsening";
  }[];
  lastAssessment?: string;
  nextFollowUp?: string;
  complications?: string[];
  medications?: string[];
}

export interface StandardAlert {
  id: number;
  category: AlertCategoryType;
  testParameter: string;
  alertType:
    | "Normal"
    | "Abnormal"
    | "Due"
    | "Recommended"
    | "Positive"
    | "Negative"
    | "Flagged"
    | "Overdue"
    | "Suspected";
  priority: AlertPriority;
  comment: string;
  diseaseMetadata?: DiseaseMetadata;
}

export interface ProviderAlertPreference {
  providerId: string;
  enabledAlerts: number[];
  categoryPreferences: Record<AlertCategoryType, boolean>;
  priorityPreferences: Record<AlertPriority, boolean>;
}

export interface AlertCategoryGroup {
  name: AlertCategoryType;
  description: string;
  alerts: StandardAlert[];
}

export interface AlertPreferenceState {
  selectedPriorities: Record<AlertPriority, boolean>;
  selectedCategories: Record<AlertCategoryType, boolean>;
  enabledAlerts: Set<number>;
}

export type AlertPriority = "High" | "Moderate" | "Low";
export type AlertType =
  | "Normal"
  | "Abnormal"
  | "Due"
  | "Recommended"
  | "Positive"
  | "Negative"
  | "Flagged"
  | "Overdue"
  | "Suspected";
