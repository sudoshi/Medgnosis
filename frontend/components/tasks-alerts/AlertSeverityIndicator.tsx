import { calculateAlertSeverity } from "@/services/alertSeverityService";
import type { StandardizedAlert } from "@/types/standardized-alerts";


interface AlertSeverityIndicatorProps {
  alert: StandardizedAlert;
}

export default function AlertSeverityIndicator({
  alert,
}: AlertSeverityIndicatorProps) {
  const { score, label } = calculateAlertSeverity(alert);

  const getColorClasses = () => {
    if (score >= 80) {
      return "bg-accent-error/10 text-accent-error";
    } else if (score >= 60) {
      return "bg-accent-warning/10 text-accent-warning";
    } else if (score >= 40) {
      return "bg-accent-primary/10 text-accent-primary";
    } else {
      return "bg-accent-success/10 text-accent-success";
    }
  };

  return (
    <span
      className={`px-2 py-0.5 text-xs font-medium rounded-full ${getColorClasses()}`}
    >
      {label}
    </span>
  );
}
