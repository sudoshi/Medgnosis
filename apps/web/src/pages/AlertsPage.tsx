// =============================================================================
// Medgnosis Web — Alerts  (Clinical Obsidian v2)
// Real-time clinical alert feed with severity-differentiated cards
// =============================================================================

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../services/api.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Alert {
  id: string;
  patient_id: number | null;
  alert_type: string;
  rule_key: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | string;
  title: string;
  body: string | null;
  acknowledged_at: string | null;
  auto_resolved: boolean;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '—';
  }
}

// Severity → visual tokens (card styles, icon, badge)
const SEVERITY_CARD: Record<string, { style: React.CSSProperties; borderClass: string; bg: string }> = {
  critical: {
    style: { boxShadow: 'inset 4px 0 0 #E8394A, 0 0 16px rgba(232, 57, 74, 0.08)' },
    borderClass: 'border border-crimson/20',
    bg: 'bg-crimson/5',
  },
  high: {
    style: { boxShadow: 'inset 4px 0 0 #F5A623' },
    borderClass: 'border border-amber/20',
    bg: 'bg-amber/5',
  },
  medium: {
    style: { boxShadow: 'inset 2px 0 0 rgba(245, 166, 35, 0.4)' },
    borderClass: 'border border-edge/30',
    bg: 'bg-s1',
  },
  low: {
    style: { boxShadow: 'inset 2px 0 0 rgba(13, 217, 217, 0.3)' },
    borderClass: 'border border-edge/25',
    bg: 'bg-s1',
  },
  info: {
    style: { boxShadow: 'inset 2px 0 0 rgba(13, 217, 217, 0.3)' },
    borderClass: 'border border-edge/25',
    bg: 'bg-s1',
  },
};

function getSeverityCard(severity: string) {
  return SEVERITY_CARD[severity] ?? SEVERITY_CARD.info;
}

function SeverityIcon({ severity }: { severity: string }) {
  const cls = 'flex-shrink-0';
  switch (severity) {
    case 'critical':
      return <AlertTriangle size={18} strokeWidth={1.5} className={`${cls} text-crimson`} aria-hidden="true" />;
    case 'high':
      return <AlertCircle size={18} strokeWidth={1.5} className={`${cls} text-amber`} aria-hidden="true" />;
    case 'medium':
      return <AlertCircle size={18} strokeWidth={1.5} className={`${cls} text-amber/70`} aria-hidden="true" />;
    default:
      return <Info size={18} strokeWidth={1.5} className={`${cls} text-teal/70`} aria-hidden="true" />;
  }
}

function SeverityBadge({ severity }: { severity: string }) {
  switch (severity) {
    case 'critical': return <span className="badge badge-crimson capitalize">{severity}</span>;
    case 'high':     return <span className="badge badge-amber capitalize">{severity}</span>;
    case 'medium':   return <span className="badge badge-amber capitalize">{severity}</span>;
    case 'low':      return <span className="badge badge-teal capitalize">{severity}</span>;
    default:         return <span className="badge badge-dim capitalize">{severity || 'info'}</span>;
  }
}

// ─── AlertCard ────────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onAcknowledge,
  isAcknowledging,
}: {
  alert: Alert;
  onAcknowledge: (id: string) => void;
  isAcknowledging: boolean;
}) {
  const isActive = !alert.acknowledged_at && !alert.auto_resolved;
  const card     = getSeverityCard(alert.severity);

  return (
    <div
      className={[
        'rounded-card overflow-hidden transition-all duration-150',
        card.borderClass,
        card.bg,
        isActive ? '' : 'opacity-70',
      ].join(' ')}
      style={isActive ? card.style : undefined}
    >
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Severity icon */}
        <div className="mt-0.5">
          <SeverityIcon severity={alert.severity} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h3 className="text-sm font-semibold text-bright leading-snug truncate">
                {alert.title}
              </h3>
              <SeverityBadge severity={alert.severity} />
            </div>
            <span className="font-data text-[11px] text-ghost whitespace-nowrap flex-shrink-0 mt-0.5 tabular-nums">
              {relativeTime(alert.created_at)}
            </span>
          </div>

          {/* Body */}
          {alert.body && (
            <p className="text-xs text-dim mt-1 leading-relaxed line-clamp-2">
              {alert.body}
            </p>
          )}

          {/* Meta row */}
          <div className="flex items-center justify-between mt-2.5">
            <div className="flex items-center gap-3 text-xs text-ghost">
              {alert.patient_id && (
                <Link
                  to={`/patients/${alert.patient_id}`}
                  className="hover:text-teal transition-colors font-data tabular-nums"
                >
                  Patient #{alert.patient_id}
                </Link>
              )}
              {alert.alert_type && (
                <span className="capitalize">{alert.alert_type.replace(/_/g, ' ')}</span>
              )}
            </div>

            {/* Right side — acknowledge or acknowledged status */}
            <div>
              {alert.acknowledged_at ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald">
                  <CheckCircle2 size={12} strokeWidth={2} aria-hidden="true" />
                  <span className="font-data tabular-nums text-[11px]">
                    {relativeTime(alert.acknowledged_at)}
                  </span>
                </span>
              ) : alert.auto_resolved ? (
                <span className="text-xs text-ghost italic">Auto-resolved</span>
              ) : (
                <button
                  onClick={() => onAcknowledge(alert.id)}
                  disabled={isAcknowledging}
                  className={[
                    'flex items-center gap-1.5 px-3 py-1 rounded-btn text-xs font-ui',
                    'border border-edge/35 text-dim',
                    'hover:border-emerald/40 hover:text-emerald hover:bg-emerald/5',
                    'transition-colors duration-100',
                    isAcknowledging ? 'opacity-50 cursor-not-allowed' : '',
                  ].join(' ')}
                  aria-label="Acknowledge alert"
                >
                  {isAcknowledging ? (
                    <>
                      <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                      <span>Acknowledging...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={11} strokeWidth={2} aria-hidden="true" />
                      <span>Acknowledge</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AlertsPage ───────────────────────────────────────────────────────────────

export function AlertsPage() {
  const [filter, setFilter] = useState<'all' | 'unread' | 'acknowledged'>('all');
  const queryClient         = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', filter],
    queryFn: () => {
      const params = new URLSearchParams({ per_page: '50' });
      if (filter === 'unread')      params.set('acknowledged', 'false');
      if (filter === 'acknowledged') params.set('acknowledged', 'true');
      return api.get<Alert[]>(`/alerts?${params}`);
    },
    refetchInterval: 30_000,
  });

  const { mutate: acknowledge, variables: acknowledgingId } = useMutation({
    mutationFn: (id: string) => api.post(`/alerts/${id}/acknowledge`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const alerts      = data?.data ?? [];
  const activeCount = alerts.filter((a) => !a.acknowledged_at && !a.auto_resolved).length;

  const criticalCount = alerts.filter((a) => a.severity === 'critical' && !a.acknowledged_at).length;

  return (
    <div className="space-y-5">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-bright">Alerts</h1>
          {activeCount > 0 && (
            <span className="badge badge-crimson">
              {activeCount} active
            </span>
          )}
          <span className="live-dot" aria-hidden="true" />
        </div>

        {/* Filter tabs */}
        <div className="flex items-center border border-edge/35 rounded-card overflow-hidden">
          {(['all', 'unread', 'acknowledged'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={[
                'px-3 py-1.5 text-xs font-medium font-ui capitalize transition-colors duration-100',
                filter === f
                  ? 'bg-teal/15 text-teal'
                  : 'text-ghost hover:text-dim hover:bg-s1',
              ].join(' ')}
            >
              {f === 'unread' ? 'Unread' : f === 'acknowledged' ? 'Acknowledged' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Critical alert summary banner ───────────────────────────────── */}
      {!isLoading && criticalCount > 0 && (
        <div
          className="rounded-card px-4 py-3 bg-crimson/8 border border-crimson/20 flex items-center gap-3 animate-fade-up"
          style={{ boxShadow: '0 0 24px rgba(232, 57, 74, 0.12)' }}
        >
          <AlertTriangle size={16} strokeWidth={2} className="text-crimson flex-shrink-0" aria-hidden="true" />
          <p className="text-sm text-crimson font-medium">
            <span className="font-data tabular-nums">{criticalCount}</span>
            {' '}critical {criticalCount === 1 ? 'alert requires' : 'alerts require'} immediate attention
          </p>
        </div>
      )}

      {/* ── Alert feed ──────────────────────────────────────────────────── */}
      <div className="space-y-2">

        {/* Loading skeletons */}
        {isLoading && (
          <>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-card border border-edge/25 bg-s1 px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <div className="skeleton w-[18px] h-[18px] rounded-full mt-0.5 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="skeleton h-3 w-48 rounded" />
                      <div className="skeleton h-4 w-14 rounded-pill" />
                    </div>
                    <div className="skeleton h-2.5 w-3/4 rounded" />
                    <div className="skeleton h-2.5 w-1/2 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Alert cards */}
        {!isLoading &&
          alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onAcknowledge={acknowledge}
              isAcknowledging={acknowledgingId === alert.id}
            />
          ))}

        {/* Empty state */}
        {!isLoading && alerts.length === 0 && (
          <div className="empty-state py-20">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-s1 mx-auto mb-4">
              <Bell size={24} strokeWidth={1.5} className="text-ghost" aria-hidden="true" />
            </div>
            <p className="empty-state-title">No alerts</p>
            <p className="empty-state-desc">
              {filter === 'unread'
                ? 'All alerts have been acknowledged'
                : filter === 'acknowledged'
                  ? 'No acknowledged alerts yet'
                  : 'No clinical alerts at this time'}
            </p>
          </div>
        )}
      </div>

      {/* Alert count footer */}
      {!isLoading && alerts.length > 0 && (
        <p className="text-xs text-ghost text-center font-data tabular-nums">
          Showing {alerts.length} alert{alerts.length === 1 ? '' : 's'} · refreshes every 30s
        </p>
      )}
    </div>
  );
}
