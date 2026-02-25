import type { SVGProps } from "react";

export type IconSvgProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

export interface User {
  id: number;
  name: string;
  email: string;
  role?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DashboardData {
  stats: {
    totalPatients: {
      value: number;
      trend: number;
    };
    activePatients: number;
    careGaps: {
      value: number;
      trend: number;
    };
    riskScore: {
      highRiskCount: number;
      highRiskPercentage: number;
      trend: number;
    };
    encounters: {
      value: number;
      trend: number;
    };
  };
  analytics: {
    careGapSummary: {
      total: number;
      byType: {
        name: string;
        value: number;
        percentage: number;
      }[];
      byPriority: {
        high: number;
        medium: number;
        low: number;
      };
      byMeasure: Record<string, number>;
    };
    patientActivity: {
      events: {
        id: number;
        type: 'encounter' | 'procedure' | 'order' | 'result';
        patient: string;
        description: string;
        date: string;
        encounterType?: string;
        provider?: string;
        specialty?: string;
        status?: string;
        priority?: 'high' | 'medium' | 'low';
      }[];
    };
    populationMetrics: {
      byRiskLevel: {
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
    riskStratification: {
      distribution: Array<{
        score: number;
        count: number;
      }>;
    };
  };
  qualityMeasures: {
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
  };
}
