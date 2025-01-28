"use client";

import type {
  AlertPriority,
  AlertPreferenceState,
  AlertCategoryType,
} from "@/types/standardized-alerts";

import { useState, useEffect } from "react";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";

import { alertCategories } from "@/services/standardizedAlerts";

interface AlertPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePreferences: (preferences: AlertPreferenceState) => void;
  initialPreferences?: AlertPreferenceState;
}

export default function AlertPreferencesModal({
  isOpen,
  onClose,
  onSavePreferences,
  initialPreferences,
}: AlertPreferencesModalProps) {
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
    enabledAlerts: new Set<string>(),
  };

  const [preferences, setPreferences] = useState<AlertPreferenceState>(
    initialPreferences || defaultPreferences,
  );

  const priorities: AlertPriority[] = ["High", "Moderate", "Low"];

  const [previewCounts, setPreviewCounts] = useState({
    total: 0,
    byPriority: {} as Record<AlertPriority, number>,
    byCategory: {} as Record<AlertCategoryType, number>,
  });

  // Calculate preview counts whenever preferences change
  useEffect(() => {
    const counts = {
      total: 0,
      byPriority: {} as Record<AlertPriority, number>,
      byCategory: {} as Record<AlertCategoryType, number>,
    };

    alertCategories.forEach((category) => {
      const enabledAlerts = category.alerts.filter((alert) => {
        const priorityEnabled = preferences.selectedPriorities[alert.priority];
        const categoryEnabled = preferences.selectedCategories[category.name];

        return priorityEnabled && categoryEnabled;
      });

      counts.byCategory[category.name] = enabledAlerts.length;
      counts.total += enabledAlerts.length;

      // Count by priority
      enabledAlerts.forEach((alert) => {
        if (!counts.byPriority[alert.priority]) {
          counts.byPriority[alert.priority] = 0;
        }
        counts.byPriority[alert.priority]++;
      });
    });

    setPreviewCounts(counts);
  }, [preferences]);

  const togglePriority = (priority: AlertPriority) => {
    setPreferences((prev) => ({
      ...prev,
      selectedPriorities: {
        ...prev.selectedPriorities,
        [priority]: !prev.selectedPriorities[priority],
      },
    }));
  };

  const toggleCategory = (categoryName: AlertCategoryType) => {
    setPreferences((prev) => ({
      ...prev,
      selectedCategories: {
        ...prev.selectedCategories,
        [categoryName]: !prev.selectedCategories[categoryName],
      },
    }));
  };

  const toggleAlert = (alertId: string) => {
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
  };

  const handleSave = () => {
    onSavePreferences(preferences);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-primary rounded-lg w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-2">
            <Cog6ToothIcon className="h-6 w-6 text-accent-primary" />
            <h2 className="text-xl font-semibold">Alert Preferences</h2>
          </div>
          <button
            className="text-dark-text-secondary hover:text-dark-text-primary"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Priority Filters */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-dark-text-secondary mb-2">
            Priority Filters
          </h3>
          <div className="flex flex-col space-y-4">
            <div className="flex space-x-4">
              {priorities.map((priority) => (
                <button
                  key={priority}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    preferences.selectedPriorities[priority]
                      ? priority === "High"
                        ? "bg-accent-error/10 text-accent-error"
                        : priority === "Moderate"
                          ? "bg-accent-warning/10 text-accent-warning"
                          : "bg-accent-success/10 text-accent-success"
                      : "bg-dark-secondary text-dark-text-secondary"
                  }`}
                  onClick={() => togglePriority(priority)}
                >
                  <div className="flex flex-col items-center">
                    <span>{priority}</span>
                    <span className="text-xs mt-1">
                      {previewCounts.byPriority[priority] || 0} alerts
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <div className="text-sm text-dark-text-secondary">
              Total Enabled Alerts: {previewCounts.total}
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="space-y-6">
          {alertCategories.map((category) => (
            <div
              key={category.name}
              className="bg-dark-secondary/50 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-medium">{category.name}</h3>
                  <p className="text-sm text-dark-text-secondary">
                    {category.description}
                  </p>
                </div>
                <div className="flex items-center space-x-4">
                  <button
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      preferences.selectedCategories[category.name]
                        ? "bg-accent-primary text-white"
                        : "bg-dark-secondary text-dark-text-secondary"
                    }`}
                    onClick={() => toggleCategory(category.name)}
                  >
                    {preferences.selectedCategories[category.name]
                      ? "Enabled"
                      : "Disabled"}
                  </button>
                  <span className="text-sm text-dark-text-secondary">
                    {previewCounts.byCategory[category.name] || 0} alerts
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {category.alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-dark-secondary transition-colors"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">
                          {alert.details.title}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            alert.priority === "High"
                              ? "bg-accent-error/10 text-accent-error"
                              : alert.priority === "Moderate"
                                ? "bg-accent-warning/10 text-accent-warning"
                                : "bg-accent-success/10 text-accent-success"
                          }`}
                        >
                          {alert.priority}
                        </span>
                      </div>
                      <p className="text-sm text-dark-text-secondary">
                        {alert.details.description}
                      </p>
                    </div>
                    <button
                      className={`p-2 rounded-lg transition-colors ${
                        preferences.enabledAlerts.has(alert.id)
                          ? "bg-accent-primary text-white"
                          : "bg-dark-secondary text-dark-text-secondary"
                      }`}
                      onClick={() => toggleAlert(alert.id)}
                    >
                      {preferences.enabledAlerts.has(alert.id)
                        ? "Enabled"
                        : "Disabled"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-4 mt-6 pt-4 border-t border-dark-border">
          <button
            className="px-4 py-2 rounded-lg bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors"
            onClick={handleSave}
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
}
