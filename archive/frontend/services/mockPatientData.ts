import type { PatientDetails } from '@/types/patient';

export const mockPatientsList: PatientDetails[] = [
  {
    id: 'P001',
    mrn: 'MRN001',
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
  },
  {
    id: 'P002',
    mrn: 'MRN002',
    name: {
      first: 'Maria',
      last: 'Garcia'
    },
    dateOfBirth: '1958-07-22',
    gender: 'Female',
    demographics: {
      age: 65,
      gender: 'Female',
      ethnicity: 'Hispanic',
      language: 'Spanish',
      maritalStatus: 'Widowed',
      employment: 'Retired',
      phone: '555-234-5678',
      email: 'maria.garcia@email.com',
      address: {
        street: '456 Oak Ave',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '456 Oak Ave',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-234-5678',
      email: 'maria.garcia@email.com'
    },
    insurance: {
      provider: 'Medicare',
      plan: 'Part B',
      memberId: 'MC987654321'
    },
    primaryCare: {
      provider: 'Dr. Robert Chen',
      clinic: 'Community Health Center',
      lastVisit: '2024-01-15'
    },
    riskFactors: {
      level: 'high',
      score: 92,
      factors: [
        {
          name: 'Congestive Heart Failure',
          severity: 'high',
          lastAssessed: '2024-01-15'
        },
        {
          name: 'Type 2 Diabetes',
          severity: 'high',
          lastAssessed: '2024-01-15'
        },
        {
          name: 'Chronic Kidney Disease',
          severity: 'medium',
          lastAssessed: '2024-01-15'
        }
      ],
      trending: 'up'
    },
    conditions: [
      {
        id: 'C001',
        code: 'I50.9',
        name: 'Congestive Heart Failure',
        status: 'active',
        onsetDate: '2018-03-15',
        diagnosedDate: '2018-03-15',
        lastAssessed: '2024-01-15',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C002',
        code: 'E11',
        name: 'Type 2 Diabetes',
        status: 'active',
        onsetDate: '2015-06-20',
        diagnosedDate: '2015-06-20',
        lastAssessed: '2024-01-15',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C003',
        code: 'N18.3',
        name: 'Chronic Kidney Disease Stage 3',
        status: 'active',
        onsetDate: '2020-09-10',
        diagnosedDate: '2020-09-10',
        lastAssessed: '2024-01-15',
        controlStatus: 'uncontrolled'
      }
    ],
    careGaps: [
      {
        id: 'CG001',
        measure: 'Cardiac Function Test',
        priority: 'high',
        dueDate: '2024-02-15',
        status: 'open',
        description: 'Due for echocardiogram'
      },
      {
        id: 'CG002',
        measure: 'HbA1c Test',
        priority: 'high',
        dueDate: '2024-02-01',
        status: 'open',
        description: 'Diabetes monitoring overdue'
      },
      {
        id: 'CG003',
        measure: 'Kidney Function Panel',
        priority: 'high',
        dueDate: '2024-02-01',
        status: 'open',
        description: 'Regular CKD monitoring'
      }
    ],
    encounters: [
      {
        id: 'E001',
        date: '2024-01-15',
        type: 'Emergency Department',
        provider: 'Dr. Sarah Johnson',
        summary: 'Acute CHF exacerbation',
        followUpNeeded: true,
        followUpDate: '2024-01-22',
        reason: 'CHF management',
        details: {
          vitals: {
            temperature: '98.6',
            heartRate: '98',
            respiratoryRate: '24',
            bloodPressure: '165/95',
            weight: '182',
            bmi: '32.5'
          }
        }
      }
    ],
    metrics: {
      bloodPressure: {
        value: 165,
        unit: 'mmHg',
        date: '2024-01-15'
      },
      weight: {
        value: 182,
        unit: 'lbs',
        date: '2024-01-15'
      }
    },
    labs: [
      {
        id: 'L001',
        name: 'HbA1c',
        value: 9.2,
        unit: '%',
        date: '2024-01-15',
        status: 'critical',
        trend: 'up',
        referenceRange: '4.0-5.6'
      },
      {
        id: 'L002',
        name: 'eGFR',
        value: 48,
        unit: 'mL/min',
        date: '2024-01-15',
        status: 'abnormal',
        trend: 'down',
        referenceRange: '>60'
      }
    ],
    alerts: [
      {
        id: 'A001',
        type: 'critical',
        message: 'CHF exacerbation requiring ED visit',
        date: '2024-01-15',
        status: 'active',
        category: 'Clinical'
      },
      {
        id: 'A002',
        type: 'warning',
        message: 'Uncontrolled diabetes with rising HbA1c',
        date: '2024-01-15',
        status: 'active',
        category: 'Clinical'
      }
    ],
    recentActions: [
      {
        id: 'RA001',
        type: 'ED Visit',
        description: 'Emergency treatment for CHF exacerbation',
        date: '2024-01-15',
        provider: 'Dr. Sarah Johnson',
        status: 'completed',
        priority: 'high'
      }
    ],
    careTeam: [
      {
        id: 'CT001',
        name: 'Dr. Robert Chen',
        role: 'Primary Care Physician',
        specialty: 'Internal Medicine',
        primary: true,
        phone: '555-345-6789',
        email: 'robert.chen@clinic.com',
        details: {
          npi: '2345678901',
          practice: 'Community Health Center',
          languages: ['English', 'Spanish'],
          expertise: ['Geriatrics', 'Chronic Disease Management']
        }
      },
      {
        id: 'CT002',
        name: 'Dr. Lisa Wong',
        role: 'Cardiologist',
        specialty: 'Cardiology',
        primary: false,
        phone: '555-456-7890',
        email: 'lisa.wong@cardio.com',
        details: {
          npi: '3456789012',
          practice: 'Heart Specialists Group',
          languages: ['English'],
          expertise: ['Heart Failure', 'Hypertension']
        }
      }
    ]
  },
  {
    id: 'P003',
    mrn: 'MRN003',
    name: {
      first: 'Robert',
      last: 'Johnson'
    },
    dateOfBirth: '1962-11-30',
    gender: 'Male',
    demographics: {
      age: 61,
      gender: 'Male',
      ethnicity: 'African American',
      language: 'English',
      maritalStatus: 'Divorced',
      employment: 'Disabled',
      phone: '555-345-6789',
      email: 'robert.johnson@email.com',
      address: {
        street: '789 Pine St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '789 Pine St',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-345-6789',
      email: 'robert.johnson@email.com'
    },
    insurance: {
      provider: 'Medicaid',
      plan: 'Standard',
      memberId: 'MD345678912'
    },
    primaryCare: {
      provider: 'Dr. Emily Martinez',
      clinic: 'Urban Health Partners',
      lastVisit: '2024-01-08'
    },
    riskFactors: {
      level: 'high',
      score: 88,
      factors: [
        {
          name: 'COPD',
          severity: 'high',
          lastAssessed: '2024-01-08'
        },
        {
          name: 'Hypertension',
          severity: 'high',
          lastAssessed: '2024-01-08'
        }
      ],
      trending: 'up'
    },
    conditions: [
      {
        id: 'C001',
        code: 'J44.9',
        name: 'COPD',
        status: 'active',
        onsetDate: '2017-08-15',
        diagnosedDate: '2017-08-15',
        lastAssessed: '2024-01-08',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C002',
        code: 'I10',
        name: 'Hypertension',
        status: 'active',
        onsetDate: '2016-03-20',
        diagnosedDate: '2016-03-20',
        lastAssessed: '2024-01-08',
        controlStatus: 'uncontrolled'
      }
    ],
    careGaps: [
      {
        id: 'CG001',
        measure: 'Pulmonary Function Test',
        priority: 'high',
        dueDate: '2024-02-08',
        status: 'open',
        description: 'Annual COPD assessment due'
      },
      {
        id: 'CG002',
        measure: 'Pneumonia Vaccine',
        priority: 'medium',
        dueDate: '2024-03-01',
        status: 'open',
        description: 'Due for pneumococcal vaccination'
      }
    ],
    encounters: [
      {
        id: 'E001',
        date: '2024-01-08',
        type: 'Office Visit',
        provider: 'Dr. Emily Martinez',
        summary: 'COPD exacerbation follow-up',
        followUpNeeded: true,
        followUpDate: '2024-02-08',
        reason: 'COPD management',
        details: {
          vitals: {
            temperature: '98.8',
            heartRate: '88',
            respiratoryRate: '22',
            bloodPressure: '158/92',
            weight: '195',
            bmi: '31.2'
          }
        }
      }
    ],
    metrics: {
      bloodPressure: {
        value: 158,
        unit: 'mmHg',
        date: '2024-01-08'
      },
      weight: {
        value: 195,
        unit: 'lbs',
        date: '2024-01-08'
      }
    },
    labs: [
      {
        id: 'L001',
        name: 'Spirometry',
        value: 45,
        unit: '% predicted',
        date: '2024-01-08',
        status: 'critical',
        trend: 'down',
        referenceRange: '>80%'
      }
    ],
    alerts: [
      {
        id: 'A001',
        type: 'warning',
        message: 'Declining pulmonary function',
        date: '2024-01-08',
        status: 'active',
        category: 'Clinical'
      }
    ],
    recentActions: [
      {
        id: 'RA001',
        type: 'Medication Change',
        description: 'Added additional bronchodilator',
        date: '2024-01-08',
        provider: 'Dr. Emily Martinez',
        status: 'completed',
        priority: 'high'
      }
    ],
    careTeam: [
      {
        id: 'CT001',
        name: 'Dr. Emily Martinez',
        role: 'Primary Care Physician',
        specialty: 'Family Medicine',
        primary: true,
        phone: '555-567-8901',
        email: 'emily.martinez@clinic.com',
        details: {
          npi: '4567890123',
          practice: 'Urban Health Partners',
          languages: ['English', 'Spanish'],
          expertise: ['COPD', 'Hypertension']
        }
      }
    ]
  },
  {
    id: 'P004',
    mrn: 'MRN004',
    name: {
      first: 'Sarah',
      last: 'Williams'
    },
    dateOfBirth: '1960-04-15',
    gender: 'Female',
    demographics: {
      age: 63,
      gender: 'Female',
      ethnicity: 'White',
      language: 'English',
      maritalStatus: 'Single',
      employment: 'Retired',
      phone: '555-456-7890',
      email: 'sarah.williams@email.com',
      address: {
        street: '321 Elm St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '321 Elm St',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-456-7890',
      email: 'sarah.williams@email.com'
    },
    insurance: {
      provider: 'Medicare',
      plan: 'Part A & B',
      memberId: 'MC456789123'
    },
    primaryCare: {
      provider: 'Dr. Michael Brown',
      clinic: 'Senior Care Center',
      lastVisit: '2024-01-12'
    },
    riskFactors: {
      level: 'high',
      score: 86,
      factors: [
        {
          name: 'Chronic Kidney Disease',
          severity: 'high',
          lastAssessed: '2024-01-12'
        },
        {
          name: 'Hypertension',
          severity: 'high',
          lastAssessed: '2024-01-12'
        },
        {
          name: 'Osteoporosis',
          severity: 'medium',
          lastAssessed: '2024-01-12'
        }
      ],
      trending: 'up'
    },
    conditions: [
      {
        id: 'C001',
        code: 'N18.4',
        name: 'Chronic Kidney Disease Stage 4',
        status: 'active',
        onsetDate: '2019-02-10',
        diagnosedDate: '2019-02-10',
        lastAssessed: '2024-01-12',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C002',
        code: 'I10',
        name: 'Hypertension',
        status: 'active',
        onsetDate: '2015-08-20',
        diagnosedDate: '2015-08-20',
        lastAssessed: '2024-01-12',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C003',
        code: 'M81.0',
        name: 'Osteoporosis',
        status: 'active',
        onsetDate: '2020-06-15',
        diagnosedDate: '2020-06-15',
        lastAssessed: '2024-01-12',
        controlStatus: 'controlled'
      }
    ],
    careGaps: [
      {
        id: 'CG001',
        measure: 'Kidney Function Panel',
        priority: 'high',
        dueDate: '2024-02-12',
        status: 'open',
        description: 'Monthly CKD monitoring'
      },
      {
        id: 'CG002',
        measure: 'Bone Density Scan',
        priority: 'medium',
        dueDate: '2024-03-12',
        status: 'open',
        description: 'Annual osteoporosis assessment'
      }
    ],
    encounters: [
      {
        id: 'E001',
        date: '2024-01-12',
        type: 'Office Visit',
        provider: 'Dr. Michael Brown',
        summary: 'CKD monitoring',
        followUpNeeded: true,
        followUpDate: '2024-02-12',
        reason: 'Worsening kidney function',
        details: {
          vitals: {
            temperature: '98.4',
            heartRate: '82',
            respiratoryRate: '18',
            bloodPressure: '162/94',
            weight: '145',
            bmi: '27.8'
          }
        }
      }
    ],
    metrics: {
      bloodPressure: {
        value: 162,
        unit: 'mmHg',
        date: '2024-01-12'
      },
      weight: {
        value: 145,
        unit: 'lbs',
        date: '2024-01-12'
      }
    },
    labs: [
      {
        id: 'L001',
        name: 'eGFR',
        value: 25,
        unit: 'mL/min',
        date: '2024-01-12',
        status: 'critical',
        trend: 'down',
        referenceRange: '>60'
      },
      {
        id: 'L002',
        name: 'Creatinine',
        value: 2.8,
        unit: 'mg/dL',
        date: '2024-01-12',
        status: 'critical',
        trend: 'up',
        referenceRange: '0.6-1.2'
      }
    ],
    alerts: [
      {
        id: 'A001',
        type: 'critical',
        message: 'Rapidly declining kidney function',
        date: '2024-01-12',
        status: 'active',
        category: 'Clinical'
      }
    ],
    recentActions: [
      {
        id: 'RA001',
        type: 'Referral',
        description: 'Urgent nephrology consultation',
        date: '2024-01-12',
        provider: 'Dr. Michael Brown',
        status: 'pending',
        priority: 'high'
      }
    ],
    careTeam: [
      {
        id: 'CT001',
        name: 'Dr. Michael Brown',
        role: 'Primary Care Physician',
        specialty: 'Internal Medicine',
        primary: true,
        phone: '555-678-9012',
        email: 'michael.brown@clinic.com',
        details: {
          npi: '5678901234',
          practice: 'Senior Care Center',
          languages: ['English'],
          expertise: ['Geriatrics', 'Chronic Disease Management']
        }
      }
    ]
  },
  {
    id: 'P005',
    mrn: 'MRN005',
    name: {
      first: 'James',
      last: 'Chen'
    },
    dateOfBirth: '1957-09-03',
    gender: 'Male',
    demographics: {
      age: 66,
      gender: 'Male',
      ethnicity: 'Asian',
      language: 'English',
      maritalStatus: 'Married',
      employment: 'Retired',
      phone: '555-567-8901',
      email: 'james.chen@email.com',
      address: {
        street: '567 Maple Dr',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '567 Maple Dr',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-567-8901',
      email: 'james.chen@email.com'
    },
    insurance: {
      provider: 'Medicare',
      plan: 'Advantage',
      memberId: 'MC567891234'
    },
    primaryCare: {
      provider: 'Dr. Sarah Lee',
      clinic: 'Family Health Center',
      lastVisit: '2024-01-18'
    },
    riskFactors: {
      level: 'high',
      score: 90,
      factors: [
        {
          name: 'Congestive Heart Failure',
          severity: 'high',
          lastAssessed: '2024-01-18'
        },
        {
          name: 'Atrial Fibrillation',
          severity: 'high',
          lastAssessed: '2024-01-18'
        }
      ],
      trending: 'up'
    },
    conditions: [
      {
        id: 'C001',
        code: 'I50.9',
        name: 'Congestive Heart Failure',
        status: 'active',
        onsetDate: '2016-11-15',
        diagnosedDate: '2016-11-15',
        lastAssessed: '2024-01-18',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C002',
        code: 'I48.91',
        name: 'Atrial Fibrillation',
        status: 'active',
        onsetDate: '2018-03-20',
        diagnosedDate: '2018-03-20',
        lastAssessed: '2024-01-18',
        controlStatus: 'uncontrolled'
      }
    ],
    careGaps: [
      {
        id: 'CG001',
        measure: 'Anticoagulation Monitoring',
        priority: 'high',
        dueDate: '2024-02-01',
        status: 'open',
        description: 'INR check needed'
      },
      {
        id: 'CG002',
        measure: 'Echocardiogram',
        priority: 'high',
        dueDate: '2024-02-18',
        status: 'open',
        description: 'Annual cardiac function assessment'
      }
    ],
    encounters: [
      {
        id: 'E001',
        date: '2024-01-18',
        type: 'Emergency Department',
        provider: 'Dr. David Kim',
        summary: 'AFib with RVR',
        followUpNeeded: true,
        followUpDate: '2024-01-25',
        reason: 'Cardiac monitoring',
        details: {
          vitals: {
            temperature: '98.9',
            heartRate: '142',
            respiratoryRate: '24',
            bloodPressure: '158/95',
            weight: '170',
            bmi: '28.5'
          }
        }
      }
    ],
    metrics: {
      bloodPressure: {
        value: 158,
        unit: 'mmHg',
        date: '2024-01-18'
      },
      weight: {
        value: 170,
        unit: 'lbs',
        date: '2024-01-18'
      }
    },
    labs: [
      {
        id: 'L001',
        name: 'INR',
        value: 1.2,
        unit: 'ratio',
        date: '2024-01-18',
        status: 'critical',
        trend: 'down',
        referenceRange: '2.0-3.0'
      },
      {
        id: 'L002',
        name: 'BNP',
        value: 850,
        unit: 'pg/mL',
        date: '2024-01-18',
        status: 'critical',
        trend: 'up',
        referenceRange: '<100'
      }
    ],
    alerts: [
      {
        id: 'A001',
        type: 'critical',
        message: 'Sub-therapeutic anticoagulation',
        date: '2024-01-18',
        status: 'active',
        category: 'Clinical'
      },
      {
        id: 'A002',
        type: 'warning',
        message: 'Elevated BNP indicating worsening heart failure',
        date: '2024-01-18',
        status: 'active',
        category: 'Clinical'
      }
    ],
    recentActions: [
      {
        id: 'RA001',
        type: 'Medication Change',
        description: 'Adjusted warfarin dosing',
        date: '2024-01-18',
        provider: 'Dr. David Kim',
        status: 'completed',
        priority: 'high'
      }
    ],
    careTeam: [
      {
        id: 'CT001',
        name: 'Dr. Sarah Lee',
        role: 'Primary Care Physician',
        specialty: 'Internal Medicine',
        primary: true,
        phone: '555-789-0123',
        email: 'sarah.lee@clinic.com',
        details: {
          npi: '6789012345',
          practice: 'Family Health Center',
          languages: ['English', 'Mandarin'],
          expertise: ['Cardiology', 'Geriatrics']
        }
      },
      {
        id: 'CT002',
        name: 'Dr. David Kim',
        role: 'Cardiologist',
        specialty: 'Cardiology',
        primary: false,
        phone: '555-890-1234',
        email: 'david.kim@cardio.com',
        details: {
          npi: '7890123456',
          practice: 'Heart Care Specialists',
          languages: ['English', 'Korean'],
          expertise: ['Heart Failure', 'Arrhythmias']
        }
      }
    ]
  },
  {
    id: 'P006',
    mrn: 'MRN006',
    name: {
      first: 'Patricia',
      last: 'Thompson'
    },
    dateOfBirth: '1959-12-08',
    gender: 'Female',
    demographics: {
      age: 64,
      gender: 'Female',
      ethnicity: 'White',
      language: 'English',
      maritalStatus: 'Married',
      employment: 'Part-time',
      phone: '555-678-9012',
      email: 'patricia.thompson@email.com',
      address: {
        street: '890 Cedar Ln',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '890 Cedar Ln',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-678-9012',
      email: 'patricia.thompson@email.com'
    },
    insurance: {
      provider: 'Aetna',
      plan: 'Medicare Advantage',
      memberId: 'AE678901234'
    },
    primaryCare: {
      provider: 'Dr. James Wilson',
      clinic: 'Wellness Medical Group',
      lastVisit: '2024-01-16'
    },
    riskFactors: {
      level: 'high',
      score: 87,
      factors: [
        {
          name: 'Type 2 Diabetes',
          severity: 'high',
          lastAssessed: '2024-01-16'
        },
        {
          name: 'Obesity',
          severity: 'high',
          lastAssessed: '2024-01-16'
        },
        {
          name: 'Depression',
          severity: 'medium',
          lastAssessed: '2024-01-16'
        }
      ],
      trending: 'up'
    },
    conditions: [
      {
        id: 'C001',
        code: 'E11.9',
        name: 'Type 2 Diabetes',
        status: 'active',
        onsetDate: '2014-05-20',
        diagnosedDate: '2014-05-20',
        lastAssessed: '2024-01-16',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C002',
        code: 'E66.9',
        name: 'Obesity',
        status: 'active',
        onsetDate: '2015-03-15',
        diagnosedDate: '2015-03-15',
        lastAssessed: '2024-01-16',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C003',
        code: 'F32.9',
        name: 'Depression',
        status: 'active',
        onsetDate: '2020-11-30',
        diagnosedDate: '2020-11-30',
        lastAssessed: '2024-01-16',
        controlStatus: 'uncontrolled'
      }
    ],
    careGaps: [
      {
        id: 'CG001',
        measure: 'HbA1c Test',
        priority: 'high',
        dueDate: '2024-02-16',
        status: 'open',
        description: 'Quarterly diabetes monitoring'
      },
      {
        id: 'CG002',
        measure: 'Eye Examination',
        priority: 'high',
        dueDate: '2024-02-28',
        status: 'open',
        description: 'Annual diabetic retinopathy screening'
      },
      {
        id: 'CG003',
        measure: 'Depression Screening',
        priority: 'medium',
        dueDate: '2024-02-16',
        status: 'open',
        description: 'Follow-up PHQ-9 assessment'
      }
    ],
    encounters: [
      {
        id: 'E001',
        date: '2024-01-16',
        type: 'Office Visit',
        provider: 'Dr. James Wilson',
        summary: 'Diabetes management',
        followUpNeeded: true,
        followUpDate: '2024-02-16',
        reason: 'Uncontrolled diabetes',
        details: {
          vitals: {
            temperature: '98.6',
            heartRate: '88',
            respiratoryRate: '18',
            bloodPressure: '138/88',
            weight: '245',
            bmi: '38.4'
          }
        }
      }
    ],
    metrics: {
      bloodPressure: {
        value: 138,
        unit: 'mmHg',
        date: '2024-01-16'
      },
      weight: {
        value: 245,
        unit: 'lbs',
        date: '2024-01-16'
      }
    },
    labs: [
      {
        id: 'L001',
        name: 'HbA1c',
        value: 9.8,
        unit: '%',
        date: '2024-01-16',
        status: 'critical',
        trend: 'up',
        referenceRange: '4.0-5.6'
      },
      {
        id: 'L002',
        name: 'Glucose',
        value: 285,
        unit: 'mg/dL',
        date: '2024-01-16',
        status: 'critical',
        trend: 'up',
        referenceRange: '70-99'
      }
    ],
    alerts: [
      {
        id: 'A001',
        type: 'critical',
        message: 'Severely elevated HbA1c',
        date: '2024-01-16',
        status: 'active',
        category: 'Clinical'
      },
      {
        id: 'A002',
        type: 'warning',
        message: 'Missed mental health follow-up',
        date: '2024-01-16',
        status: 'active',
        category: 'Clinical'
      }
    ],
    recentActions: [
      {
        id: 'RA001',
        type: 'Medication Change',
        description: 'Increased insulin dosage',
        date: '2024-01-16',
        provider: 'Dr. James Wilson',
        status: 'completed',
        priority: 'high'
      }
    ],
    careTeam: [
      {
        id: 'CT001',
        name: 'Dr. James Wilson',
        role: 'Primary Care Physician',
        specialty: 'Internal Medicine',
        primary: true,
        phone: '555-901-2345',
        email: 'james.wilson@clinic.com',
        details: {
          npi: '8901234567',
          practice: 'Wellness Medical Group',
          languages: ['English'],
          expertise: ['Diabetes', 'Obesity Management']
        }
      },
      {
        id: 'CT002',
        name: 'Dr. Rachel Green',
        role: 'Endocrinologist',
        specialty: 'Endocrinology',
        primary: false,
        phone: '555-012-3456',
        email: 'rachel.green@endo.com',
        details: {
          npi: '9012345678',
          practice: 'Diabetes & Endocrine Specialists',
          languages: ['English'],
          expertise: ['Diabetes', 'Thyroid Disorders']
        }
      }
    ]
  },
  {
    id: 'P007',
    mrn: 'MRN007',
    name: {
      first: 'Michael',
      last: 'Rodriguez'
    },
    dateOfBirth: '1963-08-25',
    gender: 'Male',
    demographics: {
      age: 60,
      gender: 'Male',
      ethnicity: 'Hispanic',
      language: 'Spanish',
      maritalStatus: 'Married',
      employment: 'Employed',
      phone: '555-789-0123',
      email: 'michael.rodriguez@email.com',
      address: {
        street: '234 Birch Rd',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '234 Birch Rd',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-789-0123',
      email: 'michael.rodriguez@email.com'
    },
    insurance: {
      provider: 'United Healthcare',
      plan: 'PPO',
      memberId: 'UH789012345'
    },
    primaryCare: {
      provider: 'Dr. Maria Sanchez',
      clinic: 'Community Care Clinic',
      lastVisit: '2024-01-14'
    },
    riskFactors: {
      level: 'high',
      score: 89,
      factors: [
        {
          name: 'Coronary Artery Disease',
          severity: 'high',
          lastAssessed: '2024-01-14'
        },
        {
          name: 'Type 2 Diabetes',
          severity: 'high',
          lastAssessed: '2024-01-14'
        }
      ],
      trending: 'up'
    },
    conditions: [
      {
        id: 'C001',
        code: 'I25.10',
        name: 'Coronary Artery Disease with Unstable Angina',
        status: 'active',
        onsetDate: '2019-06-15',
        diagnosedDate: '2019-06-15',
        lastAssessed: '2024-01-14',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C002',
        code: 'E11.9',
        name: 'Type 2 Diabetes',
        status: 'active',
        onsetDate: '2017-09-20',
        diagnosedDate: '2017-09-20',
        lastAssessed: '2024-01-14',
        controlStatus: 'uncontrolled'
      }
    ],
    careGaps: [
      {
        id: 'CG001',
        measure: 'Stress Test',
        priority: 'high',
        dueDate: '2024-02-14',
        status: 'open',
        description: 'Annual cardiac stress test'
      },
      {
        id: 'CG002',
        measure: 'Lipid Panel',
        priority: 'high',
        dueDate: '2024-02-14',
        status: 'open',
        description: 'Monitoring of cardiovascular risk'
      }
    ],
    encounters: [
      {
        id: 'E001',
        date: '2024-01-14',
        type: 'Office Visit',
        provider: 'Dr. Maria Sanchez',
        summary: 'Cardiovascular risk assessment',
        followUpNeeded: true,
        followUpDate: '2024-02-14',
        reason: 'CAD management',
        details: {
          vitals: {
            temperature: '98.8',
            heartRate: '92',
            respiratoryRate: '20',
            bloodPressure: '148/92',
            weight: '198',
            bmi: '32.1'
          }
        }
      }
    ],
    metrics: {
      bloodPressure: {
        value: 148,
        unit: 'mmHg',
        date: '2024-01-14'
      },
      weight: {
        value: 198,
        unit: 'lbs',
        date: '2024-01-14'
      }
    },
    labs: [
      {
        id: 'L001',
        name: 'LDL Cholesterol',
        value: 165,
        unit: 'mg/dL',
        date: '2024-01-14',
        status: 'critical',
        trend: 'up',
        referenceRange: '<100'
      },
      {
        id: 'L002',
        name: 'HbA1c',
        value: 8.5,
        unit: '%',
        date: '2024-01-14',
        status: 'abnormal',
        trend: 'stable',
        referenceRange: '4.0-5.6'
      }
    ],
    alerts: [
      {
        id: 'A001',
        type: 'critical',
        message: 'Elevated cardiovascular risk',
        date: '2024-01-14',
        status: 'active',
        category: 'Clinical'
      }
    ],
    recentActions: [
      {
        id: 'RA001',
        type: 'Medication Change',
        description: 'Adjusted statin dosage',
        date: '2024-01-14',
        provider: 'Dr. Maria Sanchez',
        status: 'completed',
        priority: 'high'
      }
    ],
    careTeam: [
      {
        id: 'CT001',
        name: 'Dr. Maria Sanchez',
        role: 'Primary Care Physician',
        specialty: 'Family Medicine',
        primary: true,
        phone: '555-123-4567',
        email: 'maria.sanchez@clinic.com',
        details: {
          npi: '0123456789',
          practice: 'Community Care Clinic',
          languages: ['English', 'Spanish'],
          expertise: ['Cardiovascular Disease', 'Diabetes']
        }
      }
    ]
  },
  {
    id: 'P008',
    mrn: 'MRN008',
    name: {
      first: 'Linda',
      last: 'Anderson'
    },
    dateOfBirth: '1961-02-14',
    gender: 'Female',
    demographics: {
      age: 62,
      gender: 'Female',
      ethnicity: 'White',
      language: 'English',
      maritalStatus: 'Married',
      employment: 'Retired',
      phone: '555-890-1234',
      email: 'linda.anderson@email.com',
      address: {
        street: '456 Willow Way',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '456 Willow Way',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-890-1234',
      email: 'linda.anderson@email.com'
    },
    insurance: {
      provider: 'Medicare',
      plan: 'Part A & B',
      memberId: 'MC890123456'
    },
    primaryCare: {
      provider: 'Dr. Thomas Wright',
      clinic: 'Comprehensive Care Center',
      lastVisit: '2024-01-17'
    },
    riskFactors: {
      level: 'high',
      score: 84,
      factors: [
        {
          name: 'Multiple Sclerosis',
          severity: 'high',
          lastAssessed: '2024-01-17'
        },
        {
          name: 'Depression',
          severity: 'high',
          lastAssessed: '2024-01-17'
        },
        {
          name: 'Osteoporosis',
          severity: 'medium',
          lastAssessed: '2024-01-17'
        }
      ],
      trending: 'up'
    },
    conditions: [
      {
        id: 'C001',
        code: 'G35',
        name: 'Multiple Sclerosis',
        status: 'active',
        onsetDate: '2012-08-15',
        diagnosedDate: '2012-08-15',
        lastAssessed: '2024-01-17',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C002',
        code: 'F32.2',
        name: 'Major Depressive Disorder',
        status: 'active',
        onsetDate: '2018-03-20',
        diagnosedDate: '2018-03-20',
        lastAssessed: '2024-01-17',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C003',
        code: 'M81.0',
        name: 'Osteoporosis',
        status: 'active',
        onsetDate: '2019-11-30',
        diagnosedDate: '2019-11-30',
        lastAssessed: '2024-01-17',
        controlStatus: 'controlled'
      }
    ],
    careGaps: [
      {
        id: 'CG001',
        measure: 'MRI Brain',
        priority: 'high',
        dueDate: '2024-02-17',
        status: 'open',
        description: 'Annual MS progression monitoring'
      },
      {
        id: 'CG002',
        measure: 'Depression Screening',
        priority: 'high',
        dueDate: '2024-02-01',
        status: 'open',
        description: 'Monthly PHQ-9 assessment'
      }
    ],
    encounters: [
      {
        id: 'E001',
        date: '2024-01-17',
        type: 'Office Visit',
        provider: 'Dr. Thomas Wright',
        summary: 'MS exacerbation follow-up',
        followUpNeeded: true,
        followUpDate: '2024-02-17',
        reason: 'MS symptom management',
        details: {
          vitals: {
            temperature: '98.4',
            heartRate: '78',
            respiratoryRate: '16',
            bloodPressure: '128/82',
            weight: '142',
            bmi: '26.8'
          }
        }
      }
    ],
    metrics: {
      bloodPressure: {
        value: 128,
        unit: 'mmHg',
        date: '2024-01-17'
      },
      weight: {
        value: 142,
        unit: 'lbs',
        date: '2024-01-17'
      }
    },
    labs: [
      {
        id: 'L001',
        name: 'Vitamin D',
        value: 18,
        unit: 'ng/mL',
        date: '2024-01-17',
        status: 'abnormal',
        trend: 'down',
        referenceRange: '30-100'
      }
    ],
    alerts: [
      {
        id: 'A001',
        type: 'warning',
        message: 'Recent MS exacerbation',
        date: '2024-01-17',
        status: 'active',
        category: 'Clinical'
      },
      {
        id: 'A002',
        type: 'warning',
        message: 'Worsening depression symptoms',
        date: '2024-01-17',
        status: 'active',
        category: 'Clinical'
      }
    ],
    recentActions: [
      {
        id: 'RA001',
        type: 'Medication Change',
        description: 'Started new MS medication',
        date: '2024-01-17',
        provider: 'Dr. Thomas Wright',
        status: 'completed',
        priority: 'high'
      }
    ],
    careTeam: [
      {
        id: 'CT001',
        name: 'Dr. Thomas Wright',
        role: 'Primary Care Physician',
        specialty: 'Internal Medicine',
        primary: true,
        phone: '555-234-5678',
        email: 'thomas.wright@clinic.com',
        details: {
          npi: '1234567890',
          practice: 'Comprehensive Care Center',
          languages: ['English'],
          expertise: ['Multiple Sclerosis', 'Chronic Disease Management']
        }
      },
      {
        id: 'CT002',
        name: 'Dr. Amanda Lee',
        role: 'Neurologist',
        specialty: 'Neurology',
        primary: false,
        phone: '555-345-6789',
        email: 'amanda.lee@neuro.com',
        details: {
          npi: '2345678901',
          practice: 'Neurology Associates',
          languages: ['English'],
          expertise: ['Multiple Sclerosis', 'Neuroimmunology']
        }
      }
    ]
  },
  {
    id: 'P009',
    mrn: 'MRN009',
    name: {
      first: 'William',
      last: 'Taylor'
    },
    dateOfBirth: '1964-06-30',
    gender: 'Male',
    demographics: {
      age: 59,
      gender: 'Male',
      ethnicity: 'African American',
      language: 'English',
      maritalStatus: 'Single',
      employment: 'Disabled',
      phone: '555-901-2345',
      email: 'william.taylor@email.com',
      address: {
        street: '789 Spruce Ave',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '789 Spruce Ave',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-901-2345',
      email: 'william.taylor@email.com'
    },
    insurance: {
      provider: 'Medicaid',
      plan: 'Standard',
      memberId: 'MD901234567'
    },
    primaryCare: {
      provider: 'Dr. Rebecca Martinez',
      clinic: 'Community Health Partners',
      lastVisit: '2024-01-19'
    },
    riskFactors: {
      level: 'high',
      score: 91,
      factors: [
        {
          name: 'End Stage Renal Disease',
          severity: 'high',
          lastAssessed: '2024-01-19'
        },
        {
          name: 'Hypertension',
          severity: 'high',
          lastAssessed: '2024-01-19'
        },
        {
          name: 'Anemia',
          severity: 'medium',
          lastAssessed: '2024-01-19'
        }
      ],
      trending: 'up'
    },
    conditions: [
      {
        id: 'C001',
        code: 'N18.6',
        name: 'End Stage Renal Disease',
        status: 'active',
        onsetDate: '2020-04-15',
        diagnosedDate: '2020-04-15',
        lastAssessed: '2024-01-19',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C002',
        code: 'I10',
        name: 'Hypertension',
        status: 'active',
        onsetDate: '2015-08-20',
        diagnosedDate: '2015-08-20',
        lastAssessed: '2024-01-19',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C003',
        code: 'D64.9',
        name: 'Anemia',
        status: 'active',
        onsetDate: '2021-02-10',
        diagnosedDate: '2021-02-10',
        lastAssessed: '2024-01-19',
        controlStatus: 'uncontrolled'
      }
    ],
    careGaps: [
      {
        id: 'CG001',
        measure: 'Dialysis Adequacy',
        priority: 'high',
        dueDate: '2024-02-19',
        status: 'open',
        description: 'Monthly Kt/V assessment'
      },
      {
        id: 'CG002',
        measure: 'Anemia Management',
        priority: 'high',
        dueDate: '2024-02-01',
        status: 'open',
        description: 'EPO adjustment needed'
      }
    ],
    encounters: [
      {
        id: 'E001',
        date: '2024-01-19',
        type: 'Dialysis Center',
        provider: 'Dr. Rebecca Martinez',
        summary: 'Routine dialysis visit',
        followUpNeeded: true,
        followUpDate: '2024-01-22',
        reason: 'Thrice weekly dialysis',
        details: {
          vitals: {
            temperature: '98.6',
            heartRate: '88',
            respiratoryRate: '18',
            bloodPressure: '168/98',
            weight: '185',
            bmi: '29.8'
          }
        }
      }
    ],
    metrics: {
      bloodPressure: {
        value: 168,
        unit: 'mmHg',
        date: '2024-01-19'
      },
      weight: {
        value: 185,
        unit: 'lbs',
        date: '2024-01-19'
      }
    },
    labs: [
      {
        id: 'L001',
        name: 'Hemoglobin',
        value: 9.2,
        unit: 'g/dL',
        date: '2024-01-19',
        status: 'critical',
        trend: 'down',
        referenceRange: '13.5-17.5'
      },
      {
        id: 'L002',
        name: 'Kt/V',
        value: 1.2,
        unit: 'ratio',
        date: '2024-01-19',
        status: 'abnormal',
        trend: 'stable',
        referenceRange: '>1.4'
      }
    ],
    alerts: [
      {
        id: 'A001',
        type: 'critical',
        message: 'Inadequate dialysis clearance',
        date: '2024-01-19',
        status: 'active',
        category: 'Clinical'
      },
      {
        id: 'A002',
        type: 'warning',
        message: 'Worsening anemia',
        date: '2024-01-19',
        status: 'active',
        category: 'Clinical'
      }
    ],
    recentActions: [
      {
        id: 'RA001',
        type: 'Medication Change',
        description: 'Increased EPO dose',
        date: '2024-01-19',
        provider: 'Dr. Rebecca Martinez',
        status: 'completed',
        priority: 'high'
      }
    ],
    careTeam: [
      {
        id: 'CT001',
        name: 'Dr. Rebecca Martinez',
        role: 'Nephrologist',
        specialty: 'Nephrology',
        primary: true,
        phone: '555-345-6789',
        email: 'rebecca.martinez@clinic.com',
        details: {
          npi: '3456789012',
          practice: 'Community Health Partners',
          languages: ['English', 'Spanish'],
          expertise: ['Dialysis', 'Chronic Kidney Disease']
        }
      }
    ]
  },
  {
    id: 'P010',
    mrn: 'MRN010',
    name: {
      first: 'David',
      last: 'Patel'
    },
    dateOfBirth: '1956-04-12',
    gender: 'Male',
    demographics: {
      age: 67,
      gender: 'Male',
      ethnicity: 'Asian Indian',
      language: 'English',
      maritalStatus: 'Married',
      employment: 'Retired',
      phone: '555-012-3456',
      email: 'david.patel@email.com',
      address: {
        street: '567 Aspen Court',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '567 Aspen Court',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-012-3456',
      email: 'david.patel@email.com'
    },
    insurance: {
      provider: 'Medicare',
      plan: 'Advantage',
      memberId: 'MC012345678'
    },
    primaryCare: {
      provider: 'Dr. Jennifer Kim',
      clinic: 'Integrated Health Center',
      lastVisit: '2024-01-15'
    },
    riskFactors: {
      level: 'high',
      score: 88,
      factors: [
        {
          name: 'Chronic Heart Failure',
          severity: 'high',
          lastAssessed: '2024-01-15'
        },
        {
          name: 'Type 2 Diabetes',
          severity: 'high',
          lastAssessed: '2024-01-15'
        },
        {
          name: 'Chronic Kidney Disease',
          severity: 'medium',
          lastAssessed: '2024-01-15'
        }
      ],
      trending: 'up'
    },
    conditions: [
      {
        id: 'C001',
        code: 'I50.9',
        name: 'Chronic Heart Failure',
        status: 'active',
        onsetDate: '2017-05-20',
        diagnosedDate: '2017-05-20',
        lastAssessed: '2024-01-15',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C002',
        code: 'E11.9',
        name: 'Type 2 Diabetes',
        status: 'active',
        onsetDate: '2010-03-15',
        diagnosedDate: '2010-03-15',
        lastAssessed: '2024-01-15',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C003',
        code: 'N18.3',
        name: 'Chronic Kidney Disease Stage 3',
        status: 'active',
        onsetDate: '2019-08-10',
        diagnosedDate: '2019-08-10',
        lastAssessed: '2024-01-15',
        controlStatus: 'uncontrolled'
      }
    ],
    careGaps: [
      {
        id: 'CG001',
        measure: 'Echocardiogram',
        priority: 'high',
        dueDate: '2024-02-15',
        status: 'open',
        description: 'Annual cardiac function assessment'
      },
      {
        id: 'CG002',
        measure: 'Kidney Function Panel',
        priority: 'high',
        dueDate: '2024-02-01',
        status: 'open',
        description: 'Monthly CKD monitoring'
      }
    ],
    encounters: [
      {
        id: 'E001',
        date: '2024-01-15',
        type: 'Office Visit',
        provider: 'Dr. Jennifer Kim',
        summary: 'Multiple chronic conditions follow-up',
        followUpNeeded: true,
        followUpDate: '2024-02-15',
        reason: 'Disease management',
        details: {
          vitals: {
            temperature: '98.6',
            heartRate: '82',
            respiratoryRate: '20',
            bloodPressure: '145/85',
            weight: '175',
            bmi: '29.2'
          }
        }
      }
    ],
    metrics: {
      bloodPressure: {
        value: 145,
        unit: 'mmHg',
        date: '2024-01-15'
      },
      weight: {
        value: 175,
        unit: 'lbs',
        date: '2024-01-15'
      }
    },
    labs: [
      {
        id: 'L001',
        name: 'BNP',
        value: 750,
        unit: 'pg/mL',
        date: '2024-01-15',
        status: 'critical',
        trend: 'up',
        referenceRange: '<100'
      },
      {
        id: 'L002',
        name: 'eGFR',
        value: 45,
        unit: 'mL/min',
        date: '2024-01-15',
        status: 'abnormal',
        trend: 'down',
        referenceRange: '>60'
      }
    ],
    alerts: [
      {
        id: 'A001',
        type: 'critical',
        message: 'Worsening heart failure',
        date: '2024-01-15',
        status: 'active',
        category: 'Clinical'
      },
      {
        id: 'A002',
        type: 'warning',
        message: 'Declining kidney function',
        date: '2024-01-15',
        status: 'active',
        category: 'Clinical'
      }
    ],
    recentActions: [
      {
        id: 'RA001',
        type: 'Medication Change',
        description: 'Adjusted heart failure medications',
        date: '2024-01-15',
        provider: 'Dr. Jennifer Kim',
        status: 'completed',
        priority: 'high'
      }
    ],
    careTeam: [
      {
        id: 'CT001',
        name: 'Dr. Jennifer Kim',
        role: 'Primary Care Physician',
        specialty: 'Internal Medicine',
        primary: true,
        phone: '555-123-4567',
        email: 'jennifer.kim@clinic.com',
        details: {
          npi: '4567890123',
          practice: 'Integrated Health Center',
          languages: ['English', 'Korean'],
          expertise: ['Geriatrics', 'Chronic Disease Management']
        }
      }
    ]
  },
  {
    id: 'P011',
    mrn: 'MRN011',
    name: {
      first: 'Susan',
      last: 'Martinez'
    },
    dateOfBirth: '1959-08-18',
    gender: 'Female',
    demographics: {
      age: 64,
      gender: 'Female',
      ethnicity: 'Hispanic',
      language: 'Spanish',
      maritalStatus: 'Married',
      employment: 'Part-time',
      phone: '555-123-4567',
      email: 'susan.martinez@email.com',
      address: {
        street: '789 Magnolia Blvd',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '789 Magnolia Blvd',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-123-4567',
      email: 'susan.martinez@email.com'
    },
    insurance: {
      provider: 'Blue Shield',
      plan: 'PPO',
      memberId: 'BS123456789'
    },
    primaryCare: {
      provider: 'Dr. Carlos Rodriguez',
      clinic: 'Family Health Partners',
      lastVisit: '2024-01-18'
    },
    riskFactors: {
      level: 'high',
      score: 85,
      factors: [
        {
          name: 'Lupus',
          severity: 'high',
          lastAssessed: '2024-01-18'
        },
        {
          name: 'Rheumatoid Arthritis',
          severity: 'high',
          lastAssessed: '2024-01-18'
        },
        {
          name: 'Depression',
          severity: 'medium',
          lastAssessed: '2024-01-18'
        }
      ],
      trending: 'up'
    },
    conditions: [
      {
        id: 'C001',
        code: 'M32.9',
        name: 'Systemic Lupus Erythematosus',
        status: 'active',
        onsetDate: '2015-06-15',
        diagnosedDate: '2015-06-15',
        lastAssessed: '2024-01-18',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C002',
        code: 'M06.9',
        name: 'Rheumatoid Arthritis',
        status: 'active',
        onsetDate: '2018-03-20',
        diagnosedDate: '2018-03-20',
        lastAssessed: '2024-01-18',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C003',
        code: 'F32.9',
        name: 'Depression',
        status: 'active',
        onsetDate: '2019-11-30',
        diagnosedDate: '2019-11-30',
        lastAssessed: '2024-01-18',
        controlStatus: 'controlled'
      }
    ],
    careGaps: [
      {
        id: 'CG001',
        measure: 'Rheumatology Follow-up',
        priority: 'high',
        dueDate: '2024-02-18',
        status: 'open',
        description: 'Monthly lupus assessment'
      },
      {
        id: 'CG002',
        measure: 'Depression Screening',
        priority: 'medium',
        dueDate: '2024-03-18',
        status: 'open',
        description: 'Quarterly mental health check'
      }
    ],
    encounters: [
      {
        id: 'E001',
        date: '2024-01-18',
        type: 'Office Visit',
        provider: 'Dr. Carlos Rodriguez',
        summary: 'Lupus flare management',
        followUpNeeded: true,
        followUpDate: '2024-02-18',
        reason: 'Disease activity monitoring',
        details: {
          vitals: {
            temperature: '99.1',
            heartRate: '85',
            respiratoryRate: '18',
            bloodPressure: '132/84',
            weight: '155',
            bmi: '28.4'
          }
        }
      }
    ],
    metrics: {
      bloodPressure: {
        value: 132,
        unit: 'mmHg',
        date: '2024-01-18'
      },
      weight: {
        value: 155,
        unit: 'lbs',
        date: '2024-01-18'
      }
    },
    labs: [
      {
        id: 'L001',
        name: 'C3 Complement',
        value: 65,
        unit: 'mg/dL',
        date: '2024-01-18',
        status: 'abnormal',
        trend: 'down',
        referenceRange: '90-180'
      },
      {
        id: 'L002',
        name: 'Anti-dsDNA',
        value: 75,
        unit: 'IU/mL',
        date: '2024-01-18',
        status: 'critical',
        trend: 'up',
        referenceRange: '<30'
      }
    ],
    alerts: [
      {
        id: 'A001',
        type: 'critical',
        message: 'Active lupus flare',
        date: '2024-01-18',
        status: 'active',
        category: 'Clinical'
      },
      {
        id: 'A002',
        type: 'warning',
        message: 'Joint inflammation worsening',
        date: '2024-01-18',
        status: 'active',
        category: 'Clinical'
      }
    ],
    recentActions: [
      {
        id: 'RA001',
        type: 'Medication Change',
        description: 'Increased immunosuppression',
        date: '2024-01-18',
        provider: 'Dr. Carlos Rodriguez',
        status: 'completed',
        priority: 'high'
      }
    ],
    careTeam: [
      {
        id: 'CT001',
        name: 'Dr. Carlos Rodriguez',
        role: 'Primary Care Physician',
        specialty: 'Internal Medicine',
        primary: true,
        phone: '555-234-5678',
        email: 'carlos.rodriguez@clinic.com',
        details: {
          npi: '5678901234',
          practice: 'Family Health Partners',
          languages: ['English', 'Spanish'],
          expertise: ['Rheumatology', 'Internal Medicine']
        }
      },
      {
        id: 'CT002',
        name: 'Dr. Lisa Chen',
        role: 'Rheumatologist',
        specialty: 'Rheumatology',
        primary: false,
        phone: '555-345-6789',
        email: 'lisa.chen@rheuma.com',
        details: {
          npi: '6789012345',
          practice: 'Arthritis & Rheumatology Specialists',
          languages: ['English'],
          expertise: ['Lupus', 'Rheumatoid Arthritis']
        }
      }
    ]
  },
  {
    id: 'P012',
    mrn: 'MRN012',
    name: {
      first: 'Richard',
      last: 'Wilson'
    },
    dateOfBirth: '1955-11-25',
    gender: 'Male',
    demographics: {
      age: 68,
      gender: 'Male',
      ethnicity: 'White',
      language: 'English',
      maritalStatus: 'Widowed',
      employment: 'Retired',
      phone: '555-234-5678',
      email: 'richard.wilson@email.com',
      address: {
        street: '234 Redwood Lane',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '234 Redwood Lane',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-234-5678',
      email: 'richard.wilson@email.com'
    },
    insurance: {
      provider: 'Medicare',
      plan: 'Part A & B',
      memberId: 'MC234567890'
    },
    primaryCare: {
      provider: 'Dr. Patricia Thompson',
      clinic: 'Senior Health Associates',
      lastVisit: '2024-01-20'
    },
    riskFactors: {
      level: 'high',
      score: 93,
      factors: [
        {
          name: 'Advanced COPD',
          severity: 'high',
          lastAssessed: '2024-01-20'
        },
        {
          name: 'Pulmonary Hypertension',
          severity: 'high',
          lastAssessed: '2024-01-20'
        },
        {
          name: 'Right Heart Failure',
          severity: 'high',
          lastAssessed: '2024-01-20'
        }
      ],
      trending: 'up'
    },
    conditions: [
      {
        id: 'C001',
        code: 'J44.9',
        name: 'Advanced COPD',
        status: 'active',
        onsetDate: '2012-03-15',
        diagnosedDate: '2012-03-15',
        lastAssessed: '2024-01-20',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C002',
        code: 'I27.0',
        name: 'Pulmonary Hypertension',
        status: 'active',
        onsetDate: '2018-06-20',
        diagnosedDate: '2018-06-20',
        lastAssessed: '2024-01-20',
        controlStatus: 'uncontrolled'
      },
      {
        id: 'C003',
        code: 'I50.810',
        name: 'Right Heart Failure',
        status: 'active',
        onsetDate: '2020-09-10',
        diagnosedDate: '2020-09-10',
        lastAssessed: '2024-01-20',
        controlStatus: 'uncontrolled'
      }
    ],
    careGaps: [
      {
        id: 'CG001',
        measure: 'Pulmonary Function Test',
        priority: 'high',
        dueDate: '2024-02-20',
        status: 'open',
        description: 'Quarterly COPD assessment'
      },
      {
        id: 'CG002',
        measure: 'Right Heart Catheterization',
        priority: 'high',
        dueDate: '2024-03-01',
        status: 'open',
        description: 'Pulmonary pressure monitoring'
      }
    ],
    encounters: [
      {
        id: 'E001',
        date: '2024-01-20',
        type: 'Emergency Department',
        provider: 'Dr. Patricia Thompson',
        summary: 'COPD exacerbation',
        followUpNeeded: true,
        followUpDate: '2024-01-27',
        reason: 'Respiratory distress',
        details: {
          vitals: {
            temperature: '99.0',
            heartRate: '102',
            respiratoryRate: '26',
            bloodPressure: '145/90',
            weight: '165',
            bmi: '27.5'
          }
        }
      }
    ],
    metrics: {
      bloodPressure: {
        value: 145,
        unit: 'mmHg',
        date: '2024-01-20'
      },
      weight: {
        value: 165,
        unit: 'lbs',
        date: '2024-01-20'
      }
    },
    labs: [
      {
        id: 'L001',
        name: 'BNP',
        value: 890,
        unit: 'pg/mL',
        date: '2024-01-20',
        status: 'critical',
        trend: 'up',
        referenceRange: '<100'
      },
      {
        id: 'L002',
        name: 'Arterial Blood Gas pH',
        value: 7.32,
        unit: 'pH',
        date: '2024-01-20',
        status: 'critical',
        trend: 'down',
        referenceRange: '7.35-7.45'
      }
    ],
    alerts: [
      {
        id: 'A001',
        type: 'critical',
        message: 'Severe COPD exacerbation',
        date: '2024-01-20',
        status: 'active',
        category: 'Clinical'
      },
      {
        id: 'A002',
        type: 'critical',
        message: 'Worsening right heart failure',
        date: '2024-01-20',
        status: 'active',
        category: 'Clinical'
      }
    ],
    recentActions: [
      {
        id: 'RA001',
        type: 'ED Visit',
        description: 'Emergency treatment for COPD exacerbation',
        date: '2024-01-20',
        provider: 'Dr. Patricia Thompson',
        status: 'completed',
        priority: 'high'
      }
    ],
    careTeam: [
      {
        id: 'CT001',
        name: 'Dr. Patricia Thompson',
        role: 'Primary Care Physician',
        specialty: 'Internal Medicine',
        primary: true,
        phone: '555-345-6789',
        email: 'patricia.thompson@clinic.com',
        details: {
          npi: '7890123456',
          practice: 'Senior Health Associates',
          languages: ['English'],
          expertise: ['Pulmonary Disease', 'Geriatrics']
        }
      },
      {
        id: 'CT002',
        name: 'Dr. Michael Chang',
        role: 'Pulmonologist',
        specialty: 'Pulmonology',
        primary: false,
        phone: '555-456-7890',
        email: 'michael.chang@pulm.com',
        details: {
          npi: '8901234567',
          practice: 'Pulmonary Specialists',
          languages: ['English'],
          expertise: ['COPD', 'Pulmonary Hypertension']
        }
      }
    ]
  }
];
