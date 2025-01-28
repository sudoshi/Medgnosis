"use client";

import type { AlertType, AlertCategory } from "@/types/tasks-alerts";

import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

interface AlertNavigationProps {
  alertCounts: {
    total: number;
    byType: {
      all: number;
      general: number;
      specific: number;
    };
    byCategory: Record<string, number>;
  };
  selectedType: AlertType;
  selectedCategory: AlertCategory;
  onTypeSelect: (type: AlertType) => void;
  onCategorySelect: (category: AlertCategory) => void;
  severityCounts?: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
  };
}

export default function AlertNavigation({
  alertCounts,
  selectedType,
  selectedCategory,
  onTypeSelect,
  onCategorySelect,
  severityCounts,
}: AlertNavigationProps) {
  const [showDiseaseCategories, setShowDiseaseCategories] = useState(true);
  const [showClinicalCategories, setShowClinicalCategories] = useState(true);

  const diseaseCategories: AlertCategory[] = [
    "Cardiovascular",
    "Endocrine",
    "Renal",
    "Respiratory",
    "Mental Health",
    "Neurological",
    "Musculoskeletal",
    "Oncology",
    "Metabolic",
  ];

  const clinicalCategories: AlertCategory[] = [
    "CBC",
    "BMP",
    "Imaging",
    "Preventive",
    "Vital Signs",
    "Medication",
    "Chronic Disease",
  ];

  return (
    <nav className="space-y-6">
      {/* Primary Filters */}
      <div>
        <h3 className="text-sm font-medium text-dark-text-secondary mb-2">
          Primary Filters
        </h3>
        <div className="space-y-1">
          {(["all", "general", "specific"] as AlertType[]).map((type) => (
            <button
              key={type}
              className={`w-full px-3 py-2 text-left rounded-lg transition-colors ${
                selectedType === type
                  ? "bg-accent-primary text-white"
                  : "hover:bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary"
              }`}
              onClick={() => onTypeSelect(type)}
            >
              <div className="flex justify-between items-center">
                <span>
                  {type.charAt(0).toUpperCase() + type.slice(1)} Alerts
                </span>
                <span className="text-sm">{alertCounts.byType[type]}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Severity Distribution */}
      {severityCounts && (
        <div>
          <h3 className="text-sm font-medium text-dark-text-secondary mb-2">
            Severity Distribution
          </h3>
          <div className="space-y-1">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-accent-error">Critical</span>
              <span className="text-sm">{severityCounts.critical}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-orange-500">High</span>
              <span className="text-sm">{severityCounts.high}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-accent-warning">Moderate</span>
              <span className="text-sm">{severityCounts.moderate}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-accent-success">Low</span>
              <span className="text-sm">{severityCounts.low}</span>
            </div>
          </div>
        </div>
      )}

      {/* Disease Categories */}
      <div>
        <button
          className="w-full flex items-center justify-between text-sm font-medium text-dark-text-secondary mb-2"
          onClick={() => setShowDiseaseCategories(!showDiseaseCategories)}
        >
          <span>Disease Categories</span>
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform ${
              showDiseaseCategories ? "rotate-180" : ""
            }`}
          />
        </button>
        {showDiseaseCategories && (
          <div className="space-y-1">
            {diseaseCategories.map((category) => (
              <button
                key={category}
                className={`w-full px-3 py-2 text-left rounded-lg transition-colors ${
                  selectedCategory === category
                    ? "bg-accent-primary text-white"
                    : "hover:bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary"
                }`}
                onClick={() => onCategorySelect(category)}
              >
                <div className="flex justify-between items-center">
                  <span>{category}</span>
                  <span className="text-sm">
                    {alertCounts.byCategory[category] || 0}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Clinical Categories */}
      <div>
        <button
          className="w-full flex items-center justify-between text-sm font-medium text-dark-text-secondary mb-2"
          onClick={() => setShowClinicalCategories(!showClinicalCategories)}
        >
          <span>Clinical Categories</span>
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform ${
              showClinicalCategories ? "rotate-180" : ""
            }`}
          />
        </button>
        {showClinicalCategories && (
          <div className="space-y-1">
            {clinicalCategories.map((category) => (
              <button
                key={category}
                className={`w-full px-3 py-2 text-left rounded-lg transition-colors ${
                  selectedCategory === category
                    ? "bg-accent-primary text-white"
                    : "hover:bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary"
                }`}
                onClick={() => onCategorySelect(category)}
              >
                <div className="flex justify-between items-center">
                  <span>{category}</span>
                  <span className="text-sm">
                    {alertCounts.byCategory[category] || 0}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
