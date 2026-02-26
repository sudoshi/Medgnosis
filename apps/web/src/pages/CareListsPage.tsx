// =============================================================================
// Medgnosis Web — Care Lists  (Clinical Obsidian v2)
// Population care gap management with status grouping
// =============================================================================

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ListChecks,
  Search,
  ChevronDown,
  Check,
  AlertCircle,
  Clock,
  Users,
} from 'lucide-react';
import { api } from '../services/api.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CareGap {
  id: number;
  patient_id: number;
  patient_name: string;
  measure: string | null;
  status: string;
  identified_date: string;
  resolved_date: string | null;
  active_ind: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  'bg-teal/20 text-teal',
  'bg-violet/20 text-violet',
  'bg-amber/20 text-amber',
  'bg-emerald/20 text-emerald',
  'bg-crimson/20 text-crimson',
];

function avatarColor(id: number): string {
  return AVATAR_PALETTE[id % AVATAR_PALETTE.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function formatDate(dateStr: string): string {
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

function isOpenStatus(status: string): boolean {
  const s = status?.toLowerCase() ?? '';
  return s === 'open' || s === 'identified' || s === 'in_progress';
}

// ─── Section header with collapse toggle ─────────────────────────────────────

function SectionHeader({
  label,
  count,
  open,
  onToggle,
  colorClass = 'text-bright',
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  colorClass?: string;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 py-2 group select-none"
      aria-expanded={open}
    >
      <span
        className={[
          'text-ghost transition-transform duration-150',
          open ? 'rotate-0' : '-rotate-90',
        ].join(' ')}
      >
        <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span className={`text-xs font-semibold uppercase tracking-widest font-ui ${colorClass}`}>
        {label}
      </span>
      <span className="font-data text-xs text-ghost tabular-nums">
        {count.toLocaleString()}
      </span>
      <div className="flex-1 h-px bg-edge/20" aria-hidden="true" />
    </button>
  );
}

// ─── CareGapRow ───────────────────────────────────────────────────────────────

function CareGapRow({
  gap,
  onResolve,
  resolving,
}: {
  gap: CareGap;
  onResolve: (id: number) => void;
  resolving: boolean;
}) {
  const initials = getInitials(gap.patient_name || `P${gap.patient_id}`);
  const color    = avatarColor(gap.patient_id);
  const open     = isOpenStatus(gap.status);

  return (
    <div
      className={[
        'flex items-center gap-3 px-4 py-3 border-b border-edge/15',
        'border-l-2',
        open ? 'border-l-transparent hover:border-l-teal' : 'border-l-transparent',
        'hover:bg-s1 transition-colors duration-100 group',
      ].join(' ')}
    >
      {/* Patient avatar */}
      <div
        className={[
          'flex-shrink-0 flex items-center justify-center',
          'w-8 h-8 rounded-full text-xs font-semibold font-ui',
          color,
        ].join(' ')}
        aria-hidden="true"
      >
        {initials}
      </div>

      {/* Patient name + measure */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to={`/patients/${gap.patient_id}`}
            className="text-sm font-medium text-bright hover:text-teal transition-colors truncate"
          >
            {gap.patient_name || `Patient ${gap.patient_id}`}
          </Link>
        </div>
        <p className="text-xs text-dim mt-0.5 truncate">
          {gap.measure || 'Unknown Measure'}
        </p>
      </div>

      {/* Identified date */}
      <div className="hidden md:block flex-shrink-0 w-[120px]">
        <p className="font-data text-xs text-ghost tabular-nums">
          {formatDate(gap.identified_date)}
        </p>
      </div>

      {/* Status badge */}
      <div className="flex-shrink-0 w-[90px] flex justify-center">
        <span
          className={[
            'badge',
            open ? 'badge-crimson' : 'badge-emerald',
          ].join(' ')}
        >
          {gap.status || 'open'}
        </span>
      </div>

      {/* Resolve button (open gaps only) */}
      <div className="flex-shrink-0 w-20 flex justify-end">
        {open ? (
          <button
            onClick={() => onResolve(gap.id)}
            disabled={resolving}
            className={[
              'flex items-center gap-1 px-2.5 py-1 rounded-btn text-xs font-ui',
              'border border-emerald/30 text-emerald bg-emerald/5',
              'hover:bg-emerald/15 hover:border-emerald/50',
              'transition-colors duration-100',
              resolving ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
            aria-label="Mark as resolved"
          >
            <Check size={11} strokeWidth={2} aria-hidden="true" />
            Resolve
          </button>
        ) : (
          <span className="font-data text-[10px] text-ghost tabular-nums">
            {formatDate(gap.resolved_date ?? '')}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── CareListsPage ────────────────────────────────────────────────────────────

export function CareListsPage() {
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    open: true,
    closed: false,
  });

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['care-gaps', statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ per_page: '100' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      return api.get<CareGap[]>(`/care-gaps?${params}`);
    },
  });

  const { mutate: resolveGap, variables: resolvingId } = useMutation({
    mutationFn: (id: number) =>
      api.patch(`/care-gaps/${id}`, { status: 'resolved' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['care-gaps'] });
    },
  });

  const careGaps  = data?.data ?? [];
  const meta      = data?.meta;

  const filtered = useMemo(() => {
    if (!search.trim()) return careGaps;
    const s = search.toLowerCase();
    return careGaps.filter(
      (g) =>
        g.patient_name?.toLowerCase().includes(s) ||
        g.measure?.toLowerCase().includes(s),
    );
  }, [careGaps, search]);

  const openGaps   = filtered.filter((g) => isOpenStatus(g.status));
  const closedGaps = filtered.filter((g) => !isOpenStatus(g.status));
  const uniquePatients = new Set(careGaps.map((g) => g.patient_id)).size;

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="space-y-5">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold text-bright">Care Lists</h1>
        <p className="text-sm text-dim mt-0.5">
          Manage open care gaps across the patient population
        </p>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <div className="surface animate-fade-up stagger-1 p-0 overflow-hidden">
        <div className="flex items-stretch divide-x divide-edge/25">

          {/* Total gaps */}
          <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card bg-teal/10">
              <ListChecks size={15} className="text-teal" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-data text-data-lg text-bright tabular-nums leading-none">
                {isLoading ? '—' : (meta?.total ?? 0).toLocaleString()}
              </p>
              <p className="data-label mt-0.5">Total Gaps</p>
            </div>
          </div>

          {/* Open */}
          <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card bg-crimson/10">
              <AlertCircle size={15} className="text-crimson" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-data text-data-lg text-crimson tabular-nums leading-none">
                {isLoading ? '—' : openGaps.length.toLocaleString()}
              </p>
              <p className="data-label mt-0.5">Open</p>
            </div>
          </div>

          {/* Resolved */}
          <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card bg-emerald/10">
              <Clock size={15} className="text-emerald" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-data text-data-lg text-emerald tabular-nums leading-none">
                {isLoading ? '—' : closedGaps.length.toLocaleString()}
              </p>
              <p className="data-label mt-0.5">Resolved</p>
            </div>
          </div>

          {/* Patients */}
          <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card bg-violet/10">
              <Users size={15} className="text-violet" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-data text-data-lg text-bright tabular-nums leading-none">
                {isLoading ? '—' : uniquePatients.toLocaleString()}
              </p>
              <p className="data-label mt-0.5">Patients</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 animate-fade-up stagger-2">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={14}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ghost pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Search by patient or measure..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9 w-full"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search care gaps"
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center border border-edge/35 rounded-card overflow-hidden">
          {(['all', 'open', 'resolved'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={[
                'px-3 py-1.5 text-xs font-medium font-ui capitalize transition-colors duration-100',
                statusFilter === s
                  ? 'bg-teal/15 text-teal'
                  : 'text-ghost hover:text-dim hover:bg-s1',
              ].join(' ')}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Care gap list ────────────────────────────────────────────────── */}
      <div className="surface p-0 overflow-hidden animate-fade-up stagger-3">

        {/* Table header */}
        <div className="flex items-center px-4 py-2.5 border-b border-edge/35 select-none">
          <div className="w-8 flex-shrink-0 mr-3" /> {/* avatar */}
          <div className="flex-1 data-label">Patient / Measure</div>
          <div className="hidden md:block w-[120px] flex-shrink-0 data-label">Identified</div>
          <div className="w-[90px] flex-shrink-0 data-label text-center">Status</div>
          <div className="w-20 flex-shrink-0" />
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 border-b border-edge/15"
              >
                <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="skeleton h-3 w-36 rounded" />
                  <div className="skeleton h-2.5 w-48 rounded" />
                </div>
                <div className="hidden md:block w-[120px] flex-shrink-0">
                  <div className="skeleton h-3 w-24 rounded" />
                </div>
                <div className="w-[90px] flex-shrink-0">
                  <div className="skeleton h-5 w-16 rounded-pill mx-auto" />
                </div>
                <div className="w-20 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="empty-state py-16">
            <p className="empty-state-title">No care gaps found</p>
            {search ? (
              <p className="empty-state-desc">
                No results for{' '}
                <span className="text-bright font-medium">"{search}"</span>
              </p>
            ) : (
              <p className="empty-state-desc text-emerald">
                All care gaps are resolved — excellent work!
              </p>
            )}
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div>
            {/* ── Open gaps section ────────────────────────────────── */}
            {openGaps.length > 0 && (
              <div>
                <div className="px-4 py-1 border-b border-edge/15">
                  <SectionHeader
                    label="Open"
                    count={openGaps.length}
                    open={openSections.open ?? true}
                    onToggle={() => toggleSection('open')}
                    colorClass="text-crimson"
                  />
                </div>

                {(openSections.open ?? true) &&
                  openGaps.map((gap) => (
                    <CareGapRow
                      key={gap.id}
                      gap={gap}
                      onResolve={resolveGap}
                      resolving={resolvingId === gap.id}
                    />
                  ))}
              </div>
            )}

            {/* ── Resolved gaps section ───────────────────────────── */}
            {closedGaps.length > 0 && (
              <div>
                <div className="px-4 py-1 border-b border-edge/15">
                  <SectionHeader
                    label="Resolved"
                    count={closedGaps.length}
                    open={openSections.closed ?? false}
                    onToggle={() => toggleSection('closed')}
                    colorClass="text-emerald"
                  />
                </div>

                {(openSections.closed ?? false) &&
                  closedGaps.map((gap) => (
                    <CareGapRow
                      key={gap.id}
                      gap={gap}
                      onResolve={resolveGap}
                      resolving={resolvingId === gap.id}
                    />
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pagination info */}
      {meta && meta.total > careGaps.length && (
        <div className="flex items-center justify-between text-xs text-ghost animate-fade-up stagger-4">
          <p className="font-data tabular-nums">
            Showing {careGaps.length.toLocaleString()} of {meta.total.toLocaleString()} gaps
          </p>
          <p>
            Use status filters or search to narrow results
          </p>
        </div>
      )}
    </div>
  );
}
