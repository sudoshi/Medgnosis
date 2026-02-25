// =============================================================================
// Medgnosis Web — Care Lists page
// =============================================================================

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  BarChart3,
  Clock,
  ListChecks,
  Plus,
  Search,
  Filter,
  X,
} from 'lucide-react';
import { api } from '../services/api.js';

interface CareGap {
  care_gap_id: number;
  patient_id: number;
  patient_name: string;
  measure_id: string;
  gap_description: string;
  status: string;
  priority: string;
  due_date: string;
}

interface CareGapsResponse {
  care_gaps: CareGap[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

function priorityBadge(priority: string) {
  const colors: Record<string, string> = {
    high: 'bg-accent-error/10 text-accent-error',
    medium: 'bg-accent-warning/10 text-accent-warning',
    low: 'bg-accent-success/10 text-accent-success',
  };
  return colors[priority] ?? 'bg-gray-100 text-gray-500';
}

export function CareListsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Keyboard shortcut for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('search-care-gaps')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['care-gaps', statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      return api.get<CareGapsResponse>(`/care-gaps?${params}`);
    },
  });

  const careGaps = data?.data?.care_gaps ?? [];
  const pagination = data?.data?.pagination;

  const filtered = searchTerm
    ? careGaps.filter(
        (g) =>
          g.patient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          g.measure_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          g.gap_description?.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : careGaps;

  const openCount = careGaps.filter((g) => g.status === 'open').length;
  const highPriority = careGaps.filter((g) => g.priority === 'high').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
          Care Lists
        </h1>
        <button className="flex items-center px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 transition-all">
          <Plus className="h-5 w-5 mr-2" />
          Create List
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel-stat">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm font-medium">
                Total Gaps
              </p>
              <p className="mt-2 text-2xl font-semibold">{pagination?.total ?? '—'}</p>
            </div>
            <div className="rounded-lg bg-accent-primary/10 p-3">
              <ListChecks className="h-6 w-6 text-accent-primary" />
            </div>
          </div>
        </div>
        <div className="panel-stat">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm font-medium">
                Open
              </p>
              <p className="mt-2 text-2xl font-semibold">{openCount}</p>
            </div>
            <div className="rounded-lg bg-accent-warning/10 p-3">
              <Clock className="h-6 w-6 text-accent-warning" />
            </div>
          </div>
        </div>
        <div className="panel-stat">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm font-medium">
                High Priority
              </p>
              <p className="mt-2 text-2xl font-semibold">{highPriority}</p>
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
                Patients
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {new Set(careGaps.map((g) => g.patient_id)).size}
              </p>
            </div>
            <div className="rounded-lg bg-accent-success/10 p-3">
              <Users className="h-6 w-6 text-accent-success" />
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="panel-base">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary" />
            {!searchTerm && (
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-xs text-light-text-secondary dark:text-dark-text-secondary bg-light-secondary dark:bg-dark-secondary rounded">
                Ctrl+K
              </kbd>
            )}
            <input
              id="search-care-gaps"
              type="text"
              placeholder="Search care gaps..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-16 py-2.5 rounded-lg border border-light-border dark:border-dark-border bg-light-primary dark:bg-dark-primary focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-light-secondary dark:hover:bg-dark-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              className={`flex items-center px-3 py-2 rounded-lg border text-sm transition-colors ${
                statusFilter !== 'all'
                  ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                  : 'border-light-border dark:border-dark-border hover:bg-light-secondary dark:hover:bg-dark-secondary'
              }`}
              onClick={() => setStatusFilter(statusFilter === 'all' ? 'open' : 'all')}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {statusFilter !== 'all' && (
                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-accent-primary/20">
                  1
                </span>
              )}
            </button>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 rounded-lg border border-light-border dark:border-dark-border bg-light-primary dark:bg-dark-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {/* Care Gap Cards */}
        <div className="space-y-3">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 bg-dark-secondary/10 rounded-lg animate-pulse" />
              ))
            : filtered.map((gap) => (
                <div
                  key={gap.care_gap_id}
                  className="p-4 rounded-lg border border-light-border/50 dark:border-dark-border/50 hover:bg-light-secondary/50 dark:hover:bg-dark-secondary/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm">
                          {gap.gap_description || gap.measure_id}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${priorityBadge(
                            gap.priority,
                          )}`}
                        >
                          {gap.priority}
                        </span>
                      </div>
                      <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
                        Patient: {gap.patient_name ?? `ID ${gap.patient_id}`}
                      </p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        <span>Measure: {gap.measure_id}</span>
                        <span>Due: {new Date(gap.due_date).toLocaleDateString()}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-medium capitalize ${
                            gap.status === 'open'
                              ? 'bg-accent-error/10 text-accent-error'
                              : gap.status === 'in_progress'
                                ? 'bg-accent-warning/10 text-accent-warning'
                                : 'bg-accent-success/10 text-accent-success'
                          }`}
                        >
                          {gap.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          {!isLoading && filtered.length === 0 && (
            <p className="text-center py-8 text-light-text-secondary dark:text-dark-text-secondary">
              No care gaps found
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
