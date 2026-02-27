// =============================================================================
// Medgnosis — Allergies Tab
// Allergy list with reactions, severity, category
// =============================================================================

import { usePatientAllergies } from '../../hooks/useApi.js';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

interface AllergiesTabProps {
  patientId: string;
}

function severityBadge(severity: string | null) {
  const s = (severity || '').toLowerCase();
  if (s === 'severe' || s === 'high') return 'badge-crimson';
  if (s === 'moderate' || s === 'medium') return 'badge-amber';
  if (s === 'mild' || s === 'low') return 'badge-teal';
  return 'badge-dim';
}

function severityBorder(severity: string | null) {
  const s = (severity || '').toLowerCase();
  if (s === 'severe' || s === 'high') return 'border-l-crimson bg-crimson/5';
  if (s === 'moderate' || s === 'medium') return 'border-l-amber bg-amber/5';
  if (s === 'mild' || s === 'low') return 'border-l-teal/60 bg-s1';
  return 'border-l-edge/30 bg-s1';
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

export function AllergiesTab({ patientId }: AllergiesTabProps) {
  const { data, isLoading } = usePatientAllergies(patientId);

  const allergies = (data?.data ?? []) as Array<{
    id: number;
    name: string;
    code: string;
    category: string | null;
    reaction: string | null;
    severity: string | null;
    onset_date: string | null;
    status: string | null;
  }>;

  if (isLoading) {
    return (
      <div className="surface space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-16 rounded-card" />
        ))}
      </div>
    );
  }

  if (allergies.length === 0) {
    return (
      <div className="surface">
        <div className="empty-state py-12">
          <ShieldAlert size={24} className="text-2xl text-emerald mb-3" />
          <p className="empty-state-title text-emerald">NKDA — No Known Drug Allergies</p>
          <p className="empty-state-desc">No allergies have been recorded for this patient.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="surface">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} strokeWidth={1.5} className="text-amber" />
          <h3 className="text-sm font-semibold text-bright">Allergies</h3>
        </div>
        <span className="font-data text-xs text-ghost tabular-nums">{allergies.length}</span>
      </div>

      <div className="space-y-2">
        {allergies.map((a) => (
          <div
            key={a.id}
            className={[
              'rounded-card px-4 py-3 border-l-2',
              severityBorder(a.severity),
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-bright">{a.name}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                  {a.reaction && (
                    <span className="text-xs text-dim">
                      Reaction: <span className="text-bright">{a.reaction}</span>
                    </span>
                  )}
                  {a.category && (
                    <span className="text-[10px] text-ghost capitalize">{a.category}</span>
                  )}
                  {a.onset_date && (
                    <span className="font-data text-[10px] text-ghost tabular-nums">
                      Onset: {formatDate(a.onset_date)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={severityBadge(a.severity)}>
                  {a.severity || 'Unknown'}
                </span>
                {a.status && a.status !== 'Active' && (
                  <span className="badge-dim">{a.status}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
