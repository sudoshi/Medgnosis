import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemHealthTab } from './SystemHealthTab.js';
import type { SystemAlertingStatus, SystemHealth } from './types.js';

const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
}));

vi.mock('../../services/api.js', () => ({
  api: {
    get: mockApiGet,
    post: mockApiPost,
  },
}));

function renderHealthTab() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SystemHealthTab />
    </QueryClientProvider>,
  );
}

const health: SystemHealth = {
  api: { status: 'ok', node_env: 'test' },
  database: { status: 'ok' },
  redis: {
    status: 'ok',
    endpoint: 'localhost:6379/0',
    pubsub: {
      alert_pattern: 'medgnosis:alerts:*',
      patterns: 1,
      alert_channels: 2,
    },
  },
  solr: {
    status: 'degraded',
    enabled: true,
    url: 'http://localhost:8984/solr',
    cores: [
      { role: 'search', name: 'search', healthy: true, status: { name: 'search' } },
      { role: 'clinical', name: 'clinical', healthy: false, status: { name: 'clinical' } },
    ],
  },
  auth: {
    status: 'ok',
    local_enabled: true,
    oidc_enabled: true,
    providers: [
      {
        provider_type: 'local',
        display_name: 'Email and password',
        enabled: true,
        status: 'ok',
        updated_at: '2026-06-26T00:00:00Z',
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
    ],
  },
  workers: {
    status: 'degraded',
    total_workers: 3,
    counts: { waiting: 2, active: 1, delayed: 0, failed: 0 },
    completed_recent: 9,
    failure_rate: 0.1,
    stalled_queues: 1,
    queues: [
      {
        name: 'medgnosis-ehr-bulk-import',
        label: 'EHR Bulk import',
        role: 'ehr_bulk',
        status: 'ok',
        workers: 1,
        paused: false,
        counts: { waiting: 2, active: 1, delayed: 0, failed: 0 },
        stalled: false,
        completed_recent: 7,
      },
      {
        name: 'medgnosis-nightly',
        label: 'Nightly scheduler',
        role: 'scheduler',
        status: 'degraded',
        workers: 0,
        paused: false,
        counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
        repeatable_jobs: 0,
        next_run_at: '2026-06-21T02:00:00Z',
        latest_completed_at: '2026-06-20T02:00:00Z',
        stalled: true,
        completed_recent: 2,
      },
    ],
  },
  scheduler: {
    status: 'blocked',
    queue: 'medgnosis-nightly',
    workers: 0,
    paused: false,
    repeatable_scheduled: true,
    next_run_at: '2026-06-27T02:00:00Z',
    last_run_at: '2026-06-24T02:00:00Z',
    last_success_at: '2026-06-24T02:00:00Z',
    last_failure_at: '2026-06-23T02:00:00Z',
    completed_recent: 5,
    failed_recent: 1,
    hours_since_last_run: 48,
    missed: true,
    stale_after_hours: 36,
    issues: ['Nightly scheduler has no active worker'],
  },
  migrations: {
    status: 'degraded',
    migrations: {
      applied: 92,
      latest_name: '092_ehr_capability_snapshot',
      latest_applied_at: '2026-06-25T12:00:00Z',
      pending: 2,
    },
    materialized_views: {
      total: 4,
      populated: 3,
      unpopulated: 1,
      names_unpopulated: ['phm_star.fact_patient_composite'],
    },
    issues: ['2 migration ledger row(s) are not marked applied'],
  },
  observability: {
    status: 'blocked',
    worker_queue: {
      depth: 3,
      failed: 1,
      failure_rate: 0.1,
      completed_recent: 9,
      stalled_queues: 1,
    },
    scheduler: {
      last_run_at: '2026-06-24T02:00:00Z',
      last_success_at: '2026-06-24T02:00:00Z',
      missed: true,
      hours_since_last_run: 48,
    },
    ehr_launch: {
      started_24h: 4,
      succeeded_24h: 2,
      failed_24h: 1,
      denied_24h: 1,
      success_rate_24h: 0.5,
    },
    bulk_import: {
      completed_24h: 4,
      failed_24h: 0,
      active: 3,
      failure_rate_24h: 0,
    },
    cql_engine: {
      status: 'disabled',
      runtime_configured: false,
      available: false,
    },
    qdm_bridge: {
      status: 'disabled',
      blocking_issues: 0,
    },
  },
  ehr_tenants: {
    status: 'blocked',
    tenants: {
      total: 3,
      active: 2,
      disabled: 1,
      healthy: 1,
      degraded: 0,
      blocked: 1,
      production: 1,
      sandbox: 2,
      staging: 0,
    },
    discovery: {
      with_snapshots: 2,
      smart_ok: 1,
      capability_ok: 2,
      with_resource_support: 2,
      issuer_mismatches: 0,
      missing_authorization_endpoint: 0,
      missing_token_endpoint: 1,
      latest_snapshot_at: '2026-06-26T20:00:00Z',
    },
    backend_services: {
      tenants_with_enabled_clients: 2,
      enabled_clients: 2,
      ready_for_token_exchange: 1,
      credentials_incomplete: 1,
      scopes_missing: 0,
      token_requests_24h: 3,
      latest_token_issued_at: '2026-06-26T19:00:00Z',
      latest_token_expired: 0,
    },
    smart_launch: {
      launches_started_24h: 4,
      launches_denied_24h: 1,
      callbacks_succeeded_24h: 2,
      callbacks_failed_24h: 0,
      handoffs_completed_24h: 2,
      expired_pending_launches: 0,
      latest_success_at: '2026-06-26T19:30:00Z',
    },
    fhir_api: {
      failed_requests_24h: 6,
      auth_failures_24h: 3,
      rate_limit_failures_24h: 1,
      network_failures_24h: 2,
      backend_token_failures_24h: 1,
      backend_token_auth_failures_24h: 1,
      latest_failure_at: '2026-06-26T19:45:00Z',
      affected_resource_types: ['Observation', 'Patient'],
    },
    resource_coverage: {
      required_resource_types: ['Condition', 'Encounter', 'Observation', 'Patient'],
      tenants_with_required_bulk_coverage: 1,
      tenants_missing_required_bulk_coverage: 1,
      average_required_bulk_coverage: 0.875,
    },
    issues: [
      '1 active EHR tenant(s) are missing SMART token endpoints',
      '1 enabled Backend Services client(s) have incomplete credentials',
    ],
  },
  ehr_bulk: {
    status: 'ok',
    queue_enabled: true,
    tenants: {
      total: 2,
      active: 1,
      with_backend_services: 1,
      with_capability_snapshots: 1,
      ready_for_bulk: 1,
    },
    schedules: {
      enabled: 2,
      due: 0,
      failed_24h: 0,
      next_run_at: '2026-06-20T02:00:00Z',
    },
    bulk_jobs: {
      active: 3,
      failed_24h: 0,
      completed_24h: 4,
      latest_completed_at: '2026-06-19T01:30:00Z',
    },
    issues: [],
  },
  ehr_sync_alerts: {
    status: 'ok',
    enabled: true,
    configured: true,
    nightly_enabled: true,
    endpoint_host: 'ops.example',
    last_dispatch_at: '2026-06-25T22:00:00Z',
    last_dispatch_status: 'sent',
    last_dispatch_reason: 'sent',
    last_issue_count: 3,
    last_critical_issue_count: 1,
    last_warning_issue_count: 2,
  },
  standards: {
    status: 'ok',
    checks: [
      {
        key: 'cql',
        label: 'CQL Engine',
        status: 'disabled',
        runtime_configured: false,
        detail: 'Smoke assets present; optional sidecar runtime URL is not configured',
        commands: ['bash scripts/cql-engine-smoke.sh'],
        artifacts: { present: 4, total: 4, missing: [] },
      },
      {
        key: 'fhir',
        label: 'FHIR US Core / QI-Core',
        status: 'ok',
        runtime_configured: true,
        detail: 'FHIR validator and golden fixtures are available',
        commands: ['VALIDATOR_JAR=validator_cli.jar ./scripts/fhir-validate.sh'],
        artifacts: { present: 5, total: 5, missing: [] },
      },
      {
        key: 'deqm',
        label: 'Da Vinci DEQM',
        status: 'ok',
        runtime_configured: true,
        detail: 'DEQM validator and Gaps-in-Care fixture are available',
        commands: ['VALIDATOR_JAR=validator_cli.jar ./scripts/deqm-validate.sh'],
        artifacts: { present: 3, total: 3, missing: [] },
      },
    ],
    issues: [],
  },
  duration_ms: 12,
};

const systemAlertingStatus: SystemAlertingStatus = {
  status: 'ok',
  enabled: true,
  configured: true,
  nightly_enabled: true,
  endpoint_host: 'sysalerts.example',
  last_dispatch_at: '2026-06-25T23:00:00Z',
  last_dispatch_status: 'sent',
  last_dispatch_reason: 'sent',
  last_severity: 'critical',
  last_issue_count: 4,
  last_critical_issue_count: 2,
  last_warning_issue_count: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApiGet.mockImplementation((path: string) => {
    if (path === '/admin/system-health/system-alerts/status') {
      return Promise.resolve({ success: true, data: { systemAlertingStatus } });
    }
    return Promise.resolve({ success: true, data: health });
  });
  mockApiPost.mockImplementation((path: string) => {
    if (path === '/admin/system-health/system-alerts/dispatch') {
      return Promise.resolve({
        success: true,
        data: {
          systemAlertDispatch: {
            status: 'sent',
            reason: 'sent',
            enabled: true,
            configured: true,
            endpointHost: 'sysalerts.example',
            generatedAt: '2026-06-25T23:30:00Z',
            overallStatus: 'degraded',
            severity: 'critical',
            issueCount: 4,
            criticalIssueCount: 2,
            warningIssueCount: 2,
            statusCode: 202,
          },
        },
      });
    }
    return Promise.resolve({
      success: true,
      data: {
        ehrSyncAlertDispatch: {
          status: 'sent',
          reason: 'sent',
          enabled: true,
          configured: true,
          endpointHost: 'ops.example',
          generatedAt: '2026-06-25T22:30:00Z',
          tenantCount: 1,
          issueCount: 3,
          criticalIssueCount: 1,
          warningIssueCount: 2,
          statusCode: 202,
        },
      },
    });
  });
});

describe('SystemHealthTab', () => {
  it('renders worker queue and EHR Bulk readiness visibility', async () => {
    renderHealthTab();

    expect(await screen.findByText('Workers & Queues')).toBeInTheDocument();
    expect(screen.getByText('3 workers / W 2 / A 1 / D 0 / F 0')).toBeInTheDocument();
    expect(screen.getByText('localhost:6379/0 / alerts 2 channels / 1 patterns')).toBeInTheDocument();
    expect(screen.getByText('Enabled / search ok / clinical down')).toBeInTheDocument();
    expect(screen.getByText('EHR Bulk import')).toBeInTheDocument();
    expect(screen.getByText('medgnosis-ehr-bulk-import')).toBeInTheDocument();
    expect(screen.getByText(/Next .* Last complete/)).toBeInTheDocument();
    expect(screen.getByText('EHR Bulk Readiness')).toBeInTheDocument();
    expect(screen.getByText('1/1 active tenants ready')).toBeInTheDocument();
    expect(screen.getByText('2 enabled / 0 due')).toBeInTheDocument();
    expect(screen.getByText('3 active / 0 failed')).toBeInTheDocument();
    expect(screen.getByText('Standards Readiness')).toBeInTheDocument();
    expect(screen.getByText('2/3 checks ready')).toBeInTheDocument();
    expect(screen.getByText('CQL Engine')).toBeInTheDocument();
    expect(screen.getByText('FHIR US Core / QI-Core')).toBeInTheDocument();
    expect(screen.getByText('Da Vinci DEQM')).toBeInTheDocument();
    expect(screen.getByText('Artifacts 4/4 / runtime optional')).toBeInTheDocument();
    expect(screen.getByText('VALIDATOR_JAR=validator_cli.jar ./scripts/fhir-validate.sh')).toBeInTheDocument();
    expect(screen.getByText('EHR/FHIR Tenant Readiness')).toBeInTheDocument();
    expect(screen.getAllByText('1/2 active tenants healthy').length).toBeGreaterThan(0);
    expect(screen.getByText('1 healthy / 0 degraded')).toBeInTheDocument();
    expect(screen.getByText('1 blocked / 1 disabled')).toBeInTheDocument();
    expect(screen.getByText('1/2 SMART')).toBeInTheDocument();
    expect(screen.getByText('1/2 token-ready')).toBeInTheDocument();
    expect(screen.getByText('88% average')).toBeInTheDocument();
    expect(screen.getByText('4 starts / 2 callbacks')).toBeInTheDocument();
    expect(screen.getByText('1 denied / 0 failed')).toBeInTheDocument();
    expect(screen.getByText('6 failed / 3 auth')).toBeInTheDocument();
    expect(screen.getByText('1 rate / 2 network')).toBeInTheDocument();
    expect(screen.getByText('1 total / 1 auth')).toBeInTheDocument();
    expect(screen.getByText('Observation, Patient')).toBeInTheDocument();
    expect(screen.getByText('1 enabled Backend Services client(s) have incomplete credentials')).toBeInTheDocument();
    expect(screen.getByText('EHR Sync Alerts')).toBeInTheDocument();
    expect(screen.getByText('ops.example')).toBeInTheDocument();
    expect(screen.getByText('Authentication Providers')).toBeInTheDocument();
    expect(screen.getByText('Authentik')).toBeInTheDocument();
    expect(screen.getByText((text) => text.startsWith('OK /') && text.endsWith('/ 45 ms'))).toBeInTheDocument();
    expect(screen.getByText('https://issuer.example.test')).toBeInTheDocument();
    expect(screen.getAllByText('Configured').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Enabled').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Healthy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /bulk export/i })).not.toBeInTheDocument();
  });

  it('dispatches the EHR sync alert snapshot from System Health', async () => {
    const user = userEvent.setup();
    renderHealthTab();

    await user.click(await screen.findByRole('button', { name: /^dispatch$/i }));

    expect(mockApiPost).toHaveBeenCalledWith('/admin/system-health/ehr-sync-alerts/dispatch');
    expect(await screen.findByText('sent / sent / 3 issues')).toBeInTheDocument();
  });

  it('renders scheduler, migrations and observability rollup sections', async () => {
    renderHealthTab();

    // Scheduler card: last-run/success/failure + missed detection.
    expect(await screen.findByRole('heading', { name: 'Nightly Scheduler' })).toBeInTheDocument();
    expect(screen.getAllByText('medgnosis-nightly').length).toBeGreaterThan(0);
    expect(screen.getAllByText('48h ago').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Missed window').length).toBeGreaterThan(0);
    expect(screen.getByText('Schedule registered')).toBeInTheDocument();
    expect(screen.getByText('5 completed / 1 failed (staleness 36h)')).toBeInTheDocument();
    expect(screen.getByText('Nightly scheduler has no active worker')).toBeInTheDocument();

    // Migrations card: applied/pending + matview populated/unpopulated.
    expect(screen.getByRole('heading', { name: 'Migrations' })).toBeInTheDocument();
    expect(screen.getAllByText('92 applied / 2 pending').length).toBeGreaterThan(0);
    expect(screen.getByText('3/4 populated')).toBeInTheDocument();
    expect(screen.getByText('1 unpopulated')).toBeInTheDocument();
    expect(screen.getByText('Unpopulated phm_star.fact_patient_composite')).toBeInTheDocument();

    // Observability rollup reflecting the flat observability fields.
    expect(screen.getByText('Observability Rollup')).toBeInTheDocument();
    expect(screen.getByText('Depth 3 / 1 failed')).toBeInTheDocument();
    expect(screen.getByText('Failure 10% / 1 stalled')).toBeInTheDocument();
    expect(screen.getByText('2 ok / 1 failed')).toBeInTheDocument();
    expect(screen.getByText('Success 50%')).toBeInTheDocument();
    expect(screen.getByText('Unavailable / runtime optional')).toBeInTheDocument();
    expect(screen.getByText('0 blocking issue(s)')).toBeInTheDocument();

    // Additive worker metrics on the existing worker display.
    expect(screen.getByText('9 completed recent / failure 10% / 1 stalled')).toBeInTheDocument();
    expect(screen.getByText('2 completed / stalled')).toBeInTheDocument();
  });

  it('renders system alerting status and dispatches a system alert', async () => {
    const user = userEvent.setup();
    renderHealthTab();

    expect(await screen.findByText('System Alerting')).toBeInTheDocument();
    expect(screen.getByText('sysalerts.example')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /dispatch system alert/i }));

    expect(mockApiPost).toHaveBeenCalledWith('/admin/system-health/system-alerts/dispatch');
    expect(await screen.findByText('sent / sent / 4 issues')).toBeInTheDocument();
  });
});
