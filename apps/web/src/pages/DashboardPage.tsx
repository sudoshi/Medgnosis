// =============================================================================
// Medgnosis Web — Dashboard page
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Users,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { api } from '../services/api.js';
import type { DashboardAnalytics } from '@medgnosis/shared';

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ElementType;
  trend?: { value: number; label: string };
  loading?: boolean;
}

function StatCard({ title, value, description, icon: Icon, trend, loading }: StatCardProps) {
  return (
    <div className={`panel-stat ${loading ? 'animate-pulse' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm font-medium">
            {title}
          </p>
          <p className="mt-2 text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
            {loading ? (
              <span className="block h-8 w-24 bg-dark-secondary/30 rounded animate-pulse" />
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
      <p className="mt-4 text-sm text-light-text-secondary dark:text-dark-text-secondary">
        {description}
      </p>
    </div>
  );
}

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardAnalytics>('/dashboard'),
  });

  const stats = data?.data;

  if (error) {
    return (
      <div className="p-4 bg-accent-error/10 text-accent-error rounded-lg">
        Failed to load dashboard data
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
        Dashboard
      </h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="High Risk Patients"
          value={stats ? `${stats.high_risk_count ?? 0}` : '—'}
          description="Patients requiring immediate attention"
          icon={AlertTriangle}
          trend={{ value: -2.3, label: 'vs last month' }}
          loading={isLoading}
        />
        <StatCard
          title="Care Gaps"
          value={stats ? `${stats.open_care_gaps ?? 0}` : '—'}
          description="Open care gaps requiring attention"
          icon={BarChart3}
          trend={{ value: -8.1, label: 'vs last month' }}
          loading={isLoading}
        />
        <StatCard
          title="Encounters"
          value={stats ? `${stats.recent_encounters ?? 0}` : '—'}
          description="Patient encounters this month"
          icon={Clock}
          trend={{ value: 5.4, label: 'vs last month' }}
          loading={isLoading}
        />
        <StatCard
          title="Total Patients"
          value={stats ? `${stats.total_patients ?? 0}` : '—'}
          description="Active patients under care"
          icon={Users}
          trend={{ value: 3.1, label: 'vs last month' }}
          loading={isLoading}
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Risk Distribution */}
          <div className="panel-analytics">
            <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
              Risk Distribution
            </h3>
            <div className="space-y-3">
              {(stats?.risk_distribution ?? []).map(
                (band: { band: string; count: number }) => {
                  const total = stats?.total_patients || 1;
                  const pct = Math.round((band.count / total) * 100);
                  const colorMap: Record<string, string> = {
                    critical: 'bg-accent-error/70',
                    high: 'bg-accent-warning/70',
                    moderate: 'bg-accent-primary/70',
                    low: 'bg-accent-success/70',
                  };
                  return (
                    <div key={band.band}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize">{band.band}</span>
                        <span>
                          {band.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-dark-secondary/30 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            colorMap[band.band] ?? 'bg-accent-primary/70'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </div>

          {/* Care Gap Summary */}
          <div className="panel-analytics">
            <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
              Care Gap Summary
            </h3>
            <div className="space-y-3">
              {(stats?.care_gap_summary ?? []).map(
                (gap: { status: string; count: number }) => (
                  <div
                    key={gap.status}
                    className="flex items-center justify-between p-3 rounded-lg bg-light-secondary/50 dark:bg-dark-secondary/50"
                  >
                    <span className="capitalize text-sm">{gap.status}</span>
                    <span className="text-sm font-semibold">{gap.count}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Recent Encounters */}
          <div className="panel-analytics">
            <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-4">
              Recent Activity
            </h3>
            <div className="space-y-4">
              {(stats?.recent_encounter_list ?? []).map(
                (enc: {
                  encounter_id: number;
                  patient_name: string;
                  encounter_type: string;
                  encounter_date: string;
                }) => (
                  <div
                    key={enc.encounter_id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-light-secondary/50 dark:bg-dark-secondary/50"
                  >
                    <div className="h-3 w-3 rounded-full bg-accent-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {enc.patient_name}
                      </p>
                      <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                        {enc.encounter_type}
                      </p>
                    </div>
                    <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary whitespace-nowrap">
                      {new Date(enc.encounter_date).toLocaleDateString()}
                    </span>
                  </div>
                ),
              )}
              {!isLoading && (stats?.recent_encounter_list ?? []).length === 0 && (
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary text-center py-4">
                  No recent encounters
                </p>
              )}
            </div>
          </div>

          {/* Quality Performance */}
          <div className="panel-analytics">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
                Quality Performance
              </h3>
              <div className="flex items-center space-x-2 bg-dark-secondary/20 rounded-lg px-3 py-2">
                <BarChart3 className="h-5 w-5 text-accent-primary" />
                <span className="text-2xl font-semibold">
                  {stats?.overall_quality_score ?? '—'}%
                </span>
              </div>
            </div>
            {(stats?.top_measures ?? []).map(
              (measure: { name: string; score: number; target: number; trend: number }) => (
                <div key={measure.name} className="panel-detail p-4 mb-3 last:mb-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium text-sm">{measure.name}</h4>
                      <div className="mt-1 flex items-center space-x-2">
                        <span className="text-lg font-semibold">{measure.score}%</span>
                        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                          of {measure.target}% target
                        </span>
                      </div>
                    </div>
                    <div
                      className={`flex items-center space-x-1 ${
                        measure.trend > 0 ? 'text-accent-success' : 'text-accent-error'
                      }`}
                    >
                      {measure.trend > 0 ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      <span className="text-sm">{Math.abs(measure.trend)}%</span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="h-2 rounded-full bg-dark-secondary/30 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          (measure.score / measure.target) * 100 >= 100
                            ? 'bg-accent-success/70'
                            : (measure.score / measure.target) * 100 >= 75
                              ? 'bg-accent-warning/70'
                              : 'bg-accent-error/70'
                        }`}
                        style={{
                          width: `${Math.min((measure.score / measure.target) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
