import {
  ClipboardDocumentListIcon,
  InformationCircleIcon,
  DocumentTextIcon,
  ChartBarIcon,
  UserGroupIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import type { QualityMeasure, MeasurePopulationAnalysis } from '@/types/measure';

interface MeasureDetailsProps {
  measure: QualityMeasure;
  performance?: MeasurePopulationAnalysis;
  onCreateCareList?: () => void;
  selectedForCareList?: boolean;
}

function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'error' }) {
  const colors = {
    default: 'bg-dark-secondary text-dark-text-secondary',
    success: 'bg-accent-success/10 text-accent-success',
    warning: 'bg-accent-warning/10 text-accent-warning',
    error: 'bg-accent-error/10 text-accent-error',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[variant]}`}>
      {children}
    </span>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof InformationCircleIcon; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Icon className="h-5 w-5 text-dark-text-secondary" />
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className="pl-7">{children}</div>
    </div>
  );
}

export default function MeasureDetails({ measure, performance, onCreateCareList, selectedForCareList }: MeasureDetailsProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-2xl font-semibold">{measure.title}</h2>
              <Badge>{measure.implementation.category}</Badge>
              <Badge>{measure.implementation.code}</Badge>
            </div>
            <p className="mt-1 text-dark-text-secondary">
              {measure.implementation.version} • {measure.steward}
            </p>
          </div>
          {onCreateCareList && (
            <button 
              onClick={onCreateCareList}
              className={`btn ${selectedForCareList ? 'btn-secondary' : 'btn-primary'}`}
              disabled={selectedForCareList}
            >
              {selectedForCareList ? (
                <>
                  <ClipboardDocumentListIcon className="h-5 w-5 mr-2" />
                  Selected for Care List
                </>
              ) : (
                <>
                  <PlusIcon className="h-5 w-5 mr-2" />
                  Add to Care List
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6">
        <Section title="Description" icon={DocumentTextIcon}>
          <p className="text-sm">{measure.description}</p>
          {measure.rationale && (
            <div className="mt-3">
              <h4 className="text-sm font-medium mb-1">Rationale</h4>
              <p className="text-sm text-dark-text-secondary">{measure.rationale}</p>
            </div>
          )}
        </Section>

        {measure.guidance && (
          <Section title="Implementation Guidance" icon={InformationCircleIcon}>
            <div className="prose prose-sm dark:prose-invert">
              <p>{measure.guidance}</p>
              {measure.clinicalRecommendation && (
                <div className="mt-3 p-3 bg-dark-secondary rounded-lg">
                  <p className="font-medium mb-1">Clinical Recommendation</p>
                  <p className="text-dark-text-secondary">{measure.clinicalRecommendation}</p>
                </div>
              )}
            </div>
          </Section>
        )}

        {performance && (
          <Section title="Population Analysis" icon={UserGroupIcon}>
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 bg-dark-secondary rounded-lg">
                <div className="text-sm text-dark-text-secondary">Eligible</div>
                <div className="text-2xl font-semibold mt-1">{performance.eligible}</div>
              </div>
              <div className="p-4 bg-dark-secondary rounded-lg">
                <div className="text-sm text-dark-text-secondary">Excluded</div>
                <div className="text-2xl font-semibold mt-1">{performance.excluded}</div>
              </div>
              <div className="p-4 bg-dark-secondary rounded-lg">
                <div className="text-sm text-dark-text-secondary">Compliant</div>
                <div className="text-2xl font-semibold mt-1">{performance.compliant}</div>
              </div>
              <div className="p-4 bg-dark-secondary rounded-lg">
                <div className="text-sm text-dark-text-secondary">Performance</div>
                <div className="text-2xl font-semibold mt-1">{performance.performance}%</div>
              </div>
            </div>
          </Section>
        )}

        {measure.performance && (
          <Section title="Performance Targets" icon={ChartBarIcon}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-dark-text-secondary">Target</div>
                  <div className="text-lg font-medium">{measure.performance.target}%</div>
                </div>
                <div>
                  <div className="text-sm text-dark-text-secondary">Benchmark</div>
                  <div className="text-lg font-medium">{measure.performance.benchmark}%</div>
                </div>
                <div>
                  <div className="text-sm text-dark-text-secondary">Improvement Goal</div>
                  <div className="text-lg font-medium">+{measure.performance.improvement}%</div>
                </div>
              </div>
              {performance && (
                <div className="h-2 bg-dark-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-primary"
                    style={{ width: `${performance.performance}%` }}
                  />
                </div>
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
