import type { DashboardData } from '@/types';

export const mockDashboardData: DashboardData = {
  stats: {
    totalPatients: {
      value: 1250,
      trend: 5.2
    },
    activePatients: 1150,
    riskScore: {
      highRiskCount: 127,
      highRiskPercentage: 12.7,
      trend: 5
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
  analytics: {
    populationMetrics: {
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
      byType: [
        { name: "Diabetes Care", value: 35, percentage: 24.1 },
        { name: "Preventive Screenings", value: 48, percentage: 33.1 },
        { name: "Immunizations", value: 27, percentage: 18.6 },
        { name: "Chronic Care", value: 35, percentage: 24.2 }
      ],
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
        { score: 10, count: 250 },
        { score: 30, count: 400 },
        { score: 50, count: 350 },
        { score: 70, count: 180 },
        { score: 90, count: 70 }
      ]
    },
    patientActivity: {
      events: [
        {
          id: 1,
          type: "encounter",
          encounterType: "Emergency",
          patient: "Maria Garcia",
          description: "ED Visit - CHF Exacerbation",
          provider: "Dr. Sarah Johnson",
          specialty: "Emergency Medicine",
          date: "2024-01-22",
          priority: "high"
        },
        {
          id: 2,
          type: "encounter",
          encounterType: "Specialty",
          patient: "James Wilson",
          description: "Cardiology Follow-up",
          provider: "Dr. Lisa Wong",
          specialty: "Cardiology",
          date: "2024-01-21"
        },
        {
          id: 3,
          type: "procedure",
          patient: "Robert Smith",
          description: "Cardiac Catheterization",
          provider: "Dr. David Kim",
          specialty: "Interventional Cardiology",
          date: "2024-01-21",
          priority: "high"
        },
        {
          id: 4,
          type: "result",
          patient: "William Taylor",
          description: "Critical Lab Result: Potassium 6.2",
          provider: "Dr. Rebecca Martinez",
          date: "2024-01-20",
          priority: "high"
        },
        {
          id: 5,
          type: "order",
          patient: "Linda Anderson",
          description: "MRI Brain Completed",
          provider: "Dr. Amanda Lee",
          specialty: "Neurology",
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
          id: "1",
          name: "Diabetes A1C Control",
          score: 82.3,
          target: 85,
          trend: 2.1
        },
        {
          id: "2",
          name: "Breast Cancer Screening",
          score: 75.8,
          target: 80,
          trend: -1.2
        },
        {
          id: "3",
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
        id: "1",
        measure: "Diabetes A1C Control",
        gap: "15 patients need A1C test",
        impact: "High",
        potential: "+3.2%"
      },
      {
        id: "2",
        measure: "Breast Cancer Screening",
        gap: "23 patients due for mammogram",
        impact: "Medium",
        potential: "+2.8%"
      }
    ]
  }
};
