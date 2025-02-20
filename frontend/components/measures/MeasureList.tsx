import {
  ChartBarIcon,
  ClockIcon,
  BeakerIcon,
} from "@heroicons/react/24/outline";

import type { QualityMeasure } from "@/types/measure";


interface MeasureListProps {
  measures: QualityMeasure[];
  onSelectMeasure?: (measure: QualityMeasure) => void;
  selectedMeasureId?: string;
  selectedMeasures?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

function getStatusColor(
  performance: number,
  target: number,
  benchmark: number,
) {
  if (performance >= benchmark) return "text-accent-success";
  if (performance >= target) return "text-accent-primary";

  return "text-accent-error";
}

function MeasureCard({
  measure,
  isSelected,
  isSelectedForCareList,
  onClick,
  onToggleSelect,
}: {
  measure: QualityMeasure;
  isSelected: boolean;
  isSelectedForCareList: boolean;
  onClick: () => void;
  onToggleSelect?: () => void;
}) {
  // Mock performance data
  const performance = 75;

  return (
    <button
      className={`w-full p-4 rounded-lg text-left transition-colors ${
        isSelected
          ? "bg-accent-primary/10 border border-accent-primary"
          : "bg-light-primary dark:bg-dark-primary hover:bg-light-secondary dark:hover:bg-dark-secondary border border-light-border dark:border-dark-border"
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <h3
              className={`text-lg font-medium truncate ${
                isSelected
                  ? "text-accent-primary"
                  : "text-light-text-primary dark:text-dark-text-primary"
              }`}
            >
              {measure.title}
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                isSelected
                  ? "bg-accent-primary/10 text-accent-primary"
                  : "bg-light-secondary dark:bg-dark-secondary text-light-text-secondary dark:text-dark-text-secondary"
              }`}
            >
              {measure.implementation.category}
            </span>
          </div>
          <p className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary truncate">
            {measure.implementation.code} • {measure.steward}
          </p>
          <div className="mt-4 flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <ChartBarIcon
                className={`h-4 w-4 ${getStatusColor(
                  performance,
                  measure.performance?.target || 0,
                  measure.performance?.benchmark || 0,
                )}`}
              />
              <span className="text-sm text-light-text-primary dark:text-dark-text-primary">
                {performance}%
              </span>
            </div>
            {measure.domain === "chronic" && (
              <div className="flex items-center space-x-2">
                <ClockIcon className="h-4 w-4 text-light-text-secondary dark:text-dark-text-secondary" />
                <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  Ongoing
                </span>
              </div>
            )}
            {measure.type === "outcome" && (
              <div className="flex items-center space-x-2">
                <BeakerIcon className="h-4 w-4 text-light-text-secondary dark:text-dark-text-secondary" />
                <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  Outcome
                </span>
              </div>
            )}
          </div>
        </div>
        {onToggleSelect && (
          <div className="ml-4 flex-shrink-0">
            <input
              checked={isSelectedForCareList}
              className="h-4 w-4 rounded border-light-border dark:border-dark-border text-accent-primary focus:ring-accent-primary bg-light-primary dark:bg-dark-primary"
              type="checkbox"
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect();
              }}
            />
          </div>
        )}
      </div>
    </button>
  );
}

export default function MeasureList({
  measures,
  onSelectMeasure,
  selectedMeasureId,
  selectedMeasures,
  onToggleSelect,
}: MeasureListProps) {
  return (
    <div className="space-y-4">
      {measures.map((measure) => (
        <MeasureCard
          key={measure.id}
          isSelected={measure.id === selectedMeasureId}
          isSelectedForCareList={selectedMeasures?.has(measure.id) || false}
          measure={measure}
          onClick={() => onSelectMeasure?.(measure)}
          onToggleSelect={
            onToggleSelect ? () => onToggleSelect(measure.id) : undefined
          }
        />
      ))}
    </div>
  );
}
