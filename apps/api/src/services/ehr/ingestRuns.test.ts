// =============================================================================
// Unit tests — EHR ingest run tracking
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;
  return { mockSql: fn };
});
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { failIngestRun, finishIngestRun, startIngestRun } from './ingestRuns.js';

beforeEach(() => vi.clearAllMocks());

const runId = '00000000-0000-4000-8000-000000000063';

const runRow = {
  id: runId,
  org_id: 7,
  ehr_tenant_id: 42,
  resource_type: 'Patient',
  mode: 'incremental',
  status: 'running',
  requested_since: '2026-06-16 00:00:00+00',
  started_at: '2026-06-16 12:00:00+00',
  finished_at: null,
  resources_received: 0,
  resources_staged: 0,
  resources_updated: 0,
  error_count: 0,
  error_message: null,
  errors: [],
  metadata: { search: { _since: '2026-06-16T00:00:00Z' } },
  created_at: '2026-06-16 12:00:00+00',
  updated_at: '2026-06-16 12:00:00+00',
} as const;

describe('startIngestRun', () => {
  it('creates a running ingest run with org, tenant, resource type, and metadata', async () => {
    mockSql.mockResolvedValueOnce([runRow]);

    const run = await startIngestRun({
      orgId: 7,
      ehrTenantId: 42,
      resourceType: ' Patient ',
      mode: 'incremental',
      requestedSince: '2026-06-16T00:00:00Z',
      metadata: { search: { _since: '2026-06-16T00:00:00Z' } },
    });

    expect(run).toMatchObject({
      id: runId,
      orgId: 7,
      ehrTenantId: 42,
      resourceType: 'Patient',
      status: 'running',
    });
    expect(run.errors).toEqual([]);

    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toEqual(
      expect.arrayContaining([
        7,
        42,
        'Patient',
        'incremental',
        '2026-06-16T00:00:00Z',
        { search: { _since: '2026-06-16T00:00:00Z' } },
      ]),
    );
  });

  it('rejects empty resource types before writing', async () => {
    await expect(
      startIngestRun({ orgId: 7, ehrTenantId: 42, resourceType: '   ' }),
    ).rejects.toThrow('resourceType cannot be empty');

    expect(mockSql).not.toHaveBeenCalled();
  });
});

describe('finishIngestRun', () => {
  it('marks a run succeeded and updates supplied counters', async () => {
    mockSql.mockResolvedValueOnce([
      {
        ...runRow,
        status: 'succeeded',
        finished_at: '2026-06-16 12:05:00+00',
        resources_received: 10,
        resources_staged: 9,
        resources_updated: 1,
      },
    ]);

    const run = await finishIngestRun({
      id: runId,
      resourcesReceived: 10,
      resourcesStaged: 9,
      resourcesUpdated: 1,
      errorCount: 0,
      metadata: { pageCount: 2 },
    });

    expect(run.status).toBe('succeeded');
    expect(run.resourcesReceived).toBe(10);
    expect(run.finishedAt).toBe('2026-06-16 12:05:00+00');

    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toEqual(expect.arrayContaining([10, 9, 1, 0, { pageCount: 2 }, runId]));
  });
});

describe('failIngestRun', () => {
  it('marks a run failed with structured errors and count defaults', async () => {
    const errors = [{ resourceType: 'Observation', id: 'obs-1', message: 'invalid code' }];
    mockSql.mockResolvedValueOnce([
      {
        ...runRow,
        status: 'failed',
        finished_at: '2026-06-16 12:04:00+00',
        error_count: 1,
        error_message: 'staging failed',
        errors,
      },
    ]);

    const run = await failIngestRun({
      id: runId,
      errorMessage: 'staging failed',
      errors,
      resourcesReceived: 3,
      resourcesStaged: 2,
    });

    expect(run.status).toBe('failed');
    expect(run.errorMessage).toBe('staging failed');
    expect(run.errorCount).toBe(1);
    expect(run.errors).toEqual(errors);

    const values = mockSql.mock.calls[0]!.slice(1);
    expect(values).toEqual(expect.arrayContaining([3, 2, null, 1, 'staging failed', errors, {}, runId]));
  });

  it('validates counters before writing failure updates', async () => {
    await expect(
      failIngestRun({ id: runId, errorMessage: 'bad count', resourcesReceived: -1 }),
    ).rejects.toThrow('counts must be non-negative integers');

    expect(mockSql).not.toHaveBeenCalled();
  });
});
