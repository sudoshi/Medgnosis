// =============================================================================
// EHR FHIR request failure audit
// PHI-safe operational records and summaries for failed FHIR reads/searches and
// backend-services token requests.
// =============================================================================

import { sql } from '@medgnosis/db';
import { writeSystemAuditLog } from '../auditLog.js';
import type {
  EhrTenantRef,
  FhirRequestAudit,
  NormalizedOperationOutcome,
} from './types.js';
import type { EhrClientAuthMethod } from './tenantRegistry.js';

export type EhrFhirFailureSeverity = 'info' | 'warning' | 'critical';
export type EhrFhirFailureIssueSource = 'fhir_api' | 'backend_token';

export interface FhirRequestFailureAuditInput {
  tenant: EhrTenantRef;
  audit: FhirRequestAudit;
  outcome: NormalizedOperationOutcome;
}

export interface BackendTokenFailureAuditInput {
  tenant: EhrTenantRef & { id: number; orgId?: number | null };
  clientRegistrationId: number;
  authMethod: EhrClientAuthMethod;
  scope: string;
  status?: number;
  code: string;
  retryable: boolean;
  oauthErrorCode?: string | null;
}

export interface EhrFhirFailureIssue {
  severity: EhrFhirFailureSeverity;
  code: string;
  source: EhrFhirFailureIssueSource;
  resourceType: string | null;
  count: number;
  lastSeenAt: string | null;
  recommendedAction: string;
}

export interface EhrFhirFailureEvidence {
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
  issues: EhrFhirFailureIssue[];
}

export interface FailureAuditRow {
  action: string;
  created_at: string | null;
  details: Record<string, unknown> | string | null;
}

const FHIR_FAILURE_ACTION = 'ehr_fhir_request_failed';
const BACKEND_TOKEN_FAILURE_ACTION = 'ehr_backend_token_failed';
const AUTH_FAILURE_STATUSES = new Set([401, 403]);
const RATE_LIMIT_STATUS = 429;
const FHIR_AUTH_CRITICAL_THRESHOLD = 3;
const FHIR_RATE_LIMIT_CRITICAL_THRESHOLD = 3;
const BACKEND_TOKEN_RATE_LIMIT_CRITICAL_THRESHOLD = 3;
const FHIR_NETWORK_WARNING_THRESHOLD = 5;

export async function writeFhirRequestFailureAudit(input: FhirRequestFailureAuditInput): Promise<void> {
  const tenantId = tenantIdNumber(input.tenant.id);
  const details = compactRecord({
    ehrTenantId: tenantId,
    orgId: optionalNumber((input.tenant as { orgId?: unknown }).orgId),
    vendor: cleanString(input.tenant.vendor),
    method: input.audit.method,
    interaction: input.audit.interaction,
    resourceType: safeIdentifier(input.audit.resourceType),
    status: input.audit.status ?? input.outcome.status ?? null,
    classification: input.outcome.classification,
    retryable: input.outcome.retryable,
    attemptCount: nonNegativeInteger(input.audit.attemptCount),
    retryCount: nonNegativeInteger(input.audit.retryCount),
    durationMs: nonNegativeInteger(input.audit.durationMs),
    searchParamKeys: safeIdentifierList(input.audit.searchParamKeys),
    operationOutcomeIssueCodes: safeIdentifierList(input.outcome.issues.map((issue) => issue.code)),
    startedAt: input.audit.startedAt,
    completedAt: input.audit.completedAt,
  });

  await writeSystemAuditLog(
    FHIR_FAILURE_ACTION,
    'ehr_tenant',
    tenantId === null ? null : String(tenantId),
    details,
  );
}

export async function writeBackendTokenFailureAudit(input: BackendTokenFailureAuditInput): Promise<void> {
  const tenantId = tenantIdNumber(input.tenant.id);
  const scopeSummary = summarizeScope(input.scope);
  const details = compactRecord({
    ehrTenantId: tenantId,
    orgId: optionalNumber(input.tenant.orgId),
    vendor: cleanString(input.tenant.vendor),
    clientRegistrationId: input.clientRegistrationId,
    authMethod: input.authMethod,
    status: input.status ?? null,
    code: input.code,
    retryable: input.retryable,
    oauthErrorCode: safeIdentifier(input.oauthErrorCode),
    scopeCount: scopeSummary.scopeCount,
    scopeContexts: scopeSummary.scopeContexts,
    scopeResourceTypes: scopeSummary.scopeResourceTypes,
    occurredAt: new Date().toISOString(),
  });

  await writeSystemAuditLog(
    BACKEND_TOKEN_FAILURE_ACTION,
    'ehr_tenant',
    tenantId === null ? null : String(tenantId),
    details,
  );
}

export async function getTenantFhirFailureEvidence(
  ehrTenantId: number,
  now = new Date(),
): Promise<EhrFhirFailureEvidence> {
  const rows = await sql<FailureAuditRow[]>`
    SELECT action,
           created_at::text AS created_at,
           details
    FROM audit_log
    WHERE resource_type = 'ehr_tenant'
      AND resource_id = ${String(ehrTenantId)}
      AND action IN (${FHIR_FAILURE_ACTION}, ${BACKEND_TOKEN_FAILURE_ACTION})
      AND created_at >= NOW() - interval '24 hours'
    ORDER BY created_at DESC
  `;

  return summarizeFailureRows(rows, now);
}

export function summarizeFailureRows(
  rows: FailureAuditRow[],
  now = new Date(),
): EhrFhirFailureEvidence {
  const oneHourAgoMs = now.getTime() - 60 * 60 * 1000;
  const statusCounts24h: Record<string, number> = {};
  const backendTokenStatusCounts24h: Record<string, number> = {};
  const resourceTypes = new Set<string>();
  let failedRequests24h = 0;
  let authFailures24h = 0;
  let rateLimitFailures24h = 0;
  let rateLimitFailures1h = 0;
  let networkFailures24h = 0;
  let backendTokenFailures24h = 0;
  let backendTokenAuthFailures24h = 0;
  let backendTokenRateLimitFailures1h = 0;
  let latestFailureAt: string | null = null;
  let latestFailureMs = Number.NEGATIVE_INFINITY;
  let latestAuthFailureAt: string | null = null;
  let latestRateLimitFailureAt: string | null = null;
  let latestNetworkFailureAt: string | null = null;
  let latestBackendTokenFailureAt: string | null = null;
  let latestBackendTokenAuthFailureAt: string | null = null;
  let latestBackendTokenRateLimitAt: string | null = null;

  for (const row of rows) {
    const createdAt = row.created_at;
    const createdAtMs = createdAt ? Date.parse(createdAt) : Number.NaN;
    if (Number.isFinite(createdAtMs) && createdAtMs > latestFailureMs) {
      latestFailureAt = createdAt;
      latestFailureMs = createdAtMs;
    }

    const details = parseDetails(row.details);
    const status = optionalNumber(details?.status);
    const resourceType = safeIdentifier(details?.resourceType);
    if (resourceType) resourceTypes.add(resourceType);

    if (row.action === FHIR_FAILURE_ACTION) {
      failedRequests24h += 1;
      incrementStatusCount(statusCounts24h, status);
      if (status && AUTH_FAILURE_STATUSES.has(status)) {
        authFailures24h += 1;
        latestAuthFailureAt = maxTimestamp(latestAuthFailureAt, createdAt);
      }
      if (status === RATE_LIMIT_STATUS) {
        rateLimitFailures24h += 1;
        latestRateLimitFailureAt = maxTimestamp(latestRateLimitFailureAt, createdAt);
        if (Number.isFinite(createdAtMs) && createdAtMs >= oneHourAgoMs) {
          rateLimitFailures1h += 1;
        }
      }
      if (!status && ['network', 'timeout'].includes(cleanString(details?.classification) ?? '')) {
        networkFailures24h += 1;
        latestNetworkFailureAt = maxTimestamp(latestNetworkFailureAt, createdAt);
      }
      continue;
    }

    if (row.action === BACKEND_TOKEN_FAILURE_ACTION) {
      backendTokenFailures24h += 1;
      latestBackendTokenFailureAt = maxTimestamp(latestBackendTokenFailureAt, createdAt);
      incrementStatusCount(backendTokenStatusCounts24h, status);
      if (status && AUTH_FAILURE_STATUSES.has(status)) {
        backendTokenAuthFailures24h += 1;
        latestBackendTokenAuthFailureAt = maxTimestamp(latestBackendTokenAuthFailureAt, createdAt);
      }
      if (status === RATE_LIMIT_STATUS) {
        latestBackendTokenRateLimitAt = maxTimestamp(latestBackendTokenRateLimitAt, createdAt);
        if (Number.isFinite(createdAtMs) && createdAtMs >= oneHourAgoMs) {
          backendTokenRateLimitFailures1h += 1;
        }
      }
    }
  }

  const issues = buildFailureIssues({
    authFailures24h,
    rateLimitFailures1h,
    networkFailures24h,
    backendTokenFailures24h,
    backendTokenAuthFailures24h,
    backendTokenRateLimitFailures1h,
    latestAuthFailureAt,
    latestRateLimitFailureAt,
    latestNetworkFailureAt,
    latestBackendTokenFailureAt,
    latestBackendTokenAuthFailureAt,
    latestBackendTokenRateLimitAt,
  });

  return {
    failedRequests24h,
    authFailures24h,
    rateLimitFailures24h,
    rateLimitFailures1h,
    networkFailures24h,
    backendTokenFailures24h,
    backendTokenAuthFailures24h,
    backendTokenRateLimitFailures1h,
    latestFailureAt,
    statusCounts24h,
    backendTokenStatusCounts24h,
    affectedResourceTypes: [...resourceTypes].sort(),
    issues,
  };
}

function buildFailureIssues(input: {
  authFailures24h: number;
  rateLimitFailures1h: number;
  networkFailures24h: number;
  backendTokenFailures24h: number;
  backendTokenAuthFailures24h: number;
  backendTokenRateLimitFailures1h: number;
  latestAuthFailureAt: string | null;
  latestRateLimitFailureAt: string | null;
  latestNetworkFailureAt: string | null;
  latestBackendTokenFailureAt: string | null;
  latestBackendTokenAuthFailureAt: string | null;
  latestBackendTokenRateLimitAt: string | null;
}): EhrFhirFailureIssue[] {
  const issues: EhrFhirFailureIssue[] = [];

  if (input.authFailures24h > 0) {
    issues.push({
      severity: input.authFailures24h >= FHIR_AUTH_CRITICAL_THRESHOLD ? 'critical' : 'warning',
      code: 'fhir_auth_failures_24h',
      source: 'fhir_api',
      resourceType: null,
      count: input.authFailures24h,
      lastSeenAt: input.latestAuthFailureAt,
      recommendedAction: 'Check SMART launch/backend scopes and vendor authorization for failing FHIR reads.',
    });
  }

  if (input.rateLimitFailures1h > 0) {
    issues.push({
      severity: input.rateLimitFailures1h >= FHIR_RATE_LIMIT_CRITICAL_THRESHOLD ? 'critical' : 'warning',
      code: 'fhir_rate_limit_spike_1h',
      source: 'fhir_api',
      resourceType: null,
      count: input.rateLimitFailures1h,
      lastSeenAt: input.latestRateLimitFailureAt,
      recommendedAction: 'Reduce concurrent FHIR reads and review Retry-After behavior before retrying tenant refreshes.',
    });
  }

  if (input.backendTokenAuthFailures24h > 0) {
    issues.push({
      severity: 'critical',
      code: 'backend_token_auth_failures_24h',
      source: 'backend_token',
      resourceType: null,
      count: input.backendTokenAuthFailures24h,
      lastSeenAt: input.latestBackendTokenAuthFailureAt,
      recommendedAction: 'Run the backend token-check action and verify client credentials, key material, scopes, and vendor approval.',
    });
  } else if (input.backendTokenFailures24h > 0) {
    issues.push({
      severity: 'warning',
      code: 'backend_token_failures_24h',
      source: 'backend_token',
      resourceType: null,
      count: input.backendTokenFailures24h,
      lastSeenAt: input.latestBackendTokenFailureAt,
      recommendedAction: 'Review backend token-check evidence and vendor token endpoint availability.',
    });
  }

  if (input.backendTokenRateLimitFailures1h > 0) {
    issues.push({
      severity: input.backendTokenRateLimitFailures1h >= BACKEND_TOKEN_RATE_LIMIT_CRITICAL_THRESHOLD ? 'critical' : 'warning',
      code: 'backend_token_rate_limit_spike_1h',
      source: 'backend_token',
      resourceType: null,
      count: input.backendTokenRateLimitFailures1h,
      lastSeenAt: input.latestBackendTokenRateLimitAt,
      recommendedAction: 'Back off backend-services token checks and confirm vendor token endpoint rate limits.',
    });
  }

  if (input.networkFailures24h >= FHIR_NETWORK_WARNING_THRESHOLD) {
    issues.push({
      severity: 'warning',
      code: 'fhir_network_failures_24h',
      source: 'fhir_api',
      resourceType: null,
      count: input.networkFailures24h,
      lastSeenAt: input.latestNetworkFailureAt,
      recommendedAction: 'Check network connectivity and vendor FHIR availability before replaying refresh jobs.',
    });
  }

  return issues;
}

function incrementStatusCount(target: Record<string, number>, status: number | null): void {
  const key = status === null ? 'network' : String(status);
  target[key] = (target[key] ?? 0) + 1;
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

function parseDetails(value: Record<string, unknown> | string | null): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function summarizeScope(scope: string): {
  scopeCount: number;
  scopeContexts: string[];
  scopeResourceTypes: string[];
} {
  const items = scope.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  const contexts = new Set<string>();
  const resourceTypes = new Set<string>();

  for (const item of items) {
    const slashIndex = item.indexOf('/');
    const dotIndex = item.lastIndexOf('.');
    if (slashIndex > 0) {
      const context = safeIdentifier(item.slice(0, slashIndex));
      if (context) contexts.add(context);
    }
    if (slashIndex > 0 && dotIndex > slashIndex + 1) {
      const resourceType = safeIdentifier(item.slice(slashIndex + 1, dotIndex));
      if (resourceType) resourceTypes.add(resourceType);
    }
  }

  return {
    scopeCount: items.length,
    scopeContexts: [...contexts].sort(),
    scopeResourceTypes: [...resourceTypes].sort(),
  };
}

function safeIdentifierList(values: readonly unknown[] | undefined): string[] {
  return [...new Set((values ?? []).flatMap((value) => {
    const item = safeIdentifier(value);
    return item ? [item] : [];
  }))].sort();
}

function tenantIdNumber(value: unknown): number | null {
  const parsed = optionalNumber(value);
  return parsed && parsed > 0 ? parsed : null;
}

function optionalNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const numberValue = optionalNumber(value);
  return numberValue === null ? null : Math.max(0, Math.floor(numberValue));
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function safeIdentifier(value: unknown): string | null {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const normalized = cleaned.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80);
  return normalized.length > 0 ? normalized : null;
}

function maxTimestamp(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(right) > Date.parse(left) ? right : left;
}
