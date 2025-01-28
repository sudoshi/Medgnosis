import type { Alert, AlertType, AlertCategory } from "@/types/tasks-alerts";
import type { AlertPreferenceState } from "@/types/standardized-alerts";

import { useMemo } from "react";

interface AlertCounts {
  total: number;
  byType: {
    all: number;
    general: number;
    specific: number;
  };
  byCategory: Record<AlertCategory, number>;
}

function mapPriorityToPreference(
  priority: string,
): keyof AlertPreferenceState["selectedPriorities"] {
  switch (priority.toLowerCase()) {
    case "high":
      return "High";
    case "medium":
      return "Moderate";
    case "low":
      return "Low";
    default:
      return "Moderate";
  }
}

export function useAlertFilters(
  alerts: Alert[],
  preferences: AlertPreferenceState,
  selectedType: AlertType,
  selectedCategory: AlertCategory,
) {
  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      // Filter by type
      if (selectedType !== "all" && alert.type !== selectedType) {
        return false;
      }

      // Filter by category
      if (selectedCategory !== "all" && alert.category !== selectedCategory) {
        return false;
      }

      // Filter by preferences
      const preferencePriority = mapPriorityToPreference(alert.priority);

      if (!preferences.selectedPriorities[preferencePriority]) {
        return false;
      }

      if (
        alert.category !== "all" &&
        !preferences.selectedCategories[alert.category]
      ) {
        return false;
      }

      return true;
    });
  }, [alerts, preferences, selectedType, selectedCategory]);

  const alertCounts = useMemo(() => {
    const counts: AlertCounts = {
      total: alerts.length,
      byType: {
        all: 0,
        general: 0,
        specific: 0,
      },
      byCategory: {
        all: 0,
        CBC: 0,
        BMP: 0,
        Imaging: 0,
        Preventive: 0,
        "Vital Signs": 0,
        Medication: 0,
        "Chronic Disease": 0,
        Cardiovascular: 0,
        Endocrine: 0,
        Renal: 0,
        Respiratory: 0,
        "Mental Health": 0,
        Neurological: 0,
        Musculoskeletal: 0,
        Oncology: 0,
        Metabolic: 0,
      },
    };

    alerts.forEach((alert) => {
      // Count by type
      counts.byType[alert.type]++;
      counts.byType.all++;

      // Count by category
      if (alert.category !== "all") {
        counts.byCategory[alert.category]++;
      }
      counts.byCategory.all++;
    });

    return counts;
  }, [alerts]);

  return {
    filteredAlerts,
    alertCounts,
  };
}
