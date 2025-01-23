import AdminLayout from '@/components/layout/AdminLayout';
import {
  ChartBarIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

function LoadingPulse() {
  return <div className="animate-pulse bg-dark-secondary rounded h-4" />;
}

function LoadingStatCard({ icon: Icon }: { icon: typeof ChartBarIcon }) {
  return (
    <div className="card card-hover">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="w-24">
            <LoadingPulse />
          </div>
          <div className="w-16 h-8">
            <LoadingPulse />
          </div>
          <div className="w-32">
            <LoadingPulse />
          </div>
        </div>
        <div className="rounded-lg bg-accent-primary/10 p-3">
          <Icon className="h-6 w-6 text-accent-primary" />
        </div>
      </div>
    </div>
  );
}

function LoadingCareGap() {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-dark-primary hover:bg-dark-secondary transition-colors">
      <div className="flex items-center space-x-3">
        <div className="h-2 w-2 rounded-full bg-dark-secondary animate-pulse" />
        <div className="space-y-2">
          <div className="w-32">
            <LoadingPulse />
          </div>
          <div className="w-48">
            <LoadingPulse />
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <div className="w-16 h-6 rounded-full bg-dark-secondary animate-pulse" />
      </div>
    </div>
  );
}

function LoadingCareGapsList() {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="w-24">
          <LoadingPulse />
        </div>
        <div className="w-20 h-8 rounded-md bg-dark-secondary animate-pulse" />
      </div>
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <LoadingCareGap key={i} />
        ))}
      </div>
    </div>
  );
}

function LoadingRiskPatient() {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-dark-primary hover:bg-dark-secondary transition-colors">
      <div>
        <div className="w-32 mb-2">
          <LoadingPulse />
        </div>
        <div className="flex items-center space-x-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-20 h-6 rounded-full bg-dark-secondary animate-pulse"
            />
          ))}
        </div>
      </div>
      <div className="text-right space-y-2">
        <div className="w-16 h-6 rounded-full bg-dark-secondary animate-pulse ml-auto" />
        <div className="w-32">
          <LoadingPulse />
        </div>
      </div>
    </div>
  );
}

function LoadingHighRiskPatientsList() {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="w-32">
          <LoadingPulse />
        </div>
        <div className="w-20 h-8 rounded-md bg-dark-secondary animate-pulse" />
      </div>
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <LoadingRiskPatient key={i} />
        ))}
      </div>
    </div>
  );
}

export default function LoadingDashboard() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <LoadingStatCard icon={UserGroupIcon} />
          <LoadingStatCard icon={ChartBarIcon} />
          <LoadingStatCard icon={ExclamationTriangleIcon} />
          <LoadingStatCard icon={ClockIcon} />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <LoadingCareGapsList />
          <LoadingHighRiskPatientsList />
        </div>
      </div>
    </AdminLayout>
  );
}
