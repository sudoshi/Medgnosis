// =============================================================================
// Medgnosis Web — Dashboard  (Clinical Obsidian v2)
// Population health executive overview
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../services/api.js';

// ─── API types ────────────────────────────────────────────────────────────────

interface DashboardResponse {
  stats: {
    total_patients:  { value: number; trend: number };
    active_patients: number;
    care_gaps:       { value: number; trend: number };
    risk_score:      { high_risk_count: number; high_risk_percentage: number; trend: number };
    encounters:      { value: number; trend: number };
  };
  analytics: {
    care_gap_summary: {
      total: number;
      by_priority: { high: number; medium: number; low: number };
    };
    risk_stratification: {
      distribution: { risk_level: string; count: number }[];
    };
    recent_encounters: {
      id: number;
      date: string;
      type: string;
      patient_name: string;
    }[];
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  'bg-teal/20 text-teal',
  'bg-violet/20 text-violet',
  'bg-amber/20 text-amber',
  'bg-emerald/20 text-emerald',
  'bg-crimson/20 text-crimson',
];

function avatarColor(seed: string): string {
  const hash = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function relativeTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '—';
  }
}

const RISK_BAR_COLOR: Record<string, string> = {
  critical: 'progress-crimson',
  high:     'progress-amber',
  moderate: 'progress-teal',
  low:      'progress-emerald',
};

// ─── TrendBadge ───────────────────────────────────────────────────────────────

function TrendBadge({ value, label }: { value: number; label: string }) {
  if (value === 0) return <span className="text-xs text-ghost">{label}</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${up ? 'text-emerald' : 'text-crimson'}`}>
      {up ? (
        <TrendingUp size={11} strokeWidth={2} aria-hidden="true" />
      ) : (
        <TrendingDown size={11} strokeWidth={2} aria-hidden="true" />
      )}
      <span className="font-data tabular-nums">{Math.abs(value)}%</span>
      <span className="text-ghost">{label}</span>
    </span>
  );
}

// ─── DonutChart ───────────────────────────────────────────────────────────────
// Multi-segment SVG ring — each circle independently rotated to its cumulative
// angular position, with a constant strokeDashoffset to start at 12 o'clock.

interface DonutProps {
  high: number;
  medium: number;
  low: number;
}

function DonutChart({ high, medium, low }: DonutProps) {
  const total = (high + medium + low) || 1;
  const r = 34;
  const C = 2 * Math.PI * r;           // ≈ 213.6
  const startOffset = C * 0.25;        // shift start to 12 o'clock

  const segments = [
    { value: high,   color: '#E8394A' }, // crimson
    { value: medium, color: '#F5A623' }, // amber
    { value: low,    color: '#10C981' }, // emerald
  ];

  let cumulativePct = 0;

  return (
    <div className="relative inline-flex items-center justify-center flex-shrink-0">
      <svg viewBox="0 0 100 100" className="w-[88px] h-[88px]" aria-hidden="true">
        {/* Background track */}
        <circle
          cx="50" cy="50" r={r}
          fill="none"
          stroke="#172239"
          strokeWidth="10"
        />

        {/* Segments */}
        {segments.map(({ value, color }) => {
          if (value === 0) return null;
          const pct   = value / total;
          const dash  = pct * C - 1.5; // 1.5px inter-segment gap
          const rot   = cumulativePct * 360;
          cumulativePct += pct;

          return (
            <circle
              key={color}
              cx="50" cy="50" r={r}
              fill="none"
              stroke={color}
              strokeWidth="10"
              strokeLinecap="butt"
              strokeDasharray={`${Math.max(dash, 0)} ${C}`}
              strokeDashoffset={startOffset}
              style={{ transform: `rotate(${rot}deg)`, transformOrigin: '50px 50px' }}
            />
          );
        })}
      </svg>

      {/* Center label — rendered outside SVG to avoid rotation */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-data text-base font-medium text-bright tabular-nums leading-none">
          {total.toLocaleString()}
        </span>
        <span className="text-[9px] font-ui text-dim uppercase tracking-wider mt-0.5">
          gaps
        </span>
      </div>
    </div>
  );
}

// ─── SkeletonHero ─────────────────────────────────────────────────────────────

function SkeletonHero() {
  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="col-span-2 surface space-y-4">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-12 w-52 rounded" />
        <div className="skeleton h-3 w-40 rounded" />
        <div className="pt-3 border-t border-edge/25 grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="skeleton h-7 w-24 rounded" />
            <div className="skeleton h-2.5 w-28 rounded" />
          </div>
          <div className="space-y-1.5">
            <div className="skeleton h-7 w-24 rounded" />
            <div className="skeleton h-2.5 w-20 rounded" />
          </div>
        </div>
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="surface space-y-3">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-9 w-28 rounded" />
          <div className="skeleton h-3 w-24 rounded" />
          <div className="pt-3 border-t border-edge/25">
            <div className="skeleton h-3 w-32 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn:  () => api.get<DashboardResponse>('/dashboard'),
  });

  const stats     = data?.data?.stats;
  const analytics = data?.data?.analytics;

  if (error) {
    return (
      <div className="p-4 bg-crimson/10 text-crimson rounded-card border border-crimson/20 text-sm">
        Failed to load dashboard data. Check API connectivity.
      </div>
    );
  }

  const totalPatients  = stats?.total_patients.value ?? 0;
  const distribution   = analytics?.risk_stratification.distribution ?? [];
  const gaps           = analytics?.care_gap_summary ?? null;
  const recentEncs     = analytics?.recent_encounters ?? [];

  return (
    <div className="space-y-6">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-bright">Population Health</h1>
          <p className="text-sm text-dim mt-0.5">
            Live metrics across all care programs
          </p>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="live-dot" aria-hidden="true" />
          <span className="text-xs text-ghost font-ui">Real-time</span>
        </div>
      </div>

      {/* ── Hero row ───────────────────────────────────────────────── */}
      {isLoading ? (
        <SkeletonHero />
      ) : (
        <div className="grid grid-cols-4 gap-4">

          {/* Population Overview */}
          <div className="col-span-2 surface animate-fade-up stagger-1">
            <p className="data-label mb-3">Population Overview</p>

            <div className="flex items-end gap-3">
              <p className="font-data text-data-2xl text-bright tabular-nums leading-none">
                {totalPatients.toLocaleString()}
              </p>
              <div className="mb-1.5">
                <TrendBadge
                  value={stats?.total_patients.trend ?? 0}
                  label="vs last month"
                />
              </div>
            </div>

            <p className="text-sm text-dim mt-1.5">
              Active patients under population care management
            </p>

            <div className="mt-4 pt-4 border-t border-edge/25 grid grid-cols-2 gap-6">
              <div>
                <p className="font-data text-data-lg text-bright tabular-nums leading-none">
                  {(stats?.encounters.value ?? 0).toLocaleString()}
                </p>
                <p className="data-label mt-1">Encounters this month</p>
              </div>
              <div>
                <p className="font-data text-data-lg text-bright tabular-nums leading-none">
                  {(stats?.active_patients ?? 0).toLocaleString()}
                </p>
                <p className="data-label mt-1">Active this month</p>
              </div>
            </div>
          </div>

          {/* High Risk */}
          <div className="surface animate-fade-up stagger-2 flex flex-col">
            <p className="data-label mb-3">High Risk Patients</p>

            <p className="font-data text-data-xl text-crimson tabular-nums leading-none">
              {(stats?.risk_score.high_risk_count ?? 0).toLocaleString()}
            </p>
            <p className="text-sm text-dim mt-1.5">
              {stats?.risk_score.high_risk_percentage ?? 0}% of population
            </p>

            <div className="mt-3">
              <TrendBadge value={stats?.risk_score.trend ?? 0} label="vs last month" />
            </div>

            <div className="mt-auto pt-4 border-t border-edge/25">
              <p className="text-xs text-ghost leading-relaxed">
                Patients requiring immediate clinical attention
              </p>
            </div>
          </div>

          {/* Open Care Gaps */}
          <div className="surface animate-fade-up stagger-3 flex flex-col">
            <p className="data-label mb-3">Open Care Gaps</p>

            <p className="font-data text-data-xl text-amber tabular-nums leading-none">
              {(stats?.care_gaps.value ?? 0).toLocaleString()}
            </p>
            <p className="text-sm text-dim mt-1.5">Across all care programs</p>

            <div className="mt-3">
              <TrendBadge value={stats?.care_gaps.trend ?? 0} label="vs last month" />
            </div>

            <div className="mt-auto pt-4 border-t border-edge/25">
              <p className="text-xs text-ghost leading-relaxed">
                Gaps requiring clinician review and action
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Analytics row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Risk Stratification */}
        <div className="surface animate-fade-up stagger-4">
          <h3 className="text-sm font-semibold text-bright mb-4">Risk Stratification</h3>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-1.5">
                  <div className="skeleton h-3 w-2/5 rounded" />
                  <div className="skeleton h-2.5 rounded-pill" />
                </div>
              ))}
            </div>
          ) : distribution.length > 0 ? (
            <div className="space-y-4">
              {distribution.map((band, i) => {
                const pct      = totalPatients > 0
                  ? Math.round((band.count / totalPatients) * 100)
                  : 0;
                const barClass = RISK_BAR_COLOR[band.risk_level] ?? 'progress-dim';

                return (
                  <div key={band.risk_level}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-bright capitalize">
                        {band.risk_level}
                      </span>
                      <div className="flex items-center gap-2.5">
                        <span className="font-data text-sm text-bright tabular-nums">
                          {band.count.toLocaleString()}
                        </span>
                        <span className="font-data text-xs text-dim tabular-nums w-9 text-right">
                          {pct}%
                        </span>
                      </div>
                    </div>
                    <div className="progress-track progress-track-md">
                      <div
                        className={barClass}
                        style={{
                          '--bar-width': `${pct}%`,
                          '--bar-delay': `${i * 120}ms`,
                        } as React.CSSProperties}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state py-6">
              <p className="empty-state-desc">No risk stratification data available</p>
            </div>
          )}
        </div>

        {/* Care Gap Breakdown */}
        <div className="surface animate-fade-up stagger-5">
          <h3 className="text-sm font-semibold text-bright mb-4">Care Gap Breakdown</h3>

          {isLoading ? (
            <div className="flex items-center gap-6">
              <div className="skeleton w-[88px] h-[88px] rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="skeleton w-2.5 h-2.5 rounded-full flex-shrink-0" />
                    <div className="skeleton h-3 flex-1 rounded" />
                    <div className="skeleton h-3 w-12 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ) : gaps ? (
            <div className="flex items-center gap-6">
              <DonutChart
                high={gaps.by_priority.high}
                medium={gaps.by_priority.medium}
                low={gaps.by_priority.low}
              />

              <div className="flex-1 space-y-3">
                {[
                  {
                    label:  'High Priority',
                    value:  gaps.by_priority.high,
                    dot:    'bg-crimson',
                    text:   'text-crimson',
                  },
                  {
                    label:  'Medium Priority',
                    value:  gaps.by_priority.medium,
                    dot:    'bg-amber',
                    text:   'text-amber',
                  },
                  {
                    label:  'Low Priority',
                    value:  gaps.by_priority.low,
                    dot:    'bg-emerald',
                    text:   'text-emerald',
                  },
                ].map(({ label, value, dot, text }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} aria-hidden="true" />
                    <span className="text-sm text-dim flex-1 leading-none">{label}</span>
                    <span className={`font-data text-sm tabular-nums font-medium ${text}`}>
                      {value.toLocaleString()}
                    </span>
                  </div>
                ))}

                <div className="pt-2.5 border-t border-edge/25">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 bg-edge/60" aria-hidden="true" />
                    <span className="text-sm text-dim flex-1 leading-none">Total</span>
                    <span className="font-data text-sm tabular-nums font-medium text-bright">
                      {gaps.total.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state py-6">
              <p className="empty-state-desc">No care gap data available</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Encounters ──────────────────────────────────────── */}
      <div className="surface animate-fade-up stagger-6">
        <h3 className="text-sm font-semibold text-bright mb-4">Recent Encounters</h3>

        {isLoading ? (
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <div className="skeleton w-9 h-9 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3 w-2/5 rounded" />
                  <div className="skeleton h-2.5 w-1/4 rounded" />
                </div>
                <div className="skeleton h-3 w-16 rounded" />
              </div>
            ))}
          </div>
        ) : recentEncs.length > 0 ? (
          <div className="divide-y divide-edge/20">
            {recentEncs.map((enc) => {
              const initials = getInitials(enc.patient_name);
              const color    = avatarColor(enc.patient_name);

              return (
                <div
                  key={enc.id}
                  className={[
                    'flex items-center gap-3 py-3 first:pt-0 last:pb-0',
                    'hover:bg-s1 -mx-5 px-5 transition-colors duration-100',
                  ].join(' ')}
                >
                  {/* Avatar */}
                  <div
                    className={[
                      'flex-shrink-0 flex items-center justify-center',
                      'w-9 h-9 rounded-full text-sm font-semibold font-ui',
                      color,
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    {initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-bright truncate">
                      {enc.patient_name}
                    </p>
                    <p className="text-xs text-dim mt-0.5 truncate">{enc.type}</p>
                  </div>

                  {/* Time */}
                  <span className="font-data text-xs text-ghost whitespace-nowrap flex-shrink-0">
                    {relativeTime(enc.date)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state py-8">
            <p className="empty-state-title">No recent encounters</p>
            <p className="empty-state-desc">
              Patient encounters will appear here as they are recorded
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
