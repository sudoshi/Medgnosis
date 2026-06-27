// =============================================================================
// Unit tests — clinical-reasoning engine bundle loader
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockSql, mockLoadQdmEventsToCqlEngine, mockFetchEngineCapability, mockWriteSystemAuditLog } =
  vi.hoisted(() => ({
    mockSql: vi.fn(),
    mockLoadQdmEventsToCqlEngine: vi.fn(),
    mockFetchEngineCapability: vi.fn(),
    mockWriteSystemAuditLog: vi.fn(),
  }));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('./qdm/qdmCqlLoader.js', () => ({
  loadQdmEventsToCqlEngine: mockLoadQdmEventsToCqlEngine,
}));
vi.mock('./fhir/cqlEngineClient.js', () => ({
  fetchEngineCapability: mockFetchEngineCapability,
}));
vi.mock('./auditLog.js', () => ({
  writeSystemAuditLog: mockWriteSystemAuditLog,
}));

import {
  loadBundle,
  cqlCohortExportLimit,
  assertWithinExportLimit,
  CqlExportLimitError,
  CQL_COHORT_EXPORT_HARD_MAX,
  CQL_COHORT_EXPORT_DEFAULT_LIMIT,
  runCqlArtifactLoad,
} from './cqlEngineLoader.js';
import type { TransactionBundle } from './fhir/qicoreExport.js';

const bundle: TransactionBundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    { fullUrl: 'Patient/1', resource: { resourceType: 'Patient', id: '1' }, request: { method: 'PUT', url: 'Patient/1' } },
    { fullUrl: 'Condition/2', resource: { resourceType: 'Condition', id: '2' }, request: { method: 'PUT', url: 'Condition/2' } },
  ],
};

describe('loadBundle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the transaction and returns per-status counts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        resourceType: 'Bundle',
        type: 'transaction-response',
        entry: [{ response: { status: '200 OK' } }, { response: { status: '201 Created' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await loadBundle('http://engine:8080/fhir', bundle);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://engine:8080/fhir');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type'].toLowerCase()).toContain('application/fhir+json');
    expect(res.total).toBe(2);
    expect(res.created).toBe(1); // only the 201
    expect(res.ok).toBe(2); // all 2xx (200 + 201)
    expect(res.failed).toBe(0);
  });

  it('throws when the transaction itself returns a non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', diagnostics: 'bad bundle' }],
      }),
    }));
    await expect(loadBundle('http://engine:8080/fhir', bundle)).rejects.toThrow(/bad bundle/);
  });

  it('counts per-entry failures from the transaction-response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        resourceType: 'Bundle',
        type: 'transaction-response',
        entry: [{ response: { status: '200 OK' } }, { response: { status: '422 Unprocessable Entity' } }],
      }),
    }));
    const res = await loadBundle('http://engine:8080/fhir', bundle);
    expect(res.failed).toBe(1);
    expect(res.ok).toBe(1);
  });
});

describe('bounded export limit', () => {
  afterEach(() => {
    delete process.env['CQL_COHORT_EXPORT_LIMIT'];
  });

  it('defaults when CQL_COHORT_EXPORT_LIMIT is unset', () => {
    delete process.env['CQL_COHORT_EXPORT_LIMIT'];
    expect(cqlCohortExportLimit()).toBe(CQL_COHORT_EXPORT_DEFAULT_LIMIT);
  });

  it('honors a valid env override', () => {
    process.env['CQL_COHORT_EXPORT_LIMIT'] = '500';
    expect(cqlCohortExportLimit()).toBe(500);
  });

  it('clamps an env override above the hard maximum', () => {
    process.env['CQL_COHORT_EXPORT_LIMIT'] = String(CQL_COHORT_EXPORT_HARD_MAX + 1_000_000);
    expect(cqlCohortExportLimit()).toBe(CQL_COHORT_EXPORT_HARD_MAX);
  });

  it('falls back to the default for a non-positive or non-numeric override', () => {
    process.env['CQL_COHORT_EXPORT_LIMIT'] = '0';
    expect(cqlCohortExportLimit()).toBe(CQL_COHORT_EXPORT_DEFAULT_LIMIT);
    process.env['CQL_COHORT_EXPORT_LIMIT'] = 'not-a-number';
    expect(cqlCohortExportLimit()).toBe(CQL_COHORT_EXPORT_DEFAULT_LIMIT);
  });

  it('assertWithinExportLimit throws CqlExportLimitError above the ceiling', () => {
    expect(() => assertWithinExportLimit(5_000, 2_000)).toThrow(CqlExportLimitError);
    try {
      assertWithinExportLimit(5_000, 2_000);
    } catch (err) {
      expect(err).toBeInstanceOf(CqlExportLimitError);
      expect((err as CqlExportLimitError).requested).toBe(5_000);
      expect((err as CqlExportLimitError).limit).toBe(2_000);
      expect((err as CqlExportLimitError).code).toBe('CQL_EXPORT_LIMIT_EXCEEDED');
    }
  });

  it('assertWithinExportLimit returns the clamped limit when within bounds', () => {
    expect(assertWithinExportLimit(100, 2_000)).toBe(2_000);
  });
});

describe('runCqlArtifactLoad', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['CQL_COHORT_EXPORT_LIMIT'];
    delete process.env['CQL_ENGINE_URL'];
    mockFetchEngineCapability.mockResolvedValue({
      reachable: true,
      version: 'HAPI-7.4.0',
      software: 'HAPI FHIR',
      fhirVersion: '4.0.1',
    });
    mockWriteSystemAuditLog.mockResolvedValue(undefined);
  });
  afterEach(() => {
    delete process.env['CQL_COHORT_EXPORT_LIMIT'];
    delete process.env['CQL_ENGINE_URL'];
  });

  it('passes the bounded export limit to the QDM selector and returns counts + last-success timestamp', async () => {
    mockLoadQdmEventsToCqlEngine.mockResolvedValue({
      qdmEventsSelected: 12,
      qdmEventsIncluded: 12,
      qdmEventsProjected: 10,
      qdmEventsSkipped: 2,
      bundleEntries: 10,
      load: { total: 10, created: 6, ok: 10, failed: 0 },
    });

    const result = await runCqlArtifactLoad({ triggeredBy: 'admin@medgnosis.app' });

    expect(mockLoadQdmEventsToCqlEngine).toHaveBeenCalledOnce();
    const [arg] = mockLoadQdmEventsToCqlEngine.mock.calls[0]!;
    expect(arg.limit).toBe(CQL_COHORT_EXPORT_DEFAULT_LIMIT);
    expect(result.status).toBe('loaded');
    expect(result.exportLimit).toBe(CQL_COHORT_EXPORT_DEFAULT_LIMIT);
    expect(result.engineVersion).toBe('HAPI-7.4.0');
    expect(result.engineReachable).toBe(true);
    expect(result.counts.bundleEntries).toBe(10);
    expect(result.counts.loadedResources).toBe(10);
    expect(result.counts.qdmEventsSelected).toBe(12);
    expect(result.lastSuccessAt).not.toBeNull();
    expect(result.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('records an audit row with PHI-safe details', async () => {
    mockLoadQdmEventsToCqlEngine.mockResolvedValue({
      qdmEventsSelected: 1,
      qdmEventsIncluded: 1,
      qdmEventsProjected: 1,
      qdmEventsSkipped: 0,
      bundleEntries: 1,
      load: { total: 1, created: 1, ok: 1, failed: 0 },
    });

    await runCqlArtifactLoad({ triggeredBy: 'nightly' });

    expect(mockWriteSystemAuditLog).toHaveBeenCalledOnce();
    const [action, resource, resourceId, details] = mockWriteSystemAuditLog.mock.calls[0]!;
    expect(action).toBe('cql_artifact_load');
    expect(resource).toBe('cql_artifact_load');
    expect(resourceId).toBe('nightly');
    expect(details.status).toBe('loaded');
    expect(details.engineVersion).toBe('HAPI-7.4.0');
    expect(details.counts.bundleEntries).toBe(1);
  });

  it('returns status "empty" (no last-success) when nothing was selected', async () => {
    mockLoadQdmEventsToCqlEngine.mockResolvedValue({
      qdmEventsSelected: 0,
      qdmEventsIncluded: 0,
      qdmEventsProjected: 0,
      qdmEventsSkipped: 0,
      bundleEntries: 0,
      load: null,
    });

    const result = await runCqlArtifactLoad();
    expect(result.status).toBe('empty');
    expect(result.lastSuccessAt).toBeNull();
    expect(result.counts.bundleEntries).toBe(0);
    expect(mockWriteSystemAuditLog).toHaveBeenCalledOnce();
  });

  it('captures a null engine version without failing when the engine is unreachable', async () => {
    mockFetchEngineCapability.mockResolvedValue({
      reachable: false,
      version: null,
      software: null,
      fhirVersion: null,
      error: 'ECONNREFUSED',
    });
    mockLoadQdmEventsToCqlEngine.mockResolvedValue({
      qdmEventsSelected: 3,
      qdmEventsIncluded: 3,
      qdmEventsProjected: 3,
      qdmEventsSkipped: 0,
      bundleEntries: 3,
      load: { total: 3, created: 3, ok: 3, failed: 0 },
    });

    const result = await runCqlArtifactLoad();
    expect(result.engineVersion).toBeNull();
    expect(result.engineReachable).toBe(false);
    expect(result.status).toBe('loaded');
  });

  it('enforces the bounded limit before loading', async () => {
    process.env['CQL_COHORT_EXPORT_LIMIT'] = '100';
    await expect(runCqlArtifactLoad({ limit: 500 })).rejects.toThrow(CqlExportLimitError);
    expect(mockLoadQdmEventsToCqlEngine).not.toHaveBeenCalled();
  });

  it('records a failed audit row and rethrows when the load throws', async () => {
    mockLoadQdmEventsToCqlEngine.mockRejectedValue(new Error('engine bundle load failed: boom'));

    await expect(runCqlArtifactLoad({ triggeredBy: 'admin' })).rejects.toThrow(/boom/);
    expect(mockWriteSystemAuditLog).toHaveBeenCalledOnce();
    const [, , , details] = mockWriteSystemAuditLog.mock.calls[0]!;
    expect(details.status).toBe('failed');
    expect(details.error).toMatch(/boom/);
  });
});
