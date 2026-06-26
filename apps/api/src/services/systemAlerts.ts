// =============================================================================
// Medgnosis API - System-level external alert snapshots
// PHI-safe operational summaries for SYSTEM health (not tenant EHR sync).
//
// Mirrors ehr/syncAlerts.ts: aggregate-only PHI-safe payload, env-gated and
// default-off, optional signed webhook dispatch, audit-backed status. Where the
// EHR layer raises tenant-scoped sync/FHIR alerts, this layer raises the
// SYSTEM-level conditions: overall health degraded, worker queue stalled,
// nightly scheduler missed, QDM/CQL bridge blocking issues, and CQL engine
// unavailability. The webhook-signing helper is kept parallel to syncAlerts
// because that module does not export it.
// =============================================================================

import { createHmac } from 'node:crypto';
import { sql } from '@medgnosis/db';
import {
  getSystemHealth,
  type HealthStatus,
  type SystemHealth,
} from './systemHealth.js';

export type SystemAlertSeverity = 'ok' | 'info' | 'warning' | 'critical';
export type SystemAlertDispatchStatus = 'sent' | 'skipped' | 'failed';
export type SystemAlertDispatchReason =
  | 'sent'
  | 'disabled'
  | 'not_configured'
  | 'no_issues'
  | 'webhook_failed'
  | 'webhook_error';

export type SystemAlertCode =
  | 'health_degraded'
  | 'worker_queue_stalled'
  | 'nightly_job_missed'
  | 'qdm_bridge_blocked'
  | 'cql_engine_unavailable';

export interface SystemAlertSettings {
  enabled: boolean;
  configured: boolean;
  nightlyEnabled: boolean;
  endpointHost: string | null;
  timeoutMs: number;
}

export interface SystemAlertIssueCounts {
  critical: number;
  warning: number;
  info: number;
  total: number;
}

export interface SystemAlertIssue {
  code: SystemAlertCode;
  severity: Exclude<SystemAlertSeverity, 'ok'>;
  component: string;
  summary: string;
  recommendedAction: string;
  metrics: Record<string, number | string | boolean | null>;
}

export interface SystemAlertSnapshot {
  eventType: 'system.health.alert_snapshot';
  schemaVersion: 1;
  generatedAt: string;
  severity: SystemAlertSeverity;
  overallStatus: HealthStatus;
  issueCounts: SystemAlertIssueCounts;
  components: {
    api: HealthStatus;
    database: HealthStatus;
    redis: HealthStatus;
    solr: HealthStatus;
    auth: HealthStatus;
    workers: HealthStatus;
    scheduler: HealthStatus;
    migrations: HealthStatus;
    observability: HealthStatus;
    standards: HealthStatus;
  };
  issues: SystemAlertIssue[];
}

export interface SystemAlertDispatchResult {
  status: SystemAlertDispatchStatus;
  reason: SystemAlertDispatchReason;
  enabled: boolean;
  configured: boolean;
  endpointHost: string | null;
  generatedAt: string;
  overallStatus: HealthStatus;
  severity: SystemAlertSeverity;
  issueCount: number;
  criticalIssueCount: number;
  warningIssueCount: number;
  statusCode?: number;
  error?: string;
}

export interface SystemAlertingStatus {
  status: 'ok' | 'degraded' | 'disabled';
  enabled: boolean;
  configured: boolean;
  nightly_enabled: boolean;
  endpoint_host: string | null;
  last_dispatch_at: string | null;
  last_dispatch_status: SystemAlertDispatchStatus | null;
  last_dispatch_reason: SystemAlertDispatchReason | null;
  last_severity: SystemAlertSeverity | null;
  last_issue_count: number | null;
  last_critical_issue_count: number | null;
  last_warning_issue_count: number | null;
  error?: string;
}

interface LatestAlertDispatchAuditRow {
  created_at: string | null;
  details: Record<string, unknown> | string | null;
}

const ALERT_EVENT_TYPE = 'system.health.alert_snapshot';
const ALERT_AUDIT_ACTION = 'system_alert_dispatch';
const DEFAULT_TIMEOUT_MS = 5000;

export function getSystemAlertSettings(): SystemAlertSettings {
  const enabled = envBool('SYSTEM_ALERTING_ENABLED', false);
  const webhookUrl = (process.env['SYSTEM_ALERT_WEBHOOK_URL'] ?? '').trim();
  const endpointHost = endpointHostFromUrl(webhookUrl);
  const configured = enabled && Boolean(endpointHost);
  return {
    enabled,
    configured,
    nightlyEnabled: envBool('SYSTEM_ALERT_NIGHTLY_ENABLED', false),
    endpointHost,
    timeoutMs: normalizeTimeout(Number(process.env['SYSTEM_ALERT_TIMEOUT_MS'] ?? DEFAULT_TIMEOUT_MS)),
  };
}

export async function getSystemAlertingStatus(): Promise<SystemAlertingStatus> {
  const settings = getSystemAlertSettings();

  try {
    const [row] = await sql<LatestAlertDispatchAuditRow[]>`
      SELECT created_at::text AS created_at,
             details
      FROM audit_log
      WHERE action = ${ALERT_AUDIT_ACTION}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const details = parseAuditDetails(row?.details);
    const lastStatus = asDispatchStatus(details?.['status']);
    const lastReason = asDispatchReason(details?.['reason']);

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
      last_severity: asSeverity(details?.['severity']),
      last_issue_count: numberOrNull(details?.['issueCount']),
      last_critical_issue_count: numberOrNull(details?.['criticalIssueCount']),
      last_warning_issue_count: numberOrNull(details?.['warningIssueCount']),
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
      last_severity: null,
      last_issue_count: null,
      last_critical_issue_count: null,
      last_warning_issue_count: null,
      error: errorMessage(err),
    };
  }
}

export async function buildSystemAlertSnapshot(now = new Date()): Promise<SystemAlertSnapshot> {
  const health = await getSystemHealth();
  return buildSystemAlertSnapshotFromHealth(health, now);
}

export function buildSystemAlertSnapshotFromHealth(
  health: SystemHealth,
  now = new Date(),
): SystemAlertSnapshot {
  const issues = deriveSystemAlertIssues(health);
  const issueCounts = countIssues(issues);

  return {
    eventType: ALERT_EVENT_TYPE,
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    severity: severityFromCounts(issueCounts),
    overallStatus: aggregateOverallStatus(health),
    issueCounts,
    components: {
      api: health.api.status,
      database: health.database.status,
      redis: health.redis.status,
      solr: health.solr.status,
      auth: health.auth.status,
      workers: health.workers.status,
      scheduler: health.scheduler.status,
      migrations: health.migrations.status,
      observability: health.observability.status,
      standards: health.standards.status,
    },
    issues,
  };
}

export async function dispatchSystemAlertSnapshot(): Promise<SystemAlertDispatchResult> {
  const settings = getSystemAlertSettings();
  const generatedAt = new Date().toISOString();

  if (!settings.enabled) {
    return skippedDispatch('disabled', settings, generatedAt);
  }
  if (!settings.configured) {
    return skippedDispatch('not_configured', settings, generatedAt);
  }

  const snapshot = await buildSystemAlertSnapshot(new Date(generatedAt));
  if (snapshot.issueCounts.total === 0) {
    return dispatchResult('skipped', 'no_issues', settings, snapshot);
  }

  const payload = JSON.stringify(snapshot);
  const timestamp = new Date().toISOString();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'medgnosis-system-alerts/1.0',
    'x-medgnosis-event': ALERT_EVENT_TYPE,
    'x-medgnosis-timestamp': timestamp,
  };
  const secret = (process.env['SYSTEM_ALERT_WEBHOOK_SECRET'] ?? '').trim();
  if (secret) {
    headers['x-medgnosis-signature'] = signWebhookPayload(secret, timestamp, payload);
  }

  const webhookUrl = (process.env['SYSTEM_ALERT_WEBHOOK_URL'] ?? '').trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
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

export function systemAlertAuditDetails(
  result: SystemAlertDispatchResult,
  triggeredBy: string,
): Record<string, unknown> {
  return {
    status: result.status,
    reason: result.reason,
    enabled: result.enabled,
    configured: result.configured,
    endpointConfigured: result.endpointHost !== null,
    overallStatus: result.overallStatus,
    severity: result.severity,
    issueCount: result.issueCount,
    criticalIssueCount: result.criticalIssueCount,
    warningIssueCount: result.warningIssueCount,
    ...(result.statusCode === undefined ? {} : { statusCode: result.statusCode }),
    ...(result.error ? { errorPresent: true } : {}),
    triggeredBy,
  };
}

export function isSystemAlertNightlyEnabled(): boolean {
  const settings = getSystemAlertSettings();
  return settings.enabled && settings.configured && settings.nightlyEnabled;
}

/**
 * Translates a SystemHealth snapshot into the five SYSTEM-level alert
 * conditions. Pure and PHI-safe: it only reads aggregate statuses and counts,
 * never patient identifiers.
 */
export function deriveSystemAlertIssues(health: SystemHealth): SystemAlertIssue[] {
  const issues: SystemAlertIssue[] = [];
  const overall = aggregateOverallStatus(health);

  // 1. Worker queue stalled — paused or worker-starved queues with backlog.
  if (health.workers.stalled_queues > 0 || health.workers.status === 'error') {
    issues.push({
      code: 'worker_queue_stalled',
      severity: 'critical',
      component: 'workers',
      summary: `${health.workers.stalled_queues} worker queue(s) stalled (paused or no workers with backlog)`,
      recommendedAction: 'Confirm the worker process is running and unpause the affected BullMQ queues.',
      metrics: {
        stalledQueues: health.workers.stalled_queues,
        failed: health.workers.counts.failed,
        failureRate: health.workers.failure_rate,
        totalWorkers: health.workers.total_workers,
      },
    });
  }

  // 2. Nightly scheduler missed — no run within the staleness window.
  if (health.scheduler.missed || !health.scheduler.repeatable_scheduled) {
    issues.push({
      code: 'nightly_job_missed',
      severity: 'critical',
      component: 'scheduler',
      summary: health.scheduler.repeatable_scheduled
        ? `Nightly batch has not run for ${health.scheduler.hours_since_last_run ?? '?'}h `
          + `(threshold ${health.scheduler.stale_after_hours}h)`
        : 'Nightly batch has no registered repeatable schedule',
      recommendedAction: 'Restart the nightly scheduler worker and verify the repeatable job is registered.',
      metrics: {
        repeatableScheduled: health.scheduler.repeatable_scheduled,
        hoursSinceLastRun: health.scheduler.hours_since_last_run,
        lastSuccessAt: health.scheduler.last_success_at,
        lastFailureAt: health.scheduler.last_failure_at,
      },
    });
  } else if (
    health.scheduler.last_failure_at !== null
    && (health.scheduler.last_success_at === null
      || health.scheduler.last_failure_at >= health.scheduler.last_success_at)
  ) {
    issues.push({
      code: 'nightly_job_missed',
      severity: 'warning',
      component: 'scheduler',
      summary: 'Most recent nightly batch run failed',
      recommendedAction: 'Inspect nightly scheduler worker logs for the most recent failure.',
      metrics: {
        lastFailureAt: health.scheduler.last_failure_at,
        lastSuccessAt: health.scheduler.last_success_at,
        failedRecent: health.scheduler.failed_recent,
      },
    });
  }

  // 3. CQL engine unavailable — runtime configured but not reachable/ready.
  const cql = health.observability.cql_engine;
  if (cql.runtime_configured && !cql.available) {
    issues.push({
      code: 'cql_engine_unavailable',
      severity: 'critical',
      component: 'cql_engine',
      summary: 'CQL engine runtime is configured but unavailable',
      recommendedAction: 'Verify the CQL_ENGINE_URL sidecar is reachable and healthy.',
      metrics: {
        status: cql.status,
        runtimeConfigured: cql.runtime_configured,
        available: cql.available,
      },
    });
  }

  // 4. QDM/CQL bridge blocking issues — measure execution assets degraded.
  if (health.observability.qdm_bridge.status === 'degraded'
    || health.observability.qdm_bridge.blocking_issues > 0) {
    issues.push({
      code: 'qdm_bridge_blocked',
      severity: 'warning',
      component: 'qdm_bridge',
      summary: `QDM/CQL bridge has ${health.observability.qdm_bridge.blocking_issues} blocking artifact issue(s)`,
      recommendedAction: 'Restore the missing CQL/QDM smoke artifacts and re-run the bridge smoke checks.',
      metrics: {
        status: health.observability.qdm_bridge.status,
        blockingIssues: health.observability.qdm_bridge.blocking_issues,
      },
    });
  }

  // 5. Overall health degraded/blocked — catch-all so a regressed core service
  //    (database/redis/auth/migrations) still raises an alert.
  if (overall === 'blocked' || overall === 'degraded' || overall === 'error') {
    issues.push({
      code: 'health_degraded',
      severity: overall === 'degraded' ? 'warning' : 'critical',
      component: 'system',
      summary: `Overall system health is ${overall}`,
      recommendedAction: 'Review the System Health admin surface for the degraded component.',
      metrics: {
        overallStatus: overall,
        database: health.database.status,
        redis: health.redis.status,
        auth: health.auth.status,
        migrations: health.migrations.status,
        observability: health.observability.status,
      },
    });
  }

  return issues;
}

function aggregateOverallStatus(health: SystemHealth): HealthStatus {
  const statuses: HealthStatus[] = [
    health.api.status,
    health.database.status,
    health.redis.status,
    health.solr.status,
    health.auth.status,
    health.workers.status,
    health.scheduler.status,
    health.migrations.status,
    health.observability.status,
    health.standards.status,
  ];
  if (statuses.includes('error')) return 'error';
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('degraded')) return 'degraded';
  return 'ok';
}

function skippedDispatch(
  reason: 'disabled' | 'not_configured',
  settings: SystemAlertSettings,
  generatedAt: string,
): SystemAlertDispatchResult {
  return {
    status: 'skipped',
    reason,
    enabled: settings.enabled,
    configured: settings.configured,
    endpointHost: settings.endpointHost,
    generatedAt,
    overallStatus: 'disabled',
    severity: 'ok',
    issueCount: 0,
    criticalIssueCount: 0,
    warningIssueCount: 0,
  };
}

function dispatchResult(
  status: SystemAlertDispatchStatus,
  reason: SystemAlertDispatchReason,
  settings: SystemAlertSettings,
  snapshot: SystemAlertSnapshot,
  extra: { statusCode?: number; error?: string } = {},
): SystemAlertDispatchResult {
  return {
    status,
    reason,
    enabled: settings.enabled,
    configured: settings.configured,
    endpointHost: settings.endpointHost,
    generatedAt: snapshot.generatedAt,
    overallStatus: snapshot.overallStatus,
    severity: snapshot.severity,
    issueCount: snapshot.issueCounts.total,
    criticalIssueCount: snapshot.issueCounts.critical,
    warningIssueCount: snapshot.issueCounts.warning,
    ...extra,
  };
}

function countIssues(issues: SystemAlertIssue[]): SystemAlertIssueCounts {
  return issues.reduce(
    (counts, issue) => ({
      ...counts,
      [issue.severity]: counts[issue.severity] + 1,
      total: counts.total + 1,
    }),
    { critical: 0, warning: 0, info: 0, total: 0 },
  );
}

function severityFromCounts(counts: SystemAlertIssueCounts): SystemAlertSeverity {
  if (counts.critical > 0) return 'critical';
  if (counts.warning > 0) return 'warning';
  if (counts.info > 0) return 'info';
  return 'ok';
}

function signWebhookPayload(secret: string, timestamp: string, payload: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`;
}

function endpointHostFromUrl(value: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function envBool(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

function normalizeTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.floor(value), 1000), 30_000);
}

function parseAuditDetails(
  value: Record<string, unknown> | string | null | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asDispatchStatus(value: unknown): SystemAlertDispatchStatus | null {
  return value === 'sent' || value === 'skipped' || value === 'failed' ? value : null;
}

function asDispatchReason(value: unknown): SystemAlertDispatchReason | null {
  return value === 'sent' ||
    value === 'disabled' ||
    value === 'not_configured' ||
    value === 'no_issues' ||
    value === 'webhook_failed' ||
    value === 'webhook_error'
    ? value
    : null;
}

function asSeverity(value: unknown): SystemAlertSeverity | null {
  return value === 'ok' || value === 'info' || value === 'warning' || value === 'critical'
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
