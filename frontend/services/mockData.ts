import type { DashboardData } from './api';

export const mockDashboardData: DashboardData = {
  stats: {
    totalPatients: {
      value: 1250,
      trend: 5.2
    },
    riskScore: {
      value: 28.5,
      trend: -2.1
    },
    careGaps: {
      value: 145,
      trend: -12.3
    },
    encounters: {
      value: 432,
      trend: 8.7
    }
  },
  careGaps: [
    {
      id: 1,
      patient: "Sarah Johnson",
      measure: "Diabetes A1C Test",
      days_open: 45,
      priority: "high"
    },
    {
      id: 2,
      patient: "Michael Chen",
      measure: "Annual Wellness Visit",
      days_open: 30,
      priority: "medium"
    },
    {
      id: 3,
      patient: "Robert Smith",
      measure: "Colorectal Cancer Screening",
      days_open: 60,
      priority: "high"
    },
    {
      id: 4,
      patient: "Emily Davis",
      measure: "Mammogram",
      days_open: 15,
      priority: "low"
    }
  ],
  highRiskPatients: [
    {
      id: 1,
      name: "James Wilson",
      riskScore: 85,
      conditions: ["CHF", "Diabetes", "COPD"],
      lastEncounter: "2024-01-15"
    },
    {
      id: 2,
      name: "Maria Garcia",
      riskScore: 78,
      conditions: ["Hypertension", "CKD"],
      lastEncounter: "2024-01-18"
    },
    {
      id: 3,
      name: "David Thompson",
      riskScore: 72,
      conditions: ["COPD", "Depression"],
      lastEncounter: "2024-01-10"
    },
    {
      id: 4,
      name: "Linda Martinez",
      riskScore: 69,
      conditions: ["Diabetes", "CAD"],
      lastEncounter: "2024-01-20"
    }
  ],
  analytics: {
    populationMetrics: {
      totalActive: 1250,
      byRiskLevel: {
        high: 180,
        medium: 420,
        low: 650
      },
      demographics: {
        age: {
          "18-30": 150,
          "31-50": 380,
          "51-70": 520,
          "71+": 200
        },
        gender: {
          male: 580,
          female: 670
        }
      }
    },
    careGapSummary: {
      total: 145,
      byPriority: {
        high: 45,
        medium: 65,
        low: 35
      },
      byMeasure: {
        "Diabetes Care": 35,
        "Preventive Screenings": 48,
        "Immunizations": 27,
        "Chronic Care": 35
      }
    },
    riskStratification: {
      distribution: [
        { score: "0-20", count: 250 },
        { score: "21-40", count: 400 },
        { score: "41-60", count: 350 },
        { score: "61-80", count: 180 },
        { score: "81-100", count: 70 }
      ]
    },
    recentActivity: {
      events: [
        {
          id: 1,
          type: "encounter",
          patient: "Sarah Johnson",
          description: "Primary Care Visit",
          date: "2024-01-22"
        },
        {
          id: 2,
          type: "care_gap",
          patient: "Michael Chen",
          description: "New Care Gap: Annual Wellness Visit",
          date: "2024-01-21"
        },
        {
          id: 3,
          type: "risk_change",
          patient: "James Wilson",
          description: "Risk Score increased to 85",
          date: "2024-01-20"
        }
      ]
    }
  },
  qualityMeasures: {
    performance: {
      overall: 78.5,
      measures: [
        {
          id: 1,
          name: "Diabetes A1C Control",
          score: 82.3,
          target: 85,
          trend: 2.1
        },
        {
          id: 2,
          name: "Breast Cancer Screening",
          score: 75.8,
          target: 80,
          trend: -1.2
        },
        {
          id: 3,
          name: "Hypertension Control",
          score: 77.4,
          target: 75,
          trend: 3.5
        }
      ]
    },
    trends: {
      monthly: [
        { month: "Sep", score: 75.2 },
        { month: "Oct", score: 76.1 },
        { month: "Nov", score: 77.8 },
        { month: "Dec", score: 78.5 }
      ]
    },
    improvement: [
      {
        id: 1,
        measure: "Diabetes A1C Control",
        gap: "15 patients need A1C test",
        impact: "High",
        potential: "+3.2%"
      },
      {
        id: 2,
        measure: "Breast Cancer Screening",
        gap: "23 patients due for mammogram",
        impact: "Medium",
        potential: "+2.8%"
      }
    ]
  }
};
