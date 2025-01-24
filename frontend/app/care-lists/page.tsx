'use client';

import { useState } from 'react';
import {
  UserGroupIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  ClockIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { mockCareLists, mockPatientsList } from '@/services/mockCareListData';
import type { CareList } from '@/services/mockCareListData';
import CareListDetails from '@/components/care-lists/CareListDetails';
import AdminLayout from '@/components/layout/AdminLayout';

interface StatCardProps {
  title: string;
  value: string | number;
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

function CareListCard({ list, onSelect }: { list: CareList; onSelect: () => void }) {
  const patients = mockPatientsList.filter(p => list.patients.includes(p.id.toString()));
  const highRiskCount = patients.filter(p => p.riskFactors.level === 'high').length;
  const careGapsCount = patients.reduce((sum, p) => sum + p.careGaps.length, 0);

  return (
    <button
      onClick={onSelect}
      className="w-full p-4 rounded-lg bg-dark-primary hover:bg-dark-secondary border border-dark-border transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-medium">{list.name}</h3>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                list.type === 'measure-based'
                  ? 'bg-accent-primary/10 text-accent-primary'
                  : 'bg-accent-success/10 text-accent-success'
              }`}
            >
              {list.type === 'measure-based' ? 'Measure Based' : 'Manual'}
            </span>
          </div>
          <p className="mt-1 text-sm text-dark-text-secondary">{list.description}</p>
          <div className="mt-4 flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <UserGroupIcon className="h-4 w-4 text-dark-text-secondary" />
              <span className="text-sm">{patients.length} patients</span>
            </div>
            {highRiskCount > 0 && (
              <div className="flex items-center space-x-2">
                <ChartBarIcon className="h-4 w-4 text-accent-error" />
                <span className="text-sm">{highRiskCount} high risk</span>
              </div>
            )}
            {careGapsCount > 0 && (
              <div className="flex items-center space-x-2">
                <ClockIcon className="h-4 w-4 text-accent-warning" />
                <span className="text-sm">{careGapsCount} care gaps</span>
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center space-x-2">
            {list.tags.map(tag => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-xs bg-dark-secondary text-dark-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function CareListsPage() {
  const [selectedList, setSelectedList] = useState<CareList | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleSelectList = (list: CareList) => {
    setSelectedList(list);
    setShowDetails(true);
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'measure' | 'manual'>('all');

  const filteredLists = mockCareLists.filter(list => {
    if (filter === 'measure' && list.type !== 'measure-based') return false;
    if (filter === 'manual' && list.type !== 'manual') return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        list.name.toLowerCase().includes(search) ||
        list.description.toLowerCase().includes(search) ||
        list.tags.some(tag => tag.toLowerCase().includes(search))
      );
    }
    return true;
  });

  const totalPatients = mockCareLists.reduce(
    (sum, list) => sum + list.patients.length,
    0
  );

  const totalCareGaps = mockPatientsList
    .filter(p => mockCareLists.some(list => list.patients.includes(p.id.toString())))
    .reduce((sum, p) => sum + p.careGaps.length, 0);

  const highRiskPatients = mockPatientsList
    .filter(p =>
      mockCareLists.some(list => list.patients.includes(p.id.toString()))
    )
    .filter(p => p.riskFactors.level === 'high').length;

  return (
    <AdminLayout>
      <div className="h-full overflow-y-auto">
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Care Lists</h1>
            <button className="btn btn-primary">
              <PlusIcon className="h-5 w-5 mr-2" />
              Create List
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Patients"
              value={totalPatients}
              description="Patients in active care lists"
              icon={UserGroupIcon}
              trend={{
                value: 12.5,
                label: 'vs last month'
              }}
            />
            <StatCard
              title="High Risk"
              value={highRiskPatients}
              description="Patients requiring attention"
              icon={ChartBarIcon}
              trend={{
                value: -5.2,
                label: 'vs last month'
              }}
            />
            <StatCard
              title="Care Gaps"
              value={totalCareGaps}
              description="Open care gaps"
              icon={ClockIcon}
              trend={{
                value: -8.1,
                label: 'vs last month'
              }}
            />
            <StatCard
              title="Active Lists"
              value={mockCareLists.length}
              description="Care coordination lists"
              icon={ClipboardDocumentListIcon}
            />
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-dark-text-secondary" />
                <input
                  type="text"
                  placeholder="Search lists..."
                  className="input pl-10 w-full"
                  value={searchTerm}
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
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
              >
                <option value="all">All Lists</option>
                <option value="measure">Measure Based</option>
                <option value="manual">Manual Lists</option>
              </select>
            </div>
          </div>

          {/* Care Lists Grid */}
          <div className="grid grid-cols-1 gap-4">
            {filteredLists.map((list) => (
              <CareListCard
                key={list.id}
                list={list}
                onSelect={() => handleSelectList(list)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Care List Details Drawer */}
      {showDetails && selectedList && (
        <CareListDetails
          list={selectedList}
          onClose={() => setShowDetails(false)}
        />
      )}
    </AdminLayout>
  );
}
