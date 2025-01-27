"use client";

import type { FilterState } from "@/components/populations/PopulationFilters";

import { useState, useMemo } from "react";

import AdminLayout from "@/components/layout/AdminLayout";
import PopulationFilters from "@/components/populations/PopulationFilters";
import PopulationMetrics from "@/components/populations/PopulationMetrics";
import PopulationGrid from "@/components/populations/PopulationGrid";
import { mockPatientsList } from "@/services/mockPatientData";

export default function PopulationsPage() {
  const [filters, setFilters] = useState<FilterState>({
    conditions: [],
    comorbidityCount: null,
    careGapComplexity: null,
    riskLevel: null,
    trending: null,
  });

  const filteredPatients = useMemo(() => {
    return mockPatientsList.filter((patient) => {
      // Filter by conditions
      if (filters.conditions.length > 0) {
        const hasCondition = patient.conditions.some((condition) =>
          filters.conditions.includes(
            condition.name.toLowerCase().replace(" ", "_"),
          ),
        );

        if (!hasCondition) return false;
      }

      // Filter by comorbidity count
      if (filters.comorbidityCount) {
        if (patient.conditions.length < filters.comorbidityCount) return false;
      }

      // Filter by care gap complexity
      if (filters.careGapComplexity) {
        const complexity =
          patient.careGaps.length > 2
            ? "high"
            : patient.careGaps.length > 0
              ? "medium"
              : "low";

        if (complexity !== filters.careGapComplexity) return false;
      }

      // Filter by risk level
      if (filters.riskLevel) {
        if (patient.riskFactors.level !== filters.riskLevel) return false;
      }

      // Filter by risk trending
      if (filters.trending) {
        if (patient.riskFactors.trending !== filters.trending) return false;
      }

      return true;
    });
  }, [filters]);

  const metrics = useMemo(() => {
    const totalPatients = filteredPatients.length;
    const comorbidityDistribution = [
      {
        label: "2+ Conditions",
        count: filteredPatients.filter((p) => p.conditions.length >= 2).length,
        percentage: Math.round(
          (filteredPatients.filter((p) => p.conditions.length >= 2).length /
            totalPatients) *
            100,
        ),
      },
      {
        label: "3+ Conditions",
        count: filteredPatients.filter((p) => p.conditions.length >= 3).length,
        percentage: Math.round(
          (filteredPatients.filter((p) => p.conditions.length >= 3).length /
            totalPatients) *
            100,
        ),
      },
      {
        label: "4+ Conditions",
        count: filteredPatients.filter((p) => p.conditions.length >= 4).length,
        percentage: Math.round(
          (filteredPatients.filter((p) => p.conditions.length >= 4).length /
            totalPatients) *
            100,
        ),
      },
    ];

    const careGapMetrics = {
      total: filteredPatients.reduce((sum, p) => sum + p.careGaps.length, 0),
      overdue: filteredPatients.reduce(
        (sum, p) => sum + p.careGaps.filter((g) => g.status === "open").length,
        0,
      ),
      trend: -12.3, // Mock trend
    };

    const riskDistribution = {
      high: filteredPatients.filter((p) => p.riskFactors.level === "high")
        .length,
      medium: filteredPatients.filter((p) => p.riskFactors.level === "medium")
        .length,
      low: filteredPatients.filter((p) => p.riskFactors.level === "low").length,
      trendingUp: filteredPatients.filter(
        (p) => p.riskFactors.trending === "up",
      ).length,
    };

    return {
      totalPatients,
      comorbidityDistribution,
      careGapMetrics,
      riskDistribution,
    };
  }, [filteredPatients]);

  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-4rem)]">
        <PopulationFilters onFiltersChange={setFilters} />
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <h1 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
            Population Management
          </h1>
          <PopulationMetrics {...metrics} />
          <PopulationGrid patients={filteredPatients} />
        </div>
      </div>
    </AdminLayout>
  );
}
