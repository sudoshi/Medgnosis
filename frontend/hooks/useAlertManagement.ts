"use client"

import { useState, useCallback } from "react";

import { mockAlerts } from "@/services/mockTasksAlertsData";
import type { Alert } from "@/types/tasks-alerts";

export function useAlertManagement() {
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts);

  const acknowledgeAlert = useCallback((alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId ? { ...a, status: "acknowledged" as const } : a,
      ),
    );
  }, []);

  const markAsRead = useCallback((alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId ? { ...a, status: "read" as const } : a,
      ),
    );
  }, []);

  const getUnreadCount = useCallback(
    () => alerts.filter((a) => a.status === "unread").length,
    [alerts],
  );

  return {
    alerts,
    setAlerts,
    acknowledgeAlert,
    markAsRead,
    getUnreadCount,
  };
}
