// =============================================================================
// Unit tests — clinical-reasoning engine bundle loader
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadBundle } from './cqlEngineLoader.js';
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
