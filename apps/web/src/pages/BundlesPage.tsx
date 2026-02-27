// =============================================================================
// Medgnosis Web — Disease Bundles  (Clinical Obsidian v2)
// Population-level bundle performance — 2-column master-detail
// =============================================================================

import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Users,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Layers,
} from 'lucide-react';
import {
  useBundlePopulation,
  useBundlePatients,
  useConditionBundle,
} from '../hooks/useApi.js';
import { PatientAvatar, getInitialsFromParts } from '../components/PatientAvatar.js';
import { Pagination } from '../components/Pagination.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PopulationBundle {
  bundle_key: number;
  bundle_code: string;
  bundle_name: string;
  disease_category: string;
  patient_count: number;
  avg_compliance_pct: number;
  total_open_gaps: number;
  total_closed_gaps: number;
  critical_patients: number;
  high_risk_patients: number;
  bundle_size: number;
  key_ecqm_refs: string | null;
  description: string | null;
}

interface BundlePatient {
  patient_id: number;
  first_name: string;
  last_name: string;
  mrn: string;
  date_of_birth: string | null;
  total_measures: number;
  measures_met: number;
  measures_open: number;
  compliance_pct: number;
  risk_tier: string | null;
}

interface BundleMeasure {
  measure_id: number;
  measure_code: string;
  measure_name: string;
  description: string | null;
  frequency: string | null;
  ecqm_reference: string | null;
  ordinal: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function complianceColor(pct: number): string {
  if (pct >= 75) return '#10C981'; // emerald
  if (pct >= 50) return '#F5A623'; // amber
  return '#E8394A'; // crimson
}

function riskBadgeClass(tier: string | null): string {
  switch (tier?.toLowerCase()) {
    case 'critical': return 'bg-crimson/15 text-crimson';
    case 'high':     return 'bg-amber/15 text-amber';
    case 'medium':   return 'bg-teal/15 text-teal';
    case 'low':      return 'bg-emerald/15 text-emerald';
    default:         return 'bg-s2 text-ghost';
  }
}

// ─── Arc Gauge ────────────────────────────────────────────────────────────────

function ArcGauge({ value, max = 100 }: { value: number; max?: number }) {
  const r = 36;
  const C = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value / max, 0), 1);
  const color = complianceColor(pct * 100);

  return (
    <div className="relative" style={{ width: 140, height: 90 }}>
      <svg viewBox="0 0 100 65" width="140" height="90" aria-hidden="true">
        <circle
          cx="50" cy="60" r={r}
          fill="none" stroke="#172239" strokeWidth="9"
          strokeLinecap="butt"
          strokeDasharray={`${C / 2} ${C / 2}`}
          transform="rotate(-180 50 60)"
        />
        {pct > 0.01 && (
          <circle
            cx="50" cy="60" r={r}
            fill="none" stroke={color} strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${pct * (C / 2) - 3} ${C}`}
            transform="rotate(-180 50 60)"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-end justify-center pb-1">
        <div className="text-center leading-none">
          <p className="font-data text-2xl font-medium tabular-nums leading-none" style={{ color }}>
            {Math.round(pct * 100)}
          </p>
          <p className="data-label mt-0.5">% compliant</p>
        </div>
      </div>
    </div>
  );
}

// ─── Bundle Card (left panel) ─────────────────────────────────────────────────

function BundleCard({
  bundle,
  isSelected,
  onSelect,
}: {
  bundle: PopulationBundle;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const pct = Math.round(bundle.avg_compliance_pct);
  const barColor = complianceColor(pct);

  return (
    <button
      onClick={onSelect}
      className={[
        'w-full text-left rounded-card px-3 py-2.5',
        'border transition-colors duration-100',
        'group flex items-start gap-2.5',
        isSelected
          ? 'bg-s1 border-teal/30 shadow-teal-glow'
          : 'border-edge/20 hover:bg-s1 hover:border-edge/40',
      ].join(' ')}
    >
      {/* Code badge */}
      <span
        className={[
          'flex-shrink-0 inline-flex items-center justify-center',
          'w-10 h-6 rounded text-[10px] font-data font-medium tabular-nums mt-0.5',
          isSelected
            ? 'bg-teal/15 text-teal'
            : 'bg-s2 text-dim group-hover:bg-teal/10 group-hover:text-teal transition-colors',
        ].join(' ')}
      >
        {bundle.bundle_code}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-bright leading-snug line-clamp-1">
          {bundle.bundle_name}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-ghost font-data tabular-nums">
            {bundle.patient_count.toLocaleString()} pts
          </span>
          {/* Mini compliance bar */}
          <div className="flex-1 h-1.5 rounded-full bg-s2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: barColor }}
            />
          </div>
          <span
            className="text-[10px] font-data font-medium tabular-nums flex-shrink-0"
            style={{ color: barColor }}
          >
            {pct}%
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Category Group (collapsible section) ─────────────────────────────────────

function CategoryGroup({
  category,
  bundles,
  selectedCode,
  onSelect,
  defaultOpen,
}: {
  category: string;
  bundles: PopulationBundle[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-s1/50 transition-colors rounded-sm"
      >
        {open ? (
          <ChevronDown size={12} strokeWidth={2} className="text-ghost flex-shrink-0" />
        ) : (
          <ChevronRight size={12} strokeWidth={2} className="text-ghost flex-shrink-0" />
        )}
        <span className="text-xs font-medium text-dim flex-1 truncate">{category}</span>
        <span className="text-[10px] font-data text-ghost tabular-nums">{bundles.length}</span>
      </button>
      {open && (
        <div className="pl-2 pr-1 pb-1 space-y-1">
          {bundles.map((b) => (
            <BundleCard
              key={b.bundle_key}
              bundle={b}
              isSelected={selectedCode === b.bundle_code}
              onSelect={() => onSelect(b.bundle_code)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function BundleDetailPanel({
  bundle,
}: {
  bundle: PopulationBundle;
}) {
  const [patientPage, setPatientPage] = useState(1);
  const perPage = 20;

  // Measures from the EDW bundle endpoint
  const { data: bundleDetail, isLoading: measuresLoading } = useConditionBundle(bundle.bundle_code);
  const measures: BundleMeasure[] = (bundleDetail as { data?: { measures?: BundleMeasure[] } })?.data?.measures ?? [];

  // Patient drilldown from star schema
  const { data: patientsData, isLoading: patientsLoading } = useBundlePatients(bundle.bundle_code, {
    page: patientPage,
    per_page: perPage,
  });
  const patients: BundlePatient[] = (patientsData as { data?: BundlePatient[] })?.data ?? [];
  const patientMeta = (patientsData as { meta?: { total: number; total_pages: number } })?.meta;

  const pct = Math.round(bundle.avg_compliance_pct);

  // Risk distribution
  const totalWithRisk = bundle.critical_patients + bundle.high_risk_patients;
  const otherPatients = Math.max(0, bundle.patient_count - totalWithRisk);

  // eCQM refs as chips
  const ecqmChips = bundle.key_ecqm_refs
    ? bundle.key_ecqm_refs.split(/[,;]\s*/).filter(Boolean)
    : [];

  // Reset page when bundle changes
  useEffect(() => {
    setPatientPage(1);
  }, [bundle.bundle_code]);

  return (
    <div className="space-y-5 animate-fade-up">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-teal/15 text-teal font-data text-xs font-medium tabular-nums">
            {bundle.bundle_code}
          </span>
          <span className="text-[10px] text-ghost font-data">
            {bundle.bundle_size} measures
          </span>
        </div>
        <h2 className="text-xl font-semibold text-bright leading-tight">{bundle.bundle_name}</h2>
        {bundle.description && (
          <p className="text-sm text-dim mt-1.5 leading-relaxed">{bundle.description}</p>
        )}
        {ecqmChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {ecqmChips.map((ref) => (
              <span
                key={ref}
                className="inline-flex items-center px-1.5 py-0.5 rounded bg-s2 text-[10px] font-data text-ghost"
              >
                {ref.trim()}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Gauge + Stats strip ────────────────────────────────────── */}
      <div className="surface">
        <div className="flex items-center gap-6">
          <ArcGauge value={pct} max={100} />

          <div className="flex-1 grid grid-cols-2 gap-3">
            {/* Patients */}
            <div className="rounded-card bg-s0 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Users size={12} strokeWidth={1.5} className="text-violet" />
                <span className="data-label">Patients</span>
              </div>
              <p className="font-data text-data-lg text-bright tabular-nums leading-none">
                {bundle.patient_count.toLocaleString()}
              </p>
            </div>
            {/* Open Gaps */}
            <div className="rounded-card bg-s0 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertCircle size={12} strokeWidth={1.5} className="text-amber" />
                <span className="data-label">Open Gaps</span>
              </div>
              <p className="font-data text-data-lg text-amber tabular-nums leading-none">
                {bundle.total_open_gaps.toLocaleString()}
              </p>
            </div>
            {/* Closed Gaps */}
            <div className="rounded-card bg-s0 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 size={12} strokeWidth={1.5} className="text-emerald" />
                <span className="data-label">Closed</span>
              </div>
              <p className="font-data text-data-lg text-emerald tabular-nums leading-none">
                {bundle.total_closed_gaps.toLocaleString()}
              </p>
            </div>
            {/* Critical */}
            <div className="rounded-card bg-s0 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle size={12} strokeWidth={1.5} className="text-crimson" />
                <span className="data-label">Critical</span>
              </div>
              <p className="font-data text-data-lg text-crimson tabular-nums leading-none">
                {bundle.critical_patients.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Risk Distribution ──────────────────────────────────────── */}
      <div className="surface">
        <h3 className="text-xs font-semibold text-bright mb-3">Risk Distribution</h3>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-3 rounded-full bg-s2 overflow-hidden flex">
            {bundle.patient_count > 0 && (
              <>
                {bundle.critical_patients > 0 && (
                  <div
                    className="h-full bg-crimson"
                    style={{ width: `${(bundle.critical_patients / bundle.patient_count) * 100}%` }}
                    title={`Critical: ${bundle.critical_patients}`}
                  />
                )}
                {bundle.high_risk_patients > 0 && (
                  <div
                    className="h-full bg-amber"
                    style={{ width: `${(bundle.high_risk_patients / bundle.patient_count) * 100}%` }}
                    title={`High: ${bundle.high_risk_patients}`}
                  />
                )}
                {otherPatients > 0 && (
                  <div
                    className="h-full bg-teal/40"
                    style={{ width: `${(otherPatients / bundle.patient_count) * 100}%` }}
                    title={`Other: ${otherPatients}`}
                  />
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-crimson" />
            <span className="text-ghost">Critical</span>
            <span className="font-data text-dim tabular-nums">{bundle.critical_patients}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber" />
            <span className="text-ghost">High</span>
            <span className="font-data text-dim tabular-nums">{bundle.high_risk_patients}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-teal/40" />
            <span className="text-ghost">Other</span>
            <span className="font-data text-dim tabular-nums">{otherPatients}</span>
          </span>
        </div>
      </div>

      {/* ── Measures Table ─────────────────────────────────────────── */}
      <div className="surface">
        <h3 className="text-xs font-semibold text-bright mb-3">
          Bundle Measures
          {!measuresLoading && (
            <span className="ml-2 font-data text-ghost tabular-nums font-normal">{measures.length}</span>
          )}
        </h3>
        {measuresLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-3 w-6 rounded" />
                <div className="skeleton h-3 w-3/5 rounded" />
                <div className="skeleton h-3 w-16 rounded ml-auto" />
              </div>
            ))}
          </div>
        ) : measures.length === 0 ? (
          <p className="text-xs text-ghost py-3">No measures in this bundle</p>
        ) : (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-edge/20">
                  <th className="text-left data-label px-4 py-2 w-8">#</th>
                  <th className="text-left data-label px-4 py-2">Measure</th>
                  <th className="text-left data-label px-4 py-2 w-24">Frequency</th>
                  <th className="text-left data-label px-4 py-2 w-28">eCQM</th>
                </tr>
              </thead>
              <tbody>
                {measures.map((m) => (
                  <tr key={m.measure_id} className="border-b border-edge/10 hover:bg-s1/50 transition-colors">
                    <td className="px-4 py-2 font-data text-ghost tabular-nums">{m.ordinal}</td>
                    <td className="px-4 py-2 text-dim">
                      <span className="font-medium text-bright">{m.measure_name}</span>
                      {m.description && (
                        <span className="ml-1.5 text-ghost">&mdash; {m.description}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-ghost capitalize">{m.frequency ?? '—'}</td>
                    <td className="px-4 py-2 font-data text-ghost tabular-nums">{m.ecqm_reference ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Patient Drilldown ──────────────────────────────────────── */}
      <div className="surface">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-bright">
            Patients
            {patientMeta && (
              <span className="ml-2 font-data text-ghost tabular-nums font-normal">
                {patientMeta.total.toLocaleString()} total
              </span>
            )}
          </h3>
          <span className="text-[10px] text-ghost">Sorted by lowest compliance</span>
        </div>

        {patientsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <div className="skeleton w-8 h-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <div className="skeleton h-3 w-32 rounded" />
                  <div className="skeleton h-2 w-20 rounded" />
                </div>
                <div className="skeleton h-3 w-12 rounded" />
              </div>
            ))}
          </div>
        ) : patients.length === 0 ? (
          <p className="text-xs text-ghost py-4 text-center">No patients in this bundle</p>
        ) : (
          <>
            <div className="overflow-x-auto -mx-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-edge/20">
                    <th className="text-left data-label px-4 py-2">Patient</th>
                    <th className="text-left data-label px-4 py-2 w-20">MRN</th>
                    <th className="text-left data-label px-4 py-2 w-20">Progress</th>
                    <th className="text-left data-label px-4 py-2 w-28">Compliance</th>
                    <th className="text-left data-label px-4 py-2 w-20">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => {
                    const pctVal = Math.round(p.compliance_pct);
                    return (
                      <tr key={p.patient_id} className="border-b border-edge/10 hover:bg-s1/50 transition-colors">
                        <td className="px-4 py-2">
                          <Link
                            to={`/patients/${p.patient_id}`}
                            className="flex items-center gap-2.5 group"
                          >
                            <PatientAvatar
                              initials={getInitialsFromParts(p.first_name, p.last_name)}
                              seed={p.patient_id}
                              size="sm"
                            />
                            <span className="font-medium text-bright group-hover:text-teal transition-colors">
                              {p.last_name}, {p.first_name}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-2 font-data text-ghost tabular-nums">{p.mrn}</td>
                        <td className="px-4 py-2">
                          <span className="font-data tabular-nums text-dim">
                            {p.measures_met}/{p.total_measures}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-s2 overflow-hidden max-w-[60px]">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.max(pctVal, 2)}%`,
                                  backgroundColor: complianceColor(pctVal),
                                }}
                              />
                            </div>
                            <span
                              className="font-data tabular-nums text-[10px] font-medium"
                              style={{ color: complianceColor(pctVal) }}
                            >
                              {pctVal}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {p.risk_tier && (
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-data font-medium capitalize ${riskBadgeClass(p.risk_tier)}`}
                            >
                              {p.risk_tier}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {patientMeta && patientMeta.total_pages > 1 && (
              <div className="mt-4">
                <Pagination
                  currentPage={patientPage}
                  totalPages={patientMeta.total_pages}
                  onPageChange={setPatientPage}
                  totalItems={patientMeta.total}
                  perPage={perPage}
                  itemLabel="patients"
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Left Panel Skeleton ──────────────────────────────────────────────────────

function LeftPanelSkeleton() {
  return (
    <div className="p-3 space-y-3">
      {Array.from({ length: 4 }).map((_, g) => (
        <div key={g}>
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="skeleton h-2.5 w-2.5 rounded" />
            <div className="skeleton h-3 w-28 rounded" />
            <div className="skeleton h-2.5 w-4 rounded ml-auto" />
          </div>
          <div className="pl-2 pr-1 space-y-1">
            {Array.from({ length: g === 0 ? 3 : 2 }).map((_, i) => (
              <div key={i} className="rounded-card px-3 py-2.5 bg-s1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="skeleton h-5 w-10 rounded" />
                  <div className="skeleton h-3 w-3/5 rounded" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="skeleton h-2 w-10 rounded" />
                  <div className="skeleton h-1.5 flex-1 rounded-full" />
                  <div className="skeleton h-2 w-6 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Right Panel Skeleton ─────────────────────────────────────────────────────

function RightPanelSkeleton() {
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="skeleton h-5 w-12 rounded" />
          <div className="skeleton h-3 w-20 rounded" />
        </div>
        <div className="skeleton h-7 w-3/4 rounded" />
        <div className="skeleton h-3 w-full rounded" />
      </div>
      <div className="surface">
        <div className="flex items-center gap-6">
          <div className="skeleton w-[140px] h-[90px] rounded-full" />
          <div className="flex-1 grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-card bg-s0 px-3 py-2.5 space-y-1.5">
                <div className="skeleton h-2.5 w-16 rounded" />
                <div className="skeleton h-5 w-12 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="surface space-y-2">
        <div className="skeleton h-3 w-32 rounded" />
        <div className="skeleton h-3 w-full rounded-full" />
      </div>
    </div>
  );
}

// ─── BundlesPage ──────────────────────────────────────────────────────────────

export function BundlesPage() {
  const [search, setSearch] = useState('');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const { data, isLoading } = useBundlePopulation();

  const bundles: PopulationBundle[] = (data as { data?: { bundles?: PopulationBundle[] } })?.data?.bundles ?? [];
  const summary = (data as { data?: { summary?: { total_bundles: number; total_patients: number; avg_compliance: number; total_open_gaps: number; total_closed_gaps: number } } })?.data?.summary;

  // Group bundles by disease_category
  const grouped = useMemo(() => {
    const map = new Map<string, PopulationBundle[]>();
    for (const b of bundles) {
      const cat = b.disease_category || 'Uncategorized';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(b);
    }
    // Sort categories by total patient count descending
    return [...map.entries()].sort((a, b) => {
      const aCount = a[1].reduce((s, x) => s + x.patient_count, 0);
      const bCount = b[1].reduce((s, x) => s + x.patient_count, 0);
      return bCount - aCount;
    });
  }, [bundles]);

  // Search filter
  const filteredGrouped = useMemo(() => {
    if (!search.trim()) return grouped;
    const s = search.toLowerCase();
    return grouped
      .map(([cat, items]) => {
        const filtered = items.filter(
          (b) =>
            b.bundle_name.toLowerCase().includes(s) ||
            b.bundle_code.toLowerCase().includes(s) ||
            b.disease_category.toLowerCase().includes(s),
        );
        return [cat, filtered] as [string, PopulationBundle[]];
      })
      .filter(([, items]) => items.length > 0);
  }, [grouped, search]);

  // Auto-select first bundle on load
  useEffect(() => {
    if (!selectedCode && bundles.length > 0) {
      setSelectedCode(bundles[0].bundle_code);
    }
  }, [bundles, selectedCode]);

  const selectedBundle = bundles.find((b) => b.bundle_code === selectedCode);

  // Total filtered count
  const filteredCount = filteredGrouped.reduce((s, [, items]) => s + items.length, 0);

  return (
    <div className="flex h-[calc(100vh-7.5rem)] -m-6 overflow-hidden">

      {/* ── Bundle list (left) ─────────────────────────────────────── */}
      <div className="w-[340px] flex-shrink-0 flex flex-col border-r border-edge/35 bg-s0">

        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-edge/25 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Layers size={16} strokeWidth={1.5} className="text-teal flex-shrink-0" />
            <h1 className="text-base font-semibold text-bright">Disease Bundles</h1>
            {!isLoading && summary && (
              <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded bg-s2 text-[10px] font-data text-ghost tabular-nums">
                {summary.total_bundles}
              </span>
            )}
          </div>
          {!isLoading && summary && (
            <p className="text-[10px] text-ghost mt-0.5 font-data tabular-nums">
              {summary.total_patients.toLocaleString()} patients &middot; {summary.avg_compliance}% avg compliance
            </p>
          )}
          <div className="relative mt-3">
            <Search
              size={13}
              strokeWidth={1.5}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ghost pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Search bundles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-8 w-full text-sm"
              autoComplete="off"
              spellCheck={false}
              aria-label="Search bundles"
            />
          </div>
        </div>

        {/* Filter count */}
        {search && (
          <div className="px-5 py-2 border-b border-edge/20 flex-shrink-0">
            <p className="text-xs text-dim">
              <span className="font-data text-bright tabular-nums">{filteredCount}</span>
              {' '}of {bundles.length} bundles
            </p>
          </div>
        )}

        {/* Category groups */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <LeftPanelSkeleton />
          ) : filteredGrouped.length === 0 ? (
            <div className="py-12 px-5 text-center">
              <p className="text-sm text-dim">No bundles found</p>
              {search && (
                <p className="text-xs text-ghost mt-1">Try a different search term</p>
              )}
            </div>
          ) : (
            <div className="py-2 space-y-0.5">
              {filteredGrouped.map(([category, items]) => (
                <CategoryGroup
                  key={category}
                  category={category}
                  bundles={items}
                  selectedCode={selectedCode}
                  onSelect={setSelectedCode}
                  defaultOpen={items.some((b) => b.bundle_code === selectedCode) || !search}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail panel (right) ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-void">
        {isLoading ? (
          <div className="p-6">
            <RightPanelSkeleton />
          </div>
        ) : selectedBundle ? (
          <div className="p-6">
            <BundleDetailPanel key={selectedBundle.bundle_code} bundle={selectedBundle} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-14 h-14 rounded-full bg-s1 flex items-center justify-center">
              <Activity size={24} strokeWidth={1.5} className="text-ghost" />
            </div>
            <p className="text-sm font-medium text-dim">Select a bundle</p>
            <p className="text-xs text-ghost">
              Choose a disease bundle to view population performance
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
