// =============================================================================
// Medgnosis — Dashboard Types
// Ported from frontend/types/index.ts (DashboardData)
// =============================================================================

export interface DashboardData {
  stats: {
    total_patients: {
      value: number;
      trend: number;
    };
    active_patients: number;
    care_gaps: {
      value: number;
      trend: number;
    };
    risk_score: {
      high_risk_count: number;
      high_risk_percentage: number;
      trend: number;
    };
    encounters: {
      value: number;
      trend: number;
    };
  };
  analytics: DashboardAnalytics;
  quality_measures: QualityMeasurePerformance;
}

export interface DashboardAnalytics {
  care_gap_summary: {
    total: number;
    by_type: {
      name: string;
      value: number;
      percentage: number;
    }[];
    by_priority: {
      high: number;
      medium: number;
      low: number;
    };
    by_measure: Record<string, number>;
  };
  patient_activity: {
    events: PatientActivityEvent[];
  };
  population_metrics: {
    by_risk_level: {
      high: number;
      medium: number;
      low: number;
    };
    demographics: {
      age: Record<string, number>;
      gender: {
        male: number;
        female: number;
      };
    };
  };
  risk_stratification: {
    distribution: {
      score: number;
      count: number;
    }[];
  };
}

export interface PatientActivityEvent {
  id: number;
  type: 'encounter' | 'procedure' | 'order' | 'result';
  patient: string;
  description: string;
  date: string;
  encounter_type?: string;
  provider?: string;
  specialty?: string;
  status?: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface QualityMeasurePerformance {
  performance: {
    overall: number;
    measures: {
      id: string;
      name: string;
      score: number;
      target: number;
      trend: number;
    }[];
  };
  trends: {
    monthly: {
      month: string;
      score: number;
    }[];
  };
  improvement: {
    id: string;
    measure: string;
    gap: string;
    impact: 'High' | 'Medium' | 'Low';
    potential: string;
  }[];
}
