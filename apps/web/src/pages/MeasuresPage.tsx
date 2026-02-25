// =============================================================================
// Medgnosis Web — Quality Measures page
// =============================================================================

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, BarChart3, Target, TrendingUp } from 'lucide-react';
import { api } from '../services/api.js';

interface Measure {
  measure_id: string;
  title: string;
  description: string;
  domain: string;
  type: string;
  cms_id: string;
  eligible_count: number;
  compliant_count: number;
  performance: number;
  target: number;
}

interface MeasuresResponse {
  measures: Measure[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export function MeasuresPage() {
  const [search, setSearch] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [selectedMeasure, setSelectedMeasure] = useState<Measure | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['measures'],
    queryFn: () => api.get<MeasuresResponse>('/measures?limit=100'),
  });

  const measures = data?.data?.measures ?? [];

  const filteredMeasures = useMemo(() => {
    return measures.filter((m) => {
      if (selectedDomain && m.domain !== selectedDomain) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          m.cms_id.toLowerCase().includes(s) ||
          m.title.toLowerCase().includes(s) ||
          m.description.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [measures, search, selectedDomain]);

  const domains = useMemo(() => {
    const counts: Record<string, number> = {};
    measures.forEach((m) => {
      counts[m.domain] = (counts[m.domain] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [measures]);

  return (
    <div className="flex h-[calc(100vh-7rem)]">
      {/* Left Sidebar — Filters */}
      <div className="w-72 border-r border-light-border dark:border-dark-border p-5 overflow-y-auto scrollbar-thin">
        <h2 className="text-lg font-semibold mb-4 text-light-text-primary dark:text-dark-text-primary">
          Filters
        </h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-2">
              Domain
            </h3>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedDomain(null)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  !selectedDomain
                    ? 'bg-accent-primary/10 text-accent-primary font-medium'
                    : 'hover:bg-light-secondary dark:hover:bg-dark-secondary'
                }`}
              >
                All ({measures.length})
              </button>
              {domains.map(([domain, count]) => (
                <button
                  key={domain}
                  onClick={() => setSelectedDomain(domain)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedDomain === domain
                      ? 'bg-accent-primary/10 text-accent-primary font-medium'
                      : 'hover:bg-light-secondary dark:hover:bg-dark-secondary'
                  }`}
                >
                  {domain} ({count})
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Middle — Measure List */}
      <div className="w-96 border-r border-light-border dark:border-dark-border p-5 overflow-y-auto scrollbar-thin">
        <h1 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
          Quality Measures
        </h1>
        <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm mt-1 mb-4">
          {filteredMeasures.length} measures
        </p>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-light-text-secondary dark:text-dark-text-secondary" />
          <input
            type="text"
            placeholder="Search measures..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border bg-light-primary dark:bg-dark-primary focus:outline-none focus:ring-2 focus:ring-accent-primary transition-colors"
          />
        </div>

        <div className="space-y-2">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 bg-dark-secondary/10 rounded-lg animate-pulse" />
              ))
            : filteredMeasures.map((m) => (
                <button
                  key={m.measure_id}
                  onClick={() => setSelectedMeasure(m)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedMeasure?.measure_id === m.measure_id
                      ? 'border-accent-primary bg-accent-primary/5'
                      : 'border-light-border/50 dark:border-dark-border/50 hover:bg-light-secondary/50 dark:hover:bg-dark-secondary/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-accent-primary font-medium">{m.cms_id}</p>
                      <p className="text-sm font-medium mt-0.5 truncate">{m.title}</p>
                    </div>
                    <span
                      className={`text-sm font-semibold ml-2 ${
                        m.performance >= (m.target || 75)
                          ? 'text-accent-success'
                          : m.performance >= (m.target || 75) * 0.75
                            ? 'text-accent-warning'
                            : 'text-accent-error'
                      }`}
                    >
                      {m.performance}%
                    </span>
                  </div>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1 capitalize">
                    {m.domain}
                  </p>
                </button>
              ))}
        </div>
      </div>

      {/* Right — Measure Details */}
      <div className="flex-1 p-6 overflow-y-auto scrollbar-thin">
        {selectedMeasure ? (
          <div className="space-y-6">
            <div>
              <p className="text-sm text-accent-primary font-medium">
                {selectedMeasure.cms_id}
              </p>
              <h2 className="text-2xl font-semibold mt-1">{selectedMeasure.title}</h2>
              <p className="text-light-text-secondary dark:text-dark-text-secondary mt-2">
                {selectedMeasure.description}
              </p>
            </div>

            {/* Performance Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="panel-stat">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-accent-primary/10 p-2">
                    <BarChart3 className="h-5 w-5 text-accent-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                      Performance
                    </p>
                    <p className="text-xl font-semibold">{selectedMeasure.performance}%</p>
                  </div>
                </div>
              </div>
              <div className="panel-stat">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-accent-success/10 p-2">
                    <Target className="h-5 w-5 text-accent-success" />
                  </div>
                  <div>
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                      Target
                    </p>
                    <p className="text-xl font-semibold">{selectedMeasure.target}%</p>
                  </div>
                </div>
              </div>
              <div className="panel-stat">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-accent-warning/10 p-2">
                    <TrendingUp className="h-5 w-5 text-accent-warning" />
                  </div>
                  <div>
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                      Eligible
                    </p>
                    <p className="text-xl font-semibold">{selectedMeasure.eligible_count}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Bar */}
            <div className="panel-base">
              <h3 className="font-semibold mb-3">Performance vs Target</h3>
              <div className="h-4 rounded-full bg-dark-secondary/30 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    selectedMeasure.performance >= selectedMeasure.target
                      ? 'bg-accent-success'
                      : selectedMeasure.performance >= selectedMeasure.target * 0.75
                        ? 'bg-accent-warning'
                        : 'bg-accent-error'
                  }`}
                  style={{ width: `${Math.min(selectedMeasure.performance, 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                <span>0%</span>
                <span>Target: {selectedMeasure.target}%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Population */}
            <div className="panel-base">
              <h3 className="font-semibold mb-3">Population Analysis</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-light-secondary/50 dark:bg-dark-secondary/50">
                  <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    Eligible
                  </p>
                  <p className="text-lg font-semibold">{selectedMeasure.eligible_count}</p>
                </div>
                <div className="p-3 rounded-lg bg-light-secondary/50 dark:bg-dark-secondary/50">
                  <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                    Compliant
                  </p>
                  <p className="text-lg font-semibold">{selectedMeasure.compliant_count}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-light-text-secondary dark:text-dark-text-secondary">
            Select a measure to view details
          </div>
        )}
      </div>
    </div>
  );
}
