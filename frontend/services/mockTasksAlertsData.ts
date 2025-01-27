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
    category: "lab",
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
    },
  },
  {
    id: "alert2",
    title: "Population Health Alert",
    description: "10% increase in uncontrolled diabetes cases",
    type: "general",
    priority: "medium",
    category: "lab",
    status: "unread",
    createdAt: "2025-01-26T08:45:00Z",
  },
  {
    id: "alert3",
    title: "Imaging Result Available",
    description: "Chest X-ray results ready for review",
    type: "specific",
    priority: "medium",
    category: "imaging",
    status: "unread",
    patientId: "patient456",
    resultId: "result789",
    createdAt: "2025-01-26T10:15:00Z",
  },
];

export const mockAlertPreferences: AlertPreference[] = [
  {
    category: "lab",
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
    category: "lab",
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
    category: "imaging",
    testType: "Chest X-ray",
    enabled: true,
    priority: "medium",
    notificationMethod: "daily",
  },
];
