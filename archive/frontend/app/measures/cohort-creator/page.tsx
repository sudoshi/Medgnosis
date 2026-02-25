'use client';

import {
  UserGroupIcon,
  FunnelIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { useState, useMemo } from 'react';

import MeasureFilters from '@/components/measures/MeasureFilters';
import MeasureList from '@/components/measures/MeasureList';
import CreateCareListModal from '@/components/measures/cohort/CreateCareListModal';
import { mockMeasures } from '@/services/mockMeasures';
import { mockPatientsList } from '@/services/mockPatientData';
import type { MeasureFilter, MeasureDomain, MeasureType } from '@/types/measure';

export default function CohortCreatorPage() {
  const [selectedMeasures, setSelectedMeasures] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<MeasureFilter>({});
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredMeasures = useMemo(() => {
    return mockMeasures.filter(measure => {
      if (filters.domain && measure.domain !== filters.domain) return false;
      if (filters.type && measure.type !== filters.type) return false;
      if (filters.search) {
        const search = filters.search.toLowerCase();
        return (
          measure.id.toLowerCase().includes(search) ||
          measure.title.toLowerCase().includes(search) ||
          measure.description.toLowerCase().includes(search)
        );
      }
      return true;
    });
  }, [filters]);

  const counts = useMemo(() => {
    const byDomain = mockMeasures.reduce((acc, measure) => {
      acc[measure.domain] = (acc[measure.domain] || 0) + 1;
      return acc;
    }, {} as Record<MeasureDomain, number>);

    const byType = mockMeasures.reduce((acc, measure) => {
      acc[measure.type] = (acc[measure.type] || 0) + 1;
      return acc;
    }, {} as Record<MeasureType, number>);

    return {
      total: mockMeasures.length,
      byDomain,
      byType,
      byStatus: {
        active: mockMeasures.length,
        inactive: 0,
      },
    };
  }, []);

  // Mock cohort analysis
  const cohortAnalysis = useMemo(() => {
    if (selectedMeasures.size === 0) return null;

    const selectedMeasuresList = mockMeasures.filter(m => selectedMeasures.has(m.id));
    const matchingPatients = mockPatientsList.filter(patient => {
      // Mock logic to determine if patient matches measure criteria
      return patient.careGaps.some(gap => 
        selectedMeasuresList.some(m => gap.measure.includes(m.title))
      );
    });

    return {
      totalPatients: mockPatientsList.length,
      matchingPatients,
      matchingCount: matchingPatients.length,
      byRiskLevel: {
        high: matchingPatients.filter(p => p.riskFactors.level === 'high').length,
        medium: matchingPatients.filter(p => p.riskFactors.level === 'medium').length,
        low: matchingPatients.filter(p => p.riskFactors.level === 'low').length,
      },
    };
  }, [selectedMeasures]);

  return (
    <div className="flex h-full">
      {/* Left Sidebar - Filters */}
      <div className="w-80 border-r border-dark-border p-6 overflow-y-auto">
        <MeasureFilters
          filters={filters}
          onFiltersChange={setFilters}
          counts={counts}
        />
      </div>

      {/* Middle - Measure List */}
      <div className="w-96 border-r border-dark-border p-6 overflow-y-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Select Measures</h1>
          <p className="text-dark-text-secondary mt-1">
            Choose measures to define your cohort
          </p>
        </div>
        <MeasureList
          measures={filteredMeasures}
          selectedMeasures={selectedMeasures}
          onToggleSelect={(id) => {
            const newSelected = new Set(selectedMeasures);
            if (newSelected.has(id)) {
              newSelected.delete(id);
            } else {
              newSelected.add(id);
            }
            setSelectedMeasures(newSelected);
          }}
        />
      </div>

      {/* Right - Cohort Analysis */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Cohort Analysis</h2>
            <p className="text-dark-text-secondary mt-1">
              Preview of matching patients based on selected measures
            </p>
          </div>
          {selectedMeasures.size > 0 && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              <ClipboardDocumentListIcon className="h-5 w-5 mr-2" />
              Create Care List
            </button>
          )}
        </div>

        {cohortAnalysis ? (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="stat-panel">
                <div className="flex items-center space-x-2">
                  <UserGroupIcon className="h-5 w-5 text-dark-text-secondary" />
                  <span className="text-dark-text-secondary">Total Population</span>
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {cohortAnalysis.totalPatients}
                </div>
              </div>
              <div className="stat-panel">
                <div className="flex items-center space-x-2">
                  <FunnelIcon className="h-5 w-5 text-dark-text-secondary" />
                  <span className="text-dark-text-secondary">Matching Patients</span>
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {cohortAnalysis.matchingCount}
                </div>
              </div>
              <div className="stat-panel">
                <div className="flex items-center space-x-2">
                  <ChartBarIcon className="h-5 w-5 text-dark-text-secondary" />
                  <span className="text-dark-text-secondary">High Risk</span>
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {cohortAnalysis.byRiskLevel.high}
                </div>
              </div>
              <div className="stat-panel">
                <div className="flex items-center space-x-2">
                  <ChartBarIcon className="h-5 w-5 text-dark-text-secondary" />
                  <span className="text-dark-text-secondary">Selected Measures</span>
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {selectedMeasures.size}
                </div>
              </div>
            </div>

            {/* Patient Preview */}
            <div>
              <h3 className="text-lg font-medium mb-4">Matching Patients Preview</h3>
              <div className="space-y-2">
                {cohortAnalysis.matchingPatients.slice(0, 5).map(patient => (
                  <div
                    key={patient.id}
                    className="p-4 bg-dark-primary border border-dark-border rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">
                          {`${patient.name.first} ${patient.name.last}`}
                        </div>
                        <div className="text-sm text-dark-text-secondary">
                          {patient.careGaps.length} care gaps
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-sm">
                          Risk Score: {patient.riskFactors.score}
                        </div>
                        <div
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            patient.riskFactors.level === 'high'
                              ? 'bg-accent-error/10 text-accent-error'
                              : patient.riskFactors.level === 'medium'
                              ? 'bg-accent-warning/10 text-accent-warning'
                              : 'bg-accent-success/10 text-accent-success'
                          }`}
                        >
                          {patient.riskFactors.level} risk
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-[calc(100%-4rem)] text-dark-text-secondary">
            Select measures to preview matching patients
          </div>
        )}
      </div>

      {/* Create Care List Modal */}
      <CreateCareListModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        selectedMeasures={mockMeasures.filter(m => selectedMeasures.has(m.id))}
        cohortSize={cohortAnalysis?.matchingCount || 0}
        matchingPatients={cohortAnalysis?.matchingPatients || []}
      />
    </div>
  );
}
