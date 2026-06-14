// =============================================================================
// Unit tests — clinical-reasoning sidecar client ($evaluate-measure)
// =============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { evaluateMeasure, populationsFromReport } from './cqlEngineClient.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function fhirResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/fhir+json' },
  });
}

const SUMMARY_REPORT = {
  resourceType: 'MeasureReport',
  status: 'complete',
  measure: 'CMS122',
  group: [
    {
      population: [
        { code: { coding: [{ code: 'initial-population' }] }, count: 100 },
        { code: { coding: [{ code: 'denominator' }] }, count: 80 },
        { code: { coding: [{ code: 'denominator-exclusion' }] }, count: 5 },
        { code: { coding: [{ code: 'numerator' }] }, count: 55 },
      ],
    },
  ],
};

describe('evaluateMeasure', () => {
  it('GETs Measure/<id>/$evaluate-measure with period + reportType and returns the MeasureReport', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(fhirResponse(SUMMARY_REPORT));
    const out = await evaluateMeasure('http://cql-engine/fhir', 'CMS122', {
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      reportType: 'population',
    });
    expect(out.measure).toBe('CMS122');
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('/Measure/CMS122/$evaluate-measure');
    expect(url).toContain('periodStart=2026-01-01');
    expect(url).toContain('reportType=population');
  });

  it('includes subject when provided', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(fhirResponse(SUMMARY_REPORT));
    await evaluateMeasure('http://cql-engine/fhir', 'CMS122', {
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      reportType: 'subject',
      subject: 'Patient/abc',
    });
    const url = fetchMock.mock.calls[0]![0] as string;
    // URLSearchParams encodes the slash in Patient/abc
    expect(decodeURIComponent(url)).toContain('subject=Patient/abc');
  });

  it('throws on a non-2xx response with the OperationOutcome diagnostics', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      fhirResponse(
        { resourceType: 'OperationOutcome', issue: [{ severity: 'error', diagnostics: 'unknown Measure' }] },
        404,
      ),
    );
    await expect(
      evaluateMeasure('http://cql-engine/fhir', 'NOPE', {
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        reportType: 'population',
      }),
    ).rejects.toThrow(/unknown Measure/);
  });
});

describe('populationsFromReport', () => {
  it('extracts ip/denom/num/excl counts', () => {
    const p = populationsFromReport(SUMMARY_REPORT as never);
    expect(p).toEqual({
      initialPopulation: 100,
      denominator: 80,
      numerator: 55,
      denominatorExclusion: 5,
    });
  });
  it('defaults missing populations to 0', () => {
    const p = populationsFromReport({ resourceType: 'MeasureReport', status: 'complete', measure: 'X' } as never);
    expect(p).toEqual({ initialPopulation: 0, denominator: 0, numerator: 0, denominatorExclusion: 0 });
  });
});
