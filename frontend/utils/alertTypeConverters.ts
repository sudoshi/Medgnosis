import type { StandardizedAlert } from "@/types/standardized-alerts";
import type { Alert } from "@/types/tasks-alerts";

export function convertToStandardAlert(alert: Alert): StandardizedAlert {
  const severity = getSeverityFromPriority(alert.priority);
  const priority = getPriorityFromSeverity(severity);

  return {
    id: alert.id,
    type: getAlertType(alert),
    severity,
    category: getCategoryFromAlert(alert),
    priority,
    timestamp: alert.createdAt,
    details: {
      title: alert.title,
      description: alert.description,
      value: alert.metadata?.value,
      unit: alert.metadata?.unit,
      referenceRange: alert.metadata?.referenceRange,
      trend: alert.metadata?.trend,
      diseaseMetadata: alert.metadata?.diseaseMetadata,
    },
  };
}

function getSeverityFromPriority(
  priority: string,
): StandardizedAlert["severity"] {
  switch (priority.toLowerCase()) {
    case "high":
      return "critical";
    case "medium":
      return "moderate";
    case "low":
      return "low";
    default:
      return "moderate";
  }
}

function getPriorityFromSeverity(
  severity: StandardizedAlert["severity"],
): StandardizedAlert["priority"] {
  switch (severity) {
    case "critical":
    case "high":
      return "High";
    case "moderate":
      return "Moderate";
    case "low":
      return "Low";
    default:
      return "Moderate";
  }
}

function getAlertType(alert: Alert): StandardizedAlert["type"] {
  if (alert.metadata?.diseaseMetadata) {
    return "condition";
  }
  if (alert.metadata?.testName) {
    return "lab";
  }

  return "lab";
}

function getCategoryFromAlert(alert: Alert): StandardizedAlert["category"] {
  if (alert.metadata?.diseaseMetadata?.condition) {
    switch (alert.metadata.diseaseMetadata.condition.toLowerCase()) {
      case "hypertension":
      case "coronary artery disease":
        return "Cardiovascular";
      case "type 1 diabetes":
      case "type 2 diabetes":
        return "Endocrine";
      case "chronic kidney disease":
        return "Renal";
      case "asthma":
      case "copd":
        return "Respiratory";
      case "depression":
      case "anxiety":
        return "Mental Health";
      case "alzheimer's":
      case "dementia":
        return "Neurological";
      case "osteoarthritis":
      case "rheumatoid arthritis":
        return "Musculoskeletal";
      default:
        return "Chronic Disease";
    }
  }

  if (alert.metadata?.testName) {
    switch (alert.metadata.testName.toLowerCase()) {
      case "hemoglobin":
      case "wbc":
      case "platelets":
        return "CBC";
      case "sodium":
      case "potassium":
      case "creatinine":
      case "glucose":
        return "BMP";
      case "blood pressure":
      case "heart rate":
      case "temperature":
        return "Vital Signs";
      default:
        return "CBC";
    }
  }

  return "CBC";
}
