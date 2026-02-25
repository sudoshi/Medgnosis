// =============================================================================
// Medgnosis Web — Patients page
// =============================================================================

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users,
  AlertTriangle,
  BarChart3,
  Clock,
  Search,
  ChevronRight,
} from 'lucide-react';
import { api } from '../services/api.js';

interface PatientRow {
  patient_id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  risk_score: number | null;
  risk_band: string | null;
  open_care_gaps: number;
  condition_count: number;
  last_encounter_date: string | null;
}

interface PatientsResponse {
  patients: PatientRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

function riskBadge(band: string | null) {
  const colors: Record<string, string> = {
    critical: 'bg-accent-error/10 text-accent-error',
    high: 'bg-accent-warning/10 text-accent-warning',
    moderate: 'bg-accent-primary/10 text-accent-primary',
    low: 'bg-accent-success/10 text-accent-success',
  };
  return colors[band ?? ''] ?? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400';
}

export function PatientsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['patients', search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      return api.get<PatientsResponse>(`/patients?${params}`);
    },
  });

  const patients = data?.data?.patients ?? [];
  const pagination = data?.data?.pagination;

  const highRiskCount = patients.filter(
    (p) => p.risk_band === 'high' || p.risk_band === 'critical',
  ).length;
  const totalGaps = patients.reduce((s, p) => s + p.open_care_gaps, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
        Patient Management
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel-stat">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm font-medium">
                Total Patients
              </p>
              <p className="mt-2 text-2xl font-semibold">{pagination?.total ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-accent-primary/10 p-3">
              <Users className="h-6 w-6 text-accent-primary" />
            </div>
          </div>
        </div>
        <div className="panel-stat">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm font-medium">
                High Risk
              </p>
              <p className="mt-2 text-2xl font-semibold">{highRiskCount}</p>
            </div>
            <div className="rounded-lg bg-accent-warning/10 p-3">
              <AlertTriangle className="h-6 w-6 text-accent-warning" />
            </div>
          </div>
        </div>
        <div className="panel-stat">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm font-medium">
                Open Care Gaps
              </p>
              <p className="mt-2 text-2xl font-semibold">{totalGaps}</p>
            </div>
            <div className="rounded-lg bg-accent-error/10 p-3">
              <BarChart3 className="h-6 w-6 text-accent-error" />
            </div>
          </div>
        </div>
        <div className="panel-stat">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm font-medium">
                Showing
              </p>
              <p className="mt-2 text-2xl font-semibold">{patients.length}</p>
            </div>
            <div className="rounded-lg bg-accent-success/10 p-3">
              <Clock className="h-6 w-6 text-accent-success" />
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary" />
        <input
          type="text"
          placeholder="Search patients by name or MRN..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full pl-10 pr-4 py-3 rounded-lg border border-light-border dark:border-dark-border bg-light-primary dark:bg-dark-primary text-light-text-primary dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors"
        />
      </div>

      {/* Patient Table */}
      <div className="panel-base overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-light-border dark:border-dark-border">
              <th className="text-left px-6 py-3 text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">
                Patient
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">
                Risk
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">
                Care Gaps
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">
                Last Encounter
              </th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-light-border/50 dark:divide-dark-border/50">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="h-4 w-32 bg-dark-secondary/20 rounded" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-16 bg-dark-secondary/20 rounded" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-8 bg-dark-secondary/20 rounded" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-24 bg-dark-secondary/20 rounded" />
                    </td>
                    <td />
                  </tr>
                ))
              : patients.map((p) => (
                  <tr
                    key={p.patient_id}
                    className="hover:bg-light-secondary/50 dark:hover:bg-dark-secondary/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link
                        to={`/patients/${p.patient_id}`}
                        className="font-medium text-light-text-primary dark:text-dark-text-primary hover:text-accent-primary transition-colors"
                      >
                        {p.last_name}, {p.first_name}
                      </Link>
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                        {p.gender} &middot;{' '}
                        {p.date_of_birth
                          ? new Date(p.date_of_birth).toLocaleDateString()
                          : '—'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${riskBadge(
                          p.risk_band,
                        )}`}
                      >
                        {p.risk_band ?? 'N/A'}
                        {p.risk_score != null && (
                          <span className="ml-1 opacity-70">({p.risk_score})</span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {p.open_care_gaps > 0 ? (
                        <span className="text-accent-error font-medium">
                          {p.open_care_gaps}
                        </span>
                      ) : (
                        <span className="text-accent-success">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                      {p.last_encounter_date
                        ? new Date(p.last_encounter_date).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <Link to={`/patients/${p.patient_id}`}>
                        <ChevronRight className="h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary" />
                      </Link>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Page {pagination.page} of {pagination.pages} ({pagination.total} total)
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 text-sm rounded-lg border border-light-border dark:border-dark-border disabled:opacity-50 hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-sm rounded-lg border border-light-border dark:border-dark-border disabled:opacity-50 hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
