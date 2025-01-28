import type { Task, Alert, AlertPreference } from "@/types/tasks-alerts";

export const mockTasks: Task[] = [
  {
    id: "task1",
    title: "Review Lab Results",
    description: "Review pending lab results for high-risk patients",
    type: "personal",
    status: "pending",
    priority: "high",
    dueDate: "2025-01-27T15:00:00Z",
    createdAt: "2025-01-26T10:00:00Z",
    updatedAt: "2025-01-26T10:00:00Z",
  },
  {
    id: "task2",
    title: "Schedule Team Meeting",
    description: "Discuss care coordination for complex cases",
    type: "practice",
    status: "in-progress",
    priority: "medium",
    dueDate: "2025-01-28T14:00:00Z",
    createdAt: "2025-01-26T09:00:00Z",
    updatedAt: "2025-01-26T11:30:00Z",
  },
  {
    id: "task3",
    title: "Follow-up: Diabetes Management",
    description: "Check blood sugar logs and medication adherence",
    type: "patient",
    status: "pending",
    priority: "high",
    patientId: "patient123",
    dueDate: "2025-01-27T16:00:00Z",
    createdAt: "2025-01-26T08:00:00Z",
    updatedAt: "2025-01-26T08:00:00Z",
  },
];

export const mockAlerts: Alert[] = [
  {
    id: "alert1",
    title: "Critical Lab Result",
    description: "Potassium level critically high",
    type: "specific",
    priority: "high",
    category: "BMP",
    status: "unread",
    patientId: "patient123",
    resultId: "result456",
    createdAt: "2025-01-26T09:30:00Z",
    metadata: {
      testName: "Potassium",
      value: 6.8,
      unit: "mEq/L",
      referenceRange: "3.5-5.0",
      orderingProvider: "Dr. Smith",
      diseaseMetadata: {
        condition: "Chronic Kidney Disease",
        metrics: [
          {
            name: "eGFR",
            value: 45,
            unit: "mL/min",
            trend: "worsening",
          },
          {
            name: "Creatinine",
            value: 2.1,
            unit: "mg/dL",
            trend: "worsening",
          },
        ],
        complications: ["Hyperkalemia", "Anemia", "Secondary Hypertension"],
        medications: ["Kayexalate", "Losartan", "Calcium Carbonate"],
        lastAssessment: "2025-01-20T00:00:00Z",
        nextFollowUp: "2025-02-03T00:00:00Z",
      },
    },
  },
  {
    id: "alert2",
    title: "Population Health Alert",
    description: "10% increase in uncontrolled diabetes cases",
    type: "general",
    priority: "medium",
    category: "Endocrine",
    status: "unread",
    createdAt: "2025-01-26T08:45:00Z",
    metadata: {
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
        complications: ["Peripheral Neuropathy", "Retinopathy"],
        medications: ["Metformin", "Glipizide", "Jardiance"],
        lastAssessment: "2025-01-15T00:00:00Z",
        nextFollowUp: "2025-02-01T00:00:00Z",
      },
    },
  },
  {
    id: "alert3",
    title: "Imaging Result Available",
    description: "Chest X-ray results ready for review",
    type: "specific",
    priority: "medium",
    category: "Imaging",
    status: "unread",
    patientId: "patient456",
    resultId: "result789",
    createdAt: "2025-01-26T10:15:00Z",
    metadata: {
      diseaseMetadata: {
        condition: "COPD",
        metrics: [
          {
            name: "FEV1",
            value: 65,
            unit: "%",
            trend: "stable",
          },
          {
            name: "O2 Saturation",
            value: 94,
            unit: "%",
            trend: "improving",
          },
        ],
        complications: ["Chronic Bronchitis", "Emphysema"],
        medications: ["Albuterol", "Tiotropium", "Fluticasone"],
        lastAssessment: "2025-01-18T00:00:00Z",
        nextFollowUp: "2025-02-05T00:00:00Z",
      },
    },
  },
  {
    id: "alert4",
    title: "Cardiac Alert",
    description: "Elevated troponin levels detected",
    type: "specific",
    priority: "high",
    category: "Cardiovascular",
    status: "unread",
    patientId: "patient789",
    resultId: "result101",
    createdAt: "2025-01-26T11:00:00Z",
    metadata: {
      testName: "Troponin I",
      value: 0.5,
      unit: "ng/mL",
      referenceRange: "<0.04",
      orderingProvider: "Dr. Johnson",
      diseaseMetadata: {
        condition: "Acute Coronary Syndrome",
        metrics: [
          {
            name: "Blood Pressure",
            value: 160,
            unit: "mmHg",
            trend: "worsening",
          },
          {
            name: "Heart Rate",
            value: 98,
            unit: "bpm",
            trend: "stable",
          },
        ],
        complications: ["Hypertension", "Arrhythmia"],
        medications: ["Aspirin", "Metoprolol", "Lisinopril"],
        lastAssessment: "2025-01-25T00:00:00Z",
        nextFollowUp: "2025-01-28T00:00:00Z",
      },
    },
  },
];

export const mockAlertPreferences: AlertPreference[] = [
  {
    category: "BMP",
    testType: "Potassium",
    enabled: true,
    thresholds: {
      critical: {
        low: 2.5,
        high: 6.0,
      },
      abnormal: {
        low: 3.0,
        high: 5.5,
      },
    },
    priority: "high",
    notificationMethod: "immediate",
  },
  {
    category: "Endocrine",
    testType: "Glucose",
    enabled: true,
    thresholds: {
      critical: {
        low: 50,
        high: 400,
      },
      abnormal: {
        low: 70,
        high: 200,
      },
    },
    priority: "high",
    notificationMethod: "immediate",
  },
  {
    category: "Imaging",
    testType: "Chest X-ray",
    enabled: true,
    priority: "medium",
    notificationMethod: "daily",
  },
  {
    category: "Cardiovascular",
    testType: "Troponin",
    enabled: true,
    thresholds: {
      critical: {
        high: 0.4,
      },
      abnormal: {
        high: 0.04,
      },
    },
    priority: "high",
    notificationMethod: "immediate",
  },
];
