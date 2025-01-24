import type { DashboardData } from '@/services/api';
import type { ReactNode } from 'react';
import {
  ChartBarIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface AnalyticsOverviewProps {
  data: DashboardData['analytics'];
  loading?: boolean;
}

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}

function MetricCard({ title, value, icon: Icon, className = '' }: MetricCardProps) {
  return (
    <div className={`p-4 rounded-lg bg-dark-primary ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-dark-text-secondary">{title}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="rounded-lg bg-accent-primary/10 p-2">
          <Icon className="h-5 w-5 text-accent-primary" />
        </div>
      </div>
    </div>
  );
}

interface RiskDistributionItem {
  score: string;
  count: number;
}

interface RiskDistributionChartProps {
  distribution: RiskDistributionItem[];
}

function RiskDistributionChart({ distribution }: RiskDistributionChartProps) {
  const maxCount = Math.max(...distribution.map((d: RiskDistributionItem) => d.count));
  
  return (
    <div className="space-y-2">
      {distribution.map((item) => (
        <div key={item.score} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>{item.score}</span>
            <span>{item.count}</span>
          </div>
          <div className="h-2 rounded-full bg-dark-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-primary"
              style={{ width: `${(item.count / maxCount) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

interface CareGapSummaryProps {
  summary: DashboardData['analytics']['careGapSummary'];
}

function CareGapSummary({ summary }: CareGapSummaryProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          title="High Priority"
          value={summary.byPriority.high}
          icon={ExclamationTriangleIcon}
          className="border-l-4 border-accent-error"
        />
        <MetricCard
          title="Medium Priority"
          value={summary.byPriority.medium}
          icon={ExclamationTriangleIcon}
          className="border-l-4 border-accent-warning"
        />
        <MetricCard
          title="Low Priority"
          value={summary.byPriority.low}
          icon={ExclamationTriangleIcon}
          className="border-l-4 border-accent-success"
        />
      </div>
      <div className="mt-4">
        <h4 className="text-sm font-medium mb-2">By Measure Type</h4>
        <div className="space-y-2">
          {Object.entries(summary.byMeasure).map(([measure, count]) => (
            <div key={measure} className="flex justify-between items-center">
              <span className="text-sm">{measure}</span>
              <span className="text-sm font-medium">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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
          className="p-3 rounded-lg bg-dark-primary hover:bg-dark-secondary transition-colors"
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

  const { populationMetrics, careGapSummary, riskStratification, recentActivity } = data;

  return (
    <div className="space-y-6">
      {/* Population Overview */}
      <div className="card analytics-card">
        <h3 className="text-lg font-semibold mb-4">Population Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="Total Active Patients"
            value={populationMetrics.totalActive}
            icon={UserGroupIcon}
          />
          <MetricCard
            title="High Risk Patients"
            value={populationMetrics.byRiskLevel.high}
            icon={ExclamationTriangleIcon}
          />
          <MetricCard
            title="Care Gaps"
            value={careGapSummary.total}
            icon={ChartBarIcon}
          />
        </div>
      </div>

      {/* Risk Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card analytics-card">
          <h3 className="text-lg font-semibold mb-4">Risk Distribution</h3>
          <RiskDistributionChart distribution={riskStratification.distribution} />
        </div>

        <div className="card analytics-card">
          <h3 className="text-lg font-semibold mb-4">Care Gap Summary</h3>
          <CareGapSummary summary={careGapSummary} />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
        <RecentActivity events={recentActivity.events} />
      </div>
    </div>
  );
}
