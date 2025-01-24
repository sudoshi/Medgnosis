import { useState } from 'react';
import {
  ChartBarIcon,
  ClockIcon,
  BeakerIcon,
  DocumentTextIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import type { QualityMeasure } from '@/types/measure';

interface MeasureListProps {
  measures: QualityMeasure[];
  onSelectMeasure: (measure: QualityMeasure) => void;
  selectedMeasureId?: string;
}

function getDomainIcon(domain: QualityMeasure['domain']) {
  switch (domain) {
    case 'chronic':
      return ClockIcon;
    case 'acute':
      return BeakerIcon;
    case 'preventive':
      return DocumentTextIcon;
    case 'safety':
      return ChartBarIcon;
    default:
      return ChartBarIcon;
  }
}

function getPerformanceColor(
  performance: number | undefined,
  target: number | undefined,
  benchmark: number | undefined
) {
  if (!performance || !target) return 'text-dark-text-secondary';
  if (performance >= (benchmark || target)) return 'text-accent-success';
  if (performance >= target) return 'text-accent-warning';
  return 'text-accent-error';
}

export default function MeasureList({
  measures,
  onSelectMeasure,
  selectedMeasureId,
}: MeasureListProps) {
  return (
    <div className="space-y-4">
      {measures.map((measure) => {
        const Icon = getDomainIcon(measure.domain);
        const performanceColor = getPerformanceColor(
          75, // Mock current performance
          measure.performance?.target,
          measure.performance?.benchmark
        );

        return (
          <button
            key={measure.id}
            onClick={() => onSelectMeasure(measure)}
            className={`w-full text-left p-4 rounded-lg transition-colors ${
              selectedMeasureId === measure.id
                ? 'bg-accent-primary/10 border-2 border-accent-primary'
                : 'bg-dark-primary hover:bg-dark-secondary border-2 border-transparent'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div className={`p-2 rounded-lg bg-dark-secondary`}>
                  <Icon className="h-6 w-6 text-dark-text-secondary" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-dark-text-secondary">
                      {measure.id}
                    </span>
                    <span className="text-sm text-dark-text-secondary">•</span>
                    <span
                      className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                        measure.domain === 'chronic'
                          ? 'bg-accent-warning/10 text-accent-warning'
                          : measure.domain === 'acute'
                          ? 'bg-accent-error/10 text-accent-error'
                          : measure.domain === 'preventive'
                          ? 'bg-accent-success/10 text-accent-success'
                          : 'bg-accent-primary/10 text-accent-primary'
                      }`}
                    >
                      {measure.domain}
                    </span>
                  </div>
                  <h3 className="font-medium mt-1">{measure.title}</h3>
                  <p className="text-sm text-dark-text-secondary mt-1 line-clamp-2">
                    {measure.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {measure.performance?.target && (
                  <div className="text-right">
                    <div className={`text-lg font-semibold ${performanceColor}`}>
                      75%
                    </div>
                    <div className="text-xs text-dark-text-secondary">
                      Target: {measure.performance.target}%
                    </div>
                  </div>
                )}
                <ChevronRightIcon
                  className={`h-5 w-5 ${
                    selectedMeasureId === measure.id
                      ? 'text-accent-primary'
                      : 'text-dark-text-secondary'
                  }`}
                />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
