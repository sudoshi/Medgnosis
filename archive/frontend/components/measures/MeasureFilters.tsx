"use client"
import {
  MagnifyingGlassIcon,
  ChartBarIcon,
  ClockIcon,
  BeakerIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

import type {
  MeasureDomain,
  MeasureType,
  MeasureFilter,
} from "@/types/measure";


interface MeasureFiltersProps {
  filters: MeasureFilter;
  onFiltersChange: (filters: MeasureFilter) => void;
  counts: {
    total: number;
    byDomain: Record<MeasureDomain, number>;
    byType: Record<MeasureType, number>;
    byStatus: Record<string, number>;
  };
}

const domains: {
  id: MeasureDomain;
  label: string;
  icon: typeof ChartBarIcon;
}[] = [
  { id: "chronic", label: "Chronic Care", icon: ClockIcon },
  { id: "acute", label: "Acute Care", icon: BeakerIcon },
  { id: "preventive", label: "Preventive Care", icon: DocumentTextIcon },
  { id: "safety", label: "Patient Safety", icon: ChartBarIcon },
];

const types: { id: MeasureType; label: string }[] = [
  { id: "process", label: "Process" },
  { id: "outcome", label: "Outcome" },
  { id: "structural", label: "Structural" },
];

const performanceFilters: Array<{
  id: "below" | "meeting" | "exceeding";
  label: string;
}> = [
  { id: "below", label: "Below Target" },
  { id: "meeting", label: "Meeting Target" },
  { id: "exceeding", label: "Exceeding Target" },
];

export default function MeasureFilters({
  filters,
  onFiltersChange,
  counts,
}: MeasureFiltersProps) {
  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary" />
        <input
          className="input pl-10 w-full bg-light-primary dark:bg-dark-primary text-light-text-primary dark:text-dark-text-primary border-light-border dark:border-dark-border focus:border-accent-primary focus:ring-accent-primary"
          placeholder="Search measures..."
          type="text"
          value={filters.search || ""}
          onChange={(e) =>
            onFiltersChange({ ...filters, search: e.target.value })
          }
        />
      </div>

      {/* Domain Filters */}
      <div>
        <h3 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-3">
          Measure Domain
        </h3>
        <div className="space-y-2">
          {domains.map((domain) => {
            const Icon = domain.icon;
            const isActive = filters.domain === domain.id;

            return (
              <button
                key={domain.id}
                className={`flex items-center justify-between w-full p-2 rounded-lg text-sm ${
                  isActive
                    ? "bg-accent-primary/10 text-accent-primary"
                    : "text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-secondary dark:hover:bg-dark-secondary"
                }`}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    domain: isActive ? undefined : domain.id,
                  })
                }
              >
                <div className="flex items-center space-x-2">
                  <Icon className="h-5 w-5" />
                  <span>{domain.label}</span>
                </div>
                <span className="text-xs bg-light-secondary dark:bg-dark-secondary px-2 py-1 rounded-full text-light-text-secondary dark:text-dark-text-secondary">
                  {counts.byDomain[domain.id] || 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Type Filters */}
      <div>
        <h3 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-3">
          Measure Type
        </h3>
        <div className="space-y-2">
          {types.map((type) => {
            const isActive = filters.type === type.id;

            return (
              <button
                key={type.id}
                className={`flex items-center justify-between w-full p-2 rounded-lg text-sm ${
                  isActive
                    ? "bg-accent-primary/10 text-accent-primary"
                    : "text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-secondary dark:hover:bg-dark-secondary"
                }`}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    type: isActive ? undefined : type.id,
                  })
                }
              >
                <span>{type.label}</span>
                <span className="text-xs bg-light-secondary dark:bg-dark-secondary px-2 py-1 rounded-full text-light-text-secondary dark:text-dark-text-secondary">
                  {counts.byType[type.id] || 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Performance Filters */}
      <div>
        <h3 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary mb-3">
          Performance
        </h3>
        <div className="space-y-2">
          {performanceFilters.map((perf) => {
            const isActive = filters.performance === perf.id;

            return (
              <button
                key={perf.id}
                className={`flex items-center justify-between w-full p-2 rounded-lg text-sm ${
                  isActive
                    ? "bg-accent-primary/10 text-accent-primary"
                    : "text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-secondary dark:hover:bg-dark-secondary"
                }`}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    performance: isActive ? undefined : perf.id,
                  })
                }
              >
                <span>{perf.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Clear Filters */}
      {(filters.domain ||
        filters.type ||
        filters.performance ||
        filters.search) && (
        <button
          className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary"
          onClick={() =>
            onFiltersChange({
              domain: undefined,
              type: undefined,
              search: undefined,
              performance: undefined,
            })
          }
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}
