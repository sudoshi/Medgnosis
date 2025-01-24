import type { QualityMeasure } from '@/types/measure';

export const mockMeasures: QualityMeasure[] = [
  {
    id: 'CMS146v3',
    title: 'Appropriate Testing for Children with Pharyngitis',
    version: '3',
    steward: 'NCQA',
    domain: 'acute',
    type: 'process',
    description: 'Percentage of children 2-18 years of age who were diagnosed with pharyngitis, dispensed an antibiotic and received a group A streptococcus (strep) test for the episode.',
    rationale: 'Pharyngitis is a common condition where antibiotic treatment should only be prescribed after confirming streptococcal infection through appropriate testing.',
    guidance: 'This eCQM is an episode-based measure. Each instance of pharyngitis with an antibiotic prescription is evaluated for strep testing.',
    clinicalRecommendation: 'The IDSA guidelines recommend that patients with pharyngitis be tested for group A streptococcus to establish the diagnosis.',
    valuesets: [
      {
        id: 'pharyngitis',
        oid: '2.16.840.1.113883.3.464.1003.102.12.1011',
        name: 'Acute Pharyngitis',
        concepts: [
          { code: 'J02.0', system: 'ICD-10', display: 'Streptococcal pharyngitis' },
          { code: 'J02.9', system: 'ICD-10', display: 'Acute pharyngitis, unspecified' }
        ]
      }
    ],
    criteria: {
      initialPopulation: {
        demographics: {
          ageMin: 2,
          ageMax: 18
        },
        conditions: ['2.16.840.1.113883.3.464.1003.102.12.1011'],
        encounters: ['2.16.840.1.113883.3.464.1003.101.12.1061'],
        timeframe: {
          type: 'rolling',
          lookback: 365
        }
      },
      denominatorExclusions: {
        conditions: ['2.16.840.1.113883.3.464.1003.102.12.1012'],
        medications: ['2.16.840.1.113883.3.464.1003.196.12.1001'],
        timeframe: 30
      },
      numerator: {
        tests: ['2.16.840.1.113883.3.464.1003.198.12.1012'],
        timeframe: {
          before: 3,
          after: 3
        }
      }
    },
    performance: {
      target: 80,
      benchmark: 85,
      improvement: 5
    }
  },
  {
    id: 'CMS122v3',
    title: 'Diabetes: Hemoglobin A1c Poor Control',
    version: '3',
    steward: 'NCQA',
    domain: 'chronic',
    type: 'outcome',
    description: 'Percentage of patients 18-75 years of age with diabetes who had hemoglobin A1c > 9.0% during the measurement period.',
    rationale: 'Diabetes is a chronic disease that requires effective management to prevent complications. HbA1c monitoring is essential.',
    guidance: 'Patient is numerator compliant if most recent HbA1c level is > 9%, the most recent HbA1c result is missing, or there are no HbA1c tests performed during the measurement period.',
    clinicalRecommendation: 'The American Diabetes Association recommends regular HbA1c monitoring with a target of < 7% for most adults.',
    valuesets: [
      {
        id: 'diabetes',
        oid: '2.16.840.1.113883.3.464.1003.103.12.1001',
        name: 'Diabetes',
        concepts: [
          { code: 'E11.9', system: 'ICD-10', display: 'Type 2 diabetes mellitus without complications' }
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
          type: 'annual',
          lookback: 365
        }
      },
      numerator: {
        tests: ['2.16.840.1.113883.3.464.1003.198.12.1013'],
        results: [{
          type: 'HbA1c',
          value: '9.0',
          comparator: '>'
        }],
        timeframe: {
          before: 90,
          after: 0
        }
      }
    },
    performance: {
      target: 15, // Lower is better for this measure
      benchmark: 10,
      improvement: -2
    }
  },
  {
    id: 'CMS165v3',
    title: 'Controlling High Blood Pressure',
    version: '3',
    steward: 'NCQA',
    domain: 'chronic',
    type: 'outcome',
    description: 'Percentage of patients 18-85 years of age who had a diagnosis of hypertension and whose blood pressure was adequately controlled during the measurement period.',
    rationale: 'High blood pressure is a major modifiable risk factor for cardiovascular disease and stroke.',
    guidance: 'Most recent BP reading during the measurement year. If multiple readings on same day, use lowest systolic and lowest diastolic.',
    clinicalRecommendation: 'The ACC/AHA guidelines recommend BP < 130/80 mmHg for most adults with hypertension.',
    valuesets: [
      {
        id: 'hypertension',
        oid: '2.16.840.1.113883.3.464.1003.104.12.1011',
        name: 'Essential Hypertension',
        concepts: [
          { code: 'I10', system: 'ICD-10', display: 'Essential (primary) hypertension' }
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
          type: 'annual',
          lookback: 365
        }
      },
      numerator: {
        tests: ['2.16.840.1.113883.3.464.1003.198.12.1014'],
        results: [
          {
            type: 'systolic',
            value: '130',
            comparator: '<'
          },
          {
            type: 'diastolic',
            value: '80',
            comparator: '<'
          }
        ],
        timeframe: {
          before: 0,
          after: 0
        }
      }
    },
    performance: {
      target: 75,
      benchmark: 80,
      improvement: 3
    }
  }
];

export function getMeasureById(id: string): QualityMeasure | undefined {
  return mockMeasures.find(m => m.id === id);
}

export function filterMeasures(filters: {
  domain?: string;
  type?: string;
  search?: string;
  status?: string;
}): QualityMeasure[] {
  return mockMeasures.filter(measure => {
    if (filters.domain && measure.domain !== filters.domain) return false;
    if (filters.type && measure.type !== filters.type) return false;
    if (filters.search) {
      const search = filters.search.toLowerCase();
      return (
        measure.id.toLowerCase().includes(search) ||
        measure.title.toLowerCase().includes(search) ||
        measure.description.toLowerCase().includes(search)
      );
    }
    return true;
  });
}
