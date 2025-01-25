import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { DashboardData } from '@/services/api';

interface MetricCardProps {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}

function MetricCard({ title, value, icon: Icon, className = '' }: MetricCardProps) {
  return (
    <div className={`panel-detail p-4 relative ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-dark-text-secondary">{title}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="rounded-lg bg-accent-primary/10 p-2 transition-all duration-200 hover:bg-accent-primary/20">
          <Icon className="h-5 w-5 text-accent-primary" />
        </div>
      </div>
    </div>
  );
}

interface CareGapSummaryProps {
  summary: DashboardData['analytics']['careGapSummary'];
  loading?: boolean;
}

export default function CareGapSummary({ summary, loading }: CareGapSummaryProps) {
  if (loading) {
    return <div className="animate-pulse">Loading care gap summary...</div>;
  }

  return (
    <div className="panel-analytics relative">
      <h3 className="text-lg font-semibold mb-4">Care Gap Summary</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            title="High Priority"
            value={summary.byPriority.high}
            icon={ExclamationTriangleIcon}
            className="border-l-2 border-accent-error/50"
          />
          <MetricCard
            title="Medium Priority"
            value={summary.byPriority.medium}
            icon={ExclamationTriangleIcon}
            className="border-l-2 border-accent-warning/50"
          />
          <MetricCard
            title="Low Priority"
            value={summary.byPriority.low}
            icon={ExclamationTriangleIcon}
            className="border-l-2 border-accent-success/50"
          />
        </div>
        <div>
          <h4 className="text-sm font-medium mb-2">By Measure Type</h4>
          <div className="space-y-2">
            {Object.entries(summary.byMeasure).map(([measure, count]) => (
              <div key={measure} className="flex justify-between items-center p-2 rounded-lg bg-dark-secondary/20 hover:bg-dark-secondary/30 transition-all duration-200">
                <span className="text-sm">{measure}</span>
                <span className="text-sm font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
