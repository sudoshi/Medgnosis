export type AlertType = "all" | "general" | "specific";
export type AlertCategory =
  | "all"
  | "Cardiovascular"
  | "Endocrine"
  | "Renal"
  | "Respiratory"
  | "Mental Health"
  | "Neurological"
  | "Musculoskeletal"
  | "Oncology"
  | "Metabolic"
  | "CBC"
  | "BMP"
  | "Imaging"
  | "Preventive"
  | "Vital Signs"
  | "Medication"
  | "Chronic Disease";

export interface Task {
  id: string;
  title: string;
  description: string;
  type: "personal" | "practice" | "patient";
  status: "pending" | "in-progress" | "completed";
  priority: "low" | "medium" | "high";
  dueDate: string;
  patientId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  type: "general" | "specific";
  priority: "low" | "medium" | "high";
  category: Exclude<AlertCategory, "all">;
  status: "unread" | "read" | "acknowledged";
  patientId?: string;
  resultId?: string;
  createdAt: string;
  metadata?: {
    testName?: string;
    value?: string | number;
    unit?: string;
    referenceRange?: string;
    orderingProvider?: string;
    diseaseMetadata?: {
      condition: string;
      metrics?: Array<{
        name: string;
        value: number;
        unit: string;
        trend: "improving" | "stable" | "worsening";
      }>;
      complications?: string[];
      medications?: string[];
      lastAssessment: string;
      nextFollowUp: string;
    };
  };
}

export interface AlertPreference {
  category: Exclude<AlertCategory, "all">;
  testType: string;
  enabled: boolean;
  thresholds?: {
    critical: {
      low?: number;
      high?: number;
    };
    abnormal: {
      low?: number;
      high?: number;
    };
  };
  priority: "low" | "medium" | "high";
  notificationMethod: "immediate" | "daily" | "weekly";
}
