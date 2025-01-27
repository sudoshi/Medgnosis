"use client";

import type { Task, Alert } from "@/types/tasks-alerts";

import { useState } from "react";
import {
  BellIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  FunnelIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

import AdminLayout from "@/components/layout/AdminLayout";
import { mockTasks, mockAlerts } from "@/services/mockTasksAlertsData";
import CreateTaskModal from "@/components/tasks-alerts/CreateTaskModal";
import AlertActions, {
  handleAlertAction,
} from "@/components/tasks-alerts/AlertActions";

type TaskType = "all" | "personal" | "practice" | "patient";
type AlertType = "all" | "general" | "specific";
type AlertCategory = "all" | "lab" | "imaging" | "procedure";

export default function TasksAlertsPage() {
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTaskType, setSelectedTaskType] = useState<TaskType>("all");
  const [selectedAlertType, setSelectedAlertType] = useState<AlertType>("all");
  const [selectedAlertCategory, setSelectedAlertCategory] =
    useState<AlertCategory>("all");

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
          <div className="bg-dark-primary rounded-lg border border-dark-border p-6 shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-dark-text-secondary text-sm font-medium">
                  Total Tasks
                </p>
                <p className="mt-2 text-2xl font-semibold">{tasks.length}</p>
              </div>
              <div className="rounded-lg bg-accent-primary/10 p-3">
                <ClipboardDocumentListIcon className="h-6 w-6 text-accent-primary" />
              </div>
            </div>
            <p className="mt-4 text-sm text-dark-text-secondary">
              Active tasks across all categories
            </p>
          </div>
          <div className="bg-dark-primary rounded-lg border border-dark-border p-6 shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-dark-text-secondary text-sm font-medium">
                  High Priority
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {tasks.filter((t) => t.priority === "high").length}
                </p>
              </div>
              <div className="rounded-lg bg-accent-error/10 p-3">
                <CheckCircleIcon className="h-6 w-6 text-accent-error" />
              </div>
            </div>
            <p className="mt-4 text-sm text-dark-text-secondary">
              Tasks requiring immediate attention
            </p>
          </div>
          <div className="bg-dark-primary rounded-lg border border-dark-border p-6 shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-dark-text-secondary text-sm font-medium">
                  New Alerts
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {alerts.filter((a) => a.status === "unread").length}
                </p>
              </div>
              <div className="rounded-lg bg-accent-warning/10 p-3">
                <BellIcon className="h-6 w-6 text-accent-warning" />
              </div>
            </div>
            <p className="mt-4 text-sm text-dark-text-secondary">
              Unread alerts requiring review
            </p>
          </div>
          <div className="bg-dark-primary rounded-lg border border-dark-border p-6 shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-dark-text-secondary text-sm font-medium">
                  Critical Results
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {alerts.filter((a) => a.priority === "high").length}
                </p>
              </div>
              <div className="rounded-lg bg-accent-error/10 p-3">
                <FunnelIcon className="h-6 w-6 text-accent-error" />
              </div>
            </div>
            <p className="mt-4 text-sm text-dark-text-secondary">
              High priority alerts to address
            </p>
          </div>
        </div>

        {/* Tasks Section */}
        <div className="bg-dark-primary rounded-lg border border-dark-border p-6 shadow-md">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Tasks</h2>
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
                          : "bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary"
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
                className="bg-dark-secondary/50 rounded-lg p-4 hover:bg-dark-secondary transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{task.title}</h3>
                    <p className="text-sm text-dark-text-secondary mt-1">
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
                      <span className="text-sm text-dark-text-secondary">
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
        <div className="bg-dark-primary rounded-lg border border-dark-border p-6 shadow-md">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Alerts</h2>
            <div className="flex space-x-4">
              <div className="flex space-x-2">
                {(["all", "general", "specific"] as AlertType[]).map((type) => (
                  <button
                    key={type}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      selectedAlertType === type
                        ? "bg-accent-primary text-white"
                        : "bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary"
                    }`}
                    onClick={() => setSelectedAlertType(type)}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex space-x-2">
                {(
                  ["all", "lab", "imaging", "procedure"] as AlertCategory[]
                ).map((category) => (
                  <button
                    key={category}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      selectedAlertCategory === category
                        ? "bg-accent-primary text-white"
                        : "bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary"
                    }`}
                    onClick={() => setSelectedAlertCategory(category)}
                  >
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className="bg-dark-secondary/50 rounded-lg p-4 hover:bg-dark-secondary transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-medium">{alert.title}</h3>
                      {alert.status === "unread" && (
                        <span className="h-2 w-2 rounded-full bg-accent-primary" />
                      )}
                    </div>
                    <p className="text-sm text-dark-text-secondary mt-1">
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
                      <span className="text-sm text-dark-text-secondary">
                        {new Date(alert.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {alert.metadata && (
                      <div className="mt-2 p-2 bg-dark-secondary rounded-lg">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {alert.metadata.testName && (
                            <div>
                              <span className="text-dark-text-secondary">
                                Test:{" "}
                              </span>
                              <span>{alert.metadata.testName}</span>
                            </div>
                          )}
                          {alert.metadata.value && (
                            <div>
                              <span className="text-dark-text-secondary">
                                Value:{" "}
                              </span>
                              <span>
                                {alert.metadata.value} {alert.metadata.unit}
                              </span>
                            </div>
                          )}
                          {alert.metadata.referenceRange && (
                            <div>
                              <span className="text-dark-text-secondary">
                                Reference Range:{" "}
                              </span>
                              <span>{alert.metadata.referenceRange}</span>
                            </div>
                          )}
                          {alert.metadata.orderingProvider && (
                            <div>
                              <span className="text-dark-text-secondary">
                                Ordering Provider:{" "}
                              </span>
                              <span>{alert.metadata.orderingProvider}</span>
                            </div>
                          )}
                        </div>
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
    </AdminLayout>
  );
}
