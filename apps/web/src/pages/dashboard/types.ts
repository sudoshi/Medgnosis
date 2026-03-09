// =============================================================================
// Dashboard — Shared types
// =============================================================================

export interface DashboardResponse {
  stats: {
    total_patients:  { value: number; trend: number };
    active_patients: number;
    care_gaps:       { value: number; trend: number };
    risk_score:      { high_risk_count: number; high_risk_percentage: number; trend: number };
    encounters:      { value: number; trend: number };
  };
  analytics: {
    care_gap_summary: {
      total: number;
      by_priority: { high: number; medium: number; low: number };
    };
    risk_stratification: {
      distribution: { risk_level: string; count: number }[];
    };
    recent_encounters: {
      id: number;
      date: string;
      type: string;
      patient_name: string;
    }[];
  };
  clinician: {
    todays_schedule: Array<{
      id: number;
      date: string;
      type: string;
      reason: string | null;
      status: string | null;
      patient_id: number;
      patient_name: string;
      mrn: string;
      date_of_birth: string;
      gender?: string;
    }>;
    urgent_alerts: Array<{
      id: string;
      alert_type: string;
      severity: string;
      title: string;
      body: string | null;
      created_at: string;
      patient_id: number;
      patient_name: string | null;
      mrn: string | null;
    }>;
    critical_alert_count: number;
    abby_briefing: {
      enabled: boolean;
      message: string;
    };
  };
}
