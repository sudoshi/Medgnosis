import type { PatientDetails } from '@/types/patient';

// Helper function to generate random date within a range
function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Helper function to pick random items from an array
function pickRandom<T>(arr: T[], count: number = 1): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Common data pools
const firstNames: string[] = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph',
  'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy',
  'Daniel', 'Lisa', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra',
  'Donald', 'Ashley', 'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna',
  'Joshua', 'Michelle', 'Kenneth', 'Carol', 'Kevin', 'Amanda', 'Brian', 'Dorothy',
  'George', 'Melissa', 'Edward', 'Deborah', 'Ronald', 'Stephanie'
];

const lastNames: string[] = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts'
];

interface ConditionTemplate {
  name: string;
  category: string;
  relatedLabs: string[];
  commonMedications: string[];
  complications: string[];
  symptoms: string[];
  targetGoals: Record<string, string>;
}

const conditionTemplates: ConditionTemplate[] = [
  {
    name: 'Type 2 Diabetes',
    category: 'chronic',
    relatedLabs: ['HbA1c', 'Glucose', 'Lipid Panel'],
    commonMedications: ['Metformin', 'Glipizide', 'Januvia'],
    complications: ['Neuropathy', 'Retinopathy', 'Nephropathy'],
    symptoms: ['Increased thirst', 'Frequent urination', 'Fatigue'],
    targetGoals: {
      'HbA1c': '<7.0%',
      'Blood Pressure': '<140/90',
      'LDL Cholesterol': '<100'
    }
  },
  {
    name: 'Hypertension',
    category: 'chronic',
    relatedLabs: ['Blood Pressure', 'Creatinine', 'Potassium'],
    commonMedications: ['Lisinopril', 'Amlodipine', 'Hydrochlorothiazide'],
    complications: ['Heart Disease', 'Stroke', 'Kidney Disease'],
    symptoms: ['Headaches', 'Shortness of breath', 'Dizziness'],
    targetGoals: {
      'Systolic BP': '<130',
      'Diastolic BP': '<80'
    }
  },
  {
    name: 'COPD',
    category: 'chronic',
    relatedLabs: ['Spirometry', 'Pulse Oximetry', 'ABG'],
    commonMedications: ['Albuterol', 'Tiotropium', 'Fluticasone'],
    complications: ['Respiratory Failure', 'Pneumonia', 'Heart Problems'],
    symptoms: ['Shortness of breath', 'Chronic cough', 'Wheezing'],
    targetGoals: {
      'FEV1': '>60%',
      'O2 Saturation': '>92%'
    }
  }
];

interface CareGapTemplate {
  measure: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  frequency: number;
}

const careGapTemplates: CareGapTemplate[] = [
  {
    measure: 'Annual Wellness Visit',
    priority: 'medium',
    category: 'preventive',
    frequency: 365
  },
  {
    measure: 'Diabetes A1C Test',
    priority: 'high',
    category: 'chronic',
    frequency: 90
  },
  {
    measure: 'Blood Pressure Check',
    priority: 'high',
    category: 'chronic',
    frequency: 90
  }
];

interface Provider {
  name: string;
  role: string;
  specialty: string;
  npi: string;
}

const providers: Provider[] = [
  {
    name: 'Dr. Sarah Johnson',
    role: 'Primary Care Physician',
    specialty: 'Internal Medicine',
    npi: '1234567890'
  },
  {
    name: 'Dr. Michael Chen',
    role: 'Primary Care Physician',
    specialty: 'Family Medicine',
    npi: '2345678901'
  },
  {
    name: 'Dr. Emily Rodriguez',
    role: 'Endocrinologist',
    specialty: 'Endocrinology',
    npi: '3456789012'
  }
];

function generatePatient(id: number): PatientDetails {
  const gender = Math.random() > 0.5 ? 'Male' : 'Female';
  const age = Math.floor(Math.random() * 40) + 45;
  const firstName = pickRandom(firstNames)[0];
  const lastName = pickRandom(lastNames)[0];

  const numConditions = Math.floor(Math.random() * 3) + 1;
  const selectedConditions = pickRandom(conditionTemplates, numConditions);

  const numCareGaps = Math.floor(Math.random() * 4);
  const relevantCareGaps = careGapTemplates.filter(gap =>
    selectedConditions.some(c => c.category === gap.category)
  );
  
  const careGaps = pickRandom(relevantCareGaps, numCareGaps).map((gap, index) => ({
    id: index + 1,
    measure: gap.measure,
    priority: gap.priority,
    dueDate: randomDate(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    ).toISOString(),
    status: 'open' as const,
    description: 'Due for preventive screening'
  }));

  const riskScore = Math.min(
    100,
    40 +
    selectedConditions.length * 10 +
    careGaps.length * 5 +
    (age > 65 ? 10 : 0)
  );

  const encounters = Array.from({ length: Math.floor(Math.random() * 3) + 1 }, (_, i) => ({
    id: i + 1,
    type: 'Office Visit',
    provider: pickRandom(providers)[0].name,
    date: randomDate(
      new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
      new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
    ).toISOString(),
    reason: 'Follow-up',
    summary: 'Routine follow-up visit for chronic conditions',
    followUpNeeded: true,
    followUpDate: randomDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    ).toISOString(),
    details: {
      vitals: {
        temperature: '98.6',
        heartRate: '72',
        respiratoryRate: '16',
        bloodPressure: '120/80',
        weight: '180',
        bmi: '24.5'
      }
    }
  }));

  const labs = selectedConditions.flatMap(condition =>
    condition.relatedLabs.map((lab, index) => ({
      id: index + 1,
      name: lab,
      value: '120',
      unit: 'mg/dL',
      date: randomDate(
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        new Date()
      ).toISOString(),
      status: (Math.random() > 0.7 ? 'abnormal' : 'normal') as 'abnormal' | 'normal',
      trend: (Math.random() > 0.5 ? 'improving' : 'worsening') as 'improving' | 'worsening',
      referenceRange: '70-99',
      components: [
        {
          name: lab,
          value: '120',
          unit: 'mg/dL',
          referenceRange: '70-99',
          status: Math.random() > 0.7 ? 'abnormal' : 'normal'
        }
      ]
    }))
  );

  const conditions = selectedConditions.map((condition, index) => ({
    id: index + 1,
    name: condition.name,
    status: 'active' as const,
    diagnosedDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
    lastAssessed: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    controlStatus: (['controlled', 'uncontrolled', 'unknown'] as const)[Math.floor(Math.random() * 3)],
    details: {
      severity: ['Mild', 'Moderate', 'Severe'][Math.floor(Math.random() * 3)],
      complications: condition.complications,
      symptoms: condition.symptoms,
      targetGoals: condition.targetGoals
    }
  }));

  const primaryCare = pickRandom(providers.filter(p => p.role === 'Primary Care Physician'))[0];
  const specialists = pickRandom(
    providers.filter(p => p.role !== 'Primary Care Physician'),
    Math.floor(Math.random() * 2)
  );

  const careTeam = [
    {
      id: 1,
      name: primaryCare.name,
      role: primaryCare.role,
      specialty: primaryCare.specialty,
      phone: '(555) 555-0200',
      email: primaryCare.name.toLowerCase().replace(' ', '.') + '@healthcare.com',
      primary: true,
      details: {
        npi: primaryCare.npi,
        practice: 'Primary Care Associates',
        languages: ['English'],
        expertise: ['Primary Care', 'Preventive Medicine']
      }
    },
    ...specialists.map((specialist, index) => ({
      id: index + 2,
      name: specialist.name,
      role: specialist.role,
      specialty: specialist.specialty,
      phone: '(555) 555-0' + (300 + index),
      email: specialist.name.toLowerCase().replace(' ', '.') + '@healthcare.com',
      primary: false,
      details: {
        npi: specialist.npi,
        practice: 'Specialty Care Center',
        languages: ['English'],
        expertise: [specialist.specialty]
      }
    }))
  ];

  return {
    id,
    name: `${firstName} ${lastName}`,
    demographics: {
      age,
      gender,
      language: 'English',
      ethnicity: pickRandom(['Caucasian', 'African American', 'Hispanic', 'Asian', 'Other'])[0],
      address: '123 Main St, Anytown, USA',
      phone: '(555) 555-0100',
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`
    },
    riskFactors: {
      score: riskScore,
      level: riskScore >= 75 ? 'high' : riskScore >= 50 ? 'medium' : 'low',
      factors: selectedConditions.map(c => ({
        name: c.name,
        severity: (['high', 'medium', 'low'] as const)[Math.floor(Math.random() * 3)],
        lastAssessed: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
      })),
      trending: (['up', 'down', 'stable'] as const)[Math.floor(Math.random() * 3)]
    },
    conditions,
    careGaps,
    labs,
    encounters,
    careTeam,
    medications: [],
    programs: []
  };
}

export const mockPatientsList = Array.from({ length: 50 }, (_, i) => generatePatient(i + 1));

export interface CareList {
  id: string;
  name: string;
  description: string;
  type: 'manual' | 'measure-based';
  source?: {
    measureId?: string;
    criteria?: any;
  };
  patients: string[];
  provider: string;
  created: string;
  updated: string;
  tags: string[];
  status: 'active' | 'archived';
  collaborators?: {
    providerId: string;
    role: 'viewer' | 'editor';
  }[];
}

export const mockCareLists: CareList[] = [
  {
    id: '1',
    name: 'Uncontrolled Diabetes',
    description: 'Patients with HbA1c > 9.0% requiring intensive management',
    type: 'measure-based',
    source: {
      measureId: 'CMS122v3',
      criteria: {
        conditions: ['Type 2 Diabetes'],
        labs: {
          HbA1c: '>9.0%'
        }
      }
    },
    patients: mockPatientsList
      .filter(p => p.conditions.some(c => c.name === 'Type 2 Diabetes'))
      .slice(0, 10)
      .map(p => p.id.toString()),
    provider: providers[0].npi,
    created: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated: new Date().toISOString(),
    tags: ['diabetes', 'high-risk', 'care-management'],
    status: 'active'
  },
  {
    id: '2',
    name: 'Complex Care Coordination',
    description: 'Patients with multiple chronic conditions requiring specialist coordination',
    type: 'manual',
    patients: mockPatientsList
      .filter(p => p.conditions.length >= 3)
      .slice(0, 15)
      .map(p => p.id.toString()),
    provider: providers[0].npi,
    created: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    updated: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['complex', 'coordination', 'multi-condition'],
    status: 'active',
    collaborators: [
      {
        providerId: providers[2].npi,
        role: 'editor'
      }
    ]
  }
];
