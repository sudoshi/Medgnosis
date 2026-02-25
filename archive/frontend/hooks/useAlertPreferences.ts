"use client"
import { useState, useEffect, useCallback } from "react";

import type { AlertPreferenceState } from "@/types/standardized-alerts";


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

export function useAlertPreferences() {
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

  return {
    preferences,
    savePreferences,
    defaultPreferences,
  };
}
