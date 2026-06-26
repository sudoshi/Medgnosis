import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockConfig,
  mockSql,
  mockListTenants,
  mockGetTenantSyncStatus,
  mockGetTenantReadinessEvidence,
  mockGetTenantFhirFailureEvidence,
} = vi.hoisted(() => ({
  mockConfig: {
    ehrSyncAlertingEnabled: false,
    ehrSyncAlertWebhookUrl: '',
    ehrSyncAlertWebhookSecret: '',
    ehrSyncAlertNightlyEnabled: false,
    ehrSyncAlertTimeoutMs: 5000,
  },
  mockSql: vi.fn(),
  mockListTenants: vi.fn(),
  mockGetTenantSyncStatus: vi.fn(),
  mockGetTenantReadinessEvidence: vi.fn(),
  mockGetTenantFhirFailureEvidence: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));
vi.mock('../../config.js', () => ({ config: mockConfig }));
vi.mock('./tenantRegistry.js', () => ({ listTenants: mockListTenants }));
vi.mock('./syncStatus.js', () => ({ getTenantSyncStatus: mockGetTenantSyncStatus }));
vi.mock('./readinessEvidence.js', () => ({ getTenantReadinessEvidence: mockGetTenantReadinessEvidence }));
vi.mock('./fhirRequestAudit.js', () => ({ getTenantFhirFailureEvidence: mockGetTenantFhirFailureEvidence }));

import {
  buildEhrSyncAlertSnapshot,
  dispatchEhrSyncAlertSnapshot,
  getEhrSyncAlertingStatus,
} from './syncAlerts.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.ehrSyncAlertingEnabled = false;
  mockConfig.ehrSyncAlertWebhookUrl = '';
  mockConfig.ehrSyncAlertWebhookSecret = '';
  mockConfig.ehrSyncAlertNightlyEnabled = false;
  mockConfig.ehrSyncAlertTimeoutMs = 5000;
  mockGetTenantFhirFailureEvidence.mockResolvedValue(emptyFhirFailureFixture());
  vi.unstubAllGlobals();
});

describe('buildEhrSyncAlertSnapshot', () => {
  it('builds a PHI-safe aggregate tenant snapshot from sync/readiness evidence', async () => {
    mockListTenants.mockResolvedValue([
      tenant({ id: 2, status: 'active', fhirBaseUrl: 'https://ehr.example/FHIR/R4' }),
      tenant({ id: 3, status: 'inactive' }),
    ]);
    mockGetTenantSyncStatus.mockResolvedValue(syncStatusFixture());
    mockGetTenantReadinessEvidence.mockResolvedValue(readinessFixture());
    mockGetTenantFhirFailureEvidence.mockResolvedValue(fhirFailureFixture());

    const snapshot = await buildEhrSyncAlertSnapshot(new Date('2026-06-25T22:00:00Z'));

    expect(snapshot).toMatchObject({
      eventType: 'ehr.sync.alert_snapshot',
      schemaVersion: 1,
      generatedAt: '2026-06-25T22:00:00.000Z',
      severity: 'critical',
      tenantCount: 1,
      issueCounts: { critical: 2, warning: 3, info: 0, total: 5 },
    });
    expect(snapshot.tenants[0]).toMatchObject({
      ehrTenantId: 2,
      vendor: 'epic',
      sync: {
        bulkWorker: { activeOverdueJobs: 1, failures24h: 2 },
        patientSync: { stalePatients: 1 },
      },
      readiness: {
        backendCredentialStatus: 'ready',
        missingRequiredBulkResourceTypes: ['Observation'],
      },
      fhirApi: {
        failedRequests24h: 6,
        authFailures24h: 3,
        rateLimitFailures1h: 2,
        backendTokenAuthFailures24h: 1,
        affectedResourceTypes: ['Observation', 'Patient'],
      },
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('patient-resource-123');
    expect(serialized).not.toContain('group-1');
    expect(serialized).not.toContain('https://ehr.example');
    expect(serialized).not.toContain('output.ndjson');
    expect(serialized).not.toContain('abc-secret');
  });
});

describe('dispatchEhrSyncAlertSnapshot', () => {
  it('is disabled by default and does not query tenant evidence or call fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await dispatchEhrSyncAlertSnapshot();

    expect(result).toMatchObject({
      status: 'skipped',
      reason: 'disabled',
      enabled: false,
      configured: false,
      issueCount: 0,
    });
    expect(mockListTenants).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts signed operational snapshots when a webhook is configured', async () => {
    mockConfig.ehrSyncAlertingEnabled = true;
    mockConfig.ehrSyncAlertWebhookUrl = 'https://ops.example/hooks/medgnosis';
    mockConfig.ehrSyncAlertWebhookSecret = 'secret-signing-key';
    mockListTenants.mockResolvedValue([tenant({ id: 2, status: 'active' })]);
    mockGetTenantSyncStatus.mockResolvedValue(syncStatusFixture());
    mockGetTenantReadinessEvidence.mockResolvedValue(readinessFixture());
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await dispatchEhrSyncAlertSnapshot();

    expect(result).toMatchObject({
      status: 'sent',
      reason: 'sent',
      configured: true,
      endpointHost: 'ops.example',
      issueCount: 3,
      criticalIssueCount: 1,
      warningIssueCount: 2,
      statusCode: 202,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ops.example/hooks/medgnosis');
    expect(options.method).toBe('POST');
    expect((options.headers as Record<string, string>)['x-medgnosis-event']).toBe('ehr.sync.alert_snapshot');
    expect((options.headers as Record<string, string>)['x-medgnosis-signature']).toMatch(/^sha256=/);
    expect(JSON.parse(String(options.body))).toMatchObject({
      eventType: 'ehr.sync.alert_snapshot',
      tenantCount: 1,
      issueCounts: { total: 3 },
    });
  });

  it('reports webhook failures without throwing', async () => {
    mockConfig.ehrSyncAlertingEnabled = true;
    mockConfig.ehrSyncAlertWebhookUrl = 'https://ops.example/hooks/medgnosis';
    mockListTenants.mockResolvedValue([tenant({ id: 2, status: 'active' })]);
    mockGetTenantSyncStatus.mockResolvedValue(syncStatusFixture());
    mockGetTenantReadinessEvidence.mockResolvedValue(readinessFixture());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(dispatchEhrSyncAlertSnapshot()).resolves.toMatchObject({
      status: 'failed',
      reason: 'webhook_failed',
      statusCode: 503,
      error: 'Webhook returned HTTP 503',
    });
  });
});

describe('getEhrSyncAlertingStatus', () => {
  it('summarizes the latest dispatch audit without exposing webhook URLs', async () => {
    mockConfig.ehrSyncAlertingEnabled = true;
    mockConfig.ehrSyncAlertWebhookUrl = 'https://ops.example/hooks/medgnosis';
    mockConfig.ehrSyncAlertNightlyEnabled = true;
    mockSql.mockResolvedValueOnce([
      {
        created_at: '2026-06-25T22:30:00Z',
        details: {
          status: 'failed',
          reason: 'webhook_failed',
          issueCount: 5,
          criticalIssueCount: 1,
          warningIssueCount: 4,
        },
      },
    ]);

    await expect(getEhrSyncAlertingStatus()).resolves.toMatchObject({
      status: 'degraded',
      enabled: true,
      configured: true,
      nightly_enabled: true,
      endpoint_host: 'ops.example',
      last_dispatch_status: 'failed',
      last_dispatch_reason: 'webhook_failed',
      last_issue_count: 5,
      last_critical_issue_count: 1,
      last_warning_issue_count: 4,
    });
  });
});

function tenant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 2,
    orgId: 7,
    vendor: 'epic',
    name: 'Tenant Name',
    environment: 'sandbox',
    fhirBaseUrl: 'https://ehr.example/FHIR/R4',
    smartConfigUrl: 'https://ehr.example/.well-known/smart-configuration',
    issuer: 'https://ehr.example',
    audience: null,
    status: 'active',
    createdAt: '2026-06-20T00:00:00Z',
    updatedAt: '2026-06-20T00:00:00Z',
    ...overrides,
  };
}

function syncStatusFixture() {
  return {
    ehrTenantId: 2,
    generatedAt: '2026-06-25T22:00:00Z',
    crosswalk: {
      totalResources: 100,
      localTargetResources: 90,
      unmappedLocalResources: 3,
      patientLinkedResources: 80,
      missingPatientResources: 2,
      staleResources: 4,
      collisionResources: 2,
      collisionTargets: 1,
      patientCrosswalks: 10,
      resourceTypes: 4,
      lastSeenAt: '2026-06-20T00:00:00Z',
      staleAfterDays: 30,
    },
    resources: [],
    bulkSchedule: {
      enabledSchedules: 1,
      dueSchedules: 0,
      nextBulkScheduleAt: null,
      lastBulkScheduleSuccessAt: null,
      lastBulkScheduleFailureAt: null,
    },
    bulkWorker: {
      lastEventAt: '2026-06-25T20:00:00Z',
      latestAction: 'poll',
      lastFailureAt: '2026-06-25T21:00:00Z',
      failures24h: 2,
      incompleteImports24h: 1,
      activeOverdueJobs: 1,
      oldestOverdueJobAt: '2026-06-25T19:00:00Z',
    },
    patientSync: {
      totalPatients: 7,
      displayedPatients: 7,
      stalePatients: 1,
      lastPatientSeenAt: '2026-06-19T00:00:00Z',
      staleAfterDays: 30,
    },
    lastSuccessfulIngestAt: '2026-06-20T00:00:00Z',
    lastSuccessfulBulkExportAt: '2026-06-20T01:00:00Z',
    lastSuccessfulBulkImportAt: '2026-06-20T02:00:00Z',
    lastSeenAt: '2026-06-20T03:00:00Z',
    issues: [
      {
        severity: 'critical',
        source: 'crosswalk',
        code: 'crosswalk_local_target_collision',
        message: 'Collision',
        recommendedAction: 'Review conflict drilldowns',
        drilldownAvailable: true,
        resourceType: 'Patient',
        count: 1,
        lastSeenAt: '2026-06-20T03:00:00Z',
      },
      {
        severity: 'warning',
        source: 'bulk_worker',
        code: 'bulk_worker_poll_overdue',
        message: 'Overdue',
        recommendedAction: 'Verify worker',
        drilldownAvailable: false,
        resourceType: null,
        count: 1,
        lastSeenAt: '2026-06-25T19:00:00Z',
      },
    ],
    patientResources: [
      {
        localPatientId: 123,
        patientResourceId: 'patient-resource-123',
        totalResources: 4,
        localTargetResources: 4,
        resourceTypes: 2,
        staleResources: 1,
        lastSeenAt: '2026-06-19T00:00:00Z',
        latestResourceType: 'Observation',
      },
    ],
    conflictTargets: [
      {
        resourceType: 'Patient',
        localTable: 'phm_edw.patient',
        localId: 123,
        sourceCount: 2,
        sourceResourceIds: ['group-1', 'output.ndjson'],
        patientCount: 1,
        lastSeenAt: '2026-06-20T03:00:00Z',
      },
    ],
    stalePatientResources: [],
  };
}

function readinessFixture() {
  return {
    ehrTenantId: 2,
    generatedAt: '2026-06-25T22:00:00Z',
    discovery: {},
    capability: {
      missingRequiredBulkResourceTypes: ['Observation'],
    },
    backendServices: {
      credentialStatus: 'ready',
      tokenRequests24h: 0,
      latestTokenExpired: true,
    },
    launch: {},
    bulkDiagnostics: {
      activeJobs: 0,
      failedJobs24h: 0,
      overdueScheduleCount: 0,
    },
    issues: [
      {
        severity: 'warning',
        code: 'backend_token_expired',
        message: 'Backend metadata is expired but no raw token abc-secret is present.',
      },
    ],
  };
}

function emptyFhirFailureFixture() {
  return {
    failedRequests24h: 0,
    authFailures24h: 0,
    rateLimitFailures24h: 0,
    rateLimitFailures1h: 0,
    networkFailures24h: 0,
    backendTokenFailures24h: 0,
    backendTokenAuthFailures24h: 0,
    backendTokenRateLimitFailures1h: 0,
    latestFailureAt: null,
    statusCounts24h: {},
    backendTokenStatusCounts24h: {},
    affectedResourceTypes: [],
    issues: [],
  };
}

function fhirFailureFixture() {
  return {
    failedRequests24h: 6,
    authFailures24h: 3,
    rateLimitFailures24h: 2,
    rateLimitFailures1h: 2,
    networkFailures24h: 1,
    backendTokenFailures24h: 1,
    backendTokenAuthFailures24h: 1,
    backendTokenRateLimitFailures1h: 0,
    latestFailureAt: '2026-06-25T21:55:00Z',
    statusCounts24h: { '401': 2, '403': 1, '429': 2, network: 1 },
    backendTokenStatusCounts24h: { '401': 1 },
    affectedResourceTypes: ['Observation', 'Patient'],
    issues: [
      {
        severity: 'critical',
        code: 'fhir_auth_failures_24h',
        source: 'fhir_api',
        resourceType: null,
        count: 3,
        lastSeenAt: '2026-06-25T21:50:00Z',
        recommendedAction: 'Check SMART launch/backend scopes and vendor authorization for failing FHIR reads.',
      },
      {
        severity: 'warning',
        code: 'backend_token_auth_failures_24h',
        source: 'backend_token',
        resourceType: null,
        count: 1,
        lastSeenAt: '2026-06-25T21:55:00Z',
        recommendedAction: 'Run the backend token-check action.',
      },
    ],
  };
}
