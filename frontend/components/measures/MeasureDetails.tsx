import {
  BeakerIcon,
  DocumentTextIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import type { QualityMeasure } from '@/types/measure';

interface MeasureDetailsProps {
  measure: QualityMeasure;
  performance?: {
    eligible: number;
    excluded: number;
    compliant: number;
    performance: number;
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Criteria({
  title,
  items,
  type,
}: {
  title: string;
  items: string[];
  type: 'include' | 'exclude';
}) {
  const Icon = type === 'include' ? CheckCircleIcon : XCircleIcon;
  const colorClass = type === 'include' ? 'text-accent-success' : 'text-accent-error';

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-dark-text-secondary">{title}</h4>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex items-start space-x-2 text-sm"
          >
            <Icon className={`h-5 w-5 flex-shrink-0 ${colorClass}`} />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ValueSet({ title, oid, concepts }: { title: string; oid: string; concepts: any[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{title}</h4>
        <span className="text-xs text-dark-text-secondary">{oid}</span>
      </div>
      <div className="space-y-1">
        {concepts.map((concept, index) => (
          <div
            key={index}
            className="flex items-center justify-between text-sm bg-dark-secondary/50 px-3 py-2 rounded-lg"
          >
            <span>{concept.display}</span>
            <span className="text-dark-text-secondary">{concept.code}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MeasureDetails({ measure, performance }: MeasureDetailsProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-dark-text-secondary">
              {measure.id}
            </span>
            <span className="text-sm text-dark-text-secondary">•</span>
            <span className="text-sm font-medium text-dark-text-secondary">
              Version {measure.version}
            </span>
          </div>
          <h2 className="text-xl font-semibold mt-1">{measure.title}</h2>
          <p className="text-dark-text-secondary mt-2">{measure.description}</p>
        </div>
        {performance && (
          <div className="text-right">
            <div className="text-3xl font-bold text-accent-primary">
              {performance.performance}%
            </div>
            <div className="text-sm text-dark-text-secondary mt-1">
              {performance.compliant} / {performance.eligible} patients
            </div>
          </div>
        )}
      </div>

      {/* Clinical Information */}
      <Section title="Clinical Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-dark-text-secondary">Rationale</h4>
              <p className="text-sm mt-1">{measure.rationale}</p>
            </div>
            {measure.clinicalRecommendation && (
              <div>
                <h4 className="text-sm font-medium text-dark-text-secondary">
                  Clinical Recommendation
                </h4>
                <p className="text-sm mt-1">{measure.clinicalRecommendation}</p>
              </div>
            )}
          </div>
          <div>
            <h4 className="text-sm font-medium text-dark-text-secondary">Guidance</h4>
            <p className="text-sm mt-1">{measure.guidance}</p>
          </div>
        </div>
      </Section>

      {/* Population Criteria */}
      <Section title="Population Criteria">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Criteria
              title="Initial Population"
              items={[
                measure.criteria.initialPopulation.demographics?.ageMin
                  ? `Age ${measure.criteria.initialPopulation.demographics.ageMin}-${measure.criteria.initialPopulation.demographics.ageMax} years`
                  : '',
                'Qualifying Encounters',
                'Qualifying Diagnoses',
              ].filter(Boolean)}
              type="include"
            />
            {measure.criteria.denominatorExclusions && (
              <Criteria
                title="Exclusions"
                items={[
                  'Prior Antibiotics',
                  'Competing Diagnoses',
                ]}
                type="exclude"
              />
            )}
          </div>
          <div className="space-y-4">
            <Criteria
              title="Numerator"
              items={[
                'Required Tests',
                'Qualifying Results',
                `Within ${measure.criteria.numerator.timeframe.before} days before and ${measure.criteria.numerator.timeframe.after} days after`,
              ]}
              type="include"
            />
          </div>
        </div>
      </Section>

      {/* Value Sets */}
      <Section title="Value Sets">
        <div className="space-y-4">
          {measure.valuesets.map((vs) => (
            <ValueSet
              key={vs.oid}
              title={vs.name}
              oid={vs.oid}
              concepts={vs.concepts}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
