import type { PatientDetails } from '@/types/patient';

export interface CareList {
  id: string;
  name: string;
  description: string;
  type: 'measure-based' | 'manual';
  clinicalFocus: string;
  tags: string[];
  patients: string[];
  measures?: string[];
  createdAt: string;
  updatedAt: string;
}

export const mockCareLists: CareList[] = [
  {
    id: '1',
    name: 'Hypertension Management',
    description: 'Patients with uncontrolled hypertension requiring close monitoring',
    type: 'measure-based',
    clinicalFocus: 'Hypertension',
    tags: ['High Risk', 'Cardiovascular'],
    patients: ['1', '2', '3'],
    measures: ['HTN-001', 'HTN-002'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-15'
  },
  {
    id: '2',
    name: 'Diabetes Care',
    description: 'Type 2 diabetes patients with HbA1c > 8',
    type: 'measure-based',
    clinicalFocus: 'Diabetes',
    tags: ['Chronic Care', 'High Risk'],
    patients: ['2', '4', '5'],
    measures: ['DM-001', 'DM-002'],
    createdAt: '2024-01-02',
    updatedAt: '2024-01-15'
  }
];

export const mockPatientsList: PatientDetails[] = [
  {
    id: '1',
    name: {
      first: 'John',
      last: 'Smith'
    },
    dateOfBirth: '1965-03-15',
    gender: 'Male',
    demographics: {
      age: 58,
      gender: 'Male',
      ethnicity: 'White',
      language: 'English',
      maritalStatus: 'Married',
      employment: 'Employed',
      phone: '555-123-4567',
      email: 'john.smith@email.com',
      address: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-123-4567',
      email: 'john.smith@email.com'
    },
    insurance: {
      provider: 'Blue Cross',
      plan: 'PPO',
      memberId: 'BC123456789'
    },
    primaryCare: {
      provider: 'Dr. Jane Wilson',
      clinic: 'Primary Care Associates',
      lastVisit: '2024-01-10'
    },
    riskFactors: {
      level: 'high',
      score: 85,
      factors: [
        {
          name: 'Hypertension',
          severity: 'high',
          lastAssessed: '2024-01-10'
        }
      ],
      trending: 'up'
    },
    conditions: [
      {
        id: '1',
        code: 'I10',
        name: 'Hypertension',
        status: 'active',
        onsetDate: '2020-05-15',
        diagnosedDate: '2020-05-15',
        lastAssessed: '2024-01-10',
        controlStatus: 'uncontrolled'
      }
    ],
    careGaps: [
      {
        id: '1',
        measure: 'Blood Pressure Check',
        priority: 'high',
        dueDate: '2024-02-01',
        status: 'open',
        description: 'Due for blood pressure monitoring'
      }
    ],
    encounters: [
      {
        id: '1',
        date: '2024-01-10',
        type: 'Office Visit',
        provider: 'Dr. Jane Wilson',
        summary: 'Routine follow-up',
        followUpNeeded: true,
        followUpDate: '2024-02-10',
        reason: 'Blood pressure monitoring'
      }
    ],
    metrics: {
      bloodPressure: {
        value: 142,
        unit: 'mmHg',
        date: '2024-01-10'
      }
    },
    labs: [
      {
        id: '1',
        name: 'Blood Pressure',
        value: 142,
        unit: 'mmHg',
        date: '2024-01-10',
        status: 'abnormal',
        trend: 'up',
        components: [
          {
            name: 'Systolic',
            value: 142,
            unit: 'mmHg',
            referenceRange: '90-130',
            status: 'abnormal'
          },
          {
            name: 'Diastolic',
            value: 88,
            unit: 'mmHg',
            referenceRange: '60-80',
            status: 'abnormal'
          }
        ]
      }
    ],
    alerts: [
      {
        id: '1',
        type: 'warning',
        message: 'Blood pressure elevated',
        date: '2024-01-10',
        status: 'active',
        category: 'Clinical'
      }
    ],
    recentActions: [
      {
        id: '1',
        type: 'Medication Change',
        description: 'Increased blood pressure medication',
        date: '2024-01-10',
        provider: 'Dr. Jane Wilson',
        status: 'completed',
        priority: 'high'
      }
    ],
    careTeam: [
      {
        id: '1',
        name: 'Dr. Jane Wilson',
        role: 'Primary Care Physician',
        specialty: 'Internal Medicine',
        primary: true,
        phone: '555-123-4567',
        email: 'jane.wilson@clinic.com',
        details: {
          npi: '1234567890',
          practice: 'Primary Care Associates',
          languages: ['English'],
          expertise: ['Hypertension', 'Diabetes']
        }
      }
    ]
  }
];
