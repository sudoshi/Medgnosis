"use client";

import { Mic, MicOff, Save, Edit, AlertCircle } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { SOAPNote, FollowUpDetails } from "@/types/soap-note";

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
    subsections: ["medicationResponse", "sideEffects", "adherence", "complications"],
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

// Type guard to check if content is an object
function isObjectContent(content: unknown): content is Record<string, string> {
  return typeof content === "object" && content !== null;
}

export function SuperNoteFollowUp({
  note,
  isRecording,
  onStartRecording,
  onStopRecording,
  onSave,
  onNoteChange,
}: SuperNoteFollowUpProps) {
  const [activeSection, setActiveSection] = useState<keyof FollowUpDetails>("visitInfo");
  const [editMode, setEditMode] = useState(false);

  const handleSectionChange = (
    sectionKey: keyof FollowUpDetails,
    value: string,
    subsection?: string
  ) => {
    const newFollowUpDetails: FollowUpDetails = {
      ...(note.followUpDetails ?? {}),
    };

    if (sectionKey === 'ebmGuidelines') {
      newFollowUpDetails[sectionKey] = value as any; // Assert type as string
    }
    else if (subsection) {
      // Section expects an object
      const currentContent = newFollowUpDetails[sectionKey];
      let sectionContent: Record<string, string> = {};

      if (isObjectContent(currentContent)) {
        sectionContent = { ...currentContent };
      }

      sectionContent[subsection] = value;

      newFollowUpDetails[sectionKey] = sectionContent;
    } else {
      // Section expects a Record<string, string>
      newFollowUpDetails[sectionKey] = { content: value };
    }

    const newNote: SOAPNote = {
      ...note,
      followUpDetails: newFollowUpDetails,
    };

    onNoteChange(newNote);
  };

  const renderSectionContent = (sectionKey: keyof FollowUpDetails) => {
    const section = sections[sectionKey];
    const content = note.followUpDetails?.[sectionKey];

    return (
      <textarea
        className="h-40 w-full resize-none rounded-lg border border-light-border/20 bg-light-secondary/20 p-4 text-light-text-primary outline-none transition duration-200 placeholder-light-text-secondary/70 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary dark:border-dark-border/20 dark:bg-dark-secondary/20 dark:text-dark-text-primary dark:placeholder-dark-text-secondary/70"
        disabled={!editMode}
        placeholder={`Enter ${section.title.toLowerCase()} details...`}
        value={content as string || ""}
        onChange={(e) => handleSectionChange(sectionKey, e.target.value)}
      />
    );
  };

  return (
    <div className="relative w-full">
      <div className="border-b border-light-border/20 bg-gradient-light p-4 dark:border-accent-primary/20 dark:bg-gradient-dark">
        <div className="flex items-center justify-between text-light-text-primary dark:text-dark-text-primary">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold">Follow-Up Visit Documentation</h2>
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
              {isRecording ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
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
                className={`w-full justify-start text-left transition duration-200 ${
                  activeSection === key
                    ? "bg-accent-primary/10 text-light-text-primary dark:text-dark-text-primary"
                    : "text-light-text-secondary hover:bg-light-secondary/20 dark:text-dark-text-secondary dark:hover:bg-dark-secondary/20"
                }`}
                variant="ghost"
                onClick={() => setActiveSection(key as keyof FollowUpDetails)}
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
                {sections[activeSection].prompt}
              </AlertDescription>
            </Alert>

            <div
              className="panel-base flex-1 overflow-y-auto bg-light-secondary/10 scrollbar-thin dark:bg-dark-secondary/10"
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
