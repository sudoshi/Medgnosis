# Medgnosis EHR Integration Devlog - Current State

- **Date:** 2026-06-17
- **Last assessed:** 2026-06-26
- **Scope:** Epic, Oracle Cerner, SMART Health IT, generic SMART/FHIR, CDS Hooks, Backend Services, Bulk Data, and the follow-on FHIR/QDM bridge integration work
- **Repository:** `/home/smudoshi/Github/Medgnosis`
- **Primary plan:** `docs/superpowers/plans/2026-06-16-ehr-integration-implementation-plan.md`
- **Related bridge closeout:** `docs/superpowers/devlogs/2026-06-18-fhir-qdm-dimensional-bridge-completion.md`

## Executive Summary

Medgnosis now has the foundation of a vendor-neutral EHR integration platform, plus a follow-on FHIR/QDM bridge that gives staged FHIR data an auditable path into quality-measure analytics. The platform supports tenant/client registration, SMART discovery diagnostics, SMART EHR launch, standalone SMART launch, callback/token exchange, strict ID-token/nonce validation, initial launch Patient read/stage/import/crosswalk, bounded launch-context staging for patient workspace resources with first-pass EDW hydration and automatic QDM replay, backend-services queued refresh with next-link continuation jobs for supported patient-context resources, hashed token metadata persistence, FHIR client reads/searches with retry and pagination, PHI-safe failed FHIR read/search and backend-token request audit summaries, CDS Hooks `fhirAuthorization` validation, SMART Backend Services token acquisition, local SMART Health IT sandbox seeding and smoke tests, an admin EHR Integrations UI with tenant readiness evidence, previous-snapshot CapabilityStatement drift, backend credential/token readiness, an explicit audited backend token-check action, aggregate Bulk diagnostics, recent ingest, selectable ingest-run operational details, worker failure/overdue-poll sync metrics, bounded patient/resource rollups, bounded crosswalk conflict and stale-resource drilldowns, structured sync issue actions, PHI-safe EHR sync alert snapshots with explicit dispatch/audit and FHIR 401/403/429 spike summaries, Bulk job/file/schedule status, Bulk import/QDM replay summaries, linked Bulk QDM replay controls, completed-job import replay, failed-file resume, and active-job cancellation, SMART lifecycle audit/rate limits, PHI-safe admin EHR audit entries, PHI-safe EHR tenant and worker-adjacent mutation audit coverage, PHI-safe QDM/CQL promotion attempt audits, API PHI redaction controls for production Pino structured logs and Sentry error telemetry, production HTTP header/CSP hardening with production Swagger suppression, public auth exposure policy for registration and demo quick-fill surfaces, a Bulk Data job ledger plus manual/admin/scheduled kickoff, vendor-safe worker polling, PHI-safe automated Bulk worker audit, automatic completed-job NDJSON import, optional manifest checksum/size validation, a QDM/CQL shadow-governance path for staged FHIR evidence, and first-pass EDW hydration across 17 FHIR resource families including `DiagnosticReport`, `DocumentReference`, `MedicationDispense`, and `MedicationAdministration`.

Production checkpoint on 2026-06-25: the medication-event application code release `e467846` was pushed and deployed, production migrations are current through `091_ehr_medication_events.sql`, the follow-up `.env.production` dry-run reported 90 applied migrations and no pending migrations, `./scripts/deploy-production.sh` completed successfully, `medgnosis-api` and `medgnosis-worker` were active, and both `http://127.0.0.1:3081/health` and `https://medgnosis.acumenus.net/health` returned healthy with the database up. Follow-up application release `25b6f7d` added bounded patient/resource sync rollups and was also pushed, deployed, and public-health verified on 2026-06-25. Follow-up release `ab87e84` added bounded crosswalk conflict targets, stale patient/resource drilldowns, and structured sync issue source/recommended-action metadata to the existing sync-status API/UI; it was pushed, deployed, and public-health verified on 2026-06-25 with `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` active and production migration dry-run still reporting no pending migrations. Follow-up release `9ba7246` added Bulk import/QDM replay summaries, poll-count and normalized-row visibility, linked Bulk QDM replay controls, durable manual QDM replay metadata, and the EHR Bulk replay/dead-letter runbook; it was pushed, deployed, and public-health verified on 2026-06-25 with all three production services active, a PHI-light tenant-2 Bulk summary probe returning QDM `replayed`, and production migration dry-run still reporting no pending migrations. Follow-up release `95af0de` added PHI-light ingest-run operational summaries and a selectable, keyboard-accessible EHR Integrations run-detail panel outside the Bulk table; it was pushed, deployed, and public-health verified on 2026-06-25 with all three production services active, a tenant-2 ingest-run summary probe returning QDM `replayed`, 2,880 normalized resources/events, and production migration dry-run still reporting no pending migrations. Follow-up release `1c560e0` added previous-snapshot CapabilityStatement drift, backend credential/token readiness, an explicit audited backend token-check action, and aggregate Bulk diagnostics to the readiness evidence API/UI; it was pushed, deployed, and public-health verified on 2026-06-25 with all three production services active, a read-only tenant-2 readiness probe, and production migration dry-run still reporting no pending migrations. Follow-up release `1eba305` added PHI-safe aggregate EHR sync alert snapshots, explicit audited admin dispatch, optional nightly dispatch, webhook signing, System Health alert status, and the stale-data/Bulk incident runbook; production delivery still requires an explicit webhook configuration. The current continuation adds PHI-safe failed FHIR read/search and backend-token request audit rows plus sync-alert summaries for FHIR 401/403/429, backend-token auth failures, rate-limit spikes, repeated FHIR network failures, PHI-safe QDM/CQL promotion attempt audits for dry-run, promoted, and failed route-level attempts, PHI-safe EHR tenant mutation audit coverage for QDM/CQL load plus diagnostics/Bulk patient-level redaction proof, focused API PHI redaction coverage for Pino structured logs plus Sentry error telemetry, production HTTP header/CSP hardening with production Swagger suppression, and public auth exposure policy for registration plus demo quick-fill surfaces. The 2026-06-20 FHIR EDW expansion closeout separately records migrations `089`/`090` applied to the `medgnosis` database and live Epic sandbox Bulk/read validation.

Current continuation is focused on non-EMPI EHR ingestion breadth and operator visibility. `MedicationDispense` and `MedicationAdministration` now have additive EDW landing tables, insert/update hydrators, source crosswalk targets, backend-service refresh coverage, and medication-reference fallback coverage. Tenant sync status now also includes bounded patient/resource rollups, crosswalk conflict targets, stale patient/resource drilldowns, and PHI-light issue action metadata. Bulk job status now also exposes PHI-light import and QDM replay summaries plus a linked replay action for staged Bulk ingest runs, and recent ingest runs now expose PHI-light operational summaries with selectable detail outside the Bulk table. The latest tranches add readiness evidence for previous-snapshot CapabilityStatement drift, required Bulk resource capability gaps, backend-services credential/token age, an explicit audited backend token-check action, aggregate Bulk diagnostics, PHI-safe external EHR sync alert snapshots, FHIR/token failure spike summaries, and a stale-data/Bulk incident runbook. This tranche consumes existing crosswalk and EMPI-derived state but does not advance the parallel EMPI/identity track.

Auth/security continuation on 2026-06-26 tightened the route-level audit trail around session and credential lifecycle work that supports EHR operations. The API now emits PHI-safe audit events for known-user local login failures, MFA verification and disable failures, refresh-token rotation, replay detection, expiry, MFA gating, missing-user branches, rejected password changes, public registration creation, session revoke misses, and preference updates. Anti-enumeration branches and untrusted reset/invite/MFA/OIDC token branches now carry explicit no-audit rationale comments, and OIDC callback success audit details no longer persist raw email claims.

Follow-up non-EMPI mutation audit hardening on 2026-06-26 closes another route-level discipline gap. CDS feedback now records aggregate accepted/overridden counts through the route audit helper; admin measure refresh no longer bypasses request audit metadata with a direct `audit_log` insert; and clinical-note, generated order, cohort message, population-finder accept, MTM advance, auto-order disenroll, invite, and refresh-token audit details have been reduced to aggregate/bound flags instead of patient, care-gap, order-set, provider, diagnosis, note-content, session, or invite identifiers. Focused regression coverage passes across orders, population finder, auth, clinical notes, CDS feedback, admin refresh, and the problem-list bulk service; full follow-up typecheck, lint, test, build, and diff-check gates pass.

Follow-up EHR audit redaction on 2026-06-26 removes the remaining high-risk EHR audit payload fields identified in the current non-EMPI audit pass. Backend token checks and Bulk cancellations now audit token metadata presence instead of token metadata ids; SMART launch start audits session creation instead of a launch session id; SMART callback denial audit and response handling no longer persist provider-supplied denial text; and EHR sync alert dispatch audit details use endpoint/error presence flags instead of webhook endpoint hosts or raw webhook/network error strings. Focused EHR validation passes across admin, launch, sync-alert, and System Health tests; full root typecheck, lint, test, build, and diff-check gates pass.

Follow-up Bulk deleted-output verification on 2026-06-26 closes a stale planning gap rather than adding a new runtime path. The existing Bulk importer already processes `manifest.deleted` Bundle NDJSON entries with `DELETE ResourceType/id` requests, soft-deletes crosswalk-mapped EDW rows, and stamps `ehr_resource_crosswalk.deleted_at/deleted_reason`. Focused Bulk validation passes across `bulkData` and `edwHydration`; vendor sandbox evidence, incident rehearsal, configured external delivery, and tombstone edge cases remain open.

Follow-up operations runbook work on 2026-06-26 adds a production worker and CQL sidecar restart runbook. The runbook reflects the current host-systemd production worker, the deploy script's worker restart behavior, the opt-in HAPI clinical-reasoning sidecar, and the smoke/shadow-refresh commands that prove CQL recovery without changing SQL-authoritative production behavior.

Follow-up QRDA/QPP validation work on 2026-06-26 adds deterministic QRDA Cat I, QRDA Cat III, and QPP JSON fixtures, local structural validation scripts, and an external-validator handoff runbook. The local gates now prove well-formed CDA XML and the expected QPP performance-data shape; official Cypress CVU+ and QPP sandbox/API validation remain external gates and are not marked complete.

Follow-up role-based E2E work on 2026-06-26 adds provider, analyst, normal-admin, and super-admin Playwright session fixtures plus a focused role workflow spec. The spec proves provider patient-detail access, analyst measure and population-finder access, non-admin Admin nav suppression and direct `/admin` redirect, normal-admin access to admin operations without the super-admin-only Auth Providers tab, and super-admin Auth Providers visibility. This expands the prior admin-only protected-route smoke without touching the parallel EMPI/identity track.

Follow-up System Health standards-readiness work on 2026-06-26 adds a CQL/FHIR/DEQM readiness section to the admin health API and UI. The section reports CQL smoke script/bundle presence plus optional runtime URL configuration, FHIR US Core/QI-Core validation script and fixture availability, and Da Vinci DEQM validation script and Gaps-in-Care fixture availability, with operator commands for the deeper validation gates. It does not run expensive external validators during the 60-second health poll.

Earlier EMPI continuation work added an operator-run EMPI backfill script for pre-EMPI legacy patients. Local dry-run evidence showed 1,005,791 existing `phm_edw.patient` rows were unlinked and linkable into `phm_edw.person`/`phm_edw.patient_link`. This refresh does not advance EMPI; that work remains owned by the parallel EMPI/identity track.

Current completion estimate:

- **Full Epic/Cerner/other-EHR program:** about 68 percent complete.
- **Local vendor-neutral platform:** about 96 percent complete.
- **FHIR/QDM analytics bridge for the scoped CMS122 shadow-governance milestone:** complete.
- **Epic/Cerner production onboarding:** still low, roughly 22-27 percent, because vendor credentials, app registration, customer scope approval, local matching policy, configured external alert delivery, and go-live artifacts remain external or incomplete.

## Current Worktree State

Assessment baseline for this refresh:

- Current branch: `main`.
- Medication-event application release commit: `e467846 feat(ehr): hydrate medication event resources`.
- Patient/resource sync-rollup application release commit: `25b6f7d feat(ehr): surface patient resource sync rollups`.
- Sync-status drilldown/action application release commit: `ab87e84 feat(ehr): add sync status drilldowns`.
- Bulk replay drilldown application release commit: `9ba7246 feat(ehr): add bulk replay drilldowns`.
- Ingest-run drilldown application release commit: `95af0de feat(ehr): add ingest run drilldowns`.
- Readiness token diagnostics application release commit: `1c560e0 feat(ehr): add readiness token diagnostics`.
- EHR sync alert dispatch application release commit: `1eba305 feat(ehr): add sync alert dispatch`.
- Auth/session audit hardening application release commit: `8d6ee91 feat(auth): harden session audit coverage`.
- Non-EMPI mutation audit hardening application release commit: `0e82fb3 feat(api): harden mutation audit payloads`.
- EHR audit-redaction application release commit: `737dfde feat(ehr): redact audit payload details`.
- Production was deployed successfully after `091` was applied, after `25b6f7d`, after `ab87e84`, after `9ba7246`, after `95af0de`, after `1c560e0`, and again after `1eba305`; the documentation checkpoint may be a later commit on top of the same application releases.
- Auth/session audit hardening release `8d6ee91` was pushed, deployed, and public-health verified on 2026-06-26. `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active; production migration list reported 91 applied migrations and no pending migrations; `/api/v1/auth/providers` returned local and Authentik enabled with public registration and demo quick-fill disabled.
- Non-EMPI mutation audit hardening release `0e82fb3` was pushed, deployed, and public-health verified on 2026-06-26. `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active; production migration dry-run reported 91 applied migrations and no pending migrations; `/api/v1/auth/providers` returned local and Authentik enabled with public registration and demo quick-fill disabled. Sourcing `.env.production` still emits the existing lines 84/85 warnings.
- EHR audit-redaction release `737dfde` was pushed, deployed, and public-health verified on 2026-06-26. `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active; production migration dry-run reported 91 applied migrations and no pending migrations; `/api/v1/auth/providers` returned local and Authentik enabled with public registration and demo quick-fill disabled. Sourcing `.env.production` still emits the existing lines 84/85 warnings.
- Production migrations are current through `091_ehr_medication_events.sql`.
- The deployed non-EMPI work slice contains MedicationDispense/MedicationAdministration hydration in `apps/api/src/services/ehr/edwHydration.ts`, refresh/resource-scope expansion in `apps/api/src/services/ehr/patientContextRefresh.ts` and `apps/api/src/services/ehr/scopePolicy.ts`, focused regression coverage in the paired tests, migration `091_ehr_medication_events.sql`, bounded patient/resource rollups plus conflict/stale drilldowns and issue action metadata in `apps/api/src/services/ehr/syncStatus.ts` and `apps/web/src/pages/admin/EhrIntegrationsTab.tsx`, Bulk replay drilldowns, PHI-light ingest-run operational summaries in `apps/api/src/services/ehr/ingestRuns.ts`, selectable ingest-run details in `apps/web/src/pages/admin/EhrIntegrationsTab.tsx`, readiness capability/backend/Bulk diagnostics plus backend token checks in `apps/api/src/services/ehr/readinessEvidence.ts`, PHI-safe sync alert snapshots in `apps/api/src/services/ehr/syncAlerts.ts`, FHIR/token failure audit summaries in `apps/api/src/services/ehr/fhirRequestAudit.ts`, failed FHIR request audit wiring in `apps/api/src/services/ehr/fhirClient.ts`, backend-token failure audit wiring in `apps/api/src/services/ehr/backendServices.ts`, System Health alert status/dispatch and CQL/FHIR/DEQM standards readiness in `apps/api/src/services/systemHealth.ts`, `apps/api/src/routes/admin/index.ts`, and `apps/web/src/pages/admin/SystemHealthTab.tsx`, and this documentation refresh.

Relevant commits now in history:

- `e56ec76 feat(ehr): add vendor integration foundation`
- `c514a9f fix(deploy): complete EHR production rollout`
- `95252ba feat: complete FHIR QDM bridge governance`
- `cad8440 feat(admin): port roadmap kanban from snapshot`
- `2f45bfd fix(deploy): publish readable web build`
- `28c562d feat: advance auth ehr and operations readiness`
- `c8d662f fix(api): compile injectable identity repository`
- `3dabd58 docs(auth): devlog for Authentik 'Medgnosis Admins' group (fleet SSO)`
- `e467846 feat(ehr): hydrate medication event resources`
- `25b6f7d feat(ehr): surface patient resource sync rollups`
- `ab87e84 feat(ehr): add sync status drilldowns`
- `9ba7246 feat(ehr): add bulk replay drilldowns`
- `95af0de feat(ehr): add ingest run drilldowns`
- `1c560e0 feat(ehr): add readiness token diagnostics`
- `1eba305 feat(ehr): add sync alert dispatch`
- `8d6ee91 feat(auth): harden session audit coverage`

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
- `GET /api/v1/ehr/admin/tenants/:id/sync-status`
- `GET /api/v1/ehr/admin/tenants/:id/readiness-evidence`
- `POST /api/v1/ehr/admin/tenants/:id/backend-token-check`
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

The tenant sync/readiness paths return:

- Crosswalk, ingest, Bulk import, Bulk schedule, and Bulk worker lifecycle rollups.
- Worker failure and overdue-poll issue flags.
- SMART discovery, launch, callback, and handoff evidence derived from snapshots, launch sessions, and audit rows.
- PHI-safe status summaries without raw tokens, FHIR payloads, patient ids, group ids, or Bulk output URLs.

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
- Enqueues a backend-services BullMQ refresh after successful launch patient resolution for broader `Encounter`, `Condition`, `Observation`, `MedicationRequest`, `MedicationDispense`, `MedicationAdministration`, `Procedure`, `AllergyIntolerance`, and `Immunization` patient-context pages, including next-link continuation jobs, without storing SMART launch bearer tokens.
- Preserves existing non-null Patient crosswalk mappings rather than reassigning patients automatically.
- Provides an authenticated `/ehr/launch/complete` handoff endpoint that binds the launch to the current Medgnosis session and resolves local patients through launch-context sync status or `ehr_resource_crosswalk`.

Important remaining gaps:

- EHR user linking is not complete.
- Queued broader patient-context refresh and next-link continuation exist for supported patient-context resource types.
- Callback-staged launch-context resources now hydrate into first-pass EDW workspace rows and replay into QDM evidence; queued refresh extends that path for supported patient-context pages. `DocumentReference`, `DiagnosticReport`, `MedicationDispense`, and `MedicationAdministration` now have first-pass EDW hydration; vendor tombstone edge-case evidence and fuller local matching still need hardening.
- A read-only tenant ingest-run status API, PHI-light ingest-run operational summaries, recent-sync panel, selectable ingest-run detail view, Bulk job/file/schedule status panel, Bulk import/QDM replay summaries, linked Bulk QDM replay controls, bounded patient/resource rollup, bounded conflict/stale drilldowns, structured sync issue actions, completed-job import replay, failed-file-only resume, recurring Bulk schedules, active-job cancellation, PHI-safe sync alert snapshots, FHIR/token failure summaries, QDM/CQL promotion attempt audits, PHI-safe EHR tenant mutation audit coverage, and stale-data/Bulk incident runbook exist, but configured external delivery and incident-tested dead-letter workflows remain incomplete.
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

- EDW normalization from staged resources now covers initial Patient routing, Bulk Patient EMPI resolution/crosswalk seeding, and first-pass workspace rows for `Encounter`, `Condition`, `Observation`, `MedicationRequest`, `MedicationDispense`, `MedicationAdministration`, `Procedure`, `AllergyIntolerance`, `Immunization`, `ServiceRequest`, `DiagnosticReport`, `DocumentReference`, `CarePlan`, `Goal`, `CareTeam`, and `Coverage`; richer local matching and additional tenant-specific domain needs are not complete.
- The FHIR/QDM bridge now covers the scoped quality-measure path, but it is not a complete EDW normalization contract for every possible FHIR domain.
- EHR resource crosswalks exist, initial SMART launch Patient import now populates Patient crosswalks, Bulk Patient hydration routes through EMPI before creating/linking local patient rows, FHIR/QDM source crosswalks exist for the bridge, and tenant sync status has bounded patient/resource rollups plus bounded conflict/stale drilldowns. Broader EDW patient-context normalization still needs provider attribution, configured external alert delivery, live incident evidence, and local matching policy.
- Data-quality issue rows for unmapped codes/units/statuses remain to be implemented.
- Bounded patient-context staging beyond the launch Patient is wired after SMART launch, hydrated into EDW workspace rows for supported patient-context resource types, automatically replayed into QDM evidence, and extended by a backend-services queued refresh with continuation jobs. Remaining gaps are now less about the original core/document/report/medication-event families and more about durable sync visibility, local matching, vendor tombstone edge-case evidence, and tenant-specific resource breadth.

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

A first Bulk Data foundation is implemented. It now includes the auditable kickoff/poll/manifest ledger, manual/admin kickoff, tenant-specific recurring schedules, vendor-safe BullMQ polling, automatic import enqueue after completion, manual completed-job import replay, failed-file-only resume, BullMQ retry/failed-job retention for incomplete imports, active-job cancellation, optional manifest checksum/size validation, PHI-safe audit entries for manual Bulk controls, PHI-safe automated worker lifecycle audit entries, completed-job NDJSON import worker, Bulk deleted-output tombstone processing for crosswalk-mapped EDW rows, Bulk Patient EMPI/crosswalk seeding before downstream resource hydration, Bulk import/QDM replay status summaries, a linked QDM replay action for Bulk ingest runs, the Bulk replay/dead-letter runbook, PHI-safe sync alert snapshots, FHIR/token failure alert summaries, the stale-data/Bulk incident runbook, and bounded patient/resource sync drilldowns. Incident rehearsal for dead-letter workflows, configured external alert delivery, vendor tombstone edge-case evidence, and vendor sandbox proof remain open.

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
- `manifest.deleted` Bundle NDJSON parsing and crosswalk-based EDW soft-delete stamping.
- Failure path records structured error metadata.
- Tests assert raw bearer token is not persisted.
- Runtime-only backend-services token acquisition for completed-job imports.
- NDJSON output download for completed manifests.
- Streaming line parsing rather than whole-file loading.
- Content-type, resource-type, token-bearing output-origin, and token-scope validation.
- Existing staging service handoff for imported FHIR resources.
- Patient identity resolution through EMPI when a Bulk Patient has enough demographics for the identity floor, with strong identifiers attached and local `phm_edw.patient` rows linked through `phm_edw.patient_link`.
- The older pre-staging Bulk Patient direct insert/crosswalk helper has been removed so Bulk Patient creation has one identity-resolution chokepoint: `hydrateStagedRunToEdw`.
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
- Admin Bulk job summaries include poll count, import aggregate counts, linked ingest-run status, QDM replay state, normalized/event counts, recommended action, and a manual QDM replay action when staged resources are available.
- Manual QDM replay writes durable ingest-run metadata so subsequent Bulk job status calls can show replayed/failed state without exposing raw FHIR payloads.
- `docs/superpowers/runbooks/ehr-bulk-replay-dead-letter.md` documents PHI-light Bulk import resume, QDM replay, dead-letter triage, and closure checks.

Known remaining gaps:

- The replay/dead-letter runbook has not yet been exercised against a real vendor sandbox incident or production failed-file incident.
- Bulk `deleted` tombstone handling is implemented for crosswalk-mapped EDW rows; vendor tombstone edge-case evidence remains open.
- Bounded patient/resource rollups, stale-resource drilldowns, FHIR/token failure spike summaries, stale-data runbook, and PHI-safe alert snapshot routing exist; configured external delivery and live incident evidence remain open.
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
- Per-tenant readiness evidence panel for discovery, launch, callback, and handoff state.
- Previous-snapshot CapabilityStatement drift display with added/removed/changed resource counts and required Bulk resource coverage.
- Backend-services credential/token readiness display with last-token timestamp, expiry, token request counts, and explicit audited token-check action.
- Aggregate Bulk diagnostic strip for active/failed/completed jobs, schedules, next run, and last completion.
- Client credential readiness flags.
- Latest capability snapshot display.
- Diagnostics action.
- Sanitized display: secret refs are not shown, only readiness booleans.
- Recent tenant ingest-run status panel with selectable PHI-light run details.
- Tenant sync-status panel with crosswalk, ingest, Bulk import, Bulk schedule, worker failure, overdue-poll, bounded patient/resource rollup metrics, bounded conflict/stale drilldowns, and structured sync issue actions.
- Bulk job status panel with manual export kickoff, schedule save, manual completed-job import replay, active-job cancel, file counts, staged row counts, failures, next poll/request timestamps, schedule next-run/last-success state, import/QDM replay summaries, linked QDM replay controls, and redacted per-file import status.
- System Health EHR Sync Alerts panel with endpoint-host display, configured/nightly status, last dispatch status/counts, and explicit audited manual dispatch.

Known UI gaps:

- No dedicated UI test yet for admin-only EHR visibility or secret redaction.
- Last sync display now includes bounded patient/resource rollups, conflict/stale drilldowns, issue recommended actions, PHI-safe FHIR/token failure alert summaries, and PHI-safe external alert dispatch readiness; production still needs a configured webhook and live incident evidence.
- Failed-import resume controls, Bulk-linked QDM replay controls, and broader ingest-run detail visibility exist for completed jobs with staged resources.
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
- `docs/superpowers/runbooks/worker-and-cql-sidecar-restart.md`
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

Application-completion and EHR hardening migrations recorded as applied in the 2026-06-19 production checkpoint:

- `080_invite_activation_tokens.sql`
- `081_password_reset_tokens.sql`
- `082_refresh_token_session_metadata.sql`
- `083_totp_mfa_lifecycle.sql`
- `084_smart_launch_handoff_binding.sql`
- `085_ehr_bulk_import_files.sql`
- `086_ehr_bulk_schedules.sql`
- `087_patient_identity_empi.sql`

Later EHR/identity migrations now present in the current checkout:

- `088_identity_review_probabilistic_reason.sql`
- `089_ehr_diagnostic_report_document_reference.sql`
- `090_ehr_resource_crosswalk_soft_delete.sql`
- `091_ehr_medication_events.sql`

Current database status:

- Production `.env.production` dry-run after the 2026-06-25 medication-event deploy reported 90 applied migrations and no pending migrations.
- The 2026-06-20 FHIR EDW expansion closeout records `089` and `090` applied to the `medgnosis` database and verified against live Epic sandbox data.
- `091_ehr_medication_events.sql` was applied on 2026-06-25.
- Latest migration on disk: `091_ehr_medication_events.sql`.
- Pending production migrations: none as of the 2026-06-25 post-deploy dry-run.
- The earlier 067 handoff state is superseded by the 068-091 bridge/governance/auth/Bulk/EMPI/EDW migration tranche.
- Legacy patient identity backfill is not a migration. It is an explicit operator script: `npm run db:backfill-empi -- --dry-run` first, then `npm run db:backfill-empi` only during a planned backfill window.

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
- Pre-deploy migration dry run reported 78 applied migrations and 8 pending migrations through `087_patient_identity_empi.sql`; production deployment then applied those migrations and now reports 86 applied, none pending.
- Build completed successfully.

Post-deploy validation on 2026-06-19:

- `bash -lc 'set -a; source .env.production; set +a; npm run db:migrate'` applied migrations `080` through `087`.
- `bash -lc 'set -a; source .env.production; set +a; npm run db:migrate:dry-run'` reported 86 applied migrations and no pending migrations.
- `./scripts/deploy-production.sh` rebuilt API/web artifacts, restarted `medgnosis-api` and `medgnosis-worker`, and passed the local health check.
- `curl -fsS https://medgnosis.acumenus.net/health` returned healthy with database up.
- `systemctl is-active medgnosis-api medgnosis-worker` returned `active` for both services.

Focused continuation validation after Bulk Patient EMPI hydration and removal of the older direct Bulk Patient insert path:

- `npm run test --workspace=apps/api -- src/services/ehr/edwHydration.test.ts src/services/ehr/bulkData.test.ts src/services/ehr/identity` passed 5 files and 50 tests.
- `npm run typecheck --workspace=apps/api` passed.
- `npm run build --workspace=apps/api` passed.
- `npm run typecheck --workspace=packages/db` passed.
- `npm run build --workspace=packages/db` passed.
- Local EMPI backfill dry run with `.env` host override passed: `npm run db:backfill-empi -- --dry-run` reported 1,005,791 unlinked patient rows, 1,005,791 linkable, and 0 skipped.
- Final slice gates passed: `npm run typecheck`, `npm run build`, focused API EHR/identity tests, and `git diff --check`.

Focused non-EMPI EHR readiness/audit/sync validation after the latest continuation:

- `npm run test --workspace=apps/api -- launch.test.ts` passed.
- `npm run test --workspace=apps/api -- readinessEvidence.test.ts admin.test.ts` passed.
- `npm run test --workspace=apps/api -- auditLog.test.ts ehr-bulk-import.test.ts syncStatus.test.ts admin.test.ts` passed 4 files and 51 tests.
- `npm run typecheck --workspace=apps/api` passed.
- `npm run lint --workspace=apps/api` passed.
- `npm run build --workspace=apps/api` passed.
- `npm run typecheck --workspace=apps/web` passed.
- `npm run lint --workspace=apps/web` passed.
- `npm run build --workspace=apps/web` passed.
- `git diff --check` passed.

Focused medication-event EDW hydration validation on 2026-06-25:

- `npm run test --workspace=apps/api -- edwHydration.test.ts patientContextRefresh.test.ts vendorAdapters.test.ts` passed 3 files and 58 tests.
- Coverage includes insert/update hydration for `MedicationDispense` and `MedicationAdministration`, backend-services patient-context refresh staging for both resources, vendor adapter regression coverage, and medication-reference fallback into the EDW medication master.
- `npm run typecheck --workspace=apps/api`, `npm run lint --workspace=apps/api`, `npm run build --workspace=apps/api`, `npm run typecheck --workspace=packages/db`, `npm run build --workspace=packages/db`, and `git diff --check` passed. API lint emitted one existing warning in `apps/api/src/routes/admin/identityReview.test.ts`.
- Production `.env.production` migration dry-run passed before deployment with 89 applied migrations and `091_ehr_medication_events.sql` pending; `npm run db:migrate` then applied `091`, and the follow-up dry-run reported 90 applied migrations with no pending migrations.
- `./scripts/deploy-production.sh` passed after commit `e467846`; `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active, and `https://medgnosis.acumenus.net/health` returned healthy.

Focused patient/resource sync-status rollup validation on 2026-06-25:

- `npm run test --workspace=apps/api -- syncStatus.test.ts admin.test.ts` passed 2 files and 40 tests.
- `npm run typecheck --workspace=apps/api` passed.
- `npm run typecheck --workspace=apps/web` passed.
- `npm run lint --workspace=apps/api` passed with one existing warning in `apps/api/src/routes/admin/identityReview.test.ts`.
- `npm run lint --workspace=apps/web` passed.
- `npm run build --workspace=apps/api` passed.
- `npm run build --workspace=apps/web` passed.
- `git diff --check` passed.
- A read-only production service probe against EHR tenant 2 returned 12 resource rows, 7 tracked patients, 7 displayed patient rollups, and no sync issues.
- Commit `25b6f7d` was pushed to `origin/main`; `./scripts/deploy-production.sh` passed; `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active; production migration dry-run reported 90 applied migrations and no pending migrations; and `https://medgnosis.acumenus.net/health` returned healthy.

Focused sync-status drilldown/action validation on 2026-06-25:

- `npm run test --workspace=apps/api -- syncStatus.test.ts admin.test.ts` passed 2 files and 40 tests.
- `npm run typecheck --workspace=apps/api` passed.
- `npm run typecheck --workspace=apps/web` passed.
- `npm run lint --workspace=apps/api` passed with one existing warning in `apps/api/src/routes/admin/identityReview.test.ts`.
- `npm run lint --workspace=apps/web` passed.
- `npm run build --workspace=apps/api` passed.
- `npm run build --workspace=apps/web` passed.
- `git diff --check` passed.
- A read-only production service probe against EHR tenant 2 returned 12 resource rows, 7 tracked patients, 7 displayed patient rollups, 0 conflict targets, 0 stale patient/resource drilldown groups, and no sync issues.
- Commit `ab87e84` was pushed to `origin/main`; `./scripts/deploy-production.sh` passed; `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active; production migration dry-run reported 90 applied migrations and no pending migrations; and `https://medgnosis.acumenus.net/health` returned healthy.

Focused Bulk replay drilldown validation on 2026-06-25:

- `npm run test --workspace=apps/api -- bulkData.test.ts admin.test.ts` passed 2 files and 69 tests.
- `npm run test` passed across API, web, shared, and Solr: API 106 files passed with 795 tests passed and 1 smoke test skipped; web 25 files passed with 42 tests; shared 43 tests; Solr 18 tests.
- `npm run typecheck --workspace=apps/api` passed.
- `npm run typecheck --workspace=apps/web` passed.
- `npm run lint --workspace=apps/api` passed with one existing warning in `apps/api/src/routes/admin/identityReview.test.ts`.
- `npm run lint --workspace=apps/web` passed.
- `npm run build --workspace=apps/api` passed.
- `npm run build --workspace=apps/web` passed.
- `git diff --check` passed.
- A read-only production service probe against EHR tenant 2 returned one completed group Bulk job with 14 polls, 12/12 completed import files, 2,897 rows read/staged, QDM `replayed`, 2,880 QDM resources normalized/events upserted, and no failed-file resume action required.
- Commit `9ba7246` was pushed to `origin/main`; `./scripts/deploy-production.sh` passed; `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active; production migration dry-run reported 90 applied migrations and no pending migrations; and `https://medgnosis.acumenus.net/health` returned healthy.

Focused ingest-run drilldown validation on 2026-06-25:

- `npm run test --workspace=apps/api -- ingestRuns.test.ts admin.test.ts` passed 2 files and 48 tests.
- `npm run test` passed across API, web, shared, and Solr: API 106 files passed with 795 tests passed and 1 smoke test skipped; web 25 files passed with 42 tests; shared 43 tests; Solr 18 tests.
- `npm run typecheck --workspace=apps/api` passed.
- `npm run typecheck --workspace=apps/web` passed.
- `npm run lint --workspace=apps/api` passed with one existing warning in `apps/api/src/routes/admin/identityReview.test.ts`.
- `npm run lint --workspace=apps/web` passed.
- `npm run build --workspace=apps/api` passed.
- `npm run build --workspace=apps/web` passed.
- `git diff --check` passed.
- A read-only production service probe against EHR tenant 2 returned one succeeded Bulk ingest run with 2,897 resources received/staged, QDM `replayed`, 2,880 QDM resources normalized/events upserted, 500 EDW resources hydrated, and no ingest errors.
- Commit `95af0de` was pushed to `origin/main`; `./scripts/deploy-production.sh` passed; `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active; production migration dry-run reported 90 applied migrations and no pending migrations; and `https://medgnosis.acumenus.net/health` returned healthy.

Focused readiness token diagnostics validation on 2026-06-25:

- `npm run test --workspace=apps/api -- readinessEvidence.test.ts admin.test.ts` passed 2 files and 43 tests.
- `npm run test` passed across API, web, shared, and Solr: API 106 files passed with 798 tests passed and 1 smoke test skipped; web 25 files passed with 42 tests; shared 43 tests; Solr 18 tests.
- `npm run typecheck --workspace=apps/api` passed.
- `npm run typecheck --workspace=apps/web` passed.
- `npm run lint --workspace=apps/api` passed with one existing warning in `apps/api/src/routes/admin/identityReview.test.ts`.
- `npm run lint --workspace=apps/web` passed.
- `npm run build --workspace=apps/api` passed.
- `npm run build --workspace=apps/web` passed.
- `git diff --check` passed.
- A read-only production service probe against EHR tenant 2 returned readiness issue codes for missing backend token endpoint, missing discovery, missing Bulk resource capability coverage, expired backend token, and launch not exercised. The same probe returned one enabled backend-services client with ready credentials, `readyForTokenExchange: false`, no token requests in the last 24 hours, an existing latest token timestamp, no active Bulk jobs, no failed Bulk jobs in the last 24 hours, and no enabled Bulk schedules.
- Commit `1c560e0` was pushed to `origin/main`; `./scripts/deploy-production.sh` passed; `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active; production migration dry-run reported 90 applied migrations and no pending migrations; and `https://medgnosis.acumenus.net/health` returned healthy.

Focused EHR sync alert dispatch validation on 2026-06-25:

- `npm run test --workspace=apps/api -- syncAlerts.test.ts systemHealth.test.ts index.test.ts` passed 8 files and 56 tests.
- `npm run test --workspace=apps/web -- SystemHealthTab.test.tsx` passed 1 file and 2 tests.
- `npm run test` passed across API, web, shared, and Solr: API 107 files passed with 804 tests passed and 1 smoke test skipped; web 25 files passed with 43 tests; shared 43 tests; Solr 18 tests.
- `npm run typecheck --workspace=apps/api` passed.
- `npm run typecheck --workspace=apps/web` passed.
- `npm run lint --workspace=apps/api` passed with one existing warning in `apps/api/src/routes/admin/identityReview.test.ts`.
- `npm run lint --workspace=apps/web` passed.
- `npm run build --workspace=apps/api` passed.
- `npm run build --workspace=apps/web` passed.
- `git diff --check` passed.
- Commit `1eba305` added PHI-safe aggregate sync alert snapshots, disabled-by-default webhook dispatch, optional nightly dispatch, webhook signing, System Health alert state, explicit audited manual dispatch, `.env.example` knobs, and the stale-data/Bulk incident runbook.

Focused non-EMPI mutation audit validation on 2026-06-26:

- `npm run test --workspace=apps/api -- src/routes/orders/index.test.ts src/routes/population-finder/index.test.ts src/routes/auth/__tests__/auth.test.ts src/routes/clinical-notes/index.test.ts src/routes/cds-hooks/feedback.test.ts src/routes/admin/index.test.ts src/services/__tests__/problemListService.test.ts` passed 7 files and 136 tests.
- Coverage includes CDS feedback aggregate audit details, admin measure refresh request-helper audit use, generated-order and population-finder PHI-safe audit summaries, and the already hardened auth/session and clinical-note audit details.
- Full follow-up gates passed: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `git diff --check`. Full test summary: API 117 files passed with 901 tests passed and 1 smoke test skipped; web 27 files passed with 47 tests; shared 43 tests; Solr 18 tests.
- Release `0e82fb3` was pushed to `origin/main`, `./scripts/deploy-production.sh` passed, public health returned healthy, `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active, local `HEAD` matched `origin/main`, and production migration dry-run reported 91 applied migrations with none pending.

Focused EHR audit redaction validation on 2026-06-26:

- `npm run test --workspace=apps/api -- src/routes/ehr/admin.test.ts src/routes/ehr/launch.test.ts src/services/ehr/syncAlerts.test.ts src/services/systemHealth.test.ts` passed 4 files and 68 tests.
- Coverage includes backend token-check audit details, Bulk cancel audit details, SMART launch-start and callback-denial audit details, and sync-alert dispatch audit details.
- Full follow-up gates passed: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `git diff --check`. Full test summary: API 117 files passed with 903 tests passed and 1 smoke test skipped; web 27 files passed with 47 tests; shared 43 tests; Solr 18 tests.
- Release `737dfde` was pushed to `origin/main`, `./scripts/deploy-production.sh` passed, public health returned healthy, `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active, local `HEAD` matched `origin/main`, and production migration dry-run reported 91 applied migrations with none pending.

Focused worker/CQL restart runbook validation on 2026-06-26:

- The documented worker commands were checked against `scripts/medgnosis-worker.service`, `scripts/medgnosis-api.service`, `scripts/deploy-production.sh`, and the live service model.
- The documented CQL sidecar commands were checked against `docker-compose.yml`, `docker/cql-engine/README.md`, `scripts/cql-engine-smoke.sh`, `scripts/cql-qdm-smoke.sh`, and `scripts/cql-realmeasure-smoke.sh`.
- `systemctl cat medgnosis-worker`, `systemctl cat medgnosis-api`, `systemctl is-active medgnosis-worker medgnosis-api`, `docker compose --profile cql config --services | rg '^cql-engine$'`, `bash -n scripts/cql-engine-smoke.sh scripts/cql-qdm-smoke.sh scripts/cql-realmeasure-smoke.sh scripts/deploy-production.sh`, and `git diff --check` passed for the docs-only runbook slice.

Focused QRDA/QPP local validation on 2026-06-26:

- `./scripts/qrda-validate.sh` passed local XML structural checks for `apps/api/test-fixtures/quality/qrda-cat1-sample.xml` and `apps/api/test-fixtures/quality/qrda-cat3-sample.xml`; official Cypress CVU+ validation was explicitly skipped because external CVU+ commands were not configured.
- `./scripts/qpp-validate.sh` passed local JSON structural checks for `apps/api/test-fixtures/quality/qpp-submission-sample.json`; official QPP sandbox/API validation was explicitly skipped because `QPP_VALIDATE_CMD` was not configured.
- `npm run test --workspace=apps/api -- src/services/qrda/qrdaCat1.test.ts src/services/qrda/qrdaCat3.test.ts` passed 2 files and 12 tests.

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

Production assessment rechecks for the medication-event release on 2026-06-25:

- Medication-event application release commit `e467846` was pushed to `origin/main` before deployment.
- Patient/resource sync-rollup application release commit `25b6f7d` was pushed to `origin/main` before deployment.
- Sync-status drilldown/action application release commit `ab87e84` was pushed to `origin/main` before deployment.
- Bulk replay drilldown application release commit `9ba7246` was pushed to `origin/main` before deployment.
- Ingest-run drilldown application release commit `95af0de` was pushed to `origin/main` before deployment.
- Readiness token diagnostics application release commit `1c560e0` was pushed to `origin/main` before deployment.
- EHR sync alert dispatch application release commit `1eba305` was pushed to `origin/main` before deployment.
- `set -a; . ./.env.production; set +a; npm run db:migrate:dry-run` reported 90 applied migrations and no pending migrations.
- `https://medgnosis.acumenus.net/health` returned healthy with database up.
- `http://127.0.0.1:3081/health` returned healthy with database up during deploy verification.

## Runtime State at Handoff

Production API:

- Public health endpoint: `https://medgnosis.acumenus.net/health`.
- Local systemd/reverse-proxy target health endpoint: `http://127.0.0.1:3081/health`.
- Both health endpoints returned `{"status":"healthy","version":"1.0.0","services":{"database":"up"}}` during the 2026-06-25 deployment verification.
- `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active after the EHR sync alert dispatch deployment.

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
- Broader patient-context import for remaining resource families when local patient history is absent.
- Production vendor evidence for the audited/rate-limited launch, callback, and handoff lifecycle.
- Vendor sandbox launch simulation into patient detail.

### Patient-Context Sync

Still needed:

- Expand tenant-specific display needs beyond the currently hydrated resource families where pilot workflows require them.
- Normalize any additional staged resource families that become product-critical and do not yet have durable EDW tables.
- Exercise the stale-data/Bulk incident runbook against a live failed-file, stale-data, or sandbox incident and configure an external alert destination.

### Bulk Data Import

Still needed:

- Exercise the replay/dead-letter runbook against a failed-file or sandbox replay incident and add deeper dead-letter dashboard controls.
- Capture vendor evidence for Bulk `deleted` tombstone behavior and edge cases.
- Configure external alert delivery and capture live stale-data/Bulk incident evidence.
- Small approved group export against sandbox/vendor tenant.

### Observability and Audit

Still needed:

- Keep token exchange and FHIR-read failure audit coverage PHI-safe as additional vendor paths are wired.
- Audit FHIR reads by tenant/resource/patient/user.
- Add deeper EHR tenant and SMART launch health drilldowns beyond the current readiness evidence panel.
- FHIR API health dashboard.
- Add deeper Bulk ingestion dashboard drilldowns beyond current job/file/schedule/sync metrics.
- Configure external alert delivery for the current EHR readiness/sync/Bulk and FHIR 401/403/429 spike snapshots.

Now partially covered outside the EHR-specific path:

- QDM bridge run/issue ledgers exist.
- QDM bridge operational status view exists.
- Measure Governance raw evidence drilldown is audited.
- QDM bridge operations runbook exists.
- Worker and CQL sidecar restart runbook exists.

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

Launch/callback/token mechanics, authenticated handoff binding, initial Patient import/crosswalk, bounded staging of patient-context resources, first-pass EDW hydration, automatic QDM replay, queued backend-services refresh with next-link continuation for supported resource pages, bounded patient/resource sync rollups, bounded conflict/stale drilldowns, PHI-safe FHIR/token failure audit summaries, and PHI-safe sync alert snapshots now work in code. The remaining risk is that newly imported launch patients still lack tenant-specific provider attribution, configured external alert delivery, local matching policy, and vendor sandbox proof.

Mitigation:

- Prioritize configured external alert delivery, incident rehearsal, local matching, and patient access policy next.
- Add end-to-end vendor/sandbox launch evidence that opens patient detail.
- Keep Patient import/crosswalk regression tests in the SMART launch suite before production launch work.

### Risk: Bulk Data incomplete after manifest

Bulk kickoff/poll/manifest persistence, NDJSON downloader/importer, optional checksum/size validation, Bulk Patient EMPI/crosswalk seeding, Bulk deleted-output tombstone processing for crosswalk-mapped EDW rows, EDW hydration, QDM replay, recurring schedule enqueueing, admin job/file/schedule status visibility, completed-job import replay, failed-file-only resume, BullMQ retry/dead-letter retention, PHI-safe manual-control audit, PHI-safe automated worker audit, active-job cancellation, bounded patient/resource rollups, bounded conflict/stale drilldowns, PHI-safe FHIR/token failure summaries, PHI-safe sync alert snapshots, and stale-data/Bulk incident runbook now exist, but the path still lacks configured external alert delivery, live incident rehearsal, vendor tombstone edge-case evidence, and vendor sandbox proof.

Mitigation:

- Extend Bulk integration coverage as resume/dead-letter, deleted-output edge cases, patient identity edge cases, and vendor-specific behaviors are proven.
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
   - Extend the bounded callback staging, EDW hydration, QDM replay, and backend-services queue path to any remaining patient-detail resource families required by tenant workflows.
   - Add richer local matching where patient detail needs it, especially provider attribution, medication-event lineage, document/report display grouping, and encounter association.
   - Configure external alert delivery and add admin/clinician-safe error reporting for the current alert summaries.

2. **EHR patient crosswalk and EDW normalization**
   - Keep launch and Bulk Patient crosswalks as routing sources of truth.
   - Keep Bulk Patient hydration behind EMPI so strong identifiers and demographic-review queues prevent avoidable duplicate patients.
   - Continue from the already-covered workspace/document/report/medication-event resources into richer local matching and tenant-specific resource breadth.

3. **SMART user linking and audit**
   - Add EHR `fhirUser` to Medgnosis user linking policy.
   - Extend the implemented SMART lifecycle audit/rate limits with vendor sandbox evidence for completed handoff into patient detail.

4. **Bulk Data operational hardening**
   - Exercise the Bulk replay/dead-letter runbook and add deeper dead-letter dashboard controls.
   - Capture vendor evidence for deleted-output tombstone behavior and extend edge-case coverage when vendors provide it.
   - Add vendor-specific recurring schedule evidence against an approved sandbox.

5. **Admin UI completion**
   - Add UI test for secret redaction/admin-only access.
   - Add incident-tested Bulk replay/dead-letter drilldowns beyond the current tenant readiness, patient rollup, conflict/stale drilldown, Bulk-linked QDM replay, ingest-run detail, EHR sync alerts, and worker failure/overdue-poll metrics.

6. **EHR observability and runbooks**
   - Preserve PHI-safe token/FHIR-read failure audit coverage as new vendor paths are added.
   - Add deeper EHR tenant, SMART launch, FHIR API, and Bulk ingestion health panels.
   - Configure external stuck-job and token-failure alert delivery.

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
- `packages/db/src/backfill-empi.ts`
- `packages/db/src/seed-ehr-sandbox.ts`

## Completion Snapshot

| Area | Status | Notes |
| --- | --- | --- |
| Tenant registry | Mostly complete | Tenant upsert, diagnostics/test-connection, backend-token checks, QDM replay/load actions, patient-context refresh, and Bulk schedule/job controls emit PHI-safe audit rows; production secret-manager policy remains separate hardening |
| Admin onboarding API | Mostly complete | CRUD/upsert/detail/diagnostics/capabilities/test-connection present |
| Admin EHR UI | Partial | Tenant onboarding/readiness evidence, previous-snapshot capability drift, backend credential/token readiness, explicit audited backend token-check action, aggregate Bulk diagnostics, recent ingest-run sync status, selectable PHI-light ingest-run details, worker failure/overdue-poll sync metrics, Bulk job/file/schedule status, Bulk import/QDM replay summaries, linked Bulk QDM replay controls, bounded patient/resource sync rollups, bounded conflict/stale-resource drilldowns, structured sync issue actions, completed-job import replay, failed-import resume, active-job cancel, System Health EHR sync alert dispatch, and FHIR/token failure alert summaries present; incident-tested dead-letter workflows remain |
| SMART discovery | Partial | Works locally with previous-snapshot capability drift evidence; needs HTTPS enforcement and vendor evidence |
| EHR launch | Partial | Launch/callback, lifecycle audit/rate limits, initial Patient import/crosswalk, bounded context staging, first-pass EDW hydration, automatic QDM replay, queued supported patient-context refresh, readiness evidence, sync rollups, conflict/stale drilldowns, FHIR/token failure summaries, alert snapshots, and refresh continuation work; user linking, access attribution, local matching, configured external delivery, and vendor evidence remain |
| Standalone launch | Partial | Route and scope behavior present; end-to-end patient selection evidence pending |
| Token metadata | Mostly complete | Hash-only persistence and readiness-age surfacing present; refresh/reacquisition remains |
| Backend Services | Partial | Token flow, explicit audited token-check endpoint, and PHI-safe backend-token failure audit rows implemented; no real vendor validation |
| FHIR client | Mostly complete | Reads/search/pagination/retry and PHI-safe failed request audit rows for alert summaries present; vendor-specific constraints need expansion |
| Resource staging | Partial | Raw staging, Bulk Patient EMPI hydration, Bulk deleted-output tombstone processing for crosswalk-mapped EDW rows, callback EDW hydration, callback QDM replay, queued supported-resource refresh, first-pass EDW hydration for 17 resource families, bounded patient/resource sync rollups, bounded conflict/stale drilldowns, Bulk-linked QDM replay status, ingest-run operational summaries, and continuation work; local matching, vendor tombstone edge-case evidence, and tenant-specific breadth remain incomplete |
| FHIR/QDM bridge | Mostly complete for scoped milestone | QDM spine, FHIR crosswalk, CQL shadow, reconciliation, semantic drift, and ops ledger present |
| Measure governance | Partial | Admin tab and audited evidence drilldown present; CMS122 promotion remains governance-blocked |
| CDS Hooks auth | Partial | JWT/JWKS validation present; production governance incomplete |
| Bulk Data | Partial | Kickoff/poll/manifest ledger, manual/admin kickoff, tenant recurring schedules, worker polling/import orchestration, PHI-safe automated worker audit, file-level import ledger, completed-manifest NDJSON import worker, completed-job import replay, failed-import resume, active-job cancel, optional checksum/size validation, Bulk deleted-output tombstone processing for crosswalk-mapped EDW rows, Bulk Patient EMPI/crosswalk seeding, manual-control audit, EDW hydration, QDM replay, Bulk import/QDM replay summaries, linked QDM replay controls, readiness diagnostics, bounded patient/resource rollups, bounded conflict/stale drilldowns, FHIR/token failure alert summaries, replay/dead-letter runbook, EHR sync alert runbook, and admin status UI present; vendor tombstone edge-case evidence, configured external delivery, incident rehearsal, and vendor sandbox evidence remain |
| Epic readiness | Early | Requires real app registration and sandbox validation |
| Oracle Cerner readiness | Early | Requires Code Console registration and sandbox validation |
| Observability/runbooks | Partial | QDM bridge runbook, worker/CQL sidecar restart runbook, QRDA/QPP validation runbook, EHR Bulk replay/dead-letter runbook, EHR sync alerts/stale-data runbook, bridge ops ledgers, System Health worker/queue plus EHR Bulk readiness visibility, System Health EHR sync alert dispatch, tenant readiness capability/backend/Bulk diagnostics, FHIR/token failure alert summaries, and structured sync issue actions exist; deeper EHR launch/FHIR/CQL/DEQM dashboards, configured external alert delivery, and incident rehearsal evidence remain |

Overall: the local platform can support the next engineering slices without needing vendor credentials, and the FHIR/QDM bridge now gives staged FHIR evidence a governed analytics path. Actual Epic/Cerner readiness still requires external sandbox and customer onboarding work.
