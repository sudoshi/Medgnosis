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
  mapEncounterToFHIR,
  type FHIRResource,
} from './mappers.js';
import { QICORE } from './profiles.js';

export interface CohortRows {
  patients: Row[];
  conditions: Row[];
  observations: Row[];
  medications: Row[];
  encounters?: Row[];
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

// HAPI (and FHIR servers in general) reject purely-numeric client-assigned ids
// on PUT — only the server may mint numeric ids (HAPI-0960). EDW primary keys are
// integers, so we namespace every exported id with a stable resource-type prefix
// (mgp-/mgc-/mgo-/mgm-). Subject references are rewritten to match so the bundle
// loads on any conformant server (also makes the export portable to payer DEQM
// endpoints in Epic C). The mappers set their own numeric id internally; we
// override it here and pass the prefixed Patient id in as the subject reference.
const ID = {
  patient: (id: unknown): string => `mgp-${id}`,
  condition: (id: unknown): string => `mgc-${id}`,
  observation: (id: unknown): string => `mgo-${id}`,
  medication: (id: unknown): string => `mgm-${id}`,
  encounter: (id: unknown): string => `mge-${id}`,
};

// PUT-by-id makes the load idempotent: a second export of the same patient
// overwrites rather than duplicating. fullUrl mirrors the relative reference so
// intra-bundle references (Patient/mgp-5) resolve regardless of server base.
function putEntry(resource: FHIRResource): TransactionBundleEntry {
  const ref = `${resource.resourceType}/${resource.id}`;
  return { fullUrl: ref, resource, request: { method: 'PUT', url: ref } };
}

// eCQM CQL retrieves are QI-Core-profile-typed: the clinical-reasoning engine
// matches resources by meta.profile (e.g. [Encounter: "Office Visit"] only sees
// qicore-encounter, [ConditionEncounterDiagnosis] only sees the qicore encounter-
// diagnosis profile). The US-Core mappers don't assert these, so the export tags
// each resource with its QI-Core profile (QI-Core derives from US Core, so both
// are asserted and remain US-Core-valid).
function withProfile(r: FHIRResource, profile: string): FHIRResource {
  const profiles = (r.meta?.profile ?? []).slice();
  if (!profiles.includes(profile)) profiles.push(profile);
  r.meta = { lastUpdated: r.meta?.lastUpdated ?? new Date().toISOString(), profile: profiles };
  return r;
}

export function buildCohortBundle(rows: CohortRows): TransactionBundle {
  const resources: FHIRResource[] = [];

  for (const p of rows.patients) {
    const r = withProfile(mapPatientToFHIR(p), QICORE.patient);
    r.id = ID.patient(p['patient_id']);
    resources.push(r);
  }
  for (const c of rows.conditions) {
    const r = withProfile(mapConditionToFHIR(c, ID.patient(c['patient_id'])), QICORE.conditionEncounterDiagnosis);
    r.id = ID.condition(c['condition_diagnosis_id']);
    resources.push(r);
  }
  for (const o of rows.observations) {
    const r = withProfile(mapObservationToFHIR(o, ID.patient(o['patient_id'])), QICORE.observationLab);
    r.id = ID.observation(o['observation_id']);
    resources.push(r);
  }
  for (const m of rows.medications) {
    const r = withProfile(mapMedicationToFHIR(m, ID.patient(m['patient_id'])), QICORE.medicationRequest);
    r.id = ID.medication(m['medication_order_id']);
    resources.push(r);
  }
  for (const e of rows.encounters ?? []) {
    const r = withProfile(mapEncounterToFHIR(e, ID.patient(e['patient_id'])), QICORE.encounter);
    r.id = ID.encounter(e['encounter_id']);
    resources.push(r);
  }

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: resources.map(putEntry),
  };
}
