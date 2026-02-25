"use client"
import type { SOAPNote, FHIRDocumentReference } from "@/types/soap-note";

class SuperNoteService {
  private processTranscription(
    text: string,
  ): Pick<SOAPNote, "subjective" | "objective" | "assessment" | "plan"> {
    const sections = {
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
    };

    const lines = text.split("\n");
    let currentSection: keyof typeof sections | null = null;

    for (const line of lines) {
      // Detect section headers in the transcription
      if (
        line.toLowerCase().includes("subjective") ||
        line.toLowerCase().includes("history")
      ) {
        currentSection = "subjective";
        continue;
      } else if (
        line.toLowerCase().includes("objective") ||
        line.toLowerCase().includes("examination")
      ) {
        currentSection = "objective";
        continue;
      } else if (
        line.toLowerCase().includes("assessment") ||
        line.toLowerCase().includes("diagnosis")
      ) {
        currentSection = "assessment";
        continue;
      } else if (
        line.toLowerCase().includes("plan") ||
        line.toLowerCase().includes("treatment")
      ) {
        currentSection = "plan";
        continue;
      }

      // Add content to the current section
      if (currentSection) {
        sections[currentSection] += line + "\n";
      }
    }

    // Clean up any trailing newlines
    Object.keys(sections).forEach((key) => {
      const sectionKey = key as keyof typeof sections;

      sections[sectionKey] = sections[sectionKey].trim();
    });

    return sections;
  }

  public updateNoteFromTranscription(
    transcription: string,
    currentNote: SOAPNote,
  ): SOAPNote {
    const processedSections = this.processTranscription(transcription);

    return {
      ...currentNote,
      ...processedSections,
      metadata: {
        ...currentNote.metadata,
        lastUpdated: new Date().toISOString(),
      },
    };
  }

  public createNewNote(
    visitType: SOAPNote["visitType"] = "followup",
  ): SOAPNote {
    const note: SOAPNote = {
      visitType,
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
      metadata: {
        encounterDate: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      },
    };

    if (visitType === "initial") {
      note.initialVisitDetails = {
        demographics: "",
        insuranceInfo: "",
        chiefComplaint: "",
        hpi: "",
        allergies: "",
        medications: {
          current: "",
          past: "",
          adherence: "",
        },
        pmh: {
          medical: "",
          surgical: "",
          hospitalizations: "",
          trauma: "",
        },
        familyHistory: {
          immediate: "",
          extended: "",
          genetic: "",
        },
        socialHistory: {
          occupation: "",
          lifestyle: "",
          habits: "",
          diet: "",
          exercise: "",
          substances: "",
        },
        preventiveCare: {
          immunizations: "",
          screenings: "",
          lastPhysical: "",
        },
        ros: {
          constitutional: "",
          heent: "",
          cardiovascular: "",
          respiratory: "",
          gi: "",
          gu: "",
          musculoskeletal: "",
          skin: "",
          neurological: "",
          psychiatric: "",
          endocrine: "",
          hematologic: "",
          allergic: "",
        },
        vitalSigns: {
          bp: "",
          hr: "",
          rr: "",
          temp: "",
          height: "",
          weight: "",
          bmi: "",
          painScore: "",
        },
        physicalExam: {
          general: "",
          heent: "",
          neck: "",
          chest: "",
          cardiac: "",
          abdomen: "",
          extremities: "",
          skin: "",
          neuro: "",
          psychiatric: "",
        },
        problemList: "",
        plan: {
          diagnostics: "",
          treatments: "",
          medications: "",
          referrals: "",
          procedures: "",
        },
        patientEducation: "",
        followUpPlan: "",
        ebmGuidelines: "",
      };
    } else if (visitType === "followup") {
      note.followUpDetails = {
        visitInfo: {
          lastVisit: "",
          followUpReason: "",
          appointmentType: "",
        },
        intervalHistory: {
          symptomsProgress: "",
          newSymptoms: "",
          overallStatus: "",
        },
        treatmentResponse: {
          medicationResponse: "",
          sideEffects: "",
          adherence: "",
          complications: "",
        },
        medicationReview: {
          currentMeds: "",
          changes: "",
          refillsNeeded: "",
        },
        vitalSigns: {
          bp: "",
          hr: "",
          rr: "",
          temp: "",
          weight: "",
          bmi: "",
          painScore: "",
        },
        targetedROS: {
          pertinentPositive: "",
          pertinentNegative: "",
          relatedSystems: "",
        },
        focusedExam: {
          relevantSystems: "",
          significantFindings: "",
          changesFromLast: "",
        },
        testResults: {
          newResults: "",
          pendingTests: "",
          orderedTests: "",
        },
        assessment: {
          problemStatus: "",
          newProblems: "",
          riskFactors: "",
        },
        plan: {
          medicationChanges: "",
          newOrders: "",
          referrals: "",
          procedures: "",
        },
        goalProgress: {
          clinicalGoals: "",
          patientGoals: "",
          barriers: "",
        },
        patientEducation: {
          topics: "",
          understanding: "",
          concerns: "",
        },
        followUpPlan: {
          timing: "",
          conditions: "",
          warningSign: "",
        },
        ebmGuidelines: "",
      };
    }

    return note;
  }

  public convertToFHIR(note: SOAPNote): FHIRDocumentReference {
    const noteContent = `SOAP Note
Date: ${new Date(note.metadata.encounterDate).toLocaleDateString()}

SUBJECTIVE:
${note.subjective}

OBJECTIVE:
${note.objective}

ASSESSMENT:
${note.assessment}

PLAN:
${note.plan}`;

    return {
      resourceType: "DocumentReference",
      status: "current",
      type: {
        coding: [
          {
            system: "http://loinc.org",
            code: "11506-3",
            display: "Progress note",
          },
        ],
      },
      subject: {
        reference: `Patient/${note.metadata.patientId || "unknown"}`,
      },
      date: note.metadata.lastUpdated,
      content: [
        {
          attachment: {
            contentType: "text/plain",
            data: Buffer.from(noteContent).toString("base64"),
          },
        },
      ],
    };
  }

  public async exportToFHIR(note: SOAPNote): Promise<void> {
    const fhirDocument = this.convertToFHIR(note);

    // TODO: Implement actual FHIR server integration
    console.log("Exporting to FHIR:", fhirDocument);

    // For now, we'll just simulate the export
    return new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }
}

export const superNoteService = new SuperNoteService();
