import {
  ChartBarIcon,
  ClockIcon,
  CalendarIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  EllipsisHorizontalIcon,
  UserIcon,
  PhoneIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';
import type { PatientDetails } from '@/types/patient';

interface PatientRowProps {
  patient: PatientDetails;
  onClick: () => void;
}

function PriorityIndicator({ level }: { level: 'high' | 'medium' | 'low' }) {
  return (
    <div
      className={`w-2 h-2 rounded-full ${
        level === 'high'
          ? 'bg-accent-error animate-pulse'
          : level === 'medium'
          ? 'bg-accent-warning'
          : 'bg-accent-success'
      }`}
    />
  );
}

function ClinicalTag({
  value,
  label,
  trend,
  urgent,
}: {
  value: string | number;
  label: string;
  trend?: 'up' | 'down' | 'stable';
  urgent?: boolean;
}) {
  return (
    <div
      className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs ${
        urgent
          ? 'bg-accent-error/10 text-accent-error'
          : 'bg-dark-secondary text-dark-text-secondary'
      }`}
    >
      <span className="font-medium">{value}</span>
      <span>{label}</span>
      {trend && (
        <span>
          {trend === 'up' ? (
            <ArrowTrendingUpIcon className="h-3 w-3 text-accent-error" />
          ) : trend === 'down' ? (
            <ArrowTrendingDownIcon className="h-3 w-3 text-accent-success" />
          ) : null}
        </span>
      )}
    </div>
  );
}

function CareGapBadge({ gap }: { gap: PatientDetails['careGaps'][0] }) {
  return (
    <div
      className={`flex items-center space-x-2 px-2 py-1 rounded-lg text-xs ${
        gap.priority === 'high'
          ? 'bg-accent-error/10 text-accent-error'
          : gap.priority === 'medium'
          ? 'bg-accent-warning/10 text-accent-warning'
          : 'bg-accent-success/10 text-accent-success'
      }`}
    >
      <span>{gap.measure}</span>
      <span>•</span>
      <span>{new Date(gap.dueDate).toLocaleDateString()}</span>
    </div>
  );
}

function QuickActions() {
  const actions = [
    { label: 'Schedule', icon: CalendarIcon },
    { label: 'Message', icon: EnvelopeIcon },
    { label: 'Call', icon: PhoneIcon },
  ];

  return (
    <div className="flex items-center space-x-2">
      {actions.map(({ label, icon: Icon }) => (
        <button
          key={label}
          className="p-1 hover:bg-dark-secondary rounded-lg text-dark-text-secondary hover:text-dark-text-primary"
          onClick={(e) => {
            e.stopPropagation();
            console.log(`Quick action: ${label}`);
          }}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

export default function PatientRow({ patient, onClick }: PatientRowProps) {
  const hasUrgentCareGaps = patient.careGaps.some((gap) => gap.priority === 'high');
  const riskTrend = patient.riskFactors.trending;
  const lastEncounterDate = new Date(patient.encounters[0]?.date);
  const daysSinceLastEncounter = Math.floor(
    (Date.now() - lastEncounterDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <button
      onClick={onClick}
      className="w-full text-left group relative flex items-start gap-4 p-4 hover:bg-dark-secondary/50 rounded-lg cursor-pointer border border-transparent hover:border-dark-border transition-all"
    >
      {/* Priority Indicator */}
      <div className="pt-2">
        <PriorityIndicator
          level={
            hasUrgentCareGaps || patient.riskFactors.level === 'high'
              ? 'high'
              : patient.riskFactors.level === 'medium'
              ? 'medium'
              : 'low'
          }
        />
      </div>

      {/* Patient Info */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-medium">{patient.name}</h3>
              <span className="text-sm text-dark-text-secondary">
                {patient.demographics.age}y • {patient.demographics.gender}
              </span>
            </div>
            <div className="mt-1 text-sm text-dark-text-secondary">
              <span>Last visit: {daysSinceLastEncounter} days ago</span>
              {patient.careTeam[0] && (
                <>
                  <span> • </span>
                  <span>PCP: {patient.careTeam[0].name}</span>
                </>
              )}
            </div>
          </div>
          <QuickActions />
        </div>

        {/* Clinical Status */}
        <div className="flex items-center gap-3">
          <ClinicalTag
            value={patient.riskFactors.score}
            label="Risk"
            trend={riskTrend}
            urgent={patient.riskFactors.level === 'high'}
          />
          {patient.conditions.slice(0, 3).map((condition) => (
            <ClinicalTag
              key={condition.id}
              value={condition.name}
              label={condition.status}
            />
          ))}
          {patient.conditions.length > 3 && (
            <span className="text-sm text-dark-text-secondary">
              +{patient.conditions.length - 3} more
            </span>
          )}
        </div>

        {/* Care Gaps */}
        {patient.careGaps.length > 0 && (
          <div className="flex items-center gap-2">
            {patient.careGaps.slice(0, 3).map((gap) => (
              <CareGapBadge key={gap.id} gap={gap} />
            ))}
            {patient.careGaps.length > 3 && (
              <span className="text-sm text-dark-text-secondary">
                +{patient.careGaps.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Labs & Metrics */}
        {patient.labs.length > 0 && (
          <div className="flex items-center gap-3">
            {patient.labs.map((lab) => (
              <div
                key={lab.id}
                className="flex items-center space-x-2 text-sm"
              >
                <span className="text-dark-text-secondary">{lab.name}:</span>
                {lab.components && lab.components[0] && (
                  <span
                    className={
                      lab.status === 'abnormal'
                        ? 'text-accent-error font-medium'
                        : 'text-dark-text-primary'
                    }
                  >
                    {lab.components[0].value} {lab.components[0].unit}
                  </span>
                )}
                <span className="text-dark-text-secondary">
                  ({new Date(lab.date).toLocaleDateString()})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
