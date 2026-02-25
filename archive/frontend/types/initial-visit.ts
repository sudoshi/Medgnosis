export interface InitialVisitSection {
  title: string;
  prompt: string;
  icon: string;
  subsections?: string[];
}

export type InitialVisitSectionKey =
  | "demographics"
  | "insuranceInfo"
  | "chiefComplaint"
  | "hpi"
  | "allergies"
  | "medications"
  | "pmh"
  | "familyHistory"
  | "socialHistory"
  | "preventiveCare"
  | "ros"
  | "vitalSigns"
  | "physicalExam"
  | "assessment"
  | "problemList"
  | "plan"
  | "patientEducation"
  | "followUpPlan"
  | "ebmGuidelines";

export type InitialVisitSections = Record<
  InitialVisitSectionKey,
  InitialVisitSection
>;

export type InitialVisitSectionContent = string | Record<string, string>;

export type InitialVisitCompletionStatus = Record<
  InitialVisitSectionKey,
  boolean | Record<string, boolean>
>;
