import {
  CalendarIcon,
  UserIcon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";

import type { Task } from "@/types/tasks-alerts";


interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTask: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
}

const taskTemplates = [
  {
    title: "Review Lab Results",
    description: "Review and follow up on recent laboratory results",
    type: "personal" as const,
    priority: "medium" as const,
  },
  {
    title: "Team Huddle",
    description: "Daily team huddle to discuss high-risk patients",
    type: "practice" as const,
    priority: "medium" as const,
  },
  {
    title: "Care Plan Review",
    description: "Review and update patient care plan",
    type: "patient" as const,
    priority: "high" as const,
  },
];

export default function CreateTaskModal({
  isOpen,
  onClose,
  onCreateTask,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<Task["type"]>("personal");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const tomorrow = new Date();

  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(15, 0, 0, 0);
  const [dueDate, setDueDate] = useState(tomorrow.toISOString().slice(0, 16));
  const [patientId, setPatientId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateTask({
      title,
      description,
      type,
      priority,
      status: "pending",
      dueDate: new Date(dueDate).toISOString(),
      ...(patientId && { patientId }),
    });
    onClose();
  };

  const applyTemplate = (template: (typeof taskTemplates)[0]) => {
    setTitle(template.title);
    setDescription(template.description);
    setType(template.type);
    setPriority(template.priority);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-primary rounded-lg w-full max-w-2xl p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Create New Task</h2>
          <button
            className="text-dark-text-secondary hover:text-dark-text-primary"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Quick Templates */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-dark-text-secondary">
            Quick Templates
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {taskTemplates.map((template) => (
              <button
                key={template.title}
                className="p-3 rounded-lg border border-dark-border hover:bg-dark-secondary text-left transition-colors"
                onClick={() => applyTemplate(template)}
              >
                <div className="font-medium">{template.title}</div>
                <div className="text-sm text-dark-text-secondary mt-1">
                  {template.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              required
              className="w-full px-3 py-2 rounded-lg bg-dark-secondary border border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Description
            </label>
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-dark-secondary border border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <div className="flex space-x-2">
                <button
                  className={`flex items-center px-3 py-2 rounded-lg ${
                    type === "personal"
                      ? "bg-accent-primary text-white"
                      : "bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary"
                  }`}
                  type="button"
                  onClick={() => setType("personal")}
                >
                  <UserIcon className="h-4 w-4 mr-2" />
                  Personal
                </button>
                <button
                  className={`flex items-center px-3 py-2 rounded-lg ${
                    type === "practice"
                      ? "bg-accent-primary text-white"
                      : "bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary"
                  }`}
                  type="button"
                  onClick={() => setType("practice")}
                >
                  <UserGroupIcon className="h-4 w-4 mr-2" />
                  Practice
                </button>
                <button
                  className={`flex items-center px-3 py-2 rounded-lg ${
                    type === "patient"
                      ? "bg-accent-primary text-white"
                      : "bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary"
                  }`}
                  type="button"
                  onClick={() => setType("patient")}
                >
                  <ClipboardDocumentListIcon className="h-4 w-4 mr-2" />
                  Patient
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <div className="flex space-x-2">
                <button
                  className={`px-3 py-2 rounded-lg ${
                    priority === "low"
                      ? "bg-accent-success text-white"
                      : "bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary"
                  }`}
                  type="button"
                  onClick={() => setPriority("low")}
                >
                  Low
                </button>
                <button
                  className={`px-3 py-2 rounded-lg ${
                    priority === "medium"
                      ? "bg-accent-warning text-white"
                      : "bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary"
                  }`}
                  type="button"
                  onClick={() => setPriority("medium")}
                >
                  Medium
                </button>
                <button
                  className={`px-3 py-2 rounded-lg ${
                    priority === "high"
                      ? "bg-accent-error text-white"
                      : "bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary"
                  }`}
                  type="button"
                  onClick={() => setPriority("high")}
                >
                  High
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Due Date</label>
              <div className="relative">
                <input
                  required
                  className="w-full px-3 py-2 rounded-lg bg-dark-secondary border border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  min={new Date().toISOString().slice(0, 16)}
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-dark-text-secondary pointer-events-none" />
              </div>
            </div>

            {type === "patient" && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Patient ID
                </label>
                <input
                  required
                  className="w-full px-3 py-2 rounded-lg bg-dark-secondary border border-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  placeholder="Enter patient ID"
                  type="text"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              className="px-4 py-2 rounded-lg bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90"
              type="submit"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
