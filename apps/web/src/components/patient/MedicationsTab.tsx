// =============================================================================
// Medgnosis — Medications Tab
// Active prescriptions with dosage, frequency, route, prescriber
// =============================================================================

import { usePatientMedications } from '../../hooks/useApi.js';
import { Pill } from 'lucide-react';

interface MedicationsTabProps {
  patientId: string;
}

function formatDate(dateStr: string | null | undefined) {
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

function statusBadge(status: string | null) {
  const s = (status || '').toLowerCase();
  if (s === 'active') return 'badge-teal';
  if (s === 'completed' || s === 'stopped') return 'badge-dim';
  if (s === 'hold' || s === 'suspended') return 'badge-amber';
  return 'badge-dim';
}

export function MedicationsTab({ patientId }: MedicationsTabProps) {
  const { data, isLoading } = usePatientMedications(patientId);

  const medications = (data?.data ?? []) as Array<{
    id: number;
    name: string;
    code: string;
    form: string | null;
    strength: string | null;
    dosage: string | null;
    frequency: string | null;
    route: string | null;
    status: string | null;
    start_datetime: string | null;
    end_datetime: string | null;
    refill_count: number | null;
    prescriber: string | null;
  }>;

  if (isLoading) {
    return (
      <div className="surface space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5 pb-3 border-b border-edge/10">
            <div className="skeleton h-3.5 w-2/3 rounded" />
            <div className="skeleton h-2.5 w-1/2 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (medications.length === 0) {
    return (
      <div className="surface">
        <div className="empty-state py-12">
          <Pill size={24} className="text-ghost mb-3" />
          <p className="empty-state-title">No medications on record</p>
          <p className="empty-state-desc">Active prescriptions and medication orders will appear here.</p>
        </div>
      </div>
    );
  }

  // Separate active from inactive
  const active = medications.filter((m) => m.status?.toLowerCase() === 'active');
  const inactive = medications.filter((m) => m.status?.toLowerCase() !== 'active');

  return (
    <div className="space-y-4">
      {/* Active medications */}
      <div className="surface">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-bright">Active Medications</h3>
          <span className="font-data text-xs text-ghost tabular-nums">{active.length}</span>
        </div>

        {active.length === 0 ? (
          <p className="text-xs text-ghost py-2">No active medications</p>
        ) : (
          <div className="space-y-0">
            {active.map((m) => (
              <div key={m.id} className="py-3 border-b border-edge/10 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-bright">{m.name}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-dim">
                      {m.strength && <span className="font-data text-bright">{m.strength}</span>}
                      {m.form && <span className="text-ghost capitalize">{m.form}</span>}
                      {m.dosage && <span className="font-data">{m.dosage}</span>}
                      {m.frequency && <span>{m.frequency}</span>}
                      {m.route && <span className="text-ghost">{m.route}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-ghost">
                      {m.prescriber && <span>Prescriber: {m.prescriber}</span>}
                      {m.start_datetime && (
                        <span className="font-data tabular-nums">
                          Started {formatDate(m.start_datetime)}
                        </span>
                      )}
                      {m.refill_count !== null && m.refill_count > 0 && (
                        <span>{m.refill_count} refills</span>
                      )}
                    </div>
                  </div>
                  <span className={statusBadge(m.status)}>{m.status || '—'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inactive/completed medications */}
      {inactive.length > 0 && (
        <div className="surface">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-dim">Past Medications</h3>
            <span className="font-data text-xs text-ghost tabular-nums">{inactive.length}</span>
          </div>
          <div className="space-y-0 opacity-75">
            {inactive.map((m) => (
              <div key={m.id} className="py-2 border-b border-edge/10 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-dim">{m.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-ghost">
                      {m.dosage && <span className="font-data">{m.dosage}</span>}
                      {m.frequency && <span>{m.frequency}</span>}
                      {m.end_datetime && (
                        <span className="font-data tabular-nums">
                          Ended {formatDate(m.end_datetime)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={statusBadge(m.status)}>{m.status || '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
