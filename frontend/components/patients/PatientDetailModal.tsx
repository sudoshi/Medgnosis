import { useState } from 'react';
import type { PatientDetails, PatientAction, ClinicalAlert } from '@/types/patient';
import Modal from '@/components/ui/modal';
import {
  UserIcon,
  ChartBarIcon,
  HeartIcon,
  BeakerIcon,
  ClockIcon,
  UserGroupIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface PatientDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: PatientDetails;
  onAction?: (action: PatientAction) => void;
}

type TabType = 'overview' | 'conditions' | 'care-gaps' | 'labs' | 'encounters' | 'care-team';

function TabButton({ active, icon: Icon, label, onClick }: {
  active: boolean;
  icon: typeof UserIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
        active
          ? 'bg-accent-primary text-white'
          : 'text-dark-text-secondary hover:bg-dark-secondary'
      }`}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  );
}

function RiskBadge({ level, score }: { level: string; score: number }) {
  const colors = {
    high: 'bg-accent-error/10 text-accent-error',
    medium: 'bg-accent-warning/10 text-accent-warning',
    low: 'bg-accent-success/10 text-accent-success',
  }[level];

  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-full ${colors}`}>
      <span className="text-sm font-medium">Risk Score: {score}</span>
    </div>
  );
}

function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const colors = {
    active: 'bg-accent-success/10 text-accent-success',
    completed: 'bg-accent-primary/10 text-accent-primary',
    open: 'bg-accent-warning/10 text-accent-warning',
    critical: 'bg-accent-error/10 text-accent-error',
    normal: 'bg-accent-success/10 text-accent-success',
    abnormal: 'bg-accent-warning/10 text-accent-warning',
  }[status.toLowerCase()];

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${colors} ${className}`}>
      {status}
    </span>
  );
}

function ActionButton({ label, onClick, primary = false }: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg transition-colors ${
        primary
          ? 'bg-accent-primary text-white hover:bg-accent-primary/90'
          : 'bg-dark-secondary text-dark-text-primary hover:bg-dark-secondary/90'
      }`}
    >
      {label}
    </button>
  );
}

export default function PatientDetailModal({
  isOpen,
  onClose,
  patient,
  onAction,
}: PatientDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const handleAction = (action: Partial<PatientAction>) => {
    if (onAction) {
      onAction({
        id: Date.now(),
        status: 'pending',
        priority: 'medium',
        dueDate: new Date().toISOString(),
        ...action,
      } as PatientAction);
    }
  };

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Demographics */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-medium text-dark-text-secondary mb-2">Demographics</h4>
          <dl className="space-y-2">
            <div>
              <dt className="text-sm text-dark-text-secondary">Age</dt>
              <dd>{patient.demographics.age} years</dd>
            </div>
            <div>
              <dt className="text-sm text-dark-text-secondary">Gender</dt>
              <dd>{patient.demographics.gender}</dd>
            </div>
            <div>
              <dt className="text-sm text-dark-text-secondary">Language</dt>
              <dd>{patient.demographics.language}</dd>
            </div>
          </dl>
        </div>
        <div>
          <h4 className="text-sm font-medium text-dark-text-secondary mb-2">Contact</h4>
          <dl className="space-y-2">
            <div>
              <dt className="text-sm text-dark-text-secondary">Phone</dt>
              <dd>{patient.demographics.phone}</dd>
            </div>
            <div>
              <dt className="text-sm text-dark-text-secondary">Email</dt>
              <dd>{patient.demographics.email}</dd>
            </div>
            <div>
              <dt className="text-sm text-dark-text-secondary">Address</dt>
              <dd>{patient.demographics.address}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Risk Factors */}
      <div>
        <h4 className="text-sm font-medium text-dark-text-secondary mb-2">Risk Factors</h4>
        <div className="space-y-3">
          {patient.riskFactors.factors.map((factor, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 rounded-lg bg-dark-secondary"
            >
              <div>
                <p className="font-medium">{factor.name}</p>
                <p className="text-sm text-dark-text-secondary">
                  Last assessed: {new Date(factor.lastAssessed).toLocaleDateString()}
                </p>
              </div>
              <StatusBadge status={factor.severity} />
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex space-x-4">
        <ActionButton
          label="Schedule Follow-up"
          onClick={() =>
            handleAction({
              type: 'appointment',
              description: 'Schedule follow-up appointment',
            })
          }
        />
        <ActionButton
          label="Add to Care Management"
          onClick={() =>
            handleAction({
              type: 'program',
              description: 'Enroll in care management program',
            })
          }
          primary
        />
      </div>
    </div>
  );

  const renderConditionsTab = () => (
    <div className="space-y-4">
      {patient.conditions.map((condition) => (
        <div
          key={condition.id}
          className="p-4 rounded-lg bg-dark-secondary"
        >
          <div className="flex justify-between items-start mb-2">
            <div>
              <h4 className="font-medium">{condition.name}</h4>
              <p className="text-sm text-dark-text-secondary">
                Diagnosed: {new Date(condition.diagnosedDate).toLocaleDateString()}
              </p>
            </div>
            <StatusBadge status={condition.status} />
          </div>
          <div className="flex items-center space-x-4 mt-3">
            <span className="text-sm text-dark-text-secondary">
              Control Status: {condition.controlStatus}
            </span>
            <span className="text-sm text-dark-text-secondary">
              Last Assessed: {new Date(condition.lastAssessed).toLocaleDateString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );

  const renderCareGapsTab = () => (
    <div className="space-y-4">
      {patient.careGaps.map((gap) => (
        <div
          key={gap.id}
          className="p-4 rounded-lg bg-dark-secondary"
        >
          <div className="flex justify-between items-start mb-2">
            <div>
              <h4 className="font-medium">{gap.measure}</h4>
              <p className="text-sm text-dark-text-secondary">
                {gap.description}
              </p>
            </div>
            <StatusBadge status={gap.priority} />
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm text-dark-text-secondary">
              Due: {new Date(gap.dueDate).toLocaleDateString()}
            </span>
            <ActionButton
              label="Address Gap"
              onClick={() =>
                handleAction({
                  type: 'care_gap',
                  description: `Address care gap: ${gap.measure}`,
                  priority: gap.priority,
                })
              }
            />
          </div>
        </div>
      ))}
    </div>
  );

  const renderLabsTab = () => (
    <div className="space-y-4">
      {patient.labs.map((lab) => (
        <div
          key={lab.id}
          className="p-4 rounded-lg bg-dark-secondary"
        >
          <div className="flex justify-between items-start mb-2">
            <div>
              <h4 className="font-medium">{lab.name}</h4>
              <p className="text-xl font-semibold mt-1">
                {lab.value} {lab.unit}
              </p>
            </div>
            <StatusBadge status={lab.status} />
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm text-dark-text-secondary">
              Date: {new Date(lab.date).toLocaleDateString()}
            </span>
            <span className={`text-sm ${
              lab.trend === 'improving'
                ? 'text-accent-success'
                : lab.trend === 'worsening'
                ? 'text-accent-error'
                : 'text-dark-text-secondary'
            }`}>
              Trend: {lab.trend}
            </span>
          </div>
        </div>
      ))}
    </div>
  );

  const renderEncountersTab = () => (
    <div className="space-y-4">
      {patient.encounters.map((encounter) => (
        <div
          key={encounter.id}
          className="p-4 rounded-lg bg-dark-secondary"
        >
          <div className="flex justify-between items-start mb-2">
            <div>
              <h4 className="font-medium">{encounter.type}</h4>
              <p className="text-sm text-dark-text-secondary">
                Provider: {encounter.provider}
              </p>
            </div>
            <span className="text-sm text-dark-text-secondary">
              {new Date(encounter.date).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm mt-2">{encounter.summary}</p>
          {encounter.followUpNeeded && (
            <div className="mt-3 flex justify-between items-center">
              <span className="text-sm text-accent-warning">
                Follow-up needed by: {encounter.followUpDate}
              </span>
              <ActionButton
                label="Schedule Follow-up"
                onClick={() =>
                  handleAction({
                    type: 'appointment',
                    description: `Schedule follow-up for ${encounter.type}`,
                  })
                }
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderCareTeamTab = () => (
    <div className="space-y-4">
      {patient.careTeam.map((member) => (
        <div
          key={member.id}
          className="p-4 rounded-lg bg-dark-secondary"
        >
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-medium">
                {member.name}
                {member.primary && (
                  <span className="ml-2 text-xs bg-accent-primary/10 text-accent-primary px-2 py-1 rounded-full">
                    Primary
                  </span>
                )}
              </h4>
              <p className="text-sm text-dark-text-secondary">
                {member.role}
                {member.specialty && ` - ${member.specialty}`}
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <p className="text-sm">
              <span className="text-dark-text-secondary">Phone:</span> {member.phone}
            </p>
            <p className="text-sm">
              <span className="text-dark-text-secondary">Email:</span> {member.email}
            </p>
          </div>
        </div>
      ))}
    </div>
  );

  const tabs = [
    { id: 'overview', label: 'Overview', icon: UserIcon },
    { id: 'conditions', label: 'Conditions', icon: HeartIcon },
    { id: 'care-gaps', label: 'Care Gaps', icon: ExclamationTriangleIcon },
    { id: 'labs', label: 'Labs', icon: BeakerIcon },
    { id: 'encounters', label: 'Encounters', icon: ClockIcon },
    { id: 'care-team', label: 'Care Team', icon: UserGroupIcon },
  ] as const;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={patient.name} size="xl">
      <div className="flex items-center justify-between mb-6">
        <RiskBadge level={patient.riskFactors.level} score={patient.riskFactors.score} />
        <div className="flex items-center space-x-2">
          <span className="text-sm text-dark-text-secondary">
            Trend: {patient.riskFactors.trending}
          </span>
        </div>
      </div>

      <div className="flex space-x-2 mb-6 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            icon={tab.icon}
            label={tab.label}
            onClick={() => setActiveTab(tab.id as TabType)}
          />
        ))}
      </div>

      <div className="mt-6">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'conditions' && renderConditionsTab()}
        {activeTab === 'care-gaps' && renderCareGapsTab()}
        {activeTab === 'labs' && renderLabsTab()}
        {activeTab === 'encounters' && renderEncountersTab()}
        {activeTab === 'care-team' && renderCareTeamTab()}
      </div>
    </Modal>
  );
}
