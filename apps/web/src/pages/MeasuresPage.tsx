// =============================================================================
// Medgnosis Web — Quality Measures  (Clinical Obsidian v2)
// 2-column: measure list left, detail panel right
// =============================================================================

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search,
  BarChart3,
  Users,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { api } from '../services/api.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MeasureRow {
  id: number;
  title: string;
  code: string;
  description: string;
  active_ind: string;
}

interface MeasureDetail extends MeasureRow {
  population: {
    total_patients: number;
    compliant: number;
    eligible: number;
  };
}

// ─── Arc Gauge ────────────────────────────────────────────────────────────────
// Semi-circle SVG gauge — 9 o'clock to 3 o'clock, fills clockwise

function ArcGauge({ value, max = 100 }: { value: number; max?: number }) {
  const r = 36;
  const C = 2 * Math.PI * r; // ≈ 226
  const pct = Math.min(Math.max(value / max, 0), 1);

  const gaugeColor =
    pct >= 0.75
      ? '#10C981' // emerald
      : pct >= 0.50
        ? '#F5A623' // amber
        : '#E8394A'; // crimson

  return (
    <div className="relative" style={{ width: 140, height: 90 }}>
      <svg viewBox="0 0 100 65" width="140" height="90" aria-hidden="true">
        {/* Track — top semi-circle */}
        <circle
          cx="50" cy="60" r={r}
          fill="none"
          stroke="#172239"
          strokeWidth="9"
          strokeLinecap="butt"
          strokeDasharray={`${C / 2} ${C / 2}`}
          transform="rotate(-180 50 60)"
        />
        {/* Value arc */}
        {pct > 0.01 && (
          <circle
            cx="50" cy="60" r={r}
            fill="none"
            stroke={gaugeColor}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${pct * (C / 2) - 3} ${C}`}
            transform="rotate(-180 50 60)"
          />
        )}
      </svg>

      {/* Center overlay — score + label */}
      <div className="absolute inset-0 flex items-end justify-center pb-1">
        <div className="text-center leading-none">
          <p
            className="font-data text-2xl font-medium tabular-nums leading-none"
            style={{ color: gaugeColor }}
          >
            {Math.round(pct * 100)}
          </p>
          <p className="data-label mt-0.5">% rate</p>
        </div>
      </div>
    </div>
  );
}

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

// ─── MeasureDetailPanel ───────────────────────────────────────────────────────

function MeasureDetailPanel({ measureId }: { measureId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['measure', measureId],
    queryFn: () => api.get<MeasureDetail>(`/measures/${measureId}`),
    enabled: !!measureId,
  });

  const detail = data?.data;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-up">
        <div className="space-y-2">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-7 w-3/4 rounded" />
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-4/5 rounded" />
        </div>
        <div className="surface p-0 overflow-hidden">
          <div className="flex divide-x divide-edge/25">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex-1 px-4 py-3 space-y-1.5">
                <div className="skeleton h-6 w-16 rounded" />
                <div className="skeleton h-2.5 w-20 rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="surface flex items-center justify-center py-8">
          <div className="skeleton w-[140px] h-[90px] rounded-full" />
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="empty-state py-20">
        <p className="empty-state-title">Measure not found</p>
      </div>
    );
  }

  const { eligible, compliant, total_patients } = detail.population ?? {
    eligible: 0, compliant: 0, total_patients: 0,
  };
  const rate = eligible > 0 ? Math.round((compliant / eligible) * 100) : 0;
  const rateClass = rate >= 75 ? 'text-emerald' : rate >= 50 ? 'text-amber' : 'text-crimson';

  return (
    <div className="space-y-5 animate-fade-up">

      {/* Measure header */}
      <div>
        <p className="font-data text-xs text-teal tabular-nums mb-1">{detail.code}</p>
        <h2 className="text-xl font-semibold text-bright leading-tight">{detail.title}</h2>
        {detail.description && (
          <p className="text-sm text-dim mt-2 leading-relaxed">{detail.description}</p>
        )}
      </div>

      {/* Stats strip */}
      <div className="surface p-0 overflow-hidden">
        <div className="flex items-stretch divide-x divide-edge/25">
          <div className="flex-1 px-4 py-3 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <BarChart3 size={13} strokeWidth={1.5} className={rateClass} aria-hidden="true" />
              <p className="data-label">Performance</p>
            </div>
            <p className={`font-data text-data-lg tabular-nums leading-none ${rateClass}`}>
              {rate}%
            </p>
            <div className="mt-1">
              <TrendBadge value={0} label="vs last month" />
            </div>
          </div>
          <Link
            to={`/patients?measure=${detail.code}&cohort=eligible`}
            className="flex-1 px-4 py-3 min-w-0 hover:bg-s1 transition-colors group"
            title="View eligible patients"
          >
            <div className="flex items-center gap-2 mb-0.5">
              <Users size={13} strokeWidth={1.5} className="text-dim group-hover:text-teal transition-colors" aria-hidden="true" />
              <p className="data-label">Eligible</p>
            </div>
            <p className="font-data text-data-lg text-bright tabular-nums leading-none group-hover:text-teal transition-colors">
              {eligible.toLocaleString()}
            </p>
          </Link>
          <Link
            to={`/patients?measure=${detail.code}&cohort=compliant`}
            className="flex-1 px-4 py-3 min-w-0 hover:bg-s1 transition-colors group"
            title="View compliant patients"
          >
            <div className="flex items-center gap-2 mb-0.5">
              <CheckCircle2 size={13} strokeWidth={1.5} className="text-emerald" aria-hidden="true" />
              <p className="data-label">Compliant</p>
            </div>
            <p className="font-data text-data-lg text-bright tabular-nums leading-none group-hover:text-emerald transition-colors">
              {compliant.toLocaleString()}
            </p>
          </Link>
        </div>
      </div>

      {/* Performance gauge */}
      <div className="surface">
        <h3 className="text-xs font-semibold text-bright mb-4">Compliance Rate</h3>
        <div className="flex items-center gap-8">
          <ArcGauge value={rate} max={100} />

          <div className="flex-1 space-y-3">
            {/* Eligible bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-dim">Eligible patients</span>
                <span className="font-data text-xs text-bright tabular-nums">
                  {eligible.toLocaleString()}
                </span>
              </div>
              <div className="progress-track progress-track-md">
                <div
                  className="progress-teal"
                  style={{
                    '--bar-width': total_patients > 0
                      ? `${Math.round((eligible / total_patients) * 100)}%`
                      : '0%',
                    '--bar-delay': '0ms',
                  } as React.CSSProperties}
                />
              </div>
            </div>

            {/* Compliant bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-dim">Compliant patients</span>
                <span className="font-data text-xs text-bright tabular-nums">
                  {compliant.toLocaleString()}
                </span>
              </div>
              <div className="progress-track progress-track-md">
                <div
                  className="progress-emerald"
                  style={{
                    '--bar-width': eligible > 0
                      ? `${Math.round((compliant / eligible) * 100)}%`
                      : '0%',
                    '--bar-delay': '120ms',
                  } as React.CSSProperties}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Population totals */}
      <div className="surface">
        <h3 className="text-xs font-semibold text-bright mb-3">Population Coverage</h3>
        <div className="flex items-center justify-between py-1.5">
          <span className="text-sm text-dim">Total patients</span>
          <span className="font-data text-sm text-bright tabular-nums">
            {total_patients.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between py-1.5 border-t border-edge/15">
          <span className="text-sm text-dim">Eligible for measure</span>
          <span className="font-data text-sm text-teal tabular-nums">
            {eligible.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between py-1.5 border-t border-edge/15">
          <span className="text-sm text-dim">In compliance</span>
          <span className="font-data text-sm text-emerald tabular-nums">
            {compliant.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between py-1.5 border-t border-edge/15">
          <span className="text-sm text-dim">Not compliant</span>
          <span className="font-data text-sm text-amber tabular-nums">
            {(eligible - compliant).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── MeasuresPage ─────────────────────────────────────────────────────────────

export function MeasuresPage() {
  const [search, setSearch]               = useState('');
  const [selectedId, setSelectedId]       = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['measures'],
    queryFn: () => api.get<MeasureRow[]>('/measures'),
  });

  const measures = data?.data ?? [];

  // Auto-select the first measure when the list loads
  useEffect(() => {
    if (!selectedId && measures.length > 0) {
      setSelectedId(measures[0].id);
    }
  }, [measures, selectedId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return measures;
    const s = search.toLowerCase();
    return measures.filter(
      (m) =>
        m.code.toLowerCase().includes(s) ||
        m.title.toLowerCase().includes(s) ||
        m.description?.toLowerCase().includes(s),
    );
  }, [measures, search]);

  return (
    <div className="flex h-[calc(100vh-7.5rem)] -m-6 overflow-hidden">

      {/* ── Measure list ─────────────────────────────────────────────── */}
      <div className="w-[340px] flex-shrink-0 flex flex-col border-r border-edge/35 bg-s0">

        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-edge/25 flex-shrink-0">
          <h1 className="text-base font-semibold text-bright">Quality Measures</h1>
          <p className="text-xs text-dim mt-0.5">
            {isLoading ? '—' : `${measures.length} measures`}
          </p>
          <div className="relative mt-3">
            <Search
              size={13}
              strokeWidth={1.5}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ghost pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Search by code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-8 w-full text-sm"
              autoComplete="off"
              spellCheck={false}
              aria-label="Search measures"
            />
          </div>
        </div>

        {/* Count row */}
        {search && (
          <div className="px-5 py-2 border-b border-edge/20 flex-shrink-0">
            <p className="text-xs text-dim">
              <span className="font-data text-bright tabular-nums">{filtered.length}</span>
              {' '}of {measures.length} measures
            </p>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-card px-3 py-3 bg-s1 space-y-1.5">
                  <div className="skeleton h-2.5 w-16 rounded" />
                  <div className="skeleton h-3 w-4/5 rounded" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 px-5 text-center">
              <p className="text-sm text-dim">No measures found</p>
              {search && (
                <p className="text-xs text-ghost mt-1">
                  Try a different search term
                </p>
              )}
            </div>
          ) : (
            <div className="p-3 space-y-1">
              {filtered.map((m) => {
                const isSelected = selectedId === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={[
                      'w-full text-left rounded-card px-3 py-3',
                      'border transition-colors duration-100',
                      'group flex items-center gap-2',
                      isSelected
                        ? 'bg-s1 border-teal/30 shadow-teal-glow'
                        : 'border-edge/20 hover:bg-s1 hover:border-edge/40',
                    ].join(' ')}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className={[
                          'font-data text-xs tabular-nums font-medium leading-none',
                          isSelected ? 'text-teal' : 'text-dim group-hover:text-teal transition-colors',
                        ].join(' ')}
                      >
                        {m.code}
                      </p>
                      <p className="text-xs font-medium text-bright mt-1.5 leading-snug line-clamp-2">
                        {m.title}
                      </p>
                    </div>
                    <ChevronRight
                      size={13}
                      strokeWidth={1.5}
                      className={[
                        'flex-shrink-0 transition-colors',
                        isSelected ? 'text-teal' : 'text-ghost group-hover:text-dim',
                      ].join(' ')}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail panel ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-void">
        {selectedId ? (
          <div className="p-6">
            <MeasureDetailPanel key={selectedId} measureId={selectedId} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-14 h-14 rounded-full bg-s1 flex items-center justify-center">
              <BarChart3 size={24} strokeWidth={1.5} className="text-ghost" />
            </div>
            <p className="text-sm font-medium text-dim">Select a measure</p>
            <p className="text-xs text-ghost">
              Choose a measure from the list to view population analysis
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
