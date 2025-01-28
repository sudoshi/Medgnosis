import type { AlertPreferenceState } from "@/types/standardized-alerts";

import { useState, useCallback, useEffect } from "react";

const defaultPreferences: AlertPreferenceState = {
  selectedPriorities: {
    High: true,
    Moderate: true,
    Low: true,
  },
  selectedCategories: {
    CBC: true,
    BMP: true,
    Imaging: true,
    Preventive: true,
    "Vital Signs": true,
    Medication: true,
    "Chronic Disease": true,
    Cardiovascular: true,
    Endocrine: true,
    Renal: true,
    Respiratory: true,
    "Mental Health": true,
    Neurological: true,
    Musculoskeletal: true,
    Oncology: true,
    Metabolic: true,
  },
  enabledAlerts: new Set(),
};

export function useAlertPreferencesState() {
  const [preferences, setPreferences] =
    useState<AlertPreferenceState>(defaultPreferences);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const savedPreferences = localStorage.getItem("alertPreferences");

    if (savedPreferences) {
      const parsed = JSON.parse(savedPreferences);

      // Convert enabledAlerts back to Set
      parsed.enabledAlerts = new Set(parsed.enabledAlerts);
      setPreferences(parsed);
    }
  }, []);

  const savePreferences = useCallback(
    (newPreferences: AlertPreferenceState) => {
      setPreferences(newPreferences);
      // Save to localStorage, converting Set to Array
      localStorage.setItem(
        "alertPreferences",
        JSON.stringify({
          ...newPreferences,
          enabledAlerts: Array.from(newPreferences.enabledAlerts),
        }),
      );
    },
    [],
  );

  const togglePriority = useCallback(
    (priority: keyof AlertPreferenceState["selectedPriorities"]) => {
      setPreferences((prev) => ({
        ...prev,
        selectedPriorities: {
          ...prev.selectedPriorities,
          [priority]: !prev.selectedPriorities[priority],
        },
      }));
    },
    [],
  );

  const toggleCategory = useCallback(
    (category: keyof AlertPreferenceState["selectedCategories"]) => {
      setPreferences((prev) => ({
        ...prev,
        selectedCategories: {
          ...prev.selectedCategories,
          [category]: !prev.selectedCategories[category],
        },
      }));
    },
    [],
  );

  const toggleAlert = useCallback((alertId: string) => {
    setPreferences((prev) => {
      const newEnabledAlerts = new Set(prev.enabledAlerts);

      if (newEnabledAlerts.has(alertId)) {
        newEnabledAlerts.delete(alertId);
      } else {
        newEnabledAlerts.add(alertId);
      }

      return {
        ...prev,
        enabledAlerts: newEnabledAlerts,
      };
    });
  }, []);

  return {
    preferences,
    savePreferences,
    togglePriority,
    toggleCategory,
    toggleAlert,
    defaultPreferences,
  };
}
