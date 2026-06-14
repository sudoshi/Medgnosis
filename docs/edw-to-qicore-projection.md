# EDW → QI-Core 7.0.2 Projection Map

CQL authored against QI-Core retrieves by a **primary code path** plus a
**temporal path**. This document maps `phm_edw` source columns to those exact
QICore-ModelInfo 7.0.2 paths so that CQL `retrieve` statements resolve against
the Medgnosis warehouse.

> Status: seed map — extend as Phase 1 measures are authored. The read-only
> FHIR mappers (`apps/api/src/services/fhir/mappers.ts`) emit these resources;
> conformance is gated by the HL7 validator CI job (`scripts/fhir-validate.sh`).

## Resource projections

| QI-Core resource | Primary code path | Temporal path | EDW source (table.column) | Code system |
|---|---|---|---|---|
| QICore Patient | (n/a) | `birthDate` | `patient.date_of_birth` | — (demographics: `gender`, `race`, `ethnicity`) |
| QICore Condition (problems-health-concerns) | `Condition.code` | `Condition.onset[x]` | `condition_diagnosis` ⨝ `condition.condition_code` | SNOMED CT |
| QICore Observation (clinical-result) | `Observation.code` | `Observation.effective[x]` | `observation.observation_code` | LOINC |
| QICore MedicationRequest | `MedicationRequest.medication.code` | `MedicationRequest.authoredOn` | `medication_order` ⨝ `medication.medication_code` | RxNorm |
| QICore Procedure | `Procedure.code` | `Procedure.performed[x]` | `procedure_performed` ⨝ `procedure.procedure_code` | SNOMED CT |
| QICore Encounter | `Encounter.type` / `Encounter.class` | `Encounter.period` | `encounter.*` | — |

## Value-set membership

An EDW code is "in" a value set **iff** `(translated code_system, code)` exists
in `phm_edw.vsac_value_set_code` for the value set OID. Translate the EDW
`code_system` label through `EDW_TO_VSAC_CODE_SYSTEM`
(`apps/api/src/services/vsacService.ts`) before matching — e.g. EDW `SNOMED` →
VSAC `SNOMEDCT`, EDW `ICD-10` → VSAC `ICD10CM`. `ICD-9` and `OTHER` are
**unmapped by design** (no VSAC eCQM extract) and are never joined.

Resolution helper: `conceptInValueSet()` in
`apps/api/src/services/fhir/edwToQiCore.ts`.

## Negation pattern

QI-Core represents "not done" two ways, by resource category:

- **Event resources** (Procedure, Observation, Immunization): `status = not-done`
  plus `statusReason` (bound to `qicore-negation-reason`).
- **Request resources** (MedicationRequest, ServiceRequest): `doNotPerform = true`
  plus `reasonCode`.

Helper: `negationToFhir(resourceType, reason)` in
`apps/api/src/services/fhir/edwToQiCore.ts`.

## Terminology resolution

CQL `valueset` declarations bind to VSAC OIDs and resolve via the FHIR
terminology service (`ValueSet/$expand`, `ValueSet/$validate-code`;
`apps/api/src/services/fhir/terminology.ts`). When a `measurementPeriod` is
supplied, a period-pinned expansion is served from
`phm_edw.vsac_expansion_cache` (migration `055`) for stable cross-year results.
