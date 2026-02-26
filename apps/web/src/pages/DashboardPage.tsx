// =============================================================================
// Medgnosis Web — Dashboard  (Phase 13 — Redesigned Clinician Workspace)
// Greeting → Stats strip → Workspace (Schedule+Alerts) → Pop Health → Activity
// =============================================================================

import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertTriangle,
  Sparkles,
  Clock,
  ExternalLink,
  Bell,
  Shield,
  Users,
  Activity,
  AlertCircle,
  Send,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import { relativeTime, formatTime, calcAge, getGreeting } from '../utils/time.js';
import {
  PatientAvatar,
  getInitials,
} from '../components/PatientAvatar.js';

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
  clinician: {
    todays_schedule: Array<{
      id: number;
      date: string;
      type: string;
      reason: string | null;
      status: string | null;
      patient_id: number;
      patient_name: string;
      mrn: string;
      date_of_birth: string;
    }>;
    urgent_alerts: Array<{
      id: string;
      alert_type: string;
      severity: string;
      title: string;
      body: string | null;
      created_at: string;
      patient_id: number;
      patient_name: string | null;
      mrn: string | null;
    }>;
    critical_alert_count: number;
    abby_briefing: {
      enabled: boolean;
      message: string;
    };
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

interface DonutProps {
  high: number;
  medium: number;
  low: number;
}

function DonutChart({ high, medium, low }: DonutProps) {
  const navigate = useNavigate();
  const total = (high + medium + low) || 1;
  const r = 36;
  const C = 2 * Math.PI * r;
  const startOffset = C * 0.25;

  const segments = [
    { value: high,   color: '#E8394A', label: 'High Priority',   href: '/care-lists?status=open&priority=high'   },
    { value: medium, color: '#F5A623', label: 'Medium Priority',  href: '/care-lists?status=open&priority=medium' },
    { value: low,    color: '#10C981', label: 'Low Priority',     href: '/care-lists?status=open&priority=low'    },
  ];

  let cumulativePct = 0;

  return (
    <div className="relative inline-flex items-center justify-center flex-shrink-0">
      <svg
        viewBox="0 0 100 100"
        className="w-[96px] h-[96px] cursor-pointer"
        aria-label="Care gap breakdown by priority — click a segment to filter"
        role="img"
        onClick={() => navigate('/care-lists?status=open')}
      >
        <circle cx="50" cy="50" r={r} fill="none" stroke="#172239" strokeWidth="10" />
        {segments.map(({ value, color, label, href }) => {
          if (value === 0) return null;
          const pct   = value / total;
          const dash  = pct * C - 1.5;
          const rot   = cumulativePct * 360;
          cumulativePct += pct;
          return (
            <circle
              key={color}
              cx="50" cy="50" r={r}
              fill="none" stroke={color} strokeWidth="10" strokeLinecap="butt"
              strokeDasharray={`${Math.max(dash, 0)} ${C}`}
              strokeDashoffset={startOffset}
              style={{ transform: `rotate(${rot}deg)`, transformOrigin: '50px 50px', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); navigate(href); }}
              aria-label={label}
            />
          );
        })}
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
      >
        <span className="font-data text-base font-semibold text-bright tabular-nums leading-none">
          {total.toLocaleString()}
        </span>
        <span className="text-[10px] font-ui text-ghost uppercase tracking-wider mt-0.5">gaps</span>
      </div>
    </div>
  );
}

// ─── SectionDivider ───────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-xs font-semibold tracking-widest uppercase text-ghost whitespace-nowrap">
        {label}
      </span>
      <div
        className="flex-1 h-px"
        style={{ background: 'linear-gradient(90deg, rgba(30,68,120,0.55) 0%, transparent 100%)' }}
      />
    </div>
  );
}

// ─── AbbyChat ────────────────────────────────────────────────────────────────

const AbbyChat = ({ greeting }: { greeting: string }) => {
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<Array<{ role: 'user' | 'abby'; text: string }>>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { mutate: sendChat, isPending } = useMutation({
    mutationFn: (msg: string) =>
      api.post<{ response: string }>('/insights/chat', { message: msg }),
    onSuccess: (res) => {
      const reply = (res as { data?: { response?: string } }).data?.response ?? 'I\'m processing your request...';
      setChat((prev) => [...prev, { role: 'abby', text: reply }]);
    },
    onError: () => {
      setChat((prev) => [...prev, { role: 'abby', text: 'I\'m unavailable right now. Please try again later.' }]);
    },
  });

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || isPending) return;
    setChat((prev) => [...prev, { role: 'user', text: trimmed }]);
    setMessage('');
    sendChat(trimmed);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Greeting or chat history */}
      {chat.length === 0 ? (
        <div className="flex flex-col items-center text-center py-2">
          <div
            className="w-12 h-12 rounded-full bg-violet/10 border border-violet/20 flex items-center justify-center mb-3"
            style={{ boxShadow: '0 0 20px rgba(139,92,246,0.12)' }}
          >
            <Sparkles size={20} strokeWidth={1.5} className="text-violet" />
          </div>
          <p className="text-sm text-dim leading-snug">{greeting}</p>
          <p className="text-xs text-ghost mt-1.5 leading-relaxed">
            Ask me anything about your patients or care gaps.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin">
          {chat.map((msg, i) => (
            <div
              key={i}
              className={[
                'rounded-card px-3 py-2 text-xs leading-relaxed',
                msg.role === 'user'
                  ? 'bg-teal/10 text-teal ml-4'
                  : 'bg-s1 text-dim mr-4',
              ].join(' ')}
            >
              {msg.text}
            </div>
          ))}
          {isPending && (
            <div className="bg-s1 rounded-card px-3 py-2 text-xs text-ghost mr-4 flex items-center gap-1.5">
              <span className="w-3 h-3 border border-ghost border-t-transparent rounded-full animate-spin flex-shrink-0" />
              Thinking...
            </div>
          )}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask Abigail..."
          rows={2}
          className="input-field flex-1 resize-none text-xs"
          aria-label="Message Abigail"
        />
        <button
          onClick={handleSend}
          disabled={!message.trim() || isPending}
          className="p-2 rounded-card bg-violet/15 text-violet hover:bg-violet/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/50"
          aria-label="Send message"
        >
          <Send size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn:  () => api.get<DashboardResponse>('/dashboard'),
  });

  const stats     = data?.data?.stats;
  const analytics = data?.data?.analytics;
  const clinician = data?.data?.clinician;

  const greeting     = getGreeting();
  const displayName  = user ? `Dr. ${user.last_name}` : '';
  const todayStr     = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month:   'long',
    day:     'numeric',
    year:    'numeric',
  });

  if (error) {
    return (
      <div className="p-4 bg-crimson/10 text-crimson rounded-card border border-crimson/20 text-sm">
        Failed to load dashboard data. Check API connectivity.
      </div>
    );
  }

  const schedule   = clinician?.todays_schedule   ?? [];
  const alerts     = clinician?.urgent_alerts     ?? [];
  const criticalCt = clinician?.critical_alert_count ?? 0;
  const abby       = clinician?.abby_briefing;

  const totalPatients = stats?.total_patients.value ?? 0;
  const distribution  = analytics?.risk_stratification.distribution ?? [];
  const gaps          = analytics?.care_gap_summary ?? null;
  const recentEncs    = analytics?.recent_encounters ?? [];

  const hasCritical = alerts.some((a) => a.severity === 'critical');

  return (
    <div className="space-y-5">

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 — Greeting
         ══════════════════════════════════════════════════════════════════ */}
      <div className="flex items-start justify-between animate-fade-up stagger-1">
        <div>
          <h1 className="text-3xl font-semibold text-bright tracking-tight leading-tight">
            {greeting}{displayName && `, ${displayName}`}
          </h1>
          <p className="text-sm text-dim mt-1">{todayStr}</p>
        </div>

        <div className="flex items-center gap-3 mt-2">
          {criticalCt > 0 && (
            <Link
              to="/alerts"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-card bg-crimson/10 border border-crimson/30 text-crimson text-sm font-medium hover:bg-crimson/20 transition-colors"
            >
              <Bell size={13} aria-hidden="true" />
              {criticalCt} critical
            </Link>
          )}
          <div className="flex items-center gap-1.5">
            <span className="live-dot" aria-hidden="true" />
            <span className="text-xs text-ghost font-ui">Real-time</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — Stats strip (integrated surface, always first)
         ══════════════════════════════════════════════════════════════════ */}
      <div className="surface p-0 overflow-hidden animate-fade-up stagger-2">
        {isLoading ? (
          <div className="flex divide-x divide-edge/25">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex-1 px-5 py-4 space-y-2">
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton h-7 w-16 rounded" />
                <div className="skeleton h-3 w-20 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-stretch divide-x divide-edge/25">

            {/* Total Patients */}
            <div className="flex items-center gap-3 px-5 py-4 flex-1 min-w-0">
              <div className="flex-shrink-0 w-9 h-9 rounded-card bg-teal/10 flex items-center justify-center">
                <Users size={15} strokeWidth={1.5} className="text-teal" />
              </div>
              <div>
                <p className="text-xs font-medium text-ghost uppercase tracking-wider leading-none">Total Patients</p>
                <p className="font-data text-data-xl text-bright tabular-nums leading-none mt-1.5">
                  {totalPatients.toLocaleString()}
                </p>
                <div className="mt-1">
                  <TrendBadge value={stats?.total_patients.trend ?? 0} label="vs last month" />
                </div>
              </div>
            </div>

            {/* Active Patients */}
            <div className="flex items-center gap-3 px-5 py-4 flex-1 min-w-0">
              <div className="flex-shrink-0 w-9 h-9 rounded-card bg-emerald/10 flex items-center justify-center">
                <Activity size={15} strokeWidth={1.5} className="text-emerald" />
              </div>
              <div>
                <p className="text-xs font-medium text-ghost uppercase tracking-wider leading-none">Active Patients</p>
                <p className="font-data text-data-xl text-bright tabular-nums leading-none mt-1.5">
                  {(stats?.active_patients ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-ghost mt-1">currently enrolled</p>
              </div>
            </div>

            {/* Open Care Gaps */}
            <div className="flex items-center gap-3 px-5 py-4 flex-1 min-w-0">
              <div className="flex-shrink-0 w-9 h-9 rounded-card bg-amber/10 flex items-center justify-center">
                <AlertCircle size={15} strokeWidth={1.5} className="text-amber" />
              </div>
              <div>
                <p className="text-xs font-medium text-ghost uppercase tracking-wider leading-none">Open Care Gaps</p>
                <p className="font-data text-data-xl text-amber tabular-nums leading-none mt-1.5">
                  {(stats?.care_gaps.value ?? 0).toLocaleString()}
                </p>
                <div className="mt-1">
                  <TrendBadge value={stats?.care_gaps.trend ?? 0} label="vs last month" />
                </div>
              </div>
            </div>

            {/* High Risk */}
            <div className="flex items-center gap-3 px-5 py-4 flex-1 min-w-0">
              <div className="flex-shrink-0 w-9 h-9 rounded-card bg-crimson/10 flex items-center justify-center">
                <AlertTriangle size={15} strokeWidth={1.5} className="text-crimson" />
              </div>
              <div>
                <p className="text-xs font-medium text-ghost uppercase tracking-wider leading-none">High Risk</p>
                <p className="font-data text-data-xl text-crimson tabular-nums leading-none mt-1.5">
                  {(stats?.risk_score.high_risk_count ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-ghost mt-1">
                  {stats?.risk_score.high_risk_percentage ?? 0}% of population
                </p>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 — Clinician Workspace (Schedule + Alerts)
         ══════════════════════════════════════════════════════════════════ */}
      <SectionDivider label="Today's Workspace" />

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-[5fr_3fr] gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="surface space-y-3">
              <div className="skeleton h-5 w-36 rounded" />
              <div className="skeleton h-40 rounded-card" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[5fr_3fr] gap-4">

          {/* ── Today's Schedule ──────────────────────────────────────── */}
          <div
            className="surface animate-fade-up stagger-3"
            style={{ borderTopColor: 'rgba(13,217,217,0.5)', borderTopWidth: '2px' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Calendar size={15} strokeWidth={1.5} className="text-teal" />
                <h3 className="text-base font-semibold text-bright">Today's Schedule</h3>
              </div>
              <span className="font-data text-sm text-ghost tabular-nums">
                {schedule.length} visit{schedule.length !== 1 ? 's' : ''}
              </span>
            </div>

            {schedule.length === 0 ? (
              <div className="py-10 text-center">
                <Clock size={22} strokeWidth={1.5} className="text-ghost mx-auto mb-2.5" />
                <p className="text-sm text-ghost">No encounters scheduled for today</p>
              </div>
            ) : (
              <div className="max-h-[340px] overflow-y-auto scrollbar-thin">
                {schedule.map((enc) => {
                  const age = calcAge(enc.date_of_birth);
                  return (
                    <Link
                      key={enc.id}
                      to={`/patients/${enc.patient_id}`}
                      className={[
                        'flex items-center gap-4 py-3',
                        'border-b border-edge/10 last:border-0',
                        'hover:bg-s1 -mx-[var(--padding-panel)] px-[var(--padding-panel)]',
                        'transition-colors duration-100 group',
                      ].join(' ')}
                    >
                      {/* Time slot */}
                      <div className="flex-shrink-0 w-[72px] text-right">
                        <p className="font-data text-sm font-medium text-teal tabular-nums">
                          {formatTime(enc.date)}
                        </p>
                      </div>

                      {/* Spine */}
                      <div className="flex-shrink-0 w-px h-8 bg-edge/30" />

                      {/* Patient info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-bright group-hover:text-teal transition-colors truncate">
                          {enc.patient_name}
                        </p>
                        <p className="font-data text-xs text-ghost mt-0.5">
                          MRN {enc.mrn}
                          {age !== null && (
                            <span className="ml-2 text-dim">· {age}y</span>
                          )}
                          {enc.reason && (
                            <span className="ml-2 text-dim truncate">· {enc.reason}</span>
                          )}
                        </p>
                      </div>

                      {/* Encounter type */}
                      <div className="flex-shrink-0">
                        <span className="badge-dim">{enc.type || 'Visit'}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Urgent Alerts ─────────────────────────────────────────── */}
          <div
            className="surface animate-fade-up stagger-4"
            style={{
              borderTopColor: hasCritical ? 'rgba(232,57,74,0.55)' : 'rgba(245,166,35,0.45)',
              borderTopWidth: '2px',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <AlertTriangle
                  size={15}
                  strokeWidth={1.5}
                  className={hasCritical ? 'text-crimson' : 'text-amber'}
                />
                <h3 className="text-base font-semibold text-bright">Urgent Alerts</h3>
              </div>
              {alerts.length > 0 && (
                <Link to="/alerts" className="text-xs text-teal hover:text-teal/80 transition-colors font-medium">
                  View all
                </Link>
              )}
            </div>

            {alerts.length === 0 ? (
              <div className="py-10 text-center">
                <Shield size={22} strokeWidth={1.5} className="text-emerald mx-auto mb-2.5" />
                <p className="text-sm font-medium text-emerald">All clear</p>
                <p className="text-xs text-ghost mt-1">No unacknowledged urgent alerts</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-y-auto scrollbar-thin">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={[
                      'rounded-card px-3.5 py-3 border-l-2',
                      alert.severity === 'critical'
                        ? 'border-l-crimson bg-crimson/5'
                        : 'border-l-amber bg-amber/5',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-bright leading-snug">{alert.title}</p>
                        {alert.patient_name && (
                          <Link
                            to={`/patients/${alert.patient_id}`}
                            className="inline-flex items-center gap-1 font-data text-xs text-teal hover:text-teal/80 transition-colors mt-0.5"
                          >
                            {alert.patient_name}
                            <ExternalLink size={9} aria-hidden="true" />
                          </Link>
                        )}
                      </div>
                      <span className={`flex-shrink-0 ${alert.severity === 'critical' ? 'badge-crimson' : 'badge-amber'}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <p className="font-data text-xs text-ghost mt-1.5 tabular-nums">
                      {relativeTime(alert.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4 — Population Health (always visible, never collapsed)
         ══════════════════════════════════════════════════════════════════ */}
      <SectionDivider label="Population Health" />

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="surface space-y-3">
              <div className="skeleton h-5 w-40 rounded" />
              <div className="skeleton h-32 rounded-card" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-up stagger-5">

          {/* Risk Stratification */}
          <div className="surface">
            <h3 className="text-base font-semibold text-bright mb-5">Risk Stratification</h3>
            {distribution.length > 0 ? (
              <div className="space-y-4">
                {distribution.map((band, i) => {
                  const pct = totalPatients > 0
                    ? Math.round((band.count / totalPatients) * 100)
                    : 0;
                  const barClass = RISK_BAR_COLOR[band.risk_level] ?? 'progress-dim';
                  return (
                    <button
                      key={band.risk_level}
                      onClick={() => navigate(`/patients?risk=${band.risk_level}`)}
                      className="w-full text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded-card"
                      title={`View ${band.risk_level} risk patients`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-bright capitalize group-hover:text-teal transition-colors">
                          {band.risk_level}
                        </span>
                        <div className="flex items-center gap-3">
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
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state py-8">
                <p className="empty-state-desc">No risk stratification data available</p>
              </div>
            )}
          </div>

          {/* Care Gap Breakdown */}
          <div className="surface">
            <h3 className="text-base font-semibold text-bright mb-5">Care Gap Breakdown</h3>
            {gaps ? (
              <div className="flex items-center gap-7">
                <DonutChart
                  high={gaps.by_priority.high}
                  medium={gaps.by_priority.medium}
                  low={gaps.by_priority.low}
                />
                <div className="flex-1 space-y-3.5">
                  {[
                    { label: 'High Priority',   value: gaps.by_priority.high,   dot: 'bg-crimson', text: 'text-crimson' },
                    { label: 'Medium Priority', value: gaps.by_priority.medium, dot: 'bg-amber',   text: 'text-amber'   },
                    { label: 'Low Priority',    value: gaps.by_priority.low,    dot: 'bg-emerald', text: 'text-emerald' },
                  ].map(({ label, value, dot, text }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} aria-hidden="true" />
                      <span className="text-sm text-dim flex-1 leading-none">{label}</span>
                      <span className={`font-data text-sm tabular-nums font-semibold ${text}`}>
                        {value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  <div className="pt-3 border-t border-edge/20">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-dim/40" aria-hidden="true" />
                      <span className="text-sm text-dim flex-1 leading-none">Total</span>
                      <span className="font-data text-sm tabular-nums font-semibold text-bright">
                        {gaps.total.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state py-8">
                <p className="empty-state-desc">No care gap data available</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5 — Recent Activity & Abigail (bottom row)
         ══════════════════════════════════════════════════════════════════ */}
      {!isLoading && (
        <>
          <SectionDivider label="Recent Activity" />

          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 animate-fade-up stagger-6">

            {/* Recent Encounters */}
            <div className="surface">
              <h3 className="text-base font-semibold text-bright mb-4">Recent Encounters</h3>
              {recentEncs.length > 0 ? (
                <div className="divide-y divide-edge/15">
                  {recentEncs.map((enc) => {
                    return (
                      <Link
                        key={enc.id}
                        to={`/patients/${enc.id}`}
                        className={[
                          'flex items-center gap-3 py-3 first:pt-0 last:pb-0',
                          'hover:bg-s1 -mx-[var(--padding-panel)] px-[var(--padding-panel)]',
                          'transition-colors duration-100 group',
                        ].join(' ')}
                      >
                        <PatientAvatar
                          initials={getInitials(enc.patient_name)}
                          seed={enc.patient_name}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-bright group-hover:text-teal transition-colors truncate">{enc.patient_name}</p>
                          <p className="text-xs text-dim mt-0.5">{enc.type}</p>
                        </div>
                        <span className="font-data text-xs text-ghost whitespace-nowrap flex-shrink-0">
                          {relativeTime(enc.date)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state py-10">
                  <p className="empty-state-title">No recent encounters</p>
                  <p className="empty-state-desc">Patient encounters will appear here as they are recorded</p>
                </div>
              )}
            </div>

            {/* Abigail AI Chat */}
            <div
              className="surface"
              style={{ borderTopColor: 'rgba(139,92,246,0.45)', borderTopWidth: '2px' }}
            >
              <div className="flex items-center gap-2.5 mb-4">
                <Sparkles size={15} strokeWidth={1.5} className="text-violet" />
                <h3 className="text-base font-semibold text-bright">Abigail</h3>
                <span className="badge-dim text-xs">AI</span>
              </div>
              <AbbyChat greeting={abby?.message || 'Ask me about your patients or care gaps.'} />
            </div>

          </div>
        </>
      )}

    </div>
  );
}
