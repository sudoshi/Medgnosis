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

export interface FollowUpDetails {
  visitInfo: {
    lastVisit: string;
    followUpReason: string;
    appointmentType: string;
  };
  intervalHistory: {
    symptomsProgress: string;
    newSymptoms: string;
    overallStatus: string;
  };
  treatmentResponse: {
    medicationResponse: string;
    sideEffects: string;
    adherence: string;
    complications: string;
  };
  medicationReview: {
    currentMeds: string;
    changes: string;
    refillsNeeded: string;
  };
  vitalSigns: {
    bp: string;
    hr: string;
    rr: string;
    temp: string;
    weight: string;
    bmi: string;
    painScore: string;
  };
  targetedROS: {
    pertinentPositive: string;
    pertinentNegative: string;
    relatedSystems: string;
  };
  focusedExam: {
    relevantSystems: string;
    significantFindings: string;
    changesFromLast: string;
  };
  testResults: {
    newResults: string;
    pendingTests: string;
    orderedTests: string;
  };
  assessment: {
    problemStatus: string;
    newProblems: string;
    riskFactors: string;
  };
  plan: {
    medicationChanges: string;
    newOrders: string;
    referrals: string;
    procedures: string;
  };
  goalProgress: {
    clinicalGoals: string;
    patientGoals: string;
    barriers: string;
  };
  patientEducation: {
    topics: string;
    understanding: string;
    concerns: string;
  };
  followUpPlan: {
    timing: string;
    conditions: string;
    warningSign: string;
  };
  ebmGuidelines: string;
}

export interface InitialVisitDetails {
  demographics: string;
  insuranceInfo: string;
  chiefComplaint: string;
  hpi: string;
  allergies: string;
  medications: {
    current: string;
    past: string;
    adherence: string;
  };
  pmh: {
    medical: string;
    surgical: string;
    hospitalizations: string;
    trauma: string;
  };
  familyHistory: {
    immediate: string;
    extended: string;
    genetic: string;
  };
  socialHistory: {
    occupation: string;
    lifestyle: string;
    habits: string;
    diet: string;
    exercise: string;
    substances: string;
  };
  preventiveCare: {
    immunizations: string;
    screenings: string;
    lastPhysical: string;
  };
  ros: {
    constitutional: string;
    heent: string;
    cardiovascular: string;
    respiratory: string;
    gi: string;
    gu: string;
    musculoskeletal: string;
    skin: string;
    neurological: string;
    psychiatric: string;
    endocrine: string;
    hematologic: string;
    allergic: string;
  };
  vitalSigns: {
    bp: string;
    hr: string;
    rr: string;
    temp: string;
    height: string;
    weight: string;
    bmi: string;
    painScore: string;
  };
  physicalExam: {
    general: string;
    heent: string;
    neck: string;
    chest: string;
    cardiac: string;
    abdomen: string;
    extremities: string;
    skin: string;
    neuro: string;
    psychiatric: string;
  };
  problemList: string;
  plan: {
    diagnostics: string;
    treatments: string;
    medications: string;
    referrals: string;
    procedures: string;
  };
  patientEducation: string;
  followUpPlan: string;
  ebmGuidelines: string;
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
