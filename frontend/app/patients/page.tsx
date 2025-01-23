'use client';

import { useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  PlusIcon,
  ChevronUpDownIcon,
} from '@heroicons/react/24/outline';

interface Patient {
  id: number;
  name: string;
  mrn: string;
  dateOfBirth: string;
  gender: string;
  riskScore: number;
  careGaps: number;
  lastEncounter: string;
  status: 'active' | 'inactive';
}

const mockPatients: Patient[] = [
  {
    id: 1,
    name: 'John Smith',
    mrn: 'MRN123456',
    dateOfBirth: '1965-03-15',
    gender: 'Male',
    riskScore: 85,
    careGaps: 3,
    lastEncounter: '2024-01-15',
    status: 'active',
  },
  {
    id: 2,
    name: 'Sarah Johnson',
    mrn: 'MRN123457',
    dateOfBirth: '1978-08-22',
    gender: 'Female',
    riskScore: 45,
    careGaps: 1,
    lastEncounter: '2024-01-10',
    status: 'active',
  },
  {
    id: 3,
    name: 'Robert Davis',
    mrn: 'MRN123458',
    dateOfBirth: '1982-11-30',
    gender: 'Male',
    riskScore: 65,
    careGaps: 2,
    lastEncounter: '2024-01-05',
    status: 'active',
  },
];

function PatientTable() {
  const [sortField, setSortField] = useState<keyof Patient>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: keyof Patient) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedPatients = [...mockPatients].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    const direction = sortDirection === 'asc' ? 1 : -1;

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return aValue.localeCompare(bValue) * direction;
    }
    return ((aValue as number) - (bValue as number)) * direction;
  });

  const SortButton = ({ field }: { field: keyof Patient }) => (
    <button
      onClick={() => handleSort(field)}
      className="ml-2 text-dark-text-secondary hover:text-dark-text-primary"
    >
      <ChevronUpDownIcon className="h-4 w-4" />
    </button>
  );

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>
              <div className="flex items-center">
                Name
                <SortButton field="name" />
              </div>
            </th>
            <th>
              <div className="flex items-center">
                MRN
                <SortButton field="mrn" />
              </div>
            </th>
            <th>
              <div className="flex items-center">
                Date of Birth
                <SortButton field="dateOfBirth" />
              </div>
            </th>
            <th>Gender</th>
            <th>
              <div className="flex items-center">
                Risk Score
                <SortButton field="riskScore" />
              </div>
            </th>
            <th>
              <div className="flex items-center">
                Care Gaps
                <SortButton field="careGaps" />
              </div>
            </th>
            <th>
              <div className="flex items-center">
                Last Encounter
                <SortButton field="lastEncounter" />
              </div>
            </th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {sortedPatients.map((patient) => (
            <tr key={patient.id} className="hover:bg-dark-secondary/50 cursor-pointer">
              <td>{patient.name}</td>
              <td>{patient.mrn}</td>
              <td>{new Date(patient.dateOfBirth).toLocaleDateString()}</td>
              <td>{patient.gender}</td>
              <td>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    patient.riskScore >= 75
                      ? 'bg-accent-error/10 text-accent-error'
                      : patient.riskScore >= 50
                      ? 'bg-accent-warning/10 text-accent-warning'
                      : 'bg-accent-success/10 text-accent-success'
                  }`}
                >
                  {patient.riskScore}
                </span>
              </td>
              <td>
                {patient.careGaps > 0 ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-error/10 text-accent-error">
                    {patient.careGaps}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-success/10 text-accent-success">
                    None
                  </span>
                )}
              </td>
              <td>{new Date(patient.lastEncounter).toLocaleDateString()}</td>
              <td>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    patient.status === 'active'
                      ? 'bg-accent-success/10 text-accent-success'
                      : 'bg-dark-border text-dark-text-secondary'
                  }`}
                >
                  {patient.status.charAt(0).toUpperCase() + patient.status.slice(1)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PatientsPage() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Patients</h1>
          <button className="btn btn-primary">
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Patient
          </button>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-dark-text-secondary" />
              <input
                type="text"
                placeholder="Search patients..."
                className="input pl-10"
              />
            </div>
          </div>
          <div className="flex gap-4">
            <button className="btn btn-secondary">
              <FunnelIcon className="h-5 w-5 mr-2" />
              Filters
            </button>
            <select className="input min-w-[150px]">
              <option value="all">All Patients</option>
              <option value="high-risk">High Risk</option>
              <option value="care-gaps">Care Gaps</option>
              <option value="recent">Recent Encounters</option>
            </select>
          </div>
        </div>

        {/* Patient Table */}
        <PatientTable />

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-dark-text-secondary">
            Showing 1-3 of 3 patients
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" disabled>
              Previous
            </button>
            <button className="btn btn-secondary" disabled>
              Next
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
