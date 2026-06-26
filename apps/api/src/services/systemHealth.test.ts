import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockQueueCtor,
  mockSql,
  mockConfig,
  mockRedisCtor,
  mockGetSolrClient,
  mockIsSolrAvailable,
  mockGetOidcProviderConfig,
  mockListAuthProviderHealth,
} = vi.hoisted(() => ({
  mockQueueCtor: vi.fn(),
  mockSql: vi.fn(),
  mockRedisCtor: vi.fn(),
  mockGetSolrClient: vi.fn(),
  mockIsSolrAvailable: vi.fn(),
  mockConfig: {
    redisUrl: 'redis://localhost:6379/0',
    solrEnabled: false,
    solrUrl: 'http://localhost:8984/solr',
    solrSearchCore: 'search',
    solrClinicalCore: 'clinical',
    nodeEnv: 'test',
    localAuthEnabled: true,
  },
  mockGetOidcProviderConfig: vi.fn(),
  mockListAuthProviderHealth: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: mockQueueCtor,
}));
vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('ioredis', () => ({
  Redis: mockRedisCtor,
}));
vi.mock('../config.js', () => ({
  config: mockConfig,
}));
vi.mock('../plugins/solr.js', () => ({
  getSolrClient: mockGetSolrClient,
  isSolrAvailable: mockIsSolrAvailable,
}));
vi.mock('./auth/oidc/providerConfig.js', () => ({
  getOidcProviderConfig: mockGetOidcProviderConfig,
}));
vi.mock('./auth/providerHealth.js', () => ({
  listAuthProviderHealth: mockListAuthProviderHealth,
}));

import {
  getAuthHealth,
  getEhrBulkReadiness,
  getEhrTenantReadiness,
  getRedisHealth,
  getSolrHealth,
  getStandardsReadiness,
  getWorkerQueueHealth,
} from './systemHealth.js';

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['EHR_BULK_IMPORT_QUEUE_ENABLED'];
  delete process.env['CQL_ENGINE_URL'];
  process.env['VALIDATOR_JAR'] = 'package.json';
  mockConfig.localAuthEnabled = true;
  mockConfig.solrEnabled = false;
  mockConfig.solrUrl = 'http://localhost:8984/solr';
  mockConfig.solrSearchCore = 'search';
  mockConfig.solrClinicalCore = 'clinical';
  mockRedisCtor.mockImplementation(function RedisMock() {
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      ping: vi.fn().mockResolvedValue('PONG'),
      call: vi.fn().mockImplementation((command: string, subcommand: string) => {
        if (command === 'PUBSUB' && subcommand === 'NUMPAT') return Promise.resolve(1);
        if (command === 'PUBSUB' && subcommand === 'CHANNELS') return Promise.resolve(['medgnosis:alerts:org-1']);
        return Promise.resolve(null);
      }),
      disconnect: vi.fn(),
    };
  });
  mockGetSolrClient.mockReturnValue(null);
  mockIsSolrAvailable.mockReturnValue(false);
  mockGetOidcProviderConfig.mockResolvedValue({ enabled: false });
  mockListAuthProviderHealth.mockResolvedValue([
    {
      provider_type: 'local',
      display_name: 'Email and password',
      enabled: true,
      status: 'ok',
      updated_at: null,
      last_test: null,
      issues: [],
    },
    {
      provider_type: 'oidc',
      display_name: 'Authentik',
      enabled: false,
      status: 'disabled',
      updated_at: null,
      last_test: null,
      issues: [],
    },
  ]);
});

describe('getEhrTenantReadiness', () => {
  it('summarizes active EHR/FHIR tenant readiness from stored evidence', async () => {
    mockSql.mockResolvedValueOnce([
      {
        total_tenants: 3,
        active_tenants: 2,
        disabled_tenants: 1,
        healthy_tenants: 1,
        degraded_tenants: 1,
        blocked_tenants: 0,
        production_tenants: 1,
        sandbox_tenants: 2,
        staging_tenants: 0,
        tenants_with_snapshots: 2,
        tenants_smart_ok: 2,
        tenants_capability_ok: 2,
        tenants_with_resource_support: 2,
        issuer_mismatches: 0,
        missing_authorization_endpoint: 0,
        missing_token_endpoint: 0,
        latest_snapshot_at: '2026-06-26 20:00:00+00',
        tenants_with_enabled_backend_clients: 2,
        enabled_backend_clients: 2,
        tenants_ready_for_token_exchange: 2,
        backend_credentials_incomplete: 0,
        backend_scopes_missing: 0,
        backend_token_requests_24h: 3,
        latest_backend_token_issued_at: '2026-06-26 19:00:00+00',
        latest_backend_token_expired: 1,
        launches_started_24h: 4,
        launches_denied_24h: 0,
        callbacks_succeeded_24h: 2,
        callbacks_failed_24h: 0,
        handoffs_completed_24h: 2,
        expired_pending_launches: 0,
        latest_launch_success_at: '2026-06-26 19:30:00+00',
        fhir_failed_requests_24h: 6,
        fhir_auth_failures_24h: 3,
        fhir_rate_limit_failures_24h: 1,
        fhir_network_failures_24h: 2,
        backend_token_failures_24h: 1,
        backend_token_auth_failures_24h: 1,
        latest_fhir_failure_at: '2026-06-26 19:45:00+00',
        affected_fhir_resource_types: ['Observation', 'Patient'],
        required_bulk_resource_types: ['Condition', 'Encounter', 'Observation', 'Patient'],
        tenants_with_required_bulk_coverage: 1,
        tenants_missing_required_bulk_coverage: 1,
        average_required_bulk_coverage: '0.8750',
      },
    ]);

    const readiness = await getEhrTenantReadiness();

    expect(readiness).toMatchObject({
      status: 'degraded',
      tenants: {
        total: 3,
        active: 2,
        disabled: 1,
        healthy: 1,
        degraded: 1,
        blocked: 0,
        production: 1,
        sandbox: 2,
      },
      discovery: {
        with_snapshots: 2,
        smart_ok: 2,
        capability_ok: 2,
        latest_snapshot_at: '2026-06-26 20:00:00+00',
      },
      backend_services: {
        tenants_with_enabled_clients: 2,
        ready_for_token_exchange: 2,
        token_requests_24h: 3,
        latest_token_expired: 1,
      },
      smart_launch: {
        launches_started_24h: 4,
        callbacks_succeeded_24h: 2,
        latest_success_at: '2026-06-26 19:30:00+00',
      },
      fhir_api: {
        failed_requests_24h: 6,
        auth_failures_24h: 3,
        rate_limit_failures_24h: 1,
        network_failures_24h: 2,
        backend_token_failures_24h: 1,
        backend_token_auth_failures_24h: 1,
        latest_failure_at: '2026-06-26 19:45:00+00',
        affected_resource_types: ['Observation', 'Patient'],
      },
      resource_coverage: {
        required_resource_types: ['Condition', 'Encounter', 'Observation', 'Patient'],
        tenants_with_required_bulk_coverage: 1,
        tenants_missing_required_bulk_coverage: 1,
        average_required_bulk_coverage: 0.875,
      },
    });
    expect(readiness.issues).toEqual([
      '1 active EHR tenant(s) are missing required Bulk resource coverage',
      '1 active EHR tenant(s) have expired latest Backend Services token evidence',
      '3 FHIR API authorization/authentication failure(s) were recorded in the last 24 hours',
      '1 FHIR API rate-limit failure(s) were recorded in the last 24 hours',
      '2 FHIR API network/timeout failure(s) were recorded in the last 24 hours',
      '1 Backend Services token request failure(s) were recorded in the last 24 hours',
    ]);
  });

  it('marks tenant readiness blocked for hard SMART or backend blockers', async () => {
    mockSql.mockResolvedValueOnce([
      {
        total_tenants: '2',
        active_tenants: '2',
        disabled_tenants: '0',
        healthy_tenants: '0',
        degraded_tenants: '0',
        blocked_tenants: '2',
        production_tenants: '1',
        sandbox_tenants: '1',
        staging_tenants: '0',
        tenants_with_snapshots: '2',
        tenants_smart_ok: '1',
        tenants_capability_ok: '2',
        tenants_with_resource_support: '2',
        issuer_mismatches: '1',
        missing_authorization_endpoint: '0',
        missing_token_endpoint: '1',
        latest_snapshot_at: null,
        tenants_with_enabled_backend_clients: '1',
        enabled_backend_clients: '1',
        tenants_ready_for_token_exchange: '0',
        backend_credentials_incomplete: '1',
        backend_scopes_missing: '1',
        backend_token_requests_24h: '0',
        latest_backend_token_issued_at: null,
        latest_backend_token_expired: '0',
        launches_started_24h: '0',
        launches_denied_24h: '1',
        callbacks_succeeded_24h: '0',
        callbacks_failed_24h: '1',
        handoffs_completed_24h: '0',
        expired_pending_launches: '1',
        latest_launch_success_at: null,
        required_bulk_resource_types: ['Condition', 'Encounter', 'Observation', 'Patient'],
        tenants_with_required_bulk_coverage: '0',
        tenants_missing_required_bulk_coverage: '2',
        average_required_bulk_coverage: '0.2500',
      },
    ]);

    const readiness = await getEhrTenantReadiness();

    expect(readiness.status).toBe('blocked');
    expect(readiness.tenants.blocked).toBe(2);
    expect(readiness.issues).toEqual([
      '1 active EHR tenant(s) have SMART issuer drift',
      '1 active EHR tenant(s) are missing SMART token endpoints',
      '1 enabled Backend Services client(s) have incomplete credentials',
      '1 enabled Backend Services client(s) have no requested system scopes',
      '1 active EHR tenant(s) lack successful SMART configuration evidence',
      '2 active EHR tenant(s) are missing required Bulk resource coverage',
      '1 active EHR tenant(s) have no enabled Backend Services client',
      '1 SMART launch denial(s) were recorded in the last 24 hours',
      '1 SMART callback failure(s) were recorded in the last 24 hours',
      '1 pending SMART launch session(s) expired without callback completion',
    ]);
  });

  it('marks tenant readiness disabled when no tenants are active', async () => {
    mockSql.mockResolvedValueOnce([
      {
        total_tenants: '1',
        active_tenants: '0',
        disabled_tenants: '1',
      },
    ]);

    const readiness = await getEhrTenantReadiness();

    expect(readiness.status).toBe('disabled');
    expect(readiness.issues).toEqual(['No EHR tenants are active or testing']);
  });

  it('returns an error section when tenant readiness SQL fails', async () => {
    mockSql.mockRejectedValueOnce(new Error('database unavailable'));

    const readiness = await getEhrTenantReadiness();

    expect(readiness).toMatchObject({
      status: 'error',
      error: 'database unavailable',
      issues: ['database unavailable'],
    });
  });
});

describe('getStandardsReadiness', () => {
  it('reports local CQL, FHIR, and DEQM validation readiness artifacts', async () => {
    const readiness = await getStandardsReadiness();

    expect(readiness).toMatchObject({
      status: 'ok',
      issues: [],
    });
    expect(readiness.checks).toEqual([
      expect.objectContaining({
        key: 'cql',
        label: 'CQL Engine',
        status: 'disabled',
        runtime_configured: false,
        artifacts: expect.objectContaining({ present: 4, total: 4, missing: [] }),
      }),
      expect.objectContaining({
        key: 'fhir',
        label: 'FHIR US Core / QI-Core',
        status: 'ok',
        runtime_configured: true,
        artifacts: expect.objectContaining({ present: 5, total: 5, missing: [] }),
      }),
      expect.objectContaining({
        key: 'deqm',
        label: 'Da Vinci DEQM',
        status: 'ok',
        runtime_configured: true,
        artifacts: expect.objectContaining({ present: 3, total: 3, missing: [] }),
      }),
    ]);
  });

  it('degrades FHIR and DEQM readiness when the configured validator jar is missing', async () => {
    process.env['VALIDATOR_JAR'] = '/tmp/medgnosis-missing-validator.jar';

    const readiness = await getStandardsReadiness();

    expect(readiness.status).toBe('degraded');
    expect(readiness.checks.find((check) => check.key === 'fhir')).toMatchObject({
      status: 'degraded',
      artifacts: { missing: ['/tmp/medgnosis-missing-validator.jar'] },
    });
    expect(readiness.checks.find((check) => check.key === 'deqm')).toMatchObject({
      status: 'degraded',
      artifacts: { missing: ['/tmp/medgnosis-missing-validator.jar'] },
    });
    expect(readiness.issues).toEqual([
      'FHIR US Core / QI-Core missing /tmp/medgnosis-missing-validator.jar',
      'Da Vinci DEQM missing /tmp/medgnosis-missing-validator.jar',
    ]);
  });
});

describe('getRedisHealth', () => {
  it('reports Redis endpoint and alert pub/sub counts', async () => {
    const health = await getRedisHealth();

    expect(health).toEqual({
      status: 'ok',
      endpoint: 'localhost:6379/0',
      pubsub: {
        alert_pattern: 'medgnosis:alerts:*',
        patterns: 1,
        alert_channels: 1,
      },
    });
  });
});

describe('getSolrHealth', () => {
  it('reports configured Solr cores and per-core health', async () => {
    mockConfig.solrEnabled = true;
    mockIsSolrAvailable.mockReturnValue(true);
    mockGetSolrClient.mockReturnValue({
      searchCore: 'search',
      clinicalCore: 'clinical',
      ping: vi.fn().mockImplementation((core: string) => Promise.resolve(core === 'search')),
      coreStatus: vi.fn().mockImplementation((core: string) => Promise.resolve({ status: { [core]: { name: core } } })),
    });

    const health = await getSolrHealth();

    expect(health).toEqual({
      status: 'degraded',
      enabled: true,
      url: 'http://localhost:8984/solr',
      cores: [
        { role: 'search', name: 'search', healthy: true, status: { status: { search: { name: 'search' } } } },
        { role: 'clinical', name: 'clinical', healthy: false, status: { status: { clinical: { name: 'clinical' } } } },
      ],
    });
  });
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
        getRepeatableJobs: vi.fn().mockResolvedValue([{ key: 'nightly-repeat', next: 1_782_000_000_000 }]),
        getJobs: vi.fn().mockResolvedValue(
          name === 'nightly'
            ? [{ finishedOn: 1_781_913_600_000 }]
            : [],
        ),
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
      next_run_at: '2026-06-21T00:00:00.000Z',
      latest_completed_at: '2026-06-20T00:00:00.000Z',
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

describe('getAuthHealth', () => {
  it('aggregates provider health and last-test evidence', async () => {
    mockGetOidcProviderConfig.mockResolvedValueOnce({ enabled: true });
    mockListAuthProviderHealth.mockResolvedValueOnce([
      {
        provider_type: 'local',
        display_name: 'Email and password',
        enabled: true,
        status: 'ok',
        updated_at: null,
        last_test: null,
        issues: [],
      },
      {
        provider_type: 'oidc',
        display_name: 'Authentik',
        enabled: true,
        status: 'ok',
        updated_at: '2026-06-26T00:00:00Z',
        last_test: {
          status: 'ok',
          tested_at: '2026-06-26T01:00:00Z',
          response_ms: 45,
          issuer: 'https://issuer.example.test',
          client_configured: true,
          error_code: null,
          error_message: null,
        },
        issues: [],
      },
    ]);

    const health = await getAuthHealth();

    expect(health).toEqual({
      status: 'ok',
      local_enabled: true,
      oidc_enabled: true,
      providers: [
        expect.objectContaining({ provider_type: 'local', status: 'ok' }),
        expect.objectContaining({
          provider_type: 'oidc',
          status: 'ok',
          last_test: expect.objectContaining({
            status: 'ok',
            tested_at: '2026-06-26T01:00:00Z',
          }),
        }),
      ],
    });
    expect(mockListAuthProviderHealth).toHaveBeenCalledWith({
      localEnabled: true,
      oidcEnabled: true,
    });
  });

  it('degrades auth health when an enabled provider lacks test evidence', async () => {
    mockGetOidcProviderConfig.mockResolvedValueOnce({ enabled: true });
    mockListAuthProviderHealth.mockResolvedValueOnce([
      {
        provider_type: 'local',
        display_name: 'Email and password',
        enabled: true,
        status: 'ok',
        updated_at: null,
        last_test: null,
        issues: [],
      },
      {
        provider_type: 'oidc',
        display_name: 'Authentik',
        enabled: true,
        status: 'degraded',
        updated_at: null,
        last_test: null,
        issues: ['No OIDC provider test has been recorded'],
      },
    ]);

    const health = await getAuthHealth();

    expect(health.status).toBe('degraded');
    expect(health.providers[1]).toMatchObject({
      provider_type: 'oidc',
      status: 'degraded',
      issues: ['No OIDC provider test has been recorded'],
    });
  });
});
