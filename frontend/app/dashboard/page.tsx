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

interface DashboardState {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
}

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
    <div className={`card card-hover ${loading ? 'animate-pulse' : ''}`}>
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

interface CareGapProps {
  loading?: boolean;
  gaps?: Array<{
    id: number;
    patient: string;
    measure: string;
    days_open: number;
    priority: 'high' | 'medium' | 'low';
  }>;
}

function CareGapsList({ loading, gaps = [] }: CareGapProps) {
  return (
    <div className={`card ${loading ? 'animate-pulse' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Care Gaps</h3>
        <button className="btn btn-secondary">View All</button>
      </div>
      <div className="space-y-4">
        {gaps.map((gap) => (
          <div
            key={gap.id}
            className="flex items-center justify-between p-3 rounded-lg bg-dark-primary hover:bg-dark-secondary transition-colors"
          >
            <div className="flex items-center space-x-3">
              <div
                className={`h-2 w-2 rounded-full ${
                  gap.priority === 'high'
                    ? 'bg-accent-error'
                    : gap.priority === 'medium'
                    ? 'bg-accent-warning'
                    : 'bg-accent-success'
                }`}
              />
              <div>
                <p className="font-medium">{gap.patient}</p>
                <p className="text-sm text-dark-text-secondary">{gap.measure}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-dark-text-secondary">
              <ClockIcon className="h-4 w-4" />
              <span className="text-sm">{gap.days_open} days</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface RiskPatientsProps {
  loading?: boolean;
  patients?: Array<{
    id: number;
    name: string;
    riskScore: number;
    conditions: string[];
    lastEncounter: string;
  }>;
}

function HighRiskPatientsList({ loading, patients = [] }: RiskPatientsProps) {
  return (
    <div className={`card ${loading ? 'animate-pulse' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">High Risk Patients</h3>
        <button className="btn btn-secondary">View All</button>
      </div>
      <div className="space-y-4">
        {patients.map((patient) => (
          <div
            key={patient.id}
            className="flex items-center justify-between p-3 rounded-lg bg-dark-primary hover:bg-dark-secondary transition-colors"
          >
            <div>
              <p className="font-medium">{patient.name}</p>
              <div className="flex items-center space-x-2 mt-1">
                {patient.conditions.map((condition, index) => (
                  <span
                    key={index}
                    className="inline-block px-2 py-1 text-xs rounded-full bg-dark-secondary text-dark-text-secondary"
                  >
                    {condition}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-accent-error">
                {patient.riskScore}%
              </div>
              <p className="text-sm text-dark-text-secondary">
                Last seen: {new Date(patient.lastEncounter).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await dashboard.getData();
        setState({
          data: response.data,
          loading: false,
          error: null,
        });
      } catch (error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: 'Failed to load dashboard data',
        }));
        console.error('Dashboard data fetch error:', error);
      }
    };

    fetchDashboardData();
  }, []);

  if (state.error) {
    return (
      <AdminLayout>
        <div className="p-4 bg-accent-error/10 text-accent-error rounded-lg">
          {state.error}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {state.data && state.data.stats && (
            <>
              <StatCard
                title="Total Patients"
                value={state.data.stats.totalPatients.value.toLocaleString()}
                description="Active patients under care"
                icon={UserGroupIcon}
                trend={{
                  value: state.data.stats.totalPatients.trend,
                  label: 'vs last month',
                }}
                loading={state.loading}
              />
              <StatCard
                title="Risk Score Avg"
                value={state.data.stats.riskScore.value.toString()}
                description="Population risk assessment"
                icon={ChartBarIcon}
                trend={{
                  value: state.data.stats.riskScore.trend,
                  label: 'vs last month',
                }}
                loading={state.loading}
              />
              <StatCard
                title="Care Gaps"
                value={state.data.stats.careGaps.value.toLocaleString()}
                description="Open care gaps requiring attention"
                icon={ExclamationTriangleIcon}
                trend={{
                  value: state.data.stats.careGaps.trend,
                  label: 'vs last month',
                }}
                loading={state.loading}
              />
              <StatCard
                title="Encounters"
                value={state.data.stats.encounters.value.toLocaleString()}
                description="Patient encounters this month"
                icon={ClockIcon}
                trend={{
                  value: state.data.stats.encounters.trend,
                  label: 'vs last month',
                }}
                loading={state.loading}
              />
            </>
          )}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CareGapsList
            loading={state.loading}
            gaps={state.data?.careGaps}
          />
          <HighRiskPatientsList
            loading={state.loading}
            patients={state.data?.highRiskPatients}
          />
        </div>
      </div>
    </AdminLayout>
  );
}
