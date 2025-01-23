import AdminLayout from '@/components/layout/AdminLayout';
import {
  ChartBarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  UserIcon,
  ArrowLeftIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

interface TimelineEvent {
  id: number;
  type: 'encounter' | 'diagnosis' | 'observation' | 'care-gap';
  date: string;
  title: string;
  description: string;
  status?: string;
  value?: string;
  unit?: string;
}

const mockTimeline: TimelineEvent[] = [
  {
    id: 1,
    type: 'encounter',
    date: '2024-01-15',
    title: 'Office Visit',
    description: 'Routine follow-up appointment',
    status: 'Completed',
  },
  {
    id: 2,
    type: 'observation',
    date: '2024-01-15',
    title: 'Blood Pressure',
    description: 'Systolic blood pressure',
    value: '142',
    unit: 'mmHg',
  },
  {
    id: 3,
    type: 'diagnosis',
    date: '2024-01-15',
    title: 'Hypertension',
    description: 'Essential (primary) hypertension',
    status: 'Active',
  },
  {
    id: 4,
    type: 'care-gap',
    date: '2024-01-15',
    title: 'HbA1c Test Due',
    description: 'Last test was more than 3 months ago',
    status: 'Open',
  },
];

function TimelineSection() {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Timeline</h2>
      <div className="space-y-6">
        {mockTimeline.map((event) => (
          <div key={event.id} className="relative pl-8">
            <div className="absolute left-0 top-1.5">
              <div
                className={`h-3 w-3 rounded-full ${
                  event.type === 'encounter'
                    ? 'bg-accent-primary'
                    : event.type === 'observation'
                    ? 'bg-accent-success'
                    : event.type === 'diagnosis'
                    ? 'bg-accent-warning'
                    : 'bg-accent-error'
                }`}
              />
            </div>
            <div className="flex flex-col space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{event.title}</h3>
                <span className="text-sm text-dark-text-secondary">
                  {new Date(event.date).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-dark-text-secondary">{event.description}</p>
              {event.status && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    event.status === 'Completed' || event.status === 'Normal'
                      ? 'bg-accent-success/10 text-accent-success'
                      : event.status === 'Active'
                      ? 'bg-accent-warning/10 text-accent-warning'
                      : 'bg-accent-error/10 text-accent-error'
                  }`}
                >
                  {event.status}
                </span>
              )}
              {event.value && (
                <span className="text-sm">
                  {event.value} {event.unit}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskScoreCard() {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Risk Assessment</h2>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold text-accent-error">85</p>
          <p className="text-sm text-dark-text-secondary mt-1">High Risk</p>
        </div>
        <div className="h-16 w-16 rounded-full border-4 border-accent-error flex items-center justify-center">
          <span className="text-lg font-semibold">85%</span>
        </div>
      </div>
      <div className="mt-4">
        <h3 className="text-sm font-medium mb-2">Risk Factors</h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm">Age</span>
            <span className="text-sm font-medium">60%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">Conditions</span>
            <span className="text-sm font-medium">75%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">Labs</span>
            <span className="text-sm font-medium">90%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CareGapsCard() {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Care Gaps</h2>
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-dark-primary">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">HbA1c Test Due</h3>
              <p className="text-sm text-dark-text-secondary">Last test: 3 months ago</p>
            </div>
            <span className="badge badge-error">High Priority</span>
          </div>
        </div>
        <div className="p-3 rounded-lg bg-dark-primary">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Blood Pressure Check</h3>
              <p className="text-sm text-dark-text-secondary">Last check: 45 days ago</p>
            </div>
            <span className="badge badge-warning">Medium Priority</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PatientDetailPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/patients" className="btn btn-secondary">
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold">John Smith</h1>
              <p className="text-dark-text-secondary">MRN: 123456</p>
            </div>
          </div>
          <button className="btn btn-primary">
            <PencilIcon className="h-5 w-5 mr-2" />
            Edit Patient
          </button>
        </div>

        {/* Patient Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="card">
            <div className="flex items-center space-x-4">
              <div className="rounded-lg bg-accent-primary/10 p-3">
                <UserIcon className="h-6 w-6 text-accent-primary" />
              </div>
              <div>
                <p className="text-sm text-dark-text-secondary">Demographics</p>
                <p className="font-medium">59 years old, Male</p>
                <p className="text-sm text-dark-text-secondary">DOB: 03/15/1965</p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center space-x-4">
              <div className="rounded-lg bg-accent-warning/10 p-3">
                <ChartBarIcon className="h-6 w-6 text-accent-warning" />
              </div>
              <div>
                <p className="text-sm text-dark-text-secondary">Risk Score</p>
                <p className="font-medium">High Risk (85)</p>
                <p className="text-sm text-dark-text-secondary">↑ 5 points</p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center space-x-4">
              <div className="rounded-lg bg-accent-error/10 p-3">
                <ExclamationTriangleIcon className="h-6 w-6 text-accent-error" />
              </div>
              <div>
                <p className="text-sm text-dark-text-secondary">Care Gaps</p>
                <p className="font-medium">3 Open Gaps</p>
                <p className="text-sm text-dark-text-secondary">2 High Priority</p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center space-x-4">
              <div className="rounded-lg bg-accent-success/10 p-3">
                <ClockIcon className="h-6 w-6 text-accent-success" />
              </div>
              <div>
                <p className="text-sm text-dark-text-secondary">Last Encounter</p>
                <p className="font-medium">7 days ago</p>
                <p className="text-sm text-dark-text-secondary">Office Visit</p>
              </div>
            </div>
          </div>
        </div>

        {/* Three Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6 lg:col-span-2">
            <TimelineSection />
          </div>
          <div className="space-y-6">
            <RiskScoreCard />
            <CareGapsCard />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
