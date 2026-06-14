// =============================================================================
// Unit tests — FHIR measure operations route ($evaluate-measure)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const { mockSql, mockLatest, mockEval } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockLatest: vi.fn(),
  mockEval: vi.fn(),
}));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../../services/measureReportStore.js', () => ({ latestMeasureReport: mockLatest }));
vi.mock('../../services/fhir/cqlEngineClient.js', () => ({ evaluateMeasure: mockEval }));

import measureOps from './measureOps.js';

const REPORT = { resourceType: 'MeasureReport', status: 'complete', measure: 'CMS122FHIR' };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorate('authenticate', async () => {
    /* no-op auth for tests */
  });
  await app.register(measureOps);
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /Measure/:id/$evaluate-measure', () => {
  it('returns the latest persisted MeasureReport when present', async () => {
    mockLatest.mockResolvedValueOnce({ report: REPORT });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/Measure/CMS122v12/$evaluate-measure' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ resourceType: 'MeasureReport' });
    expect(res.headers['x-measure-source']).toBe('persisted');
    expect(mockEval).not.toHaveBeenCalled();
    await app.close();
  });

  it('proxies a live engine evaluation via the binding when nothing is persisted', async () => {
    mockLatest.mockResolvedValueOnce(null);
    mockSql.mockResolvedValueOnce([
      { ecqm_id: 'CMS122FHIR', period_start: '2024-01-01', period_end: '2024-12-31' },
    ]);
    mockEval.mockResolvedValueOnce(REPORT);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/Measure/CMS122v12/$evaluate-measure' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-measure-source']).toBe('engine');
    const [, engineId, params] = mockEval.mock.calls[0]!;
    expect(engineId).toBe('CMS122FHIR');
    expect(params).toMatchObject({ periodStart: '2024-01-01', reportType: 'population' });
    await app.close();
  });

  it('404s with an OperationOutcome when there is no report and no binding', async () => {
    mockLatest.mockResolvedValueOnce(null);
    mockSql.mockResolvedValueOnce([]);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/Measure/CMS999v1/$evaluate-measure' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ resourceType: 'OperationOutcome' });
    await app.close();
  });

  it('502s with an OperationOutcome when the engine evaluation fails', async () => {
    mockLatest.mockResolvedValueOnce(null);
    mockSql.mockResolvedValueOnce([{ ecqm_id: 'CMS122FHIR', period_start: null, period_end: null }]);
    mockEval.mockRejectedValueOnce(new Error('engine down'));
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/Measure/CMS122v12/$evaluate-measure' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ resourceType: 'OperationOutcome' });
    await app.close();
  });
});

describe('GET /Measure/$care-gaps', () => {
  it('builds a DEQM Gaps-in-Care Bundle from the patient care_gap rows', async () => {
    const future = '2099-12-31';
    mockSql.mockResolvedValueOnce([
      { gap_status: 'open', due_date: '2020-01-01', measure_code: 'CMS122v12', fhir_measure_url: 'https://madie.cms.gov/Measure/CMS122' },
      { gap_status: 'open', due_date: future, measure_code: 'CMS165v12', fhir_measure_url: null },
      { gap_status: 'closed', due_date: null, measure_code: 'CMS130v12', fhir_measure_url: null },
    ]);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/Measure/$care-gaps?subject=Patient/42' });

    expect(res.statusCode).toBe(200);
    const bundle = res.json();
    expect(bundle).toMatchObject({ resourceType: 'Bundle', type: 'document' });
    const types = (bundle.entry as Array<{ resource: { resourceType: string } }>).map((e) => e.resource.resourceType);
    expect(types.filter((t) => t === 'DetectedIssue')).toHaveLength(3);
    // open (overdue), prospective (future due), closed — one each
    const statuses = (bundle.entry as Array<{ resource: Record<string, unknown> }>)
      .filter((e) => e.resource.resourceType === 'DetectedIssue')
      .flatMap((e) =>
        (e.resource.modifierExtension as Array<{ valueCodeableConcept?: { coding?: Array<{ code: string }> } }>).flatMap(
          (x) => x.valueCodeableConcept?.coding?.map((c) => c.code) ?? [],
        ),
      );
    expect(statuses.sort()).toEqual(['closed-gap', 'open-gap', 'prospective-gap']);
    await app.close();
  });

  it('filters by status when requested', async () => {
    mockSql.mockResolvedValueOnce([
      { gap_status: 'open', due_date: '2099-12-31', measure_code: 'CMS165v12', fhir_measure_url: null },
      { gap_status: 'open', due_date: '2020-01-01', measure_code: 'CMS122v12', fhir_measure_url: null },
    ]);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/Measure/$care-gaps?subject=Patient/42&status=prospective' });

    expect(res.statusCode).toBe(200);
    const types = (res.json().entry as Array<{ resource: { resourceType: string } }>).map((e) => e.resource.resourceType);
    expect(types.filter((t) => t === 'DetectedIssue')).toHaveLength(1); // only the prospective gap
    await app.close();
  });

  it('400s when subject is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/Measure/$care-gaps' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ resourceType: 'OperationOutcome' });
    await app.close();
  });
});
