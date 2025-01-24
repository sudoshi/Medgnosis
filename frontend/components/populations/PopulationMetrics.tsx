import {
  UsersIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface MetricCardProps {
  title: string;
  value: string | number;
  trend?: {
    value: number;
    label: string;
  };
  icon: typeof UsersIcon;
  description?: string;
}

function MetricCard({ title, value, trend, icon: Icon, description }: MetricCardProps) {
  return (
    <div className="stat-panel">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-dark-text-secondary text-sm font-medium">{title}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
          {trend && (
            <p
              className={`mt-1 text-sm ${
                trend.value >= 0 ? 'text-accent-success' : 'text-accent-error'
              }`}
            >
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-accent-primary/10 p-3">
          <Icon className="h-6 w-6 text-accent-primary" />
        </div>
      </div>
      {description && (
        <p className="mt-4 text-sm text-dark-text-secondary">{description}</p>
      )}
    </div>
  );
}

interface ComorbidityDistributionProps {
  data: {
    label: string;
    count: number;
    percentage: number;
  }[];
}

function ComorbidityDistribution({ data }: ComorbidityDistributionProps) {
  return (
    <div className="analytics-panel">
      <h3 className="text-lg font-semibold mb-4">Comorbidity Distribution</h3>
      <div className="space-y-4">
        {data.map((item) => (
          <div key={item.label}>
            <div className="flex justify-between text-sm mb-1">
              <span>{item.label}</span>
              <span className="text-dark-text-secondary">
                {item.count} ({item.percentage}%)
              </span>
            </div>
            <div className="h-2 bg-dark-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-primary rounded-full transition-all duration-500"
                style={{ width: `${item.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PopulationMetricsProps {
  totalPatients: number;
  comorbidityDistribution: {
    label: string;
    count: number;
    percentage: number;
  }[];
  careGapMetrics: {
    total: number;
    overdue: number;
    trend: number;
  };
  riskDistribution: {
    high: number;
    medium: number;
    low: number;
    trendingUp: number;
  };
}

export default function PopulationMetrics({
  totalPatients,
  comorbidityDistribution,
  careGapMetrics,
  riskDistribution,
}: PopulationMetricsProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Patients"
          value={totalPatients}
          icon={UsersIcon}
          description="Active patients under care"
          trend={{
            value: 5.2,
            label: 'vs last month'
          }}
        />
        <MetricCard
          title="High Risk"
          value={riskDistribution.high}
          icon={ExclamationTriangleIcon}
          description={`${riskDistribution.trendingUp} trending up`}
          trend={{
            value: -2.5,
            label: 'vs last month'
          }}
        />
        <MetricCard
          title="Care Gaps"
          value={careGapMetrics.total}
          icon={ChartBarIcon}
          description={`${careGapMetrics.overdue} overdue`}
          trend={{
            value: careGapMetrics.trend,
            label: 'vs last month'
          }}
        />
        <MetricCard
          title="Multi-Morbidity"
          value={`${Math.round((comorbidityDistribution[1].count / totalPatients) * 100)}%`}
          icon={ClockIcon}
          description="Patients with 3+ conditions"
          trend={{
            value: 8.7,
            label: 'vs last month'
          }}
        />
      </div>

      <ComorbidityDistribution data={comorbidityDistribution} />
    </div>
  );
}
