import AdminLayout from '@/components/layout/AdminLayout';
import {
  ChartBarIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: typeof ChartBarIcon;
  trend?: {
    value: number;
    label: string;
  };
}

function StatCard({ title, value, description, icon: Icon, trend }: StatCardProps) {
  return (
    <div className="card card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-dark-text-secondary text-sm font-medium">{title}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
          {trend && (
            <p className={`mt-1 text-sm ${trend.value >= 0 ? 'text-accent-success' : 'text-accent-error'}`}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-accent-primary/10 p-3">
          <Icon className="h-6 w-6 text-accent-primary" />
        </div>
      </div>
      <p className="mt-4 text-sm text-dark-text-secondary">{description}</p>
    </div>
  );
}

interface CareGap {
  id: number;
  patient: string;
  measure: string;
  daysOpen: number;
  priority: 'high' | 'medium' | 'low';
}

const careGaps: CareGap[] = [
  {
    id: 1,
    patient: 'John Doe',
    measure: 'HbA1c Test Due',
    daysOpen: 45,
    priority: 'high',
  },
  {
    id: 2,
    patient: 'Jane Smith',
    measure: 'Blood Pressure Check',
    daysOpen: 30,
    priority: 'medium',
  },
  {
    id: 3,
    patient: 'Robert Johnson',
    measure: 'Annual Wellness Visit',
    daysOpen: 15,
    priority: 'low',
  },
];

function CareGapsList() {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Care Gaps</h3>
        <button className="btn btn-secondary">View All</button>
      </div>
      <div className="space-y-4">
        {careGaps.map((gap) => (
          <div
            key={gap.id}
            className="flex items-center justify-between p-3 rounded-lg bg-dark-primary hover:bg-dark-secondary transition-colors"
          >
            <div className="flex items-center space-x-3">
              <div
                className={`h-2 w-2 rounded-full ${
                  gap.priority === 'high'
                    ? 'bg-accent-error'
                    : gap.priority === 'medium'
                    ? 'bg-accent-warning'
                    : 'bg-accent-success'
                }`}
              />
              <div>
                <p className="font-medium">{gap.patient}</p>
                <p className="text-sm text-dark-text-secondary">{gap.measure}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-dark-text-secondary">
              <ClockIcon className="h-4 w-4" />
              <span className="text-sm">{gap.daysOpen} days</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface RiskPatient {
  id: number;
  name: string;
  riskScore: number;
  conditions: string[];
  lastEncounter: string;
}

const highRiskPatients: RiskPatient[] = [
  {
    id: 1,
    name: 'Alice Brown',
    riskScore: 85,
    conditions: ['Diabetes', 'Hypertension', 'CHF'],
    lastEncounter: '2024-01-15',
  },
  {
    id: 2,
    name: 'Charles Wilson',
    riskScore: 78,
    conditions: ['COPD', 'Asthma'],
    lastEncounter: '2024-01-10',
  },
  {
    id: 3,
    name: 'Emma Davis',
    riskScore: 72,
    conditions: ['CKD', 'Diabetes'],
    lastEncounter: '2024-01-05',
  },
];

function HighRiskPatientsList() {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">High Risk Patients</h3>
        <button className="btn btn-secondary">View All</button>
      </div>
      <div className="space-y-4">
        {highRiskPatients.map((patient) => (
          <div
            key={patient.id}
            className="flex items-center justify-between p-3 rounded-lg bg-dark-primary hover:bg-dark-secondary transition-colors"
          >
            <div>
              <p className="font-medium">{patient.name}</p>
              <div className="flex items-center space-x-2 mt-1">
                {patient.conditions.map((condition, index) => (
                  <span
                    key={index}
                    className="inline-block px-2 py-1 text-xs rounded-full bg-dark-secondary text-dark-text-secondary"
                  >
                    {condition}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-accent-error">
                {patient.riskScore}%
              </div>
              <p className="text-sm text-dark-text-secondary">
                Last seen: {new Date(patient.lastEncounter).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Patients"
            value="1,234"
            description="Active patients under care"
            icon={UserGroupIcon}
            trend={{ value: 12, label: 'vs last month' }}
          />
          <StatCard
            title="Risk Score Avg"
            value="65.8"
            description="Population risk assessment"
            icon={ChartBarIcon}
            trend={{ value: -5, label: 'vs last month' }}
          />
          <StatCard
            title="Care Gaps"
            value="89"
            description="Open care gaps requiring attention"
            icon={ExclamationTriangleIcon}
            trend={{ value: 8, label: 'vs last month' }}
          />
          <StatCard
            title="Encounters"
            value="456"
            description="Patient encounters this month"
            icon={ClockIcon}
            trend={{ value: 15, label: 'vs last month' }}
          />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CareGapsList />
          <HighRiskPatientsList />
        </div>
      </div>
    </AdminLayout>
  );
}
