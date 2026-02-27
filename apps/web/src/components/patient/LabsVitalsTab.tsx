// =============================================================================
// Medgnosis — Labs & Vitals Tab
// Observations organized by category with abnormal flagging
// Hosts flowsheet grid and trending chart sub-views
// =============================================================================

import { useState } from 'react';
import { usePatientObservations } from '../../hooks/useApi.js';
import { FlowsheetGrid } from './FlowsheetGrid.js';
import { ObservationTrendChart } from './ObservationTrendChart.js';
import { Beaker, Grid3x3, TrendingUp, List, AlertTriangle } from 'lucide-react';

interface LabsVitalsTabProps {
  patientId: string;
}

type ViewMode = 'list' | 'flowsheet';
type AbnormalFilter = 'all' | 'abnormal';

function formatDate(dateStr: string) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function LabsVitalsTab({ patientId }: LabsVitalsTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [abnormalFilter, setAbnormalFilter] = useState<AbnormalFilter>('all');
  const [trendingCode, setTrendingCode] = useState<string | null>(null);
  const [trendingLabel, setTrendingLabel] = useState<string>('');

  const { data, isLoading } = usePatientObservations(patientId, { limit: 200 });

  const observations = (data?.data ?? []) as Array<{
    id: number;
    code: string;
    description: string | null;
    value: string | null;
    value_numeric: number | null;
    unit: string | null;
    reference_range: string | null;
    abnormal_flag: string | null;
    date: string;
  }>;

  const handleTrend = (code: string, label: string) => {
    setTrendingCode(code);
    setTrendingLabel(label);
  };

  if (isLoading) {
    return (
      <div className="surface space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex justify-between pb-2 border-b border-edge/10">
            <div className="space-y-1">
              <div className="skeleton h-3 w-32 rounded" />
              <div className="skeleton h-2.5 w-20 rounded" />
            </div>
            <div className="skeleton h-3 w-16 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (observations.length === 0) {
    return (
      <div className="surface">
        <div className="empty-state py-12">
          <Beaker size={24} className="text-2xl text-ghost mb-3" />
          <p className="empty-state-title">No lab results or vitals</p>
          <p className="empty-state-desc">Observations will appear here when available.</p>
        </div>
      </div>
    );
  }

  const abnormalCount = observations.filter((o) => o.abnormal_flag === 'Y').length;

  // Apply abnormal filter before grouping
  const filteredObs = abnormalFilter === 'abnormal'
    ? observations.filter((o) => o.abnormal_flag === 'Y')
    : observations;

  // Group observations by code for list view
  const grouped = new Map<string, typeof observations>();
  for (const obs of filteredObs) {
    const key = obs.code;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(obs);
  }

  // Sort groups by most recent observation date
  const sortedGroups = [...grouped.entries()].sort((a, b) => {
    const dateA = new Date(a[1][0].date).getTime();
    const dateB = new Date(b[1][0].date).getTime();
    return dateB - dateA;
  });

  return (
    <div className="space-y-4">
      {/* View mode toggle + abnormal filter */}
      <div className="surface p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Beaker size={14} strokeWidth={1.5} className="text-emerald flex-shrink-0" />
            <h3 className="text-sm font-semibold text-bright">Labs & Vitals</h3>
            <span className="font-data text-xs text-ghost tabular-nums">{observations.length} results</span>
            {abnormalCount > 0 && (
              <button
                onClick={() => setAbnormalFilter(abnormalFilter === 'abnormal' ? 'all' : 'abnormal')}
                className={[
                  'flex items-center gap-1 text-xs rounded-pill px-2 py-0.5 border transition-colors',
                  abnormalFilter === 'abnormal'
                    ? 'bg-crimson/15 border-crimson/30 text-crimson'
                    : 'border-crimson/20 text-crimson/70 hover:bg-crimson/10',
                ].join(' ')}
                title={abnormalFilter === 'abnormal' ? 'Show all results' : 'Show abnormal only'}
              >
                <AlertTriangle size={10} strokeWidth={2} aria-hidden="true" />
                {abnormalCount} abnormal
              </button>
            )}
          </div>
          <div className="flex items-center border border-edge/35 rounded-card overflow-hidden flex-shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'list' ? 'bg-teal/15 text-teal' : 'text-ghost hover:text-dim',
              ].join(' ')}
            >
              <List size={12} />
              List
            </button>
            <button
              onClick={() => setViewMode('flowsheet')}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-edge/35',
                viewMode === 'flowsheet' ? 'bg-teal/15 text-teal' : 'text-ghost hover:text-dim',
              ].join(' ')}
            >
              <Grid3x3 size={12} />
              Flowsheet
            </button>
          </div>
        </div>
      </div>

      {/* Trending chart (shown above data when a code is selected) */}
      {trendingCode && (
        <ObservationTrendChart
          patientId={patientId}
          code={trendingCode}
          label={trendingLabel}
          onClose={() => setTrendingCode(null)}
        />
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div className="surface">
          <div className="space-y-0">
            {sortedGroups.map(([code, obs]) => {
              const latest = obs[0];
              const label = latest.description || code;
              const isAbnormal = latest.abnormal_flag === 'Y';
              const hasMultiple = obs.length > 1;

              return (
                <div
                  key={code}
                  className="flex items-center justify-between gap-3 py-2.5 border-b border-edge/10 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-bright truncate">{label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-data text-[10px] text-ghost">{code}</span>
                      {latest.reference_range && (
                        <>
                          <span className="text-ghost">·</span>
                          <span className="font-data text-[10px] text-ghost">Ref: {latest.reference_range}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Value */}
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <p className={[
                          'font-data text-sm tabular-nums',
                          isAbnormal ? 'text-crimson font-semibold' : 'text-bright',
                        ].join(' ')}>
                          {latest.value}
                          {latest.unit && (
                            <span className="text-ghost text-[10px] ml-1">{latest.unit}</span>
                          )}
                        </p>
                        {isAbnormal && (
                          <span className="badge badge-crimson flex items-center gap-1 text-[9px]" aria-label="Abnormal result">
                            <AlertTriangle size={8} strokeWidth={2.5} aria-hidden="true" />
                            Abnormal
                          </span>
                        )}
                      </div>
                      <p className="font-data text-[10px] text-ghost tabular-nums">
                        {formatDate(latest.date)}
                      </p>
                    </div>

                    {/* Trend button */}
                    {hasMultiple && (
                      <button
                        onClick={() => handleTrend(code, label)}
                        className={[
                          'p-1.5 rounded-card transition-colors',
                          trendingCode === code
                            ? 'bg-teal/15 text-teal'
                            : 'text-ghost hover:text-teal hover:bg-teal/10',
                        ].join(' ')}
                        title={`Trend ${label}`}
                      >
                        <TrendingUp size={13} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Flowsheet view */}
      {viewMode === 'flowsheet' && (
        <FlowsheetGrid patientId={patientId} onTrend={handleTrend} />
      )}
    </div>
  );
}
