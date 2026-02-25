// =============================================================================
// Medgnosis — Alert & Task Types
// Unified from frontend/types/tasks-alerts.ts and standardized-alerts.ts
// =============================================================================

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'unread' | 'read' | 'acknowledged';
export type AlertPriority = 'high' | 'medium' | 'low';

export type AlertCategory =
  | 'CBC'
  | 'BMP'
  | 'Imaging'
  | 'Preventive'
  | 'Vital Signs'
  | 'Medication'
  | 'Chronic Disease'
  | 'Cardiovascular'
  | 'Endocrine'
  | 'Renal'
  | 'Respiratory'
  | 'Mental Health'
  | 'Neurological'
  | 'Musculoskeletal'
  | 'Oncology'
  | 'Metabolic';

export interface Alert {
  id: string;
  title: string;
  description: string;
  status: AlertStatus;
  severity: AlertSeverity;
  priority: AlertPriority;
  category: AlertCategory;
  rule_key?: string;
  patient_id: string;
  org_id: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  auto_resolved: boolean;
  created_at: string;
  updated_at: string;
  metadata?: AlertMetadata;
}

export interface AlertMetadata {
  test_name?: string;
  value?: string;
  unit?: string;
  reference_range?: string;
  ordering_provider?: string;
  trend?: 'improving' | 'stable' | 'worsening';
  disease_metadata?: DiseaseMetadata;
}

export interface DiseaseMetadata {
  condition: string;
  metrics?: {
    name: string;
    value: string | number;
    unit: string;
    trend: 'improving' | 'stable' | 'worsening';
  }[];
  complications?: string[];
  medications?: string[];
  last_assessment: string;
  next_follow_up: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  type: 'personal' | 'practice' | 'patient';
  priority: AlertPriority;
  status: 'pending' | 'completed';
  due_date: string;
  patient_id?: string;
  created_at: string;
  updated_at: string;
}

/** WebSocket alert event payload (published by rules engine) */
export interface AlertEvent {
  alert_id: string;
  severity: AlertSeverity;
  title: string;
  rule_key: string;
  patient_id?: string;
}
