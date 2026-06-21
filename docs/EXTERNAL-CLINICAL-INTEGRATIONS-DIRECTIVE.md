# External Clinical Integrations — Future Directive

**Status:** Directive / scaffolding only (not wired into the running app)
**Owner:** Dr. Sanjay Udoshi — Acumenus Data Sciences
**Created:** 2026-06-20

Medgnosis will connect to three classes of external clinical system. This document
is the standing directive; the code scaffolding lives in
`apps/api/src/services/integrations/`. All integrations are **off by default** and
must be explicitly enabled via environment variables.

| Integration | Status | Primary standards | Code |
|---|---|---|---|
| **Epic (EHR)** | Partial — core plumbing exists | FHIR R4, SMART on FHIR, UDAP, Bulk Data `$export` | `apps/api/src/services/ehr/` |
| **LIS** (Laboratory) | Planned (stub) | FHIR R4 `DiagnosticReport`/`Observation`, HL7v2 `ORU^R01`, LOINC | `integrations/lis.ts` |
| **RIS / PACS** (Imaging) | Planned (stub) | DICOMweb (QIDO/WADO/STOW), FHIR R4 `ImagingStudy`, HL7v2 `ORM`/`ORU`, DICOM C-FIND/C-MOVE | `integrations/risPacs.ts` |

---

## 1. Epic via FHIR (EHR)

Epic connectivity rides the **existing EHR layer** under `apps/api/src/services/ehr/`
(SMART launch/discovery, UDAP enrollment, bulk `$export`, vendor adapters, token
store, EDW hydration). Epic sandbox apps are already registered (see
`EPIC_REGISTRATION_HANDOFF.md`). The directive here is to **extend that layer**, not
to build a parallel client. The `integrations` module only carries an
`epic-fhir` status entry so all three systems appear in one registry.

## 2. LIS — Laboratory Information System

**Goal:** ingest resulted lab observations into Medgnosis (care-gap closure,
measure numerators, anticipatory care).

- **Preferred:** FHIR R4 — poll/subscribe `DiagnosticReport` + `Observation`,
  coded in **LOINC**, linked to the patient via EMPI (see `EMPI-SANTEMPI-SETUP.md`).
- **Fallback:** HL7v2 `ORU^R01` over MLLP for v2-only labs; map OBX segments →
  `Observation`. Keep the v2→FHIR mapping in one place.
- **Identity:** resolve incoming patient identifiers through the MPI before
  persisting; never trust the sending facility's local MRN as global.

Config: `LIS_ENABLED`, `LIS_FHIR_BASE_URL`, `LIS_HL7_ENDPOINT`.

## 3. RIS / PACS — Medical Imaging

**Goal:** surface imaging studies/results alongside the longitudinal record and
(later) launch a viewer.

- **PACS is already available.** The shared Orthanc PACS runs in the Parthenon
  stack and is reachable by DNS on the **`acropolis-backend`** Docker network at
  **`http://parthenon-orthanc:8042`** (DICOMweb root `/dicom-web`). To use it,
  attach the Medgnosis API/worker containers to `acropolis-backend` (declare it as
  an `external` network in `docker-compose.yml`, mirroring the Aurora wiring), then
  set `RIS_PACS_DICOMWEB_URL`.
- **Discovery:** QIDO-RS for study/series search; **WADO-RS** for retrieval;
  STOW-RS only if Medgnosis ever pushes images (not anticipated near-term).
- **Orders/results:** RIS order (`ORM`) and report (`ORU`) feeds, or FHIR
  `ServiceRequest` + `ImagingStudy` + `DiagnosticReport` where the RIS is modern.
- **Auth:** Orthanc uses HTTP Basic. Store the password under the env var named by
  `RIS_PACS_PASSWORD_REF` (default `RIS_PACS_PASSWORD`) — **never commit it**
  (this repo previously leaked a tracked `.env.production`; keep secrets out of git).

Config: `RIS_PACS_ENABLED`, `RIS_PACS_DICOMWEB_URL`, `RIS_PACS_USERNAME`,
`RIS_PACS_PASSWORD_REF`.

---

## Wiring checklist (per integration, when prioritized)

1. Flip `*_ENABLED=true` and populate the endpoint/credential env vars.
2. For RIS/PACS: add `acropolis-backend` to the Medgnosis compose as an external
   network and attach `medgnosis-api` (+ `medgnosis-worker`).
3. Implement the stub methods (replace the `IntegrationNotImplementedError` throws).
4. Resolve all external patient identifiers through the EMPI/MPI.
5. Add the integration to System Health (`listIntegrations()` already feeds it).
6. Add tests; never assert against live PHI — use fixtures.

## Security

- Secrets by reference only (env var **names** in code, values in untracked env).
- All inbound clinical data is validated at the boundary and identity-resolved
  through the MPI before persistence.
- Imaging/lab endpoints are authenticated; no unauthenticated PHI paths.
