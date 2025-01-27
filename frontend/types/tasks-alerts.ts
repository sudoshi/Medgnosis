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
  category: "lab" | "imaging" | "procedure";
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
  };
}

export interface AlertPreference {
  category: "lab" | "imaging" | "procedure";
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
