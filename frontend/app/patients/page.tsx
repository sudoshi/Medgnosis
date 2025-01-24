'use client';

import { useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  PlusIcon,
  ChevronUpDownIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { mockPatientsList } from '@/services/mockPatientData';
import type { PatientDetails } from '@/types/patient';
import PatientDetailModal from '@/components/patients/PatientDetailModal';

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

interface PatientTableProps {
  searchTerm: string;
  filter: string;
}

function PatientTable({ searchTerm, filter }: PatientTableProps) {
  const [sortField, setSortField] = useState<keyof PatientDetails>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedPatient, setSelectedPatient] = useState<PatientDetails | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const handleSort = (field: keyof PatientDetails) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredPatients = mockPatientsList.filter(patient => {
    const matchesSearch = patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         patient.demographics.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    switch (filter) {
      case 'high-risk':
        return matchesSearch && patient.riskFactors.level === 'high';
      case 'care-gaps':
        return matchesSearch && patient.careGaps.length > 0;
      case 'recent':
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return matchesSearch && new Date(patient.encounters[0]?.date) > thirtyDaysAgo;
      default:
        return matchesSearch;
    }
  });

  const sortedPatients = [...filteredPatients].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    const direction = sortDirection === 'asc' ? 1 : -1;

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return aValue.localeCompare(bValue) * direction;
    }
    return ((aValue as number) - (bValue as number)) * direction;
  });

  const itemsPerPage = 10;
  const totalPages = Math.ceil(sortedPatients.length / itemsPerPage);
  const paginatedPatients = sortedPatients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const SortButton = ({ field }: { field: keyof PatientDetails }) => (
    <button
      onClick={() => handleSort(field)}
      className="ml-2 text-dark-text-secondary hover:text-dark-text-primary"
    >
      <ChevronUpDownIcon className="h-4 w-4" />
    </button>
  );

  return (
    <>
      <div className="analytics-panel">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th>
                  <div className="flex items-center">
                    Name
                    <SortButton field="name" />
                  </div>
                </th>
                <th>Demographics</th>
                <th>
                  <div className="flex items-center">
                    Risk Score
                    <SortButton field="riskFactors" />
                  </div>
                </th>
                <th>Care Gaps</th>
                <th>Conditions</th>
                <th>Last Encounter</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPatients.map((patient) => (
                <tr
                  key={patient.id}
                  onClick={() => setSelectedPatient(patient)}
                  className="hover:bg-dark-secondary/50 cursor-pointer"
                >
                  <td>
                    <div>
                      <p className="font-medium">{patient.name}</p>
                      <p className="text-sm text-dark-text-secondary">{patient.demographics.email}</p>
                    </div>
                  </td>
                  <td>
                    <div>
                      <p>{patient.demographics.age} years</p>
                      <p className="text-sm text-dark-text-secondary">{patient.demographics.gender}</p>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        patient.riskFactors.level === 'high'
                          ? 'bg-accent-error/10 text-accent-error'
                          : patient.riskFactors.level === 'medium'
                          ? 'bg-accent-warning/10 text-accent-warning'
                          : 'bg-accent-success/10 text-accent-success'
                      }`}
                    >
                      {patient.riskFactors.score}
                    </span>
                  </td>
                  <td>
                    {patient.careGaps.length > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-error/10 text-accent-error">
                        {patient.careGaps.length}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-success/10 text-accent-success">
                        None
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {patient.conditions.map((condition) => (
                        <span
                          key={condition.id}
                          className="inline-block px-2 py-1 text-xs rounded-full bg-dark-secondary text-dark-text-secondary"
                        >
                          {condition.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center space-x-1 text-sm text-dark-text-secondary">
                      <ClockIcon className="h-4 w-4" />
                      <span>
                        {new Date(patient.encounters[0]?.date).toLocaleDateString()}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-dark-text-secondary">
          Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, sortedPatients.length)} of {sortedPatients.length} patients
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-secondary"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      </div>

      {selectedPatient && (
        <PatientDetailModal
          isOpen={true}
          onClose={() => setSelectedPatient(null)}
          patient={selectedPatient}
        />
      )}
    </>
  );
}

export default function PatientsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  
  const highRiskCount = mockPatientsList.filter(p => p.riskFactors.level === 'high').length;
  const totalCareGaps = mockPatientsList.reduce((sum, p) => sum + p.careGaps.length, 0);
  const recentEncounters = mockPatientsList.filter(p => {
    const lastEncounter = new Date(p.encounters[0]?.date);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return lastEncounter > thirtyDaysAgo;
  }).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
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

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-dark-text-secondary" />
              <input
                type="text"
                placeholder="Search patients..."
                className="input pl-10 w-full"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-4">
            <button className="btn btn-secondary">
              <FunnelIcon className="h-5 w-5 mr-2" />
              Filters
            </button>
            <select
              className="input min-w-[150px]"
              onChange={(e) => setFilter(e.target.value)}
              value={filter}
            >
              <option value="all">All Patients</option>
              <option value="high-risk">High Risk</option>
              <option value="care-gaps">Care Gaps</option>
              <option value="recent">Recent Encounters</option>
            </select>
          </div>
        </div>

        {/* Patient Table */}
        <PatientTable searchTerm={searchTerm} filter={filter} />
      </div>
    </AdminLayout>
  );
}
