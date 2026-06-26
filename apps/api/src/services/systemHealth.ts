// =============================================================================
// Medgnosis API - System health service
// Read-only runtime checks for admin System Health.
// =============================================================================

import { Queue, type JobType } from 'bullmq';
import { Redis } from 'ioredis';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '@medgnosis/db';
import { config } from '../config.js';
import { getSolrClient, isSolrAvailable } from '../plugins/solr.js';
import { getOidcProviderConfig } from './auth/oidc/providerConfig.js';
import {
  listAuthProviderHealth,
  type AuthProviderHealth,
} from './auth/providerHealth.js';
import { getEhrSyncAlertingStatus, type EhrSyncAlertingStatus } from './ehr/syncAlerts.js';

export type HealthStatus = 'ok' | 'degraded' | 'blocked' | 'error' | 'disabled';

export interface SystemHealth {
  api: { status: HealthStatus; node_env: string };
  database: { status: HealthStatus; error?: string };
  redis: RedisHealth;
  solr: SolrHealth;
  auth: AuthHealth;
  workers: WorkerQueueHealth;
  ehr_tenants: EhrTenantReadiness;
  ehr_bulk: EhrBulkReadiness;
  ehr_sync_alerts: EhrSyncAlertingStatus;
  standards: StandardsReadiness;
  duration_ms: number;
}

export interface WorkerQueueHealth {
  status: HealthStatus;
  total_workers: number;
  counts: QueueCounts;
  queues: WorkerQueueStatus[];
}

export interface WorkerQueueStatus {
  name: string;
  label: string;
  role: string;
  status: HealthStatus;
  workers: number;
  paused: boolean;
  counts: QueueCounts;
  repeatable_jobs?: number;
  next_run_at?: string | null;
  latest_completed_at?: string | null;
  error?: string;
}

export interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
}

export interface EhrBulkReadiness {
  status: HealthStatus;
  queue_enabled: boolean;
  tenants: {
    total: number;
    active: number;
    with_backend_services: number;
    with_capability_snapshots: number;
    ready_for_bulk: number;
  };
  schedules: {
    enabled: number;
    due: number;
    failed_24h: number;
    next_run_at: string | null;
  };
  bulk_jobs: {
    active: number;
    failed_24h: number;
    completed_24h: number;
    latest_completed_at: string | null;
  };
  issues: string[];
  error?: string;
}

export interface EhrTenantReadiness {
  status: HealthStatus;
  tenants: {
    total: number;
    active: number;
    disabled: number;
    healthy: number;
    degraded: number;
    blocked: number;
    production: number;
    sandbox: number;
    staging: number;
  };
  discovery: {
    with_snapshots: number;
    smart_ok: number;
    capability_ok: number;
    with_resource_support: number;
    issuer_mismatches: number;
    missing_authorization_endpoint: number;
    missing_token_endpoint: number;
    latest_snapshot_at: string | null;
  };
  backend_services: {
    tenants_with_enabled_clients: number;
    enabled_clients: number;
    ready_for_token_exchange: number;
    credentials_incomplete: number;
    scopes_missing: number;
    token_requests_24h: number;
    latest_token_issued_at: string | null;
    latest_token_expired: number;
  };
  smart_launch: {
    launches_started_24h: number;
    launches_denied_24h: number;
    callbacks_succeeded_24h: number;
    callbacks_failed_24h: number;
    handoffs_completed_24h: number;
    expired_pending_launches: number;
    latest_success_at: string | null;
  };
  fhir_api: {
    failed_requests_24h: number;
    auth_failures_24h: number;
    rate_limit_failures_24h: number;
    network_failures_24h: number;
    backend_token_failures_24h: number;
    backend_token_auth_failures_24h: number;
    latest_failure_at: string | null;
    affected_resource_types: string[];
  };
  resource_coverage: {
    required_resource_types: string[];
    tenants_with_required_bulk_coverage: number;
    tenants_missing_required_bulk_coverage: number;
    average_required_bulk_coverage: number | null;
  };
  issues: string[];
  error?: string;
}

export interface AuthHealth {
  status: HealthStatus;
  local_enabled: boolean;
  oidc_enabled: boolean;
  providers: AuthProviderHealth[];
  error?: string;
}

export interface RedisHealth {
  status: HealthStatus;
  endpoint: string;
  pubsub?: {
    alert_pattern: string;
    patterns: number;
    alert_channels: number;
  };
  error?: string;
}

export interface SolrHealth {
  status: HealthStatus;
  enabled: boolean;
  url: string;
  cores: SolrCoreHealth[];
  error?: string;
}

export interface SolrCoreHealth {
  role: 'search' | 'clinical';
  name: string;
  healthy: boolean;
  status: Record<string, unknown> | null;
}

export interface StandardsReadiness {
  status: HealthStatus;
  checks: StandardsReadinessCheck[];
  issues: string[];
}

export interface StandardsReadinessCheck {
  key: 'cql' | 'fhir' | 'deqm';
  label: string;
  status: HealthStatus;
  runtime_configured: boolean;
  detail: string;
  commands: string[];
  artifacts: {
    present: number;
    total: number;
    missing: string[];
  };
}

export interface QueueDefinition {
  name: string;
  label: string;
  role: string;
  repeatable?: boolean;
}

interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number;
}

interface RepeatableJobInfo {
  next?: number | string | null;
}

interface CompletedJobInfo {
  finishedOn?: number | string | null;
}

interface EhrBulkReadinessRow {
  total_tenants: number | string | null;
  active_tenants: number | string | null;
  backend_services_enabled: number | string | null;
  capability_snapshots: number | string | null;
  ready_for_bulk: number | string | null;
  schedules_enabled: number | string | null;
  schedules_due: number | string | null;
  schedule_failures_24h: number | string | null;
  next_run_at: string | null;
  active_bulk_jobs: number | string | null;
  bulk_failures_24h: number | string | null;
  bulk_completed_24h: number | string | null;
  latest_completed_at: string | null;
}

interface EhrTenantReadinessRow {
  total_tenants: number | string | null;
  active_tenants: number | string | null;
  disabled_tenants: number | string | null;
  healthy_tenants: number | string | null;
  degraded_tenants: number | string | null;
  blocked_tenants: number | string | null;
  production_tenants: number | string | null;
  sandbox_tenants: number | string | null;
  staging_tenants: number | string | null;
  tenants_with_snapshots: number | string | null;
  tenants_smart_ok: number | string | null;
  tenants_capability_ok: number | string | null;
  tenants_with_resource_support: number | string | null;
  issuer_mismatches: number | string | null;
  missing_authorization_endpoint: number | string | null;
  missing_token_endpoint: number | string | null;
  latest_snapshot_at: string | null;
  tenants_with_enabled_backend_clients: number | string | null;
  enabled_backend_clients: number | string | null;
  tenants_ready_for_token_exchange: number | string | null;
  backend_credentials_incomplete: number | string | null;
  backend_scopes_missing: number | string | null;
  backend_token_requests_24h: number | string | null;
  latest_backend_token_issued_at: string | null;
  latest_backend_token_expired: number | string | null;
  launches_started_24h: number | string | null;
  launches_denied_24h: number | string | null;
  callbacks_succeeded_24h: number | string | null;
  callbacks_failed_24h: number | string | null;
  handoffs_completed_24h: number | string | null;
  expired_pending_launches: number | string | null;
  latest_launch_success_at: string | null;
  fhir_failed_requests_24h: number | string | null;
  fhir_auth_failures_24h: number | string | null;
  fhir_rate_limit_failures_24h: number | string | null;
  fhir_network_failures_24h: number | string | null;
  backend_token_failures_24h: number | string | null;
  backend_token_auth_failures_24h: number | string | null;
  latest_fhir_failure_at: string | null;
  affected_fhir_resource_types: string[] | null;
  required_bulk_resource_types: string[] | null;
  tenants_with_required_bulk_coverage: number | string | null;
  tenants_missing_required_bulk_coverage: number | string | null;
  average_required_bulk_coverage: number | string | null;
}

const QUEUE_JOB_TYPES: JobType[] = ['waiting', 'active', 'delayed', 'failed'];

const HEALTH_QUEUE_DEFINITIONS: QueueDefinition[] = [
  { name: 'medgnosis-rules', label: 'Rules engine', role: 'clinical' },
  { name: 'medgnosis-measure-calc', label: 'Measure refresh', role: 'quality' },
  { name: 'medgnosis-finder', label: 'Population finder', role: 'population' },
  { name: 'medgnosis-loops', label: 'Close the Loop', role: 'clinical' },
  { name: 'medgnosis-risk', label: 'Risk models', role: 'risk' },
  { name: 'medgnosis-autoorders', label: 'Auto Orders', role: 'orders' },
  { name: 'medgnosis-amp', label: 'AMP outreach', role: 'clinical' },
  { name: 'medgnosis-mtm', label: 'MTM referrals', role: 'clinical' },
  { name: 'medgnosis-surveillance', label: 'Surveillance streamer', role: 'surveillance', repeatable: true },
  { name: 'medgnosis-dq', label: 'Data quality', role: 'data_quality' },
  { name: 'medgnosis-cohort-flags', label: 'Cohort flags', role: 'data_quality' },
  { name: 'medgnosis-ai-insights', label: 'AI insights', role: 'analytics' },
  { name: 'medgnosis-ehr-bulk-import', label: 'EHR Bulk import', role: 'ehr_bulk' },
  { name: 'medgnosis-ehr-patient-context-refresh', label: 'EHR patient refresh', role: 'ehr_context' },
  { name: 'medgnosis-nightly', label: 'Nightly scheduler', role: 'scheduler', repeatable: true },
];

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_CANDIDATES = Array.from(new Set([
  process.cwd(),
  resolve(process.cwd(), '../..'),
  resolve(MODULE_DIR, '../../../..'),
]));

export async function getSystemHealth(): Promise<SystemHealth> {
  const startedAt = Date.now();
  const [database, redis, solr, auth, workers, ehrTenants, ehrBulk, ehrSyncAlerts, standards] = await Promise.all([
    getDatabaseHealth(),
    getRedisHealth(),
    getSolrHealth(),
    getAuthHealth(),
    getWorkerQueueHealth(),
    getEhrTenantReadiness(),
    getEhrBulkReadiness(),
    getEhrSyncAlertingStatus(),
    getStandardsReadiness(),
  ]);

  return {
    api: { status: 'ok', node_env: config.nodeEnv },
    database,
    redis,
    solr,
    auth,
    workers,
    ehr_tenants: ehrTenants,
    ehr_bulk: ehrBulk,
    ehr_sync_alerts: ehrSyncAlerts,
    standards,
    duration_ms: Date.now() - startedAt,
  };
}

export async function getWorkerQueueHealth(
  definitions: QueueDefinition[] = HEALTH_QUEUE_DEFINITIONS,
): Promise<WorkerQueueHealth> {
  const connection = redisConnectionOptions(config.redisUrl);
  const queues = await Promise.all(
    definitions.map((definition) => inspectQueue(definition, connection)),
  );

  return {
    status: aggregateQueueStatus(queues),
    total_workers: queues.reduce((sum, queue) => sum + queue.workers, 0),
    counts: queues.reduce(
      (sum, queue) => ({
        waiting: sum.waiting + queue.counts.waiting,
        active: sum.active + queue.counts.active,
        delayed: sum.delayed + queue.counts.delayed,
        failed: sum.failed + queue.counts.failed,
      }),
      emptyQueueCounts(),
    ),
    queues,
  };
}

export async function getEhrTenantReadiness(): Promise<EhrTenantReadiness> {
  try {
    const [row] = await sql<EhrTenantReadinessRow[]>`
      WITH required_bulk_resources(resource_type) AS (
        VALUES ('Patient'), ('Observation'), ('Condition'), ('Encounter')
      ),
      latest_capability AS (
        SELECT DISTINCT ON (ehr_tenant_id)
          ehr_tenant_id,
          smart_configuration,
          capability_statement,
          resource_support,
          captured_at,
          ((smart_configuration ->> 'ok') = 'true') AS smart_ok,
          ((capability_statement ->> 'ok') = 'true') AS capability_ok,
          NULLIF(smart_configuration #>> '{summary,issuer}', '') AS discovered_issuer,
          NULLIF(smart_configuration #>> '{summary,authorizationEndpoint}', '') AS authorization_endpoint,
          NULLIF(smart_configuration #>> '{summary,tokenEndpoint}', '') AS token_endpoint,
          (
            SELECT COUNT(*)::int
            FROM jsonb_object_keys(COALESCE(resource_support, '{}'::jsonb))
          ) AS resource_count
        FROM phm_edw.ehr_capability_snapshot
        ORDER BY ehr_tenant_id, captured_at DESC, id DESC
      ),
      capability_required AS (
        SELECT
          lc.ehr_tenant_id,
          COUNT(r.resource_type)::int AS required_count,
          COUNT(r.resource_type) FILTER (
            WHERE COALESCE(lc.resource_support, '{}'::jsonb) ? r.resource_type
          )::int AS supported_required_count
        FROM latest_capability lc
        CROSS JOIN required_bulk_resources r
        GROUP BY lc.ehr_tenant_id
      ),
      backend_services AS (
        SELECT
          ehr_tenant_id,
          COUNT(*) FILTER (
            WHERE client_type = 'backend_services'
              AND enabled = TRUE
          )::int AS enabled_clients,
          COUNT(*) FILTER (
            WHERE client_type = 'backend_services'
              AND enabled = TRUE
              AND length(trim(client_id)) > 0
              AND length(trim(scopes_requested)) > 0
              AND (
                (auth_method = 'private_key_jwt' AND private_key_ref IS NOT NULL)
                OR (auth_method IN ('client_secret_post', 'client_secret_basic') AND client_secret_ref IS NOT NULL)
                OR auth_method NOT IN ('private_key_jwt', 'client_secret_post', 'client_secret_basic')
              )
          )::int AS ready_clients,
          COUNT(*) FILTER (
            WHERE client_type = 'backend_services'
              AND enabled = TRUE
              AND NOT (
                (auth_method = 'private_key_jwt' AND private_key_ref IS NOT NULL)
                OR (auth_method IN ('client_secret_post', 'client_secret_basic') AND client_secret_ref IS NOT NULL)
                OR auth_method NOT IN ('private_key_jwt', 'client_secret_post', 'client_secret_basic')
              )
          )::int AS credentials_incomplete,
          COUNT(*) FILTER (
            WHERE client_type = 'backend_services'
              AND enabled = TRUE
              AND length(trim(scopes_requested)) = 0
          )::int AS scopes_missing
        FROM phm_edw.ehr_client_registration
        GROUP BY ehr_tenant_id
      ),
      latest_backend_token AS (
        SELECT DISTINCT ON (ehr_tenant_id)
          ehr_tenant_id,
          issued_at,
          expires_at
        FROM phm_edw.smart_token_metadata
        WHERE smart_launch_session_id IS NULL
          AND scope LIKE '%system/%'
        ORDER BY ehr_tenant_id, issued_at DESC NULLS LAST, id DESC
      ),
      backend_token_counts AS (
        SELECT
          ehr_tenant_id,
          COUNT(*) FILTER (
            WHERE smart_launch_session_id IS NULL
              AND scope LIKE '%system/%'
              AND issued_at >= NOW() - INTERVAL '24 hours'
          )::int AS token_requests_24h
        FROM phm_edw.smart_token_metadata
        GROUP BY ehr_tenant_id
      ),
      launch_sessions AS (
        SELECT
          ehr_tenant_id,
          COUNT(*) FILTER (
            WHERE status = 'pending'
              AND expires_at <= NOW()
          )::int AS expired_pending_launches
        FROM phm_edw.smart_launch_session
        GROUP BY ehr_tenant_id
      ),
      launch_audit AS (
        SELECT
          COALESCE(NULLIF(details->>'ehrTenantId', ''), NULLIF(resource_id, '')) AS ehr_tenant_id_text,
          MAX(created_at) FILTER (
            WHERE action IN ('ehr_smart_callback_success', 'ehr_smart_handoff_complete')
          )::text AS latest_success_at,
          COUNT(*) FILTER (
            WHERE action = 'ehr_smart_launch_start'
              AND created_at >= NOW() - INTERVAL '24 hours'
          )::int AS launches_started_24h,
          COUNT(*) FILTER (
            WHERE action = 'ehr_smart_launch_denied'
              AND created_at >= NOW() - INTERVAL '24 hours'
          )::int AS launches_denied_24h,
          COUNT(*) FILTER (
            WHERE action = 'ehr_smart_callback_success'
              AND created_at >= NOW() - INTERVAL '24 hours'
          )::int AS callbacks_succeeded_24h,
          COUNT(*) FILTER (
            WHERE action = 'ehr_smart_callback_failed'
              AND created_at >= NOW() - INTERVAL '24 hours'
          )::int AS callbacks_failed_24h,
          COUNT(*) FILTER (
            WHERE action = 'ehr_smart_handoff_complete'
              AND created_at >= NOW() - INTERVAL '24 hours'
          )::int AS handoffs_completed_24h
        FROM audit_log
        WHERE action IN (
          'ehr_smart_launch_start',
          'ehr_smart_launch_denied',
          'ehr_smart_callback_success',
          'ehr_smart_callback_failed',
          'ehr_smart_handoff_complete'
        )
        GROUP BY 1
      ),
      fhir_failure_events AS (
        SELECT
          COALESCE(NULLIF(a.details->>'ehrTenantId', ''), NULLIF(a.resource_id, '')) AS ehr_tenant_id_text,
          a.action,
          a.created_at,
          NULLIF(a.details->>'resourceType', '') AS resource_type,
          NULLIF(a.details->>'classification', '') AS classification,
          CASE
            WHEN (a.details->>'status') ~ '^[0-9]+$'
              THEN (a.details->>'status')::int
            ELSE NULL
          END AS status
        FROM audit_log a
        JOIN phm_edw.ehr_tenant t
          ON t.id::text = COALESCE(NULLIF(a.details->>'ehrTenantId', ''), NULLIF(a.resource_id, ''))
        WHERE a.resource_type = 'ehr_tenant'
          AND a.action IN ('ehr_fhir_request_failed', 'ehr_backend_token_failed')
          AND a.created_at >= NOW() - INTERVAL '24 hours'
          AND t.status IN ('active', 'testing')
      ),
      fhir_failure_by_tenant AS (
        SELECT
          ehr_tenant_id_text,
          COUNT(*) FILTER (WHERE action = 'ehr_fhir_request_failed')::int AS failed_requests_24h,
          COUNT(*) FILTER (
            WHERE action = 'ehr_fhir_request_failed'
              AND status IN (401, 403)
          )::int AS auth_failures_24h,
          COUNT(*) FILTER (
            WHERE action = 'ehr_fhir_request_failed'
              AND status = 429
          )::int AS rate_limit_failures_24h,
          COUNT(*) FILTER (
            WHERE action = 'ehr_fhir_request_failed'
              AND status IS NULL
              AND classification IN ('network', 'timeout')
          )::int AS network_failures_24h,
          COUNT(*) FILTER (WHERE action = 'ehr_backend_token_failed')::int AS backend_token_failures_24h,
          COUNT(*) FILTER (
            WHERE action = 'ehr_backend_token_failed'
              AND status IN (401, 403)
          )::int AS backend_token_auth_failures_24h,
          MAX(created_at)::text AS latest_failure_at
        FROM fhir_failure_events
        GROUP BY ehr_tenant_id_text
      ),
      tenant_flags AS (
        SELECT
          t.id,
          t.status,
          t.environment,
          (t.status IN ('active', 'testing')) AS active_tenant,
          (lc.ehr_tenant_id IS NOT NULL) AS has_snapshot,
          COALESCE(lc.smart_ok, FALSE) AS smart_ok,
          COALESCE(lc.capability_ok, FALSE) AS capability_ok,
          COALESCE(lc.resource_count, 0) AS resource_count,
          lc.captured_at,
          (
            lc.discovered_issuer IS NOT NULL
            AND lower(regexp_replace(lc.discovered_issuer, '/+$', '')) NOT IN (
              lower(regexp_replace(COALESCE(t.issuer, ''), '/+$', '')),
              lower(regexp_replace(COALESCE(t.audience, ''), '/+$', '')),
              lower(regexp_replace(COALESCE(t.fhir_base_url, ''), '/+$', ''))
            )
          ) AS issuer_mismatch,
          (lc.ehr_tenant_id IS NOT NULL AND lc.authorization_endpoint IS NULL) AS missing_authorization_endpoint,
          (lc.ehr_tenant_id IS NOT NULL AND lc.token_endpoint IS NULL) AS missing_token_endpoint,
          COALESCE(bs.enabled_clients, 0) AS enabled_backend_clients,
          COALESCE(bs.ready_clients, 0) AS ready_backend_clients,
          COALESCE(bs.credentials_incomplete, 0) AS backend_credentials_incomplete,
          COALESCE(bs.scopes_missing, 0) AS backend_scopes_missing,
          COALESCE(btc.token_requests_24h, 0) AS backend_token_requests_24h,
          lbt.issued_at AS latest_backend_token_issued_at,
          (lbt.expires_at IS NOT NULL AND lbt.expires_at <= NOW()) AS latest_backend_token_expired,
          COALESCE(la.launches_started_24h, 0) AS launches_started_24h,
          COALESCE(la.launches_denied_24h, 0) AS launches_denied_24h,
          COALESCE(la.callbacks_succeeded_24h, 0) AS callbacks_succeeded_24h,
          COALESCE(la.callbacks_failed_24h, 0) AS callbacks_failed_24h,
          COALESCE(la.handoffs_completed_24h, 0) AS handoffs_completed_24h,
          COALESCE(ls.expired_pending_launches, 0) AS expired_pending_launches,
          la.latest_success_at,
          COALESCE(ff.failed_requests_24h, 0) AS fhir_failed_requests_24h,
          COALESCE(ff.auth_failures_24h, 0) AS fhir_auth_failures_24h,
          COALESCE(ff.rate_limit_failures_24h, 0) AS fhir_rate_limit_failures_24h,
          COALESCE(ff.network_failures_24h, 0) AS fhir_network_failures_24h,
          COALESCE(ff.backend_token_failures_24h, 0) AS backend_token_failures_24h,
          COALESCE(ff.backend_token_auth_failures_24h, 0) AS backend_token_auth_failures_24h,
          ff.latest_failure_at AS latest_fhir_failure_at,
          COALESCE(cr.required_count, 0) AS required_count,
          COALESCE(cr.supported_required_count, 0) AS supported_required_count
        FROM phm_edw.ehr_tenant t
        LEFT JOIN latest_capability lc ON lc.ehr_tenant_id = t.id
        LEFT JOIN capability_required cr ON cr.ehr_tenant_id = t.id
        LEFT JOIN backend_services bs ON bs.ehr_tenant_id = t.id
        LEFT JOIN latest_backend_token lbt ON lbt.ehr_tenant_id = t.id
        LEFT JOIN backend_token_counts btc ON btc.ehr_tenant_id = t.id
        LEFT JOIN launch_sessions ls ON ls.ehr_tenant_id = t.id
        LEFT JOIN launch_audit la ON la.ehr_tenant_id_text = t.id::text
        LEFT JOIN fhir_failure_by_tenant ff ON ff.ehr_tenant_id_text = t.id::text
      ),
      classified AS (
        SELECT
          *,
          (
            active_tenant
            AND (
              issuer_mismatch
              OR missing_authorization_endpoint
              OR missing_token_endpoint
              OR backend_credentials_incomplete > 0
              OR backend_scopes_missing > 0
            )
          ) AS blocked,
          (
            active_tenant
            AND NOT (
              issuer_mismatch
              OR missing_authorization_endpoint
              OR missing_token_endpoint
              OR backend_credentials_incomplete > 0
              OR backend_scopes_missing > 0
            )
            AND (
              NOT has_snapshot
              OR NOT smart_ok
              OR NOT capability_ok
              OR resource_count = 0
              OR supported_required_count < required_count
              OR enabled_backend_clients = 0
              OR latest_backend_token_expired
              OR launches_denied_24h > 0
              OR callbacks_failed_24h > 0
              OR expired_pending_launches > 0
              OR fhir_failed_requests_24h > 0
              OR backend_token_failures_24h > 0
            )
          ) AS degraded
        FROM tenant_flags
      )
      SELECT
        COUNT(*)::int AS total_tenants,
        COUNT(*) FILTER (WHERE active_tenant)::int AS active_tenants,
        COUNT(*) FILTER (WHERE NOT active_tenant)::int AS disabled_tenants,
        COUNT(*) FILTER (WHERE active_tenant AND NOT blocked AND NOT degraded)::int AS healthy_tenants,
        COUNT(*) FILTER (WHERE degraded)::int AS degraded_tenants,
        COUNT(*) FILTER (WHERE blocked)::int AS blocked_tenants,
        COUNT(*) FILTER (WHERE environment = 'production')::int AS production_tenants,
        COUNT(*) FILTER (WHERE environment = 'sandbox')::int AS sandbox_tenants,
        COUNT(*) FILTER (WHERE environment = 'staging')::int AS staging_tenants,
        COUNT(*) FILTER (WHERE active_tenant AND has_snapshot)::int AS tenants_with_snapshots,
        COUNT(*) FILTER (WHERE active_tenant AND smart_ok)::int AS tenants_smart_ok,
        COUNT(*) FILTER (WHERE active_tenant AND capability_ok)::int AS tenants_capability_ok,
        COUNT(*) FILTER (WHERE active_tenant AND resource_count > 0)::int AS tenants_with_resource_support,
        COUNT(*) FILTER (WHERE active_tenant AND issuer_mismatch)::int AS issuer_mismatches,
        COUNT(*) FILTER (WHERE active_tenant AND missing_authorization_endpoint)::int AS missing_authorization_endpoint,
        COUNT(*) FILTER (WHERE active_tenant AND missing_token_endpoint)::int AS missing_token_endpoint,
        MAX(captured_at)::text AS latest_snapshot_at,
        COUNT(*) FILTER (WHERE active_tenant AND enabled_backend_clients > 0)::int AS tenants_with_enabled_backend_clients,
        SUM(enabled_backend_clients)::int AS enabled_backend_clients,
        COUNT(*) FILTER (WHERE active_tenant AND ready_backend_clients > 0)::int AS tenants_ready_for_token_exchange,
        SUM(backend_credentials_incomplete)::int AS backend_credentials_incomplete,
        SUM(backend_scopes_missing)::int AS backend_scopes_missing,
        SUM(backend_token_requests_24h)::int AS backend_token_requests_24h,
        MAX(latest_backend_token_issued_at)::text AS latest_backend_token_issued_at,
        COUNT(*) FILTER (WHERE active_tenant AND latest_backend_token_expired)::int AS latest_backend_token_expired,
        SUM(launches_started_24h)::int AS launches_started_24h,
        SUM(launches_denied_24h)::int AS launches_denied_24h,
        SUM(callbacks_succeeded_24h)::int AS callbacks_succeeded_24h,
        SUM(callbacks_failed_24h)::int AS callbacks_failed_24h,
        SUM(handoffs_completed_24h)::int AS handoffs_completed_24h,
        SUM(expired_pending_launches)::int AS expired_pending_launches,
        MAX(latest_success_at)::text AS latest_launch_success_at,
        SUM(fhir_failed_requests_24h)::int AS fhir_failed_requests_24h,
        SUM(fhir_auth_failures_24h)::int AS fhir_auth_failures_24h,
        SUM(fhir_rate_limit_failures_24h)::int AS fhir_rate_limit_failures_24h,
        SUM(fhir_network_failures_24h)::int AS fhir_network_failures_24h,
        SUM(backend_token_failures_24h)::int AS backend_token_failures_24h,
        SUM(backend_token_auth_failures_24h)::int AS backend_token_auth_failures_24h,
        MAX(latest_fhir_failure_at)::text AS latest_fhir_failure_at,
        (
          SELECT array_agg(resource_type ORDER BY resource_type)
          FROM (
            SELECT DISTINCT resource_type
            FROM fhir_failure_events
            WHERE resource_type IS NOT NULL
          ) fhir_resource_types
        ) AS affected_fhir_resource_types,
        (SELECT array_agg(resource_type ORDER BY resource_type) FROM required_bulk_resources) AS required_bulk_resource_types,
        COUNT(*) FILTER (
          WHERE active_tenant
            AND required_count > 0
            AND supported_required_count = required_count
        )::int AS tenants_with_required_bulk_coverage,
        COUNT(*) FILTER (
          WHERE active_tenant
            AND required_count > 0
            AND supported_required_count < required_count
        )::int AS tenants_missing_required_bulk_coverage,
        ROUND(AVG(
          CASE
            WHEN active_tenant AND required_count > 0
              THEN supported_required_count::numeric / required_count::numeric
            ELSE NULL
          END
        ), 4)::text AS average_required_bulk_coverage
      FROM classified
    `;

    return mapEhrTenantReadiness(row);
  } catch (err) {
    return emptyEhrTenantReadiness('error', errorMessage(err));
  }
}

export async function getEhrBulkReadiness(): Promise<EhrBulkReadiness> {
  const queueEnabled = envBool('EHR_BULK_IMPORT_QUEUE_ENABLED', true);

  try {
    const [row] = await sql<EhrBulkReadinessRow[]>`
      WITH latest_capability AS (
        SELECT DISTINCT ON (ehr_tenant_id)
          ehr_tenant_id,
          captured_at
        FROM phm_edw.ehr_capability_snapshot
        ORDER BY ehr_tenant_id, captured_at DESC
      ),
      backend_services AS (
        SELECT DISTINCT ehr_tenant_id
        FROM phm_edw.ehr_client_registration
        WHERE client_type = 'backend_services'
          AND enabled = TRUE
          AND length(trim(client_id)) > 0
          AND (
            private_key_ref IS NOT NULL
            OR client_secret_ref IS NOT NULL
            OR jwks_url IS NOT NULL
          )
      ),
      tenant_readiness AS (
        SELECT
          COUNT(*)::int AS total_tenants,
          COUNT(*) FILTER (WHERE t.status IN ('active', 'testing'))::int AS active_tenants,
          COUNT(*) FILTER (WHERE bs.ehr_tenant_id IS NOT NULL)::int AS backend_services_enabled,
          COUNT(*) FILTER (WHERE lc.ehr_tenant_id IS NOT NULL)::int AS capability_snapshots,
          COUNT(*) FILTER (
            WHERE t.status IN ('active', 'testing')
              AND bs.ehr_tenant_id IS NOT NULL
              AND lc.ehr_tenant_id IS NOT NULL
          )::int AS ready_for_bulk
        FROM phm_edw.ehr_tenant t
        LEFT JOIN backend_services bs ON bs.ehr_tenant_id = t.id
        LEFT JOIN latest_capability lc ON lc.ehr_tenant_id = t.id
      )
      SELECT
        tenant_readiness.*,
        (
          SELECT COUNT(*)::int
          FROM phm_edw.ehr_bulk_schedule
          WHERE enabled = TRUE
        ) AS schedules_enabled,
        (
          SELECT COUNT(*)::int
          FROM phm_edw.ehr_bulk_schedule
          WHERE enabled = TRUE
            AND next_run_at <= NOW()
        ) AS schedules_due,
        (
          SELECT COUNT(*)::int
          FROM phm_edw.ehr_bulk_schedule
          WHERE enabled = TRUE
            AND last_failure_at >= NOW() - INTERVAL '24 hours'
        ) AS schedule_failures_24h,
        (
          SELECT MIN(next_run_at)::text
          FROM phm_edw.ehr_bulk_schedule
          WHERE enabled = TRUE
        ) AS next_run_at,
        (
          SELECT COUNT(*)::int
          FROM phm_edw.ehr_bulk_job
          WHERE status IN ('accepted', 'in_progress')
        ) AS active_bulk_jobs,
        (
          SELECT COUNT(*)::int
          FROM phm_edw.ehr_bulk_job
          WHERE status = 'failed'
            AND updated_at >= NOW() - INTERVAL '24 hours'
        ) AS bulk_failures_24h,
        (
          SELECT COUNT(*)::int
          FROM phm_edw.ehr_bulk_job
          WHERE status = 'completed'
            AND completed_at >= NOW() - INTERVAL '24 hours'
        ) AS bulk_completed_24h,
        (
          SELECT MAX(completed_at)::text
          FROM phm_edw.ehr_bulk_job
          WHERE status = 'completed'
        ) AS latest_completed_at
      FROM tenant_readiness
    `;

    const readiness = mapEhrBulkReadiness(row, queueEnabled);
    return {
      ...readiness,
      status: readiness.tenants.total === 0
        ? 'disabled'
        : readiness.issues.length > 0
          ? 'degraded'
          : 'ok',
    };
  } catch (err) {
    return emptyEhrBulkReadiness('error', queueEnabled, errorMessage(err));
  }
}

async function getDatabaseHealth(): Promise<SystemHealth['database']> {
  return sql`SELECT NOW() AS now`.then(
    () => ({ status: 'ok' as const }),
    (err: unknown) => ({ status: 'error' as const, error: errorMessage(err) }),
  );
}

export async function getRedisHealth(): Promise<SystemHealth['redis']> {
  const endpoint = redisEndpoint(config.redisUrl);
  const redis = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.connect();
    await redis.ping();
    const [patterns, channels] = await Promise.all([
      redis.call('PUBSUB', 'NUMPAT'),
      redis.call('PUBSUB', 'CHANNELS', 'medgnosis:alerts:*'),
    ]);

    return {
      status: 'ok',
      endpoint,
      pubsub: {
        alert_pattern: 'medgnosis:alerts:*',
        patterns: toNumber(patterns as number | string | null),
        alert_channels: Array.isArray(channels) ? channels.length : 0,
      },
    };
  } catch (err) {
    return { status: 'error', endpoint, error: errorMessage(err) };
  } finally {
    redis.disconnect();
  }
}

export async function getSolrHealth(): Promise<SystemHealth['solr']> {
  const solr = getSolrClient();
  if (solr) {
    const cores = await Promise.all([
      inspectSolrCore('search', solr.searchCore, solr),
      inspectSolrCore('clinical', solr.clinicalCore, solr),
    ]);
    return {
      status: cores.every((core) => core.healthy) && isSolrAvailable() ? 'ok' : 'degraded',
      enabled: config.solrEnabled,
      url: config.solrUrl,
      cores,
    };
  }

  return {
    status: config.solrEnabled ? 'error' : 'disabled',
    enabled: config.solrEnabled,
    url: config.solrUrl,
    cores: [
      { role: 'search', name: config.solrSearchCore, healthy: false, status: null },
      { role: 'clinical', name: config.solrClinicalCore, healthy: false, status: null },
    ],
  };
}

export async function getAuthHealth(): Promise<SystemHealth['auth']> {
  try {
    const oidcProvider = await getOidcProviderConfig();
    const providers = await listAuthProviderHealth({
      localEnabled: config.localAuthEnabled,
      oidcEnabled: oidcProvider.enabled,
    });
    return {
      status: aggregateAuthStatus(providers, config.localAuthEnabled, oidcProvider.enabled),
      local_enabled: config.localAuthEnabled,
      oidc_enabled: oidcProvider.enabled,
      providers,
    };
  } catch (err) {
    return {
      status: 'error',
      local_enabled: config.localAuthEnabled,
      oidc_enabled: false,
      providers: [],
      error: errorMessage(err),
    };
  }
}

export async function getStandardsReadiness(): Promise<StandardsReadiness> {
  const validatorPath = process.env['VALIDATOR_JAR']?.trim() || 'validator_cli.jar';
  const checks = await Promise.all([
    buildStandardsCheck({
      key: 'cql',
      label: 'CQL Engine',
      runtimeConfigured: Boolean(process.env['CQL_ENGINE_URL']?.trim()),
      missingStatus: 'degraded',
      unconfiguredStatus: 'disabled',
      detailWhenReady: process.env['CQL_ENGINE_URL']?.trim()
        ? `Runtime URL ${process.env['CQL_ENGINE_URL']!.trim()} configured`
        : 'Smoke assets present; optional sidecar runtime URL is not configured',
      commands: [
        'bash scripts/cql-engine-smoke.sh',
        'bash scripts/cql-realmeasure-smoke.sh',
        'bash scripts/cql-qdm-smoke.sh',
      ],
      artifacts: [
        'scripts/cql-engine-smoke.sh',
        'scripts/cql-realmeasure-smoke.sh',
        'scripts/cql-qdm-smoke.sh',
        'docker/cql-engine/spike-bundle.json',
      ],
    }),
    buildStandardsCheck({
      key: 'fhir',
      label: 'FHIR US Core / QI-Core',
      runtimeConfigured: true,
      missingStatus: 'degraded',
      detailWhenReady: 'FHIR validator and golden fixtures are available',
      commands: ['VALIDATOR_JAR=validator_cli.jar ./scripts/fhir-validate.sh'],
      artifacts: [
        'scripts/fhir-validate.sh',
        'apps/api/test-fixtures/fhir/patient.json',
        'apps/api/test-fixtures/fhir/condition.json',
        'apps/api/test-fixtures/fhir/observation.json',
        validatorPath,
      ],
    }),
    buildStandardsCheck({
      key: 'deqm',
      label: 'Da Vinci DEQM',
      runtimeConfigured: true,
      missingStatus: 'degraded',
      detailWhenReady: 'DEQM validator and Gaps-in-Care fixture are available',
      commands: ['VALIDATOR_JAR=validator_cli.jar ./scripts/deqm-validate.sh'],
      artifacts: [
        'scripts/deqm-validate.sh',
        'apps/api/test-fixtures/fhir/deqm/gaps-in-care-sample.json',
        validatorPath,
      ],
    }),
  ]);

  const issues = checks.flatMap((check) => check.artifacts.missing.map(
    (artifact) => `${check.label} missing ${artifact}`,
  ));

  return {
    status: aggregateStandardsStatus(checks),
    checks,
    issues,
  };
}

function aggregateAuthStatus(
  providers: AuthProviderHealth[],
  localEnabled: boolean,
  oidcEnabled: boolean,
): HealthStatus {
  if (!localEnabled && !oidcEnabled) return 'error';
  if (providers.some((provider) => provider.status === 'error')) return 'error';
  if (providers.some((provider) => provider.status === 'degraded')) return 'degraded';
  return 'ok';
}

async function buildStandardsCheck(input: {
  key: StandardsReadinessCheck['key'];
  label: string;
  runtimeConfigured: boolean;
  missingStatus: HealthStatus;
  unconfiguredStatus?: HealthStatus;
  detailWhenReady: string;
  commands: string[];
  artifacts: string[];
}): Promise<StandardsReadinessCheck> {
  const presence = await Promise.all(input.artifacts.map(async (artifact) => ({
    artifact,
    present: await repoArtifactExists(artifact),
  })));
  const missing = presence
    .filter((artifact) => !artifact.present)
    .map((artifact) => artifact.artifact);
  const status = missing.length > 0
    ? input.missingStatus
    : !input.runtimeConfigured && input.unconfiguredStatus
      ? input.unconfiguredStatus
      : 'ok';

  return {
    key: input.key,
    label: input.label,
    status,
    runtime_configured: input.runtimeConfigured,
    detail: missing.length > 0
      ? `${missing.length} required artifact${missing.length === 1 ? '' : 's'} missing`
      : input.detailWhenReady,
    commands: input.commands,
    artifacts: {
      present: presence.length - missing.length,
      total: presence.length,
      missing,
    },
  };
}

function aggregateStandardsStatus(checks: StandardsReadinessCheck[]): HealthStatus {
  if (checks.some((check) => check.status === 'error')) return 'error';
  if (checks.some((check) => check.status === 'degraded')) return 'degraded';
  if (checks.every((check) => check.status === 'disabled')) return 'disabled';
  return 'ok';
}

async function repoArtifactExists(path: string): Promise<boolean> {
  if (isAbsolute(path)) {
    return access(path, constants.R_OK).then(() => true, () => false);
  }

  for (const root of REPO_ROOT_CANDIDATES) {
    const candidate = resolve(root, path);
    const exists = await access(candidate, constants.R_OK).then(() => true, () => false);
    if (exists) return true;
  }
  return false;
}

async function inspectSolrCore(
  role: SolrCoreHealth['role'],
  coreName: string,
  solr: { ping(core: string): Promise<boolean>; coreStatus(core: string): Promise<Record<string, unknown>> },
): Promise<SolrCoreHealth> {
  const [healthy, status] = await Promise.all([
    solr.ping(coreName).catch(() => false),
    solr.coreStatus(coreName).catch(() => null),
  ]);
  return { role, name: coreName, healthy, status };
}

async function inspectQueue(
  definition: QueueDefinition,
  connection: RedisConnectionOptions,
): Promise<WorkerQueueStatus> {
  const queue = new Queue(definition.name, { connection });

  try {
    const [rawCounts, workers, paused, repeatableJobInfos, completedJobs] = await Promise.all([
      queue.getJobCounts(...QUEUE_JOB_TYPES),
      queue.getWorkersCount(),
      queue.isPaused(),
      definition.repeatable ? queue.getRepeatableJobs() : Promise.resolve(undefined),
      queue.getJobs(['completed'], 0, 0, false).catch(() => []),
    ]);
    const counts = normalizeQueueCounts(rawCounts);
    const repeatableJobs = repeatableJobInfos?.length;
    const nextRunAt = repeatableJobInfos
      ? earliestTimestamp(repeatableJobInfos.map((job) => (job as RepeatableJobInfo).next))
      : undefined;
    const latestCompletedAt = latestTimestamp(
      completedJobs.map((job) => (job as CompletedJobInfo).finishedOn),
    );
    return {
      ...definition,
      status: queueStatus({ counts, workers, paused, repeatableJobs, repeatable: definition.repeatable }),
      workers,
      paused,
      counts,
      ...(repeatableJobs === undefined ? {} : { repeatable_jobs: repeatableJobs }),
      ...(nextRunAt === undefined ? {} : { next_run_at: nextRunAt }),
      latest_completed_at: latestCompletedAt,
    };
  } catch (err) {
    return {
      ...definition,
      status: 'error',
      workers: 0,
      paused: false,
      counts: emptyQueueCounts(),
      error: errorMessage(err),
    };
  } finally {
    await queue.close().catch(() => undefined);
  }
}

function queueStatus(input: {
  counts: QueueCounts;
  workers: number;
  paused: boolean;
  repeatableJobs?: number;
  repeatable?: boolean;
}): HealthStatus {
  if (input.paused) return 'degraded';
  if (input.workers === 0) return 'degraded';
  if (input.counts.failed > 0) return 'degraded';
  if (input.repeatable && (input.repeatableJobs ?? 0) === 0) return 'degraded';
  return 'ok';
}

function aggregateQueueStatus(queues: WorkerQueueStatus[]): HealthStatus {
  if (queues.some((queue) => queue.status === 'error')) return 'error';
  if (queues.some((queue) => queue.status === 'degraded')) return 'degraded';
  return 'ok';
}

function mapEhrTenantReadiness(row: EhrTenantReadinessRow | undefined): EhrTenantReadiness {
  const readiness: EhrTenantReadiness = {
    status: 'ok',
    tenants: {
      total: toNumber(row?.total_tenants),
      active: toNumber(row?.active_tenants),
      disabled: toNumber(row?.disabled_tenants),
      healthy: toNumber(row?.healthy_tenants),
      degraded: toNumber(row?.degraded_tenants),
      blocked: toNumber(row?.blocked_tenants),
      production: toNumber(row?.production_tenants),
      sandbox: toNumber(row?.sandbox_tenants),
      staging: toNumber(row?.staging_tenants),
    },
    discovery: {
      with_snapshots: toNumber(row?.tenants_with_snapshots),
      smart_ok: toNumber(row?.tenants_smart_ok),
      capability_ok: toNumber(row?.tenants_capability_ok),
      with_resource_support: toNumber(row?.tenants_with_resource_support),
      issuer_mismatches: toNumber(row?.issuer_mismatches),
      missing_authorization_endpoint: toNumber(row?.missing_authorization_endpoint),
      missing_token_endpoint: toNumber(row?.missing_token_endpoint),
      latest_snapshot_at: row?.latest_snapshot_at ?? null,
    },
    backend_services: {
      tenants_with_enabled_clients: toNumber(row?.tenants_with_enabled_backend_clients),
      enabled_clients: toNumber(row?.enabled_backend_clients),
      ready_for_token_exchange: toNumber(row?.tenants_ready_for_token_exchange),
      credentials_incomplete: toNumber(row?.backend_credentials_incomplete),
      scopes_missing: toNumber(row?.backend_scopes_missing),
      token_requests_24h: toNumber(row?.backend_token_requests_24h),
      latest_token_issued_at: row?.latest_backend_token_issued_at ?? null,
      latest_token_expired: toNumber(row?.latest_backend_token_expired),
    },
    smart_launch: {
      launches_started_24h: toNumber(row?.launches_started_24h),
      launches_denied_24h: toNumber(row?.launches_denied_24h),
      callbacks_succeeded_24h: toNumber(row?.callbacks_succeeded_24h),
      callbacks_failed_24h: toNumber(row?.callbacks_failed_24h),
      handoffs_completed_24h: toNumber(row?.handoffs_completed_24h),
      expired_pending_launches: toNumber(row?.expired_pending_launches),
      latest_success_at: row?.latest_launch_success_at ?? null,
    },
    fhir_api: {
      failed_requests_24h: toNumber(row?.fhir_failed_requests_24h),
      auth_failures_24h: toNumber(row?.fhir_auth_failures_24h),
      rate_limit_failures_24h: toNumber(row?.fhir_rate_limit_failures_24h),
      network_failures_24h: toNumber(row?.fhir_network_failures_24h),
      backend_token_failures_24h: toNumber(row?.backend_token_failures_24h),
      backend_token_auth_failures_24h: toNumber(row?.backend_token_auth_failures_24h),
      latest_failure_at: row?.latest_fhir_failure_at ?? null,
      affected_resource_types: row?.affected_fhir_resource_types ?? [],
    },
    resource_coverage: {
      required_resource_types: row?.required_bulk_resource_types ?? [],
      tenants_with_required_bulk_coverage: toNumber(row?.tenants_with_required_bulk_coverage),
      tenants_missing_required_bulk_coverage: toNumber(row?.tenants_missing_required_bulk_coverage),
      average_required_bulk_coverage: toNullableNumber(row?.average_required_bulk_coverage),
    },
    issues: [],
  };

  if (readiness.tenants.total === 0 || readiness.tenants.active === 0) {
    readiness.status = 'disabled';
    if (readiness.tenants.total === 0) {
      readiness.issues.push('No EHR tenants are registered');
    } else {
      readiness.issues.push('No EHR tenants are active or testing');
    }
    return readiness;
  }

  addCountIssue(readiness.issues, readiness.discovery.issuer_mismatches, 'active EHR tenant(s) have SMART issuer drift');
  addCountIssue(readiness.issues, readiness.discovery.missing_authorization_endpoint, 'active EHR tenant(s) are missing SMART authorization endpoints');
  addCountIssue(readiness.issues, readiness.discovery.missing_token_endpoint, 'active EHR tenant(s) are missing SMART token endpoints');
  addCountIssue(readiness.issues, readiness.backend_services.credentials_incomplete, 'enabled Backend Services client(s) have incomplete credentials');
  addCountIssue(readiness.issues, readiness.backend_services.scopes_missing, 'enabled Backend Services client(s) have no requested system scopes');
  addCountIssue(readiness.issues, readiness.tenants.active - readiness.discovery.with_snapshots, 'active EHR tenant(s) have no stored SMART/FHIR discovery snapshot');
  addCountIssue(readiness.issues, readiness.tenants.active - readiness.discovery.smart_ok, 'active EHR tenant(s) lack successful SMART configuration evidence');
  addCountIssue(readiness.issues, readiness.tenants.active - readiness.discovery.capability_ok, 'active EHR tenant(s) lack successful CapabilityStatement evidence');
  addCountIssue(readiness.issues, readiness.resource_coverage.tenants_missing_required_bulk_coverage, 'active EHR tenant(s) are missing required Bulk resource coverage');
  addCountIssue(readiness.issues, readiness.tenants.active - readiness.backend_services.tenants_with_enabled_clients, 'active EHR tenant(s) have no enabled Backend Services client');
  addCountIssue(readiness.issues, readiness.backend_services.latest_token_expired, 'active EHR tenant(s) have expired latest Backend Services token evidence');
  addCountIssue(readiness.issues, readiness.smart_launch.launches_denied_24h, 'SMART launch denial(s) were recorded in the last 24 hours');
  addCountIssue(readiness.issues, readiness.smart_launch.callbacks_failed_24h, 'SMART callback failure(s) were recorded in the last 24 hours');
  addCountIssue(readiness.issues, readiness.smart_launch.expired_pending_launches, 'pending SMART launch session(s) expired without callback completion');
  addCountIssue(readiness.issues, readiness.fhir_api.auth_failures_24h, 'FHIR API authorization/authentication failure(s) were recorded in the last 24 hours');
  addCountIssue(readiness.issues, readiness.fhir_api.rate_limit_failures_24h, 'FHIR API rate-limit failure(s) were recorded in the last 24 hours');
  addCountIssue(readiness.issues, readiness.fhir_api.network_failures_24h, 'FHIR API network/timeout failure(s) were recorded in the last 24 hours');
  addCountIssue(readiness.issues, readiness.fhir_api.backend_token_failures_24h, 'Backend Services token request failure(s) were recorded in the last 24 hours');

  readiness.status = readiness.tenants.blocked > 0
    ? 'blocked'
    : readiness.tenants.degraded > 0
      ? 'degraded'
      : 'ok';

  return readiness;
}

function emptyEhrTenantReadiness(status: HealthStatus, error?: string): EhrTenantReadiness {
  return {
    status,
    tenants: {
      total: 0,
      active: 0,
      disabled: 0,
      healthy: 0,
      degraded: 0,
      blocked: 0,
      production: 0,
      sandbox: 0,
      staging: 0,
    },
    discovery: {
      with_snapshots: 0,
      smart_ok: 0,
      capability_ok: 0,
      with_resource_support: 0,
      issuer_mismatches: 0,
      missing_authorization_endpoint: 0,
      missing_token_endpoint: 0,
      latest_snapshot_at: null,
    },
    backend_services: {
      tenants_with_enabled_clients: 0,
      enabled_clients: 0,
      ready_for_token_exchange: 0,
      credentials_incomplete: 0,
      scopes_missing: 0,
      token_requests_24h: 0,
      latest_token_issued_at: null,
      latest_token_expired: 0,
    },
    smart_launch: {
      launches_started_24h: 0,
      launches_denied_24h: 0,
      callbacks_succeeded_24h: 0,
      callbacks_failed_24h: 0,
      handoffs_completed_24h: 0,
      expired_pending_launches: 0,
      latest_success_at: null,
    },
    fhir_api: {
      failed_requests_24h: 0,
      auth_failures_24h: 0,
      rate_limit_failures_24h: 0,
      network_failures_24h: 0,
      backend_token_failures_24h: 0,
      backend_token_auth_failures_24h: 0,
      latest_failure_at: null,
      affected_resource_types: [],
    },
    resource_coverage: {
      required_resource_types: [],
      tenants_with_required_bulk_coverage: 0,
      tenants_missing_required_bulk_coverage: 0,
      average_required_bulk_coverage: null,
    },
    issues: error ? [error] : [],
    ...(error ? { error } : {}),
  };
}

function addCountIssue(issues: string[], count: number, message: string): void {
  if (count > 0) {
    issues.push(`${count} ${message}`);
  }
}

function mapEhrBulkReadiness(
  row: EhrBulkReadinessRow | undefined,
  queueEnabled: boolean,
): EhrBulkReadiness {
  const readiness: EhrBulkReadiness = {
    queue_enabled: queueEnabled,
    status: 'ok',
    tenants: {
      total: toNumber(row?.total_tenants),
      active: toNumber(row?.active_tenants),
      with_backend_services: toNumber(row?.backend_services_enabled),
      with_capability_snapshots: toNumber(row?.capability_snapshots),
      ready_for_bulk: toNumber(row?.ready_for_bulk),
    },
    schedules: {
      enabled: toNumber(row?.schedules_enabled),
      due: toNumber(row?.schedules_due),
      failed_24h: toNumber(row?.schedule_failures_24h),
      next_run_at: row?.next_run_at ?? null,
    },
    bulk_jobs: {
      active: toNumber(row?.active_bulk_jobs),
      failed_24h: toNumber(row?.bulk_failures_24h),
      completed_24h: toNumber(row?.bulk_completed_24h),
      latest_completed_at: row?.latest_completed_at ?? null,
    },
    issues: [],
  };

  if (!queueEnabled) {
    readiness.issues.push('EHR Bulk import queue is disabled');
  }
  if (readiness.tenants.active > 0 && readiness.tenants.with_backend_services === 0) {
    readiness.issues.push('No active EHR tenants have enabled backend-services credentials');
  }
  if (readiness.tenants.active > 0 && readiness.tenants.ready_for_bulk === 0) {
    readiness.issues.push('No active EHR tenants are ready for Bulk Data');
  }
  if (readiness.schedules.due > 0) {
    readiness.issues.push(`${readiness.schedules.due} enabled Bulk schedules are due for enqueue`);
  }
  if (readiness.schedules.failed_24h > 0) {
    readiness.issues.push(`${readiness.schedules.failed_24h} Bulk schedules failed in the last 24 hours`);
  }
  if (readiness.bulk_jobs.failed_24h > 0) {
    readiness.issues.push(`${readiness.bulk_jobs.failed_24h} Bulk jobs failed in the last 24 hours`);
  }

  return readiness;
}

function emptyEhrBulkReadiness(
  status: HealthStatus,
  queueEnabled: boolean,
  error?: string,
): EhrBulkReadiness {
  return {
    status,
    queue_enabled: queueEnabled,
    tenants: {
      total: 0,
      active: 0,
      with_backend_services: 0,
      with_capability_snapshots: 0,
      ready_for_bulk: 0,
    },
    schedules: {
      enabled: 0,
      due: 0,
      failed_24h: 0,
      next_run_at: null,
    },
    bulk_jobs: {
      active: 0,
      failed_24h: 0,
      completed_24h: 0,
      latest_completed_at: null,
    },
    issues: error ? [error] : [],
    ...(error ? { error } : {}),
  };
}

function normalizeQueueCounts(counts: Record<string, number>): QueueCounts {
  return {
    waiting: toNumber(counts['waiting'] ?? counts['wait']),
    active: toNumber(counts['active']),
    delayed: toNumber(counts['delayed']),
    failed: toNumber(counts['failed']),
  };
}

function emptyQueueCounts(): QueueCounts {
  return { waiting: 0, active: 0, delayed: 0, failed: 0 };
}

function earliestTimestamp(values: Array<number | string | null | undefined>): string | null {
  const timestamps = values.map(toTimestamp).filter((value): value is number => value !== null);
  if (timestamps.length === 0) return null;
  return new Date(Math.min(...timestamps)).toISOString();
}

function latestTimestamp(values: Array<number | string | null | undefined>): string | null {
  const timestamps = values.map(toTimestamp).filter((value): value is number => value !== null);
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function toTimestamp(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    const date = Date.parse(value);
    return Number.isFinite(date) ? date : null;
  }
  return null;
}

function redisConnectionOptions(redisUrl: string): RedisConnectionOptions {
  const url = new URL(redisUrl);
  const db = Number(url.pathname.replace('/', ''));
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(Number.isInteger(db) && db >= 0 ? { db } : {}),
    maxRetriesPerRequest: 1,
  };
}

function redisEndpoint(redisUrl: string): string {
  try {
    const url = new URL(redisUrl);
    return `${url.hostname}:${url.port || '6379'}/${url.pathname.replace('/', '') || '0'}`;
  } catch {
    return 'localhost:6379/0';
  }
}

function envBool(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
