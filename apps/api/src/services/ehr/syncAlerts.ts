// =============================================================================
// Medgnosis API - EHR sync external alert snapshots
// PHI-safe operational summaries for tenant EHR readiness/sync issues.
// =============================================================================

import { createHmac } from 'node:crypto';
import { sql } from '@medgnosis/db';
import { config } from '../../config.js';
import { listTenants, type EhrTenant } from './tenantRegistry.js';
import { getTenantSyncStatus, type EhrSyncIssueSeverity } from './syncStatus.js';
import { getTenantReadinessEvidence } from './readinessEvidence.js';
import { getTenantFhirFailureEvidence } from './fhirRequestAudit.js';

export type EhrSyncAlertSeverity = 'ok' | EhrSyncIssueSeverity;
export type EhrSyncAlertDispatchStatus = 'sent' | 'skipped' | 'failed';
export type EhrSyncAlertDispatchReason =
  | 'sent'
  | 'disabled'
  | 'not_configured'
  | 'no_issues'
  | 'webhook_failed'
  | 'webhook_error';

export interface EhrSyncAlertSettings {
  enabled: boolean;
  configured: boolean;
  nightlyEnabled: boolean;
  endpointHost: string | null;
  timeoutMs: number;
}

export interface EhrSyncAlertIssueCounts {
  critical: number;
  warning: number;
  info: number;
  total: number;
}

export interface EhrSyncAlertTenantIssue {
  severity: EhrSyncIssueSeverity;
  code: string;
  source: string;
  resourceType: string | null;
  count: number | null;
  lastSeenAt: string | null;
  recommendedAction: string;
}

export interface EhrSyncAlertTenantSnapshot {
  ehrTenantId: number;
  orgId: number | null;
  vendor: string;
  environment: string;
  status: string;
  severity: EhrSyncAlertSeverity;
  issueCounts: EhrSyncAlertIssueCounts;
  sync: {
    lastSeenAt: string | null;
    lastSuccessfulIngestAt: string | null;
    lastSuccessfulBulkExportAt: string | null;
    lastSuccessfulBulkImportAt: string | null;
    bulkWorker: {
      failures24h: number;
      incompleteImports24h: number;
      activeOverdueJobs: number;
      oldestOverdueJobAt: string | null;
      lastFailureAt: string | null;
    };
    patientSync: {
      totalPatients: number;
      stalePatients: number;
      staleAfterDays: number;
      lastPatientSeenAt: string | null;
    };
    crosswalk: {
      totalResources: number;
      staleResources: number;
      collisionTargets: number;
      unmappedLocalResources: number;
      missingPatientResources: number;
      staleAfterDays: number;
    };
    issues: EhrSyncAlertTenantIssue[];
  };
  readiness: {
    backendCredentialStatus: string;
    backendTokenRequests24h: number;
    latestBackendTokenExpired: boolean | null;
    missingRequiredBulkResourceTypes: string[];
    activeBulkJobs: number;
    failedBulkJobs24h: number;
    overdueBulkSchedules: number;
    issues: EhrSyncAlertTenantIssue[];
  };
  fhirApi: {
    failedRequests24h: number;
    authFailures24h: number;
    rateLimitFailures24h: number;
    rateLimitFailures1h: number;
    networkFailures24h: number;
    backendTokenFailures24h: number;
    backendTokenAuthFailures24h: number;
    backendTokenRateLimitFailures1h: number;
    latestFailureAt: string | null;
    statusCounts24h: Record<string, number>;
    backendTokenStatusCounts24h: Record<string, number>;
    affectedResourceTypes: string[];
    issues: EhrSyncAlertTenantIssue[];
  };
}

export interface EhrSyncAlertSnapshot {
  eventType: 'ehr.sync.alert_snapshot';
  schemaVersion: 1;
  generatedAt: string;
  severity: EhrSyncAlertSeverity;
  tenantCount: number;
  issueCounts: EhrSyncAlertIssueCounts;
  tenants: EhrSyncAlertTenantSnapshot[];
}

export interface EhrSyncAlertDispatchResult {
  status: EhrSyncAlertDispatchStatus;
  reason: EhrSyncAlertDispatchReason;
  enabled: boolean;
  configured: boolean;
  endpointHost: string | null;
  generatedAt: string;
  tenantCount: number;
  issueCount: number;
  criticalIssueCount: number;
  warningIssueCount: number;
  statusCode?: number;
  error?: string;
}

interface LatestAlertDispatchAuditRow {
  created_at: string | null;
  details: Record<string, unknown> | string | null;
}

export interface EhrSyncAlertingStatus {
  status: 'ok' | 'degraded' | 'disabled';
  enabled: boolean;
  configured: boolean;
  nightly_enabled: boolean;
  endpoint_host: string | null;
  last_dispatch_at: string | null;
  last_dispatch_status: EhrSyncAlertDispatchStatus | null;
  last_dispatch_reason: EhrSyncAlertDispatchReason | null;
  last_issue_count: number | null;
  last_critical_issue_count: number | null;
  last_warning_issue_count: number | null;
  error?: string;
}

const ALERT_EVENT_TYPE = 'ehr.sync.alert_snapshot';
const ACTIVE_TENANT_STATUSES = new Set(['active', 'testing']);
const DEFAULT_TIMEOUT_MS = 5000;

export function getEhrSyncAlertSettings(): EhrSyncAlertSettings {
  const enabled = Boolean(config.ehrSyncAlertingEnabled);
  const webhookUrl = config.ehrSyncAlertWebhookUrl.trim();
  const endpointHost = endpointHostFromUrl(webhookUrl);
  const configured = enabled && Boolean(endpointHost);
  return {
    enabled,
    configured,
    nightlyEnabled: Boolean(config.ehrSyncAlertNightlyEnabled),
    endpointHost,
    timeoutMs: normalizeTimeout(config.ehrSyncAlertTimeoutMs),
  };
}

export async function getEhrSyncAlertingStatus(): Promise<EhrSyncAlertingStatus> {
  const settings = getEhrSyncAlertSettings();

  try {
    const [row] = await sql<LatestAlertDispatchAuditRow[]>`
      SELECT created_at::text AS created_at,
             details
      FROM audit_log
      WHERE action = 'ehr_sync_alert_dispatch'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const details = parseAuditDetails(row?.details);
    const lastStatus = asDispatchStatus(details?.status);
    const lastReason = asDispatchReason(details?.reason);

    return {
      status: !settings.enabled || !settings.configured
        ? 'disabled'
        : lastStatus === 'failed'
          ? 'degraded'
          : 'ok',
      enabled: settings.enabled,
      configured: settings.configured,
      nightly_enabled: settings.nightlyEnabled,
      endpoint_host: settings.endpointHost,
      last_dispatch_at: row?.created_at ?? null,
      last_dispatch_status: lastStatus,
      last_dispatch_reason: lastReason,
      last_issue_count: numberOrNull(details?.issueCount),
      last_critical_issue_count: numberOrNull(details?.criticalIssueCount),
      last_warning_issue_count: numberOrNull(details?.warningIssueCount),
    };
  } catch (err) {
    return {
      status: 'degraded',
      enabled: settings.enabled,
      configured: settings.configured,
      nightly_enabled: settings.nightlyEnabled,
      endpoint_host: settings.endpointHost,
      last_dispatch_at: null,
      last_dispatch_status: null,
      last_dispatch_reason: null,
      last_issue_count: null,
      last_critical_issue_count: null,
      last_warning_issue_count: null,
      error: errorMessage(err),
    };
  }
}

export async function buildEhrSyncAlertSnapshot(now = new Date()): Promise<EhrSyncAlertSnapshot> {
  const tenants = (await listTenants())
    .filter((tenant) => ACTIVE_TENANT_STATUSES.has(tenant.status));
  const tenantSnapshots = await Promise.all(tenants.map((tenant) => buildTenantSnapshot(tenant)));
  const issueCounts = sumIssueCounts(tenantSnapshots.map((tenant) => tenant.issueCounts));

  return {
    eventType: ALERT_EVENT_TYPE,
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    severity: severityFromCounts(issueCounts),
    tenantCount: tenantSnapshots.length,
    issueCounts,
    tenants: tenantSnapshots,
  };
}

export async function dispatchEhrSyncAlertSnapshot(): Promise<EhrSyncAlertDispatchResult> {
  const settings = getEhrSyncAlertSettings();
  const generatedAt = new Date().toISOString();

  if (!settings.enabled) {
    return skippedDispatch('disabled', settings, generatedAt);
  }
  if (!settings.configured) {
    return skippedDispatch('not_configured', settings, generatedAt);
  }

  const snapshot = await buildEhrSyncAlertSnapshot(new Date(generatedAt));
  if (snapshot.issueCounts.total === 0) {
    return dispatchResult('skipped', 'no_issues', settings, snapshot);
  }

  const payload = JSON.stringify(snapshot);
  const timestamp = new Date().toISOString();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'medgnosis-ehr-sync-alerts/1.0',
    'x-medgnosis-event': ALERT_EVENT_TYPE,
    'x-medgnosis-timestamp': timestamp,
  };
  if (config.ehrSyncAlertWebhookSecret) {
    headers['x-medgnosis-signature'] = signWebhookPayload(
      config.ehrSyncAlertWebhookSecret,
      timestamp,
      payload,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);

  try {
    const response = await fetch(config.ehrSyncAlertWebhookUrl, {
      method: 'POST',
      headers,
      body: payload,
      signal: controller.signal,
    });
    if (!response.ok) {
      return dispatchResult('failed', 'webhook_failed', settings, snapshot, {
        statusCode: response.status,
        error: `Webhook returned HTTP ${response.status}`,
      });
    }
    return dispatchResult('sent', 'sent', settings, snapshot, { statusCode: response.status });
  } catch (err) {
    return dispatchResult('failed', 'webhook_error', settings, snapshot, { error: errorMessage(err) });
  } finally {
    clearTimeout(timeout);
  }
}

export function ehrSyncAlertAuditDetails(
  result: EhrSyncAlertDispatchResult,
  triggeredBy: string,
): Record<string, unknown> {
  return {
    status: result.status,
    reason: result.reason,
    enabled: result.enabled,
    configured: result.configured,
    endpointHost: result.endpointHost,
    tenantCount: result.tenantCount,
    issueCount: result.issueCount,
    criticalIssueCount: result.criticalIssueCount,
    warningIssueCount: result.warningIssueCount,
    ...(result.statusCode === undefined ? {} : { statusCode: result.statusCode }),
    ...(result.error ? { error: result.error } : {}),
    triggeredBy,
  };
}

export function isEhrSyncAlertNightlyEnabled(): boolean {
  const settings = getEhrSyncAlertSettings();
  return settings.enabled && settings.configured && settings.nightlyEnabled;
}

async function buildTenantSnapshot(tenant: EhrTenant): Promise<EhrSyncAlertTenantSnapshot> {
  const [syncStatus, readiness, fhirFailures] = await Promise.all([
    getTenantSyncStatus(tenant.id),
    getTenantReadinessEvidence(tenant),
    getTenantFhirFailureEvidence(tenant.id),
  ]);
  const syncIssues: EhrSyncAlertTenantIssue[] = syncStatus.issues.map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    source: issue.source,
    resourceType: issue.resourceType,
    count: issue.count,
    lastSeenAt: issue.lastSeenAt,
    recommendedAction: issue.recommendedAction,
  }));
  const readinessIssues: EhrSyncAlertTenantIssue[] = readiness.issues.map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    source: 'readiness',
    resourceType: null,
    count: null,
    lastSeenAt: null,
    recommendedAction: readinessRecommendedAction(issue.code),
  }));
  const fhirIssues: EhrSyncAlertTenantIssue[] = fhirFailures.issues.map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    source: issue.source,
    resourceType: issue.resourceType,
    count: issue.count,
    lastSeenAt: issue.lastSeenAt,
    recommendedAction: issue.recommendedAction,
  }));
  const issueCounts = countIssues([...syncIssues, ...readinessIssues, ...fhirIssues]);

  return {
    ehrTenantId: tenant.id,
    orgId: tenant.orgId,
    vendor: tenant.vendor,
    environment: tenant.environment,
    status: tenant.status,
    severity: severityFromCounts(issueCounts),
    issueCounts,
    sync: {
      lastSeenAt: syncStatus.lastSeenAt,
      lastSuccessfulIngestAt: syncStatus.lastSuccessfulIngestAt,
      lastSuccessfulBulkExportAt: syncStatus.lastSuccessfulBulkExportAt,
      lastSuccessfulBulkImportAt: syncStatus.lastSuccessfulBulkImportAt,
      bulkWorker: {
        failures24h: syncStatus.bulkWorker.failures24h,
        incompleteImports24h: syncStatus.bulkWorker.incompleteImports24h,
        activeOverdueJobs: syncStatus.bulkWorker.activeOverdueJobs,
        oldestOverdueJobAt: syncStatus.bulkWorker.oldestOverdueJobAt,
        lastFailureAt: syncStatus.bulkWorker.lastFailureAt,
      },
      patientSync: {
        totalPatients: syncStatus.patientSync.totalPatients,
        stalePatients: syncStatus.patientSync.stalePatients,
        staleAfterDays: syncStatus.patientSync.staleAfterDays,
        lastPatientSeenAt: syncStatus.patientSync.lastPatientSeenAt,
      },
      crosswalk: {
        totalResources: syncStatus.crosswalk.totalResources,
        staleResources: syncStatus.crosswalk.staleResources,
        collisionTargets: syncStatus.crosswalk.collisionTargets,
        unmappedLocalResources: syncStatus.crosswalk.unmappedLocalResources,
        missingPatientResources: syncStatus.crosswalk.missingPatientResources,
        staleAfterDays: syncStatus.crosswalk.staleAfterDays,
      },
      issues: syncIssues,
    },
    readiness: {
      backendCredentialStatus: readiness.backendServices.credentialStatus,
      backendTokenRequests24h: readiness.backendServices.tokenRequests24h,
      latestBackendTokenExpired: readiness.backendServices.latestTokenExpired,
      missingRequiredBulkResourceTypes: readiness.capability.missingRequiredBulkResourceTypes,
      activeBulkJobs: readiness.bulkDiagnostics.activeJobs,
      failedBulkJobs24h: readiness.bulkDiagnostics.failedJobs24h,
      overdueBulkSchedules: readiness.bulkDiagnostics.overdueScheduleCount,
      issues: readinessIssues,
    },
    fhirApi: {
      failedRequests24h: fhirFailures.failedRequests24h,
      authFailures24h: fhirFailures.authFailures24h,
      rateLimitFailures24h: fhirFailures.rateLimitFailures24h,
      rateLimitFailures1h: fhirFailures.rateLimitFailures1h,
      networkFailures24h: fhirFailures.networkFailures24h,
      backendTokenFailures24h: fhirFailures.backendTokenFailures24h,
      backendTokenAuthFailures24h: fhirFailures.backendTokenAuthFailures24h,
      backendTokenRateLimitFailures1h: fhirFailures.backendTokenRateLimitFailures1h,
      latestFailureAt: fhirFailures.latestFailureAt,
      statusCounts24h: fhirFailures.statusCounts24h,
      backendTokenStatusCounts24h: fhirFailures.backendTokenStatusCounts24h,
      affectedResourceTypes: fhirFailures.affectedResourceTypes,
      issues: fhirIssues,
    },
  };
}

function skippedDispatch(
  reason: 'disabled' | 'not_configured',
  settings: EhrSyncAlertSettings,
  generatedAt: string,
): EhrSyncAlertDispatchResult {
  return {
    status: 'skipped',
    reason,
    enabled: settings.enabled,
    configured: settings.configured,
    endpointHost: settings.endpointHost,
    generatedAt,
    tenantCount: 0,
    issueCount: 0,
    criticalIssueCount: 0,
    warningIssueCount: 0,
  };
}

function dispatchResult(
  status: EhrSyncAlertDispatchStatus,
  reason: EhrSyncAlertDispatchReason,
  settings: EhrSyncAlertSettings,
  snapshot: EhrSyncAlertSnapshot,
  extra: { statusCode?: number; error?: string } = {},
): EhrSyncAlertDispatchResult {
  return {
    status,
    reason,
    enabled: settings.enabled,
    configured: settings.configured,
    endpointHost: settings.endpointHost,
    generatedAt: snapshot.generatedAt,
    tenantCount: snapshot.tenantCount,
    issueCount: snapshot.issueCounts.total,
    criticalIssueCount: snapshot.issueCounts.critical,
    warningIssueCount: snapshot.issueCounts.warning,
    ...extra,
  };
}

function countIssues(issues: Array<{ severity: EhrSyncIssueSeverity }>): EhrSyncAlertIssueCounts {
  return issues.reduce(
    (counts, issue) => ({
      ...counts,
      [issue.severity]: counts[issue.severity] + 1,
      total: counts.total + 1,
    }),
    { critical: 0, warning: 0, info: 0, total: 0 },
  );
}

function sumIssueCounts(groups: EhrSyncAlertIssueCounts[]): EhrSyncAlertIssueCounts {
  return groups.reduce(
    (sum, group) => ({
      critical: sum.critical + group.critical,
      warning: sum.warning + group.warning,
      info: sum.info + group.info,
      total: sum.total + group.total,
    }),
    { critical: 0, warning: 0, info: 0, total: 0 },
  );
}

function severityFromCounts(counts: EhrSyncAlertIssueCounts): EhrSyncAlertSeverity {
  if (counts.critical > 0) return 'critical';
  if (counts.warning > 0) return 'warning';
  if (counts.info > 0) return 'info';
  return 'ok';
}

function signWebhookPayload(secret: string, timestamp: string, payload: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`;
}

function readinessRecommendedAction(code: string): string {
  switch (code) {
    case 'backend_token_endpoint_missing':
      return 'Run SMART discovery and confirm the tenant token endpoint before backend-service operations.';
    case 'backend_credentials_incomplete':
    case 'backend_client_missing':
      return 'Review backend-services client registration and credential readiness.';
    case 'backend_token_not_exercised':
    case 'backend_token_expired':
      return 'Run the explicit backend token-check action from EHR Integrations.';
    case 'bulk_resource_capability_gap':
      return 'Review CapabilityStatement resource coverage before scheduling Bulk exports.';
    case 'bulk_failures_24h':
    case 'bulk_schedules_overdue':
      return 'Review Bulk job and schedule diagnostics in EHR Integrations.';
    case 'discovery_missing':
    case 'smart_discovery_missing':
      return 'Run tenant SMART discovery diagnostics.';
    default:
      return 'Review tenant readiness evidence in EHR Integrations.';
  }
}

function endpointHostFromUrl(value: string): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.host;
  } catch {
    return null;
  }
}

function normalizeTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.floor(value), 1000), 30_000);
}

function parseAuditDetails(value: Record<string, unknown> | string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function asDispatchStatus(value: unknown): EhrSyncAlertDispatchStatus | null {
  return value === 'sent' || value === 'skipped' || value === 'failed' ? value : null;
}

function asDispatchReason(value: unknown): EhrSyncAlertDispatchReason | null {
  return value === 'sent' ||
    value === 'disabled' ||
    value === 'not_configured' ||
    value === 'no_issues' ||
    value === 'webhook_failed' ||
    value === 'webhook_error'
    ? value
    : null;
}

function numberOrNull(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
