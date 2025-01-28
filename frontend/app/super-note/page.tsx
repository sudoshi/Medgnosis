"use client";

import type { Patient } from "@/types/patient";
import type { SOAPNote } from "@/types/soap-note";

import { useState } from "react";
import {
  DocumentArrowUpIcon,
  PauseIcon,
  MicrophoneIcon,
} from "@heroicons/react/24/outline";

import AdminLayout from "@/components/layout/AdminLayout";
import { useVoiceInteraction } from "@/hooks/useVoiceInteraction";
import { superNoteService } from "@/services/superNoteService";
import { PatientSelector } from "@/components/super-note/PatientSelector";
import { VoiceIndicator } from "@/components/super-note/VoiceIndicator";
import { NotificationToast } from "@/components/super-note/NotificationToast";
import { SuperNoteInitialVisit } from "@/components/super-note/SuperNoteInitialVisit";
import { Button } from "@/components/ui/button";

const visitTypes = [
  {
    id: "initial",
    label: "Initial Visit",
    description: "Comprehensive first visit documentation",
  },
  {
    id: "followup",
    label: "Follow-up Visit",
    description: "Focused follow-up visit documentation",
  },
  {
    id: "procedure",
    label: "Procedure Visit",
    description: "Procedure-specific documentation",
  },
  {
    id: "telehealth",
    label: "Telehealth Visit",
    description: "Remote consultation documentation",
  },
] as const;

export default function SuperNotePage() {
  const [note, setNote] = useState<SOAPNote>(superNoteService.createNewNote());
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const { isListening, startListening, stopListening, transcript } =
    useVoiceInteraction(false);

  const handleExport = async () => {
    if (!selectedPatient) {
      setNotification({
        type: "error",
        message: "Please select a patient before exporting",
      });

      return;
    }

    try {
      setIsExporting(true);
      const noteWithPatient = {
        ...note,
        metadata: {
          ...note.metadata,
          patientId: selectedPatient.id,
        },
      };

      await superNoteService.exportToFHIR(noteWithPatient);
      setNotification({
        type: "success",
        message: "Note successfully exported to EHR",
      });
    } catch (error) {
      console.error("Failed to export note:", error);
      setNotification({
        type: "error",
        message: "Failed to export note. Please try again.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handlePatientSelect = (patient: Patient) => {
    setSelectedPatient(patient);
    setNote((prev) => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        patientId: patient.id,
      },
    }));
  };

  const handleVisitTypeSelect = (type: SOAPNote["visitType"]) => {
    setNote(superNoteService.createNewNote(type));
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold">
            SuperNote - AI Medical Scribe
          </h2>
        </div>

        {/* Patient Selection */}
        <div className="panel-analytics">
          <h3 className="text-lg font-semibold mb-4">Patient Selection</h3>
          <PatientSelector onSelect={handlePatientSelect} />
          {selectedPatient && (
            <div className="mt-4 p-4 bg-dark-secondary/10 rounded-lg">
              <div className="font-medium">
                Selected Patient: {selectedPatient.name.first}{" "}
                {selectedPatient.name.last}
              </div>
              <div className="text-sm text-dark-text-secondary">
                MRN: {selectedPatient.mrn} • DOB:{" "}
                {new Date(selectedPatient.dateOfBirth).toLocaleDateString()}
              </div>
            </div>
          )}
        </div>

        {selectedPatient && (
          <>
            {/* Visit Type Selection */}
            {!note.visitType && (
              <div className="panel-analytics">
                <h3 className="text-lg font-semibold mb-4">Visit Type</h3>
                <div className="grid grid-cols-2 gap-4">
                  {visitTypes.map((type) => (
                    <Button
                      key={type.id}
                      className="h-auto p-4 flex flex-col items-start space-y-2"
                      variant="outline"
                      onClick={() => handleVisitTypeSelect(type.id)}
                    >
                      <span className="font-medium">{type.label}</span>
                      <span className="text-sm text-dark-text-secondary">
                        {type.description}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Visit Documentation */}
            {note.visitType === "initial" ? (
              <SuperNoteInitialVisit
                isRecording={isListening}
                note={note}
                onNoteChange={setNote}
                onSave={handleExport}
                onStartRecording={startListening}
                onStopRecording={stopListening}
              />
            ) : (
              note.visitType && (
                <div className="space-y-6">
                  {/* Voice Indicator */}
                  {isListening && (
                    <div className="panel-analytics">
                      <VoiceIndicator
                        confidence={0.95}
                        isListening={isListening}
                      />
                    </div>
                  )}

                  {/* Basic SOAP Note */}
                  <div className="space-y-6">
                    {["subjective", "objective", "assessment", "plan"].map(
                      (section) => (
                        <div key={section} className="panel-analytics">
                          <h3 className="text-lg font-semibold mb-4 capitalize">
                            {section}
                          </h3>
                          <textarea
                            className="w-full h-40 p-4 rounded-lg bg-dark-secondary/10 border border-dark-border focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all duration-200 resize-none"
                            placeholder={`Enter ${section} details...`}
                            value={note[section as keyof SOAPNote] as string}
                            onChange={(e) =>
                              setNote((prev) => ({
                                ...prev,
                                [section]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      ),
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-end space-x-4">
                    <Button
                      variant={isListening ? "destructive" : "default"}
                      onClick={isListening ? stopListening : startListening}
                    >
                      {isListening ? (
                        <PauseIcon className="mr-2 h-4 w-4" />
                      ) : (
                        <MicrophoneIcon className="mr-2 h-4 w-4" />
                      )}
                      {isListening ? "Stop Recording" : "Start Recording"}
                    </Button>
                    <Button
                      disabled={isExporting}
                      variant="default"
                      onClick={handleExport}
                    >
                      <DocumentArrowUpIcon className="mr-2 h-4 w-4" />
                      {isExporting ? "Exporting..." : "Export to EHR"}
                    </Button>
                  </div>
                </div>
              )
            )}
          </>
        )}

        {/* Notifications */}
        {notification && (
          <NotificationToast
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification(null)}
          />
        )}

        {/* Recording Status */}
        {isListening && !notification && (
          <div className="fixed bottom-6 right-6 bg-accent-primary text-white px-4 py-2 rounded-lg shadow-lg animate-pulse">
            Recording in progress...
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
