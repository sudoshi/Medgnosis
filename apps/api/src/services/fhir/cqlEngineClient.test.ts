// =============================================================================
// Unit tests — clinical-reasoning sidecar client ($evaluate-measure)
// =============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { evaluateMeasure, fetchEngineCapability, populationsFromReport } from './cqlEngineClient.js';

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

describe('fetchEngineCapability', () => {
  const CAPABILITY = {
    resourceType: 'CapabilityStatement',
    status: 'active',
    software: { name: 'HAPI FHIR Server', version: '7.4.0' },
    fhirVersion: '4.0.1',
  };

  it('GETs /metadata and projects software.version + fhirVersion', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(fhirResponse(CAPABILITY));
    const cap = await fetchEngineCapability('http://cql-engine/fhir');
    expect(cap.reachable).toBe(true);
    expect(cap.version).toBe('7.4.0');
    expect(cap.software).toBe('HAPI FHIR Server');
    expect(cap.fhirVersion).toBe('4.0.1');
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toBe('http://cql-engine/fhir/metadata');
  });

  it('returns an unreachable capability (null version, no throw) on a non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fhirResponse({}, 503));
    const cap = await fetchEngineCapability('http://cql-engine/fhir');
    expect(cap.reachable).toBe(false);
    expect(cap.version).toBeNull();
    expect(cap.error).toContain('503');
  });

  it('returns an unreachable capability (null version, no throw) on a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const cap = await fetchEngineCapability('http://cql-engine/fhir');
    expect(cap.reachable).toBe(false);
    expect(cap.version).toBeNull();
    expect(cap.error).toContain('ECONNREFUSED');
  });

  it('records null version when software.version is missing or blank', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      fhirResponse({ resourceType: 'CapabilityStatement', software: { name: 'x', version: '  ' } }),
    );
    const cap = await fetchEngineCapability('http://cql-engine/fhir');
    expect(cap.reachable).toBe(true);
    expect(cap.version).toBeNull();
    expect(cap.software).toBe('x');
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
