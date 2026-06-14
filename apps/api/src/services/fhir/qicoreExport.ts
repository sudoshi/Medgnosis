// =============================================================================
// Medgnosis API — QI-Core cohort export (transaction Bundle for engine loading)
// Projects a sample cohort of Medgnosis EDW rows into a FHIR transaction Bundle
// of QI-Core/US-Core-profiled resources, reusing the Phase 0 mappers. Each entry
// is a PUT keyed by `ResourceType/id` so re-running the export upserts the same
// resource ids in the clinical-reasoning sidecar's JPA store (idempotent
// "Mode B" data feeding). Consumed by cqlEngineLoader + cql-live-reconcile.
// =============================================================================

import type { Row } from 'postgres';
import {
  mapPatientToFHIR,
  mapConditionToFHIR,
  mapObservationToFHIR,
  mapMedicationToFHIR,
  type FHIRResource,
} from './mappers.js';

export interface CohortRows {
  patients: Row[];
  conditions: Row[];
  observations: Row[];
  medications: Row[];
}

export interface TransactionBundleEntry {
  fullUrl: string;
  resource: FHIRResource;
  request: { method: 'PUT'; url: string };
}

export interface TransactionBundle {
  resourceType: 'Bundle';
  type: 'transaction';
  entry: TransactionBundleEntry[];
}

// PUT-by-id makes the load idempotent: a second export of the same patient
// overwrites rather than duplicating. fullUrl mirrors the relative reference so
// intra-bundle references (Patient/5) resolve regardless of server base.
function putEntry(resource: FHIRResource): TransactionBundleEntry {
  const ref = `${resource.resourceType}/${resource.id}`;
  return { fullUrl: ref, resource, request: { method: 'PUT', url: ref } };
}

export function buildCohortBundle(rows: CohortRows): TransactionBundle {
  const resources: FHIRResource[] = [
    ...rows.patients.map((p) => mapPatientToFHIR(p)),
    ...rows.conditions.map((c) => mapConditionToFHIR(c, String(c['patient_id']))),
    ...rows.observations.map((o) => mapObservationToFHIR(o, String(o['patient_id']))),
    ...rows.medications.map((m) => mapMedicationToFHIR(m, String(m['patient_id']))),
  ];
  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: resources.map(putEntry),
  };
}
