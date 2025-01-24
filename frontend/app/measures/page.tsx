'use client';

import { useState, useMemo } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import MeasureList from '@/components/measures/MeasureList';
import MeasureDetails from '@/components/measures/MeasureDetails';
import MeasureFilters from '@/components/measures/MeasureFilters';
import { mockMeasures } from '@/services/mockMeasures';
import type { QualityMeasure, MeasureFilter, MeasureDomain, MeasureType } from '@/types/measure';

export default function MeasuresPage() {
  const [selectedMeasure, setSelectedMeasure] = useState<QualityMeasure | null>(null);
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
    };
  }, [selectedMeasure]);

  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-4rem)]">
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
          />
        </div>

        {/* Right - Measure Details */}
        <div className="flex-1 p-6 overflow-y-auto">
          {selectedMeasure ? (
            <MeasureDetails
              measure={selectedMeasure}
              performance={measurePerformance}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-dark-text-secondary">
              Select a measure to view details
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
