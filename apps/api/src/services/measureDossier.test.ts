// =============================================================================
// Unit tests — Measure dossier assembly
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql, mockValueSets, mockBridge, mockLatest } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockValueSets: vi.fn(),
  mockBridge: vi.fn(),
  mockLatest: vi.fn(),
}));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('./vsacService.js', () => ({
  getMeasureValueSets: mockValueSets,
  getMeasureBridgeStatus: mockBridge,
}));
vi.mock('./measureReportStore.js', () => ({ latestMeasureReport: mockLatest }));

import { getMeasureDossier } from './measureDossier.js';

beforeEach(() => vi.clearAllMocks());

describe('getMeasureDossier', () => {
  it('assembles binding, value sets, bridge status, and CMS122 test-deck coverage', async () => {
    mockSql.mockResolvedValueOnce([
      {
        ecqm_id: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
        ecqm_version: 'CMS122v13',
        fhir_measure_url: 'https://madie.cms.gov/Measure/CMS122FHIRDiabetesAssessGreaterThan9Percent',
        fhir_library_url: 'https://madie.cms.gov/Library/CMS122FHIRDiabetesAssessGreaterThan9Percent',
        reporting_period_start: '2026-01-01',
        reporting_period_end: '2026-12-31',
        vsac_version_pins: { '2.16.840.1.113883.3.464.1003.103.12.1001': '2025-05' },
        status: 'active',
      },
    ]);
    mockBridge.mockResolvedValue({ measure_code: 'CMS122v12', version_drift: false, roles: {}, unclassified_count: 0 });
    mockValueSets.mockResolvedValue([{ value_set_oid: 'x', name: 'Diabetes', code_count: 10 }]);
    mockLatest.mockResolvedValue({
      report_type: 'population',
      period_start: '2024-01-01',
      period_end: '2024-12-31',
      initial_population: 52,
      denominator: 52,
      numerator: 32,
      denominator_exclusion: 19,
      measure_score: 0.97,
      source: 'cql',
      computed_at: '2026-06-14T00:00:00Z',
    });

    const d = await getMeasureDossier('CMS122v12');
    expect(d.measureCode).toBe('CMS122v12');
    expect(d.binding?.ecqm_version).toBe('CMS122v13');
    expect(d.components.fhirLibraryUrl).toBe(
      'https://madie.cms.gov/Library/CMS122FHIRDiabetesAssessGreaterThan9Percent',
    );
    expect(d.valueSets).toHaveLength(1);
    expect(d.bridgeStatus?.version_drift).toBe(false);
    expect(d.components.testDeckCoverage).toMatchObject({
      status: 'passed',
      testDeck: 'MADiE CMS122 2025 QI-Core test deck',
      subjectCount: 56,
      evidenceSource: 'scripts/cql-realmeasure-smoke.sh',
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
    });
    expect(d.components.testDeckCoverage?.promotionGate).toContain('production promotion still requires');
    expect(d.components.measureReport?.numerator).toBe(32);
    expect(d.components.measureReport?.measureScore).toBe(0.97);
  });

  it('returns a null binding when no artifact is bound yet (value sets still served)', async () => {
    mockSql.mockResolvedValueOnce([]);
    mockBridge.mockResolvedValue(null);
    mockValueSets.mockResolvedValue([]);
    mockLatest.mockResolvedValue(null);
    const d = await getMeasureDossier('CMS999v1');
    expect(d.binding).toBeNull();
    expect(d.components.fhirLibraryUrl).toBeNull();
    expect(d.valueSets).toEqual([]);
    expect(d.components.testDeckCoverage).toBeNull();
    expect(d.components.measureReport).toBeNull();
  });

  it('does not infer test-deck coverage for unproven CMS122 versions', async () => {
    mockSql.mockResolvedValueOnce([
      {
        ecqm_id: 'CMS122FHIRFuture',
        ecqm_version: 'CMS122v14',
        fhir_measure_url: 'https://madie.cms.gov/Measure/CMS122v14',
        fhir_library_url: 'https://madie.cms.gov/Library/CMS122v14',
        reporting_period_start: '2027-01-01',
        reporting_period_end: '2027-12-31',
        vsac_version_pins: {},
        status: 'active',
      },
    ]);
    mockBridge.mockResolvedValue({ measure_code: 'CMS122v14', version_drift: false, roles: {}, unclassified_count: 0 });
    mockValueSets.mockResolvedValue([]);
    mockLatest.mockResolvedValue(null);

    const d = await getMeasureDossier('CMS122v14');

    expect(d.components.testDeckCoverage).toBeNull();
  });
});
