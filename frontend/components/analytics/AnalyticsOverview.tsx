import type { DashboardData } from '@/services/api';
import type { ReactNode } from 'react';

interface AnalyticsOverviewProps {
  data: DashboardData['analytics'];
  loading?: boolean;
}

interface RecentActivityProps {
  events: DashboardData['analytics']['recentActivity']['events'];
}

function RecentActivity({ events }: RecentActivityProps) {
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div
          key={event.id}
          className="p-3 rounded-lg bg-dark-secondary/20 hover:bg-dark-secondary/30 transition-all duration-200"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium">{event.patient}</p>
              <p className="text-sm text-dark-text-secondary">
                {event.description}
              </p>
            </div>
            <span className="text-xs text-dark-text-secondary">
              {new Date(event.date).toLocaleDateString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsOverview({ data, loading }: AnalyticsOverviewProps) {
  if (loading) {
    return <div className="animate-pulse">Loading analytics...</div>;
  }

  const { recentActivity } = data;

  return (
    <div className="space-y-6">
      {/* Recent Activity */}
      <div className="panel-analytics relative">
        <h3 className="text-lg font-semibold mb-4 text-dark-text-primary">Recent Activity</h3>
        <RecentActivity events={recentActivity.events} />
      </div>
    </div>
  );
}
