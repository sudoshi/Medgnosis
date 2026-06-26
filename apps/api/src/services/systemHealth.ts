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

export type HealthStatus = 'ok' | 'degraded' | 'error' | 'disabled';

export interface SystemHealth {
  api: { status: HealthStatus; node_env: string };
  database: { status: HealthStatus; error?: string };
  redis: { status: HealthStatus; error?: string };
  solr: { status: HealthStatus; enabled: boolean };
  auth: AuthHealth;
  workers: WorkerQueueHealth;
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

export interface AuthHealth {
  status: HealthStatus;
  local_enabled: boolean;
  oidc_enabled: boolean;
  providers: AuthProviderHealth[];
  error?: string;
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
  const [database, redis, solr, auth, workers, ehrBulk, ehrSyncAlerts, standards] = await Promise.all([
    getDatabaseHealth(),
    getRedisHealth(),
    getSolrHealth(),
    getAuthHealth(),
    getWorkerQueueHealth(),
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

async function getRedisHealth(): Promise<SystemHealth['redis']> {
  const redis = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  return redis.connect()
    .then(() => redis.ping())
    .then(() => ({ status: 'ok' as const }))
    .catch((err: unknown) => ({ status: 'error' as const, error: errorMessage(err) }))
    .finally(() => redis.disconnect());
}

async function getSolrHealth(): Promise<SystemHealth['solr']> {
  const solr = getSolrClient();
  if (solr) {
    return {
      status: isSolrAvailable() ? 'ok' : 'degraded',
      enabled: config.solrEnabled,
    };
  }

  return {
    status: config.solrEnabled ? 'error' : 'disabled',
    enabled: config.solrEnabled,
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

async function inspectQueue(
  definition: QueueDefinition,
  connection: RedisConnectionOptions,
): Promise<WorkerQueueStatus> {
  const queue = new Queue(definition.name, { connection });

  try {
    const [rawCounts, workers, paused, repeatableJobs] = await Promise.all([
      queue.getJobCounts(...QUEUE_JOB_TYPES),
      queue.getWorkersCount(),
      queue.isPaused(),
      definition.repeatable ? queue.getRepeatableJobs().then((jobs) => jobs.length) : Promise.resolve(undefined),
    ]);
    const counts = normalizeQueueCounts(rawCounts);
    return {
      ...definition,
      status: queueStatus({ counts, workers, paused, repeatableJobs, repeatable: definition.repeatable }),
      workers,
      paused,
      counts,
      ...(repeatableJobs === undefined ? {} : { repeatable_jobs: repeatableJobs }),
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
