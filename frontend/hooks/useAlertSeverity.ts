
import { useMemo } from "react";

import { calculateAlertSeverity } from "@/services/alertSeverityService";
import type { Alert } from "@/types/tasks-alerts";
import { convertToStandardAlert } from "@/utils/alertTypeConverters";

export interface SeverityCounts {
  critical: number;
  high: number;
  moderate: number;
  low: number;
}

export function useAlertSeverity(alerts: Alert[]) {
  const severityCounts = useMemo(() => {
    const counts: SeverityCounts = {
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
    };

    alerts.forEach((alert) => {
      const score = calculateAlertSeverity(convertToStandardAlert(alert)).score;

      if (score >= 80) counts.critical++;
      else if (score >= 60) counts.high++;
      else if (score >= 40) counts.moderate++;
      else counts.low++;
    });

    return counts;
  }, [alerts]);

  const sortedAlerts = useMemo(
    () =>
      [...alerts].sort(
        (a, b) =>
          calculateAlertSeverity(convertToStandardAlert(b)).score -
          calculateAlertSeverity(convertToStandardAlert(a)).score,
      ),
    [alerts],
  );

  const getAlertScore = (alert: Alert) =>
    calculateAlertSeverity(convertToStandardAlert(alert)).score;

  const getCriticalAlerts = () =>
    alerts.filter((alert) => getAlertScore(alert) >= 80);

  const getHighAlerts = () =>
    alerts.filter((alert) => {
      const score = getAlertScore(alert);

      return score >= 60 && score < 80;
    });

  const getModerateAlerts = () =>
    alerts.filter((alert) => {
      const score = getAlertScore(alert);

      return score >= 40 && score < 60;
    });

  const getLowAlerts = () =>
    alerts.filter((alert) => getAlertScore(alert) < 40);

  return {
    severityCounts,
    sortedAlerts,
    getAlertScore,
    getCriticalAlerts,
    getHighAlerts,
    getModerateAlerts,
    getLowAlerts,
  };
}
