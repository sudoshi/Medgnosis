import type { PatientDetails } from '@/types/patient';

export const mockPatientDetails: PatientDetails = {
  id: 1,
  name: "James Wilson",
  demographics: {
    age: 67,
    gender: "Male",
    language: "English",
    ethnicity: "Caucasian",
    address: "123 Main St, Boston, MA 02108",
    phone: "(617) 555-0123",
    email: "j.wilson@email.com",
    insurance: {
      primary: "Medicare",
      secondary: "Blue Cross Blue Shield",
      memberId: "MED123456789",
      group: "BCBS-HMO-2024"
    },
    socialDeterminants: {
      housing: "Stable",
      transportation: "Has reliable transportation",
      foodSecurity: "No concerns",
      socialSupport: "Lives with spouse",
      employmentStatus: "Retired"
    },
    preferences: {
      contactMethod: "Phone",
      language: "English",
      timePreference: "Morning",
      communicationNeeds: "None"
    }
  },
  riskFactors: {
    score: 85,
    level: "high",
    factors: [
      {
        name: "Uncontrolled Diabetes",
        severity: "high",
        lastAssessed: "2024-01-15"
      },
      {
        name: "Heart Failure",
        severity: "high",
        lastAssessed: "2024-01-15"
      },
      {
        name: "COPD",
        severity: "medium",
        lastAssessed: "2024-01-15"
      }
    ],
    trending: "up"
  },
  conditions: [
    {
      id: 1,
      name: "Type 2 Diabetes",
      status: "active",
      diagnosedDate: "2020-03-15",
      lastAssessed: "2024-01-15",
      controlStatus: "uncontrolled",
      details: {
        severity: "Moderate",
        complications: ["Early nephropathy", "Peripheral neuropathy"],
        symptoms: ["Polyuria", "Fatigue"],
        targetGoals: {
          a1c: "<7.0%",
          fastingGlucose: "80-130 mg/dL",
          postprandialGlucose: "<180 mg/dL"
        }
      },
      treatmentPlan: {
        lifestyle: [
          "30 minutes daily exercise",
          "Carbohydrate counting",
          "Blood glucose monitoring 4x daily"
        ],
        education: [
          "Completed diabetes self-management course",
          "Nutrition counseling scheduled"
        ],
        monitoring: {
          frequency: "Every 3 months",
          tests: ["HbA1c", "Kidney function", "Foot exam"]
        }
      }
    },
    {
      id: 2,
      name: "Congestive Heart Failure",
      status: "active",
      diagnosedDate: "2021-06-22",
      lastAssessed: "2024-01-15",
      controlStatus: "controlled",
      details: {
        severity: "Class II",
        ejectionFraction: "40%",
        symptoms: ["Mild exertional dyspnea"],
        riskFactors: ["Hypertension", "Diabetes"]
      },
      treatmentPlan: {
        lifestyle: [
          "Low sodium diet",
          "Daily weight monitoring",
          "Fluid restriction"
        ],
        monitoring: {
          frequency: "Monthly",
          parameters: ["Weight", "Blood pressure", "Symptoms"]
        }
      }
    },
    {
      id: 3,
      name: "COPD",
      status: "active",
      diagnosedDate: "2019-11-30",
      lastAssessed: "2024-01-15",
      controlStatus: "controlled",
      details: {
        severity: "Moderate",
        fev1: "65% predicted",
        symptoms: ["Occasional dyspnea"],
        exacerbations: "1 in past year"
      },
      treatmentPlan: {
        lifestyle: [
          "Smoking cessation maintained",
          "Pulmonary rehabilitation",
          "Regular exercise"
        ],
        monitoring: {
          frequency: "Every 3 months",
          tests: ["Spirometry", "6-minute walk test"]
        }
      }
    }
  ],
  medications: [
    {
      id: 1,
      name: "Metformin",
      dosage: "1000mg",
      frequency: "Twice daily",
      startDate: "2020-03-15",
      adherence: 75,
      status: "active"
    },
    {
      id: 2,
      name: "Lisinopril",
      dosage: "10mg",
      frequency: "Once daily",
      startDate: "2021-06-22",
      adherence: 90,
      status: "active"
    }
  ],
  careGaps: [
    {
      id: 1,
      measure: "HbA1c Test",
      priority: "high",
      dueDate: "2024-02-15",
      status: "open",
      description: "Last HbA1c > 9.0%. Test needed."
    },
    {
      id: 2,
      measure: "Eye Examination",
      priority: "medium",
      dueDate: "2024-03-01",
      status: "open",
      description: "Annual diabetic eye exam due"
    }
  ],
  labs: [
    {
      id: 1,
      name: "HbA1c",
      value: "9.2",
      unit: "%",
      date: "2023-10-15",
      status: "critical",
      trend: "worsening",
      referenceRange: "4.0-5.6",
      history: [
        { date: "2023-07-15", value: "8.7" },
        { date: "2023-04-15", value: "8.3" },
        { date: "2023-01-15", value: "7.9" }
      ],
      details: {
        method: "HPLC",
        location: "Quest Diagnostics",
        orderedBy: "Dr. Sarah Johnson",
        notes: "Fasting sample"
      }
    },
    {
      id: 2,
      name: "Blood Pressure",
      value: "138/82",
      unit: "mmHg",
      date: "2024-01-15",
      status: "normal",
      trend: "stable",
      referenceRange: "<140/90",
      history: [
        { date: "2023-12-15", value: "142/88" },
        { date: "2023-11-15", value: "140/85" },
        { date: "2023-10-15", value: "136/84" }
      ]
    },
    {
      id: 3,
      name: "Comprehensive Metabolic Panel",
      date: "2024-01-15",
      status: "abnormal",
      components: [
        {
          name: "Glucose",
          value: "165",
          unit: "mg/dL",
          referenceRange: "70-99",
          status: "high"
        },
        {
          name: "Creatinine",
          value: "1.2",
          unit: "mg/dL",
          referenceRange: "0.6-1.3",
          status: "normal"
        },
        {
          name: "eGFR",
          value: "75",
          unit: "mL/min",
          referenceRange: ">60",
          status: "normal"
        }
      ]
    }
  ],
  encounters: [
    {
      id: 1,
      type: "Primary Care Visit",
      provider: "Dr. Sarah Johnson",
      date: "2024-01-15",
      reason: "Diabetes Follow-up",
      summary: "Patient reports medication compliance issues. HbA1c elevated. Adjusted medication regimen.",
      followUpNeeded: true,
      followUpDate: "2024-02-15",
      details: {
        vitals: {
          temperature: "98.6 F",
          heartRate: "72 bpm",
          respiratoryRate: "16/min",
          bloodPressure: "138/82 mmHg",
          weight: "185 lbs",
          bmi: "27.8"
        },
        physicalExam: {
          general: "Alert and oriented",
          heart: "Regular rate and rhythm",
          lungs: "Clear to auscultation",
          extremities: "Trace edema noted"
        },
        assessment: [
          "Uncontrolled Type 2 Diabetes",
          "Stable CHF",
          "Controlled COPD"
        ],
        plan: [
          "Increase Metformin to 1000mg BID",
          "Continue current CHF medications",
          "Schedule diabetes education",
          "Labs in 4 weeks"
        ]
      }
    },
    {
      id: 2,
      type: "Cardiology Consult",
      provider: "Dr. Michael Chen",
      date: "2023-12-20",
      reason: "CHF Monitoring",
      summary: "Heart failure well-controlled. Continue current management.",
      followUpNeeded: true,
      followUpDate: "2024-03-20",
      details: {
        vitals: {
          bloodPressure: "135/80 mmHg",
          heartRate: "68 bpm",
          weight: "183 lbs"
        },
        cardiacExam: {
          rhythm: "Regular",
          sounds: "Normal S1/S2",
          murmurs: "None",
          edema: "Trace bilateral"
        },
        diagnostics: {
          echoResult: "EF 40%, improved from 35%",
          ekg: "Normal sinus rhythm"
        },
        plan: [
          "Continue current medications",
          "Monitor daily weights",
          "Follow-up in 3 months"
        ]
      }
    }
  ],
  careTeam: [
    {
      id: 1,
      name: "Dr. Sarah Johnson",
      role: "Primary Care Physician",
      phone: "(617) 555-0101",
      email: "s.johnson@healthcare.org",
      primary: true,
      details: {
        credentials: "MD, MPH",
        npi: "1234567890",
        practice: "Boston Primary Care Associates",
        address: "123 Medical Center Dr, Boston, MA",
        availability: {
          office: "Mon, Wed, Fri",
          hours: "8:00 AM - 5:00 PM",
          urgent: "24/7 on-call service"
        },
        languages: ["English", "Spanish"],
        assignedSince: "2020-03-15"
      }
    },
    {
      id: 2,
      name: "Dr. Michael Chen",
      role: "Cardiologist",
      specialty: "Heart Failure",
      phone: "(617) 555-0102",
      email: "m.chen@healthcare.org",
      primary: false,
      details: {
        credentials: "MD, FACC",
        npi: "0987654321",
        practice: "Boston Cardiovascular Associates",
        address: "456 Cardiology Way, Boston, MA",
        availability: {
          office: "Tue, Thu",
          hours: "9:00 AM - 4:00 PM"
        },
        expertise: ["Heart Failure", "Preventive Cardiology"],
        assignedSince: "2021-06-22"
      }
    },
    {
      id: 3,
      name: "Lisa Rodriguez",
      role: "Care Manager",
      phone: "(617) 555-0103",
      email: "l.rodriguez@healthcare.org",
      primary: false,
      details: {
        credentials: "RN, BSN, CCM",
        specialty: "Chronic Disease Management",
        languages: ["English", "Spanish"],
        availability: {
          hours: "Mon-Fri, 8:00 AM - 4:30 PM",
          response: "Within 24 hours"
        },
        responsibilities: [
          "Care coordination",
          "Patient education",
          "Resource connection",
          "Treatment adherence support"
        ],
        assignedSince: "2023-01-10"
      }
    },
    {
      id: 4,
      name: "David Park",
      role: "Clinical Pharmacist",
      phone: "(617) 555-0104",
      email: "d.park@healthcare.org",
      primary: false,
      details: {
        credentials: "PharmD, BCPS",
        specialty: "Medication Therapy Management",
        availability: {
          hours: "Mon-Fri, 9:00 AM - 5:00 PM"
        },
        responsibilities: [
          "Medication review",
          "Drug interaction monitoring",
          "Adherence support",
          "Cost optimization"
        ]
      }
    }
  ],
  programs: [
    {
      id: 1,
      name: "Diabetes Management Program",
      type: "Disease Management",
      startDate: "2023-11-01",
      status: "active",
      coordinator: "Lisa Rodriguez"
    },
    {
      id: 2,
      name: "Heart Failure Care Program",
      type: "Disease Management",
      startDate: "2022-07-01",
      status: "active",
      coordinator: "Lisa Rodriguez"
    }
  ]
};

export const mockPatientsList: PatientDetails[] = [
  mockPatientDetails,
  {
    id: 2,
    name: "Maria Garcia",
    demographics: {
      age: 72,
      gender: "Female",
      language: "Spanish",
      ethnicity: "Hispanic",
      address: "456 Oak St, Boston, MA 02109",
      phone: "(617) 555-0124",
      email: "m.garcia@email.com"
    },
    riskFactors: {
      score: 78,
      level: "high",
      factors: [
        {
          name: "Hypertension",
          severity: "high",
          lastAssessed: "2024-01-18"
        },
        {
          name: "Chronic Kidney Disease",
          severity: "medium",
          lastAssessed: "2024-01-18"
        }
      ],
      trending: "stable"
    },
    conditions: [
      {
        id: 1,
        name: "Hypertension",
        status: "active",
        diagnosedDate: "2019-05-10",
        lastAssessed: "2024-01-18",
        controlStatus: "uncontrolled"
      },
      {
        id: 2,
        name: "Chronic Kidney Disease",
        status: "active",
        diagnosedDate: "2021-03-15",
        lastAssessed: "2024-01-18",
        controlStatus: "controlled"
      }
    ],
    medications: [],
    careGaps: [],
    labs: [],
    encounters: [],
    careTeam: [],
    programs: []
  }
];
