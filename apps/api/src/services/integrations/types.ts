// =============================================================================
// Medgnosis API — External clinical integrations: shared types
// FUTURE DIRECTIVE. See docs/EXTERNAL-CLINICAL-INTEGRATIONS-DIRECTIVE.md.
// These types describe the contracts Medgnosis will speak to external clinical
// systems (Epic via FHIR, LIS, RIS/PACS). They are intentionally minimal and
// will be expanded when each integration is prioritized.
// =============================================================================

export type IntegrationKey = 'epic-fhir' | 'lis' | 'ris-pacs';

export type IntegrationStatus = 'enabled' | 'planned' | 'disabled';

export interface IntegrationDescriptor {
  key: IntegrationKey;
  title: string;
  status: IntegrationStatus;
  /** Interoperability standards this integration speaks. */
  standards: string[];
  /** Human-readable note on current state / next step. */
  note: string;
}

/** Minimal reference to an imaging study discovered in a RIS/PACS. */
export interface ImagingStudyRef {
  studyInstanceUid: string;
  patientId: string;
  accessionNumber?: string;
  modality?: string;
  studyDate?: string;
  description?: string;
}

/** QIDO-RS-style query parameters for imaging study discovery. */
export interface DicomWebStudyQuery {
  patientId?: string;
  accessionNumber?: string;
  studyDate?: string;
  modality?: string;
  limit?: number;
}

/** Minimal lab result envelope ingested from a LIS feed. */
export interface LabResultRef {
  orderId: string;
  patientId: string;
  loincCode?: string;
  value?: string;
  unit?: string;
  resultedAt?: string;
  status: 'preliminary' | 'final' | 'corrected' | 'cancelled';
}

export interface LisResultQuery {
  patientId?: string;
  since?: string;
  limit?: number;
}
