// =============================================================================
// Unit tests — CQL MeasureEvaluator (evaluate bound measures + persist reports)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSql, mockEval, mockPersist, mockCapability } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockEval: vi.fn(),
  mockPersist: vi.fn(),
  mockCapability: vi.fn(),
}));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('./fhir/cqlEngineClient.js', () => ({
  evaluateMeasure: mockEval,
  fetchEngineCapability: mockCapability,
}));
vi.mock('./measureReportStore.js', () => ({ persistMeasureReport: mockPersist }));

import {
  refreshCqlMeasureResults,
  tagEngineVersion,
  CQL_ENGINE_VERSION_TAG_SYSTEM,
} from './cqlMeasureEvaluator.js';
import type { FhirMeasureReport } from './fhir/cqlEngineClient.js';

const REPORT = { resourceType: 'MeasureReport', status: 'complete', measure: 'X' };
const binding = (measure_code: string, ecqm_id: string) => ({
  measure_code,
  ecqm_id,
  period_start: '2024-01-01',
  period_end: '2024-12-31',
});

beforeEach(() => {
  vi.clearAllMocks();
  mockCapability.mockResolvedValue({
    reachable: true,
    version: 'HAPI-7.4.0',
    software: 'HAPI FHIR',
    fhirVersion: '4.0.1',
  });
});

describe('refreshCqlMeasureResults', () => {
  it('evaluates each bound measure by its engine Measure id and persists the report', async () => {
    mockSql.mockResolvedValueOnce([
      binding('CMS122v12', 'CMS122FHIR'),
      binding('CMS165v12', 'CMS165FHIR'),
    ]);
    mockEval.mockResolvedValue(REPORT);
    mockPersist.mockResolvedValue(1);

    const result = await refreshCqlMeasureResults();

    expect(mockEval).toHaveBeenCalledTimes(2);
    expect(mockPersist).toHaveBeenCalledTimes(2);
    expect(result.rowCount).toBe(2);
    expect(typeof result.durationMs).toBe('number');
  });

  it('evaluates by ecqm_id (not measure_code) and persists under the EDW code', async () => {
    mockSql.mockResolvedValueOnce([binding('CMS122v12', 'CMS122FHIR')]);
    mockEval.mockResolvedValue(REPORT);
    mockPersist.mockResolvedValue(1);

    await refreshCqlMeasureResults();

    const [, measureId, params] = mockEval.mock.calls[0]!;
    expect(measureId).toBe('CMS122FHIR'); // engine id, not CMS122v12
    expect(params).toMatchObject({ reportType: 'population', periodStart: '2024-01-01' });

    const [code, period, report] = mockPersist.mock.calls[0]!;
    expect(code).toBe('CMS122v12'); // persisted under EDW code
    expect(period).toEqual({ start: '2024-01-01', end: '2024-12-31' });
    // The persisted report carries the original payload plus the engine-version tag.
    expect(report).toMatchObject({ resourceType: 'MeasureReport', measure: 'X' });
    expect(report.meta.tag).toContainEqual({
      system: CQL_ENGINE_VERSION_TAG_SYSTEM,
      code: 'HAPI-7.4.0',
    });
  });

  it('captures the engine version and tags each persisted MeasureReport', async () => {
    mockSql.mockResolvedValueOnce([binding('CMS122v12', 'CMS122FHIR')]);
    mockEval.mockResolvedValue(REPORT);
    mockPersist.mockResolvedValue(1);

    await refreshCqlMeasureResults();

    expect(mockCapability).toHaveBeenCalledOnce(); // probed once per refresh
    const [, , report] = mockPersist.mock.calls[0]!;
    expect(report.meta.tag).toContainEqual({
      system: CQL_ENGINE_VERSION_TAG_SYSTEM,
      code: 'HAPI-7.4.0',
    });
  });

  it('persists without a version tag (null-safe) when the engine is unreachable', async () => {
    mockCapability.mockResolvedValue({
      reachable: false,
      version: null,
      software: null,
      fhirVersion: null,
      error: 'ECONNREFUSED',
    });
    mockSql.mockResolvedValueOnce([binding('CMS122v12', 'CMS122FHIR')]);
    mockEval.mockResolvedValue(REPORT);
    mockPersist.mockResolvedValue(1);

    const result = await refreshCqlMeasureResults();
    expect(result.rowCount).toBe(1);
    const [, , report] = mockPersist.mock.calls[0]!;
    expect(report).toBe(REPORT); // unchanged — no tag added
  });

  it('falls back to the env period when a binding leaves it null', async () => {
    mockSql.mockResolvedValueOnce([
      { measure_code: 'CMS122v12', ecqm_id: 'CMS122FHIR', period_start: null, period_end: null },
    ]);
    mockEval.mockResolvedValue(REPORT);
    mockPersist.mockResolvedValue(1);

    await refreshCqlMeasureResults();
    const [, , params] = mockEval.mock.calls[0]!;
    expect(params.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('counts partial successes (one measure fails to evaluate)', async () => {
    mockSql.mockResolvedValueOnce([binding('A', 'AFHIR'), binding('B', 'BFHIR')]);
    mockEval.mockResolvedValueOnce(REPORT).mockRejectedValueOnce(new Error('eval error'));
    mockPersist.mockResolvedValue(1);

    const result = await refreshCqlMeasureResults();
    expect(result.rowCount).toBe(1);
    expect(mockPersist).toHaveBeenCalledTimes(1);
  });

  it('throws loudly when ALL bound measures fail to evaluate', async () => {
    mockSql.mockResolvedValueOnce([binding('A', 'AFHIR')]);
    mockEval.mockRejectedValue(new Error('engine down'));
    await expect(refreshCqlMeasureResults()).rejects.toThrow(/failed for all 1 bound measures/);
  });

  it('returns rowCount 0 (no throw) when no measures are bound', async () => {
    mockSql.mockResolvedValueOnce([]);
    const result = await refreshCqlMeasureResults();
    expect(result.rowCount).toBe(0);
    expect(mockEval).not.toHaveBeenCalled();
  });
});

function metaTags(report: FhirMeasureReport): Array<{ system?: string; code?: string }> {
  const meta = report['meta'];
  if (meta && typeof meta === 'object' && Array.isArray((meta as { tag?: unknown }).tag)) {
    return (meta as { tag: Array<{ system?: string; code?: string }> }).tag;
  }
  return [];
}

describe('tagEngineVersion', () => {
  const base: FhirMeasureReport = { resourceType: 'MeasureReport', status: 'complete', measure: 'X' };

  it('adds the engine-version tag to a report without meta', () => {
    const tagged = tagEngineVersion(base, 'HAPI-7.4.0');
    expect(metaTags(tagged)).toEqual([
      { system: CQL_ENGINE_VERSION_TAG_SYSTEM, code: 'HAPI-7.4.0' },
    ]);
    expect(base['meta']).toBeUndefined(); // immutable — original untouched
  });

  it('returns the report unchanged when version is null', () => {
    const tagged = tagEngineVersion(base, null);
    expect(tagged).toBe(base);
  });

  it('replaces a stale engine-version tag while preserving other tags', () => {
    const withTags: FhirMeasureReport = {
      ...base,
      meta: {
        tag: [
          { system: 'https://example.org/other', code: 'keep' },
          { system: CQL_ENGINE_VERSION_TAG_SYSTEM, code: 'OLD' },
        ],
      },
    };
    const tagged = tagEngineVersion(withTags, 'NEW');
    expect(metaTags(tagged)).toEqual([
      { system: 'https://example.org/other', code: 'keep' },
      { system: CQL_ENGINE_VERSION_TAG_SYSTEM, code: 'NEW' },
    ]);
  });
});
