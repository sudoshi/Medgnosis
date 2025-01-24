import { Dialog } from '@headlessui/react';
import {
  ClipboardDocumentListIcon,
  XMarkIcon,
  UserGroupIcon,
  ChartBarIcon,
  ClockIcon,
  BeakerIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import type { PatientDetails } from '@/types/patient';

interface PatientDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: PatientDetails;
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

export default function PatientDetailModal({ isOpen, onClose, patient }: PatientDetailModalProps) {
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="relative z-50"
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-4xl rounded-lg bg-dark-primary p-6 shadow-xl">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-2xl font-semibold">
                {`${patient.name.first} ${patient.name.last}`}
              </Dialog.Title>
              <div className="mt-1 text-dark-text-secondary">
                <div className="flex items-center space-x-4">
                  <div>
                    Age: {patient.demographics.age}
                  </div>
                  <div>
                    Gender: {patient.demographics.gender}
                  </div>
                  <div>
                    Language: {patient.demographics.language}
                  </div>
                </div>
                <div className="flex items-center space-x-4 mt-1">
                  <div>
                    Phone: {patient.demographics.phone}
                  </div>
                  <div>
                    Email: {patient.demographics.email}
                  </div>
                  <div>
                    Address: {patient.demographics.address ? `${patient.demographics.address.street}, ${patient.demographics.address.city}, ${patient.demographics.address.state} ${patient.demographics.address.zip}` : 'Not provided'}
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-dark-text-secondary hover:bg-dark-secondary"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-6">
            {/* Risk Factors */}
            <Section title="Risk Factors" icon={ExclamationTriangleIcon}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-dark-text-secondary">Risk Score</div>
                    <div className="text-lg font-medium">{patient.riskFactors.score}</div>
                  </div>
                  <div>
                    <Badge
                      variant={
                        patient.riskFactors.level === 'high'
                          ? 'error'
                          : patient.riskFactors.level === 'medium'
                          ? 'warning'
                          : 'success'
                      }
                    >
                      {patient.riskFactors.level} risk
                    </Badge>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">Contributing Factors</div>
                  <div className="space-y-2">
                    {patient.riskFactors.factors.map((factor, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-dark-secondary rounded-lg"
                      >
                        <div>{factor.name}</div>
                        <div className="flex items-center space-x-4">
                          <div className="text-sm text-dark-text-secondary">
                            Last assessed: {factor.lastAssessed}
                          </div>
                          <Badge
                            variant={
                              factor.severity === 'high'
                                ? 'error'
                                : factor.severity === 'medium'
                                ? 'warning'
                                : 'success'
                            }
                          >
                            {factor.severity}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            {/* Conditions */}
            <Section title="Active Conditions" icon={BeakerIcon}>
              <div className="space-y-2">
                {patient.conditions.map(condition => (
                  <div
                    key={condition.id}
                    className="p-2 bg-dark-secondary rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{condition.name}</div>
                        <div className="text-sm text-dark-text-secondary">
                          Diagnosed: {condition.diagnosedDate}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <Badge
                          variant={
                            condition.controlStatus === 'uncontrolled'
                              ? 'error'
                              : condition.controlStatus === 'controlled'
                              ? 'success'
                              : 'warning'
                          }
                        >
                          {condition.controlStatus}
                        </Badge>
                        <div className="text-sm text-dark-text-secondary">
                          Last assessed: {condition.lastAssessed}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Care Gaps */}
            <Section title="Care Gaps" icon={ClipboardDocumentListIcon}>
              <div className="space-y-2">
                {patient.careGaps.map(gap => (
                  <div
                    key={gap.id}
                    className="p-2 bg-dark-secondary rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{gap.measure}</div>
                        <div className="text-sm text-dark-text-secondary">
                          {gap.description}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-sm text-dark-text-secondary">
                          Due: {gap.dueDate}
                        </div>
                        <Badge
                          variant={
                            gap.priority === 'high'
                              ? 'error'
                              : gap.priority === 'medium'
                              ? 'warning'
                              : 'success'
                          }
                        >
                          {gap.priority}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Labs */}
            <Section title="Recent Labs" icon={BeakerIcon}>
              <div className="space-y-2">
                {patient.labs.map(lab => (
                  <div
                    key={lab.id}
                    className="p-2 bg-dark-secondary rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{lab.name}</div>
                        <div className="text-sm text-dark-text-secondary">
                          {lab.value} {lab.unit} • {lab.date}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <Badge
                          variant={
                            lab.status === 'critical'
                              ? 'error'
                              : lab.status === 'abnormal'
                              ? 'warning'
                              : 'success'
                          }
                        >
                          {lab.status}
                        </Badge>
                        {lab.trend && (
                          <div className="flex items-center space-x-1">
                            <ChartBarIcon
                              className={`h-4 w-4 ${
                                lab.trend === 'up'
                                  ? 'text-accent-error'
                                  : lab.trend === 'down'
                                  ? 'text-accent-success'
                                  : 'text-dark-text-secondary'
                              }`}
                            />
                            <span className="text-sm text-dark-text-secondary">
                              {lab.trend}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Recent Encounters */}
            <Section title="Recent Encounters" icon={ClockIcon}>
              <div className="space-y-2">
                {patient.encounters.map(encounter => (
                  <div
                    key={encounter.id}
                    className="p-2 bg-dark-secondary rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{encounter.type}</div>
                        <div className="text-sm text-dark-text-secondary">
                          {encounter.summary}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-sm text-dark-text-secondary">
                          {encounter.date}
                        </div>
                        {encounter.followUpNeeded && (
                          <Badge variant="warning">
                            Follow-up: {encounter.followUpDate}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Care Team */}
            <Section title="Care Team" icon={UserGroupIcon}>
              <div className="space-y-2">
                {patient.careTeam.map(member => (
                  <div
                    key={member.id}
                    className="p-2 bg-dark-secondary rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{member.name}</div>
                        <div className="text-sm text-dark-text-secondary">
                          {member.role}
                          {member.specialty && ` • ${member.specialty}`}
                        </div>
                      </div>
                      {member.primary && (
                        <Badge variant="success">Primary</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
