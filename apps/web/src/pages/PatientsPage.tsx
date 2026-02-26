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
  ArrowUpDown,
} from 'lucide-react';
import { api } from '../services/api.js';
import { formatDate, calcAge } from '../utils/time.js';
import { PatientAvatar, getInitialsFromParts } from '../components/PatientAvatar.js';
import { Pagination } from '../components/Pagination.js';

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
              const age    = calcAge(p.date_of_birth);
              const dob    = formatDate(p.date_of_birth);
              const gender = formatGender(p.gender);

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
                    <PatientAvatar
                      initials={getInitialsFromParts(p.first_name, p.last_name)}
                      seed={p.id}
                    />
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
