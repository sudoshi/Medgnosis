import type { SOAPNote } from "@/types/soap-note";

import { useState } from "react";
import { Mic, MicOff, Save, Edit, AlertCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

const sections: Record<string, Section> = {
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
  const [activeSection, setActiveSection] = useState("demographics");
  const [editMode, setEditMode] = useState(false);

  const handleSectionChange = (
    sectionKey: keyof typeof sections,
    value: string,
    subsection?: string,
  ) => {
    if (!note.initialVisitDetails) return;

    const newNote = { ...note };

    if (!newNote.initialVisitDetails) return;

    if (subsection) {
      const section =
        newNote.initialVisitDetails[
          sectionKey as keyof typeof note.initialVisitDetails
        ];

      if (typeof section === "object" && section !== null) {
        (section as any)[subsection] = value;
      }
    } else {
      (newNote.initialVisitDetails as any)[sectionKey] = value;
    }

    onNoteChange(newNote);
  };

  const renderSectionContent = (sectionKey: keyof typeof sections) => {
    if (!note.initialVisitDetails) return null;

    const section = sections[sectionKey];
    const content =
      note.initialVisitDetails?.[
        sectionKey as keyof typeof note.initialVisitDetails
      ];

    if (section.subsections) {
      return (
        <div className="space-y-4">
          {section.subsections.map((subsection) => (
            <div key={subsection} className="border-l-4 border-blue-200 pl-4">
              <h4 className="font-semibold mb-2 capitalize">
                {subsection.replace(/([A-Z])/g, " $1").trim()}
              </h4>
              <textarea
                className="w-full p-2 rounded-lg bg-dark-secondary/10 border border-dark-border focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all duration-200 resize-none"
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
        className="w-full h-40 p-4 rounded-lg bg-dark-secondary/10 border border-dark-border focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all duration-200 resize-none"
        disabled={!editMode}
        placeholder={`Enter ${section.title.toLowerCase()} details...`}
        value={typeof content === "string" ? content : ""}
        onChange={(e) => handleSectionChange(sectionKey, e.target.value)}
      />
    );
  };

  return (
    <Card className="w-full">
      <CardHeader className="bg-gray-50 border-b dark:bg-dark-secondary/10">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <CardTitle>Initial Visit Documentation</CardTitle>
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
      </CardHeader>

      <CardContent className="p-6">
        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-1 space-y-2 overflow-y-auto max-h-[800px]">
            {Object.entries(sections).map(([key, section]) => (
              <Button
                key={key}
                className={`w-full justify-start text-left ${
                  activeSection === key ? "bg-accent-primary/10" : ""
                }`}
                variant={activeSection === key ? "default" : "ghost"}
                onClick={() => setActiveSection(key)}
              >
                <span className="mr-2">{section.icon}</span>
                {section.title}
              </Button>
            ))}
          </div>

          <div className="col-span-4 space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {sections[activeSection as keyof typeof sections].prompt}
              </AlertDescription>
            </Alert>

            <div className="border rounded-lg p-4 bg-white dark:bg-dark-primary min-h-[600px]">
              {renderSectionContent(activeSection)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
