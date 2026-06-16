// =============================================================================
// Dashboard — Population Health (Section 4: Risk Stratification + Care Gaps)
// =============================================================================

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { RISK_BAR_COLOR } from './helpers.js';
import type { DashboardResponse } from './types.js';

// ─── DonutChart ──────────────────────────────────────────────────────────────

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
    { value: high,   color: 'rgb(var(--crimson))', label: 'High Priority',   href: '/care-lists?status=open&priority=high'   },
    { value: medium, color: 'rgb(var(--amber))',   label: 'Medium Priority',  href: '/care-lists?status=open&priority=medium' },
    { value: low,    color: 'rgb(var(--emerald))', label: 'Low Priority',     href: '/care-lists?status=open&priority=low'    },
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
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--chart-track)" strokeWidth="10" />
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

// ─── PopulationHealthSection ─────────────────────────────────────────────────

interface PopulationHealthSectionProps {
  isLoading: boolean;
  totalPatients: number;
  distribution: DashboardResponse['analytics']['risk_stratification']['distribution'];
  gaps: DashboardResponse['analytics']['care_gap_summary'] | null;
}

export function PopulationHealthSection({
  isLoading,
  totalPatients,
  distribution,
  gaps,
}: PopulationHealthSectionProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="surface space-y-3">
            <div className="skeleton h-5 w-40 rounded" />
            <div className="skeleton h-32 rounded-card" />
          </div>
        ))}
      </div>
    );
  }

  return (
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
                  onClick={() => navigate(`/patients?risk_level=${band.risk_level}`)}
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
  );
}
