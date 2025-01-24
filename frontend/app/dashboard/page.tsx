'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import {
  ChartBarIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  ClockIcon,
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
    <div className={`stat-panel ${loading ? 'animate-pulse' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-dark-text-secondary text-sm font-medium">{title}</p>
          <p className="mt-2 text-2xl font-semibold">
            {loading ? (
              <div className="h-8 w-24 bg-dark-secondary rounded animate-pulse" />
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
        <div className="rounded-lg bg-accent-primary/10 p-3">
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

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="h-full">
            {state?.analytics && (
              <CareGapSummary
                summary={state.analytics.careGapSummary}
                loading={loading}
              />
            )}
          </div>
          <div className="h-full">
            <HighRiskPatientsList
              loading={loading}
              patients={mockPatientsList}
            />
          </div>
        </div>

        {/* Analytics Overview */}
        {state?.analytics && (
          <AnalyticsOverview
            data={state.analytics}
            loading={loading}
          />
        )}

        {/* Quality Measures */}
        {state?.qualityMeasures && (
          <QualityMeasures
            data={state.qualityMeasures}
            loading={loading}
          />
        )}
      </div>
    </AdminLayout>
  );
}
