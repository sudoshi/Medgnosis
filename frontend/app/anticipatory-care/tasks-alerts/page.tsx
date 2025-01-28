"use client";

import type { Task, Alert } from "@/types/tasks-alerts";
import type { AlertPreferenceState } from "@/types/standardized-alerts";
import type { AlertType, AlertCategory } from "@/types/tasks-alerts";

import { useState, useCallback } from "react";
import {
  BellIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  FunnelIcon,
  PlusIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

import AlertNavigation from "@/components/tasks-alerts/AlertNavigation";
import AdminLayout from "@/components/layout/AdminLayout";
import { mockTasks, mockAlerts } from "@/services/mockTasksAlertsData";
import CreateTaskModal from "@/components/tasks-alerts/CreateTaskModal";
import AlertActions, {
  handleAlertAction,
} from "@/components/tasks-alerts/AlertActions";
import AlertPreferencesModal from "@/components/tasks-alerts/AlertPreferencesModal";

type TaskType = "all" | "personal" | "practice" | "patient";

export default function TasksAlertsPage() {
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [selectedTaskType, setSelectedTaskType] = useState<TaskType>("all");
  const [selectedAlertType, setSelectedAlertType] = useState<AlertType>("all");
  const [selectedAlertCategory, setSelectedAlertCategory] =
    useState<AlertCategory>("all");
  const [alertPreferences, setAlertPreferences] =
    useState<AlertPreferenceState>({
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
    });

  const handleSavePreferences = useCallback(
    (preferences: AlertPreferenceState) => {
      setAlertPreferences(preferences);
      // Here you would typically save to backend/localStorage
    },
    [],
  );

  const filteredTasks = tasks.filter((task) => {
    if (selectedTaskType === "all") return true;

    return task.type === selectedTaskType;
  });

  const filteredAlerts = alerts.filter((alert) => {
    if (selectedAlertType !== "all" && alert.type !== selectedAlertType)
      return false;
    if (
      selectedAlertCategory !== "all" &&
      alert.category !== selectedAlertCategory
    )
      return false;

    return true;
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm font-medium">
                  Total Tasks
                </p>
                <p className="mt-2 text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                  {tasks.length}
                </p>
              </div>
              <div className="rounded-lg bg-accent-primary/10 p-3">
                <ClipboardDocumentListIcon className="h-6 w-6 text-accent-primary" />
              </div>
            </div>
            <p className="mt-4 text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Active tasks across all categories
            </p>
          </div>
          <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm font-medium">
                  High Priority
                </p>
                <p className="mt-2 text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                  {tasks.filter((t) => t.priority === "high").length}
                </p>
              </div>
              <div className="rounded-lg bg-accent-error/10 p-3">
                <CheckCircleIcon className="h-6 w-6 text-accent-error" />
              </div>
            </div>
            <p className="mt-4 text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Tasks requiring immediate attention
            </p>
          </div>
          <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm font-medium">
                  New Alerts
                </p>
                <p className="mt-2 text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                  {alerts.filter((a) => a.status === "unread").length}
                </p>
              </div>
              <div className="rounded-lg bg-accent-warning/10 p-3">
                <BellIcon className="h-6 w-6 text-accent-warning" />
              </div>
            </div>
            <p className="mt-4 text-sm text-light-text-secondary dark:text-dark-text-secondary">
              Unread alerts requiring review
            </p>
          </div>
          <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-light-text-secondary dark:text-dark-text-secondary text-sm font-medium">
                  Critical Results
                </p>
                <p className="mt-2 text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                  {alerts.filter((a) => a.priority === "high").length}
                </p>
              </div>
              <div className="rounded-lg bg-accent-error/10 p-3">
                <FunnelIcon className="h-6 w-6 text-accent-error" />
              </div>
            </div>
            <p className="mt-4 text-sm text-light-text-secondary dark:text-dark-text-secondary">
              High priority alerts to address
            </p>
          </div>
        </div>

        {/* Tasks Section */}
        <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
              Tasks
            </h2>
            <div className="flex items-center space-x-4">
              <button
                className="flex items-center px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors"
                onClick={() => setIsCreateModalOpen(true)}
              >
                <PlusIcon className="h-5 w-5 mr-2" />
                Create Task
              </button>
              <div className="flex space-x-2">
                {(["all", "personal", "practice", "patient"] as TaskType[]).map(
                  (type) => (
                    <button
                      key={type}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                        selectedTaskType === type
                          ? "bg-accent-primary text-white"
                          : "bg-light-secondary dark:bg-dark-secondary text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary"
                      }`}
                      onClick={() => setSelectedTaskType(type)}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className="bg-light-secondary/50 dark:bg-dark-secondary/50 rounded-lg p-4 hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-light-text-primary dark:text-dark-text-primary">
                      {task.title}
                    </h3>
                    <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
                      {task.description}
                    </p>
                    <div className="flex items-center space-x-4 mt-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          task.priority === "high"
                            ? "bg-accent-error/10 text-accent-error"
                            : task.priority === "medium"
                              ? "bg-accent-warning/10 text-accent-warning"
                              : "bg-accent-success/10 text-accent-success"
                        }`}
                      >
                        {task.priority.charAt(0).toUpperCase() +
                          task.priority.slice(1)}
                      </span>
                      <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                        Due: {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    className="p-2 rounded-lg bg-accent-success/10 text-accent-success hover:bg-accent-success/20 transition-colors"
                    onClick={() => {
                      const updatedTasks = tasks.map((t) =>
                        t.id === task.id
                          ? { ...t, status: "completed" as const }
                          : t,
                      );

                      setTasks(updatedTasks);
                    }}
                  >
                    <CheckCircleIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts Section */}
        <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary">
                Alerts
              </h2>
              <button
                className="flex items-center px-3 py-1.5 rounded-lg bg-light-secondary dark:bg-dark-secondary text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary transition-colors"
                onClick={() => setIsPreferencesModalOpen(true)}
              >
                <Cog6ToothIcon className="h-5 w-5 mr-2" />
                Alert Preferences
              </button>
            </div>
          </div>

          <div className="flex">
            {/* Navigation Panel - 30% */}
            <div className="w-[30%] min-w-[250px] max-w-[350px] pr-6">
              <AlertNavigation
                alertCounts={{
                  total: alerts.length,
                  byType: {
                    all: alerts.length,
                    general: alerts.filter((a) => a.type === "general").length,
                    specific: alerts.filter((a) => a.type === "specific")
                      .length,
                  },
                  byCategory: {
                    all: alerts.length,
                    Cardiovascular: alerts.filter(
                      (a) => a.category === "Cardiovascular",
                    ).length,
                    Endocrine: alerts.filter((a) => a.category === "Endocrine")
                      .length,
                    Renal: alerts.filter((a) => a.category === "Renal").length,
                    Respiratory: alerts.filter(
                      (a) => a.category === "Respiratory",
                    ).length,
                    "Mental Health": alerts.filter(
                      (a) => a.category === "Mental Health",
                    ).length,
                    Neurological: alerts.filter(
                      (a) => a.category === "Neurological",
                    ).length,
                    Musculoskeletal: alerts.filter(
                      (a) => a.category === "Musculoskeletal",
                    ).length,
                    Oncology: alerts.filter((a) => a.category === "Oncology")
                      .length,
                    Metabolic: alerts.filter((a) => a.category === "Metabolic")
                      .length,
                    CBC: alerts.filter((a) => a.category === "CBC").length,
                    BMP: alerts.filter((a) => a.category === "BMP").length,
                    Imaging: alerts.filter((a) => a.category === "Imaging")
                      .length,
                    Preventive: alerts.filter(
                      (a) => a.category === "Preventive",
                    ).length,
                    "Vital Signs": alerts.filter(
                      (a) => a.category === "Vital Signs",
                    ).length,
                    Medication: alerts.filter(
                      (a) => a.category === "Medication",
                    ).length,
                    "Chronic Disease": alerts.filter(
                      (a) => a.category === "Chronic Disease",
                    ).length,
                  },
                }}
                selectedCategory={selectedAlertCategory}
                selectedType={selectedAlertType}
                onCategorySelect={setSelectedAlertCategory}
                onTypeSelect={setSelectedAlertType}
              />
            </div>

            {/* Alerts Panel - 70% */}
            <div className="flex-1 space-y-4">
              {filteredAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="bg-light-secondary/50 dark:bg-dark-secondary/50 rounded-lg p-4 hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-medium text-light-text-primary dark:text-dark-text-primary">
                          {alert.title}
                        </h3>
                        {alert.status === "unread" && (
                          <span className="h-2 w-2 rounded-full bg-accent-primary" />
                        )}
                      </div>
                      <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">
                        {alert.description}
                      </p>
                      <div className="flex items-center space-x-4 mt-2">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            alert.priority === "high"
                              ? "bg-accent-error/10 text-accent-error"
                              : alert.priority === "medium"
                                ? "bg-accent-warning/10 text-accent-warning"
                                : "bg-accent-success/10 text-accent-success"
                          }`}
                        >
                          {alert.priority.charAt(0).toUpperCase() +
                            alert.priority.slice(1)}
                        </span>
                        <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                          {new Date(alert.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {alert.metadata && (
                        <div className="mt-2 space-y-2">
                          <div className="p-2 bg-light-secondary dark:bg-dark-secondary rounded-lg">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {alert.metadata.testName && (
                                <div>
                                  <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                    Test:{" "}
                                  </span>
                                  <span className="text-light-text-primary dark:text-dark-text-primary">
                                    {alert.metadata.testName}
                                  </span>
                                </div>
                              )}
                              {alert.metadata.value && (
                                <div>
                                  <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                    Value:{" "}
                                  </span>
                                  <span className="text-light-text-primary dark:text-dark-text-primary">
                                    {alert.metadata.value} {alert.metadata.unit}
                                  </span>
                                </div>
                              )}
                              {alert.metadata.referenceRange && (
                                <div>
                                  <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                    Reference Range:{" "}
                                  </span>
                                  <span className="text-light-text-primary dark:text-dark-text-primary">
                                    {alert.metadata.referenceRange}
                                  </span>
                                </div>
                              )}
                              {alert.metadata.orderingProvider && (
                                <div>
                                  <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                    Ordering Provider:{" "}
                                  </span>
                                  <span className="text-light-text-primary dark:text-dark-text-primary">
                                    {alert.metadata.orderingProvider}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Disease Metadata */}
                          {alert.metadata.diseaseMetadata && (
                            <div className="p-2 bg-light-secondary dark:bg-dark-secondary rounded-lg">
                              <div className="space-y-2">
                                {/* Condition */}
                                <div>
                                  <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                    Condition:{" "}
                                  </span>
                                  <span className="text-light-text-primary dark:text-dark-text-primary">
                                    {alert.metadata.diseaseMetadata.condition}
                                  </span>
                                </div>

                                {/* Metrics */}
                                {alert.metadata.diseaseMetadata.metrics && (
                                  <div className="grid grid-cols-2 gap-2">
                                    {alert.metadata.diseaseMetadata.metrics.map(
                                      (metric, index) => (
                                        <div
                                          key={index}
                                          className="flex items-center space-x-2"
                                        >
                                          <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                            {metric.name}:{" "}
                                          </span>
                                          <span className="text-light-text-primary dark:text-dark-text-primary">
                                            {metric.value} {metric.unit}
                                          </span>
                                          <span
                                            className={`text-xs px-1.5 py-0.5 rounded-full ${
                                              metric.trend === "improving"
                                                ? "bg-accent-success/10 text-accent-success"
                                                : metric.trend === "worsening"
                                                  ? "bg-accent-error/10 text-accent-error"
                                                  : "bg-accent-warning/10 text-accent-warning"
                                            }`}
                                          >
                                            {metric.trend}
                                          </span>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                )}

                                {/* Complications */}
                                {alert.metadata.diseaseMetadata
                                  .complications && (
                                  <div>
                                    <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                      Complications:{" "}
                                    </span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {alert.metadata.diseaseMetadata.complications.map(
                                        (complication, index) => (
                                          <span
                                            key={index}
                                            className="px-2 py-0.5 text-xs rounded-full bg-accent-error/10 text-accent-error"
                                          >
                                            {complication}
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Medications */}
                                {alert.metadata.diseaseMetadata.medications && (
                                  <div>
                                    <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                      Medications:{" "}
                                    </span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {alert.metadata.diseaseMetadata.medications.map(
                                        (medication, index) => (
                                          <span
                                            key={index}
                                            className="px-2 py-0.5 text-xs rounded-full bg-accent-primary/10 text-accent-primary"
                                          >
                                            {medication}
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Follow-up */}
                                <div className="flex justify-between">
                                  <div>
                                    <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                      Last Assessment:{" "}
                                    </span>
                                    <span className="text-light-text-primary dark:text-dark-text-primary">
                                      {new Date(
                                        alert.metadata.diseaseMetadata.lastAssessment,
                                      ).toLocaleDateString()}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-light-text-secondary dark:text-dark-text-secondary">
                                      Next Follow-up:{" "}
                                    </span>
                                    <span className="text-light-text-primary dark:text-dark-text-primary">
                                      {new Date(
                                        alert.metadata.diseaseMetadata.nextFollowUp,
                                      ).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="space-y-4">
                      <AlertActions
                        alert={alert}
                        onAction={(action) =>
                          handleAlertAction(action, alert, alert.patientId)
                        }
                      />
                      <button
                        className="p-2 rounded-lg bg-accent-success/10 text-accent-success hover:bg-accent-success/20 transition-colors"
                        onClick={() => {
                          const updatedAlerts = alerts.map((a) =>
                            a.id === alert.id
                              ? { ...a, status: "acknowledged" as const }
                              : a,
                          );

                          setAlerts(updatedAlerts);
                        }}
                      >
                        <CheckCircleIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateTask={(taskData) => {
          const newTask: Task = {
            id: `task${tasks.length + 1}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...taskData,
          };

          setTasks([newTask, ...tasks]);
          setIsCreateModalOpen(false);
        }}
      />

      <AlertPreferencesModal
        initialPreferences={alertPreferences}
        isOpen={isPreferencesModalOpen}
        onClose={() => setIsPreferencesModalOpen(false)}
        onSavePreferences={handleSavePreferences}
      />
    </AdminLayout>
  );
}
