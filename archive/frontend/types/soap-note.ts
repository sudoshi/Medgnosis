export interface SOAPNote {
  visitType: "initial" | "followup" | "procedure" | "telehealth";
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  metadata: {
    patientId?: string;
    providerId?: string;
    encounterDate: string;
    lastUpdated: string;
  };
  initialVisitDetails?: InitialVisitDetails;
  followUpDetails?: FollowUpDetails;
}

export type InitialVisitDetailValue = string | Record<string, string>;

export interface InitialVisitDetails {
  demographics?: InitialVisitDetailValue;
  insuranceInfo?: InitialVisitDetailValue;
  chiefComplaint?: InitialVisitDetailValue;
  hpi?: InitialVisitDetailValue;
  allergies?: InitialVisitDetailValue;
  medications?: InitialVisitDetailValue;
  pmh?: InitialVisitDetailValue;
  familyHistory?: InitialVisitDetailValue;
  socialHistory?: InitialVisitDetailValue;
  preventiveCare?: InitialVisitDetailValue;
  ros?: InitialVisitDetailValue;
  vitalSigns?: InitialVisitDetailValue;
  physicalExam?: InitialVisitDetailValue;
  assessment?: InitialVisitDetailValue;
  problemList?: InitialVisitDetailValue;
  plan?: InitialVisitDetailValue;
  patientEducation?: InitialVisitDetailValue;
  followUpPlan?: InitialVisitDetailValue;
  ebmGuidelines?: InitialVisitDetailValue;
}

export interface FollowUpDetails {
  visitInfo?: Record<string, string>;
  intervalHistory?: Record<string, string>;
  treatmentResponse?: Record<string, string>;
  medicationReview?: Record<string, string>;
  vitalSigns?: Record<string, string>;
  targetedROS?: Record<string, string>;
  focusedExam?: Record<string, string>;
  testResults?: Record<string, string>;
  assessment?: Record<string, string>;
  plan?: Record<string, string>;
  goalProgress?: Record<string, string>;
  patientEducation?: Record<string, string>;
  followUpPlan?: Record<string, string>;
  ebmGuidelines?: string;
}

export interface SOAPNoteSection {
  title: string;
  content: string;
  placeholder: string;
}

export interface FHIRDocumentReference {
  resourceType: "DocumentReference";
  status: "current" | "superseded" | "entered-in-error";
  type: {
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  };
  subject: {
    reference: string;
  };
  date: string;
  content: Array<{
    attachment: {
      contentType: string;
      data: string;
    };
  }>;
}
