import {
  ChartBarIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

import AdminLayout from '@/components/layout/AdminLayout';

function LoadingStatCard({ icon: Icon }: { icon: typeof ChartBarIcon }) {
  return (
    <div className="card card-hover animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="h-4 w-24 bg-dark-secondary rounded" />
          <div className="mt-2 h-8 w-32 bg-dark-secondary rounded" />
          <div className="mt-1 h-4 w-36 bg-dark-secondary rounded" />
        </div>
        <div className="rounded-lg bg-accent-primary/10 p-3">
          <Icon className="h-6 w-6 text-accent-primary" />
        </div>
      </div>
      <div className="mt-4 h-4 w-48 bg-dark-secondary rounded" />
    </div>
  );
}

function LoadingList() {
  return (
    <div className="card animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 w-32 bg-dark-secondary rounded" />
        <div className="h-8 w-24 bg-dark-secondary rounded" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between p-3 rounded-lg bg-dark-primary"
          >
            <div className="flex items-center space-x-3">
              <div className="h-2 w-2 rounded-full bg-dark-secondary" />
              <div>
                <div className="h-5 w-32 bg-dark-secondary rounded" />
                <div className="mt-1 h-4 w-24 bg-dark-secondary rounded" />
              </div>
            </div>
            <div className="h-4 w-16 bg-dark-secondary rounded" />
          </div>
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
          <LoadingList />
          <LoadingList />
        </div>
      </div>
    </AdminLayout>
  );
}
