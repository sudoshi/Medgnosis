import { ChartBarIcon, UserGroupIcon } from "@heroicons/react/24/outline";

import type { DashboardData } from "@/types";

interface AnalyticsOverviewProps {
  data: DashboardData["analytics"];
  loading?: boolean;
}

export default function AnalyticsOverview({
  data,
  loading,
}: AnalyticsOverviewProps) {
  if (loading) {
    return <div className="animate-pulse">Loading analytics...</div>;
  }

  // Remove the old destructuring line that was causing the error
  return (
    <div className="space-y-6">
      {/* Population Overview */}
      <div className="panel-analytics relative">
        <h3 className="text-lg font-semibold mb-4 text-light-text-primary dark:text-dark-text-primary">
          Population Overview
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-light-secondary/20 dark:bg-dark-secondary/20 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <UserGroupIcon className="h-5 w-5 text-accent-primary" />
              <h4 className="font-medium">Risk Distribution</h4>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  High Risk
                </span>
                <span className="font-medium">
                  {data.populationMetrics.byRiskLevel.high}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  Medium Risk
                </span>
                <span className="font-medium">
                  {data.populationMetrics.byRiskLevel.medium}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  Low Risk
                </span>
                <span className="font-medium">
                  {data.populationMetrics.byRiskLevel.low}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-light-secondary/20 dark:bg-dark-secondary/20 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <ChartBarIcon className="h-5 w-5 text-accent-primary" />
              <h4 className="font-medium">Demographics</h4>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  Age Groups
                </span>
                <div className="flex items-center space-x-2">
                  {Object.entries(data.populationMetrics.demographics.age).map(
                    ([range, count]) => (
                      <span
                        key={range}
                        className="text-xs px-2 py-1 bg-light-secondary/30 dark:bg-dark-secondary/30 rounded text-light-text-primary dark:text-dark-text-primary"
                      >
                        {`${range}: ${count}`}
                      </span>
                    )
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                  Gender
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-xs px-2 py-1 bg-light-secondary/30 dark:bg-dark-secondary/30 rounded text-light-text-primary dark:text-dark-text-primary">
                    Male: {data.populationMetrics.demographics.gender.male}
                  </span>
                  <span className="text-xs px-2 py-1 bg-light-secondary/30 dark:bg-dark-secondary/30 rounded text-light-text-primary dark:text-dark-text-primary">
                    Female: {data.populationMetrics.demographics.gender.female}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Risk Score Distribution */}
      <div className="panel-analytics relative">
        <h3 className="text-lg font-semibold mb-4 text-light-text-primary dark:text-dark-text-primary">
          Risk Score Distribution
        </h3>
        <div className="h-40 flex items-end justify-between">
          {data.riskStratification.distribution.map((point) => {
            const maxCount = Math.max(
              ...data.riskStratification.distribution.map((d) => d.count)
            );
            const height = (point.count / maxCount) * 100;

            return (
              <div
                key={point.score}
                className="flex flex-col items-center space-y-2"
                style={{ height: "100%" }}
              >
                <div className="flex-1 w-12 flex items-end">
                  <div
                    className="w-8 bg-accent-primary/70 rounded-t transition-all duration-200 hover:bg-accent-primary/80"
                    style={{ height: `${height}%` }}
                  />
                </div>
                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                  {point.score}
                </div>
                <div className="text-sm font-medium">{point.count}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
