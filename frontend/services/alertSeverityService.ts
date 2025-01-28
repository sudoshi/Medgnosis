import type { StandardizedAlert } from "@/types/standardized-alerts";

interface SeverityScore {
  score: number;
  label: string;
}

export function calculateAlertSeverity(
  alert: StandardizedAlert,
): SeverityScore {
  let score = 0;

  // Base severity score
  switch (alert.severity) {
    case "critical":
      score += 80;
      break;
    case "high":
      score += 60;
      break;
    case "moderate":
      score += 40;
      break;
    case "low":
      score += 20;
      break;
  }

  // Additional factors
  if (alert.details.diseaseMetadata) {
    // Check for complications
    if (alert.details.diseaseMetadata.complications?.length) {
      score += 10;
    }

    // Check metrics trends
    if (alert.details.diseaseMetadata.metrics) {
      const hasWorseningMetrics = alert.details.diseaseMetadata.metrics.some(
        (metric) => metric.trend === "worsening",
      );

      if (hasWorseningMetrics) {
        score += 10;
      }
    }
  }

  // Cap score at 100
  score = Math.min(score, 100);

  // Determine label based on score
  let label: string;

  if (score >= 80) {
    label = "Critical";
  } else if (score >= 60) {
    label = "High";
  } else if (score >= 40) {
    label = "Moderate";
  } else {
    label = "Low";
  }

  return { score, label };
}
