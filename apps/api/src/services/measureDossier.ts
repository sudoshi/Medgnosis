// =============================================================================
// Medgnosis API — Measure dossier
// Assembles the per-measure transparency package: the FHIR artifact binding
// (migration 056), the VSAC value sets behind the measure with version pins,
// and bridge status. The published proof that a measure is defined, versioned,
// and traceable (Phase 1 Task 8 / Pillar "radical, shippable transparency").
// =============================================================================

import { sql } from '@medgnosis/db';
import {
  getMeasureValueSets,
  getMeasureBridgeStatus,
  type MeasureValueSet,
  type MeasureBridgeStatus,
} from './vsacService.js';
import { latestMeasureReport } from './measureReportStore.js';

export interface MeasureArtifact {
  ecqm_id: string | null;
  ecqm_version: string | null;
  fhir_measure_url: string | null;
  fhir_library_url: string | null;
  reporting_period_start: string | null;
  reporting_period_end: string | null;
  vsac_version_pins: Record<string, string>;
  status: string;
}

export interface MeasureReportSummary {
  reportType: string;
  periodStart: string;
  periodEnd: string;
  initialPopulation: number;
  denominator: number;
  numerator: number;
  denominatorExclusion: number;
  measureScore: number | null;
  source: string;
  computedAt: string;
}

export interface MeasureTestDeckCoverage {
  status: 'passed';
  testDeck: string;
  artifactYear: number;
  subjectCount: number;
  evidenceSource: string;
  representativeSubject: string;
  representativeExpected: {
    initialPopulation: number;
    denominator: number;
    denominatorExclusion: number;
    numerator: number;
  };
  populationSmoke: {
    initialPopulation: number;
    denominator: number;
    denominatorExclusion: number;
    numerator: number;
    score: number;
  };
  promotionGate: string;
}

export interface MeasureDossier {
  measureCode: string;
  binding: MeasureArtifact | null;
  bridgeStatus: MeasureBridgeStatus | null;
  valueSets: MeasureValueSet[];
  components: {
    fhirLibraryUrl: string | null;
    fhirMeasureUrl: string | null;
    elm: string | null;
    testDeckCoverage: MeasureTestDeckCoverage | null;
    measureReport: MeasureReportSummary | null;
  };
}

const CMS122_TEST_DECK_COVERAGE: MeasureTestDeckCoverage = {
  status: 'passed',
  testDeck: 'MADiE CMS122 2025 QI-Core test deck',
  artifactYear: 2025,
  subjectCount: 56,
  evidenceSource: 'scripts/cql-realmeasure-smoke.sh',
  representativeSubject: 'Patient/090ad2fc-274b-4fef-bc5a-2077dbdc28f5',
  representativeExpected: {
    initialPopulation: 1,
    denominator: 1,
    denominatorExclusion: 0,
    numerator: 1,
  },
  populationSmoke: {
    initialPopulation: 52,
    denominator: 52,
    denominatorExclusion: 19,
    numerator: 32,
    score: 0.97,
  },
  promotionGate:
    'Required artifact evidence only; production promotion still requires accepted reconciliation, semantic drift review, and clinical/product sign-off.',
};

const CMS122_TEST_DECK_IDENTIFIERS = new Set([
  'CMS122V12',
  'CMS122V13',
  'CMS122FHIRDIABETESASSESSGREATERTHAN9PERCENT',
]);

function testDeckCoverageForMeasure(measureCode: string, binding: MeasureArtifact | null): MeasureTestDeckCoverage | null {
  const identifiers = [
    measureCode,
    binding?.ecqm_version,
    binding?.ecqm_id,
    binding?.fhir_measure_url,
    binding?.fhir_library_url,
  ];
  const covered = identifiers.some((identifier) => {
    const normalized = identifier?.trim().toUpperCase();
    return normalized
      ? CMS122_TEST_DECK_IDENTIFIERS.has(normalized) ||
          normalized.includes('CMS122FHIRDIABETESASSESSGREATERTHAN9PERCENT')
      : false;
  });
  return covered ? CMS122_TEST_DECK_COVERAGE : null;
}

export async function getMeasureDossier(measureCode: string): Promise<MeasureDossier> {
  const bindings = await sql<MeasureArtifact[]>`
    SELECT ecqm_id, ecqm_version, fhir_measure_url, fhir_library_url,
           reporting_period_start::text AS reporting_period_start,
           reporting_period_end::text   AS reporting_period_end,
           vsac_version_pins, status
    FROM phm_edw.measure_artifact
    WHERE measure_code = ${measureCode}
    ORDER BY reporting_period_start DESC NULLS LAST
    LIMIT 1
  `;
  const binding = bindings[0] ?? null;

  const [bridgeStatus, valueSets, latest] = await Promise.all([
    getMeasureBridgeStatus(measureCode),
    getMeasureValueSets(measureCode),
    latestMeasureReport(measureCode),
  ]);

  const measureReport: MeasureReportSummary | null = latest
    ? {
        reportType: latest.report_type,
        periodStart: latest.period_start,
        periodEnd: latest.period_end,
        initialPopulation: latest.initial_population,
        denominator: latest.denominator,
        numerator: latest.numerator,
        denominatorExclusion: latest.denominator_exclusion,
        measureScore: latest.measure_score,
        source: latest.source,
        computedAt: latest.computed_at,
      }
    : null;

  return {
    measureCode,
    binding,
    bridgeStatus,
    valueSets,
    components: {
      fhirLibraryUrl: binding?.fhir_library_url ?? null,
      fhirMeasureUrl: binding?.fhir_measure_url ?? null,
      elm: null, // shipped with the FHIR Library content; surfaced via the engine
      testDeckCoverage: testDeckCoverageForMeasure(measureCode, binding),
      measureReport, // latest persisted MeasureReport summary (Phase 2 Epic B)
    },
  };
}
