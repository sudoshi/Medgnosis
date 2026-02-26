// =============================================================================
// Medgnosis — Flowsheet Grid (Module 10.4)
// Dense table: rows = observation types, columns = dates
// Color-coded out-of-range values
// =============================================================================

import { useState } from 'react';
import { usePatientFlowsheet } from '../../hooks/useApi.js';
import { TrendingUp } from 'lucide-react';

interface FlowsheetGridProps {
  patientId: string;
  onTrend?: (code: string, label: string) => void;
}

const CATEGORIES = [
  { id: '', label: 'All' },
  { id: 'vitals', label: 'Vitals' },
  { id: 'bmp', label: 'Basic Metabolic' },
  { id: 'cbc', label: 'CBC' },
  { id: 'lipids', label: 'Lipid Panel' },
];

function formatShortDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatYear(dateStr: string) {
  try {
    return new Date(dateStr).getFullYear().toString().slice(-2);
  } catch {
    return '';
  }
}

interface FlowsheetPoint {
  code: string;
  name: string;
  unit: string | null;
  reference_range: string | null;
  date: string;
  value_numeric: number | null;
  value_text: string | null;
  abnormal_flag: string | null;
}

export function FlowsheetGrid({ patientId, onTrend }: FlowsheetGridProps) {
  const [category, setCategory] = useState('');

  const { data, isLoading } = usePatientFlowsheet(patientId, category || undefined);
  const rawPoints = (data?.data ?? []) as FlowsheetPoint[];

  if (isLoading) {
    return (
      <div className="surface">
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-8 rounded" />
          ))}
        </div>
      </div>
    );
  }

  // Pivot: group by code, then by date
  const codeMap = new Map<string, { name: string; unit: string | null; ref: string | null; dates: Map<string, FlowsheetPoint> }>();

  for (const pt of rawPoints) {
    if (!codeMap.has(pt.code)) {
      codeMap.set(pt.code, {
        name: pt.name,
        unit: pt.unit,
        ref: pt.reference_range,
        dates: new Map(),
      });
    }
    const dateKey = pt.date.slice(0, 10); // YYYY-MM-DD
    const existing = codeMap.get(pt.code)!.dates.get(dateKey);
    // Keep the latest reading per date
    if (!existing || new Date(pt.date) > new Date(existing.date)) {
      codeMap.get(pt.code)!.dates.set(dateKey, pt);
    }
  }

  // Collect all unique dates, sorted descending (most recent first)
  const allDates = new Set<string>();
  for (const row of codeMap.values()) {
    for (const dateKey of row.dates.keys()) {
      allDates.add(dateKey);
    }
  }
  const sortedDates = [...allDates].sort((a, b) => b.localeCompare(a)).slice(0, 20); // max 20 columns

  const rows = [...codeMap.entries()];

  if (rows.length === 0) {
    return (
      <div className="surface">
        <p className="text-xs text-ghost text-center py-8">No observations found for this category.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Category filter */}
      <div className="flex items-center border border-edge/35 rounded-card overflow-hidden w-fit">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={[
              'px-3 py-1.5 text-xs font-medium transition-colors border-r border-edge/35 last:border-0',
              category === cat.id ? 'bg-teal/15 text-teal' : 'text-ghost hover:text-dim',
            ].join(' ')}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid table */}
      <div className="surface p-0 overflow-x-auto scrollbar-thin">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-s1">
              <th className="sticky left-0 z-10 bg-s1 px-3 py-2 text-left font-medium text-dim border-b border-edge/30 min-w-[180px]">
                Observation
              </th>
              {sortedDates.map((d) => (
                <th key={d} className="px-2 py-2 text-center font-medium text-ghost border-b border-edge/30 min-w-[70px] whitespace-nowrap">
                  <div>{formatShortDate(d)}</div>
                  <div className="text-[9px] opacity-60">'{formatYear(d)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([code, row]) => (
              <tr key={code} className="border-b border-edge/10 hover:bg-s1/50 transition-colors">
                <td className="sticky left-0 z-10 bg-s0 px-3 py-2 border-r border-edge/20">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-bright truncate">{row.name}</p>
                      <p className="font-data text-[9px] text-ghost">
                        {code}
                        {row.unit && <span className="ml-1">({row.unit})</span>}
                        {row.ref && <span className="ml-1 text-ghost/60">Ref: {row.ref}</span>}
                      </p>
                    </div>
                    {onTrend && row.dates.size > 1 && (
                      <button
                        onClick={() => onTrend(code, row.name)}
                        className="p-1 text-ghost hover:text-teal transition-colors rounded"
                        title={`Trend ${row.name}`}
                      >
                        <TrendingUp size={11} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </td>
                {sortedDates.map((d) => {
                  const pt = row.dates.get(d);
                  if (!pt) {
                    return <td key={d} className="px-2 py-2 text-center text-ghost/30">—</td>;
                  }
                  const isAbnormal = pt.abnormal_flag === 'Y';
                  const displayVal = pt.value_numeric !== null
                    ? pt.value_numeric.toString()
                    : pt.value_text || '—';

                  return (
                    <td
                      key={d}
                      className={[
                        'px-2 py-2 text-center font-data tabular-nums',
                        isAbnormal
                          ? 'text-crimson font-semibold bg-crimson/8'
                          : 'text-bright',
                      ].join(' ')}
                    >
                      {displayVal}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
