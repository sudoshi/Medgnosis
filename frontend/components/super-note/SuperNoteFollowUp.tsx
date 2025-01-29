"use client";

import type { SOAPNote, FollowUpDetails } from "@/types/soap-note";

import { useState } from "react";
import { Mic, MicOff, Save, Edit, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SuperNoteFollowUpProps {
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

const sections: Record<keyof FollowUpDetails, Section> = {
  visitInfo: {
    title: "Visit Information",
    prompt: "Date of last visit, reason for follow-up, appointment type",
    subsections: ["lastVisit", "followUpReason", "appointmentType"],
    icon: "📅",
  },
  intervalHistory: {
    title: "Interval History",
    prompt: "Changes since last visit, symptom progression, new concerns",
    subsections: ["symptomsProgress", "newSymptoms", "overallStatus"],
    icon: "⏱️",
  },
  treatmentResponse: {
    title: "Treatment Response",
    prompt: "Response to current treatment plan, side effects, adherence",
    subsections: [
      "medicationResponse",
      "sideEffects",
      "adherence",
      "complications",
    ],
    icon: "📈",
  },
  medicationReview: {
    title: "Medication Review",
    prompt: "Current medications, changes, refill needs",
    subsections: ["currentMeds", "changes", "refillsNeeded"],
    icon: "💊",
  },
  vitalSigns: {
    title: "Vital Signs",
    prompt: "Current vital signs and comparison to last visit",
    subsections: ["bp", "hr", "rr", "temp", "weight", "bmi", "painScore"],
    icon: "📊",
  },
  targetedROS: {
    title: "Targeted Review of Systems",
    prompt: "Focused review of relevant systems",
    subsections: ["pertinentPositive", "pertinentNegative", "relatedSystems"],
    icon: "🔍",
  },
  focusedExam: {
    title: "Focused Physical Exam",
    prompt: "Examination of relevant systems and significant changes",
    subsections: ["relevantSystems", "significantFindings", "changesFromLast"],
    icon: "👨‍⚕️",
  },
  testResults: {
    title: "Test Results",
    prompt: "New results, pending tests, ordered tests",
    subsections: ["newResults", "pendingTests", "orderedTests"],
    icon: "🔬",
  },
  assessment: {
    title: "Assessment",
    prompt: "Problem status updates, new problems, risk factors",
    subsections: ["problemStatus", "newProblems", "riskFactors"],
    icon: "📋",
  },
  plan: {
    title: "Plan Updates",
    prompt: "Medication changes, new orders, referrals, procedures",
    subsections: ["medicationChanges", "newOrders", "referrals", "procedures"],
    icon: "📝",
  },
  goalProgress: {
    title: "Goal Progress",
    prompt: "Progress toward clinical and patient-specific goals",
    subsections: ["clinicalGoals", "patientGoals", "barriers"],
    icon: "🎯",
  },
  patientEducation: {
    title: "Patient Education",
    prompt: "Topics discussed, understanding, concerns addressed",
    subsections: ["topics", "understanding", "concerns"],
    icon: "📖",
  },
  followUpPlan: {
    title: "Follow-up Plan",
    prompt: "Next visit timing, conditions for earlier return",
    subsections: ["timing", "conditions", "warningSign"],
    icon: "📅",
  },
  ebmGuidelines: {
    title: "EBM Guidelines",
    prompt: "Evidence-based measures addressed during visit",
    icon: "📊",
  },
};

export function SuperNoteFollowUp({
  note,
  isRecording,
  onStartRecording,
  onStopRecording,
  onSave,
  onNoteChange,
}: SuperNoteFollowUpProps) {
  const [activeSection, setActiveSection] =
    useState<keyof FollowUpDetails>("visitInfo");
  const [editMode, setEditMode] = useState(false);

  const handleSectionChange = (
    sectionKey: keyof FollowUpDetails,
    value: string,
    subsection?: string,
  ) => {
    if (!note.followUpDetails) return;

    const newNote = { ...note };

    if (!newNote.followUpDetails) return;

    if (subsection) {
      const section =
        newNote.followUpDetails[
          sectionKey as keyof typeof note.followUpDetails
        ];

      if (typeof section === "object" && section !== null) {
        (section as any)[subsection] = value;
      }
    } else {
      (newNote.followUpDetails as any)[sectionKey] = value;
    }

    onNoteChange(newNote);
  };

  const renderSectionContent = (sectionKey: keyof FollowUpDetails) => {
    if (!note.followUpDetails) return null;

    const section = sections[sectionKey as keyof typeof sections];
    const content =
      note.followUpDetails?.[sectionKey as keyof typeof note.followUpDetails];

    if (section.subsections) {
      return (
        <div className="space-y-4">
          {section.subsections.map((subsection) => (
            <div key={subsection} className="border-l-4 border-blue-200 pl-4">
              <h4 className="font-semibold mb-2 capitalize text-light-text-primary dark:text-dark-text-primary">
                {subsection.replace(/([A-Z])/g, " $1").trim()}
              </h4>
              <textarea
                className="w-full p-2 rounded-lg bg-light-secondary/20 dark:bg-dark-secondary/20 border border-light-border/20 dark:border-dark-border/20 text-light-text-primary dark:text-dark-text-primary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all duration-200 resize-none placeholder-light-text-secondary/70 dark:placeholder-dark-text-secondary/70"
                disabled={!editMode}
                placeholder={`Enter ${subsection} details...`}
                value={
                  typeof content === "object" && content !== null
                    ? (content as Record<string, string>)[subsection] || ""
                    : ""
                }
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
        className="w-full h-40 p-4 rounded-lg bg-light-secondary/20 dark:bg-dark-secondary/20 border border-light-border/20 dark:border-dark-border/20 text-light-text-primary dark:text-dark-text-primary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all duration-200 resize-none placeholder-light-text-secondary/70 dark:placeholder-dark-text-secondary/70"
        disabled={!editMode}
        placeholder={`Enter ${section.title.toLowerCase()} details...`}
        value={typeof content === "string" ? content : ""}
        onChange={(e) => handleSectionChange(sectionKey, e.target.value)}
      />
    );
  };

  return (
    <div className="panel-analytics relative w-full">
      <div className="bg-gradient-light dark:bg-gradient-dark border-b border-light-border/20 dark:border-accent-primary/20 p-4">
        <div className="flex justify-between items-center text-light-text-primary dark:text-dark-text-primary">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold">
              Follow-Up Visit Documentation
            </h2>
            {isRecording && (
              <div className="flex items-center text-accent-error">
                <span className="animate-pulse mr-2">●</span>
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
        <div className="flex gap-4">
          <div
            className="panel-base w-[30%] space-y-2 overflow-y-auto scrollbar-thin"
            style={{ maxHeight: "calc(100vh - 300px)" }}
          >
            {Object.entries(sections).map(([key, section]) => (
              <Button
                key={key}
                className={`w-full justify-start text-left transition-all duration-200 ${
                  activeSection === key
                    ? "bg-accent-primary/10 text-light-text-primary dark:text-dark-text-primary"
                    : "hover:bg-light-secondary/20 dark:hover:bg-dark-secondary/20 text-light-text-secondary dark:text-dark-text-secondary"
                }`}
                variant="ghost"
                onClick={() => setActiveSection(key as keyof typeof sections)}
              >
                <span className="mr-2">{section.icon}</span>
                {section.title}
              </Button>
            ))}
          </div>

          <div className="panel-base w-[70%] space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-light-text-primary dark:text-dark-text-primary">
                {sections[activeSection as keyof typeof sections].prompt}
              </AlertDescription>
            </Alert>

            <div
              className="panel-base flex-1 overflow-y-auto scrollbar-thin bg-light-secondary/10 dark:bg-dark-secondary/10"
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
