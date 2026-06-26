import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSql, mockGetSystemHealth } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockGetSystemHealth: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
// Mock systemHealth wholesale: the real module transitively imports config.ts
// (which requires DATABASE_URL). systemAlerts only consumes getSystemHealth at
// runtime; the remaining systemHealth exports are types (erased at runtime).
vi.mock('./systemHealth.js', () => ({ getSystemHealth: mockGetSystemHealth }));

import type { SystemHealth, HealthStatus } from './systemHealth.js';
import {
  buildSystemAlertSnapshot,
  buildSystemAlertSnapshotFromHealth,
  deriveSystemAlertIssues,
  dispatchSystemAlertSnapshot,
  getSystemAlertSettings,
  getSystemAlertingStatus,
  isSystemAlertNightlyEnabled,
  systemAlertAuditDetails,
} from './systemAlerts.js';

const SYSTEM_ALERT_ENV_KEYS = [
  'SYSTEM_ALERTING_ENABLED',
  'SYSTEM_ALERT_WEBHOOK_URL',
  'SYSTEM_ALERT_WEBHOOK_SECRET',
  'SYSTEM_ALERT_NIGHTLY_ENABLED',
  'SYSTEM_ALERT_TIMEOUT_MS',
] as const;

function clearAlertEnv(): void {
  for (const key of SYSTEM_ALERT_ENV_KEYS) {
    delete process.env[key];
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  clearAlertEnv();
});

describe('getSystemAlertSettings', () => {
  it('is disabled and unconfigured by default (env off)', () => {
    const settings = getSystemAlertSettings();
    expect(settings).toEqual({
      enabled: false,
      configured: false,
      nightlyEnabled: false,
      endpointHost: null,
      timeoutMs: 5000,
    });
  });

  it('only reports configured when enabled AND a valid webhook URL is present', () => {
    process.env['SYSTEM_ALERTING_ENABLED'] = 'true';
    process.env['SYSTEM_ALERT_WEBHOOK_URL'] = 'https://ops.example.test/hooks/medgnosis';
    process.env['SYSTEM_ALERT_NIGHTLY_ENABLED'] = 'true';

    const settings = getSystemAlertSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.configured).toBe(true);
    expect(settings.endpointHost).toBe('ops.example.test');
    expect(settings.nightlyEnabled).toBe(true);
  });

  it('clamps the dispatch timeout to a safe range', () => {
    process.env['SYSTEM_ALERT_TIMEOUT_MS'] = '50';
    expect(getSystemAlertSettings().timeoutMs).toBe(1000);
    process.env['SYSTEM_ALERT_TIMEOUT_MS'] = '999999';
    expect(getSystemAlertSettings().timeoutMs).toBe(30_000);
  });
});

describe('deriveSystemAlertIssues', () => {
  it('raises no issues when every component is healthy', () => {
    const issues = deriveSystemAlertIssues(healthFixture());
    expect(issues).toEqual([]);
  });

  it('raises a critical worker-queue-stalled alert', () => {
    const health = healthFixture({
      workers: { ...healthFixture().workers, status: 'blocked', stalled_queues: 2 },
    });
    const issues = deriveSystemAlertIssues(health);
    const stalled = issues.find((issue) => issue.code === 'worker_queue_stalled');
    expect(stalled).toMatchObject({ severity: 'critical', component: 'workers' });
    expect(stalled?.metrics['stalledQueues']).toBe(2);
  });

  it('raises a critical nightly-job-missed alert when the batch is stale', () => {
    const health = healthFixture({
      scheduler: {
        ...healthFixture().scheduler,
        status: 'blocked',
        missed: true,
        hours_since_last_run: 50,
        last_run_at: '2026-06-24T02:00:00.000Z',
      },
    });
    const issues = deriveSystemAlertIssues(health);
    const missed = issues.find((issue) => issue.code === 'nightly_job_missed');
    expect(missed).toMatchObject({ severity: 'critical', component: 'scheduler' });
  });

  it('raises a warning nightly-job alert when the most recent run failed but is not stale', () => {
    const health = healthFixture({
      scheduler: {
        ...healthFixture().scheduler,
        status: 'degraded',
        missed: false,
        last_success_at: '2026-06-25T02:00:00.000Z',
        last_failure_at: '2026-06-26T02:00:00.000Z',
        last_run_at: '2026-06-26T02:00:00.000Z',
        failed_recent: 1,
      },
    });
    const missed = deriveSystemAlertIssues(health).find((issue) => issue.code === 'nightly_job_missed');
    expect(missed).toMatchObject({ severity: 'warning' });
  });

  it('raises a critical cql-engine-unavailable alert only when configured but unavailable', () => {
    const configuredDown = healthFixture({
      observability: {
        ...healthFixture().observability,
        cql_engine: { status: 'degraded', runtime_configured: true, available: false },
      },
    });
    expect(
      deriveSystemAlertIssues(configuredDown).some((issue) => issue.code === 'cql_engine_unavailable'),
    ).toBe(true);

    const unconfigured = healthFixture({
      observability: {
        ...healthFixture().observability,
        cql_engine: { status: 'disabled', runtime_configured: false, available: false },
      },
    });
    expect(
      deriveSystemAlertIssues(unconfigured).some((issue) => issue.code === 'cql_engine_unavailable'),
    ).toBe(false);
  });

  it('raises a qdm-bridge-blocked warning when bridge artifacts are missing', () => {
    const health = healthFixture({
      observability: {
        ...healthFixture().observability,
        qdm_bridge: { status: 'degraded', blocking_issues: 2 },
      },
    });
    const blocked = deriveSystemAlertIssues(health).find((issue) => issue.code === 'qdm_bridge_blocked');
    expect(blocked).toMatchObject({ severity: 'warning', component: 'qdm_bridge' });
  });

  it('raises a health-degraded catch-all when a core service regresses', () => {
    const health = healthFixture({ database: { status: 'error', error: 'connection refused' } });
    const degraded = deriveSystemAlertIssues(health).find((issue) => issue.code === 'health_degraded');
    expect(degraded).toMatchObject({ severity: 'critical', component: 'system' });
    expect(degraded?.metrics['overallStatus']).toBe('error');
  });
});

describe('buildSystemAlertSnapshotFromHealth', () => {
  it('produces a PHI-safe aggregate snapshot with severity rollup', () => {
    const health = healthFixture({
      workers: { ...healthFixture().workers, status: 'blocked', stalled_queues: 1 },
    });
    const snapshot = buildSystemAlertSnapshotFromHealth(health, new Date('2026-06-26T22:00:00Z'));

    expect(snapshot).toMatchObject({
      eventType: 'system.health.alert_snapshot',
      schemaVersion: 1,
      generatedAt: '2026-06-26T22:00:00.000Z',
      severity: 'critical',
    });
    expect(snapshot.issueCounts.total).toBeGreaterThan(0);

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/patient/i);
    expect(serialized).not.toMatch(/mrn/i);
    expect(serialized).not.toMatch(/ssn/i);
  });

  it('buildSystemAlertSnapshot reads from getSystemHealth', async () => {
    mockGetSystemHealth.mockResolvedValue(healthFixture());
    const snapshot = await buildSystemAlertSnapshot(new Date('2026-06-26T22:00:00Z'));
    expect(mockGetSystemHealth).toHaveBeenCalledTimes(1);
    expect(snapshot.severity).toBe('ok');
    expect(snapshot.issueCounts.total).toBe(0);
  });
});

describe('dispatchSystemAlertSnapshot', () => {
  it('is gated OFF by default and never calls fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await dispatchSystemAlertSnapshot();
    expect(result).toMatchObject({ status: 'skipped', reason: 'disabled', enabled: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockGetSystemHealth).not.toHaveBeenCalled();
  });

  it('skips when enabled but no webhook is configured', async () => {
    process.env['SYSTEM_ALERTING_ENABLED'] = 'true';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await dispatchSystemAlertSnapshot();
    expect(result).toMatchObject({ status: 'skipped', reason: 'not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('skips dispatch with no_issues when health is clean', async () => {
    process.env['SYSTEM_ALERTING_ENABLED'] = 'true';
    process.env['SYSTEM_ALERT_WEBHOOK_URL'] = 'https://ops.example.test/hook';
    mockGetSystemHealth.mockResolvedValue(healthFixture());
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await dispatchSystemAlertSnapshot();
    expect(result).toMatchObject({ status: 'skipped', reason: 'no_issues' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('signs and POSTs the snapshot when enabled, configured, and issues exist', async () => {
    process.env['SYSTEM_ALERTING_ENABLED'] = 'true';
    process.env['SYSTEM_ALERT_WEBHOOK_URL'] = 'https://ops.example.test/hook';
    process.env['SYSTEM_ALERT_WEBHOOK_SECRET'] = 'shhh';
    mockGetSystemHealth.mockResolvedValue(
      healthFixture({ scheduler: { ...healthFixture().scheduler, status: 'blocked', missed: true } }),
    );
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await dispatchSystemAlertSnapshot();
    expect(result).toMatchObject({ status: 'sent', reason: 'sent', statusCode: 202 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-medgnosis-signature']).toMatch(/^sha256=/);
    expect(headers['x-medgnosis-event']).toBe('system.health.alert_snapshot');
  });

  it('reports webhook_failed on a non-2xx response', async () => {
    process.env['SYSTEM_ALERTING_ENABLED'] = 'true';
    process.env['SYSTEM_ALERT_WEBHOOK_URL'] = 'https://ops.example.test/hook';
    mockGetSystemHealth.mockResolvedValue(
      healthFixture({ scheduler: { ...healthFixture().scheduler, status: 'blocked', missed: true } }),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const result = await dispatchSystemAlertSnapshot();
    expect(result).toMatchObject({ status: 'failed', reason: 'webhook_failed', statusCode: 500 });
  });
});

describe('getSystemAlertingStatus', () => {
  it('is disabled when alerting is off, regardless of audit history', async () => {
    mockSql.mockResolvedValue([]);
    const status = await getSystemAlertingStatus();
    expect(status).toMatchObject({ status: 'disabled', enabled: false, configured: false });
  });

  it('reads the latest dispatch audit row when enabled and configured', async () => {
    process.env['SYSTEM_ALERTING_ENABLED'] = 'true';
    process.env['SYSTEM_ALERT_WEBHOOK_URL'] = 'https://ops.example.test/hook';
    mockSql.mockResolvedValue([
      {
        created_at: '2026-06-26T02:00:00+00',
        details: {
          status: 'failed',
          reason: 'webhook_failed',
          severity: 'critical',
          issueCount: 3,
          criticalIssueCount: 2,
          warningIssueCount: 1,
        },
      },
    ]);

    const status = await getSystemAlertingStatus();
    expect(status).toMatchObject({
      status: 'degraded',
      enabled: true,
      configured: true,
      last_dispatch_status: 'failed',
      last_dispatch_reason: 'webhook_failed',
      last_severity: 'critical',
      last_issue_count: 3,
      last_critical_issue_count: 2,
    });
  });

  it('degrades gracefully when the audit query fails', async () => {
    process.env['SYSTEM_ALERTING_ENABLED'] = 'true';
    process.env['SYSTEM_ALERT_WEBHOOK_URL'] = 'https://ops.example.test/hook';
    mockSql.mockRejectedValue(new Error('audit_log unavailable'));

    const status = await getSystemAlertingStatus();
    expect(status).toMatchObject({ status: 'degraded', error: 'audit_log unavailable' });
  });
});

describe('isSystemAlertNightlyEnabled & systemAlertAuditDetails', () => {
  it('requires enabled + configured + nightly to gate nightly dispatch', () => {
    expect(isSystemAlertNightlyEnabled()).toBe(false);
    process.env['SYSTEM_ALERTING_ENABLED'] = 'true';
    process.env['SYSTEM_ALERT_WEBHOOK_URL'] = 'https://ops.example.test/hook';
    expect(isSystemAlertNightlyEnabled()).toBe(false);
    process.env['SYSTEM_ALERT_NIGHTLY_ENABLED'] = 'true';
    expect(isSystemAlertNightlyEnabled()).toBe(true);
  });

  it('produces PHI-safe audit details with no raw error string', () => {
    const details = systemAlertAuditDetails(
      {
        status: 'failed',
        reason: 'webhook_error',
        enabled: true,
        configured: true,
        endpointHost: 'ops.example.test',
        generatedAt: '2026-06-26T22:00:00.000Z',
        overallStatus: 'degraded',
        severity: 'critical',
        issueCount: 2,
        criticalIssueCount: 1,
        warningIssueCount: 1,
        error: 'ECONNRESET to internal host 10.0.0.5',
      },
      'nightly',
    );
    expect(details).toMatchObject({
      status: 'failed',
      reason: 'webhook_error',
      severity: 'critical',
      errorPresent: true,
      triggeredBy: 'nightly',
    });
    expect(JSON.stringify(details)).not.toContain('10.0.0.5');
  });
});

// ---------------------------------------------------------------------------
// Fixtures — a fully-healthy SystemHealth that each test mutates.
// ---------------------------------------------------------------------------

function healthFixture(overrides: Partial<SystemHealth> = {}): SystemHealth {
  const okStatus: HealthStatus = 'ok';
  const base: SystemHealth = {
    api: { status: okStatus, node_env: 'test' },
    database: { status: okStatus },
    redis: { status: okStatus, endpoint: 'localhost:6379/0' },
    solr: { status: 'disabled', enabled: false, url: 'http://localhost:8984/solr', cores: [] },
    auth: { status: okStatus, local_enabled: true, oidc_enabled: false, providers: [] },
    workers: {
      status: okStatus,
      total_workers: 4,
      counts: { waiting: 0, active: 1, delayed: 0, failed: 0 },
      completed_recent: 10,
      failure_rate: 0,
      stalled_queues: 0,
      queues: [],
    },
    scheduler: {
      status: okStatus,
      queue: 'medgnosis-nightly',
      workers: 1,
      paused: false,
      repeatable_scheduled: true,
      next_run_at: '2026-06-27T02:00:00.000Z',
      last_run_at: '2026-06-26T02:00:00.000Z',
      last_success_at: '2026-06-26T02:00:00.000Z',
      last_failure_at: null,
      completed_recent: 1,
      failed_recent: 0,
      hours_since_last_run: 6,
      missed: false,
      stale_after_hours: 36,
      issues: [],
    },
    migrations: {
      status: okStatus,
      migrations: { applied: 92, latest_name: '092_x.sql', latest_applied_at: '2026-06-26T00:00:00Z', pending: 0 },
      materialized_views: { total: 7, populated: 7, unpopulated: 0, names_unpopulated: [] },
      issues: [],
    },
    observability: {
      status: okStatus,
      worker_queue: { depth: 1, failed: 0, failure_rate: 0, completed_recent: 10, stalled_queues: 0 },
      scheduler: { last_run_at: '2026-06-26T02:00:00.000Z', last_success_at: '2026-06-26T02:00:00.000Z', missed: false, hours_since_last_run: 6 },
      ehr_launch: { started_24h: 4, succeeded_24h: 4, failed_24h: 0, denied_24h: 0, success_rate_24h: 1 },
      bulk_import: { completed_24h: 4, failed_24h: 0, active: 0, failure_rate_24h: 0 },
      cql_engine: { status: 'ok', runtime_configured: true, available: true },
      qdm_bridge: { status: 'ok', blocking_issues: 0 },
    },
    ehr_tenants: {
      status: 'disabled',
      tenants: { total: 0, active: 0, disabled: 0, healthy: 0, degraded: 0, blocked: 0, production: 0, sandbox: 0, staging: 0 },
      discovery: { with_snapshots: 0, smart_ok: 0, capability_ok: 0, with_resource_support: 0, issuer_mismatches: 0, missing_authorization_endpoint: 0, missing_token_endpoint: 0, latest_snapshot_at: null },
      backend_services: { tenants_with_enabled_clients: 0, enabled_clients: 0, ready_for_token_exchange: 0, credentials_incomplete: 0, scopes_missing: 0, token_requests_24h: 0, latest_token_issued_at: null, latest_token_expired: 0 },
      smart_launch: { launches_started_24h: 0, launches_denied_24h: 0, callbacks_succeeded_24h: 0, callbacks_failed_24h: 0, handoffs_completed_24h: 0, expired_pending_launches: 0, latest_success_at: null },
      fhir_api: { failed_requests_24h: 0, auth_failures_24h: 0, rate_limit_failures_24h: 0, network_failures_24h: 0, backend_token_failures_24h: 0, backend_token_auth_failures_24h: 0, latest_failure_at: null, affected_resource_types: [] },
      resource_coverage: { required_resource_types: [], tenants_with_required_bulk_coverage: 0, tenants_missing_required_bulk_coverage: 0, average_required_bulk_coverage: null },
      issues: [],
    },
    ehr_bulk: {
      status: 'disabled',
      queue_enabled: true,
      tenants: { total: 0, active: 0, with_backend_services: 0, with_capability_snapshots: 0, ready_for_bulk: 0 },
      schedules: { enabled: 0, due: 0, failed_24h: 0, next_run_at: null },
      bulk_jobs: { active: 0, failed_24h: 0, completed_24h: 4, latest_completed_at: null },
      issues: [],
    },
    ehr_sync_alerts: {
      status: 'disabled',
      enabled: false,
      configured: false,
      nightly_enabled: false,
      endpoint_host: null,
      last_dispatch_at: null,
      last_dispatch_status: null,
      last_dispatch_reason: null,
      last_issue_count: null,
      last_critical_issue_count: null,
      last_warning_issue_count: null,
    },
    standards: {
      status: okStatus,
      checks: [
        {
          key: 'cql',
          label: 'CQL Engine',
          status: okStatus,
          runtime_configured: true,
          detail: 'ok',
          commands: [],
          artifacts: { present: 4, total: 4, missing: [] },
        },
      ],
      issues: [],
    },
    duration_ms: 12,
  };

  return { ...base, ...overrides };
}
