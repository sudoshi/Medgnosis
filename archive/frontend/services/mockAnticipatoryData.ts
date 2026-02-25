import type { PatientDetails } from '@/types/patient';

// Helper function to create dates relative to current date
const createDate = (daysFromNow: number, timeString: string = '09:00'): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const [hours, minutes] = timeString.split(':');
  date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  return date.toISOString();
};

// Common conditions and care gaps for reuse
const commonConditions = {
  // Cardiovascular
  hypertension: {
    id: 'HTN',
    code: 'I10',
    name: 'Hypertension',
    status: 'active' as const,
    controlStatus: 'controlled' as const,
  },
  cad: {
    id: 'CAD',
    code: 'I25.10',
    name: 'Coronary Artery Disease',
    status: 'active' as const,
    controlStatus: 'controlled' as const,
  },
  chf: {
    id: 'CHF',
    code: 'I50.9',
    name: 'Congestive Heart Failure',
    status: 'active' as const,
    controlStatus: 'controlled' as const,
  },
  afib: {
    id: 'AFIB',
    code: 'I48.91',
    name: 'Atrial Fibrillation',
    status: 'active' as const,
    controlStatus: 'controlled' as const,
  },

  // Endocrine
  diabetes: {
    id: 'T2D',
    code: 'E11',
    name: 'Type 2 Diabetes',
    status: 'active' as const,
    controlStatus: 'controlled' as const,
  },
  hypothyroidism: {
    id: 'HYPO',
    code: 'E03.9',
    name: 'Hypothyroidism',
    status: 'active' as const,
    controlStatus: 'controlled' as const,
  },

  // Metabolic
  hyperlipidemia: {
    id: 'HLD',
    code: 'E78.5',
    name: 'Hyperlipidemia',
    status: 'active' as const,
    controlStatus: 'controlled' as const,
  },
  obesity: {
    id: 'OBS',
    code: 'E66.9',
    name: 'Obesity',
    status: 'active' as const,
    controlStatus: 'controlled' as const,
  },

  // Respiratory
  copd: {
    id: 'COPD',
    code: 'J44.9',
    name: 'COPD',
    status: 'active' as const,
    controlStatus: 'controlled' as const,
  },
  asthma: {
    id: 'ASTH',
    code: 'J45.909',
    name: 'Asthma',
    status: 'active' as const,
    controlStatus: 'controlled' as const,
  },

  // Other
  ckd: {
    id: 'CKD',
    code: 'N18.3',
    name: 'Chronic Kidney Disease',
    status: 'active' as const,
    controlStatus: 'controlled' as const,
  },
  osteoporosis: {
    id: 'OSTP',
    code: 'M81.0',
    name: 'Osteoporosis',
    status: 'active' as const,
    controlStatus: 'controlled' as const,
  }
};

const commonCareGaps = {
  // Lab Tests
  a1c: {
    measure: 'HbA1c Test',
    priority: 'high' as const,
    description: 'Diabetes monitoring needed',
    type: 'lab' as const,
    orderType: 'Lab',
    orderCode: 'HBA1C'
  },
  lipids: {
    measure: 'Lipid Panel',
    priority: 'medium' as const,
    description: 'Annual lipid screening due',
    type: 'lab' as const,
    orderType: 'Lab',
    orderCode: 'LIPID'
  },
  tsh: {
    measure: 'Thyroid Function Test',
    priority: 'medium' as const,
    description: 'Annual thyroid screening due',
    type: 'lab' as const,
    orderType: 'Lab',
    orderCode: 'TSH'
  },
  cmp: {
    measure: 'Comprehensive Metabolic Panel',
    priority: 'medium' as const,
    description: 'Routine metabolic screening',
    type: 'lab' as const,
    orderType: 'Lab',
    orderCode: 'CMP'
  },

  // Imaging
  mammogram: {
    measure: 'Mammogram',
    priority: 'medium' as const,
    description: 'Due for routine mammogram',
    type: 'imaging' as const,
    orderType: 'Radiology',
    orderCode: 'MAMMO'
  },
  dexa: {
    measure: 'DEXA Scan',
    priority: 'medium' as const,
    description: 'Bone density screening due',
    type: 'imaging' as const,
    orderType: 'Radiology',
    orderCode: 'DEXA'
  },
  chest_xray: {
    measure: 'Chest X-Ray',
    priority: 'medium' as const,
    description: 'Annual chest x-ray due',
    type: 'imaging' as const,
    orderType: 'Radiology',
    orderCode: 'CXR'
  },
  echo: {
    measure: 'Echocardiogram',
    priority: 'high' as const,
    description: 'Cardiac function assessment needed',
    type: 'imaging' as const,
    orderType: 'Cardiology',
    orderCode: 'ECHO'
  },

  // Screenings
  colonoscopy: {
    measure: 'Colonoscopy Screening',
    priority: 'medium' as const,
    description: 'Due for routine colonoscopy',
    type: 'procedure' as const,
    orderType: 'Procedure',
    orderCode: 'COLON'
  },
  eye_exam: {
    measure: 'Diabetic Eye Exam',
    priority: 'medium' as const,
    description: 'Annual diabetic retinopathy screening',
    type: 'referral' as const,
    orderType: 'Referral',
    orderCode: 'EYEREF'
  },
  spirometry: {
    measure: 'Pulmonary Function Test',
    priority: 'high' as const,
    description: 'Lung function assessment needed',
    type: 'procedure' as const,
    orderType: 'Procedure',
    orderCode: 'PFT'
  },

  // Vaccinations
  flu: {
    measure: 'Flu Vaccine',
    priority: 'medium' as const,
    description: 'Annual flu shot due',
    type: 'immunization' as const,
    orderType: 'Immunization',
    orderCode: 'FLU'
  },
  pneumonia: {
    measure: 'Pneumonia Vaccine',
    priority: 'medium' as const,
    description: 'Pneumococcal vaccination due',
    type: 'immunization' as const,
    orderType: 'Immunization',
    orderCode: 'PPSV23'
  },
  shingles: {
    measure: 'Shingles Vaccine',
    priority: 'medium' as const,
    description: 'Shingrix vaccination series due',
    type: 'immunization' as const,
    orderType: 'Immunization',
    orderCode: 'SHINGRIX'
  }
};

// Generate mock patient data
export const mockAnticipatoryPatients: PatientDetails[] = [
  // Next 24 Hours - Routine Patients (Day 1)
  {
    id: 'AMP001',
    mrn: 'MRN001',
    name: { first: 'Emma', last: 'Thompson' },
    dateOfBirth: '1980-05-15',
    gender: 'Female',
    demographics: {
      age: 44,
      gender: 'Female',
      ethnicity: 'White',
      language: 'English',
      maritalStatus: 'Married',
      employment: 'Employed',
      phone: '555-001-0001',
      email: 'emma.thompson@email.com',
      address: {
        street: '123 Oak Lane',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '123 Oak Lane',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-001-0001',
      email: 'emma.thompson@email.com'
    },
    insurance: {
      provider: 'Blue Cross',
      plan: 'PPO',
      memberId: 'BC123456789'
    },
    primaryCare: {
      provider: 'Dr. Sarah Miller',
      clinic: 'Primary Care Associates',
      lastVisit: '2024-10-15'
    },
    riskFactors: {
      level: 'low',
      score: 25,
      factors: [
        {
          name: 'Family History',
          severity: 'low',
          lastAssessed: '2024-01-15'
        }
      ],
      trending: 'stable'
    },
    conditions: [
      {
        ...commonConditions.hyperlipidemia,
        onsetDate: '2023-01-15',
        diagnosedDate: '2023-01-15',
        lastAssessed: '2024-01-15'
      }
    ],
    careGaps: [
      {
        id: 'CG001',
        ...commonCareGaps.lipids,
        dueDate: '2024-02-15',
        status: 'open'
      }
    ],
    encounters: [
      {
        id: 'E001',
        date: createDate(1, '09:00'),
        type: 'Annual Physical',
        provider: 'Dr. Sarah Miller',
        summary: 'Routine check-up',
        followUpNeeded: true,
        followUpDate: createDate(365),
        reason: 'Annual wellness visit'
      }
    ],
    metrics: {
      bloodPressure: {
        value: 118,
        unit: 'mmHg',
        date: '2024-01-15'
      },
      weight: {
        value: 145,
        unit: 'lbs',
        date: '2024-01-15'
      }
    },
    labs: [],
    alerts: [],
    recentActions: [],
    careTeam: [
      {
        id: 'CT001',
        name: 'Dr. Sarah Miller',
        role: 'Primary Care Physician',
        specialty: 'Internal Medicine',
        primary: true,
        phone: '555-111-2222',
        email: 'sarah.miller@clinic.com',
        details: {
          npi: '1234567890',
          practice: 'Primary Care Associates',
          languages: ['English'],
          expertise: ['Primary Care', 'Preventive Medicine']
        }
      }
    ]
  },
  // Next 24 Hours - Moderate Complexity
  {
    id: 'AMP002',
    mrn: 'MRN002',
    name: { first: 'Michael', last: 'Chen' },
    dateOfBirth: '1965-08-22',
    gender: 'Male',
    demographics: {
      age: 59,
      gender: 'Male',
      ethnicity: 'Asian',
      language: 'English',
      maritalStatus: 'Married',
      employment: 'Employed',
      phone: '555-001-0002',
      email: 'michael.chen@email.com',
      address: {
        street: '456 Maple Drive',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '456 Maple Drive',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-001-0002',
      email: 'michael.chen@email.com'
    },
    insurance: {
      provider: 'Aetna',
      plan: 'HMO',
      memberId: 'AE987654321'
    },
    primaryCare: {
      provider: 'Dr. James Wilson',
      clinic: 'Family Health Center',
      lastVisit: '2024-01-10'
    },
    riskFactors: {
      level: 'medium',
      score: 45,
      factors: [
        {
          name: 'Hypertension',
          severity: 'medium',
          lastAssessed: '2024-01-10'
        },
        {
          name: 'Type 2 Diabetes',
          severity: 'medium',
          lastAssessed: '2024-01-10'
        }
      ],
      trending: 'stable'
    },
    conditions: [
      {
        ...commonConditions.hypertension,
        onsetDate: '2020-03-15',
        diagnosedDate: '2020-03-15',
        lastAssessed: '2024-01-10'
      },
      {
        ...commonConditions.diabetes,
        onsetDate: '2021-06-20',
        diagnosedDate: '2021-06-20',
        lastAssessed: '2024-01-10'
      }
    ],
    careGaps: [
      {
        id: 'CG001',
        ...commonCareGaps.a1c,
        dueDate: '2024-02-10',
        status: 'open'
      }
    ],
    encounters: [
      {
        id: 'E001',
        date: createDate(1, '10:30'),
        type: 'Follow-up Visit',
        provider: 'Dr. James Wilson',
        summary: 'Diabetes management',
        followUpNeeded: true,
        followUpDate: createDate(90),
        reason: 'Diabetes and blood pressure check'
      }
    ],
    metrics: {
      bloodPressure: {
        value: 138,
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
        id: 'L001',
        name: 'HbA1c',
        value: 7.2,
        unit: '%',
        date: '2024-01-10',
        status: 'abnormal',
        trend: 'stable',
        referenceRange: '4.0-5.6'
      }
    ],
    alerts: [],
    recentActions: [],
    careTeam: [
      {
        id: 'CT001',
        name: 'Dr. James Wilson',
        role: 'Primary Care Physician',
        specialty: 'Internal Medicine',
        primary: true,
        phone: '555-222-3333',
        email: 'james.wilson@clinic.com',
        details: {
          npi: '2345678901',
          practice: 'Family Health Center',
          languages: ['English'],
          expertise: ['Diabetes Management', 'Hypertension']
        }
      }
    ]
  },
  // Next 24 Hours - High Complexity
  {
    id: 'AMP003',
    mrn: 'MRN003',
    name: { first: 'Barbara', last: 'Martinez' },
    dateOfBirth: '1955-03-10',
    gender: 'Female',
    demographics: {
      age: 69,
      gender: 'Female',
      ethnicity: 'Hispanic',
      language: 'English',
      maritalStatus: 'Widowed',
      employment: 'Retired',
      phone: '555-001-0003',
      email: 'barbara.martinez@email.com',
      address: {
        street: '789 Pine Street',
        city: 'Anytown',
        state: 'CA',
        zip: '12345'
      }
    },
    address: {
      street: '789 Pine Street',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    },
    contact: {
      phone: '555-001-0003',
      email: 'barbara.martinez@email.com'
    },
    insurance: {
      provider: 'Medicare',
      plan: 'Part B',
      memberId: 'MC456789012'
    },
    primaryCare: {
      provider: 'Dr. Emily Chen',
      clinic: 'Senior Care Center',
      lastVisit: '2024-01-17'
    },
    riskFactors: {
      level: 'high',
      score: 75,
      factors: [
        {
          name: 'Congestive Heart Failure',
          severity: 'high',
          lastAssessed: '2024-01-17'
        },
        {
          name: 'Type 2 Diabetes',
          severity: 'high',
          lastAssessed: '2024-01-17'
        },
        {
          name: 'Chronic Kidney Disease',
          severity: 'medium',
          lastAssessed: '2024-01-17'
        }
      ],
      trending: 'up'
    },
    conditions: [
      {
        id: 'CHF',
        code: 'I50.9',
        name: 'Congestive Heart Failure',
        status: 'active',
        onsetDate: '2018-05-15',
        diagnosedDate: '2018-05-15',
        lastAssessed: '2024-01-17',
        controlStatus: 'uncontrolled'
      },
      {
        ...commonConditions.diabetes,
        onsetDate: '2010-08-20',
        diagnosedDate: '2010-08-20',
        lastAssessed: '2024-01-17',
        controlStatus: 'uncontrolled'
      }
    ],
    careGaps: [
      {
        id: 'CG001',
        measure: 'Echocardiogram',
        priority: 'high',
        dueDate: '2024-02-17',
        status: 'open',
        description: 'Annual cardiac function assessment'
      },
      {
        id: 'CG002',
        ...commonCareGaps.a1c,
        dueDate: '2024-02-01',
        status: 'open'
      }
    ],
    encounters: [
      {
        id: 'E001',
        date: createDate(1, '14:00'),
        type: 'Comprehensive Visit',
        provider: 'Dr. Emily Chen',
        summary: 'Multiple conditions follow-up',
        followUpNeeded: true,
        followUpDate: createDate(30),
        reason: 'CHF and diabetes management'
      }
    ],
    metrics: {
      bloodPressure: {
        value: 145,
        unit: 'mmHg',
        date: '2024-01-17'
      },
      weight: {
        value: 165,
        unit: 'lbs',
        date: '2024-01-17'
      }
    },
    labs: [
      {
        id: 'L001',
        name: 'BNP',
        value: 450,
        unit: 'pg/mL',
        date: '2024-01-17',
        status: 'critical',
        trend: 'up',
        referenceRange: '<100'
      },
      {
        id: 'L002',
        name: 'HbA1c',
        value: 8.5,
        unit: '%',
        date: '2024-01-17',
        status: 'critical',
        trend: 'up',
        referenceRange: '4.0-5.6'
      }
    ],
    alerts: [
      {
        id: 'A001',
        type: 'warning',
        message: 'Elevated BNP levels',
        date: '2024-01-17',
        status: 'active',
        category: 'Clinical'
      }
    ],
    recentActions: [],
    careTeam: [
      {
        id: 'CT001',
        name: 'Dr. Emily Chen',
        role: 'Primary Care Physician',
        specialty: 'Internal Medicine',
        primary: true,
        phone: '555-333-4444',
        email: 'emily.chen@clinic.com',
        details: {
          npi: '3456789012',
          practice: 'Senior Care Center',
          languages: ['English', 'Mandarin'],
          expertise: ['Geriatrics', 'Heart Failure']
        }
      }
    ]
  }
,
// Next Week - Routine Patients (Day 4)
{
  id: 'AMP004',
  mrn: 'MRN004',
  name: { first: 'Robert', last: 'Anderson' },
  dateOfBirth: '1975-09-12',
  gender: 'Male',
  demographics: {
    age: 49,
    gender: 'Male',
    ethnicity: 'White',
    language: 'English',
    maritalStatus: 'Single',
    employment: 'Employed',
    phone: '555-001-0004',
    email: 'robert.anderson@email.com',
    address: {
      street: '567 Birch Road',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    }
  },
  address: {
    street: '567 Birch Road',
    city: 'Anytown',
    state: 'CA',
    zip: '12345'
  },
  contact: {
    phone: '555-001-0004',
    email: 'robert.anderson@email.com'
  },
  insurance: {
    provider: 'United Healthcare',
    plan: 'PPO',
    memberId: 'UH789012345'
  },
  primaryCare: {
    provider: 'Dr. Thomas Brown',
    clinic: 'Wellness Medical Group',
    lastVisit: '2023-10-15'
  },
  riskFactors: {
    level: 'low',
    score: 20,
    factors: [],
    trending: 'stable'
  },
  conditions: [],
  careGaps: [
    {
      id: 'CG001',
      measure: 'Physical Exam',
      priority: 'medium',
      dueDate: '2024-02-15',
      status: 'open',
      description: 'Annual wellness visit due'
    }
  ],
  encounters: [
    {
      id: 'E001',
      date: createDate(4, '09:30'),
      type: 'Annual Physical',
      provider: 'Dr. Thomas Brown',
      summary: 'Routine wellness visit',
      followUpNeeded: true,
      followUpDate: createDate(365),
      reason: 'Annual physical examination'
    }
  ],
  metrics: {
    bloodPressure: {
      value: 122,
      unit: 'mmHg',
      date: '2023-10-15'
    },
    weight: {
      value: 175,
      unit: 'lbs',
      date: '2023-10-15'
    }
  },
  labs: [],
  alerts: [],
  recentActions: [],
  careTeam: [
    {
      id: 'CT001',
      name: 'Dr. Thomas Brown',
      role: 'Primary Care Physician',
      specialty: 'Family Medicine',
      primary: true,
      phone: '555-444-5555',
      email: 'thomas.brown@clinic.com',
      details: {
        npi: '4567890123',
        practice: 'Wellness Medical Group',
        languages: ['English'],
        expertise: ['Primary Care', 'Preventive Medicine']
      }
    }
  ]
},

// Next Week - Moderate Complexity (Day 5)
{
  id: 'AMP005',
  mrn: 'MRN005',
  name: { first: 'Linda', last: 'Garcia' },
  dateOfBirth: '1968-11-30',
  gender: 'Female',
  demographics: {
    age: 56,
    gender: 'Female',
    ethnicity: 'Hispanic',
    language: 'English',
    maritalStatus: 'Married',
    employment: 'Employed',
    phone: '555-001-0005',
    email: 'linda.garcia@email.com',
    address: {
      street: '890 Cedar Lane',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    }
  },
  address: {
    street: '890 Cedar Lane',
    city: 'Anytown',
    state: 'CA',
    zip: '12345'
  },
  contact: {
    phone: '555-001-0005',
    email: 'linda.garcia@email.com'
  },
  insurance: {
    provider: 'Blue Shield',
    plan: 'PPO',
    memberId: 'BS567890123'
  },
  primaryCare: {
    provider: 'Dr. Maria Rodriguez',
    clinic: 'Community Health Partners',
    lastVisit: '2024-01-05'
  },
  riskFactors: {
    level: 'medium',
    score: 55,
    factors: [
      {
        name: 'Hypertension',
        severity: 'medium',
        lastAssessed: '2024-01-05'
      },
      {
        name: 'Obesity',
        severity: 'medium',
        lastAssessed: '2024-01-05'
      }
    ],
    trending: 'stable'
  },
  conditions: [
    {
      ...commonConditions.hypertension,
      onsetDate: '2019-07-15',
      diagnosedDate: '2019-07-15',
      lastAssessed: '2024-01-05'
    }
  ],
  careGaps: [
    {
      id: 'CG001',
      measure: 'Blood Pressure Check',
      priority: 'high',
      dueDate: '2024-02-05',
      status: 'open',
      description: 'Monthly blood pressure monitoring'
    },
    {
      id: 'CG002',
      ...commonCareGaps.mammogram,
      dueDate: '2024-03-01',
      status: 'open'
    }
  ],
  encounters: [
    {
      id: 'E001',
      date: createDate(5, '11:00'),
      type: 'Follow-up Visit',
      provider: 'Dr. Maria Rodriguez',
      summary: 'Hypertension follow-up',
      followUpNeeded: true,
      followUpDate: createDate(30),
      reason: 'Blood pressure check and medication review'
    }
  ],
  metrics: {
    bloodPressure: {
      value: 142,
      unit: 'mmHg',
      date: '2024-01-05'
    },
    weight: {
      value: 195,
      unit: 'lbs',
      date: '2024-01-05'
    }
  },
  labs: [],
  alerts: [],
  recentActions: [],
  careTeam: [
    {
      id: 'CT001',
      name: 'Dr. Maria Rodriguez',
      role: 'Primary Care Physician',
      specialty: 'Internal Medicine',
      primary: true,
      phone: '555-555-6666',
      email: 'maria.rodriguez@clinic.com',
      details: {
        npi: '5678901234',
        practice: 'Community Health Partners',
        languages: ['English', 'Spanish'],
        expertise: ['Hypertension', 'Women\'s Health']
      }
    }
  ]
},

// Next Month - Complex Patient (Day 15)
{
  id: 'AMP006',
  mrn: 'MRN006',
  name: { first: 'William', last: 'Lee' },
  dateOfBirth: '1952-04-25',
  gender: 'Male',
  demographics: {
    age: 72,
    gender: 'Male',
    ethnicity: 'Asian',
    language: 'English',
    maritalStatus: 'Married',
    employment: 'Retired',
    phone: '555-001-0006',
    email: 'william.lee@email.com',
    address: {
      street: '123 Spruce Court',
      city: 'Anytown',
      state: 'CA',
      zip: '12345'
    }
  },
  address: {
    street: '123 Spruce Court',
    city: 'Anytown',
    state: 'CA',
    zip: '12345'
  },
  contact: {
    phone: '555-001-0006',
    email: 'william.lee@email.com'
  },
  insurance: {
    provider: 'Medicare',
    plan: 'Advantage',
    memberId: 'MA678901234'
  },
  primaryCare: {
    provider: 'Dr. David Kim',
    clinic: 'Senior Wellness Center',
    lastVisit: '2024-01-10'
  },
  riskFactors: {
    level: 'high',
    score: 85,
    factors: [
      {
        name: 'COPD',
        severity: 'high',
        lastAssessed: '2024-01-10'
      },
      {
        name: 'Coronary Artery Disease',
        severity: 'high',
        lastAssessed: '2024-01-10'
      },
      {
        name: 'Type 2 Diabetes',
        severity: 'medium',
        lastAssessed: '2024-01-10'
      }
    ],
    trending: 'up'
  },
  conditions: [
    {
      id: 'COPD',
      code: 'J44.9',
      name: 'COPD',
      status: 'active',
      onsetDate: '2015-03-10',
      diagnosedDate: '2015-03-10',
      lastAssessed: '2024-01-10',
      controlStatus: 'uncontrolled'
    },
    {
      id: 'CAD',
      code: 'I25.10',
      name: 'Coronary Artery Disease',
      status: 'active',
      onsetDate: '2018-06-15',
      diagnosedDate: '2018-06-15',
      lastAssessed: '2024-01-10',
      controlStatus: 'uncontrolled'
    },
    {
      ...commonConditions.diabetes,
      onsetDate: '2016-09-20',
      diagnosedDate: '2016-09-20',
      lastAssessed: '2024-01-10',
      controlStatus: 'uncontrolled'
    }
  ],
  careGaps: [
    {
      id: 'CG001',
      ...commonCareGaps.spirometry,
      dueDate: '2024-02-10',
      status: 'open'
    },
    {
      id: 'CG002',
      ...commonCareGaps.echo,
      dueDate: '2024-02-15',
      status: 'open'
    },
    {
      id: 'CG003',
      ...commonCareGaps.a1c,
      dueDate: '2024-02-10',
      status: 'open'
    }
  ],
  encounters: [
    {
      id: 'E001',
      date: createDate(15, '10:00'),
      type: 'Comprehensive Visit',
      provider: 'Dr. David Kim',
      summary: 'Multiple conditions follow-up',
      followUpNeeded: true,
      followUpDate: createDate(30),
      reason: 'COPD, CAD, and diabetes management'
    }
  ],
  metrics: {
    bloodPressure: {
      value: 148,
      unit: 'mmHg',
      date: '2024-01-10'
    },
    weight: {
      value: 160,
      unit: 'lbs',
      date: '2024-01-10'
    }
  },
  labs: [
    {
      id: 'L001',
      name: 'HbA1c',
      value: 7.8,
      unit: '%',
      date: '2024-01-10',
      status: 'abnormal',
      trend: 'up',
      referenceRange: '4.0-5.6'
    }
  ],
  alerts: [
    {
      id: 'A001',
      type: 'warning',
      message: 'Worsening COPD symptoms',
      date: '2024-01-10',
      status: 'active',
      category: 'Clinical'
    }
  ],
  recentActions: [],
  careTeam: [
    {
      id: 'CT001',
      name: 'Dr. David Kim',
      role: 'Primary Care Physician',
      specialty: 'Internal Medicine',
      primary: true,
      phone: '555-666-7777',
      email: 'david.kim@clinic.com',
      details: {
        npi: '6789012345',
        practice: 'Senior Wellness Center',
        languages: ['English', 'Korean'],
        expertise: ['Geriatrics', 'Pulmonology']
      }
    }
  ]
}
];
