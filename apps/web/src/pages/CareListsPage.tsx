// =============================================================================
// Medgnosis Web — Care Lists  (Clinical Obsidian v2)
// Population care gap management with status grouping
// =============================================================================

import { useState, useRef, useEffect } from 'react';
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
import { formatDate } from '../utils/time.js';
import { PatientAvatar, getInitials } from '../components/PatientAvatar.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { Pagination } from '../components/Pagination.js';
import { useToast } from '../stores/ui.js';

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
      <PatientAvatar initials={initials} seed={gap.patient_id} size="sm" />

      {/* Patient name + measure */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to={`/patients/${gap.patient_id}`}
            className="text-sm font-medium text-bright hover:text-teal transition-colors truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded"
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
            open ? 'badge-amber' : 'badge-emerald',
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
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald/50',
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

const PER_PAGE_OPTIONS = [25, 50, 100] as const;

export function CareListsPage() {
  const [search, setSearch]             = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [page, setPage]                 = useState(1);
  const [perPage, setPerPage]           = useState<25 | 50 | 100>(25);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    open: true,
    closed: false,
  });
  const [pendingResolveId, setPendingResolveId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const toast       = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Debounce search input ──────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['care-gaps', statusFilter, debouncedSearch, page, perPage],
    queryFn: () => {
      const params = new URLSearchParams({ per_page: String(perPage), page: String(page) });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      return api.get<CareGap[]>(`/care-gaps?${params}`);
    },
  });

  const { mutate: resolveGap, variables: resolvingId } = useMutation({
    mutationFn: (id: number) =>
      api.patch(`/care-gaps/${id}`, { status: 'resolved' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['care-gaps'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Care gap resolved');
      setPendingResolveId(null);
    },
    onError: () => {
      toast.error('Failed to resolve care gap');
      setPendingResolveId(null);
    },
  });

  const careGaps  = data?.data ?? [];
  const meta      = data?.meta as { total?: number; total_pages?: number; page?: number } | undefined;

  // Client-side section split (search is already server-side)
  const openGaps   = careGaps.filter((g) => isOpenStatus(g.status));
  const closedGaps = careGaps.filter((g) => !isOpenStatus(g.status));
  const uniquePatients = new Set(careGaps.map((g) => g.patient_id)).size;

  const totalPages = meta?.total_pages ?? 1;

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const pendingGap = careGaps.find((g) => g.id === pendingResolveId);

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
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card bg-amber/10">
              <AlertCircle size={15} className="text-amber" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-data text-data-lg text-amber tabular-nums leading-none">
                {isLoading ? '—' : openGaps.length.toLocaleString()}
              </p>
              <p className="data-label mt-0.5">Open (this page)</p>
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
              <p className="data-label mt-0.5">Resolved (this page)</p>
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
              <p className="data-label mt-0.5">Patients (this page)</p>
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
            className="input-field pl-9 w-full focus-visible:ring-2 focus-visible:ring-teal/50"
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
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={[
                'px-3 py-1.5 text-xs font-medium font-ui capitalize transition-colors duration-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50',
                statusFilter === s
                  ? 'bg-teal/15 text-teal'
                  : 'text-ghost hover:text-dim hover:bg-s1',
              ].join(' ')}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Per-page selector */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-ghost">Per page:</span>
          <select
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value) as 25 | 50 | 100); setPage(1); }}
            className="input-field text-xs py-1 pr-6 h-auto w-auto"
            aria-label="Results per page"
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Care gap list ────────────────────────────────────────────────── */}
      <div className="surface p-0 overflow-hidden animate-fade-up stagger-3">

        {/* Sticky table header */}
        <div className="sticky top-0 bg-s0 z-10 flex items-center px-4 py-2.5 border-b border-edge/35 select-none">
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

        {!isLoading && careGaps.length === 0 && (
          <div className="empty-state py-16">
            <p className="empty-state-title">No care gaps found</p>
            {debouncedSearch ? (
              <p className="empty-state-desc">
                No results for{' '}
                <span className="text-bright font-medium">"{debouncedSearch}"</span>
              </p>
            ) : (
              <p className="empty-state-desc text-emerald">
                All care gaps are resolved — excellent work!
              </p>
            )}
          </div>
        )}

        {!isLoading && careGaps.length > 0 && (
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
                    colorClass="text-amber"
                  />
                </div>

                {(openSections.open ?? true) &&
                  openGaps.map((gap) => (
                    <CareGapRow
                      key={gap.id}
                      gap={gap}
                      onResolve={(id) => setPendingResolveId(id)}
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
                      onResolve={(id) => setPendingResolveId(id)}
                      resolving={resolvingId === gap.id}
                    />
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="animate-fade-up stagger-4">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={meta?.total}
            perPage={perPage}
            itemLabel="gaps"
            onPageChange={setPage}
          />
        </div>
      )}

      {/* ── Confirm resolve modal ─────────────────────────────────────────── */}
      <ConfirmModal
        open={pendingResolveId !== null}
        title="Mark care gap as resolved?"
        body={
          pendingGap
            ? `This will close the care gap for ${pendingGap.patient_name || 'this patient'}: ${pendingGap.measure || 'Unknown Measure'}.`
            : undefined
        }
        confirmLabel="Resolve"
        confirmVariant="primary"
        onConfirm={() => {
          if (pendingResolveId !== null) resolveGap(pendingResolveId);
        }}
        onCancel={() => setPendingResolveId(null)}
      />
    </div>
  );
}
