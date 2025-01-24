import type { QualityMeasure } from '@/types/measure';

export const mockMeasures: QualityMeasure[] = [
  {
    id: 'HTN-001',
    title: 'Blood Pressure Control',
    implementation: {
      category: 'NQF',
      code: 'NQF-0018',
      version: '4.0.0',
      status: 'active',
      effectiveDate: '2024-01-01',
      lastReviewDate: '2023-12-15'
    },
    steward: 'National Committee for Quality Assurance',
    domain: 'chronic',
    type: 'outcome',
    clinicalFocus: 'hypertension',
    description: 'Percentage of patients 18-85 years of age who had a diagnosis of hypertension and whose blood pressure was adequately controlled during the measurement period.',
    rationale: 'High blood pressure is a major modifiable risk factor for cardiovascular disease, stroke, and kidney disease.',
    guidance: 'Most recent BP reading during the measurement year. If no BP is recorded during the measurement year, assume that the patient is not controlled.',
    clinicalRecommendation: 'The U.S. Preventive Services Task Force (USPSTF) recommends screening for high blood pressure in adults aged 18 years or older.',
    valuesets: [
      {
        id: 'HTN-DX',
        oid: '2.16.840.1.113883.3.464.1003.104.12.1011',
        name: 'Hypertension Diagnosis',
        concepts: [
          {
            code: 'I10',
            system: 'ICD-10',
            display: 'Essential (primary) hypertension'
          }
        ]
      }
    ],
    criteria: {
      initialPopulation: {
        demographics: {
          ageMin: 18,
          ageMax: 85
        },
        conditions: ['2.16.840.1.113883.3.464.1003.104.12.1011'],
        timeframe: {
          type: 'rolling',
          lookback: 365
        }
      },
      denominator: {
        conditions: ['2.16.840.1.113883.3.464.1003.104.12.1011'],
        procedures: [],
        observations: []
      },
      numerator: {
        results: [
          {
            type: 'systolic',
            value: '140',
            comparator: '<'
          },
          {
            type: 'diastolic',
            value: '90',
            comparator: '<'
          }
        ],
        timeframe: {
          before: 365,
          after: 0
        }
      }
    },
    performance: {
      target: 75,
      benchmark: 85,
      improvement: 5
    }
  },
  {
    id: 'DM-001',
    title: 'Diabetes: HbA1c Control',
    implementation: {
      category: 'eCQM',
      code: 'CMS122v3',
      version: '3.0.0',
      status: 'active',
      effectiveDate: '2024-01-01',
      lastReviewDate: '2023-12-15'
    },
    steward: 'National Committee for Quality Assurance',
    domain: 'chronic',
    type: 'outcome',
    clinicalFocus: 'diabetes',
    description: 'Percentage of patients 18-75 years of age with diabetes who had hemoglobin A1c > 9.0% during the measurement period.',
    rationale: 'Diabetes is a major risk factor for heart disease, stroke, and kidney disease. HbA1c control is essential for preventing complications.',
    guidance: 'Most recent HbA1c reading during the measurement year. If no HbA1c is recorded during the measurement year, assume that the patient is not controlled.',
    valuesets: [
      {
        id: 'DM-DX',
        oid: '2.16.840.1.113883.3.464.1003.103.12.1001',
        name: 'Diabetes Diagnosis',
        concepts: [
          {
            code: 'E11',
            system: 'ICD-10',
            display: 'Type 2 diabetes mellitus'
          }
        ]
      }
    ],
    criteria: {
      initialPopulation: {
        demographics: {
          ageMin: 18,
          ageMax: 75
        },
        conditions: ['2.16.840.1.113883.3.464.1003.103.12.1001'],
        timeframe: {
          type: 'rolling',
          lookback: 365
        }
      },
      denominator: {
        conditions: ['2.16.840.1.113883.3.464.1003.103.12.1001'],
        procedures: [],
        observations: []
      },
      numerator: {
        results: [
          {
            type: 'HbA1c',
            value: '9.0',
            comparator: '<='
          }
        ],
        timeframe: {
          before: 365,
          after: 0
        }
      }
    },
    performance: {
      target: 70,
      benchmark: 80,
      improvement: 5
    }
  }
];
