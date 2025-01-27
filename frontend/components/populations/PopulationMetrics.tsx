import {
  UsersIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

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

function MetricCard({
  title,
  value,
  trend,
  icon: Icon,
  description,
}: MetricCardProps) {
  return (
    <div className="panel-stat">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm font-medium">
            {title}
          </p>
          <p className="mt-2 text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
            {value}
          </p>
          {trend && (
            <p
              className={`mt-1 text-sm ${
                trend.value >= 0 ? "text-accent-success" : "text-accent-error"
              }`}
            >
              {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}%{" "}
              {trend.label}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-accent-primary/10 p-3 transition-all duration-200">
          <Icon className="h-6 w-6 text-accent-primary" />
        </div>
      </div>
      {description && (
        <p className="mt-4 text-sm text-light-text-secondary dark:text-dark-text-secondary">
          {description}
        </p>
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
    <div className="panel-analytics">
      <h3 className="text-lg font-semibold mb-4 text-light-text-primary dark:text-dark-text-primary">
        Comorbidity Distribution
      </h3>
      <div className="space-y-4">
        {data.map((item) => (
          <div key={item.label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-light-text-primary dark:text-dark-text-primary">
                {item.label}
              </span>
              <span className="text-light-text-secondary dark:text-dark-text-secondary">
                {item.count} ({item.percentage}%)
              </span>
            </div>
            <div className="h-2 bg-light-secondary/30 dark:bg-dark-secondary/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-primary/70 rounded-full transition-all"
                style={{
                  width: `${item.percentage}%`,
                  transitionDuration: "var(--transition-duration)",
                  transitionTimingFunction: "var(--transition-timing)",
                }}
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
          description="Active patients under care"
          icon={UsersIcon}
          title="Total Patients"
          trend={{
            value: 5.2,
            label: "vs last month",
          }}
          value={totalPatients}
        />
        <MetricCard
          description={`${riskDistribution.trendingUp} trending up`}
          icon={ExclamationTriangleIcon}
          title="High Risk"
          trend={{
            value: -2.5,
            label: "vs last month",
          }}
          value={riskDistribution.high}
        />
        <MetricCard
          description={`${careGapMetrics.overdue} overdue`}
          icon={ChartBarIcon}
          title="Care Gaps"
          trend={{
            value: careGapMetrics.trend,
            label: "vs last month",
          }}
          value={careGapMetrics.total}
        />
        <MetricCard
          description="Patients with 3+ conditions"
          icon={ClockIcon}
          title="Multi-Morbidity"
          trend={{
            value: 8.7,
            label: "vs last month",
          }}
          value={`${Math.round((comorbidityDistribution[1].count / totalPatients) * 100)}%`}
        />
      </div>

      <ComorbidityDistribution data={comorbidityDistribution} />
    </div>
  );
}
