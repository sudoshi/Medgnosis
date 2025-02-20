"use client";

import { Mic, MicOff, Save, Edit, AlertCircle } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type {
  SOAPNote,
  InitialVisitDetails
} from "@/types/soap-note";

interface SuperNoteInitialVisitProps {
  note: SOAPNote;
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSave: () => void;
  onNoteChange: (note: SOAPNote) => void;
}

interface Section {
  title: string;
  prompt: string;
  icon: string;
  subsections?: string[];
}

const sections: Record<keyof InitialVisitDetails, Section> = {
  demographics: {
    title: "Demographics & Registration",
    prompt:
      "Patient demographics, contact info, emergency contacts, preferred pharmacy",
    icon: "👤",
  },
  insuranceInfo: {
    title: "Insurance Information",
    prompt: "Primary and secondary insurance, guarantor information",
    icon: "📄",
  },
  chiefComplaint: {
    title: "Chief Complaint",
    prompt: "Primary reason for visit in patient's own words",
    icon: "🗣️",
  },
  hpi: {
    title: "History of Present Illness",
    prompt:
      "Onset, Location, Duration, Characterization, Aggravating/Alleviating Factors, Radiation, Temporal Factors, Severity",
    icon: "📝",
  },
  allergies: {
    title: "Allergies & Reactions",
    prompt:
      "Medications, foods, environmental allergens and specific reactions",
    icon: "⚠️",
  },
  medications: {
    title: "Medication History",
    prompt:
      "Current medications, past medications, adherence patterns, side effects",
    subsections: ["current", "past", "adherence"],
    icon: "💊",
  },
  pmh: {
    title: "Past Medical History",
    prompt:
      "Chronic conditions, surgeries, hospitalizations, major illnesses/injuries",
    subsections: ["medical", "surgical", "hospitalizations", "trauma"],
    icon: "📚",
  },
  familyHistory: {
    title: "Family History",
    prompt:
      "Health conditions in immediate and extended family, age of onset, genetic testing",
    subsections: ["immediate", "extended", "genetic"],
    icon: "👨‍👩‍👧‍👦",
  },
  socialHistory: {
    title: "Social History",
    prompt: "Occupation, lifestyle, habits, diet, exercise, substance use",
    subsections: [
      "occupation",
      "lifestyle",
      "habits",
      "diet",
      "exercise",
      "substances",
    ],
    icon: "🏠",
  },
  preventiveCare: {
    title: "Preventive Care History",
    prompt: "Immunizations, health screenings, last physical examination",
    subsections: ["immunizations", "screenings", "lastPhysical"],
    icon: "🛡️",
  },
  ros: {
    title: "Review of Systems",
    prompt: "Comprehensive review of all body systems",
    subsections: [
      "constitutional",
      "heent",
      "cardiovascular",
      "respiratory",
      "gi",
      "gu",
      "musculoskeletal",
      "skin",
      "neurological",
      "psychiatric",
      "endocrine",
      "hematologic",
      "allergic",
    ],
    icon: "🔍",
  },
  vitalSigns: {
    title: "Vital Signs",
    prompt: "Complete set of vital signs including BMI calculation",
    subsections: [
      "bp",
      "hr",
      "rr",
      "temp",
      "height",
      "weight",
      "bmi",
      "painScore",
    ],
    icon: "📊",
  },
  physicalExam: {
    title: "Physical Examination",
    prompt: "Comprehensive physical examination by system",
    subsections: [
      "general",
      "heent",
      "neck",
      "chest",
      "cardiac",
      "abdomen",
      "extremities",
      "skin",
      "neuro",
      "psychiatric",
    ],
    icon: "👨‍⚕️",
  },
  assessment: {
    title: "Assessment",
    prompt:
      "Clinical impressions, diagnostic certainty, differential diagnoses",
    icon: "📋",
  },
  problemList: {
    title: "Problem List",
    prompt: "Comprehensive list of active and inactive problems",
    icon: "📑",
  },
  plan: {
    title: "Treatment Plan",
    prompt: "Diagnostic tests, treatments, medications, referrals, procedures",
    subsections: [
      "diagnostics",
      "treatments",
      "medications",
      "referrals",
      "procedures",
    ],
    icon: "📝",
  },
  patientEducation: {
    title: "Patient Education",
    prompt: "Education provided, materials given, understanding assessed",
    icon: "📖",
  },
  followUpPlan: {
    title: "Follow-up Plan",
    prompt: "Next appointment, monitoring plan, return precautions",
    icon: "📅",
  },
  ebmGuidelines: {
    title: "EBM Guidelines",
    prompt: "Evidence-based measures and guidelines addressed during visit",
    icon: "📊",
  },
};

export function SuperNoteInitialVisit({
  note,
  isRecording,
  onStartRecording,
  onStopRecording,
  onSave,
  onNoteChange,
}: SuperNoteInitialVisitProps) {
  const [activeSection, setActiveSection] =
    useState<keyof InitialVisitDetails>("demographics");
  const [editMode, setEditMode] = useState(false);

  const handleSectionChange = (
    sectionKey: keyof InitialVisitDetails,
    value: string,
    subsection?: string
  ) => {
    // Ensure initialVisitDetails is initialized
    const initialVisitDetails: InitialVisitDetails = {
      ...(note.initialVisitDetails ?? {}),
    };

    if (subsection) {
      const existingValue = initialVisitDetails[sectionKey];
      const sectionContent =
        typeof existingValue === "object" && existingValue !== null
          ? { ...existingValue }
          : {};

      sectionContent[subsection] = value;
      initialVisitDetails[sectionKey] = sectionContent;
    } else {
      initialVisitDetails[sectionKey] = value;
    }

    const newNote: SOAPNote = {
      ...note,
      initialVisitDetails,
    };

    onNoteChange(newNote);
  };

  const renderSectionContent = (sectionKey: keyof InitialVisitDetails) => {
    if (!note.initialVisitDetails) return null;

    const section = sections[sectionKey];
    const content = note.initialVisitDetails[sectionKey];

    if (section.subsections && typeof content === "object" && content !== null) {
      const sectionContent = content as Record<string, string>;

      return (
        <div className="space-y-4">
          {section.subsections.map((subsection) => (
            <div key={subsection} className="border-l-4 border-blue-200 pl-4">
              <h4 className="mb-2 font-semibold capitalize text-light-text-primary dark:text-dark-text-primary">
                {subsection.replace(/([A-Z])/g, " $1").trim()}
              </h4>
              <textarea
                className="w-full rounded-lg border border-light-border/20 bg-light-secondary/20 p-2 text-light-text-primary transition-all duration-200 placeholder-light-text-secondary/70 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary disabled:opacity-50 dark:border-dark-border/20 dark:bg-dark-secondary/20 dark:text-dark-text-primary dark:placeholder-dark-text-secondary/70"
                disabled={!editMode}
                placeholder={`Enter ${subsection} details...`}
                value={sectionContent[subsection] || ""}
                onChange={(e) =>
                  handleSectionChange(sectionKey, e.target.value, subsection)
                }
              />
            </div>
          ))}
        </div>
      );
    }

    return (
      <textarea
        className="h-40 w-full resize-none rounded-lg border border-light-border/20 bg-light-secondary/20 p-4 text-light-text-primary transition-all duration-200 placeholder-light-text-secondary/70 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary disabled:opacity-50 dark:border-dark-border/20 dark:bg-dark-secondary/20 dark:text-dark-text-primary dark:placeholder-dark-text-secondary/70"
        disabled={!editMode}
        placeholder={`Enter ${section.title.toLowerCase()} details...`}
        value={typeof content === "string" ? content : ""}
        onChange={(e) => handleSectionChange(sectionKey, e.target.value)}
      />
    );
  };

  return (
    <div className="relative w-full">
      <div className="bg-gradient-light border-b border-light-border/20 p-4 dark:border-accent-primary/20 dark:bg-gradient-dark">
        <div className="flex items-center justify-between text-light-text-primary dark:text-dark-text-primary">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold">
              Initial Visit Documentation
            </h2>
            {isRecording && (
              <div className="flex items-center text-accent-error">
                <span className="mr-2 animate-pulse">●</span>
                Recording
              </div>
            )}
          </div>
          <div className="flex space-x-2">
            <Button
              className="w-40"
              variant={isRecording ? "destructive" : "default"}
              onClick={isRecording ? onStopRecording : onStartRecording}
            >
              {isRecording ? (
                <MicOff className="mr-2 h-4 w-4" />
              ) : (
                <Mic className="mr-2 h-4 w-4" />
              )}
              {isRecording ? "Stop Recording" : "Start Recording"}
            </Button>
            <Button
              className="w-32"
              variant="outline"
              onClick={() => setEditMode(!editMode)}
            >
              <Edit className="mr-2 h-4 w-4" />
              {editMode ? "Preview" : "Edit"}
            </Button>
            <Button
              className="w-40"
              disabled={isRecording}
              variant="default"
              onClick={onSave}
            >
              <Save className="mr-2 h-4 w-4" />
              Sign & Save
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="min-h-[800px] flex gap-4">
          <div
            className="panel-base w-[30%] space-y-2 overflow-y-auto scrollbar-thin"
            style={{ maxHeight: "calc(100vh - 300px)" }}
          >
            {(Object.entries(sections) as [keyof InitialVisitDetails, Section][]).map(
              ([key, section]) => (
                <Button
                  key={key}
                  className={`w-full justify-start text-left transition-all duration-200 ${
                    activeSection === key
                      ? "bg-accent-primary/10 text-light-text-primary dark:text-dark-text-primary"
                      : "hover:bg-light-secondary/20 dark:hover:bg-dark-secondary/20 text-light-text-secondary dark:text-dark-text-secondary"
                  }`}
                  variant="ghost"
                  onClick={() => setActiveSection(key)}
                >
                  <span className="mr-2">{section.icon}</span>
                  {section.title}
                </Button>
              )
            )}
          </div>

          <div className="panel-base w-[70%] space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-light-text-primary dark:text-dark-text-primary">
                {sections[activeSection].prompt}
              </AlertDescription>
            </Alert>

            <div
              className="panel-base flex-1 overflow-y-auto bg-light-secondary/10 dark:bg-dark-secondary/10 scrollbar-thin"
              style={{ minHeight: "calc(100vh - 400px)" }}
            >
              {renderSectionContent(activeSection)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
