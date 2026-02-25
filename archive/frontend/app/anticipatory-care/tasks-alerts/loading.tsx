import {
  BellIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";

import AdminLayout from "@/components/layout/AdminLayout";

export default function TasksAlertsLoading() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="panel-stat">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-dark-text-secondary text-sm font-medium">
                  Total Tasks
                </p>
                <div className="mt-2 h-8 w-16 bg-dark-secondary animate-pulse rounded" />
              </div>
              <div className="rounded-lg bg-accent-primary/10 p-3">
                <ClipboardDocumentListIcon className="h-6 w-6 text-accent-primary" />
              </div>
            </div>
            <p className="mt-4 text-sm text-dark-text-secondary">
              Active tasks across all categories
            </p>
          </div>
          <div className="panel-stat">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-dark-text-secondary text-sm font-medium">
                  High Priority
                </p>
                <div className="mt-2 h-8 w-16 bg-dark-secondary animate-pulse rounded" />
              </div>
              <div className="rounded-lg bg-accent-error/10 p-3">
                <CheckCircleIcon className="h-6 w-6 text-accent-error" />
              </div>
            </div>
            <p className="mt-4 text-sm text-dark-text-secondary">
              Tasks requiring immediate attention
            </p>
          </div>
          <div className="panel-stat">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-dark-text-secondary text-sm font-medium">
                  New Alerts
                </p>
                <div className="mt-2 h-8 w-16 bg-dark-secondary animate-pulse rounded" />
              </div>
              <div className="rounded-lg bg-accent-warning/10 p-3">
                <BellIcon className="h-6 w-6 text-accent-warning" />
              </div>
            </div>
            <p className="mt-4 text-sm text-dark-text-secondary">
              Unread alerts requiring review
            </p>
          </div>
          <div className="panel-stat">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-dark-text-secondary text-sm font-medium">
                  Critical Results
                </p>
                <div className="mt-2 h-8 w-16 bg-dark-secondary animate-pulse rounded" />
              </div>
              <div className="rounded-lg bg-accent-error/10 p-3">
                <FunnelIcon className="h-6 w-6 text-accent-error" />
              </div>
            </div>
            <p className="mt-4 text-sm text-dark-text-secondary">
              High priority alerts to address
            </p>
          </div>
        </div>

        {/* Tasks Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Tasks</h2>
            <div className="flex space-x-2">
              {["All", "Personal", "Practice", "Patient"].map((type) => (
                <div
                  key={type}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-dark-secondary text-dark-text-secondary w-20 h-8 animate-pulse"
                />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="panel-detail p-4 space-y-4 animate-pulse">
                <div className="h-6 bg-dark-secondary rounded w-1/4" />
                <div className="h-4 bg-dark-secondary rounded w-3/4" />
                <div className="flex space-x-4">
                  <div className="h-4 bg-dark-secondary rounded w-20" />
                  <div className="h-4 bg-dark-secondary rounded w-32" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Alerts</h2>
            <div className="flex space-x-4">
              <div className="flex space-x-2">
                {["All", "General", "Specific"].map((type) => (
                  <div
                    key={type}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg bg-dark-secondary text-dark-text-secondary w-20 h-8 animate-pulse"
                  />
                ))}
              </div>
              <div className="flex space-x-2">
                {["All", "Lab", "Imaging", "Procedure"].map((category) => (
                  <div
                    key={category}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg bg-dark-secondary text-dark-text-secondary w-20 h-8 animate-pulse"
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="panel-detail p-4 space-y-4 animate-pulse">
                <div className="h-6 bg-dark-secondary rounded w-1/4" />
                <div className="h-4 bg-dark-secondary rounded w-3/4" />
                <div className="flex space-x-4">
                  <div className="h-4 bg-dark-secondary rounded w-20" />
                  <div className="h-4 bg-dark-secondary rounded w-32" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-4 bg-dark-secondary rounded w-3/4" />
                  <div className="h-4 bg-dark-secondary rounded w-3/4" />
                  <div className="h-4 bg-dark-secondary rounded w-3/4" />
                  <div className="h-4 bg-dark-secondary rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
