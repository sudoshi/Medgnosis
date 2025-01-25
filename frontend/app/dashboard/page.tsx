'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import {
  ChartBarIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import { dashboard } from '@/services/api';
import type { DashboardData } from '@/services/api';
import { mockDashboardData } from '@/services/mockData';
import { mockPatientsList } from '@/services/mockPatientData';
import AnalyticsOverview from '@/components/analytics/AnalyticsOverview';
import QualityMeasures from '@/components/quality/QualityMeasures';
import HighRiskPatientsList from '@/components/patients/HighRiskPatientsList';
import CareGapSummary from '@/components/analytics/CareGapSummary';

interface StatCardProps {
  loading?: boolean;
  title: string;
  value: string;
  description: string;
  icon: typeof ChartBarIcon;
  trend?: {
    value: number;
    label: string;
  };
}

function StatCard({ title, value, description, icon: Icon, trend, loading }: StatCardProps) {
  return (
    <div className={`panel-stat relative ${loading ? 'animate-pulse' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-dark-text-secondary text-sm font-medium">{title}</p>
          <p className="mt-2 text-2xl font-semibold">
            {loading ? (
              <div className="h-8 w-24 bg-dark-secondary/30 rounded animate-pulse" />
            ) : (
              value
            )}
          </p>
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
        <div className="rounded-lg bg-accent-primary/10 p-3 transition-all duration-200 hover:bg-accent-primary/20">
          <Icon className="h-6 w-6 text-accent-primary" />
        </div>
      </div>
      <p className="mt-4 text-sm text-dark-text-secondary">{description}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [state, setState] = useState<DashboardData | null>(mockDashboardData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <AdminLayout>
        <div className="p-4 bg-accent-error/10 text-accent-error rounded-lg">
          {error}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {state && state.stats && (
            <>
              <StatCard
                title="High Risk Patients"
                value={`${state.stats.riskScore.highRiskCount} (${state.stats.riskScore.highRiskPercentage}%)`}
                description="Patients requiring immediate attention"
                icon={ExclamationTriangleIcon}
                trend={{
                  value: state.stats.riskScore.trend,
                  label: 'vs last month',
                }}
                loading={loading}
              />
              <StatCard
                title="Care Gaps"
                value={state.stats.careGaps.value.toLocaleString()}
                description="Open care gaps requiring attention"
                icon={ChartBarIcon}
                trend={{
                  value: state.stats.careGaps.trend,
                  label: 'vs last month',
                }}
                loading={loading}
              />
              <StatCard
                title="Encounters"
                value={state.stats.encounters.value.toLocaleString()}
                description="Patient encounters this month"
                icon={ClockIcon}
                trend={{
                  value: state.stats.encounters.trend,
                  label: 'vs last month',
                }}
                loading={loading}
              />
              <StatCard
                title="Total Patients"
                value={state.stats.totalPatients.value.toLocaleString()}
                description="Active patients under care"
                icon={UserGroupIcon}
                trend={{
                  value: state.stats.totalPatients.trend,
                  label: 'vs last month',
                }}
                loading={loading}
              />
            </>
          )}
        </div>

        {/* Main Two Column Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left Column - Clinical Focus */}
          <div className="space-y-6">
            {state?.analytics && (
              <CareGapSummary
                summary={state.analytics.careGapSummary}
                loading={loading}
              />
            )}
            {state?.qualityMeasures && (
              <div className="panel-analytics relative">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-dark-text-primary">Quality Performance</h3>
                  <div className="flex items-center space-x-2 bg-dark-secondary/20 rounded-lg px-3 py-2 transition-all duration-200 hover:bg-dark-secondary/30">
                    <ChartBarIcon className="h-5 w-5 text-accent-primary" />
                    <span className="text-2xl font-semibold">
                      {state.qualityMeasures.performance.overall}%
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {state.qualityMeasures.performance.measures.map((measure) => (
                    <div key={measure.id} className="panel-detail p-4 relative">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">{measure.name}</h4>
                          <div className="mt-2 flex items-center space-x-2">
                            <span className="text-2xl font-semibold">{measure.score}%</span>
                            <span className="text-sm text-dark-text-secondary">
                              of {measure.target}% target
                            </span>
                          </div>
                        </div>
                        <div className={`flex items-center space-x-1 ${
                          measure.trend > 0 ? 'text-accent-success' : 'text-accent-error'
                        }`}>
                          {measure.trend > 0 ? (
                            <ArrowTrendingUpIcon className="h-4 w-4" />
                          ) : (
                            <ArrowTrendingDownIcon className="h-4 w-4" />
                          )}
                          <span className="text-sm">{Math.abs(measure.trend)}%</span>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="h-2 rounded-full bg-dark-secondary/30 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              (measure.score / measure.target) * 100 >= 100
                                ? 'bg-accent-success/70'
                                : (measure.score / measure.target) * 100 >= 75
                                ? 'bg-accent-warning/70'
                                : 'bg-accent-error/70'
                            }`}
                            style={{ width: `${Math.min((measure.score / measure.target) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {state?.analytics && (
              <AnalyticsOverview
                data={state.analytics}
                loading={loading}
              />
            )}
          </div>

          {/* Right Column - Performance & Trends */}
          <div className="space-y-6">
            <HighRiskPatientsList
              loading={loading}
              patients={mockPatientsList}
            />
            {state?.qualityMeasures && (
              <>
                <div className="panel-analytics relative">
                  <h3 className="text-lg font-semibold mb-4 text-dark-text-primary">Performance Trend</h3>
                  <div className="h-40 flex items-end justify-between">
                    {state.qualityMeasures.trends.monthly.map((point) => {
                      const maxScore = Math.max(...state.qualityMeasures.trends.monthly.map(d => d.score));
                      const minScore = Math.min(...state.qualityMeasures.trends.monthly.map(d => d.score));
                      const range = maxScore - minScore;
                      const normalizeHeight = ((point.score - minScore) / (range || 1)) * 100;

                      return (
                        <div
                          key={point.month}
                          className="flex flex-col items-center space-y-2"
                          style={{ height: '100%' }}
                        >
                          <div className="flex-1 w-12 flex items-end">
                            <div
                              className="w-8 bg-accent-primary/70 rounded-t transition-all duration-200 hover:bg-accent-primary/80"
                              style={{ height: `${normalizeHeight}%` }}
                            />
                          </div>
                          <div className="text-xs text-dark-text-secondary">{point.month}</div>
                          <div className="text-sm font-medium">{point.score}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="panel-analytics relative">
                  <h3 className="text-lg font-semibold mb-4 text-dark-text-primary">
                    Improvement Opportunities
                  </h3>
                  <div className="space-y-4">
                    {state.qualityMeasures.improvement.map((item) => (
                      <div key={item.id} className="panel-detail p-4 relative hover:bg-dark-secondary/20 transition-all duration-200">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium">{item.measure}</h4>
                            <p className="mt-1 text-sm text-dark-text-secondary">{item.gap}</p>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className={`text-sm font-medium ${
                              item.impact === 'High'
                                ? 'text-accent-error'
                                : item.impact === 'Medium'
                                ? 'text-accent-warning'
                                : 'text-accent-success'
                            }`}>
                              {item.impact} Impact
                            </span>
                            <span className="text-sm text-accent-success">{item.potential}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
