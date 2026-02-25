export type AlertStatus = "unread" | "read" | "acknowledged";
export type AlertPriority = "high" | "medium" | "low";
export type AlertType = "all" | "general" | "specific";
export type AlertCategory =
  | "all"
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

export interface Alert {
  id: string;
  title: string;
  description: string;
  status: AlertStatus;
  priority: AlertPriority;
  type: AlertType;
  category: AlertCategory;
  patientId: string;
  createdAt: string;
  updatedAt: string;
  metadata?: {
    testName?: string;
    value?: string;
    unit?: string;
    referenceRange?: string;
    orderingProvider?: string;
    trend?: "improving" | "stable" | "worsening";
    diseaseMetadata?: {
      condition: string;
      metrics?: Array<{
        name: string;
        value: string;
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

export interface Task {
  id: string;
  title: string;
  description: string;
  type: "personal" | "practice" | "patient";
  priority: AlertPriority;
  status: "pending" | "completed";
  dueDate: string;
  patientId?: string;
  createdAt: string;
  updatedAt: string;
}
