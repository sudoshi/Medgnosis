export interface StandardAlert {
  id: number;
  category: string;
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
  priority: "High" | "Moderate" | "Low";
  comment: string;
}

export interface ProviderAlertPreference {
  providerId: string;
  enabledAlerts: number[];
  categoryPreferences: Record<string, boolean>;
  priorityPreferences: Record<string, boolean>;
}

export interface AlertCategory {
  name: string;
  description: string;
  alerts: StandardAlert[];
}

export interface AlertPreferenceState {
  selectedPriorities: Record<string, boolean>;
  selectedCategories: Record<string, boolean>;
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
