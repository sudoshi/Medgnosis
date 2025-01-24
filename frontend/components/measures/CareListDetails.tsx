import {
  UserGroupIcon,
  ChartBarIcon,
  ClockIcon,
  CalendarIcon,
  ChatBubbleLeftIcon,
  ShareIcon,
  DocumentDuplicateIcon,
  ArchiveBoxIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { CareList } from '@/services/mockCareListData';
import type { PatientDetails } from '@/types/patient';
import { mockPatientsList } from '@/services/mockCareListData';
import PatientRow from '@/components/patients/PatientRow';

interface CareListDetailsProps {
  list: CareList;
  onClose: () => void;
}

function CareListMetric({
  icon: Icon,
  label,
  value,
  trend,
}: {
  icon: typeof ChartBarIcon;
  label: string;
  value: string | number;
  trend?: {
    value: number;
    label: string;
  };
}) {
  return (
    <div className="flex items-center space-x-3">
      <div className="p-2 rounded-lg bg-dark-secondary">
        <Icon className="h-5 w-5 text-dark-text-secondary" />
      </div>
      <div>
        <div className="text-sm text-dark-text-secondary">{label}</div>
        <div className="text-lg font-medium">{value}</div>
        {trend && (
          <div
            className={`text-xs ${
              trend.value >= 0 ? 'text-accent-success' : 'text-accent-error'
            }`}
          >
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CareListDetails({ list, onClose }: CareListDetailsProps) {
  const patients = mockPatientsList.filter(p => list.patients.includes(p.id.toString()));
  const highRiskCount = patients.filter(p => p.riskFactors.level === 'high').length;
  const careGapsCount = patients.reduce((sum, p) => sum + p.careGaps.length, 0);
  const avgRiskScore =
    Math.round(
      (patients.reduce((sum, p) => sum + p.riskFactors.score, 0) / patients.length) * 10
    ) / 10;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-hidden"
    >
      <button
        onClick={onClose}
        className="absolute inset-0 bg-black/50 w-full h-full"
        aria-label="Close details"
      />
      <div className="absolute inset-y-0 right-0 w-[800px] bg-dark-primary shadow-xl">
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-dark-border">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-2xl font-semibold">{list.name}</h2>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      list.type === 'measure-based'
                        ? 'bg-accent-primary/10 text-accent-primary'
                        : 'bg-accent-success/10 text-accent-success'
                    }`}
                  >
                    {list.type === 'measure-based' ? 'Measure Based' : 'Manual'}
                  </span>
                </div>
                <p className="mt-1 text-dark-text-secondary">{list.description}</p>
                <div className="mt-2 flex items-center space-x-2">
                  {list.tags.map(tag => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full text-xs bg-dark-secondary text-dark-text-secondary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button className="btn btn-secondary">
                  <ShareIcon className="h-5 w-5 mr-2" />
                  Share
                </button>
                <button className="btn btn-secondary">
                  <DocumentDuplicateIcon className="h-5 w-5 mr-2" />
                  Duplicate
                </button>
                <button className="btn btn-secondary text-accent-error">
                  <ArchiveBoxIcon className="h-5 w-5 mr-2" />
                  Archive
                </button>
              </div>
            </div>

            {/* Metrics */}
            <div className="mt-6 grid grid-cols-4 gap-6">
              <CareListMetric
                icon={UserGroupIcon}
                label="Total Patients"
                value={patients.length}
                trend={{
                  value: 12.5,
                  label: 'vs last month'
                }}
              />
              <CareListMetric
                icon={ChartBarIcon}
                label="High Risk"
                value={highRiskCount}
                trend={{
                  value: -5.2,
                  label: 'vs last month'
                }}
              />
              <CareListMetric
                icon={ClockIcon}
                label="Care Gaps"
                value={careGapsCount}
                trend={{
                  value: -8.1,
                  label: 'vs last month'
                }}
              />
              <CareListMetric
                icon={ChartBarIcon}
                label="Avg Risk Score"
                value={avgRiskScore}
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              {/* Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <button className="btn btn-primary">
                    <CalendarIcon className="h-5 w-5 mr-2" />
                    Schedule Follow-ups
                  </button>
                  <button className="btn btn-secondary">
                    <ChatBubbleLeftIcon className="h-5 w-5 mr-2" />
                    Message All
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Search patients..."
                    className="input"
                  />
                  <select className="input">
                    <option>All Patients</option>
                    <option>High Risk</option>
                    <option>With Care Gaps</option>
                    <option>Recently Added</option>
                  </select>
                </div>
              </div>

              {/* Patient List */}
              <div className="space-y-4">
                {patients.map((patient) => (
                  <PatientRow
                    key={patient.id}
                    patient={patient}
                    onClick={() => {}}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
