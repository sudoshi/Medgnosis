import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQueueCtor, mockSql } = vi.hoisted(() => ({
  mockQueueCtor: vi.fn(),
  mockSql: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: mockQueueCtor,
}));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../config.js', () => ({
  config: {
    redisUrl: 'redis://localhost:6379/0',
    solrEnabled: false,
    nodeEnv: 'test',
    localAuthEnabled: true,
  },
}));
vi.mock('../plugins/solr.js', () => ({
  getSolrClient: vi.fn(() => null),
  isSolrAvailable: vi.fn(() => false),
}));
vi.mock('./auth/oidc/providerConfig.js', () => ({
  getOidcProviderConfig: vi.fn(() => ({ enabled: false })),
}));

import { getEhrBulkReadiness, getWorkerQueueHealth } from './systemHealth.js';

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['EHR_BULK_IMPORT_QUEUE_ENABLED'];
});

describe('getWorkerQueueHealth', () => {
  it('aggregates queue counts and repeatable scheduler readiness', async () => {
    mockQueueCtor.mockImplementation(function QueueMock(name: string) {
      return {
      getJobCounts: vi.fn().mockResolvedValue(
        name === 'nightly'
          ? { waiting: 1, active: 0, delayed: 2, failed: 0 }
          : { waiting: 0, active: 1, delayed: 0, failed: 1 },
      ),
      getWorkersCount: vi.fn().mockResolvedValue(name === 'nightly' ? 1 : 2),
      isPaused: vi.fn().mockResolvedValue(false),
      getRepeatableJobs: vi.fn().mockResolvedValue([{ key: 'nightly-repeat' }]),
      close: vi.fn().mockResolvedValue(undefined),
      };
    });

    const health = await getWorkerQueueHealth([
      { name: 'nightly', label: 'Nightly scheduler', role: 'scheduler', repeatable: true },
      { name: 'bulk', label: 'Bulk import', role: 'ehr_bulk' },
    ]);

    expect(health).toMatchObject({
      status: 'degraded',
      total_workers: 3,
      counts: { waiting: 1, active: 1, delayed: 2, failed: 1 },
    });
    expect(health.queues[0]).toMatchObject({
      name: 'nightly',
      status: 'ok',
      repeatable_jobs: 1,
    });
    expect(health.queues[1]).toMatchObject({
      name: 'bulk',
      status: 'degraded',
      counts: { failed: 1 },
    });
  });
});

describe('getEhrBulkReadiness', () => {
  it('summarizes tenant, schedule, and recent Bulk job readiness from DB ledgers', async () => {
    mockSql.mockResolvedValueOnce([
      {
        total_tenants: 3,
        active_tenants: 2,
        backend_services_enabled: 1,
        capability_snapshots: 2,
        ready_for_bulk: 1,
        schedules_enabled: 2,
        schedules_due: 0,
        schedule_failures_24h: 0,
        next_run_at: '2026-06-19 18:00:00+00',
        active_bulk_jobs: 1,
        bulk_failures_24h: 0,
        bulk_completed_24h: 4,
        latest_completed_at: '2026-06-19 16:00:00+00',
      },
    ]);

    const readiness = await getEhrBulkReadiness();

    expect(readiness).toMatchObject({
      status: 'ok',
      queue_enabled: true,
      tenants: {
        total: 3,
        active: 2,
        with_backend_services: 1,
        with_capability_snapshots: 2,
        ready_for_bulk: 1,
      },
      schedules: { enabled: 2, due: 0, failed_24h: 0 },
      bulk_jobs: { active: 1, failed_24h: 0, completed_24h: 4 },
      issues: [],
    });
  });

  it('degrades when the queue is disabled or due schedules need attention', async () => {
    process.env['EHR_BULK_IMPORT_QUEUE_ENABLED'] = 'false';
    mockSql.mockResolvedValueOnce([
      {
        total_tenants: '2',
        active_tenants: '2',
        backend_services_enabled: '0',
        capability_snapshots: '1',
        ready_for_bulk: '0',
        schedules_enabled: '3',
        schedules_due: '2',
        schedule_failures_24h: '1',
        next_run_at: null,
        active_bulk_jobs: '0',
        bulk_failures_24h: '1',
        bulk_completed_24h: '0',
        latest_completed_at: null,
      },
    ]);

    const readiness = await getEhrBulkReadiness();

    expect(readiness.status).toBe('degraded');
    expect(readiness.issues).toEqual([
      'EHR Bulk import queue is disabled',
      'No active EHR tenants have enabled backend-services credentials',
      'No active EHR tenants are ready for Bulk Data',
      '2 enabled Bulk schedules are due for enqueue',
      '1 Bulk schedules failed in the last 24 hours',
      '1 Bulk jobs failed in the last 24 hours',
    ]);
  });
});
