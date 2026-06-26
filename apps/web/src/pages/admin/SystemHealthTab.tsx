import { useMutation, useQuery } from '@tanstack/react-query';
import type { ElementType } from 'react';
import { Activity, AlarmClock, BellRing, Database, GitBranch, HeartPulse, KeyRound, RefreshCw, Search, Server, Send, Wifi } from 'lucide-react';
import { api, apiErrorMessage } from '../../services/api.js';
import type {
  EhrSyncAlertDispatchResult,
  SystemAlertDispatchResult,
  SystemAlertingStatus,
  SystemHealth,
} from './types.js';
import { fmtDateTime } from './helpers.js';
import { Button } from '@/components/ui/button';

function StatusPill({ status }: { status: string }) {
  const normalized = normalizeStatus(status);

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${normalized.className}`}>
      {normalized.label}
    </span>
  );
}

function normalizeStatus(status: string): { label: string; className: string } {
  if (status === 'ok' || status === 'healthy' || status === 'ready') {
    return { label: 'Healthy', className: 'text-emerald border-emerald/25 bg-emerald/10' };
  }
  if (status === 'disabled' || status === 'skipped') {
    return { label: 'Disabled', className: 'text-ghost border-edge/35 bg-s2' };
  }
  if (status === 'blocked' || status === 'critical' || status === 'failed') {
    return { label: 'Blocked', className: 'text-crimson border-crimson/25 bg-crimson/10' };
  }
  if (status === 'error') {
    return { label: 'Error', className: 'text-crimson border-crimson/25 bg-crimson/10' };
  }
  return { label: 'Degraded', className: 'text-amber border-amber/25 bg-amber/10' };
}

function HealthRow({
  icon: Icon,
  label,
  status,
  detail,
}: {
  icon: ElementType;
  label: string;
  status: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-edge/20 py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-card bg-s2 text-dim">
          <Icon size={16} strokeWidth={1.7} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-bright">{label}</p>
          {detail && <p className="truncate text-xs text-ghost">{detail}</p>}
        </div>
      </div>
      <StatusPill status={status} />
    </div>
  );
}

function queueCounts(counts: SystemHealth['workers']['counts']) {
  return `W ${counts.waiting} / A ${counts.active} / D ${counts.delayed} / F ${counts.failed}`;
}

function redisDetail(redis: SystemHealth['redis']): string {
  if (redis.error) return `${redis.endpoint} / ${redis.error}`;
  if (!redis.pubsub) return redis.endpoint;
  return `${redis.endpoint} / alerts ${redis.pubsub.alert_channels} channels / ${redis.pubsub.patterns} patterns`;
}

function solrDetail(solr: SystemHealth['solr']): string {
  const coreSummary = solr.cores
    .map((core) => `${core.name} ${core.healthy ? 'ok' : 'down'}`)
    .join(' / ');
  return `${solr.enabled ? 'Enabled' : 'Disabled'} / ${coreSummary || solr.url}`;
}

function queueTiming(queue: SystemHealth['workers']['queues'][number]): string | null {
  const parts = [];
  if (queue.next_run_at) parts.push(`Next ${fmtDateTime(queue.next_run_at)}`);
  if (queue.latest_completed_at) parts.push(`Last complete ${fmtDateTime(queue.latest_completed_at)}`);
  return parts.length > 0 ? parts.join(' / ') : null;
}

function percent(value: number | null): string {
  if (value === null) return 'None';
  return `${Math.round(value * 100)}%`;
}

function latestOrNone(value: string | null): string {
  return value ? fmtDateTime(value) : 'None';
}

function hoursLabel(value: number | null): string {
  if (value === null) return 'No run recorded';
  return `${value}h ago`;
}

function rateLabel(value: number | null): string {
  if (value === null) return 'None';
  return `${Math.round(value * 100)}%`;
}

type AuthProviderHealth = SystemHealth['auth']['providers'][number];

function authProviderLastTest(provider: AuthProviderHealth): string {
  if (!provider.last_test) return 'No test recorded';
  const parts = [
    provider.last_test.status.toUpperCase(),
    fmtDateTime(provider.last_test.tested_at),
  ];
  if (provider.last_test.response_ms !== null) parts.push(`${provider.last_test.response_ms} ms`);
  return parts.join(' / ');
}

function authProviderDetail(provider: AuthProviderHealth): string {
  if (!provider.enabled) return 'Disabled';
  if (provider.last_test?.error_message) return provider.last_test.error_message;
  if (provider.provider_type === 'oidc' && provider.last_test?.issuer) return provider.last_test.issuer;
  return provider.enabled ? 'Enabled' : 'Disabled';
}

export function SystemHealthTab() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'system-health'],
    queryFn: () => api.get<SystemHealth>('/admin/system-health'),
    refetchInterval: 60_000,
  });
  const dispatchAlerts = useMutation({
    mutationFn: () => api.post<{ ehrSyncAlertDispatch: EhrSyncAlertDispatchResult }>(
      '/admin/system-health/ehr-sync-alerts/dispatch',
    ),
    onSuccess: () => {
      void refetch();
    },
  });
  const systemAlerts = useQuery({
    queryKey: ['admin', 'system-health', 'system-alerts', 'status'],
    queryFn: () => api.get<{ systemAlertingStatus: SystemAlertingStatus }>(
      '/admin/system-health/system-alerts/status',
    ),
    refetchInterval: 60_000,
  });
  const dispatchSystemAlerts = useMutation({
    mutationFn: () => api.post<{ systemAlertDispatch: SystemAlertDispatchResult }>(
      '/admin/system-health/system-alerts/dispatch',
    ),
    onSuccess: () => {
      void systemAlerts.refetch();
      void refetch();
    },
  });

  const health = data?.data;
  const latestDispatch = dispatchAlerts.data?.data?.ehrSyncAlertDispatch;
  const systemAlertStatus = systemAlerts.data?.data?.systemAlertingStatus;
  const latestSystemDispatch = dispatchSystemAlerts.data?.data?.systemAlertDispatch;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-bright">System Health</h2>
          <p className="text-xs text-ghost mt-0.5">Runtime checks for core Medgnosis services</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw />
          Refresh
        </Button>
      </div>

      <div className="surface p-5">
        {!health && (
          <div className="py-8 text-center text-sm text-ghost">Loading system health...</div>
        )}
        {health && (
          <>
            <HealthRow icon={Server} label="API" status={health.api.status} detail={health.api.node_env} />
            <HealthRow icon={Database} label="Database" status={health.database.status} detail={health.database.error} />
            <HealthRow icon={Wifi} label="Redis" status={health.redis.status} detail={redisDetail(health.redis)} />
            <HealthRow icon={Search} label="Solr" status={health.solr.status} detail={solrDetail(health.solr)} />
            <HealthRow
              icon={KeyRound}
              label="Authentication"
              status={health.auth.status}
              detail={`Local ${health.auth.local_enabled ? 'on' : 'off'} / OIDC ${health.auth.oidc_enabled ? 'on' : 'off'}`}
            />
            <HealthRow
              icon={HeartPulse}
              label="EHR/FHIR Tenants"
              status={health.ehr_tenants.status}
              detail={`${health.ehr_tenants.tenants.healthy}/${health.ehr_tenants.tenants.active} active tenants healthy`}
            />
            <HealthRow
              icon={AlarmClock}
              label="Nightly Scheduler"
              status={health.scheduler.status}
              detail={`Last run ${latestOrNone(health.scheduler.last_run_at)} / ${health.scheduler.missed ? 'missed window' : 'on schedule'}`}
            />
            <HealthRow
              icon={GitBranch}
              label="Migrations"
              status={health.migrations.status}
              detail={`${health.migrations.migrations.applied} applied / ${health.migrations.migrations.pending} pending / ${health.migrations.materialized_views.unpopulated} matviews unpopulated`}
            />
            <HealthRow
              icon={Activity}
              label="Observability"
              status={health.observability.status}
              detail={`Queue depth ${health.observability.worker_queue.depth} / failure ${rateLabel(health.observability.worker_queue.failure_rate)} / CQL ${health.observability.cql_engine.available ? 'available' : 'unavailable'}`}
            />
            <HealthRow icon={Activity} label="Probe" status="ok" detail={`${health.duration_ms} ms`} />
          </>
        )}
      </div>

      {health && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="surface p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-bright">Workers & Queues</h3>
                <p className="mt-0.5 text-xs text-ghost">
                  {health.workers.total_workers} workers / {queueCounts(health.workers.counts)}
                </p>
                <p className="mt-0.5 text-xs text-ghost">
                  {health.workers.completed_recent} completed recent / failure {rateLabel(health.workers.failure_rate)} / {health.workers.stalled_queues} stalled
                </p>
              </div>
              <StatusPill status={health.workers.status} />
            </div>
            <div className="divide-y divide-edge/20">
              {health.workers.queues.map((queue) => (
                <div key={queue.name} className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_8rem_6rem]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-bright">{queue.label}</p>
                    <p className="truncate font-data text-xs text-ghost">{queue.name}</p>
                    {queueTiming(queue) && <p className="mt-1 truncate text-xs text-ghost">{queueTiming(queue)}</p>}
                    <p className="mt-1 truncate font-data text-xs text-dim">
                      {queue.completed_recent ?? 0} completed{queue.stalled ? ' / stalled' : ''}
                    </p>
                    {queue.error && <p className="mt-1 truncate text-xs text-crimson">{queue.error}</p>}
                  </div>
                  <p className="font-data text-xs text-dim md:text-right">{queueCounts(queue.counts)}</p>
                  <div className="flex justify-start md:justify-end">
                    <StatusPill status={queue.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="surface p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-bright">Authentication Providers</h3>
                  <p className="mt-0.5 text-xs text-ghost">Provider availability and latest test evidence</p>
                </div>
                <StatusPill status={health.auth.status} />
              </div>
              <div className="divide-y divide-edge/20">
                {health.auth.providers.map((provider) => (
                  <div key={provider.provider_type} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-bright">{provider.display_name}</p>
                        <p className="truncate text-xs text-ghost">{authProviderDetail(provider)}</p>
                      </div>
                      <StatusPill status={provider.status} />
                    </div>
                    <p className="mt-2 truncate font-data text-xs text-dim">{authProviderLastTest(provider)}</p>
                    {provider.issues.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {provider.issues.slice(0, 2).map((issue) => (
                          <p key={issue} className="truncate text-xs text-amber">{issue}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="surface p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-bright">EHR/FHIR Tenant Readiness</h3>
                  <p className="mt-0.5 text-xs text-ghost">
                    {health.ehr_tenants.tenants.healthy}/{health.ehr_tenants.tenants.active} active tenants healthy
                  </p>
                </div>
                <StatusPill status={health.ehr_tenants.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Tenant states</p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_tenants.tenants.healthy} healthy / {health.ehr_tenants.tenants.degraded} degraded
                  </p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_tenants.tenants.blocked} blocked / {health.ehr_tenants.tenants.disabled} disabled
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">SMART/FHIR</p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_tenants.discovery.smart_ok}/{health.ehr_tenants.tenants.active} SMART
                  </p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_tenants.discovery.capability_ok}/{health.ehr_tenants.tenants.active} capability
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Backend services</p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_tenants.backend_services.ready_for_token_exchange}/{health.ehr_tenants.tenants.active} token-ready
                  </p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_tenants.backend_services.token_requests_24h} token checks 24h
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Bulk coverage</p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_tenants.resource_coverage.tenants_with_required_bulk_coverage}/{health.ehr_tenants.tenants.active} complete
                  </p>
                  <p className="mt-1 font-data text-bright">
                    {percent(health.ehr_tenants.resource_coverage.average_required_bulk_coverage)} average
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-card border border-edge/25 bg-s0 p-3 text-xs">
                <p className="text-ghost">Latest evidence</p>
                <p className="mt-1 font-data text-bright">
                  Discovery {latestOrNone(health.ehr_tenants.discovery.latest_snapshot_at)}
                </p>
                <p className="mt-1 font-data text-bright">
                  Backend token {latestOrNone(health.ehr_tenants.backend_services.latest_token_issued_at)}
                </p>
                <p className="mt-1 font-data text-bright">
                  Launch success {latestOrNone(health.ehr_tenants.smart_launch.latest_success_at)}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Launch 24h</p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_tenants.smart_launch.launches_started_24h} starts / {health.ehr_tenants.smart_launch.callbacks_succeeded_24h} callbacks
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Launch issues</p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_tenants.smart_launch.launches_denied_24h} denied / {health.ehr_tenants.smart_launch.callbacks_failed_24h} failed
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">FHIR API 24h</p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_tenants.fhir_api.failed_requests_24h} failed / {health.ehr_tenants.fhir_api.auth_failures_24h} auth
                  </p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_tenants.fhir_api.rate_limit_failures_24h} rate / {health.ehr_tenants.fhir_api.network_failures_24h} network
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Backend token failures</p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_tenants.fhir_api.backend_token_failures_24h} total / {health.ehr_tenants.fhir_api.backend_token_auth_failures_24h} auth
                  </p>
                  <p className="mt-1 truncate font-data text-bright">
                    {health.ehr_tenants.fhir_api.affected_resource_types.join(', ') || 'No resource types'}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-card border border-edge/25 bg-s0 p-3 text-xs">
                <p className="text-ghost">Latest FHIR/backend failure</p>
                <p className="mt-1 font-data text-bright">
                  {latestOrNone(health.ehr_tenants.fhir_api.latest_failure_at)}
                </p>
              </div>
              {health.ehr_tenants.issues.length > 0 && (
                <div className="mt-3 space-y-2">
                  {health.ehr_tenants.issues.slice(0, 5).map((issue) => (
                    <p key={issue} className="rounded-card border border-amber/20 bg-amber/5 px-3 py-2 text-xs text-amber">
                      {issue}
                    </p>
                  ))}
                </div>
              )}
              {health.ehr_tenants.error && (
                <p className="mt-3 rounded-card border border-crimson/25 bg-crimson/5 px-3 py-2 text-xs text-crimson">
                  {health.ehr_tenants.error}
                </p>
              )}
            </div>

            <div className="surface p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-bright">EHR Bulk Readiness</h3>
                  <p className="mt-0.5 text-xs text-ghost">
                    {health.ehr_bulk.tenants.ready_for_bulk}/{health.ehr_bulk.tenants.active} active tenants ready
                  </p>
                </div>
                <StatusPill status={health.ehr_bulk.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Schedules</p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_bulk.schedules.enabled} enabled / {health.ehr_bulk.schedules.due} due
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Bulk jobs</p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_bulk.bulk_jobs.active} active / {health.ehr_bulk.bulk_jobs.failed_24h} failed
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Backend clients</p>
                  <p className="mt-1 font-data text-bright">{health.ehr_bulk.tenants.with_backend_services}</p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Capabilities</p>
                  <p className="mt-1 font-data text-bright">{health.ehr_bulk.tenants.with_capability_snapshots}</p>
                </div>
              </div>
              <div className="mt-3 rounded-card border border-edge/25 bg-s0 p-3 text-xs">
                <p className="text-ghost">Next schedule</p>
                <p className="mt-1 font-data text-bright">
                  {health.ehr_bulk.schedules.next_run_at ? fmtDateTime(health.ehr_bulk.schedules.next_run_at) : 'None'}
                </p>
                <p className="mt-2 text-ghost">Latest completed job</p>
                <p className="mt-1 font-data text-bright">
                  {health.ehr_bulk.bulk_jobs.latest_completed_at
                    ? fmtDateTime(health.ehr_bulk.bulk_jobs.latest_completed_at)
                    : 'None'}
                </p>
              </div>
              {health.ehr_bulk.issues.length > 0 && (
                <div className="mt-3 space-y-2">
                  {health.ehr_bulk.issues.slice(0, 4).map((issue) => (
                    <p key={issue} className="rounded-card border border-amber/20 bg-amber/5 px-3 py-2 text-xs text-amber">
                      {issue}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="surface p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-bright">Standards Readiness</h3>
                  <p className="mt-0.5 text-xs text-ghost">
                    {health.standards.checks.filter((check) => check.status === 'ok').length}/{health.standards.checks.length} checks ready
                  </p>
                </div>
                <StatusPill status={health.standards.status} />
              </div>
              <div className="divide-y divide-edge/20">
                {health.standards.checks.map((check) => (
                  <div key={check.key} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-bright">{check.label}</p>
                        <p className="truncate text-xs text-ghost">{check.detail}</p>
                      </div>
                      <StatusPill status={check.status} />
                    </div>
                    <div className="mt-2 grid gap-2 text-xs">
                      <p className="font-data text-dim">
                        Artifacts {check.artifacts.present}/{check.artifacts.total}
                        {check.runtime_configured ? ' / runtime configured' : ' / runtime optional'}
                      </p>
                      <p className="truncate font-data text-ghost">{check.commands[0] ?? 'No command registered'}</p>
                    </div>
                    {check.artifacts.missing.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {check.artifacts.missing.slice(0, 2).map((artifact) => (
                          <p key={artifact} className="truncate text-xs text-amber">Missing {artifact}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {health.standards.issues.length > 0 && (
                <div className="mt-3 space-y-2">
                  {health.standards.issues.slice(0, 3).map((issue) => (
                    <p key={issue} className="rounded-card border border-amber/20 bg-amber/5 px-3 py-2 text-xs text-amber">
                      {issue}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="surface p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-bright">Nightly Scheduler</h3>
                  <p className="mt-0.5 truncate text-xs text-ghost">{health.scheduler.queue}</p>
                </div>
                <StatusPill status={health.scheduler.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Last run</p>
                  <p className="mt-1 font-data text-bright">{latestOrNone(health.scheduler.last_run_at)}</p>
                  <p className="mt-1 font-data text-bright">{hoursLabel(health.scheduler.hours_since_last_run)}</p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Detection</p>
                  <p className="mt-1 font-data text-bright">
                    {health.scheduler.missed ? 'Missed window' : 'On schedule'}
                  </p>
                  <p className="mt-1 font-data text-bright">
                    {health.scheduler.repeatable_scheduled ? 'Schedule registered' : 'No schedule'}
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Last success</p>
                  <p className="mt-1 font-data text-emerald">{latestOrNone(health.scheduler.last_success_at)}</p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Last failure</p>
                  <p className="mt-1 font-data text-crimson">{latestOrNone(health.scheduler.last_failure_at)}</p>
                </div>
              </div>
              <div className="mt-3 rounded-card border border-edge/25 bg-s0 p-3 text-xs">
                <p className="text-ghost">Run history</p>
                <p className="mt-1 font-data text-bright">
                  {health.scheduler.completed_recent} completed / {health.scheduler.failed_recent} failed (staleness {health.scheduler.stale_after_hours}h)
                </p>
              </div>
              {health.scheduler.issues.length > 0 && (
                <div className="mt-3 space-y-2">
                  {health.scheduler.issues.slice(0, 4).map((issue) => (
                    <p key={issue} className="rounded-card border border-amber/20 bg-amber/5 px-3 py-2 text-xs text-amber">
                      {issue}
                    </p>
                  ))}
                </div>
              )}
              {health.scheduler.error && (
                <p className="mt-3 rounded-card border border-crimson/25 bg-crimson/5 px-3 py-2 text-xs text-crimson">
                  {health.scheduler.error}
                </p>
              )}
            </div>

            <div className="surface p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-bright">Migrations</h3>
                  <p className="mt-0.5 truncate text-xs text-ghost">
                    {health.migrations.migrations.applied} applied / {health.migrations.migrations.pending} pending
                  </p>
                </div>
                <StatusPill status={health.migrations.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Ledger</p>
                  <p className="mt-1 font-data text-bright">
                    {health.migrations.migrations.applied} applied / {health.migrations.migrations.pending} pending
                  </p>
                  <p className="mt-1 truncate font-data text-bright">
                    {health.migrations.migrations.latest_name ?? 'No migration recorded'}
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Materialized views</p>
                  <p className="mt-1 font-data text-bright">
                    {health.migrations.materialized_views.populated}/{health.migrations.materialized_views.total} populated
                  </p>
                  <p className="mt-1 font-data text-bright">
                    {health.migrations.materialized_views.unpopulated} unpopulated
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-card border border-edge/25 bg-s0 p-3 text-xs">
                <p className="text-ghost">Latest migration applied</p>
                <p className="mt-1 font-data text-bright">
                  {latestOrNone(health.migrations.migrations.latest_applied_at)}
                </p>
              </div>
              {health.migrations.materialized_views.names_unpopulated.length > 0 && (
                <div className="mt-3 space-y-1">
                  {health.migrations.materialized_views.names_unpopulated.slice(0, 4).map((name) => (
                    <p key={name} className="truncate text-xs text-amber">Unpopulated {name}</p>
                  ))}
                </div>
              )}
              {health.migrations.issues.length > 0 && (
                <div className="mt-3 space-y-2">
                  {health.migrations.issues.slice(0, 3).map((issue) => (
                    <p key={issue} className="rounded-card border border-amber/20 bg-amber/5 px-3 py-2 text-xs text-amber">
                      {issue}
                    </p>
                  ))}
                </div>
              )}
              {health.migrations.error && (
                <p className="mt-3 rounded-card border border-crimson/25 bg-crimson/5 px-3 py-2 text-xs text-crimson">
                  {health.migrations.error}
                </p>
              )}
            </div>

            <div className="surface p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-bright">Observability Rollup</h3>
                  <p className="mt-0.5 truncate text-xs text-ghost">Alert-ready operational metrics</p>
                </div>
                <StatusPill status={health.observability.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Worker queue</p>
                  <p className="mt-1 font-data text-bright">
                    Depth {health.observability.worker_queue.depth} / {health.observability.worker_queue.failed} failed
                  </p>
                  <p className="mt-1 font-data text-bright">
                    Failure {rateLabel(health.observability.worker_queue.failure_rate)} / {health.observability.worker_queue.stalled_queues} stalled
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Scheduler</p>
                  <p className="mt-1 font-data text-bright">
                    {health.observability.scheduler.missed ? 'Missed' : 'On schedule'}
                  </p>
                  <p className="mt-1 font-data text-bright">
                    {hoursLabel(health.observability.scheduler.hours_since_last_run)}
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">EHR launch 24h</p>
                  <p className="mt-1 font-data text-bright">
                    {health.observability.ehr_launch.succeeded_24h} ok / {health.observability.ehr_launch.failed_24h} failed
                  </p>
                  <p className="mt-1 font-data text-bright">
                    Success {rateLabel(health.observability.ehr_launch.success_rate_24h)}
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Bulk import 24h</p>
                  <p className="mt-1 font-data text-bright">
                    {health.observability.bulk_import.completed_24h} done / {health.observability.bulk_import.failed_24h} failed
                  </p>
                  <p className="mt-1 font-data text-bright">
                    Failure {rateLabel(health.observability.bulk_import.failure_rate_24h)}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-ghost">CQL engine</p>
                    <StatusPill status={health.observability.cql_engine.status} />
                  </div>
                  <p className="mt-1 font-data text-bright">
                    {health.observability.cql_engine.available ? 'Available' : 'Unavailable'}
                    {health.observability.cql_engine.runtime_configured ? ' / runtime configured' : ' / runtime optional'}
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-ghost">QDM bridge</p>
                    <StatusPill status={health.observability.qdm_bridge.status} />
                  </div>
                  <p className="mt-1 font-data text-bright">
                    {health.observability.qdm_bridge.blocking_issues} blocking issue(s)
                  </p>
                </div>
              </div>
            </div>

            <div className="surface p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-bright">System Alerting</h3>
                  <p className="mt-0.5 truncate text-xs text-ghost">
                    {systemAlertStatus?.endpoint_host ?? 'No endpoint'}
                  </p>
                </div>
                <StatusPill status={systemAlertStatus?.status ?? 'disabled'} />
              </div>
              {!systemAlertStatus && !systemAlerts.isError && (
                <p className="text-xs text-ghost">Loading system alerting status...</p>
              )}
              {systemAlerts.isError && (
                <p className="rounded-card border border-crimson/25 bg-crimson/5 px-3 py-2 text-xs text-crimson">
                  {apiErrorMessage(systemAlerts.error, 'Failed to load system alerting status')}
                </p>
              )}
              {systemAlertStatus && (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-card border border-edge/25 bg-s0 p-3">
                      <p className="text-ghost">External</p>
                      <p className="mt-1 font-data text-bright">
                        {systemAlertStatus.configured ? 'Configured' : 'Disabled'}
                      </p>
                    </div>
                    <div className="rounded-card border border-edge/25 bg-s0 p-3">
                      <p className="text-ghost">Nightly</p>
                      <p className="mt-1 font-data text-bright">
                        {systemAlertStatus.nightly_enabled ? 'Enabled' : 'Off'}
                      </p>
                    </div>
                    <div className="rounded-card border border-edge/25 bg-s0 p-3">
                      <p className="text-ghost">Last issues</p>
                      <p className="mt-1 font-data text-bright">{systemAlertStatus.last_issue_count ?? 0}</p>
                    </div>
                    <div className="rounded-card border border-edge/25 bg-s0 p-3">
                      <p className="text-ghost">Critical</p>
                      <p className="mt-1 font-data text-bright">{systemAlertStatus.last_critical_issue_count ?? 0}</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-card border border-edge/25 bg-s0 p-3 text-xs">
                    <p className="text-ghost">Last dispatch</p>
                    <p className="mt-1 font-data text-bright">
                      {latestOrNone(systemAlertStatus.last_dispatch_at)}
                    </p>
                    <p className="mt-2 text-ghost">Status</p>
                    <p className="mt-1 font-data text-bright">
                      {systemAlertStatus.last_dispatch_status ?? 'None'}
                      {systemAlertStatus.last_dispatch_reason ? ` / ${systemAlertStatus.last_dispatch_reason}` : ''}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 text-xs text-ghost">
                      {latestSystemDispatch
                        ? `${latestSystemDispatch.status} / ${latestSystemDispatch.reason} / ${latestSystemDispatch.issueCount} issues`
                        : systemAlertStatus.error ?? 'Ready'}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => dispatchSystemAlerts.mutate()}
                      disabled={dispatchSystemAlerts.isPending}
                    >
                      {dispatchSystemAlerts.isPending ? <RefreshCw /> : <BellRing />}
                      Dispatch system alert
                    </Button>
                  </div>
                  {dispatchSystemAlerts.isError && (
                    <p className="mt-2 rounded-card border border-crimson/25 bg-crimson/5 px-3 py-2 text-xs text-crimson">
                      {apiErrorMessage(dispatchSystemAlerts.error, 'Dispatch failed')}
                    </p>
                  )}
                  <div className="sr-only" aria-live="polite">
                    {latestSystemDispatch ? `System alert dispatch ${latestSystemDispatch.status}` : ''}
                  </div>
                </>
              )}
            </div>

            <div className="surface p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-bright">EHR Sync Alerts</h3>
                  <p className="mt-0.5 truncate text-xs text-ghost">
                    {health.ehr_sync_alerts.endpoint_host ?? 'No endpoint'}
                  </p>
                </div>
                <StatusPill status={health.ehr_sync_alerts.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">External</p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_sync_alerts.configured ? 'Configured' : 'Disabled'}
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Nightly</p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_sync_alerts.nightly_enabled ? 'Enabled' : 'Off'}
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Last issues</p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_sync_alerts.last_issue_count ?? 0}
                  </p>
                </div>
                <div className="rounded-card border border-edge/25 bg-s0 p-3">
                  <p className="text-ghost">Critical</p>
                  <p className="mt-1 font-data text-bright">
                    {health.ehr_sync_alerts.last_critical_issue_count ?? 0}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-card border border-edge/25 bg-s0 p-3 text-xs">
                <p className="text-ghost">Last dispatch</p>
                <p className="mt-1 font-data text-bright">
                  {health.ehr_sync_alerts.last_dispatch_at
                    ? fmtDateTime(health.ehr_sync_alerts.last_dispatch_at)
                    : 'None'}
                </p>
                <p className="mt-2 text-ghost">Status</p>
                <p className="mt-1 font-data text-bright">
                  {health.ehr_sync_alerts.last_dispatch_status ?? 'None'}
                  {health.ehr_sync_alerts.last_dispatch_reason ? ` / ${health.ehr_sync_alerts.last_dispatch_reason}` : ''}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="min-w-0 text-xs text-ghost">
                  {latestDispatch
                    ? `${latestDispatch.status} / ${latestDispatch.reason} / ${latestDispatch.issueCount} issues`
                    : health.ehr_sync_alerts.error ?? 'Ready'}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => dispatchAlerts.mutate()}
                  disabled={dispatchAlerts.isPending}
                >
                  {dispatchAlerts.isPending ? <RefreshCw /> : <Send />}
                  Dispatch
                </Button>
              </div>
              {dispatchAlerts.isError && (
                <p className="mt-2 rounded-card border border-crimson/25 bg-crimson/5 px-3 py-2 text-xs text-crimson">
                  {apiErrorMessage(dispatchAlerts.error, 'Dispatch failed')}
                </p>
              )}
              <div className="sr-only" aria-live="polite">
                {latestDispatch ? `EHR sync alert dispatch ${latestDispatch.status}` : ''}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
