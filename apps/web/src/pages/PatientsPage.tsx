// =============================================================================
// Medgnosis Web — Patients  (Clinical Obsidian v2)
// Population patient browser with avatar table and numbered pagination
// =============================================================================

import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users,
  Search,
  ChevronRight,
  ArrowUpDown,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '../services/api.js';
import { formatDate, calcAge } from '../utils/time.js';
import { PatientAvatar, getInitialsFromParts } from '../components/PatientAvatar.js';
import { Pagination } from '../components/Pagination.js';
import { QueryError } from '../components/QueryError.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientRow {
  id: number;
  first_name: string;
  last_name: string;
  mrn: string;
  date_of_birth: string;
  gender: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGender(g: string): string {
  if (!g) return '—';
  if (g.toUpperCase().startsWith('M')) return 'Male';
  if (g.toUpperCase().startsWith('F')) return 'Female';
  return g;
}

type RiskFilter = 'low' | 'moderate' | 'high' | 'critical';
type CohortFilter = 'eligible' | 'compliant' | 'noncompliant';

function normalizeRiskParam(value: string | null): RiskFilter | undefined {
  const normalized = value?.toLowerCase();
  if (normalized === 'medium' || normalized === 'moderate') return 'moderate';
  if (normalized === 'low' || normalized === 'high' || normalized === 'critical') return normalized;
  return undefined;
}

function normalizeCohortParam(value: string | null): CohortFilter | undefined {
  const normalized = value?.toLowerCase();
  if (normalized === 'eligible' || normalized === 'compliant' || normalized === 'noncompliant') return normalized;
  return undefined;
}

function formatRiskFilter(risk: RiskFilter): string {
  return `${risk.charAt(0).toUpperCase()}${risk.slice(1)} risk`;
}

function formatCohortFilter(cohort: CohortFilter): string {
  if (cohort === 'noncompliant') return 'Non-compliant';
  return `${cohort.charAt(0).toUpperCase()}${cohort.slice(1)}`;
}

// ─── PatientsPage ─────────────────────────────────────────────────────────────

export function PatientsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [page, setPage]     = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const riskLevel = normalizeRiskParam(searchParams.get('risk_level') ?? searchParams.get('risk'));
  const measure = searchParams.get('measure')?.trim() || undefined;
  const cohort = normalizeCohortParam(searchParams.get('cohort'));
  const hasUrlFilters = Boolean(riskLevel || measure);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [riskLevel, measure, cohort]);

  const clearUrlFilter = (filter: 'risk' | 'measure') => {
    const next = new URLSearchParams(searchParams);
    if (filter === 'risk') {
      next.delete('risk');
      next.delete('risk_level');
    } else {
      next.delete('measure');
      next.delete('cohort');
    }
    setSearchParams(next);
    setPage(1);
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['patients', debouncedSearch, page, riskLevel, measure, cohort],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), per_page: '20' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (riskLevel) params.set('risk_level', riskLevel);
      if (measure) params.set('measure', measure);
      if (measure && cohort) params.set('cohort', cohort);
      return api.get<PatientRow[]>(`/patients?${params}`);
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const patients   = data?.data ?? [];
  const meta       = data?.meta;
  const totalPages = meta?.total_pages ?? 1;
  const from       = meta ? (meta.page - 1) * meta.per_page + 1 : 1;
  const to         = meta ? Math.min(meta.page * meta.per_page, meta.total) : patients.length;

  return (
    <div className="space-y-5">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold text-bright">Patient Management</h1>
        <p className="text-sm text-dim mt-0.5">
          Browse and search the full patient population
        </p>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <div className="surface animate-fade-up stagger-1 p-0 overflow-hidden">
        <div className="flex items-stretch divide-x divide-edge/25">

          {/* Total patients */}
          <div className="flex items-center gap-3 px-4 py-2 flex-1 min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-card bg-teal/10">
              <Users size={15} className="text-teal" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-data text-data-lg text-bright tabular-nums leading-none">
                {isLoading ? <span className="skeleton h-5 w-24 rounded inline-block" /> : (meta?.total ?? 0).toLocaleString()}
              </p>
              <p className="data-label mt-0.5">Total Patients</p>
            </div>
          </div>

          {/* Showing range */}
          <div className="flex items-center gap-3 px-4 py-2 flex-1 min-w-0">
            <div>
              <p className="font-data text-data-lg text-bright tabular-nums leading-none">
                {isLoading
                  ? <span className="skeleton h-5 w-20 rounded inline-block" />
                  : `${from.toLocaleString()}–${to.toLocaleString()}`
                }
              </p>
              <p className="data-label mt-0.5">Showing</p>
            </div>
          </div>

          {/* Current page / total pages */}
          <div className="flex items-center gap-3 px-4 py-2 flex-1 min-w-0">
            <div>
              <p className="font-data text-data-lg text-bright tabular-nums leading-none">
                {isLoading
                  ? <span className="skeleton h-5 w-16 rounded inline-block" />
                  : `${meta?.page ?? 1} / ${(totalPages).toLocaleString()}`
                }
              </p>
              <p className="data-label mt-0.5">Page</p>
            </div>
          </div>

          {/* Per page */}
          <div className="flex items-center gap-3 px-4 py-2 flex-1 min-w-0">
            <div>
              <p className="font-data text-data-lg text-bright tabular-nums leading-none">
                {meta?.per_page ?? 20}
              </p>
              <p className="data-label mt-0.5">Per Page</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Search toolbar ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 animate-fade-up stagger-2">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={14}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ghost pointer-events-none"
            aria-hidden="true"
          />
          <Input
            type="text"
            placeholder="Search by name or MRN..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search patients"
          />
        </div>
        {riskLevel && (
          <button
            type="button"
            onClick={() => clearUrlFilter('risk')}
            className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-card border border-edge/50 bg-s1 px-3 text-xs font-medium text-bright hover:border-teal/50 hover:text-teal transition-colors"
            aria-label="Clear risk filter"
          >
            <span className="truncate">{formatRiskFilter(riskLevel)}</span>
            <X size={13} strokeWidth={1.7} aria-hidden="true" />
          </button>
        )}
        {measure && (
          <button
            type="button"
            onClick={() => clearUrlFilter('measure')}
            className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-card border border-edge/50 bg-s1 px-3 text-xs font-medium text-bright hover:border-teal/50 hover:text-teal transition-colors"
            aria-label="Clear measure filter"
          >
            <span className="max-w-[220px] truncate">{measure}{cohort ? ` · ${formatCohortFilter(cohort)}` : ''}</span>
            <X size={13} strokeWidth={1.7} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* ── Patient table ────────────────────────────────────────────────── */}
      {/* Real <table>: columns size to their content (no crushed/wrapping
          cells), every column stays visible, and on a narrow viewport the
          table scrolls horizontally rather than dropping columns. */}
      <div className="surface p-0 overflow-hidden animate-fade-up stagger-3">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-edge/35">
              <TableHead>
                <span className="inline-flex items-center gap-1.5">
                  Patient
                  <ArrowUpDown size={10} strokeWidth={2} className="text-ghost/50" aria-hidden="true" />
                </span>
              </TableHead>
              <TableHead>MRN</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1.5">
                  DOB
                  <ArrowUpDown size={10} strokeWidth={2} className="text-ghost/50" aria-hidden="true" />
                </span>
              </TableHead>
              <TableHead className="text-right">Age</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead className="w-8" aria-label="Open" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {/* ── Skeleton rows ───────────────────────────────────────── */}
            {isLoading &&
              Array.from({ length: 12 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="skeleton w-7 h-7 rounded-full flex-shrink-0" />
                      <div className="skeleton h-3 w-40 rounded" />
                    </div>
                  </TableCell>
                  <TableCell><div className="skeleton h-3 w-20 rounded" /></TableCell>
                  <TableCell><div className="skeleton h-3 w-24 rounded" /></TableCell>
                  <TableCell><div className="skeleton h-3 w-8 rounded ml-auto" /></TableCell>
                  <TableCell><div className="skeleton h-3 w-12 rounded" /></TableCell>
                  <TableCell />
                </TableRow>
              ))}

            {/* ── Data rows ───────────────────────────────────────────── */}
            {!isLoading && !isError &&
              patients.map((p) => {
                const age    = calcAge(p.date_of_birth);
                const dob    = formatDate(p.date_of_birth);
                const gender = formatGender(p.gender);

                return (
                  <TableRow
                    key={p.id}
                    onClick={() => navigate(`/patients/${p.id}`)}
                    className="cursor-pointer border-l-2 border-l-transparent hover:border-l-teal group"
                  >
                    {/* Patient — avatar + name */}
                    <TableCell>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PatientAvatar
                          initials={getInitialsFromParts(p.first_name, p.last_name)}
                          seed={p.id}
                          size="xs"
                        />
                        <span className="font-medium text-bright whitespace-nowrap group-hover:text-teal transition-colors duration-100">
                          {p.last_name}, {p.first_name}
                        </span>
                      </div>
                    </TableCell>

                    {/* MRN */}
                    <TableCell className="font-data text-xs text-dim tabular-nums whitespace-nowrap">
                      {p.mrn || '—'}
                    </TableCell>

                    {/* DOB */}
                    <TableCell className="font-data text-xs text-bright tabular-nums whitespace-nowrap">
                      {dob}
                    </TableCell>

                    {/* Age */}
                    <TableCell className="font-data text-xs text-dim tabular-nums text-right whitespace-nowrap">
                      {age !== null ? `${age}` : '—'}
                    </TableCell>

                    {/* Gender */}
                    <TableCell className="text-xs text-dim whitespace-nowrap">
                      {gender}
                    </TableCell>

                    {/* Chevron */}
                    <TableCell className="w-8">
                      <ChevronRight
                        size={15}
                        strokeWidth={1.5}
                        className="text-ghost group-hover:text-teal transition-colors duration-100"
                        aria-hidden="true"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>

        {/* ── Error state ───────────────────────────────────────────── */}
        {/* Must win over the empty state: a failed fetch must never read as
            "No patients found" (silently empty population). */}
        {!isLoading && isError && (
          <div className="p-4">
            <QueryError what="the patient population" onRetry={() => void refetch()} />
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────── */}
        {!isLoading && !isError && patients.length === 0 && (
          <div className="empty-state py-16">
            <p className="empty-state-title">No patients found</p>
            {search ? (
              <p className="empty-state-desc">
                No results for{' '}
                <span className="text-bright font-medium">&quot;{search}&quot;</span>.
                Try a different name or MRN.
              </p>
            ) : hasUrlFilters ? (
              <p className="empty-state-desc">
                No patients match the active filters.
              </p>
            ) : (
              <p className="empty-state-desc">
                No patients are available in the system.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {meta && (
        <div className="animate-fade-up stagger-4">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={meta.total}
            perPage={meta.per_page}
            itemLabel="patients"
          />
        </div>
      )}
    </div>
  );
}
