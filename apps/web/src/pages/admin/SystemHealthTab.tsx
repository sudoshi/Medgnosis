import { useQuery } from '@tanstack/react-query';
import type { ElementType } from 'react';
import { Activity, Database, KeyRound, RefreshCw, Search, Server, Wifi } from 'lucide-react';
import { api } from '../../services/api.js';
import type { SystemHealth } from './types.js';
import { Button } from '@/components/ui/button';

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'ok'
      ? 'text-emerald border-emerald/25 bg-emerald/10'
      : status === 'disabled'
        ? 'text-ghost border-edge/35 bg-s2'
        : 'text-amber border-amber/25 bg-amber/10';

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
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

export function SystemHealthTab() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'system-health'],
    queryFn: () => api.get<SystemHealth>('/admin/system-health'),
    refetchInterval: 60_000,
  });

  const health = data?.data;

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
            <HealthRow icon={Wifi} label="Redis" status={health.redis.status} detail={health.redis.error} />
            <HealthRow icon={Search} label="Solr" status={health.solr.status} detail={health.solr.enabled ? 'Enabled' : 'Disabled'} />
            <HealthRow
              icon={KeyRound}
              label="Authentication"
              status={health.auth.oidc_enabled || health.auth.local_enabled ? 'ok' : 'error'}
              detail={`Local ${health.auth.local_enabled ? 'on' : 'off'} / OIDC ${health.auth.oidc_enabled ? 'on' : 'off'}`}
            />
            <HealthRow icon={Activity} label="Probe" status="ok" detail={`${health.duration_ms} ms`} />
          </>
        )}
      </div>
    </div>
  );
}
