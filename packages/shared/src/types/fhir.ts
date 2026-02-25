// =============================================================================
// Medgnosis — FHIR R4 Types
// Ported from frontend/types/fhir.ts (reconciled version)
// =============================================================================

export interface FHIRCoding {
  system: string;
  code: string;
  display: string;
}

export interface FHIRReference {
  reference: string;
  display?: string;
}

export interface FHIRPeriod {
  start: string;
  end?: string;
}

export interface FHIRDocumentReference {
  resourceType: 'DocumentReference';
  status: 'current' | 'superseded' | 'entered-in-error';
  type: {
    coding: FHIRCoding[];
  };
  subject: FHIRReference;
  date: string;
  content: {
    attachment: {
      contentType: string;
      data: string;
    };
  }[];
  context?: {
    encounter?: FHIRReference[];
    period?: FHIRPeriod;
  };
}

export interface FHIRPatient {
  resourceType: 'Patient';
  id: string;
  identifier?: {
    system: string;
    value: string;
  }[];
  name: {
    family: string;
    given: string[];
  }[];
  gender: string;
  birthDate: string;
  address?: {
    line: string[];
    city: string;
    state: string;
    postalCode: string;
  }[];
}

export interface FHIRObservation {
  resourceType: 'Observation';
  id: string;
  status: 'final' | 'preliminary' | 'amended' | 'cancelled';
  code: {
    coding: FHIRCoding[];
  };
  subject: FHIRReference;
  effectiveDateTime: string;
  valueQuantity?: {
    value: number;
    unit: string;
    system: string;
    code: string;
  };
}

export interface FHIRCondition {
  resourceType: 'Condition';
  id: string;
  clinicalStatus: {
    coding: FHIRCoding[];
  };
  code: {
    coding: FHIRCoding[];
  };
  subject: FHIRReference;
  onsetDateTime?: string;
}

export interface FHIRBundle {
  resourceType: 'Bundle';
  type: 'collection' | 'searchset' | 'document';
  total?: number;
  entry: {
    resource: FHIRPatient | FHIRObservation | FHIRCondition | FHIRDocumentReference;
  }[];
}
