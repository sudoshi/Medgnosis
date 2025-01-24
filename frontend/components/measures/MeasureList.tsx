import type { QualityMeasure } from '@/types/measure';
import { ChartBarIcon, ClockIcon, BeakerIcon } from '@heroicons/react/24/outline';

interface MeasureListProps {
  measures: QualityMeasure[];
  onSelectMeasure?: (measure: QualityMeasure) => void;
  selectedMeasureId?: string;
  selectedMeasures?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

function getStatusColor(performance: number, target: number, benchmark: number) {
  if (performance >= benchmark) return 'text-accent-success';
  if (performance >= target) return 'text-accent-primary';
  return 'text-accent-error';
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
      onClick={onClick}
      className={`w-full p-4 rounded-lg text-left transition-colors ${
        isSelected
          ? 'bg-accent-primary/10 border border-accent-primary'
          : 'bg-dark-primary hover:bg-dark-secondary border border-dark-border'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <h3
              className={`text-lg font-medium truncate ${
                isSelected ? 'text-accent-primary' : ''
              }`}
            >
              {measure.title}
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                isSelected
                  ? 'bg-accent-primary/10 text-accent-primary'
                  : 'bg-dark-secondary text-dark-text-secondary'
              }`}
            >
              {measure.implementation.category}
            </span>
          </div>
          <p className="mt-1 text-sm text-dark-text-secondary truncate">
            {measure.implementation.code} • {measure.steward}
          </p>
          <div className="mt-4 flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <ChartBarIcon
                className={`h-4 w-4 ${getStatusColor(
                  performance,
                  measure.performance?.target || 0,
                  measure.performance?.benchmark || 0
                )}`}
              />
              <span className="text-sm">{performance}%</span>
            </div>
            {measure.domain === 'chronic' && (
              <div className="flex items-center space-x-2">
                <ClockIcon className="h-4 w-4 text-dark-text-secondary" />
                <span className="text-sm">Ongoing</span>
              </div>
            )}
            {measure.type === 'outcome' && (
              <div className="flex items-center space-x-2">
                <BeakerIcon className="h-4 w-4 text-dark-text-secondary" />
                <span className="text-sm">Outcome</span>
              </div>
            )}
          </div>
        </div>
        {onToggleSelect && (
          <div className="ml-4 flex-shrink-0">
            <input
              type="checkbox"
              checked={isSelectedForCareList}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect();
              }}
              className="h-4 w-4 rounded border-dark-border text-accent-primary focus:ring-accent-primary"
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
          measure={measure}
          isSelected={measure.id === selectedMeasureId}
          isSelectedForCareList={selectedMeasures?.has(measure.id) || false}
          onClick={() => onSelectMeasure?.(measure)}
          onToggleSelect={
            onToggleSelect ? () => onToggleSelect(measure.id) : undefined
          }
        />
      ))}
    </div>
  );
}
