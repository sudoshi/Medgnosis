import type { AlertType, AlertCategory } from "@/types/tasks-alerts";

import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

interface AlertNavigationProps {
  selectedType: AlertType;
  selectedCategory: AlertCategory;
  onTypeSelect: (type: AlertType) => void;
  onCategorySelect: (category: AlertCategory) => void;
  alertCounts: {
    total: number;
    byType: Record<AlertType, number>;
    byCategory: Record<AlertCategory, number>;
  };
}

export default function AlertNavigation({
  selectedType,
  selectedCategory,
  onTypeSelect,
  onCategorySelect,
  alertCounts,
}: AlertNavigationProps) {
  const [isDiseaseExpanded, setIsDiseaseExpanded] = useState(true);
  const [isClinicalExpanded, setIsClinicalExpanded] = useState(true);

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

  const NavItem = ({
    label,
    isSelected,
    count,
    onClick,
  }: {
    label: string;
    isSelected: boolean;
    count: number;
    onClick: () => void;
  }) => (
    <button
      className={`w-full px-4 py-2 text-left flex items-center justify-between hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors ${
        isSelected
          ? "bg-accent-primary/10 text-accent-primary"
          : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary"
      }`}
      onClick={onClick}
    >
      <span>{label}</span>
      <span
        className={`px-2 py-0.5 text-xs rounded-full ${
          isSelected
            ? "bg-accent-primary text-white"
            : "bg-light-secondary dark:bg-dark-secondary"
        }`}
      >
        {count}
      </span>
    </button>
  );

  const GroupHeader = ({
    label,
    isExpanded,
    onToggle,
  }: {
    label: string;
    isExpanded: boolean;
    onToggle: () => void;
  }) => (
    <button
      className="w-full px-4 py-2 text-left flex items-center justify-between text-light-text-primary dark:text-dark-text-primary font-medium hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors"
      onClick={onToggle}
    >
      <span>{label}</span>
      <ChevronDownIcon
        className={`h-4 w-4 transition-transform ${
          isExpanded ? "" : "-rotate-90"
        }`}
      />
    </button>
  );

  return (
    <div className="h-full border-r border-light-border dark:border-dark-border">
      <div className="space-y-1">
        {/* Primary Categories */}
        <NavItem
          count={alertCounts.total}
          isSelected={selectedType === "all" && selectedCategory === "all"}
          label="All Alerts"
          onClick={() => {
            onTypeSelect("all");
            onCategorySelect("all");
          }}
        />
        <NavItem
          count={alertCounts.byType.general}
          isSelected={selectedType === "general"}
          label="General Alerts"
          onClick={() => onTypeSelect("general")}
        />
        <NavItem
          count={alertCounts.byType.specific}
          isSelected={selectedType === "specific"}
          label="Specific Alerts"
          onClick={() => onTypeSelect("specific")}
        />

        {/* Disease Categories */}
        <div className="mt-4">
          <GroupHeader
            isExpanded={isDiseaseExpanded}
            label="Disease Categories"
            onToggle={() => setIsDiseaseExpanded(!isDiseaseExpanded)}
          />
          {isDiseaseExpanded && (
            <div className="space-y-1">
              {diseaseCategories.map((category) => (
                <NavItem
                  key={category}
                  count={alertCounts.byCategory[category] || 0}
                  isSelected={selectedCategory === category}
                  label={category}
                  onClick={() => onCategorySelect(category)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Clinical Categories */}
        <div className="mt-4">
          <GroupHeader
            isExpanded={isClinicalExpanded}
            label="Clinical Categories"
            onToggle={() => setIsClinicalExpanded(!isClinicalExpanded)}
          />
          {isClinicalExpanded && (
            <div className="space-y-1">
              {clinicalCategories.map((category) => (
                <NavItem
                  key={category}
                  count={alertCounts.byCategory[category] || 0}
                  isSelected={selectedCategory === category}
                  label={category}
                  onClick={() => onCategorySelect(category)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
