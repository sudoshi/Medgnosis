'use client';

import { useState, useMemo } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import {
  UserGroupIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { mockPatientsList } from '@/services/mockPatientData';
import PatientRow from '@/components/patients/PatientRow';
import PatientFilters from '@/components/patients/PatientFilters';
import PatientDetailModal from '@/components/patients/PatientDetailModal';
import type { PatientDetails } from '@/types/patient';

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: typeof ChartBarIcon;
  trend?: {
    value: number;
    label: string;
  };
}

function StatCard({ title, value, description, icon: Icon, trend }: StatCardProps) {
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
      <p className="mt-4 text-sm text-dark-text-secondary">{description}</p>
    </div>
  );
}

export default function PatientsPage() {
  const [selectedPatient, setSelectedPatient] = useState<PatientDetails | null>(null);
  const [filters, setFilters] = useState<{
    conditions?: string[];
    riskLevel?: string;
    careGaps?: string[];
    lastVisit?: number;
    provider?: string[];
  }>({});

  const filteredPatients = useMemo(() => {
    return mockPatientsList.filter(patient => {
      // Filter by conditions
      if (filters.conditions && filters.conditions.length > 0) {
        const hasCondition = patient.conditions.some(condition =>
          filters.conditions!.includes(condition.name.toLowerCase().replace(' ', '_'))
        );
        if (!hasCondition) return false;
      }

      // Filter by risk level
      if (filters.riskLevel && patient.riskFactors.level !== filters.riskLevel) {
        return false;
      }

      // Filter by care gaps
      if (filters.careGaps && filters.careGaps.length > 0) {
        if (filters.careGaps.includes('overdue') && !patient.careGaps.length) {
          return false;
        }
      }

      // Filter by last visit
      if (filters.lastVisit) {
        const lastVisitDate = new Date(patient.encounters[0]?.date);
        const daysAgo = Math.floor(
          (Date.now() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysAgo > filters.lastVisit) return false;
      }

      // Filter by provider
      if (filters.provider && filters.provider.length > 0) {
        const hasProvider = patient.careTeam.some(member =>
          filters.provider!.includes(member.role.toLowerCase().replace(' ', '_'))
        );
        if (!hasProvider) return false;
      }

      return true;
    });
  }, [filters]);

  // Calculate filter counts
  const counts = useMemo(() => {
    const byCondition: Record<string, number> = {};
    const byRiskLevel: Record<string, number> = {};
    const byCareGap: Record<string, number> = {};
    const byProvider: Record<string, number> = {};

    mockPatientsList.forEach(patient => {
      // Count conditions
      patient.conditions.forEach(condition => {
        const key = condition.name.toLowerCase().replace(' ', '_');
        byCondition[key] = (byCondition[key] || 0) + 1;
      });

      // Count risk levels
      byRiskLevel[patient.riskFactors.level] = (byRiskLevel[patient.riskFactors.level] || 0) + 1;

      // Count care gaps
      if (patient.careGaps.length > 0) {
        byCareGap['overdue'] = (byCareGap['overdue'] || 0) + 1;
      }

      // Count providers
      patient.careTeam.forEach(member => {
        const key = member.role.toLowerCase().replace(' ', '_');
        byProvider[key] = (byProvider[key] || 0) + 1;
      });
    });

    return {
      byCondition,
      byRiskLevel,
      byCareGap,
      byProvider,
    };
  }, []);

  const highRiskCount = mockPatientsList.filter(p => p.riskFactors.level === 'high').length;
  const totalCareGaps = mockPatientsList.reduce((sum, p) => sum + p.careGaps.length, 0);
  const recentEncounters = mockPatientsList.filter(p => {
    const lastEncounter = new Date(p.encounters[0]?.date);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return lastEncounter > thirtyDaysAgo;
  }).length;

  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left Sidebar - Filters */}
        <PatientFilters onFiltersChange={setFilters} counts={counts} />

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <h1 className="text-2xl font-semibold">Patient Management</h1>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Patients"
              value={mockPatientsList.length.toString()}
              description="Active patients under care"
              icon={UserGroupIcon}
              trend={{
                value: 5.2,
                label: 'vs last month'
              }}
            />
            <StatCard
              title="High Risk"
              value={highRiskCount.toString()}
              description="Patients requiring attention"
              icon={ExclamationTriangleIcon}
              trend={{
                value: -2.5,
                label: 'vs last month'
              }}
            />
            <StatCard
              title="Care Gaps"
              value={totalCareGaps.toString()}
              description="Open care gaps"
              icon={ChartBarIcon}
              trend={{
                value: -12.3,
                label: 'vs last month'
              }}
            />
            <StatCard
              title="Recent Encounters"
              value={recentEncounters.toString()}
              description="Last 30 days"
              icon={ClockIcon}
              trend={{
                value: 8.7,
                label: 'vs last month'
              }}
            />
          </div>

          {/* Patient List */}
          <div className="space-y-4">
            {filteredPatients.map((patient) => (
              <PatientRow
                key={patient.id}
                patient={patient}
                onClick={() => setSelectedPatient(patient)}
              />
            ))}
          </div>
        </div>
      </div>

      {selectedPatient && (
        <PatientDetailModal
          isOpen={true}
          onClose={() => setSelectedPatient(null)}
          patient={selectedPatient}
        />
      )}
    </AdminLayout>
  );
}
