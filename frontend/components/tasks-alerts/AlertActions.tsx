import {
  BeakerIcon,
  CalendarIcon,
  ChatBubbleLeftIcon,
  DocumentArrowUpIcon,
  ArrowPathIcon,
  HeartIcon,
  BeakerIcon as BeakerIconSolid,
  BoltIcon,
  SparklesIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";

import type { Alert } from "@/types/tasks-alerts";


interface AlertActionsProps {
  alert: Alert;
  onAction: (action: string) => void;
}

export default function AlertActions({ alert, onAction }: AlertActionsProps) {
  const getAvailableActions = () => {
    const actions = [];

    // Lab-related categories
    if (alert.category === "CBC" || alert.category === "BMP") {
      actions.push({
        id: "repeat_lab",
        label: "Repeat Lab",
        icon: BeakerIcon,
        onClick: () => onAction("repeat_lab"),
      });
    }

    // Imaging category
    if (alert.category === "Imaging") {
      actions.push({
        id: "order_followup",
        label: "Order Follow-up",
        icon: DocumentArrowUpIcon,
        onClick: () => onAction("order_followup"),
      });
    }

    // Disease-specific actions
    switch (alert.category) {
      case "Cardiovascular":
        actions.push({
          id: "cardiac_consult",
          label: "Cardiac Consult",
          icon: HeartIcon,
          onClick: () => onAction("cardiac_consult"),
        });
        break;

      case "Endocrine":
        actions.push({
          id: "check_glucose",
          label: "Check Glucose",
          icon: BeakerIconSolid,
          onClick: () => onAction("check_glucose"),
        });
        break;

      case "Renal":
        actions.push({
          id: "nephrology_consult",
          label: "Nephrology Consult",
          icon: BoltIcon,
          onClick: () => onAction("nephrology_consult"),
        });
        break;

      case "Mental Health":
        actions.push({
          id: "psych_consult",
          label: "Psych Consult",
          icon: SparklesIcon,
          onClick: () => onAction("psych_consult"),
        });
        break;

      case "Neurological":
        actions.push({
          id: "neuro_consult",
          label: "Neuro Consult",
          icon: SparklesIcon,
          onClick: () => onAction("neuro_consult"),
        });
        break;

      case "Musculoskeletal":
        actions.push({
          id: "rheum_consult",
          label: "Rheum Consult",
          icon: BoltIcon,
          onClick: () => onAction("rheum_consult"),
        });
        break;

      case "Oncology":
        actions.push({
          id: "onco_consult",
          label: "Onco Consult",
          icon: SparklesIcon,
          onClick: () => onAction("onco_consult"),
        });
        break;

      case "Metabolic":
        actions.push({
          id: "nutrition_consult",
          label: "Nutrition Consult",
          icon: BeakerIconSolid,
          onClick: () => onAction("nutrition_consult"),
        });
        break;

      case "Preventive":
        actions.push({
          id: "preventive_screen",
          label: "Screen Due",
          icon: ClipboardDocumentListIcon,
          onClick: () => onAction("preventive_screen"),
        });
        break;

      case "Vital Signs":
        actions.push({
          id: "vitals_check",
          label: "Check Vitals",
          icon: HeartIcon,
          onClick: () => onAction("vitals_check"),
        });
        break;

      case "Medication":
        actions.push({
          id: "med_review",
          label: "Med Review",
          icon: ClipboardDocumentListIcon,
          onClick: () => onAction("med_review"),
        });
        break;

      case "Chronic Disease":
        actions.push({
          id: "disease_monitor",
          label: "Monitor",
          icon: ClipboardDocumentListIcon,
          onClick: () => onAction("disease_monitor"),
        });
        break;
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
    <div className="flex flex-wrap gap-2">
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
      console.log("Ordering repeat lab for:", alert.metadata?.testName);
      break;

    case "order_followup":
      console.log("Ordering follow-up imaging");
      break;

    case "schedule_appointment":
      console.log("Scheduling follow-up appointment for patient:", patientId);
      break;

    case "send_message":
      console.log("Sending message to patient:", patientId);
      break;

    case "refresh_cohort":
      console.log("Refreshing population cohort data");
      break;

    case "cardiac_consult":
      console.log("Requesting cardiac consultation for patient:", patientId);
      break;

    case "check_glucose":
      console.log("Ordering glucose check for patient:", patientId);
      break;

    case "nephrology_consult":
      console.log("Requesting nephrology consultation for patient:", patientId);
      break;

    case "psych_consult":
      console.log(
        "Requesting psychiatric consultation for patient:",
        patientId,
      );
      break;

    case "neuro_consult":
      console.log("Requesting neurology consultation for patient:", patientId);
      break;

    case "rheum_consult":
      console.log(
        "Requesting rheumatology consultation for patient:",
        patientId,
      );
      break;

    case "onco_consult":
      console.log("Requesting oncology consultation for patient:", patientId);
      break;

    case "nutrition_consult":
      console.log("Requesting nutrition consultation for patient:", patientId);
      break;

    case "preventive_screen":
      console.log("Scheduling preventive screening for patient:", patientId);
      break;

    case "vitals_check":
      console.log("Scheduling vitals check for patient:", patientId);
      break;

    case "med_review":
      console.log("Scheduling medication review for patient:", patientId);
      break;

    case "disease_monitor":
      console.log("Setting up disease monitoring for patient:", patientId);
      break;

    default:
      console.warn("Unknown action:", action);
  }
};
