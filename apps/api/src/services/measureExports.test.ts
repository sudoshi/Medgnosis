// =============================================================================
// Unit tests — Reporting artifact export service (Phase 5)
// Mocks the DB and the persisted-MeasureReport reader; asserts each artifact
// exports with the right contentType/filename, a PHI-safe audit row,
// submissionReadiness.validated === false, and the Cat I / DEQM bound enforced.
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql, mockLatestMeasureReport } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockLatestMeasureReport: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('./measureReportStore.js', () => ({
  latestMeasureReport: mockLatestMeasureReport,
}));

import {
  buildMeasureExport,
  exportAuditDetails,
  isExportArtifact,
  MeasureExportError,
  CAT1_SAMPLE_CAP,
  DEQM_SAMPLE_CAP,
  EXPORT_ARTIFACTS,
} from './measureExports.js';

const MEASURE_ROW = {
  measure_id: 12,
  measure_key: 99,
  measure_code: 'CMS122v12',
  measure_name: 'Diabetes HbA1c Poor Control',
  ecqm_id: 'CMS122FHIRDiabetesAssessGreaterThan9Percent',
  ecqm_version: 'CMS122v13',
  fhir_measure_url: 'https://madie.cms.gov/Measure/CMS122FHIRDiabetesAssessGreaterThan9Percent',
  binding_period_start: '2026-01-01',
  binding_period_end: '2026-12-31',
};

const POPULATION_ROW = {
  initial_population: 100,
  denominator: 80,
  numerator: 55,
  denominator_exclusion: 5,
};

function makePatients(n: number) {
  return Array.from({ length: n }, (_unused, i) => ({
    patient_id: i + 1,
    first_name: 'Pat',
    last_name: `Sample${i + 1}`,
    date_of_birth: '1970-04-05',
    gender: i % 2 === 0 ? 'male' : 'female',
    denominator_flag: true,
    numerator_flag: i % 2 === 0,
    exclusion_flag: false,
  }));
}

const PERSISTED_REPORT = {
  measure_code: 'CMS122v12',
  period_start: '2026-01-01',
  period_end: '2026-12-31',
  report_type: 'population' as const,
  report: { resourceType: 'MeasureReport', status: 'complete', type: 'summary' },
  measure_score: 0.68,
  initial_population: 100,
  denominator: 80,
  numerator: 55,
  denominator_exclusion: 5,
  source: 'cql',
  computed_at: '2026-06-20T00:00:00Z',
};

// Each export query runs in order: resolveMeasure, populationCounts, then the
// artifact-specific sample query. This sequences mockSql resolutions per call.
function wireSql(sequence: unknown[][]) {
  let call = 0;
  mockSql.mockImplementation(() => {
    const result = sequence[call] ?? [];
    call += 1;
    return Promise.resolve(result);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLatestMeasureReport.mockResolvedValue(PERSISTED_REPORT);
});

describe('isExportArtifact', () => {
  it('accepts the known artifacts and rejects others', () => {
    for (const artifact of EXPORT_ARTIFACTS) {
      expect(isExportArtifact(artifact)).toBe(true);
    }
    expect(isExportArtifact('not-an-artifact')).toBe(false);
  });
});

describe('buildMeasureExport — QRDA Cat III', () => {
  it('exports aggregate XML with the right contentType/filename and validated=false', async () => {
    wireSql([[MEASURE_ROW], [POPULATION_ROW]]);
    const result = await buildMeasureExport('qrda-cat3', { measureCode: 'CMS122v12' });

    expect(result.artifact).toBe('qrda-cat3');
    expect(result.contentType).toBe('application/xml');
    expect(result.filename).toBe('qrda-cat3-CMS122v12-2026.xml');
    expect(result.content).toContain('<ClinicalDocument');
    expect(result.content).toMatch(/value xsi:type="INT" value="80"/); // denominator
    expect(result.submissionReadiness.validated).toBe(false);
    expect(result.submissionReadiness.validator).toMatch(/CVU\+/);
    expect(result.meta.bound.bounded).toBe(false);
    expect(result.meta.populations.denominator).toBe(80);
  });
});

describe('buildMeasureExport — QPP', () => {
  it('exports QPP JSON with the right contentType/filename and validated=false', async () => {
    wireSql([[MEASURE_ROW], [POPULATION_ROW]]);
    const result = await buildMeasureExport('qpp', { measureCode: 'CMS122v12' });

    expect(result.artifact).toBe('qpp');
    expect(result.contentType).toBe('application/json');
    expect(result.filename).toBe('qpp-submission-CMS122v12-2026.json');
    const parsed = JSON.parse(result.content) as {
      performanceYear: number;
      measurementSets: Array<{ measurements: Array<{ measureId: string }> }>;
    };
    expect(parsed.performanceYear).toBe(2026);
    expect(parsed.measurementSets[0]!.measurements[0]!.measureId).toBe('122');
    expect(result.submissionReadiness.validated).toBe(false);
    expect(result.submissionReadiness.validator).toMatch(/QPP/);
  });
});

describe('buildMeasureExport — QRDA Cat I (bounded patient-level)', () => {
  it('exports one document per sampled patient and reports the bound', async () => {
    wireSql([[MEASURE_ROW], [POPULATION_ROW], makePatients(3)]);
    const result = await buildMeasureExport('qrda-cat1', { measureCode: 'CMS122v12' });

    expect(result.artifact).toBe('qrda-cat1');
    expect(result.contentType).toBe('application/xml');
    expect(result.filename).toBe('qrda-cat1-CMS122v12-2026-01-01-2026-12-31.xml');
    // One ClinicalDocument per sampled patient.
    expect((result.content.match(/<ClinicalDocument/g) ?? []).length).toBe(3);
    expect(result.content).toContain('BOUNDED SAMPLE');
    expect(result.meta.bound.bounded).toBe(true);
    expect(result.meta.bound.sampleCap).toBe(CAT1_SAMPLE_CAP);
    expect(result.meta.bound.patientCount).toBe(3);
    expect(result.submissionReadiness.validated).toBe(false);
  });

  it('clamps an over-cap sampleLimit to CAT1_SAMPLE_CAP', async () => {
    // Capture the LIMIT bound passed to the patient-sample query.
    const captured: unknown[] = [];
    let call = 0;
    mockSql.mockImplementation((_strings: TemplateStringsArray, ...values: unknown[]) => {
      const sequence = [[MEASURE_ROW], [POPULATION_ROW], makePatients(CAT1_SAMPLE_CAP)];
      if (call === 2) captured.push(...values);
      const result = sequence[call] ?? [];
      call += 1;
      return Promise.resolve(result);
    });

    const result = await buildMeasureExport('qrda-cat1', {
      measureCode: 'CMS122v12',
      sampleLimit: 1000,
    });

    expect(captured).toContain(CAT1_SAMPLE_CAP);
    expect(result.meta.bound.sampleCap).toBe(CAT1_SAMPLE_CAP);
  });
});

describe('buildMeasureExport — DEQM (bounded subject sample)', () => {
  it('wraps per-subject gaps-in-care bundles in a collection Bundle and reports the bound', async () => {
    const gapRows = [
      { patient_id: 1, gap_status: 'open', due_date: '2026-12-01', measure_code: 'CMS122v12', fhir_measure_url: null },
      { patient_id: 2, gap_status: 'closed', due_date: null, measure_code: 'CMS122v12', fhir_measure_url: null },
    ];
    wireSql([[MEASURE_ROW], [POPULATION_ROW], gapRows]);
    const result = await buildMeasureExport('deqm', { measureCode: 'CMS122v12' });

    expect(result.artifact).toBe('deqm');
    expect(result.contentType).toBe('application/fhir+json');
    const parsed = JSON.parse(result.content) as {
      resourceType: string;
      type: string;
      entry: Array<{ resource: { resourceType: string } }>;
    };
    expect(parsed.resourceType).toBe('Bundle');
    expect(parsed.type).toBe('collection');
    expect(parsed.entry).toHaveLength(2);
    expect(parsed.entry[0]!.resource.resourceType).toBe('Bundle');
    expect(result.meta.bound.bounded).toBe(true);
    expect(result.meta.bound.sampleCap).toBe(DEQM_SAMPLE_CAP);
    expect(result.meta.bound.patientCount).toBe(2);
    expect(result.submissionReadiness.validated).toBe(false);
  });
});

describe('buildMeasureExport — FHIR MeasureReport', () => {
  it('exports the latest persisted MeasureReport as FHIR JSON', async () => {
    wireSql([[MEASURE_ROW]]);
    const result = await buildMeasureExport('measure-report', { measureCode: 'CMS122v12' });

    expect(result.artifact).toBe('measure-report');
    expect(result.contentType).toBe('application/fhir+json');
    expect(result.filename).toBe('measure-report-CMS122v12-2026-01-01-2026-12-31.json');
    const parsed = JSON.parse(result.content) as { resourceType: string };
    expect(parsed.resourceType).toBe('MeasureReport');
    expect(result.meta.bound.bounded).toBe(false);
    expect(result.submissionReadiness.validated).toBe(false);
  });

  it('throws when no MeasureReport is persisted', async () => {
    mockLatestMeasureReport.mockResolvedValueOnce(null);
    wireSql([[MEASURE_ROW]]);
    await expect(buildMeasureExport('measure-report', { measureCode: 'CMS122v12' })).rejects.toThrow(
      MeasureExportError,
    );
  });
});

describe('buildMeasureExport — unknown measure', () => {
  it('throws MEASURE_NOT_FOUND when the measure does not resolve', async () => {
    wireSql([[]]);
    await expect(buildMeasureExport('qrda-cat3', { measureCode: 'NOPE' })).rejects.toMatchObject({
      code: 'MEASURE_NOT_FOUND',
      statusCode: 404,
    });
  });
});

describe('exportAuditDetails (PHI-safe)', () => {
  it('emits counts + period + artifact type only — never identifiers or content', async () => {
    wireSql([[MEASURE_ROW], [POPULATION_ROW], makePatients(2)]);
    const result = await buildMeasureExport('qrda-cat1', { measureCode: 'CMS122v12' });
    const details = exportAuditDetails(result);

    expect(details).toMatchObject({
      artifact: 'qrda-cat1',
      measureCode: 'CMS122v12',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      bounded: true,
      sampleCap: CAT1_SAMPLE_CAP,
      patientCount: 2,
      initialPopulation: 100,
      denominator: 80,
      numerator: 55,
      denominatorExclusion: 5,
      submissionValidated: false,
    });
    // contentBytes is a count, not the content itself.
    expect(typeof details.contentBytes).toBe('number');
    // No raw artifact content and no patient identifiers leak into the audit row.
    const serialized = JSON.stringify(details);
    expect(serialized).not.toContain('<ClinicalDocument');
    expect(serialized).not.toContain('Sample1');
    expect(serialized).not.toContain('Pat');
  });
});
