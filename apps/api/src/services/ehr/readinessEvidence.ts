// =============================================================================
// Medgnosis API — EHR tenant readiness evidence
// Read-only operational evidence for SMART discovery drift and launch health.
// =============================================================================

import { sql } from '@medgnosis/db';
import { getLatestCapabilitySnapshot, type EhrTenant } from './tenantRegistry.js';
import {
  evaluateTenantPolicy,
  insecureTenantEndpointFields,
  isKnownEhrVendor,
  isProductionTenantEnvironment,
  type TenantEndpointField,
} from './tenantPolicy.js';

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

export interface EhrCapabilityReadinessEvidence {
  previousSnapshotId: number | null;
  previousCapturedAt: string | null;
  addedResourceTypes: string[];
  removedResourceTypes: string[];
  changedResourceTypes: string[];
  changedResourceCount: number;
  requiredBulkResourceTypes: string[];
  supportedRequiredBulkResourceTypes: string[];
  missingRequiredBulkResourceTypes: string[];
  bulkResourceCoverageRatio: number | null;
}

export type EhrBackendCredentialStatus = 'not_configured' | 'ready' | 'incomplete';

export interface EhrBackendServicesEvidence {
  enabledClientCount: number;
  authMethods: string[];
  credentialStatus: EhrBackendCredentialStatus;
  hasClientSecretRef: boolean;
  hasPrivateKeyRef: boolean;
  hasJwksUrl: boolean;
  scopesRequestedCount: number;
  scopesGrantedCount: number;
  tokenEndpointPresent: boolean;
  readyForTokenExchange: boolean;
  latestTokenIssuedAt: string | null;
  latestTokenExpiresAt: string | null;
  latestTokenExpired: boolean | null;
  tokenRequests24h: number;
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

export interface EhrBulkDiagnosticEvidence {
  readyForManualKickoff: boolean;
  activeJobs: number;
  failedJobs24h: number;
  completedJobs24h: number;
  latestJobRequestedAt: string | null;
  latestCompletedAt: string | null;
  enabledScheduleCount: number;
  overdueScheduleCount: number;
  nextScheduledAt: string | null;
}

export interface EhrReadinessIssue {
  severity: EhrReadinessIssueSeverity;
  code: string;
  message: string;
}

/**
 * Production-hardening posture evidence: HTTPS-only transport on production
 * tenants and known-vendor/adapter enforcement. Additive evidence block — the
 * derived issues are also folded into `issues`.
 */
export interface EhrTenantPolicyEvidence {
  isProductionEnvironment: boolean;
  httpsRequired: boolean;
  insecureEndpointFields: TenantEndpointField[];
  transportSecure: boolean;
  vendor: string;
  vendorKnown: boolean;
}

export interface EhrTenantReadinessEvidence {
  ehrTenantId: number;
  generatedAt: string;
  discovery: EhrDiscoveryEvidence;
  capability: EhrCapabilityReadinessEvidence;
  backendServices: EhrBackendServicesEvidence;
  launch: EhrLaunchEvidence;
  bulkDiagnostics: EhrBulkDiagnosticEvidence;
  policy: EhrTenantPolicyEvidence;
  issues: EhrReadinessIssue[];
}

interface BackendClientEvidenceRow {
  auth_method: string;
  has_client_secret_ref: boolean | null;
  has_private_key_ref: boolean | null;
  has_jwks_url: boolean | null;
  scopes_requested: string | null;
  scopes_granted: string | null;
}

interface BackendTokenEvidenceRow {
  latest_token_issued_at: string | null;
  latest_token_expires_at: string | null;
  latest_token_expired: boolean | null;
  token_requests_24h: number | string | null;
}

interface PreviousCapabilitySnapshotRow {
  id: number | string;
  resource_support: JsonRecord | null;
  captured_at: string;
}

interface BulkJobDiagnosticEvidenceRow {
  active_jobs: number | string | null;
  failed_jobs_24h: number | string | null;
  completed_jobs_24h: number | string | null;
  latest_job_requested_at: string | null;
  latest_completed_at: string | null;
}

interface BulkScheduleDiagnosticEvidenceRow {
  enabled_schedule_count: number | string | null;
  overdue_schedule_count: number | string | null;
  next_scheduled_at: string | null;
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

const REQUIRED_BULK_RESOURCE_TYPES = ['Patient', 'Observation', 'Condition', 'Encounter'];
const BACKEND_PRIVATE_KEY_METHODS = new Set(['private_key_jwt']);
const BACKEND_CLIENT_SECRET_METHODS = new Set(['client_secret_post', 'client_secret_basic']);

export async function getTenantReadinessEvidence(tenant: EhrTenant): Promise<EhrTenantReadinessEvidence> {
  const [snapshot, previousSnapshotRows, backendRows, tokenRows, bulkJobRows, bulkScheduleRows, sessionRows, auditRows] = await Promise.all([
    getLatestCapabilitySnapshot(tenant.id),
    getPreviousCapabilitySnapshot(tenant.id),
    getBackendClientEvidence(tenant.id),
    getBackendTokenEvidence(tenant.id),
    getBulkJobDiagnosticEvidence(tenant.id),
    getBulkScheduleDiagnosticEvidence(tenant.id),
    getSmartLaunchSessionEvidence(tenant.id),
    getSmartLaunchAuditEvidence(tenant.id),
  ]);

  const discovery = buildDiscoveryEvidence(tenant, snapshot);
  const capability = buildCapabilityReadinessEvidence(snapshot, previousSnapshotRows[0]);
  const backendServices = buildBackendServicesEvidence(backendRows, tokenRows[0], discovery);
  const launch = buildLaunchEvidence(sessionRows[0], auditRows[0]);
  const bulkDiagnostics = buildBulkDiagnosticEvidence(bulkJobRows[0], bulkScheduleRows[0], backendServices, capability);
  const policy = buildTenantPolicyEvidence(tenant);
  const issues = buildReadinessIssues(discovery, capability, backendServices, launch, bulkDiagnostics, tenant);

  return {
    ehrTenantId: tenant.id,
    generatedAt: new Date().toISOString(),
    discovery,
    capability,
    backendServices,
    launch,
    bulkDiagnostics,
    policy,
    issues,
  };
}

function buildTenantPolicyEvidence(tenant: EhrTenant): EhrTenantPolicyEvidence {
  const httpsRequired = isProductionTenantEnvironment(tenant.environment);
  const insecureEndpointFields = insecureTenantEndpointFields(tenant);
  return {
    isProductionEnvironment: httpsRequired,
    httpsRequired,
    insecureEndpointFields,
    transportSecure: insecureEndpointFields.length === 0,
    vendor: tenant.vendor,
    vendorKnown: isKnownEhrVendor(tenant.vendor),
  };
}

function getPreviousCapabilitySnapshot(ehrTenantId: number): Promise<PreviousCapabilitySnapshotRow[]> {
  return sql<PreviousCapabilitySnapshotRow[]>`
    SELECT id,
           resource_support,
           captured_at::text AS captured_at
    FROM phm_edw.ehr_capability_snapshot
    WHERE ehr_tenant_id = ${ehrTenantId}
    ORDER BY captured_at DESC, id DESC
    OFFSET 1
    LIMIT 1
  `;
}

function getBackendClientEvidence(ehrTenantId: number): Promise<BackendClientEvidenceRow[]> {
  return sql<BackendClientEvidenceRow[]>`
    SELECT auth_method,
           (client_secret_ref IS NOT NULL)::boolean AS has_client_secret_ref,
           (private_key_ref IS NOT NULL)::boolean AS has_private_key_ref,
           (jwks_url IS NOT NULL)::boolean AS has_jwks_url,
           scopes_requested,
           scopes_granted
    FROM phm_edw.ehr_client_registration
    WHERE ehr_tenant_id = ${ehrTenantId}
      AND client_type = 'backend_services'
      AND enabled = TRUE
    ORDER BY updated_at DESC
  `;
}

function getBackendTokenEvidence(ehrTenantId: number): Promise<BackendTokenEvidenceRow[]> {
  return sql<BackendTokenEvidenceRow[]>`
    WITH latest AS (
      SELECT issued_at,
             expires_at
      FROM phm_edw.smart_token_metadata
      WHERE ehr_tenant_id = ${ehrTenantId}
        AND smart_launch_session_id IS NULL
        AND scope LIKE '%system/%'
      ORDER BY issued_at DESC NULLS LAST, id DESC
      LIMIT 1
    )
    SELECT (SELECT issued_at::text FROM latest) AS latest_token_issued_at,
           (SELECT expires_at::text FROM latest) AS latest_token_expires_at,
           (SELECT (expires_at IS NOT NULL AND expires_at <= NOW())::boolean FROM latest) AS latest_token_expired,
           COUNT(*) FILTER (
             WHERE issued_at >= NOW() - interval '24 hours'
               AND smart_launch_session_id IS NULL
               AND scope LIKE '%system/%'
           )::integer AS token_requests_24h
    FROM phm_edw.smart_token_metadata
    WHERE ehr_tenant_id = ${ehrTenantId}
  `;
}

function getBulkJobDiagnosticEvidence(ehrTenantId: number): Promise<BulkJobDiagnosticEvidenceRow[]> {
  return sql<BulkJobDiagnosticEvidenceRow[]>`
    SELECT COUNT(*) FILTER (WHERE status IN ('accepted', 'in_progress'))::integer AS active_jobs,
           COUNT(*) FILTER (
             WHERE status = 'failed'
               AND updated_at >= NOW() - interval '24 hours'
           )::integer AS failed_jobs_24h,
           COUNT(*) FILTER (
             WHERE status = 'completed'
               AND completed_at >= NOW() - interval '24 hours'
           )::integer AS completed_jobs_24h,
           MAX(requested_at)::text AS latest_job_requested_at,
           MAX(completed_at) FILTER (WHERE status = 'completed')::text AS latest_completed_at
    FROM phm_edw.ehr_bulk_job
    WHERE ehr_tenant_id = ${ehrTenantId}
  `;
}

function getBulkScheduleDiagnosticEvidence(ehrTenantId: number): Promise<BulkScheduleDiagnosticEvidenceRow[]> {
  return sql<BulkScheduleDiagnosticEvidenceRow[]>`
    SELECT COUNT(*) FILTER (WHERE enabled = TRUE)::integer AS enabled_schedule_count,
           COUNT(*) FILTER (
             WHERE enabled = TRUE
               AND next_run_at IS NOT NULL
               AND next_run_at <= NOW()
           )::integer AS overdue_schedule_count,
           MIN(next_run_at) FILTER (WHERE enabled = TRUE AND next_run_at IS NOT NULL)::text AS next_scheduled_at
    FROM phm_edw.ehr_bulk_schedule
    WHERE ehr_tenant_id = ${ehrTenantId}
  `;
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

function buildCapabilityReadinessEvidence(
  snapshot: Awaited<ReturnType<typeof getLatestCapabilitySnapshot>>,
  previousSnapshot: PreviousCapabilitySnapshotRow | undefined,
): EhrCapabilityReadinessEvidence {
  const resourceSupport = asRecord(snapshot?.resourceSupport) ?? {};
  const previousResourceSupport = asRecord(previousSnapshot?.resource_support) ?? {};
  const currentResourceTypes = Object.keys(resourceSupport).sort();
  const previousResourceTypes = Object.keys(previousResourceSupport).sort();
  const addedResourceTypes = currentResourceTypes.filter((resourceType) => !previousResourceTypes.includes(resourceType));
  const removedResourceTypes = previousResourceTypes.filter((resourceType) => !currentResourceTypes.includes(resourceType));
  const changedResourceTypes = currentResourceTypes.filter((resourceType) =>
    previousResourceTypes.includes(resourceType)
      && stableJson(resourceSupport[resourceType]) !== stableJson(previousResourceSupport[resourceType]),
  );
  const supportedRequiredBulkResourceTypes = REQUIRED_BULK_RESOURCE_TYPES.filter((resourceType) =>
    Object.prototype.hasOwnProperty.call(resourceSupport, resourceType),
  );
  const missingRequiredBulkResourceTypes = REQUIRED_BULK_RESOURCE_TYPES.filter((resourceType) =>
    !Object.prototype.hasOwnProperty.call(resourceSupport, resourceType),
  );
  return {
    previousSnapshotId: previousSnapshot ? toNumber(previousSnapshot.id) : null,
    previousCapturedAt: previousSnapshot?.captured_at ?? null,
    addedResourceTypes,
    removedResourceTypes,
    changedResourceTypes,
    changedResourceCount: changedResourceTypes.length,
    requiredBulkResourceTypes: REQUIRED_BULK_RESOURCE_TYPES,
    supportedRequiredBulkResourceTypes,
    missingRequiredBulkResourceTypes,
    bulkResourceCoverageRatio: REQUIRED_BULK_RESOURCE_TYPES.length === 0
      ? null
      : supportedRequiredBulkResourceTypes.length / REQUIRED_BULK_RESOURCE_TYPES.length,
  };
}

function buildBackendServicesEvidence(
  rows: BackendClientEvidenceRow[],
  tokenRow: BackendTokenEvidenceRow | undefined,
  discovery: EhrDiscoveryEvidence,
): EhrBackendServicesEvidence {
  const enabledClientCount = rows.length;
  const authMethods = uniqueStrings(rows.map((row) => row.auth_method));
  const hasClientSecretRef = rows.some((row) => row.has_client_secret_ref === true);
  const hasPrivateKeyRef = rows.some((row) => row.has_private_key_ref === true);
  const hasJwksUrl = rows.some((row) => row.has_jwks_url === true);
  const scopesRequested = rows.flatMap((row) => splitScopes(row.scopes_requested));
  const scopesGranted = rows.flatMap((row) => splitScopes(row.scopes_granted));
  const credentialStatus = backendCredentialStatus(rows);
  const readyForTokenExchange = enabledClientCount > 0
    && credentialStatus === 'ready'
    && discovery.tokenEndpointPresent
    && scopesRequested.length > 0;

  return {
    enabledClientCount,
    authMethods,
    credentialStatus,
    hasClientSecretRef,
    hasPrivateKeyRef,
    hasJwksUrl,
    scopesRequestedCount: uniqueStrings(scopesRequested).length,
    scopesGrantedCount: uniqueStrings(scopesGranted).length,
    tokenEndpointPresent: discovery.tokenEndpointPresent,
    readyForTokenExchange,
    latestTokenIssuedAt: tokenRow?.latest_token_issued_at ?? null,
    latestTokenExpiresAt: tokenRow?.latest_token_expires_at ?? null,
    latestTokenExpired: tokenRow?.latest_token_expired ?? null,
    tokenRequests24h: toNumber(tokenRow?.token_requests_24h),
  };
}

function buildBulkDiagnosticEvidence(
  jobRow: BulkJobDiagnosticEvidenceRow | undefined,
  scheduleRow: BulkScheduleDiagnosticEvidenceRow | undefined,
  backend: EhrBackendServicesEvidence,
  capability: EhrCapabilityReadinessEvidence,
): EhrBulkDiagnosticEvidence {
  return {
    readyForManualKickoff: backend.readyForTokenExchange
      && capability.missingRequiredBulkResourceTypes.length === 0,
    activeJobs: toNumber(jobRow?.active_jobs),
    failedJobs24h: toNumber(jobRow?.failed_jobs_24h),
    completedJobs24h: toNumber(jobRow?.completed_jobs_24h),
    latestJobRequestedAt: jobRow?.latest_job_requested_at ?? null,
    latestCompletedAt: jobRow?.latest_completed_at ?? null,
    enabledScheduleCount: toNumber(scheduleRow?.enabled_schedule_count),
    overdueScheduleCount: toNumber(scheduleRow?.overdue_schedule_count),
    nextScheduledAt: scheduleRow?.next_scheduled_at ?? null,
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
  capability: EhrCapabilityReadinessEvidence,
  backend: EhrBackendServicesEvidence,
  launch: EhrLaunchEvidence,
  bulk: EhrBulkDiagnosticEvidence,
  tenant: EhrTenant,
): EhrReadinessIssue[] {
  const issues: EhrReadinessIssue[] = discovery.drift.map((issue) => ({ ...issue }));
  for (const finding of evaluateTenantPolicy(tenant)) {
    issues.push({ severity: finding.severity, code: finding.code, message: finding.message });
  }
  if (capability.missingRequiredBulkResourceTypes.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'bulk_resource_capability_gap',
      message: `CapabilityStatement is missing Bulk readiness resource type(s): ${capability.missingRequiredBulkResourceTypes.join(', ')}.`,
    });
  }
  if (capability.removedResourceTypes.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'capability_resource_removed',
      message: `Latest CapabilityStatement no longer advertises resource type(s): ${capability.removedResourceTypes.join(', ')}.`,
    });
  }
  if (capability.changedResourceTypes.length > 0) {
    issues.push({
      severity: 'info',
      code: 'capability_resource_changed',
      message: `${capability.changedResourceCount} CapabilityStatement resource definition(s) changed since the previous snapshot.`,
    });
  }
  if (backend.enabledClientCount === 0) {
    issues.push({
      severity: 'warning',
      code: 'backend_client_missing',
      message: 'No enabled SMART Backend Services client is configured for Bulk Data and system refresh operations.',
    });
  } else if (backend.credentialStatus === 'incomplete') {
    issues.push({
      severity: 'critical',
      code: 'backend_credentials_incomplete',
      message: 'The enabled Backend Services client is missing required credential references for its auth method.',
    });
  }
  if (backend.enabledClientCount > 0 && !backend.tokenEndpointPresent) {
    issues.push({
      severity: 'critical',
      code: 'backend_token_endpoint_missing',
      message: 'Backend Services token exchange is blocked because SMART discovery has no token endpoint.',
    });
  }
  if (backend.enabledClientCount > 0 && backend.scopesRequestedCount === 0) {
    issues.push({
      severity: 'critical',
      code: 'backend_scopes_missing',
      message: 'The enabled Backend Services client has no requested system scopes configured.',
    });
  }
  if (backend.readyForTokenExchange && !backend.latestTokenIssuedAt) {
    issues.push({
      severity: 'warning',
      code: 'backend_token_not_exercised',
      message: 'Backend Services configuration is ready, but no persisted system-token exchange evidence exists.',
    });
  }
  if (backend.latestTokenExpired === true) {
    issues.push({
      severity: 'warning',
      code: 'backend_token_expired',
      message: 'The most recent persisted Backend Services token metadata is expired.',
    });
  }
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
  if (bulk.failedJobs24h > 0) {
    issues.push({
      severity: 'warning',
      code: 'bulk_failures_24h',
      message: `${bulk.failedJobs24h} Bulk Data job(s) failed in the last 24 hours.`,
    });
  }
  if (bulk.overdueScheduleCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'bulk_schedules_overdue',
      message: `${bulk.overdueScheduleCount} enabled Bulk schedule(s) are overdue.`,
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

function splitScopes(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(/\s+/).map((scope) => scope.trim()).filter(Boolean);
}

function backendCredentialStatus(rows: BackendClientEvidenceRow[]): EhrBackendCredentialStatus {
  if (rows.length === 0) return 'not_configured';
  const anyReady = rows.some((row) => {
    if (BACKEND_PRIVATE_KEY_METHODS.has(row.auth_method)) return row.has_private_key_ref === true;
    if (BACKEND_CLIENT_SECRET_METHODS.has(row.auth_method)) return row.has_client_secret_ref === true;
    return true;
  });
  return anyReady ? 'ready' : 'incomplete';
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function issueSeverityRank(severity: EhrReadinessIssueSeverity): number {
  if (severity === 'critical') return 3;
  if (severity === 'warning') return 2;
  return 1;
}
