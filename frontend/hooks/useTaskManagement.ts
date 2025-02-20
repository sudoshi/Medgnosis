
import { useState, useCallback } from "react";

import { mockTasks } from "@/services/mockTasksAlertsData";
import type { Task } from "@/types/tasks-alerts";

export type TaskType = "all" | "personal" | "practice" | "patient";

export function useTaskManagement() {
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [selectedTaskType, setSelectedTaskType] = useState<TaskType>("all");

  const filteredTasks = tasks.filter((task) => {
    if (selectedTaskType === "all") return true;

    return task.type === selectedTaskType;
  });

  const addTask = useCallback(
    (taskData: Omit<Task, "id" | "createdAt" | "updatedAt">) => {
      const newTask: Task = {
        id: `task${tasks.length + 1}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...taskData,
      };

      setTasks((prev) => [newTask, ...prev]);

      return newTask;
    },
    [tasks.length],
  );

  const completeTask = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: "completed" as const } : t,
      ),
    );
  }, []);

  const getHighPriorityCount = useCallback(
    () => tasks.filter((t) => t.priority === "high").length,
    [tasks],
  );

  return {
    tasks: filteredTasks,
    totalTasks: tasks.length,
    selectedTaskType,
    setSelectedTaskType,
    addTask,
    completeTask,
    getHighPriorityCount,
  };
}
