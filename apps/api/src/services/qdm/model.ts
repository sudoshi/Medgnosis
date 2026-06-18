// =============================================================================
// Medgnosis API - Canonical QDM analytics model
// Pragmatic QDM v5.6-oriented event/entity shape used as a bridge between
// FHIR/QI-Core resources and dimensional quality analytics.
// =============================================================================

export type QdmVersion = '5.6';

export type QdmCategory =
  | 'Patient'
  | 'Encounter'
  | 'Condition'
  | 'Laboratory Test'
  | 'Physical Exam'
  | 'Assessment'
  | 'Medication'
  | 'Procedure'
  | 'Device';

export type QdmDatatype =
  | 'Patient'
  | 'Encounter, Performed'
  | 'Diagnosis'
  | 'Laboratory Test, Performed'
  | 'Physical Exam, Performed'
  | 'Assessment, Performed'
  | 'Medication, Order'
  | 'Medication, Not Ordered'
  | 'Medication, Administered'
  | 'Medication, Not Administered'
  | 'Procedure, Performed'
  | 'Procedure, Not Performed'
  | 'Device';

export interface QdmIdentifier {
  system?: string;
  value: string;
  type?: QdmCode;
}

export interface QdmCode {
  system?: string;
  code?: string;
  display?: string;
  text?: string;
}

export interface QdmReference {
  reference?: string;
  type?: string;
  id?: string;
  display?: string;
}

export interface QdmInterval {
  start?: string;
  end?: string;
}

export interface QdmTiming {
  birthDate?: string;
  relevantDateTime?: string;
  relevantPeriod?: QdmInterval;
  prevalencePeriod?: QdmInterval;
  authorDateTime?: string;
  resultDateTime?: string;
}

export interface QdmSourceReference {
  resourceType: string;
  id?: string;
  reference?: string;
  profiles: string[];
  identifiers: QdmIdentifier[];
  sourceSystem?: string;
}

export interface QdmNormalizationContext {
  sourceSystem?: string;
  patient?: QdmReference;
  encounter?: QdmReference;
  provenance?: Record<string, unknown>;
}

export interface QdmElement {
  id: string;
  qdmVersion: QdmVersion;
  category: QdmCategory;
  datatype: QdmDatatype;
  status?: string;
  code?: QdmCode;
  subject?: QdmReference;
  encounter?: QdmReference;
  timing: QdmTiming;
  attributes: Record<string, unknown>;
  source: QdmSourceReference;
  provenance?: Record<string, unknown>;
}
