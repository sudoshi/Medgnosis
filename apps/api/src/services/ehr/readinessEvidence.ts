// =============================================================================
// Medgnosis API — EHR tenant readiness evidence
// Read-only operational evidence for SMART discovery drift and launch health.
// =============================================================================

import { sql } from '@medgnosis/db';
import { getLatestCapabilitySnapshot, type EhrTenant } from './tenantRegistry.js';

export type EhrReadinessIssueSeverity = 'info' | 'warning' | 'critical';

export interface EhrDiscoveryDriftIssue {
  code: string;
  severity: EhrReadinessIssueSeverity;
  message: string;
}

export interface EhrDiscoveryEvidence {
  latestSnapshotId: number | null;
  capturedAt: string | null;
  smartConfigurationUrl: string | null;
  capabilityStatementUrl: string | null;
  smartOk: boolean;
  capabilityOk: boolean;
  registeredIssuer: string | null;
  discoveredIssuer: string | null;
  issuerMatches: boolean | null;
  authorizationEndpointPresent: boolean;
  tokenEndpointPresent: boolean;
  fhirVersion: string | null;
  resourceCount: number;
  drift: EhrDiscoveryDriftIssue[];
}

export interface EhrLaunchEvidence {
  latestLaunchStartedAt: string | null;
  latestLaunchDeniedAt: string | null;
  latestCallbackSucceededAt: string | null;
  latestCallbackFailedAt: string | null;
  latestHandoffCompletedAt: string | null;
  latestSessionCreatedAt: string | null;
  latestSessionConsumedAt: string | null;
  latestSessionHandoffConsumedAt: string | null;
  activePendingLaunches: number;
  expiredPendingLaunches: number;
  launchesStarted24h: number;
  launchesDenied24h: number;
  callbacksSucceeded24h: number;
  callbacksFailed24h: number;
  handoffsCompleted24h: number;
}

export interface EhrReadinessIssue {
  severity: EhrReadinessIssueSeverity;
  code: string;
  message: string;
}

export interface EhrTenantReadinessEvidence {
  ehrTenantId: number;
  generatedAt: string;
  discovery: EhrDiscoveryEvidence;
  launch: EhrLaunchEvidence;
  issues: EhrReadinessIssue[];
}

interface SmartLaunchSessionEvidenceRow {
  latest_session_created_at: string | null;
  latest_session_consumed_at: string | null;
  latest_session_handoff_consumed_at: string | null;
  active_pending_launches: number | string | null;
  expired_pending_launches: number | string | null;
}

interface SmartLaunchAuditEvidenceRow {
  latest_launch_started_at: string | null;
  latest_launch_denied_at: string | null;
  latest_callback_succeeded_at: string | null;
  latest_callback_failed_at: string | null;
  latest_handoff_completed_at: string | null;
  launches_started_24h: number | string | null;
  launches_denied_24h: number | string | null;
  callbacks_succeeded_24h: number | string | null;
  callbacks_failed_24h: number | string | null;
  handoffs_completed_24h: number | string | null;
}

interface JsonRecord {
  [key: string]: unknown;
}

export async function getTenantReadinessEvidence(tenant: EhrTenant): Promise<EhrTenantReadinessEvidence> {
  const [snapshot, sessionRows, auditRows] = await Promise.all([
    getLatestCapabilitySnapshot(tenant.id),
    getSmartLaunchSessionEvidence(tenant.id),
    getSmartLaunchAuditEvidence(tenant.id),
  ]);

  const discovery = buildDiscoveryEvidence(tenant, snapshot);
  const launch = buildLaunchEvidence(sessionRows[0], auditRows[0]);
  const issues = buildReadinessIssues(discovery, launch);

  return {
    ehrTenantId: tenant.id,
    generatedAt: new Date().toISOString(),
    discovery,
    launch,
    issues,
  };
}

function getSmartLaunchSessionEvidence(ehrTenantId: number): Promise<SmartLaunchSessionEvidenceRow[]> {
  return sql<SmartLaunchSessionEvidenceRow[]>`
    SELECT MAX(created_at)::text AS latest_session_created_at,
           MAX(consumed_at)::text AS latest_session_consumed_at,
           MAX(handoff_consumed_at)::text AS latest_session_handoff_consumed_at,
           COUNT(*) FILTER (WHERE status = 'pending' AND expires_at > NOW())::integer AS active_pending_launches,
           COUNT(*) FILTER (WHERE status = 'pending' AND expires_at <= NOW())::integer AS expired_pending_launches
    FROM phm_edw.smart_launch_session
    WHERE ehr_tenant_id = ${ehrTenantId}
  `;
}

function getSmartLaunchAuditEvidence(ehrTenantId: number): Promise<SmartLaunchAuditEvidenceRow[]> {
  return sql<SmartLaunchAuditEvidenceRow[]>`
    SELECT MAX(created_at) FILTER (WHERE action = 'ehr_smart_launch_start')::text AS latest_launch_started_at,
           MAX(created_at) FILTER (WHERE action = 'ehr_smart_launch_denied')::text AS latest_launch_denied_at,
           MAX(created_at) FILTER (WHERE action = 'ehr_smart_callback_success')::text AS latest_callback_succeeded_at,
           MAX(created_at) FILTER (WHERE action = 'ehr_smart_callback_failed')::text AS latest_callback_failed_at,
           MAX(created_at) FILTER (WHERE action = 'ehr_smart_handoff_complete')::text AS latest_handoff_completed_at,
           COUNT(*) FILTER (
             WHERE action = 'ehr_smart_launch_start'
               AND created_at >= NOW() - interval '24 hours'
           )::integer AS launches_started_24h,
           COUNT(*) FILTER (
             WHERE action = 'ehr_smart_launch_denied'
               AND created_at >= NOW() - interval '24 hours'
           )::integer AS launches_denied_24h,
           COUNT(*) FILTER (
             WHERE action = 'ehr_smart_callback_success'
               AND created_at >= NOW() - interval '24 hours'
           )::integer AS callbacks_succeeded_24h,
           COUNT(*) FILTER (
             WHERE action = 'ehr_smart_callback_failed'
               AND created_at >= NOW() - interval '24 hours'
           )::integer AS callbacks_failed_24h,
           COUNT(*) FILTER (
             WHERE action = 'ehr_smart_handoff_complete'
               AND created_at >= NOW() - interval '24 hours'
           )::integer AS handoffs_completed_24h
    FROM audit_log
    WHERE action IN (
        'ehr_smart_launch_start',
        'ehr_smart_launch_denied',
        'ehr_smart_callback_success',
        'ehr_smart_callback_failed',
        'ehr_smart_handoff_complete'
      )
      AND (
        resource_id = ${String(ehrTenantId)}
        OR details->>'ehrTenantId' = ${String(ehrTenantId)}
      )
  `;
}

function buildDiscoveryEvidence(
  tenant: EhrTenant,
  snapshot: Awaited<ReturnType<typeof getLatestCapabilitySnapshot>>,
): EhrDiscoveryEvidence {
  const smartConfiguration = asRecord(snapshot?.smartConfiguration);
  const capabilityStatement = asRecord(snapshot?.capabilityStatement);
  const smartSummary = asRecord(smartConfiguration?.['summary']);
  const capabilitySummary = asRecord(capabilityStatement?.['summary']);
  const discoveredIssuer = stringValue(smartSummary?.['issuer']);
  const expectedIssuers = expectedIssuerValues(tenant);
  const issuerMatches = discoveredIssuer ? expectedIssuersContain(expectedIssuers, discoveredIssuer) : null;
  const smartOk = smartConfiguration?.['ok'] === true;
  const capabilityOk = capabilityStatement?.['ok'] === true;
  const authorizationEndpointPresent = Boolean(stringValue(smartSummary?.['authorizationEndpoint']));
  const tokenEndpointPresent = Boolean(stringValue(smartSummary?.['tokenEndpoint']));
  const resourceCount = Object.keys(asRecord(snapshot?.resourceSupport) ?? {}).length;

  const evidence: EhrDiscoveryEvidence = {
    latestSnapshotId: snapshot?.id ?? null,
    capturedAt: snapshot?.capturedAt ?? null,
    smartConfigurationUrl: stringValue(smartConfiguration?.['url']),
    capabilityStatementUrl: stringValue(capabilityStatement?.['url']),
    smartOk,
    capabilityOk,
    registeredIssuer: tenant.issuer,
    discoveredIssuer,
    issuerMatches,
    authorizationEndpointPresent,
    tokenEndpointPresent,
    fhirVersion: stringValue(capabilitySummary?.['fhirVersion']),
    resourceCount,
    drift: [],
  };

  evidence.drift = discoveryDrift(evidence);
  return evidence;
}

function buildLaunchEvidence(
  sessionRow: SmartLaunchSessionEvidenceRow | undefined,
  auditRow: SmartLaunchAuditEvidenceRow | undefined,
): EhrLaunchEvidence {
  return {
    latestLaunchStartedAt: auditRow?.latest_launch_started_at ?? sessionRow?.latest_session_created_at ?? null,
    latestLaunchDeniedAt: auditRow?.latest_launch_denied_at ?? null,
    latestCallbackSucceededAt: auditRow?.latest_callback_succeeded_at ?? sessionRow?.latest_session_consumed_at ?? null,
    latestCallbackFailedAt: auditRow?.latest_callback_failed_at ?? null,
    latestHandoffCompletedAt: auditRow?.latest_handoff_completed_at ?? sessionRow?.latest_session_handoff_consumed_at ?? null,
    latestSessionCreatedAt: sessionRow?.latest_session_created_at ?? null,
    latestSessionConsumedAt: sessionRow?.latest_session_consumed_at ?? null,
    latestSessionHandoffConsumedAt: sessionRow?.latest_session_handoff_consumed_at ?? null,
    activePendingLaunches: toNumber(sessionRow?.active_pending_launches),
    expiredPendingLaunches: toNumber(sessionRow?.expired_pending_launches),
    launchesStarted24h: toNumber(auditRow?.launches_started_24h),
    launchesDenied24h: toNumber(auditRow?.launches_denied_24h),
    callbacksSucceeded24h: toNumber(auditRow?.callbacks_succeeded_24h),
    callbacksFailed24h: toNumber(auditRow?.callbacks_failed_24h),
    handoffsCompleted24h: toNumber(auditRow?.handoffs_completed_24h),
  };
}

function discoveryDrift(evidence: Omit<EhrDiscoveryEvidence, 'drift'>): EhrDiscoveryDriftIssue[] {
  const drift: EhrDiscoveryDriftIssue[] = [];
  if (!evidence.latestSnapshotId) {
    drift.push({
      severity: 'warning',
      code: 'discovery_missing',
      message: 'No SMART discovery snapshot has been captured for this tenant.',
    });
    return drift;
  }
  if (!evidence.smartOk) {
    drift.push({
      severity: 'critical',
      code: 'smart_configuration_failed',
      message: 'The latest SMART configuration fetch did not succeed.',
    });
  }
  if (!evidence.capabilityOk) {
    drift.push({
      severity: 'warning',
      code: 'capability_statement_failed',
      message: 'The latest CapabilityStatement fetch did not succeed.',
    });
  }
  if (evidence.issuerMatches === false) {
    drift.push({
      severity: 'critical',
      code: 'issuer_mismatch',
      message: 'The discovered SMART issuer does not match the registered tenant issuer or FHIR base URL.',
    });
  }
  if (!evidence.authorizationEndpointPresent) {
    drift.push({
      severity: 'critical',
      code: 'authorization_endpoint_missing',
      message: 'The latest SMART configuration does not advertise an authorization endpoint.',
    });
  }
  if (!evidence.tokenEndpointPresent) {
    drift.push({
      severity: 'critical',
      code: 'token_endpoint_missing',
      message: 'The latest SMART configuration does not advertise a token endpoint.',
    });
  }
  if (evidence.resourceCount === 0) {
    drift.push({
      severity: 'warning',
      code: 'capability_resources_missing',
      message: 'No FHIR resource support was extracted from the latest CapabilityStatement.',
    });
  }
  return drift;
}

function buildReadinessIssues(
  discovery: EhrDiscoveryEvidence,
  launch: EhrLaunchEvidence,
): EhrReadinessIssue[] {
  const issues: EhrReadinessIssue[] = discovery.drift.map((issue) => ({ ...issue }));
  if (!launch.latestLaunchStartedAt) {
    issues.push({
      severity: 'info',
      code: 'launch_not_exercised',
      message: 'No SMART launch attempt has been recorded for this tenant.',
    });
  }
  if (launch.launchesDenied24h > 0) {
    issues.push({
      severity: 'warning',
      code: 'launch_denials_24h',
      message: `${launch.launchesDenied24h} SMART launch denial(s) were recorded in the last 24 hours.`,
    });
  }
  if (launch.callbacksFailed24h > 0) {
    issues.push({
      severity: 'warning',
      code: 'callback_failures_24h',
      message: `${launch.callbacksFailed24h} SMART callback failure(s) were recorded in the last 24 hours.`,
    });
  }
  if (launch.expiredPendingLaunches > 0) {
    issues.push({
      severity: 'warning',
      code: 'expired_pending_launches',
      message: `${launch.expiredPendingLaunches} pending SMART launch session(s) have expired without callback completion.`,
    });
  }
  return issues.sort((left, right) => issueSeverityRank(right.severity) - issueSeverityRank(left.severity));
}

function expectedIssuerValues(tenant: EhrTenant): string[] {
  return uniqueStrings([tenant.issuer, tenant.audience, tenant.fhirBaseUrl]);
}

function expectedIssuersContain(expected: string[], discovered: string): boolean {
  const normalizedDiscovered = normalizeUrl(discovered);
  if (!normalizedDiscovered) return false;
  return expected.some((value) => normalizeUrl(value) === normalizedDiscovered);
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    const trimmed = value.trim();
    return trimmed ? trimmed.replace(/\/$/, '') : null;
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function issueSeverityRank(severity: EhrReadinessIssueSeverity): number {
  if (severity === 'critical') return 3;
  if (severity === 'warning') return 2;
  return 1;
}
