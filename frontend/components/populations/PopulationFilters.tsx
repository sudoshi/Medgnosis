import { useState } from "react";
import {
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

interface FilterGroup {
  id: string;
  label: string;
  options: {
    id: string;
    label: string;
    count?: number;
  }[];
}

export interface FilterState {
  conditions: string[];
  comorbidityCount: number | null;
  careGapComplexity: "high" | "medium" | "low" | null;
  riskLevel: "high" | "medium" | "low" | null;
  trending: "up" | "down" | "stable" | null;
}

interface PopulationFiltersProps {
  onFiltersChange: (filters: FilterState) => void;
}

const filterGroups: FilterGroup[] = [
  {
    id: "conditions",
    label: "Primary Conditions",
    options: [
      { id: "diabetes", label: "Type 2 Diabetes", count: 125 },
      { id: "hypertension", label: "Hypertension", count: 245 },
      { id: "copd", label: "COPD", count: 89 },
      { id: "chf", label: "Heart Failure", count: 67 },
      { id: "ckd", label: "Chronic Kidney Disease", count: 78 },
      { id: "depression", label: "Depression", count: 156 },
      { id: "obesity", label: "Obesity", count: 198 },
      { id: "asthma", label: "Asthma", count: 112 },
      { id: "cad", label: "Coronary Artery Disease", count: 93 },
      { id: "afib", label: "Atrial Fibrillation", count: 45 },
    ],
  },
  {
    id: "comorbidity",
    label: "Comorbidity Count",
    options: [
      { id: "2plus", label: "2+ Conditions", count: 450 },
      { id: "3plus", label: "3+ Conditions", count: 280 },
      { id: "4plus", label: "4+ Conditions", count: 125 },
    ],
  },
  {
    id: "careGaps",
    label: "Care Gap Complexity",
    options: [
      { id: "high", label: "High Complexity", count: 145 },
      { id: "medium", label: "Medium Complexity", count: 235 },
      { id: "low", label: "Low Complexity", count: 320 },
      { id: "overdue", label: "Overdue Care Gaps", count: 178 },
    ],
  },
  {
    id: "risk",
    label: "Risk Factors",
    options: [
      { id: "high_risk", label: "High Risk", count: 180 },
      { id: "medium_risk", label: "Medium Risk", count: 420 },
      { id: "low_risk", label: "Low Risk", count: 650 },
      { id: "trending_up", label: "Risk Trending Up", count: 145 },
      { id: "trending_down", label: "Risk Trending Down", count: 98 },
    ],
  },
];

export default function PopulationFilters({
  onFiltersChange,
}: PopulationFiltersProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["conditions"]),
  );
  const [activeFilters, setActiveFilters] = useState<FilterState>({
    conditions: [],
    comorbidityCount: null,
    careGapComplexity: null,
    riskLevel: null,
    trending: null,
  });

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

    switch (groupId) {
      case "conditions":
        if (newFilters.conditions.includes(optionId)) {
          newFilters.conditions = newFilters.conditions.filter(
            (id) => id !== optionId,
          );
        } else {
          newFilters.conditions = [...newFilters.conditions, optionId];
        }
        break;
      case "comorbidity":
        newFilters.comorbidityCount =
          optionId === "2plus" ? 2 : optionId === "3plus" ? 3 : 4;
        break;
      case "careGaps":
        newFilters.careGapComplexity = optionId as "high" | "medium" | "low";
        break;
      case "risk":
        if (optionId.includes("risk")) {
          newFilters.riskLevel = optionId.split("_")[0] as
            | "high"
            | "medium"
            | "low";
        } else if (optionId.includes("trending")) {
          newFilters.trending = optionId.split("_")[1] as "up" | "down";
        }
        break;
    }

    setActiveFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const clearFilters = () => {
    const emptyFilters: FilterState = {
      conditions: [],
      comorbidityCount: null,
      careGapComplexity: null,
      riskLevel: null,
      trending: null,
    };

    setActiveFilters(emptyFilters);
    onFiltersChange(emptyFilters);
  };

  const getActiveFilterCount = () => {
    let count = activeFilters.conditions.length;

    if (activeFilters.comorbidityCount) count++;
    if (activeFilters.careGapComplexity) count++;
    if (activeFilters.riskLevel) count++;
    if (activeFilters.trending) count++;

    return count;
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
        {filterGroups.map((group) => (
          <div key={group.id} className="space-y-2">
            <button
              className="flex items-center justify-between w-full text-left"
              onClick={() => toggleGroup(group.id)}
            >
              <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
                {group.label}
              </span>
              <ChevronDownIcon
                className={`h-5 w-5 text-light-text-secondary dark:text-dark-text-secondary transition-transform ${
                  expandedGroups.has(group.id) ? "transform rotate-180" : ""
                }`}
              />
            </button>
            {expandedGroups.has(group.id) && (
              <div className="space-y-2 pl-2">
                {group.options.map((option) => {
                  const isActive =
                    activeFilters.conditions.includes(option.id) ||
                    (activeFilters.comorbidityCount === 2 &&
                      option.id === "2plus") ||
                    (activeFilters.comorbidityCount === 3 &&
                      option.id === "3plus") ||
                    (activeFilters.comorbidityCount === 4 &&
                      option.id === "4plus") ||
                    activeFilters.careGapComplexity === option.id ||
                    (activeFilters.riskLevel === option.id.split("_")[0] &&
                      option.id.includes("risk")) ||
                    (activeFilters.trending === option.id.split("_")[1] &&
                      option.id.includes("trending"));

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
                      {option.count !== undefined && (
                        <span className="text-xs bg-light-secondary dark:bg-dark-secondary px-2 py-1 rounded-full text-light-text-secondary dark:text-dark-text-secondary">
                          {option.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
