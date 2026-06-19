# Medgnosis EHR Integration Devlog - Current State

- **Date:** 2026-06-17
- **Last assessed:** 2026-06-19
- **Scope:** Epic, Oracle Cerner, SMART Health IT, generic SMART/FHIR, CDS Hooks, Backend Services, Bulk Data, and the follow-on FHIR/QDM bridge integration work
- **Repository:** `/home/smudoshi/Github/Medgnosis`
- **Primary plan:** `docs/superpowers/plans/2026-06-16-ehr-integration-implementation-plan.md`
- **Related bridge closeout:** `docs/superpowers/devlogs/2026-06-18-fhir-qdm-dimensional-bridge-completion.md`

## Executive Summary

Medgnosis now has the foundation of a vendor-neutral EHR integration platform, plus a follow-on FHIR/QDM bridge that gives staged FHIR data an auditable path into quality-measure analytics. The platform supports tenant/client registration, SMART discovery diagnostics, SMART EHR launch, standalone SMART launch, callback/token exchange, strict ID-token/nonce validation, initial launch Patient read/stage/import/crosswalk, bounded launch-context staging for patient workspace resources with first-pass EDW hydration and automatic QDM replay, backend-services queued refresh with next-link continuation jobs for supported patient-context resources, hashed token metadata persistence, FHIR client reads/searches with retry and pagination, CDS Hooks `fhirAuthorization` validation, SMART Backend Services token acquisition, local SMART Health IT sandbox seeding and smoke tests, an admin EHR Integrations UI with recent ingest, Bulk job/file/schedule status, completed-job import replay, and active-job cancellation, a Bulk Data job ledger plus manual/admin/scheduled kickoff, vendor-safe worker polling, automatic completed-job NDJSON import, and a QDM/CQL shadow-governance path for staged FHIR evidence.

The earlier EHR implementation tranche is no longer an uncommitted dirty worktree. The vendor integration foundation was committed as `e56ec76`, production deployment support landed in `c514a9f`, and the FHIR/QDM governance bridge landed in `95252ba`. Before this document refresh, `git status --short --untracked-files=all` was clean. `db:migrate:list` against `.env.production` reports 78 applied migrations and no pending migrations, with `079_qdm_bridge_operations.sql` as the latest migration on disk.

Current completion estimate:

- **Full Epic/Cerner/other-EHR program:** about 60 percent complete.
- **Local vendor-neutral platform:** about 88 percent complete.
- **FHIR/QDM analytics bridge for the scoped CMS122 shadow-governance milestone:** complete.
- **Epic/Cerner production onboarding:** still low, roughly 20-25 percent, because vendor credentials, app registration, sandbox launch evidence, customer scope approval, broader EDW normalization, durable sync visibility, and go-live artifacts remain external or incomplete.

## Current Worktree State

Assessment baseline before this document edit:

- `git status --short --untracked-files=all` returned clean.
- EHR integration files are tracked.
- No untracked EHR route, service, migration, script, or admin UI files remain from the original tranche.
- Current branch: `main`, with `origin/main` at the same HEAD during assessment.

Post-assessment note on 2026-06-18:

- The current worktree now includes application-completion documentation, auth invite activation, password reset, refresh-token session metadata, and TOTP MFA lifecycle changes outside the EHR integration tranche.
- Migration dry-run from the host shell now shows 78 applied migrations and eight pending migrations from the application-completion worktree: `080_invite_activation_tokens.sql`, `081_password_reset_tokens.sql`, `082_refresh_token_session_metadata.sql`, `083_totp_mfa_lifecycle.sql`, `084_smart_launch_handoff_binding.sql`, `085_ehr_bulk_import_files.sql`, `086_ehr_bulk_schedules.sql`, and `087_patient_identity_empi.sql`.
- The EHR-specific status in this devlog is otherwise unchanged.

Relevant commits now in history:

- `e56ec76 feat(ehr): add vendor integration foundation`
- `c514a9f fix(deploy): complete EHR production rollout`
- `95252ba feat: complete FHIR QDM bridge governance`
- `cad8440 feat(admin): port roadmap kanban from snapshot`
- `2f45bfd fix(deploy): publish readable web build`

## Implemented Capabilities

### 1. Tenant Registry and Client Registration

Implemented a vendor-neutral EHR tenant registry backed by `phm_edw.ehr_tenant`, client registrations, and capability snapshots.

Current supported tenant attributes:

- Vendor: `epic`, `oracle_cerner`, `smart_generic`, `hapi`, `other`
- Environment: `sandbox`, `staging`, `production`
- FHIR base URL
- SMART configuration URL
- Issuer and audience
- Operational status
- Organization binding

Current supported client registration types:

- `smart_launch`
- `backend_services`
- `cds_hooks`

Current supported client auth methods:

- `public_pkce`
- `client_secret_post`
- `client_secret_basic`
- `private_key_jwt`
- `fhir_authorization_jwt`
- `shared_secret`

Security posture:

- Admin API responses return sanitized client registrations.
- Raw `clientSecretRef` and `privateKeyRef` are not returned.
- Responses expose only boolean flags such as `hasClientSecretRef` and `hasPrivateKeyRef`.
- Runtime token persistence stores token hashes and metadata, not raw tokens.

Key implementation files:

- `apps/api/src/services/ehr/tenantRegistry.ts`
- `apps/api/src/services/ehr/onboardingRegistration.ts`
- `apps/api/src/services/ehr/onboardingProfile.ts`
- `apps/api/src/routes/ehr/admin.ts`
- `apps/api/src/routes/ehr/admin.test.ts`

### 2. Admin EHR Routes

Admin-only EHR routes are mounted under `/api/v1/ehr/admin`.

Implemented:

- `GET /api/v1/ehr/admin/tenants`
- `POST /api/v1/ehr/admin/tenants`
- `GET /api/v1/ehr/admin/tenants/:id`
- `GET /api/v1/ehr/admin/tenants/:id/diagnostics`
- `POST /api/v1/ehr/admin/tenants/:id/discover`
- `GET /api/v1/ehr/admin/tenants/:id/capabilities`
- `POST /api/v1/ehr/admin/tenants/:id/test-connection`
- `GET /api/v1/ehr/admin/tenants/:id/ingest-runs`
- `GET /api/v1/ehr/admin/onboarding-profile`

The diagnostics/discover/test-connection path:

- Loads the tenant.
- Fetches SMART metadata.
- Fetches CapabilityStatement metadata.
- Summarizes endpoint and resource support.
- Persists an `ehr_capability_snapshot`.
- Returns sanitized diagnostics data.

The tenant detail path returns:

- Tenant metadata.
- Sanitized client registrations.
- Latest capability snapshot.
- Per-client readiness status with missing fields.

The tenant ingest-run path returns:

- Recent `ehr_ingest_run` rows for the tenant.
- Optional `status`, `mode`, `resourceType`, and bounded `limit` filters.
- The latest run summary for admin sync visibility.

### 3. SMART Discovery

SMART discovery support exists for tenant FHIR base URLs and explicit SMART configuration URLs.

Current discovery extracts and summarizes:

- Authorization endpoint
- Token endpoint
- Supported launch capabilities
- Supported scopes
- CDS Hooks endpoint hints
- CapabilityStatement status
- Resource support from CapabilityStatement where available

Known remaining gaps:

- Production HTTPS validation needs to be enforced.
- Capability snapshot hashing and endpoint-drift review need to be added.
- A formal per-resource support matrix still needs to be generated and reviewed against the exported CapabilityStatement.

Key implementation files:

- `apps/api/src/services/ehr/smartDiscovery.ts`
- `apps/api/src/services/ehr/smartDiscovery.test.ts`
- `apps/api/src/services/ehr/vendorAdapters/*`

### 4. SMART App Launch

SMART launch support now includes both embedded EHR launch and standalone launch.

Implemented embedded launch:

- `GET /api/v1/ehr/launch/:tenantId`
- Accepts `iss`, `launch`, optional `redirect_uri`, optional `return_to`, and optional scope override.
- Loads tenant/client launch configuration.
- Validates redirect URI against registered URIs.
- Validates same-origin relative `return_to`.
- Checks authenticated user organization against tenant organization when auth is present.
- Generates state, nonce, PKCE verifier/challenge, and launch session.
- Redirects to the discovered authorization endpoint.

Implemented standalone launch:

- `GET /api/v1/ehr/launch/standalone/:tenantId`
- Uses the same launch creation helper.
- Rewrites default scope from embedded `launch` to standalone `launch/patient` when no explicit scope override is supplied.
- Does not carry an embedded EHR `launch` token.
- Reuses the same callback/token exchange path.

Implemented callback:

- `GET /api/v1/ehr/launch/callback`
- Validates state and session expiry.
- Loads tenant/client config from consumed state.
- Exchanges authorization code using PKCE and configured client auth method.
- Supports public PKCE, client-secret methods, and private-key JWT paths through service code.
- Extracts patient, encounter, fhirUser, and scope.
- Persists token metadata with token hashes only.
- Redirects to the app `return_to` URL with a short-lived one-time `smart_handoff` code when supplied.
- Requires and validates EHR launch `iss` and embedded `launch` context.
- Validates OpenID SMART ID tokens, including signature, issuer, audience, nonce, expiration, issued-at, authorized party, and token-use semantics.
- Reads the launch Patient from the tenant FHIR API while the raw SMART access token is still only in memory.
- Starts a manual `Patient` ingest run, stages the raw Patient resource, creates a minimal local `phm_edw.patient` when required demographics are present, and populates tenant-scoped `ehr_resource_crosswalk`.
- Stages one bounded page each of launch-context `Encounter`, `Condition`, `Observation`, `MedicationRequest`, `Procedure`, and `AllergyIntolerance` resources when granted patient scopes allow those searches, hydrates supported resources into EDW workspace tables, then replays callback-staged resources through the QDM bridge without blocking launch on replay errors.
- Enqueues a backend-services BullMQ refresh after successful launch patient resolution for broader `Encounter`, `Condition`, `Observation`, `MedicationRequest`, `Procedure`, `AllergyIntolerance`, and `Immunization` patient-context pages, including next-link continuation jobs, without storing SMART launch bearer tokens.
- Preserves existing non-null Patient crosswalk mappings rather than reassigning patients automatically.
- Provides an authenticated `/ehr/launch/complete` handoff endpoint that binds the launch to the current Medgnosis session and resolves local patients through launch-context sync status or `ehr_resource_crosswalk`.

Important remaining gaps:

- EHR user linking is not complete.
- Queued broader patient-context refresh and next-link continuation exist for supported patient-context resource types.
- Callback-staged launch-context resources now hydrate into first-pass EDW workspace rows and replay into QDM evidence; queued refresh extends that path for supported patient-context pages, but DocumentReference, DiagnosticReport, medication administration/dispense, delete semantics, and fuller local matching still need EDW normalization.
- A read-only tenant ingest-run status API, recent-sync panel, Bulk job/file/schedule status panel, completed-job import replay, failed-file-only resume, recurring Bulk schedules, and active-job cancellation exist, but alerts, deeper dead-letter runbooks, automated/tenant EHR audit coverage, and broader patient/resource last-success rollups remain incomplete.
- Provider access/PCP attribution policy for newly imported launch patients still needs tenant-specific design.

Key implementation files:

- `apps/api/src/routes/ehr/launch.ts`
- `apps/api/src/routes/ehr/launch.test.ts`
- `apps/api/src/routes/ehr/launch.integration.test.ts`
- `apps/api/src/services/ehr/smartLaunch.ts`
- `apps/api/src/services/ehr/smartLaunch.test.ts`
- `apps/api/src/services/ehr/tokenStore.ts`
- `apps/api/src/services/ehr/tokenStore.test.ts`

### 5. SMART Backend Services

Backend Services token acquisition is implemented for system-level access.

Implemented:

- `client_credentials` grant.
- `private_key_jwt` client assertions.
- `client_secret_post`.
- `client_secret_basic`.
- Tenant-specific client registration loading.
- SMART metadata discovery for token endpoint.
- Scope normalization and requested-vs-granted checks.
- Runtime-only private key resolution from secret references.
- Token metadata persistence with access token hashing.
- Public JWKS publication for backend-service app registration.

Important remaining gaps:

- Token refresh/reacquisition lock to avoid stampede.
- Full scheduled backend ingestion jobs.
- Real Epic/Cerner system app validation.
- Tenant-specific key rotation workflows and runbook.

Key implementation files:

- `apps/api/src/services/ehr/backendServices.ts`
- `apps/api/src/services/ehr/backendServices.test.ts`
- `apps/api/src/services/ehr/backendJwks.ts`
- `apps/api/src/services/ehr/backendJwks.test.ts`
- `apps/api/src/routes/ehr/jwks.ts`
- `apps/api/src/routes/ehr/jwks.test.ts`
- `apps/api/src/scripts/generate-ehr-backend-key.ts`

### 6. FHIR Client and Vendor Adapters

A reusable FHIR client and vendor adapter layer is in place.

Implemented FHIR client behavior:

- `readResource(tenant, token, type, id)`
- `search(tenant, token, type, params)`
- Vendor `_count` defaults.
- Bundle pagination through `link[relation=next]`.
- Next-link tenant URL validation before bearer token reuse.
- Retry/backoff for 429, 502, 503, 504, and transient network errors.
- `Retry-After` support.
- OperationOutcome normalization into typed errors.
- Request audit metadata without PHI payload logging.

Implemented adapters:

- Generic SMART.
- Epic.
- Oracle Cerner.
- HAPI/Smile.
- Other FHIR-capable EHR.

Adapter metadata includes:

- Default scopes.
- Resource support hints.
- Pagination policy.
- Bulk Data capability policy.
- CDS Hooks capability policy.
- Launch context mapping.

Known remaining gaps:

- Real Epic/Cerner sandbox reads have not been executed.
- CapabilityStatement-specific resource/search constraints are not fully enforced.
- Golden fixture tests for Epic-like and Cerner-like resources remain to be added.

Key implementation files:

- `apps/api/src/services/ehr/fhirClient.ts`
- `apps/api/src/services/ehr/fhirClient.test.ts`
- `apps/api/src/services/ehr/vendorAdapters/index.ts`
- `apps/api/src/services/ehr/vendorAdapters/genericSmart.ts`
- `apps/api/src/services/ehr/vendorAdapters/epic.ts`
- `apps/api/src/services/ehr/vendorAdapters/oracleCerner.ts`
- `apps/api/src/services/ehr/vendorAdapters/hapi.ts`
- `apps/api/src/services/ehr/vendorAdapters/other.ts`

### 7. Resource Staging and Ingest Runs

The raw FHIR staging foundation is implemented.

Implemented:

- EHR ingest run table and service.
- Raw FHIR staging with tenant/org identity.
- Stable canonical resource hashing.
- Source version ID capture.
- Source last updated capture from `meta.lastUpdated`.
- Ingest run ID tracking.
- Bundle resource staging.
- Resource IDs inferred from absolute `Bundle.entry.fullUrl` when `resource.id` is absent.

Known remaining gaps:

- EDW normalization from staged resources now covers initial Patient routing plus first-pass workspace rows for `Encounter`, `Condition`, `Observation`, `MedicationRequest`, `Procedure`, `AllergyIntolerance`, and `Immunization`; full all-domain normalization, document references, diagnostic reports, medication dispense/administration, and richer local matching are not complete.
- The FHIR/QDM bridge now covers the scoped quality-measure path, but it is not a full all-domain EDW normalization contract.
- EHR resource crosswalks exist, initial SMART launch Patient import now populates Patient crosswalks, and FHIR/QDM source crosswalks exist for the bridge, but broader EDW patient-context normalization still needs a first-class local matching and attribution contract.
- Data-quality issue rows for unmapped codes/units/statuses remain to be implemented.
- Bounded patient-context staging beyond the launch Patient is wired after SMART launch, hydrated into EDW workspace rows for supported patient-context resource types, automatically replayed into QDM evidence, and extended by a backend-services queued refresh with continuation jobs, but all-domain EDW normalization remains incomplete.

Key implementation files:

- `apps/api/src/services/ehr/ingestRuns.ts`
- `apps/api/src/services/ehr/ingestRuns.test.ts`
- `apps/api/src/services/ehr/resourceStaging.ts`
- `apps/api/src/services/ehr/resourceStaging.test.ts`
- `packages/db/migrations/061_ehr_resource_crosswalk.sql`
- `packages/db/migrations/063_ehr_ingest_runs.sql`

### 8. CDS Hooks and fhirAuthorization

CDS Hooks support has been hardened.

Implemented:

- CDS Hooks 2.0.1-oriented route hardening.
- `fhirAuthorization` JWT/JWKS validation service.
- Signature validation.
- Issuer validation.
- Audience validation.
- Expiration validation.
- Scope validation.
- JWKS cache with TTL.
- Shared-secret compatibility path retained for development.
- Feedback persistence and burden routes exist.

Known remaining gaps:

- Production policy should require configured JWT auth or explicitly approved shared-secret fallback.
- CDS service card metadata still needs full hardening: source topic, coded override reasons, deterministic UUIDs, action/systemAction governance.
- Tenant/service burden aggregation and alerting are not complete.
- CDS sandbox/vendor validation has not been run.

Key implementation files:

- `apps/api/src/services/cds/fhirAuthorization.ts`
- `apps/api/src/services/cds/fhirAuthorization.test.ts`
- `apps/api/src/routes/cds-hooks/index.ts`
- `apps/api/src/routes/cds-hooks/feedback.ts`

### 9. Bulk Data Foundation

A first Bulk Data foundation is implemented. It now includes the auditable kickoff/poll/manifest ledger, manual/admin kickoff, tenant-specific recurring schedules, vendor-safe BullMQ polling, automatic import enqueue after completion, manual completed-job import replay, failed-file-only resume, BullMQ retry/failed-job retention for incomplete imports, active-job cancellation, optional manifest checksum/size validation, PHI-safe audit entries for manual Bulk controls, and a completed-job NDJSON import worker. Deleted-output/tombstone handling, deeper dead-letter runbooks, automated worker audit coverage, broader patient/resource last-success rollups, and vendor sandbox proof remain open.

Implemented:

- Migration `067_ehr_bulk_jobs.sql`.
- `phm_edw.ehr_bulk_job` table.
- Export levels: `system`, `group`, `patient`.
- Target constraints for group and patient exports.
- Status values: `accepted`, `in_progress`, `completed`, `failed`, `canceled`.
- Resource type list persistence.
- `_since` persistence.
- `_typeFilter` persistence.
- Request URL persistence.
- Content-Location/status URL persistence.
- Manifest persistence.
- Output file descriptor persistence.
- Error object persistence.
- Retry-after seconds and next poll timestamp.
- PHI-safe operational metadata.
- Migration `085_ehr_bulk_import_files.sql`.
- `phm_edw.ehr_bulk_import_file` per-output-file import ledger.
- Migration `086_ehr_bulk_schedules.sql`.
- `phm_edw.ehr_bulk_schedule` tenant recurring Bulk schedule table with next-run, last-enqueued, last Bulk job, last-success, and last-failure state.
- Tenant-scoped admin enqueue endpoint for completed Bulk job imports.
- Tenant-scoped admin kickoff endpoint for new Bulk exports.
- Tenant-scoped admin recurring Bulk schedule list/upsert endpoints.
- Tenant-scoped admin cancel endpoint for active Bulk exports.
- Read-only tenant Bulk job status endpoint with redacted file-level import status.
- BullMQ Bulk kickoff/poll/import worker registration in the shared worker entrypoint.

Implemented service logic:

- Vendor capability guard.
- Resource type normalization and validation.
- Required `_type`.
- Group export URL construction.
- Patient export URL construction.
- System export URL construction where supported.
- `Prefer: respond-async` kickoff.
- `Content-Location` validation.
- 202 polling path.
- Manifest parsing.
- Output descriptor parsing.
- Failure path records structured error metadata.
- Tests assert raw bearer token is not persisted.
- Runtime-only backend-services token acquisition for completed-job imports.
- NDJSON output download for completed manifests.
- Streaming line parsing rather than whole-file loading.
- Content-type, resource-type, token-bearing output-origin, and token-scope validation.
- Existing staging service handoff for imported FHIR resources.
- Patient crosswalk creation when a Bulk Patient profile has enough demographic identifiers.
- EDW hydration and QDM replay after successful staging.
- Runtime backend-services token acquisition for kickoff and polling without storing bearer tokens in queue payloads.
- Automatic delayed poll re-enqueue for accepted/in-progress jobs.
- Automatic completed-job import enqueue after polling observes a completed manifest.
- Active-job cancellation uses runtime backend-services tokens and sends `DELETE` to the vendor Bulk status URL.
- Vendor adapter min/max polling windows applied around `Retry-After`.
- Local mock Bulk server integration coverage for kickoff, 202 polling with `Retry-After`, completed manifest fetch, NDJSON import, active-job cancellation, and output-fetch error handling.
- Failed-file-only resume mode skips previously completed import files and retries failed/pending outputs.
- Incomplete worker imports now throw after recording file/run status, allowing BullMQ retry attempts and retained failed jobs to act as the dead-letter surface.
- PHI-safe audit entries are emitted for manual Bulk kickoff, completed-job import replay, failed-file-only resume, and active-job cancellation.
- Nightly scheduling now enqueues due tenant Bulk schedules and marks last-enqueued, last Bulk job, last-success, and last-failure state without storing bearer tokens or raw NDJSON payloads.

Known remaining gaps:

- No dead-letter/replay runbook beyond BullMQ retry retention, manual completed-job replay, and failed-file-only resume.
- No checksum/size validation when vendors provide file metadata.
- No Bulk `deleted` tombstone handling.
- No real Epic/Cerner Bulk Data sandbox job has been run.

Key implementation files:

- `packages/db/migrations/067_ehr_bulk_jobs.sql`
- `packages/db/migrations/085_ehr_bulk_import_files.sql`
- `packages/db/migrations/086_ehr_bulk_schedules.sql`
- `apps/api/src/services/ehr/bulkData.ts`
- `apps/api/src/services/ehr/bulkData.test.ts`
- `apps/api/src/services/ehr/bulkSchedules.ts`
- `apps/api/src/workers/ehr-bulk-import.ts`
- `apps/api/src/workers/ehr-bulk-import.test.ts`

### 10. Admin UI

The web admin area now includes an EHR Integrations tab.

Implemented UI features:

- Admin tab registration.
- Tenant registry table.
- Vendor filter.
- Environment filter.
- Tenant selection.
- Registration form for tenant, SMART launch client, and backend services client.
- Per-tenant readiness panel.
- Client credential readiness flags.
- Latest capability snapshot display.
- Diagnostics action.
- Sanitized display: secret refs are not shown, only readiness booleans.
- Recent tenant ingest-run status panel.
- Bulk job status panel with manual export kickoff, schedule save, manual completed-job import replay, active-job cancel, file counts, staged row counts, failures, next poll/request timestamps, schedule next-run/last-success state, and redacted per-file import status.

Known UI gaps:

- No dedicated UI test yet for admin-only EHR visibility or secret redaction.
- Last sync display is not complete because broader patient/resource last-success rollups are not surfaced in the UI.
- Failed-import resume controls exist for completed jobs with failed file rows, but QDM replay drilldowns are not implemented.
- Data-quality/unmapped-code review UI is not implemented.

Key implementation files:

- `apps/web/src/pages/admin/EhrIntegrationsTab.tsx`
- `apps/web/src/pages/AdminPage.tsx`
- `apps/web/src/pages/admin/helpers.tsx`
- `apps/web/src/pages/admin/types.ts`

### 11. Scripts and Local Sandbox Operations

Added operational scripts for onboarding and verification.

Implemented scripts:

- `npm run ehr:profile`
- `npm run ehr:onboard`
- `npm run ehr:keygen`
- `npm run ehr:smoke`
- `npm run db:seed-ehr-sandbox`

Script capabilities:

- Generate onboarding profiles/workbooks.
- Upsert sandbox tenant/client registration.
- Generate backend signing key material.
- Run onboarding smoke checks.
- Seed SMART Health IT sandbox tenant data locally.

Key implementation files:

- `apps/api/src/scripts/ehr-onboarding-profile.ts`
- `apps/api/src/scripts/onboard-ehr-tenant.ts`
- `apps/api/src/scripts/generate-ehr-backend-key.ts`
- `apps/api/src/scripts/smoke-ehr-onboarding.ts`
- `packages/db/src/seed-ehr-sandbox.ts`

### 12. FHIR/QDM Bridge and Measure Governance

After the EHR foundation landed, the follow-on FHIR/QDM bridge work integrated staged FHIR evidence into the quality-measure analytics path. This does not replace the EHR onboarding work; it closes a major downstream gap by giving inbound FHIR resources a governed route into QDM evidence, CQL shadow evaluation, SQL/CQL reconciliation, and star-schema lineage.

Implemented:

- `phm_edw.qdm_event` canonical QDM event spine.
- `phm_edw.fhir_qdm_crosswalk` source FHIR-to-QDM linkage.
- `phm_star.bridge_qdm_star_evidence` and `phm_star.fact_measure_result_evidence` evidence ledgers.
- FHIR-to-QDM normalization replay from staged resources.
- EDW-to-QDM-to-QI-Core projection for CQL sidecar execution.
- CQL `MeasureReport` persistence and patient evidence summaries.
- Source-aware SQL/CQL reconciliation with scoped-vs-full-population promotion controls.
- CQL shadow star materialization that cannot overwrite SQL authority by accident.
- Semantic drift dossier and drift worklist.
- Admin Measure Governance tab with audited evidence detail drilldown.
- PHI-safe QDM bridge run/issue ledgers and operational status view.
- `npm run qdm:shadow-refresh` for ledgered shadow refreshes with promotion disabled by default.
- Operations runbook for replay, rollback, value-set drift, and CQL engine outage procedures.

Current governance state:

- `CMS122v12` remains in `cql_shadow` mode.
- `sql_bundle` remains authoritative for the current dashboard baseline.
- Authoritative CQL promotion is intentionally blocked pending semantic drift review.
- The local `CMS122v12 <- DM-02` SQL baseline alias is documented as a governed surrogate, not a standards-equivalent CMS122 implementation.

Key implementation files:

- `apps/api/src/services/ehr/qdmBridge.ts`
- `apps/api/src/services/qdm/`
- `apps/api/src/services/measureReconciliation.ts`
- `apps/api/src/services/measureSemanticDriftDossier.ts`
- `apps/api/src/routes/admin/index.ts`
- `apps/api/src/scripts/qdm-bridge-shadow-run.ts`
- `apps/web/src/pages/admin/MeasureGovernanceTab.tsx`
- `docs/superpowers/runbooks/qdm-bridge-operations.md`
- `packages/db/migrations/068_qdm_bridge_foundation.sql`
- `packages/db/migrations/079_qdm_bridge_operations.sql`

## Database State

EHR foundation migrations:

- `060_ehr_tenant_registry.sql`
- `061_ehr_resource_crosswalk.sql`
- `063_ehr_ingest_runs.sql`
- `064_smart_launch_sessions.sql`
- `065_smart_launch_pkce.sql`
- `066_ehr_workbook_metadata.sql`
- `067_ehr_bulk_jobs.sql`

Follow-on bridge/governance migrations:

- `068_qdm_bridge_foundation.sql`
- `069_auth_admin_oidc_foundation.sql`
- `070_qdm_cql_measure_result_promotion.sql`
- `071_measure_data_criteria.sql`
- `072_measure_promotion_reconciliation_governance.sql`
- `073_measure_promotion_audit_columns.sql`
- `074_measure_reconciliation_scope.sql`
- `075_measure_sql_baseline_alias.sql`
- `076_measure_reconciliation_conservative_legacy_scope.sql`
- `077_measure_reconciliation_promotion_eligibility_guard.sql`
- `078_measure_semantic_drift_dossier.sql`
- `079_qdm_bridge_operations.sql`

Current database status before the auth, SMART handoff, Bulk import-file, and Bulk schedule migrations in this worktree:

- The local `.env` dry-run with `host.docker.internal` rewritten to `127.0.0.1` reports 78 applied migrations.
- Pending migrations from the host dry-run: `080_invite_activation_tokens.sql`, `081_password_reset_tokens.sql`, `082_refresh_token_session_metadata.sql`, `083_totp_mfa_lifecycle.sql`, `084_smart_launch_handoff_binding.sql`, `085_ehr_bulk_import_files.sql`, `086_ehr_bulk_schedules.sql`, and `087_patient_identity_empi.sql`.
- Latest migration on disk: `087_patient_identity_empi.sql`.
- The earlier 067 handoff state is superseded by the 068-079 bridge/governance migration tranche.

CLI note:

- The local `.env` uses `host.docker.internal` for `DATABASE_URL`.
- Host shell DB commands in this checkout require a CLI-only host override to `127.0.0.1`.
- Do not commit local DB URL modifications unless deliberately changing environment policy.

## Validation Evidence

Latest recorded full validation after the application-completion continuation work:

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- `set -a; . ./.env; set +a; DATABASE_URL="${DATABASE_URL/host.docker.internal/127.0.0.1}" npm run db:migrate:dry-run`
- `npm run test`
- `npm run build`
- `npm run test:e2e --workspace=apps/web`

Latest recorded full test summary:

- API: 93 test files passed; 666 tests passed, 1 skipped.
- Web: 25 test files passed; 42 tests passed.
- Shared: 43 tests passed.
- Solr: 18 tests passed.
- Migration dry run reported 78 applied migrations and 8 pending migrations through `087_patient_identity_empi.sql`.
- Build completed successfully.

Focused EHR tests covered during the EHR foundation tranche:

- `apps/api/src/routes/ehr/admin.test.ts`
- `apps/api/src/routes/ehr/launch.test.ts`
- `apps/api/src/routes/ehr/launch.integration.test.ts`
- `apps/api/src/services/ehr/smartLaunch.test.ts`
- `apps/api/src/services/ehr/bulkData.test.ts`
- `apps/api/src/workers/ehr-bulk-import.test.ts`

Focused bridge/governance tests and smoke coverage added after the EHR tranche:

- `apps/api/src/services/ehr/qdmBridge.test.ts`
- `apps/api/src/services/qdm/*.test.ts`
- `apps/api/src/services/measureReconciliation.test.ts`
- `apps/api/src/services/measureSemanticDriftDossier.test.ts`
- Admin Measure Governance browser smoke with audited QDM evidence detail drilldown.
- QDM bridge operational ledger smoke for `CMS122v12`.

Latest live SMART Health IT onboarding smoke:

- Command: `npm run ehr:smoke -- --tenant-id 1` with local DB host override.
- Timestamp reported by smoke: `2026-06-17T03:26:44.987Z`.
- Result: 3 pass, 0 warn, 4 skip, 0 fail.
- PASS tenant registry.
- PASS SMART discovery.
- PASS SMART launch client readiness.
- SKIP Backend Services client because no enabled backend-services registration exists for tenant 1.
- SKIP Public JWKS endpoint because no backend-services client requires one.
- SKIP Backend token exchange because no backend-services registration exists.
- SKIP authenticated FHIR read because no smoke access token/resource was supplied.

Production assessment rechecks on 2026-06-18, before the later application-completion worktree migrations:

- `git status --short --untracked-files=all` returned clean before this document edit.
- `set -a; . ./.env.production; set +a; npm run db:migrate:list` reported 78 applied migrations and no pending migrations.
- `https://medgnosis.acumenus.net/health` returned healthy with database up.
- `http://127.0.0.1:3081/health` returned healthy with database up.

## Runtime State at Handoff

Production API:

- Public health endpoint: `https://medgnosis.acumenus.net/health`.
- Local systemd/reverse-proxy target health endpoint: `http://127.0.0.1:3081/health`.
- Both health endpoints returned `{"status":"healthy","version":"1.0.0","services":{"database":"up"}}` during the 2026-06-18 assessment.

Production web/admin:

- Apache serves the built web app and proxies API traffic to the production API service.
- The Admin Panel includes the EHR Integrations tab and the follow-on Measure Governance tab.
- The latest bridge closeout smoke loaded Measure Governance, QDM evidence detail, and Bridge Ops without browser console errors.

Security note:

- The earlier detached local-dev process that briefly exposed a DB URL was terminated during the original EHR tranche.
- Current production runtime should continue to rely on `.env.production` and systemd-managed process startup, not DB URLs embedded directly in shell process arguments.

## Remaining Critical Gaps

### Vendor Credentials and Registration

Not complete:

- Epic on FHIR developer/customer app registration.
- Oracle Health Code Console app registration.
- Epic sandbox EHR launch smoke.
- Oracle Cerner sandbox launch smoke.
- Epic/Cerner patient-context FHIR reads.
- Epic/Cerner Backend Services token validation.
- Epic/Cerner Bulk Data job validation.
- Production customer activation and go-live evidence.

These require external credentials, vendor portal access, customer tenant details, and scope approval.

### SMART Launch Hardening

Still needed:

- User linking between EHR user and Medgnosis user.
- Tenant-specific patient access/PCP attribution after launch Patient import.
- Broader patient-context import when local patient history is absent.
- Audit/rate-limit coverage for launch attempts, denials, callbacks, and handoff consumption.
- Vendor sandbox launch simulation into patient detail.

### Patient-Context Sync

Still needed:

- Expand active/recent pilot resources to allergies, procedures, immunizations, and other tenant-specific display needs.
- Normalize additional staged resource families into EDW tables.
- Record durable sync status beyond ingest-run metadata and BullMQ job state.
- Show sync status and stale-data warnings in the UI.

### Bulk Data Import

Still needed:

- Deeper dead-letter controls and replay runbook.
- Checksum/size validation when provided by vendors.
- Bulk `deleted` tombstone handling.
- Broader patient/resource last-success rollups and alerting.
- Small approved group export against sandbox/vendor tenant.

### Observability and Audit

Still needed:

- Audit every SMART launch lifecycle event.
- Audit token exchange success/failure without token contents.
- Audit FHIR reads by tenant/resource/patient/user.
- Audit Bulk job lifecycle.
- EHR tenant health dashboard.
- SMART launch health dashboard.
- FHIR API health dashboard.
- Bulk ingestion dashboard.
- Alerting for token failures, FHIR 401/403/429 spikes, stuck Bulk jobs, and stale tenant sync.

Now partially covered outside the EHR-specific path:

- QDM bridge run/issue ledgers exist.
- QDM bridge operational status view exists.
- Measure Governance raw evidence drilldown is audited.
- QDM bridge operations runbook exists.

### Clinical Safety and Governance

Still needed:

- Production CDS auth policy.
- CDS card governance: interruptive policy, override reasons, duplicate suppression, action/systemAction rules.
- Customer/clinical review of care-gap text and workflows.
- Legal/security review for PHI flows, retention, BAA/customer contracts.
- Explicit no-writeback default and future writeback feature flags.
- CMS122 CQL-authoritative promotion remains blocked pending semantic drift governance review.

## Current Risk Register

### Risk: Overstating vendor readiness

The platform is locally strong, but real Epic/Cerner readiness is not achieved until vendor sandbox launch, token, patient read, and Bulk flows are completed.

Mitigation:

- Keep implementation plan checkboxes conservative.
- Keep live SMART Health IT evidence separate from Epic/Cerner evidence.
- Do not mark vendor go-live tasks complete until portal/customer validation exists.

### Risk: SMART launch patient workspace is not fully hydrated after bounded callback staging

Launch/callback/token mechanics, authenticated handoff binding, initial Patient import/crosswalk, bounded staging of core launch-context resources, first-pass EDW hydration, automatic QDM replay, and queued backend-services refresh with next-link continuation for core resource pages now work in code. The remaining risk is that newly imported launch patients still lack tenant-specific provider attribution, broader resource history, durable sync visibility, and vendor sandbox proof.

Mitigation:

- Prioritize EDW normalization breadth, durable sync status, and patient access policy next.
- Add end-to-end vendor/sandbox launch evidence that opens patient detail.
- Keep Patient import/crosswalk regression tests in the SMART launch suite before production launch work.

### Risk: Bulk Data incomplete after manifest

Bulk kickoff/poll/manifest persistence, NDJSON downloader/importer, EDW hydration, QDM replay, recurring schedule enqueueing, admin job/file/schedule status visibility, completed-job import replay, failed-file-only resume, BullMQ retry/dead-letter retention, PHI-safe manual-control audit, and active-job cancellation now exist, but the path still lacks checksum/deleted handling, automated worker audit coverage, deeper replay runbooks, broader patient/resource last-success rollups, and vendor sandbox proof.

Mitigation:

- Extend Bulk integration coverage as resume/dead-letter, checksum, deleted-output, and vendor-specific behaviors are implemented.
- Harden dead-letter drilldowns and replay runbooks before relying on Bulk as an operational bootstrap path.
- Keep Bulk Data explicitly for bootstrap/group use cases, not low-latency UI sync.

### Risk: Semantic drift hidden behind bridge success

The FHIR/QDM bridge engineering path works, but engineering success does not mean a local SQL surrogate is standards-equivalent to a published CQL measure.

Mitigation:

- Keep `CMS122v12` in `cql_shadow` mode.
- Keep `sql_bundle` authoritative until governance accepts a standards-equivalent path.
- Use the semantic drift dossier and worklist before any CQL-authoritative promotion.

### Risk: Secrets and tokens

The code avoids returning raw secret refs and persists token hashes only, but production secret management and key rotation are not complete.

Mitigation:

- Keep using refs such as `env:` or future secret-manager refs.
- Add key rotation runbook.
- Add manual secret leakage review before any PR/merge.

## Recommended Next Development Sequence

1. **Patient-context normalization breadth and visibility**
   - Extend the bounded callback staging, EDW hydration, QDM replay, and backend-services queue path to the remaining patient-detail resource families not yet covered by existing EDW tables.
   - Broaden EDW normalization into document references, diagnostic reports, medication administration/dispense, and richer local matching where patient detail needs it.
   - Add sync status persistence and admin/clinician-safe error reporting.

2. **EHR patient crosswalk and EDW normalization**
   - Keep launch Patient crosswalks as the routing source of truth.
   - Implement Encounter normalization first.
   - Add Observation and Condition next because they drive care gaps, clinical summary value, and the QDM bridge.

3. **SMART user linking and audit**
   - Add EHR `fhirUser` to Medgnosis user linking policy.
   - Add SMART lifecycle audit events and rate limits.
   - Add vendor sandbox evidence for completed handoff into patient detail.

4. **Bulk Data operational hardening**
   - Add deeper dead-letter controls and runbooks.
   - Define deleted-output tombstone behavior when vendors provide it.
   - Add vendor-specific recurring schedule evidence against an approved sandbox.

5. **Admin UI completion**
   - Add UI test for secret redaction/admin-only access.
   - Add broader patient/resource last-success rollups, Bulk replay/dead-letter drilldowns, and resource-level sync errors.

6. **EHR observability and runbooks**
   - Add SMART launch/token/FHIR-read audit coverage.
   - Add EHR tenant, SMART launch, FHIR API, and Bulk ingestion health panels.
   - Add stuck-job and token-failure alerting.

7. **Epic/Cerner vendor readiness**
   - Use onboarding profiles to register real sandbox apps.
   - Validate Epic and Oracle Cerner launch/callback/token flows.
   - Validate patient-context reads.
   - Validate system-token flow where approved.
   - Capture evidence and update plan checkboxes only after real validation.

8. **Measure governance follow-through**
   - Keep CMS122 in shadow mode until semantic drift is clinically reviewed.
   - Decide whether to replace the DM-02 surrogate, accept a local measure definition, or promote a standards-equivalent CQL path.

## Current File Landmarks

Planning:

- `docs/superpowers/plans/2026-06-16-ehr-integration-implementation-plan.md`
- `docs/superpowers/plans/2026-06-17-fhir-qdm-dimensional-bridge-implementation-plan.md`
- `docs/superpowers/devlogs/2026-06-18-fhir-qdm-dimensional-bridge-completion.md`
- `docs/superpowers/runbooks/qdm-bridge-operations.md`

Admin API:

- `apps/api/src/routes/ehr/admin.ts`
- `apps/api/src/routes/ehr/admin.test.ts`
- `apps/api/src/routes/admin/index.ts`

SMART launch:

- `apps/api/src/routes/ehr/launch.ts`
- `apps/api/src/routes/ehr/launch.test.ts`
- `apps/api/src/routes/ehr/launch.integration.test.ts`
- `apps/api/src/services/ehr/smartLaunch.ts`
- `apps/api/src/services/ehr/tokenStore.ts`

FHIR/adapter layer:

- `apps/api/src/services/ehr/fhirClient.ts`
- `apps/api/src/services/ehr/vendorAdapters/`
- `apps/api/src/services/ehr/operationOutcome.ts`

Backend Services:

- `apps/api/src/services/ehr/backendServices.ts`
- `apps/api/src/services/ehr/backendJwks.ts`
- `apps/api/src/routes/ehr/jwks.ts`

Bulk Data:

- `apps/api/src/services/ehr/bulkData.ts`
- `apps/api/src/services/ehr/bulkData.test.ts`
- `apps/api/src/services/ehr/bulkSchedules.ts`
- `packages/db/migrations/067_ehr_bulk_jobs.sql`
- `packages/db/migrations/085_ehr_bulk_import_files.sql`
- `packages/db/migrations/086_ehr_bulk_schedules.sql`

Resource staging:

- `apps/api/src/services/ehr/resourceStaging.ts`
- `apps/api/src/services/ehr/ingestRuns.ts`
- `apps/api/src/services/ehr/qdmBridge.ts`

QDM bridge and measure governance:

- `apps/api/src/services/qdm/`
- `apps/api/src/services/measureReconciliation.ts`
- `apps/api/src/services/measureSemanticDriftDossier.ts`
- `apps/web/src/pages/admin/MeasureGovernanceTab.tsx`
- `packages/db/migrations/068_qdm_bridge_foundation.sql`
- `packages/db/migrations/079_qdm_bridge_operations.sql`

CDS auth:

- `apps/api/src/services/cds/fhirAuthorization.ts`
- `apps/api/src/routes/cds-hooks/`

Admin UI:

- `apps/web/src/pages/admin/EhrIntegrationsTab.tsx`
- `apps/web/src/pages/AdminPage.tsx`
- `apps/web/src/pages/admin/types.ts`
- `apps/web/src/pages/admin/helpers.tsx`

Scripts:

- `apps/api/src/scripts/ehr-onboarding-profile.ts`
- `apps/api/src/scripts/onboard-ehr-tenant.ts`
- `apps/api/src/scripts/generate-ehr-backend-key.ts`
- `apps/api/src/scripts/smoke-ehr-onboarding.ts`
- `apps/api/src/scripts/qdm-bridge-shadow-run.ts`
- `packages/db/src/seed-ehr-sandbox.ts`

## Completion Snapshot

| Area | Status | Notes |
| --- | --- | --- |
| Tenant registry | Mostly complete | Needs production secret-manager policy and audit logs |
| Admin onboarding API | Mostly complete | CRUD/upsert/detail/diagnostics/capabilities/test-connection present |
| Admin EHR UI | Partial | Tenant onboarding/readiness, recent ingest-run sync status, Bulk job/file/schedule status, completed-job import replay, failed-import resume, and active-job cancel present; alerting, dead-letter drilldowns, and broader patient/resource last-success rollups missing |
| SMART discovery | Partial | Works locally; needs HTTPS enforcement, hash/drift detection |
| EHR launch | Partial | Launch/callback, initial Patient import/crosswalk, bounded context staging, first-pass EDW hydration, automatic QDM replay, queued supported patient-context refresh, and refresh continuation work; user linking, access attribution, all-domain normalization, durable sync visibility, and vendor evidence remain |
| Standalone launch | Partial | Route and scope behavior present; end-to-end patient selection evidence pending |
| Token metadata | Mostly complete | Hash-only persistence present; refresh/reacquisition remains |
| Backend Services | Partial | Token flow implemented; no real vendor validation |
| FHIR client | Mostly complete | Reads/search/pagination/retry present; vendor-specific constraints need expansion |
| Resource staging | Partial | Raw staging, callback EDW hydration, callback QDM replay, queued supported-resource refresh, and continuation work; all-domain EDW normalization remains incomplete |
| FHIR/QDM bridge | Mostly complete for scoped milestone | QDM spine, FHIR crosswalk, CQL shadow, reconciliation, semantic drift, and ops ledger present |
| Measure governance | Partial | Admin tab and audited evidence drilldown present; CMS122 promotion remains governance-blocked |
| CDS Hooks auth | Partial | JWT/JWKS validation present; production governance incomplete |
| Bulk Data | Partial | Kickoff/poll/manifest ledger, manual/admin kickoff, tenant recurring schedules, worker polling/import orchestration, file-level import ledger, completed-manifest NDJSON import worker, completed-job import replay, failed-import resume, active-job cancel, optional checksum/size validation, manual-control audit, EDW hydration, QDM replay, and admin status UI present; deeper dead-letter runbooks, tombstones, automated worker audit, broader patient/resource last-success rollups, and vendor sandbox evidence remain |
| Epic readiness | Early | Requires real app registration and sandbox validation |
| Oracle Cerner readiness | Early | Requires Code Console registration and sandbox validation |
| Observability/runbooks | Partial | QDM bridge runbook, bridge ops ledgers, and System Health worker/queue plus EHR Bulk readiness visibility exist; EHR launch/FHIR/CQL/DEQM dashboards and alerts remain |

Overall: the local platform can support the next engineering slices without needing vendor credentials, and the FHIR/QDM bridge now gives staged FHIR evidence a governed analytics path. Actual Epic/Cerner readiness still requires external sandbox and customer onboarding work.
