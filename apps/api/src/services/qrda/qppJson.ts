// =============================================================================
// Medgnosis API — QPP (MIPS/APP) JSON submission builder
// The QPP Submissions API performance-data shape for eCQM (electronicHealthRecord)
// quality measurements. https://cmsgov.github.io/qpp-submissions-docs/
// =============================================================================

import type { MeasurePopulationCounts } from './qrdaCat3.js';

export interface QppMeasurement {
  measureId: string;
  value: {
    isEndToEndReported: boolean;
    performanceMet: number;
    eligiblePopulation: number;
    eligiblePopulationExclusion: number;
    eligiblePopulationException: number;
    performanceNotMet: number;
  };
}

export interface QppSubmission {
  performanceYear: number;
  measurementSets: Array<{
    category: 'quality';
    submissionMethod: 'electronicHealthRecord';
    measurements: QppMeasurement[];
  }>;
}

/** Strip an eCQM id like "CMS122v13" to the QPP numeric measureId "122". */
export function qppMeasureId(eCqmId: string): string {
  const m = /CMS0*(\d+)/i.exec(eCqmId);
  return m ? m[1]! : eCqmId;
}

export function buildQppSubmission(
  performanceYear: number,
  measures: MeasurePopulationCounts[],
): QppSubmission {
  return {
    performanceYear,
    measurementSets: [
      {
        category: 'quality',
        submissionMethod: 'electronicHealthRecord',
        measurements: measures.map((m) => ({
          measureId: qppMeasureId(m.eCqmId),
          value: {
            isEndToEndReported: true,
            performanceMet: m.numerator,
            eligiblePopulation: m.denominator,
            eligiblePopulationExclusion: m.denominatorExclusion,
            eligiblePopulationException: 0,
            performanceNotMet: Math.max(
              0,
              m.denominator - m.denominatorExclusion - m.numerator,
            ),
          },
        })),
      },
    ],
  };
}
