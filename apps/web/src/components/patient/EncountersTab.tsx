// =============================================================================
// Medgnosis — Encounters Tab
// Chronological encounter list with expandable details
// =============================================================================

import { useState } from 'react';
import { usePatientEncounters } from '../../hooks/useApi.js';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Stethoscope,
  Building2,
  User,
} from 'lucide-react';

interface EncountersTabProps {
  patientId: string;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatTime(dateStr: string) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function encounterTypeBadge(type: string | null) {
  const t = (type || '').toLowerCase();
  if (t.includes('inpatient')) return 'badge-crimson';
  if (t.includes('emergency') || t.includes('er')) return 'badge-amber';
  if (t.includes('outpatient') || t.includes('ambulatory')) return 'badge-teal';
  if (t.includes('wellness') || t.includes('preventive')) return 'badge-emerald';
  return 'badge-dim';
}

export function EncountersTab({ patientId }: EncountersTabProps) {
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading } = usePatientEncounters(patientId, { limit: 25, page });

  const encounters = data?.data ?? [];
  const meta = data?.meta;

  if (isLoading) {
    return (
      <div className="surface space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="skeleton w-2 h-2 rounded-full mt-2 flex-shrink-0" />
            <div className="flex-1 space-y-1.5 pb-3 border-b border-edge/10">
              <div className="skeleton h-3 w-1/3 rounded" />
              <div className="skeleton h-2.5 w-1/4 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (encounters.length === 0) {
    return (
      <div className="surface">
        <div className="empty-state py-12">
          <Calendar size={24} className="text-2xl text-ghost mb-3" />
          <p className="empty-state-title">No encounters on record</p>
          <p className="empty-state-desc">Clinical encounters will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="surface">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-bright">
          Encounters
          {meta?.total !== undefined && (
            <span className="ml-2 font-data text-xs text-ghost tabular-nums">({meta.total})</span>
          )}
        </h3>
      </div>

      <div className="space-y-0">
        {encounters.map((enc: Record<string, unknown>) => {
          const e = enc as { id: number; date: string; type: string; reason: string | null; status: string | null; disposition: string | null; provider_name: string | null; provider_specialty: string | null; facility: string | null };
          const isExpanded = expandedId === e.id;

          return (
            <div key={e.id} className="border-b border-edge/15 last:border-0">
              <button
                onClick={() => setExpandedId(isExpanded ? null : e.id)}
                className="w-full flex items-start gap-3 py-3 hover:bg-s1/50 transition-colors text-left px-1 rounded"
              >
                <div className="flex-shrink-0 mt-1">
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-teal" />
                  ) : (
                    <ChevronRight size={14} className="text-ghost" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={encounterTypeBadge(e.type)}>
                      {e.type || 'Visit'}
                    </span>
                    {e.reason && (
                      <span className="text-xs text-bright truncate">{e.reason}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-ghost">
                    <span className="font-data tabular-nums">{formatDate(e.date)}</span>
                    {formatTime(e.date) && (
                      <span className="font-data tabular-nums">{formatTime(e.date)}</span>
                    )}
                    {e.provider_name && (
                      <span className="text-dim">{e.provider_name}</span>
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="pl-8 pr-2 pb-3 space-y-2">
                  <div className="bg-s1 rounded-card p-3 space-y-2">
                    {e.provider_name && (
                      <div className="flex items-center gap-2 text-xs">
                        <User size={12} strokeWidth={1.5} className="text-teal" />
                        <span className="text-bright">{e.provider_name}</span>
                        {e.provider_specialty && (
                          <span className="text-ghost">({e.provider_specialty})</span>
                        )}
                      </div>
                    )}
                    {e.facility && (
                      <div className="flex items-center gap-2 text-xs">
                        <Building2 size={12} strokeWidth={1.5} className="text-violet" />
                        <span className="text-dim">{e.facility}</span>
                      </div>
                    )}
                    {e.reason && (
                      <div className="flex items-center gap-2 text-xs">
                        <Stethoscope size={12} strokeWidth={1.5} className="text-amber" />
                        <span className="text-dim">{e.reason}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs pt-1">
                      {e.status && <span className="badge-dim">{e.status}</span>}
                      {e.disposition && <span className="text-ghost">{e.disposition}</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-edge/20">
          <span className="font-data text-xs text-ghost tabular-nums">
            Page {meta.page} of {meta.total_pages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn-ghost btn-sm"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))}
              disabled={page >= meta.total_pages}
              className="btn-ghost btn-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
