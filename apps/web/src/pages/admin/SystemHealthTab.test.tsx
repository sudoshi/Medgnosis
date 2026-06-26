import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemHealthTab } from './SystemHealthTab.js';
import type { SystemHealth } from './types.js';

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
  redis: { status: 'ok' },
  solr: { status: 'disabled', enabled: false },
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
    queues: [
      {
        name: 'medgnosis-ehr-bulk-import',
        label: 'EHR Bulk import',
        role: 'ehr_bulk',
        status: 'ok',
        workers: 1,
        paused: false,
        counts: { waiting: 2, active: 1, delayed: 0, failed: 0 },
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
      },
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

beforeEach(() => {
  vi.clearAllMocks();
  mockApiGet.mockResolvedValue({ success: true, data: health });
  mockApiPost.mockResolvedValue({
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

describe('SystemHealthTab', () => {
  it('renders worker queue and EHR Bulk readiness visibility', async () => {
    renderHealthTab();

    expect(await screen.findByText('Workers & Queues')).toBeInTheDocument();
    expect(screen.getByText('3 workers / W 2 / A 1 / D 0 / F 0')).toBeInTheDocument();
    expect(screen.getByText('EHR Bulk import')).toBeInTheDocument();
    expect(screen.getByText('medgnosis-ehr-bulk-import')).toBeInTheDocument();
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
    expect(screen.getByText('EHR Sync Alerts')).toBeInTheDocument();
    expect(screen.getByText('ops.example')).toBeInTheDocument();
    expect(screen.getByText('Authentication Providers')).toBeInTheDocument();
    expect(screen.getByText('Authentik')).toBeInTheDocument();
    expect(screen.getByText((text) => text.startsWith('OK /') && text.endsWith('/ 45 ms'))).toBeInTheDocument();
    expect(screen.getByText('https://issuer.example.test')).toBeInTheDocument();
    expect(screen.getByText('Configured')).toBeInTheDocument();
    expect(screen.getAllByText('Enabled').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /bulk export/i })).not.toBeInTheDocument();
  });

  it('dispatches the EHR sync alert snapshot from System Health', async () => {
    const user = userEvent.setup();
    renderHealthTab();

    await user.click(await screen.findByRole('button', { name: /dispatch/i }));

    expect(mockApiPost).toHaveBeenCalledWith('/admin/system-health/ehr-sync-alerts/dispatch');
    expect(await screen.findByText('sent / sent / 3 issues')).toBeInTheDocument();
  });
});
