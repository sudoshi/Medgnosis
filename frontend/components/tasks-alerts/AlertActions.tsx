import type { Alert } from "@/types/tasks-alerts";

import {
  BeakerIcon,
  CalendarIcon,
  ChatBubbleLeftIcon,
  DocumentArrowUpIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

interface AlertActionsProps {
  alert: Alert;
  onAction: (action: string) => void;
}

export default function AlertActions({ alert, onAction }: AlertActionsProps) {
  const getAvailableActions = () => {
    const actions = [];

    if (alert.category === "lab") {
      actions.push({
        id: "repeat_lab",
        label: "Repeat Lab",
        icon: BeakerIcon,
        onClick: () => onAction("repeat_lab"),
      });
    }

    if (alert.category === "imaging") {
      actions.push({
        id: "order_followup",
        label: "Order Follow-up",
        icon: DocumentArrowUpIcon,
        onClick: () => onAction("order_followup"),
      });
    }

    // Common actions for all alerts
    actions.push(
      {
        id: "schedule_appointment",
        label: "Schedule Follow-up",
        icon: CalendarIcon,
        onClick: () => onAction("schedule_appointment"),
      },
      {
        id: "send_message",
        label: "Send Message",
        icon: ChatBubbleLeftIcon,
        onClick: () => onAction("send_message"),
      },
    );

    if (alert.type === "general") {
      actions.push({
        id: "refresh_cohort",
        label: "Refresh Cohort",
        icon: ArrowPathIcon,
        onClick: () => onAction("refresh_cohort"),
      });
    }

    return actions;
  };

  const actions = getAvailableActions();

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {actions.map((action) => (
        <button
          key={action.id}
          className="flex items-center px-3 py-2 rounded-lg bg-dark-secondary text-dark-text-secondary hover:text-dark-text-primary transition-colors"
          title={action.label}
          onClick={action.onClick}
        >
          <action.icon className="h-4 w-4 mr-2" />
          {action.label}
        </button>
      ))}
    </div>
  );
}

// Quick Action Handlers (to be implemented in the parent component)
export const handleAlertAction = (
  action: string,
  alert: Alert,
  patientId?: string,
) => {
  switch (action) {
    case "repeat_lab":
      // Implementation for ordering repeat labs
      console.log("Ordering repeat lab for:", alert.metadata?.testName);
      break;

    case "order_followup":
      // Implementation for ordering follow-up imaging
      console.log("Ordering follow-up imaging");
      break;

    case "schedule_appointment":
      // Implementation for scheduling follow-up appointment
      console.log("Scheduling follow-up appointment for patient:", patientId);
      break;

    case "send_message":
      // Implementation for sending message to patient
      console.log("Sending message to patient:", patientId);
      break;

    case "refresh_cohort":
      // Implementation for refreshing population cohort
      console.log("Refreshing population cohort data");
      break;

    default:
      console.warn("Unknown action:", action);
  }
};
