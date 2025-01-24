'use client';

import { useState, useMemo } from 'react';
import MeasureList from '@/components/measures/MeasureList';
import MeasureDetails from '@/components/measures/MeasureDetails';
import MeasureFilters from '@/components/measures/MeasureFilters';
import { mockMeasures } from '@/services/mockMeasures';
import { useRouter } from 'next/navigation';
import type { QualityMeasure, MeasureFilter, MeasureDomain, MeasureType } from '@/types/measure';

export default function QualityMeasuresPage() {
  const router = useRouter();
  const [selectedMeasure, setSelectedMeasure] = useState<QualityMeasure | null>(null);
  const [selectedMeasures, setSelectedMeasures] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<MeasureFilter>({});

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
      if (filters.performance) {
        const performance = 75; // Mock performance
        const target = measure.performance?.target || 0;
        const benchmark = measure.performance?.benchmark || target;

        switch (filters.performance) {
          case 'below':
            return performance < target;
          case 'meeting':
            return performance >= target && performance < benchmark;
          case 'exceeding':
            return performance >= benchmark;
          default:
            return true;
        }
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

    const byStatus = {
      active: mockMeasures.length,
      inactive: 0,
    };

    return {
      total: mockMeasures.length,
      byDomain,
      byType,
      byStatus,
    };
  }, []);

  // Mock performance data
  const measurePerformance = useMemo(() => {
    if (!selectedMeasure) return undefined;
    return {
      eligible: 450,
      excluded: 50,
      compliant: 300,
      performance: 75,
      gaps: [
        {
          patient: 'P1001',
          requirements: ['BP Reading', 'Medication Review']
        },
        {
          patient: 'P1002',
          requirements: ['BP Reading']
        }
      ],
      trends: [
        {
          period: '2024-01',
          performance: 75
        },
        {
          period: '2023-12',
          performance: 72
        }
      ]
    };
  }, [selectedMeasure]);

  const handleCreateCareList = () => {
    // Add the current measure to selected measures
    if (selectedMeasure) {
      const newSelected = new Set(selectedMeasures);
      newSelected.add(selectedMeasure.id);
      setSelectedMeasures(newSelected);
    }

    // If we have measures selected, navigate to care list creation
    if (selectedMeasures.size > 0 || selectedMeasure) {
      router.push(`/care-lists/create?measures=${Array.from(selectedMeasures).join(',')}`);
    }
  };

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
            <h1 className="text-2xl font-semibold">Quality Measures</h1>
            <p className="text-dark-text-secondary mt-1">
              {filteredMeasures.length} measures available
            </p>
          </div>
          <MeasureList
            measures={filteredMeasures}
            onSelectMeasure={setSelectedMeasure}
            selectedMeasureId={selectedMeasure?.id}
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

        {/* Right - Measure Details */}
        <div className="flex-1 p-6 overflow-y-auto">
          {selectedMeasure ? (
            <MeasureDetails
              measure={selectedMeasure}
              performance={measurePerformance}
              onCreateCareList={handleCreateCareList}
              selectedForCareList={selectedMeasures.has(selectedMeasure.id)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-dark-text-secondary">
              Select a measure to view details
            </div>
          )}
        </div>
      </div>
  );
}
