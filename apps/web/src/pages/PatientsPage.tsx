// =============================================================================
// Medgnosis Web — Patients  (Clinical Obsidian v2)
// Population patient browser with avatar table and numbered pagination
// =============================================================================

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users,
  Search,
  ChevronRight,
  ChevronLeft,
  ArrowUpDown,
} from 'lucide-react';
import { api } from '../services/api.js';

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

function getInitials(first: string, last: string): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

function formatDOB(dob: string): string {
  if (!dob) return '—';
  try {
    return new Date(dob).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function calcAge(dob: string): number | null {
  if (!dob) return null;
  try {
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  } catch {
    return null;
  }
}

function formatGender(g: string): string {
  if (!g) return '—';
  if (g.toUpperCase().startsWith('M')) return 'Male';
  if (g.toUpperCase().startsWith('F')) return 'Female';
  return g;
}

// ─── Pagination range ─────────────────────────────────────────────────────────
// Returns up to 7 items: page numbers + '…' ellipsis placeholders

function getPaginationRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) {
    return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '…', current - 1, current, current + 1, '…', total];
}

// ─── PatientsPage ─────────────────────────────────────────────────────────────

export function PatientsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage]     = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['patients', search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), per_page: '20' });
      if (search) params.set('search', search);
      return api.get<PatientRow[]>(`/patients?${params}`);
    },
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
          <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
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
          <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
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
          <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
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
          <div className="flex items-center gap-3 px-5 py-3 flex-1 min-w-0">
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
            placeholder="Search by name or MRN..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="input-field pl-9 w-full"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search patients"
          />
        </div>
      </div>

      {/* ── Patient table ────────────────────────────────────────────────── */}
      <div className="surface p-0 overflow-hidden animate-fade-up stagger-3">

        {/* ── Sticky column headers ─────────────────────────────────── */}
        <div className="flex items-center px-4 py-2.5 border-b border-edge/35 sticky top-0 bg-s0 z-10 select-none">
          <div className="flex-[2.5] flex items-center gap-1.5 data-label">
            Patient
            <ArrowUpDown size={10} strokeWidth={2} className="text-ghost/50" aria-hidden="true" />
          </div>
          <div className="w-[130px] flex-shrink-0 data-label hidden sm:block">MRN</div>
          <div className="w-[140px] flex-shrink-0 data-label hidden md:flex items-center gap-1.5">
            DOB / Age
            <ArrowUpDown size={10} strokeWidth={2} className="text-ghost/50" aria-hidden="true" />
          </div>
          <div className="w-[90px] flex-shrink-0 data-label hidden lg:block">Gender</div>
          <div className="w-8 flex-shrink-0" />
        </div>

        {/* ── Skeleton rows ─────────────────────────────────────────── */}
        {isLoading && (
          <div aria-label="Loading patients" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center px-4 py-3 border-b border-edge/15"
              >
                <div className="flex-[2.5] flex items-center gap-3">
                  <div className="skeleton w-9 h-9 rounded-full flex-shrink-0" />
                  <div className="space-y-1.5 min-w-0">
                    <div className="skeleton h-3 w-40 rounded" />
                    <div className="skeleton h-2.5 w-24 rounded" />
                  </div>
                </div>
                <div className="w-[130px] flex-shrink-0 hidden sm:block">
                  <div className="skeleton h-3 w-20 rounded" />
                </div>
                <div className="w-[140px] flex-shrink-0 hidden md:block space-y-1.5">
                  <div className="skeleton h-3 w-28 rounded" />
                  <div className="skeleton h-2.5 w-12 rounded" />
                </div>
                <div className="w-[90px] flex-shrink-0 hidden lg:block">
                  <div className="skeleton h-3 w-12 rounded" />
                </div>
                <div className="w-8 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}

        {/* ── Data rows ─────────────────────────────────────────────── */}
        {!isLoading && patients.length > 0 && (
          <div>
            {patients.map((p) => {
              const initials = getInitials(p.first_name, p.last_name);
              const color    = avatarColor(p.id);
              const age      = calcAge(p.date_of_birth);
              const dob      = formatDOB(p.date_of_birth);
              const gender   = formatGender(p.gender);

              return (
                <Link
                  key={p.id}
                  to={`/patients/${p.id}`}
                  className={[
                    'flex items-center px-4 py-3 border-b border-edge/15',
                    'border-l-2 border-l-transparent',
                    'hover:border-l-teal hover:bg-s1',
                    'transition-colors duration-100 group',
                  ].join(' ')}
                >
                  {/* Patient cell — avatar + name */}
                  <div className="flex-[2.5] flex items-center gap-3 min-w-0">
                    <div
                      className={[
                        'flex-shrink-0 flex items-center justify-center',
                        'w-9 h-9 rounded-full text-sm font-semibold font-ui',
                        color,
                      ].join(' ')}
                      aria-hidden="true"
                    >
                      {initials}
                    </div>
                    <p className="text-sm font-medium text-bright truncate group-hover:text-teal transition-colors duration-100">
                      {p.last_name}, {p.first_name}
                    </p>
                  </div>

                  {/* MRN */}
                  <div className="w-[130px] flex-shrink-0 hidden sm:block">
                    <span className="font-data text-xs text-dim tabular-nums">
                      {p.mrn || '—'}
                    </span>
                  </div>

                  {/* DOB + age */}
                  <div className="w-[140px] flex-shrink-0 hidden md:block">
                    <p className="font-data text-xs text-bright tabular-nums leading-snug">
                      {dob}
                    </p>
                    {age !== null && (
                      <p className="font-data text-[11px] text-ghost tabular-nums leading-snug mt-0.5">
                        {age} yrs
                      </p>
                    )}
                  </div>

                  {/* Gender */}
                  <div className="w-[90px] flex-shrink-0 hidden lg:block">
                    <span className="text-xs text-dim">{gender}</span>
                  </div>

                  {/* Chevron */}
                  <div className="w-8 flex-shrink-0 flex justify-end">
                    <ChevronRight
                      size={15}
                      strokeWidth={1.5}
                      className="text-ghost group-hover:text-teal transition-colors duration-100"
                      aria-hidden="true"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────── */}
        {!isLoading && patients.length === 0 && (
          <div className="empty-state py-16">
            <p className="empty-state-title">No patients found</p>
            {search ? (
              <p className="empty-state-desc">
                No results for{' '}
                <span className="text-bright font-medium">"{search}"</span>.
                Try a different name or MRN.
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
      {meta && totalPages > 1 && (
        <div className="flex items-center justify-between animate-fade-up stagger-4">
          <p className="text-xs text-ghost font-data tabular-nums">
            {from.toLocaleString()}–{to.toLocaleString()} of{' '}
            {meta.total.toLocaleString()} patients
          </p>

          <div className="flex items-center gap-1" role="navigation" aria-label="Pagination">
            {/* Previous */}
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={[
                'flex items-center justify-center w-8 h-8 rounded-card',
                'border transition-colors duration-100',
                page <= 1
                  ? 'text-ghost/30 border-edge/15 cursor-not-allowed'
                  : 'text-dim border-edge/35 hover:text-bright hover:bg-s1 hover:border-edge/55',
              ].join(' ')}
              aria-label="Previous page"
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
            </button>

            {/* Page numbers */}
            {getPaginationRange(page, totalPages).map((p, i) =>
              p === '…' ? (
                <span
                  key={`ell-${i}`}
                  className="w-8 h-8 flex items-center justify-center font-data text-xs text-ghost"
                  aria-hidden="true"
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={[
                    'w-8 h-8 flex items-center justify-center rounded-card',
                    'font-data text-xs tabular-nums border transition-colors duration-100',
                    p === page
                      ? 'bg-teal/15 text-teal border-teal/30 font-medium'
                      : 'text-dim border-edge/35 hover:text-bright hover:bg-s1 hover:border-edge/55',
                  ].join(' ')}
                  aria-label={`Page ${p}`}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </button>
              ),
            )}

            {/* Next */}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className={[
                'flex items-center justify-center w-8 h-8 rounded-card',
                'border transition-colors duration-100',
                page >= totalPages
                  ? 'text-ghost/30 border-edge/15 cursor-not-allowed'
                  : 'text-dim border-edge/35 hover:text-bright hover:bg-s1 hover:border-edge/55',
              ].join(' ')}
              aria-label="Next page"
            >
              <ChevronRight size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
