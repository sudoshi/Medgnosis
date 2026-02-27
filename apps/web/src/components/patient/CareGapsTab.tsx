// =============================================================================
// Medgnosis — Care Gaps Tab (Phase 10.6 — Bundle-Grouped View)
// Condition-based bundles with compliance tracking and deduplication
// =============================================================================

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Shield,
  Loader2,
} from 'lucide-react';
import { usePatientCareBundle } from '../../hooks/useApi.js';

// ─── Types (matching PatientCareBundleResponse) ─────────────────────────────

interface PatientBundleMeasure {
  measure_code: string;
  measure_name: string;
  description: string | null;
  frequency: string | null;
  ecqm_reference: string | null;
  status: string;
  due_date: string | null;
  identified_date: string | null;
  resolved_date: string | null;
  care_gap_id: number | null;
  is_deduplicated: boolean;
  dedup_source: string | null;
}

interface PatientBundle {
  bundle_code: string;
  condition_name: string;
  bundle_size: number;
  compliance_pct: number;
  met_count: number;
  measures: PatientBundleMeasure[];
}

interface OverlapDeduction {
  domain: string;
  canonical: string;
  satisfied_for: string[];
}

interface CareBundleData {
  patient_id: number;
  total_measures: number;
  deduplicated_measures: number;
  overall_compliance_pct: number;
  bundles: PatientBundle[];
  overlap_deductions: OverlapDeduction[];
}

interface CareGapsTabProps {
  patientId: string;
}

// ─── Status badge mapping (Clinical Obsidian v2) ───────────────────────────

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'met':
    case 'closed':
      return 'badge-emerald';
    case 'overdue':
      return 'badge-crimson';
    case 'not_met':
    case 'at_risk':
      return 'badge-amber';
    case 'due_soon':
      return 'bg-amber/15 text-amber/80 text-[10px] font-semibold px-2 py-0.5 rounded-full';
    case 'due':
    case 'ongoing':
      return 'badge-dim';
    case 'na':
      return 'bg-s2 text-ghost/60 text-[10px] font-semibold px-2 py-0.5 rounded-full';
    default:
      return 'badge-dim';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'met': return 'Met';
    case 'not_met': return 'Not Met';
    case 'overdue': return 'Overdue';
    case 'due_soon': return 'Due Soon';
    case 'due': return 'Due';
    case 'ongoing': return 'Ongoing';
    case 'na': return 'N/A';
    case 'at_risk': return 'At Risk';
    case 'open': return 'Open';
    case 'closed': return 'Closed';
    default: return status;
  }
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

// ─── Compliance Ring ────────────────────────────────────────────────────────

function ComplianceRing({ pct, size = 36 }: { pct: number; size?: number }) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color =
    pct >= 80 ? 'var(--clr-emerald)' :
    pct >= 50 ? 'var(--clr-amber)' :
    'var(--clr-crimson)';

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--clr-s2)" strokeWidth={3} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-500"
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        className="font-data text-[9px]"
        fill="var(--clr-bright)"
      >
        {pct}%
      </text>
    </svg>
  );
}

// ─── Measure Row ────────────────────────────────────────────────────────────

function MeasureRow({ measure }: { measure: PatientBundleMeasure }) {
  const borderColor =
    measure.status === 'met' || measure.status === 'closed'
      ? 'border-l-emerald/50'
      : measure.status === 'overdue'
        ? 'border-l-crimson'
        : measure.status === 'not_met' || measure.status === 'at_risk'
          ? 'border-l-amber'
          : 'border-l-edge/30';

  return (
    <div
      className={[
        'rounded-card px-4 py-3 border-l-2 bg-s1 transition-colors',
        borderColor,
        measure.is_deduplicated ? 'opacity-50' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-bright truncate">{measure.measure_name}</p>
            {measure.is_deduplicated && (
              <span className="bg-violet/15 text-violet text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap flex items-center gap-1">
                <Layers size={8} />
                Dedup
              </span>
            )}
          </div>
          <p className="font-data text-[10px] text-ghost mt-0.5">{measure.measure_code}</p>
          {measure.frequency && (
            <p className="text-[10px] text-ghost mt-0.5 flex items-center gap-1">
              <Clock size={8} className="text-ghost/70" />
              {measure.frequency}
            </p>
          )}
          {measure.is_deduplicated && measure.dedup_source && (
            <p className="text-[10px] text-violet/70 mt-0.5">
              Satisfied by {measure.dedup_source}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={statusBadgeClass(measure.status)}>{statusLabel(measure.status)}</span>
          {measure.due_date && (
            <span className="font-data text-[9px] text-ghost tabular-nums">
              Due: {formatDate(measure.due_date)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bundle Accordion ───────────────────────────────────────────────────────

function BundleAccordion({ bundle }: { bundle: PatientBundle }) {
  const [isOpen, setIsOpen] = useState(true);
  const activeCount = bundle.measures.filter((m) => !m.is_deduplicated).length;
  const dedupCount = bundle.measures.filter((m) => m.is_deduplicated).length;

  return (
    <div className="surface">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full group"
      >
        <div className="flex items-center gap-3">
          {isOpen
            ? <ChevronDown size={14} strokeWidth={1.5} className="text-ghost" />
            : <ChevronRight size={14} strokeWidth={1.5} className="text-ghost" />
          }
          <ComplianceRing pct={bundle.compliance_pct} />
          <div className="text-left">
            <h3 className="text-sm font-semibold text-bright group-hover:text-teal transition-colors">
              {bundle.condition_name}
            </h3>
            <p className="font-data text-[10px] text-ghost tabular-nums mt-0.5">
              {bundle.bundle_code} · {bundle.met_count}/{activeCount} met
              {dedupCount > 0 && ` · ${dedupCount} deduplicated`}
            </p>
          </div>
        </div>
        <span className={[
          'font-data text-xs font-semibold tabular-nums',
          bundle.compliance_pct >= 80 ? 'text-emerald' :
          bundle.compliance_pct >= 50 ? 'text-amber' :
          'text-crimson',
        ].join(' ')}>
          {bundle.compliance_pct}%
        </span>
      </button>

      {isOpen && (
        <div className="mt-3 space-y-1.5 animate-fade-up">
          {bundle.measures.map((m) => (
            <MeasureRow key={m.measure_code} measure={m} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CareGapsTab({ patientId }: CareGapsTabProps) {
  const { data, isLoading, error } = usePatientCareBundle(patientId);
  const bundleData = data?.data as CareBundleData | undefined;

  // Loading state
  if (isLoading) {
    return (
      <div className="surface">
        <div className="flex items-center justify-center py-16 gap-3 text-ghost">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Computing care bundles...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="surface">
        <div className="empty-state py-12">
          <AlertCircle size={24} className="text-2xl text-crimson mb-3" />
          <p className="empty-state-title">Failed to load care bundles</p>
          <p className="empty-state-desc">
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </p>
        </div>
      </div>
    );
  }

  // No bundles (patient has no matching conditions)
  if (!bundleData || bundleData.bundles.length === 0) {
    return (
      <div className="surface">
        <div className="empty-state py-12">
          <CheckCircle2 size={24} className="text-2xl text-emerald mb-3" />
          <p className="empty-state-title text-emerald">No condition bundles apply</p>
          <p className="empty-state-desc">
            This patient has no active chronic conditions matching defined care bundles.
          </p>
        </div>
      </div>
    );
  }

  const activeMeasures = bundleData.total_measures - bundleData.deduplicated_measures;

  return (
    <div className="space-y-4">
      {/* Compliance Header */}
      <div className="surface">
        <div className="flex items-center gap-4">
          <ComplianceRing pct={bundleData.overall_compliance_pct} size={52} />
          <div>
            <h2 className="text-base font-semibold text-bright">
              Care Bundle Compliance
            </h2>
            <p className="font-data text-xs text-ghost tabular-nums mt-1">
              {activeMeasures} active measures across {bundleData.bundles.length} condition{bundleData.bundles.length !== 1 ? 's' : ''}
              {bundleData.deduplicated_measures > 0 && (
                <> · <span className="text-violet">{bundleData.deduplicated_measures} deduplicated</span></>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Bundle Accordions */}
      {bundleData.bundles.map((bundle) => (
        <BundleAccordion key={bundle.bundle_code} bundle={bundle} />
      ))}

      {/* Overlap Summary */}
      {bundleData.overlap_deductions.length > 0 && (
        <div className="surface">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={14} strokeWidth={1.5} className="text-violet" />
            <h3 className="text-sm font-semibold text-bright">Cross-Condition Deduplication</h3>
          </div>
          <div className="space-y-2">
            {bundleData.overlap_deductions.map((d, i) => (
              <div key={i} className="rounded-card bg-s1 px-3 py-2">
                <p className="text-xs font-medium text-dim">{d.domain}</p>
                <p className="text-[10px] text-ghost mt-0.5">
                  <span className="text-violet">{d.canonical}</span> satisfies:{' '}
                  {d.satisfied_for.join(', ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
