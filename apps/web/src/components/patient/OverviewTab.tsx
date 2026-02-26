// =============================================================================
// Medgnosis — Overview Tab (Patient Summary at-a-glance)
// 2-column grid: conditions + encounters (left), meds + care gaps (right)
// =============================================================================

import {
  Activity,
  Clipboard,
  Pill,
  AlertCircle,
  Eye,
  ChevronRight,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
} from 'lucide-react';
import { usePatientCareBundle } from '../../hooks/useApi.js';

interface OverviewTabProps {
  patientId: string;
  conditions: Array<{ id: number; code: string; name: string; status: string; onset_date: string }>;
  encounters: Array<{ id: number; date: string; type: string; reason: string | null; provider_name?: string | null }>;
  observations: Array<{ id: number; code: string; description?: string | null; value: string | null; unit: string | null; date: string; abnormal_flag?: string | null }>;
  careGaps: Array<{ id: number; measure: string | null; status: string; identified_date: string }>;
  medications?: Array<{ id: number; name: string; dosage: string | null; frequency: string | null; status: string | null }>;
  onTabChange: (tab: string) => void;
}

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

function statusBadge(status: string) {
  const s = (status || '').toUpperCase();
  if (s === 'ACTIVE') return 'badge-amber';
  if (s === 'RESOLVED' || s === 'INACTIVE') return 'badge-emerald';
  if (s === 'CHRONIC') return 'badge-teal';
  return 'badge-dim';
}


// ─── Risk Tier Card ───────────────────────────────────────────────────────────

function RiskTierCard({ pct, onClick }: { pct: number; onClick: () => void }) {
  const tier = pct >= 80 ? 'Low Risk' : pct >= 50 ? 'Moderate Risk' : 'High Risk';
  const color = pct >= 80 ? '#10C981' : pct >= 50 ? '#F5A623' : '#E8394A';
  const textColor = pct >= 80 ? 'text-emerald' : pct >= 50 ? 'text-amber' : 'text-crimson';
  const bgColor = pct >= 80 ? 'bg-emerald/10 border-emerald/20' : pct >= 50 ? 'bg-amber/10 border-amber/20' : 'bg-crimson/10 border-crimson/20';
  const Icon = pct >= 80 ? TrendingDown : pct >= 50 ? Minus : TrendingUp;

  // Mini arc gauge (48px)
  const r = 16;
  const C = 2 * Math.PI * r;
  const p = Math.min(Math.max(pct / 100, 0), 1);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-card border ${bgColor} transition-colors hover:opacity-80 group`}
      aria-label={`Risk tier: ${tier} — ${pct}% care bundle compliance`}
    >
      {/* Mini gauge */}
      <div className="relative flex-shrink-0" style={{ width: 48, height: 32 }}>
        <svg viewBox="0 0 44 28" width="48" height="32" aria-hidden="true">
          <circle cx="22" cy="26" r={r} fill="none" stroke="#172239" strokeWidth="5"
            strokeDasharray={`${C / 2} ${C / 2}`} transform="rotate(-180 22 26)" />
          {p > 0.01 && (
            <circle cx="22" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${p * (C / 2) - 1.5} ${C}`}
              transform="rotate(-180 22 26)" />
          )}
        </svg>
        <div className="absolute inset-0 flex items-end justify-center pb-0.5">
          <span className={`font-data text-[10px] font-semibold tabular-nums ${textColor}`}>{pct}%</span>
        </div>
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <Icon size={12} strokeWidth={2} className={textColor} aria-hidden="true" />
          <span className={`text-xs font-semibold ${textColor}`}>{tier}</span>
        </div>
        <p className="text-[10px] text-ghost mt-0.5">Based on care bundle compliance</p>
      </div>
    </button>
  );
}

export function OverviewTab({ patientId, conditions, encounters, observations, careGaps: _careGaps, medications, onTabChange }: OverviewTabProps) {
  const activeConditions = conditions.filter((c) => c.status?.toUpperCase() === 'ACTIVE');
  const recentObs = observations.slice(0, 5);
  const recentEnc = encounters.slice(0, 5);
  const activeMeds = (medications ?? []).filter((m) => m.status?.toLowerCase() === 'active').slice(0, 6);
  const abnormalCount = observations.filter((o) => o.abnormal_flag === 'Y').length;

  // Fetch bundle compliance for the care gaps summary
  const { data: bundleResponse, isLoading: bundleLoading } = usePatientCareBundle(patientId);
  const bundleData = bundleResponse?.data as {
    overall_compliance_pct: number;
    bundles: Array<{ bundle_code: string; condition_name: string; compliance_pct: number; met_count: number; measures: Array<{ is_deduplicated: boolean }> }>;
    total_measures: number;
    deduplicated_measures: number;
  } | undefined;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

      {/* ── Left Column ─────────────────────────────────────────────── */}
      <div className="space-y-4">

        {/* Active Conditions */}
        <div className="surface-compact">
          <button
            onClick={() => onTabChange('conditions')}
            className="flex items-center justify-between w-full mb-3 group"
          >
            <div className="flex items-center gap-2">
              <Activity size={14} strokeWidth={1.5} className="text-amber" />
              <h3 className="text-sm font-semibold text-bright">Active Conditions</h3>
              <span className="font-data text-xs text-ghost tabular-nums">{activeConditions.length}</span>
            </div>
            <ChevronRight size={14} className="text-ghost group-hover:text-dim transition-colors" />
          </button>
          {activeConditions.length === 0 ? (
            <p className="text-xs text-ghost py-2">No active conditions</p>
          ) : (
            <div className="space-y-0">
              {activeConditions.slice(0, 8).map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-edge/10 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-bright truncate">{c.name || c.code}</p>
                    <p className="font-data text-[10px] text-ghost tabular-nums">{c.code}</p>
                  </div>
                  <span className={statusBadge(c.status)}>{c.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Encounters */}
        <div className="surface-compact">
          <button
            onClick={() => onTabChange('encounters')}
            className="flex items-center justify-between w-full mb-3 group"
          >
            <div className="flex items-center gap-2">
              <Clipboard size={14} strokeWidth={1.5} className="text-teal" />
              <h3 className="text-sm font-semibold text-bright">Recent Encounters</h3>
            </div>
            <ChevronRight size={14} className="text-ghost group-hover:text-dim transition-colors" />
          </button>
          {recentEnc.length === 0 ? (
            <p className="text-xs text-ghost py-2">No encounters on record</p>
          ) : (
            <div className="space-y-0">
              {recentEnc.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-edge/10 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-bright">{e.type || 'Visit'}</p>
                    {e.reason && <p className="text-[10px] text-ghost truncate">{e.reason}</p>}
                    {e.provider_name && <p className="text-[10px] text-dim">{e.provider_name}</p>}
                  </div>
                  <span className="font-data text-[10px] text-ghost tabular-nums whitespace-nowrap">
                    {formatDate(e.date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Observations */}
        <div className="surface-compact">
          <button
            onClick={() => onTabChange('labs')}
            className="flex items-center justify-between w-full mb-3 group"
          >
            <div className="flex items-center gap-2">
              <Eye size={14} strokeWidth={1.5} className="text-emerald" />
              <h3 className="text-sm font-semibold text-bright">Recent Results</h3>
              {abnormalCount > 0 && (
                <span className="badge badge-crimson flex items-center gap-1" title={`${abnormalCount} abnormal result${abnormalCount !== 1 ? 's' : ''}`}>
                  <AlertTriangle size={9} strokeWidth={2} aria-hidden="true" />
                  {abnormalCount} abnormal
                </span>
              )}
            </div>
            <ChevronRight size={14} className="text-ghost group-hover:text-dim transition-colors" />
          </button>
          {recentObs.length === 0 ? (
            <p className="text-xs text-ghost py-2">No observations</p>
          ) : (
            <div className="space-y-0">
              {recentObs.map((o) => (
                <div key={o.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-edge/10 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-bright truncate">{o.description || o.code}</p>
                    <p className={[
                      'font-data text-xs tabular-nums mt-0.5',
                      o.abnormal_flag === 'Y' ? 'text-crimson' : 'text-emerald',
                    ].join(' ')}>
                      {o.value}{o.unit ? ` ${o.unit}` : ''}
                    </p>
                  </div>
                  <span className="font-data text-[10px] text-ghost tabular-nums whitespace-nowrap">
                    {formatDate(o.date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Column ─────────────────────────────────────────────── */}
      <div className="space-y-4">

        {/* Risk Score Card (shown when bundle data is available) */}
        {bundleData && !bundleLoading && (
          <RiskTierCard
            pct={bundleData.overall_compliance_pct}
            onClick={() => onTabChange('care-gaps')}
          />
        )}

        {/* Active Medications */}
        <div className="surface-compact">
          <button
            onClick={() => onTabChange('medications')}
            className="flex items-center justify-between w-full mb-3 group"
          >
            <div className="flex items-center gap-2">
              <Pill size={14} strokeWidth={1.5} className="text-violet" />
              <h3 className="text-sm font-semibold text-bright">Active Medications</h3>
              {activeMeds.length > 0 && (
                <span className="font-data text-xs text-ghost tabular-nums">{activeMeds.length}</span>
              )}
            </div>
            <ChevronRight size={14} className="text-ghost group-hover:text-dim transition-colors" />
          </button>
          {activeMeds.length === 0 ? (
            <p className="text-xs text-ghost py-2">No active medications</p>
          ) : (
            <div className="space-y-0">
              {activeMeds.map((m) => (
                <div key={m.id} className="py-1.5 border-b border-edge/10 last:border-0">
                  <p className="text-xs font-medium text-bright truncate">{m.name}</p>
                  <p className="text-[10px] text-ghost">
                    {[m.dosage, m.frequency].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Care Bundle Compliance */}
        <div className="surface-compact">
          <button
            onClick={() => onTabChange('care-gaps')}
            className="flex items-center justify-between w-full mb-3 group"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={14} strokeWidth={1.5} className={
                bundleData && bundleData.overall_compliance_pct < 50 ? 'text-amber' : 'text-ghost'
              } />
              <h3 className="text-sm font-semibold text-bright">Care Bundles</h3>
              {bundleData && bundleData.bundles.length > 0 && (
                <span className={[
                  'font-data text-xs font-semibold tabular-nums',
                  bundleData.overall_compliance_pct >= 80 ? 'text-emerald' :
                  bundleData.overall_compliance_pct >= 50 ? 'text-amber' :
                  'text-crimson',
                ].join(' ')}>
                  {bundleData.overall_compliance_pct}%
                </span>
              )}
            </div>
            <ChevronRight size={14} className="text-ghost group-hover:text-dim transition-colors" />
          </button>
          {bundleLoading ? (
            <div className="flex items-center gap-2 py-3 text-ghost">
              <Loader2 size={12} className="animate-spin" />
              <span className="text-xs">Loading bundles...</span>
            </div>
          ) : !bundleData || bundleData.bundles.length === 0 ? (
            <p className="text-xs text-emerald font-medium py-2">No condition bundles apply</p>
          ) : (
            <div className="space-y-2">
              {bundleData.bundles.map((b) => {
                const activeCount = b.measures.filter((m) => !m.is_deduplicated).length;
                const barColor =
                  b.compliance_pct >= 80 ? 'bg-emerald' :
                  b.compliance_pct >= 50 ? 'bg-amber' :
                  'bg-crimson';
                return (
                  <div key={b.bundle_code} className="rounded-card bg-s1 px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-bright truncate">{b.condition_name}</p>
                      <span className="font-data text-[10px] text-ghost tabular-nums whitespace-nowrap ml-2">
                        {b.met_count}/{activeCount}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-s2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor} transition-all duration-500`}
                        style={{ width: `${b.compliance_pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
