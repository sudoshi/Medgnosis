"use client";

import type { Patient } from "@/types/patient";
import type { SOAPNote } from "@/types/soap-note";

import { useState } from "react";

import AdminLayout from "@/components/layout/AdminLayout";
import { useVoiceInteraction } from "@/hooks/useVoiceInteraction";
import { superNoteService } from "@/services/superNoteService";
import { PatientSelector } from "@/components/super-note/PatientSelector";
import { NotificationToast } from "@/components/super-note/NotificationToast";
import { SuperNoteInitialVisit } from "@/components/super-note/SuperNoteInitialVisit";
import { SuperNoteFollowUp } from "@/components/super-note/SuperNoteFollowUp";

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
  const [note, setNote] = useState<SOAPNote | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const { isListening, startListening, stopListening, transcript } =
    useVoiceInteraction(false);

  const handleExport = async () => {
    if (!selectedPatient || !note) {
      setNotification({
        type: "error",
        message: "Please select a patient before exporting",
      });

      return;
    }

    try {
      setIsExporting(true);
      const noteWithPatient: SOAPNote = {
        ...note,
        metadata: {
          ...note.metadata,
          patientId: selectedPatient.id,
        },
        visitType: note.visitType,
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
  };

  const handleVisitTypeSelect = (type: SOAPNote["visitType"]) => {
    if (selectedPatient) {
      const newNote = superNoteService.createNewNote(type);

      newNote.metadata.patientId = selectedPatient.id;
      setNote(newNote);
    }
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

        {/* Patient Selection First */}
        {!selectedPatient && (
          <div className="panel-base relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
                Patient Selection
              </h3>
            </div>
            <PatientSelector onSelect={handlePatientSelect} />
          </div>
        )}

        {/* Patient Info */}
        {selectedPatient && (
          <div className="panel-base bg-light-secondary/20 dark:bg-dark-secondary/20 mt-4">
            <div className="font-medium text-light-text-primary dark:text-dark-text-primary">
              Selected Patient: {selectedPatient.name.first}{" "}
              {selectedPatient.name.last}
            </div>
            <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
              MRN: {selectedPatient.mrn} • DOB:{" "}
              {new Date(selectedPatient.dateOfBirth).toLocaleDateString()}
            </div>
          </div>
        )}

        {/* Template Selection - Only shown after patient selection */}
        {selectedPatient && !note && (
          <div className="panel-base relative mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
                Visit Template
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {visitTypes.map((type) => (
                <div
                  key={type.id}
                  className="panel-base bg-light-secondary/20 dark:bg-dark-secondary/20 hover:bg-light-secondary/30 dark:hover:bg-dark-secondary/30 transition-all duration-200 cursor-pointer"
                  onClick={() => handleVisitTypeSelect(type.id)}
                >
                  <div className="flex flex-col space-y-2">
                    <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
                      {type.label}
                    </span>
                    <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                      {type.description}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Visit Documentation - Only shown after both patient and template are selected */}
        {selectedPatient && note && note.visitType && (
          <>
            {note?.visitType === "initial" ? (
              <SuperNoteInitialVisit
                isRecording={isListening}
                note={note}
                onNoteChange={setNote}
                onSave={handleExport}
                onStartRecording={startListening}
                onStopRecording={stopListening}
              />
            ) : note?.visitType === "followup" ? (
              <SuperNoteFollowUp
                isRecording={isListening}
                note={note}
                onNoteChange={setNote}
                onSave={handleExport}
                onStartRecording={startListening}
                onStopRecording={stopListening}
              />
            ) : (
              <div className="panel-base">
                <h3 className="text-lg font-semibold mb-4 text-light-text-primary dark:text-dark-text-primary">
                  {note?.visitType.charAt(0).toUpperCase() +
                    note?.visitType.slice(1)}{" "}
                  Visit
                </h3>
                <p className="text-light-text-secondary dark:text-dark-text-secondary">
                  Documentation template not yet implemented for this visit
                  type.
                </p>
              </div>
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
