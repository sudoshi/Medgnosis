import type { PatientDetails } from '@/types/patient';

const conditions = [
  { 
    name: 'Type 2 Diabetes',
    details: {
      severity: 'Moderate',
      targetGoals: {
        'HbA1c_target': '<7.0%',
        'blood_pressure_target': '<140/90'
      }
    }
  },
  {
    name: 'Hypertension',
    details: {
      severity: 'Mild',
      targetGoals: {
        'blood_pressure_target': '<130/80'
      }
    }
  },
  {
    name: 'COPD',
    details: {
      severity: 'Moderate',
      fev1: '65%',
      exacerbations: '2 per year',
      symptoms: ['Shortness of breath', 'Wheezing']
    }
  },
  {
    name: 'Congestive Heart Failure',
    details: {
      severity: 'Moderate',
      ejectionFraction: '40%',
      complications: ['Fluid retention']
    }
  },
  {
    name: 'Chronic Kidney Disease',
    details: {
      severity: 'Moderate',
      riskFactors: ['Hypertension', 'Diabetes']
    }
  },
  {
    name: 'Depression',
    details: {
      severity: 'Moderate',
      symptoms: ['Low mood', 'Fatigue']
    }
  },
  {
    name: 'Obesity',
    details: {
      severity: 'Moderate',
      complications: ['Joint pain', 'Sleep apnea']
    }
  },
  {
    name: 'Asthma',
    details: {
      severity: 'Moderate',
      symptoms: ['Wheezing', 'Shortness of breath']
    }
  },
  {
    name: 'Coronary Artery Disease',
    details: {
      severity: 'Moderate',
      complications: ['Angina']
    }
  },
  {
    name: 'Atrial Fibrillation',
    details: {
      severity: 'Moderate',
      complications: ['Stroke risk']
    }
  }
];

const generatePatient = (id: number): PatientDetails => {
  const riskScore = Math.floor(Math.random() * 100);
  const riskLevel = riskScore >= 75 ? 'high' : riskScore >= 50 ? 'medium' : 'low';
  const numConditions = Math.floor(Math.random() * 4) + 1;
  const patientConditions = [...conditions]
    .sort(() => Math.random() - 0.5)
    .slice(0, numConditions);

  const firstName = [
    'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
    'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph',
    'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy',
    'Daniel', 'Lisa', 'Matthew'
  ][id % 25];

  const lastName = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
    'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
    'White', 'Harris'
  ][id % 25];

  const numCareGaps = Math.floor(Math.random() * 4);
  const careGaps = Array.from({ length: numCareGaps }, (_, i) => ({
    id: i + 1,
    measure: [
      'Annual Wellness Visit',
      'Diabetes A1C Test',
      'Mammogram Screening',
      'Colorectal Cancer Screening',
      'Blood Pressure Check',
      'Eye Examination',
      'Pneumonia Vaccination',
      'Depression Screening'
    ][Math.floor(Math.random() * 8)],
    priority: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)] as 'high' | 'medium' | 'low',
    dueDate: new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
    status: ['open', 'in_progress', 'completed'][0] as 'open' | 'in_progress' | 'completed',
    description: 'Due for preventive screening'
  }));

  const age = Math.floor(Math.random() * 40) + 45; // Ages 45-85
  const lastEncounterDays = Math.floor(Math.random() * 60);

  return {
    id,
    name: `${firstName} ${lastName}`,
    demographics: {
      age,
      gender: id % 2 === 0 ? 'Male' : 'Female',
      language: 'English',
      ethnicity: ['Caucasian', 'African American', 'Hispanic', 'Asian', 'Other'][Math.floor(Math.random() * 5)],
      address: '123 Main St, Anytown, USA',
      phone: '(555) 555-0100',
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`
    },
    riskFactors: {
      score: riskScore,
      level: riskLevel,
      factors: patientConditions.map(c => ({
        name: c.name,
        severity: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)] as 'high' | 'medium' | 'low',
        lastAssessed: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
      })),
      trending: ['up', 'down', 'stable'][Math.floor(Math.random() * 3)] as 'up' | 'down' | 'stable'
    },
    conditions: patientConditions.map((c, i) => ({
      id: i + 1,
      name: c.name,
      status: ['active', 'resolved', 'inactive'][0] as 'active' | 'resolved' | 'inactive',
      diagnosedDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      lastAssessed: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      controlStatus: ['controlled', 'uncontrolled', 'unknown'][Math.floor(Math.random() * 3)] as 'controlled' | 'uncontrolled' | 'unknown',
      details: {
        ...c.details,
        targetGoals: c.details.targetGoals ? Object.fromEntries(
          Object.entries(c.details.targetGoals).map(([k, v]) => [k, String(v)])
        ) : undefined
      }
    })),
    careGaps,
    labs: [
      {
        id: 1,
        name: 'Comprehensive Metabolic Panel',
        value: 'See components',
        date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: ['normal', 'abnormal'][Math.floor(Math.random() * 2)] as 'normal' | 'abnormal',
        components: [
          { name: 'Glucose', value: '120', unit: 'mg/dL', referenceRange: '70-99', status: 'abnormal' },
          { name: 'Creatinine', value: '1.1', unit: 'mg/dL', referenceRange: '0.6-1.2', status: 'normal' }
        ]
      }
    ],
    encounters: [
      {
        id: 1,
        type: 'Office Visit',
        provider: 'Dr. Sarah Johnson',
        date: new Date(Date.now() - lastEncounterDays * 24 * 60 * 60 * 1000).toISOString(),
        reason: 'Follow-up',
        summary: 'Routine follow-up visit for chronic conditions',
        followUpNeeded: true,
        followUpDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      }
    ],
    careTeam: [
      {
        id: 1,
        name: 'Dr. Sarah Johnson',
        role: 'Primary Care Physician',
        specialty: 'Internal Medicine',
        phone: '(555) 555-0200',
        email: 'sarah.johnson@healthcare.com',
        primary: true
      }
    ],
    medications: [],
    programs: []
  };
};

export const mockPatientsList = Array.from({ length: 25 }, (_, i) => generatePatient(i + 1));
