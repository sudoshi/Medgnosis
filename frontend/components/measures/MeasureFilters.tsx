import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ChartBarIcon,
  ClockIcon,
  BeakerIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import type { MeasureDomain, MeasureType, MeasureFilter } from '@/types/measure';

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

const domains: { id: MeasureDomain; label: string; icon: typeof ChartBarIcon }[] = [
  { id: 'chronic', label: 'Chronic Care', icon: ClockIcon },
  { id: 'acute', label: 'Acute Care', icon: BeakerIcon },
  { id: 'preventive', label: 'Preventive Care', icon: DocumentTextIcon },
  { id: 'safety', label: 'Patient Safety', icon: ChartBarIcon },
];

const types: { id: MeasureType; label: string }[] = [
  { id: 'process', label: 'Process' },
  { id: 'outcome', label: 'Outcome' },
  { id: 'structural', label: 'Structural' },
];

const performanceFilters: Array<{
  id: 'below' | 'meeting' | 'exceeding';
  label: string;
}> = [
  { id: 'below', label: 'Below Target' },
  { id: 'meeting', label: 'Meeting Target' },
  { id: 'exceeding', label: 'Exceeding Target' },
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
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-dark-text-secondary" />
        <input
          type="text"
          placeholder="Search measures..."
          value={filters.search || ''}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="input pl-10 w-full"
        />
      </div>

      {/* Domain Filters */}
      <div>
        <h3 className="text-sm font-medium text-dark-text-secondary mb-3">
          Measure Domain
        </h3>
        <div className="space-y-2">
          {domains.map((domain) => {
            const Icon = domain.icon;
            const isActive = filters.domain === domain.id;
            return (
              <button
                key={domain.id}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    domain: isActive ? undefined : domain.id,
                  })
                }
                className={`flex items-center justify-between w-full p-2 rounded-lg text-sm ${
                  isActive
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'text-dark-text-secondary hover:bg-dark-secondary'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Icon className="h-5 w-5" />
                  <span>{domain.label}</span>
                </div>
                <span className="text-xs bg-dark-secondary px-2 py-1 rounded-full">
                  {counts.byDomain[domain.id] || 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Type Filters */}
      <div>
        <h3 className="text-sm font-medium text-dark-text-secondary mb-3">
          Measure Type
        </h3>
        <div className="space-y-2">
          {types.map((type) => {
            const isActive = filters.type === type.id;
            return (
              <button
                key={type.id}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    type: isActive ? undefined : type.id,
                  })
                }
                className={`flex items-center justify-between w-full p-2 rounded-lg text-sm ${
                  isActive
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'text-dark-text-secondary hover:bg-dark-secondary'
                }`}
              >
                <span>{type.label}</span>
                <span className="text-xs bg-dark-secondary px-2 py-1 rounded-full">
                  {counts.byType[type.id] || 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Performance Filters */}
      <div>
        <h3 className="text-sm font-medium text-dark-text-secondary mb-3">
          Performance
        </h3>
        <div className="space-y-2">
          {performanceFilters.map((perf) => {
            const isActive = filters.performance === perf.id;
            return (
              <button
                key={perf.id}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    performance: isActive ? undefined : perf.id,
                  })
                }
                className={`flex items-center justify-between w-full p-2 rounded-lg text-sm ${
                  isActive
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'text-dark-text-secondary hover:bg-dark-secondary'
                }`}
              >
                <span>{perf.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Clear Filters */}
      {(filters.domain || filters.type || filters.performance || filters.search) && (
        <button
          onClick={() =>
            onFiltersChange({
              domain: undefined,
              type: undefined,
              search: undefined,
              performance: undefined,
            })
          }
          className="text-sm text-dark-text-secondary hover:text-dark-text-primary"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}
