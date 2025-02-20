import {
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
  BeakerIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType } from "react";
import { useState } from "react";

interface FilterGroup {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  options: {
    id: string;
    label: string;
    count?: number;
  }[];
}

interface PatientFiltersProps {
  onFiltersChange: (filters: {
    conditions?: string[];
    riskLevel?: string;
    careGaps?: string[];
    lastVisit?: number;
    provider?: string[];
  }) => void;
  counts: {
    byCondition: Record<string, number>;
    byRiskLevel: Record<string, number>;
    byCareGap: Record<string, number>;
    byProvider: Record<string, number>;
  };
}

const filterGroups: FilterGroup[] = [
  {
    id: "clinical",
    label: "Clinical Status",
    icon: BeakerIcon,
    options: [
      { id: "diabetes", label: "Diabetes" },
      { id: "hypertension", label: "Hypertension" },
      { id: "chf", label: "Heart Failure" },
      { id: "ckd", label: "Chronic Kidney Disease" },
      { id: "copd", label: "COPD" },
    ],
  },
  {
    id: "risk",
    label: "Risk Level",
    icon: ExclamationTriangleIcon,
    options: [
      { id: "rising", label: "Rising Risk" },
      { id: "high", label: "High Risk" },
      { id: "moderate", label: "Moderate Risk" },
      { id: "low", label: "Low Risk" },
    ],
  },
  {
    id: "care_gaps",
    label: "Care Gaps",
    icon: ClockIcon,
    options: [
      { id: "overdue", label: "Overdue" },
      { id: "upcoming", label: "Due Soon" },
      { id: "preventive", label: "Preventive Care" },
      { id: "chronic", label: "Chronic Care" },
      { id: "screening", label: "Screening" },
    ],
  },
  {
    id: "engagement",
    label: "Patient Engagement",
    icon: UserGroupIcon,
    options: [
      { id: "30_days", label: "Seen in Last 30 Days" },
      { id: "90_days", label: "Seen in Last 90 Days" },
      { id: "scheduled", label: "Has Upcoming Appointment" },
      { id: "no_show", label: "History of No-Shows" },
    ],
  },
  {
    id: "provider",
    label: "Care Team",
    icon: UserGroupIcon,
    options: [
      { id: "pcp", label: "Primary Care" },
      { id: "cardiology", label: "Cardiology" },
      { id: "endocrinology", label: "Endocrinology" },
      { id: "nephrology", label: "Nephrology" },
    ],
  },
];

export default function PatientFilters({
  onFiltersChange,
  counts,
}: PatientFiltersProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["clinical"]),
  );
  const [activeFilters, setActiveFilters] = useState<
    Record<string, Set<string>>
  >({});

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);

    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const toggleFilter = (groupId: string, optionId: string) => {
    const newFilters = { ...activeFilters };

    if (!newFilters[groupId]) {
      newFilters[groupId] = new Set();
    }

    if (newFilters[groupId].has(optionId)) {
      newFilters[groupId].delete(optionId);
      if (newFilters[groupId].size === 0) {
        delete newFilters[groupId];
      }
    } else {
      newFilters[groupId].add(optionId);
    }

    setActiveFilters(newFilters);
    onFiltersChange({
      conditions: newFilters.clinical
        ? Array.from(newFilters.clinical)
        : undefined,
      riskLevel: newFilters.risk ? Array.from(newFilters.risk)[0] : undefined,
      careGaps: newFilters.care_gaps
        ? Array.from(newFilters.care_gaps)
        : undefined,
      lastVisit: newFilters.engagement
        ? Array.from(newFilters.engagement).includes("30_days")
          ? 30
          : 90
        : undefined,
      provider: newFilters.provider
        ? Array.from(newFilters.provider)
        : undefined,
    });
  };

  const clearFilters = () => {
    setActiveFilters({});
    onFiltersChange({});
  };

  const getActiveFilterCount = () => {
    return Object.values(activeFilters).reduce(
      (sum, filters) => sum + filters.size,
      0,
    );
  };

  return (
    <div className="w-80 bg-light-primary dark:bg-dark-primary border-r border-light-border dark:border-dark-border">
      <div className="p-4 border-b border-light-border dark:border-dark-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <AdjustmentsHorizontalIcon className="h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary" />
            <h2 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
              Filters
            </h2>
          </div>
          {getActiveFilterCount() > 0 && (
            <button
              className="text-sm text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary"
              onClick={clearFilters}
            >
              Clear all
            </button>
          )}
        </div>
        {getActiveFilterCount() > 0 && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              {getActiveFilterCount()} active filters
            </span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {filterGroups.map((group) => {
          const Icon = group.icon;

          return (
            <div key={group.id} className="space-y-2">
              <button
                className="flex items-center justify-between w-full text-left"
                onClick={() => toggleGroup(group.id)}
              >
                <div className="flex items-center space-x-2">
                  <Icon className="h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary" />
                  <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
                    {group.label}
                  </span>
                </div>
                <ChevronDownIcon
                  className={`h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary transition-transform ${
                    expandedGroups.has(group.id) ? "transform rotate-180" : ""
                  }`}
                />
              </button>
              {expandedGroups.has(group.id) && (
                <div className="space-y-2 pl-7">
                  {group.options.map((option) => {
                    const isActive = activeFilters[group.id]?.has(option.id);
                    const count =
                      counts[
                        `by${group.id.charAt(0).toUpperCase()}${group.id.slice(1)}` as keyof typeof counts
                      ]?.[option.id];

                    return (
                      <button
                        key={option.id}
                        className={`flex items-center justify-between w-full p-2 rounded-lg text-sm ${
                          isActive
                            ? "bg-accent-primary/10 text-accent-primary"
                            : "text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-secondary dark:hover:bg-dark-secondary"
                        }`}
                        onClick={() => toggleFilter(group.id, option.id)}
                      >
                        <span>{option.label}</span>
                        {count !== undefined && (
                          <span className="text-xs bg-light-secondary dark:bg-dark-secondary px-2 py-1 rounded-full text-light-text-secondary dark:text-dark-text-secondary">
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
