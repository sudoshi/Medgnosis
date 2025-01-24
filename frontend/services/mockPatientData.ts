import type { PatientDetails } from '@/types/patient';

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
        },
        {
          name: 'Diabetes',
          severity: 'medium',
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
      },
      {
        id: '2',
        code: 'E11',
        name: 'Type 2 Diabetes',
        status: 'active',
        onsetDate: '2019-03-20',
        diagnosedDate: '2019-03-20',
        lastAssessed: '2024-01-10',
        controlStatus: 'controlled'
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
      },
      {
        id: '2',
        measure: 'HbA1c Test',
        priority: 'medium',
        dueDate: '2024-03-15',
        status: 'open',
        description: 'Regular diabetes monitoring'
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
      },
      weight: {
        value: 185,
        unit: 'lbs',
        date: '2024-01-10'
      }
    },
    labs: [
      {
        id: '1',
        name: 'HbA1c',
        value: 7.2,
        unit: '%',
        date: '2024-01-10',
        status: 'abnormal',
        trend: 'up',
        components: [
          {
            name: 'HbA1c',
            value: 7.2,
            unit: '%',
            referenceRange: '4.0-5.6',
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
