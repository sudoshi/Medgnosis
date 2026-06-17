# Medgnosis EHR Integration Devlog - Current State

**Date:** 2026-06-17  
**Scope:** Epic, Oracle Cerner, SMART Health IT, generic SMART/FHIR, CDS Hooks, Backend Services, and Bulk Data integration work  
**Repository:** `/home/smudoshi/Github/Medgnosis`  
**Primary plan:** `docs/superpowers/plans/2026-06-16-ehr-integration-implementation-plan.md`

## Executive Summary

Medgnosis now has the foundation of a vendor-neutral EHR integration platform. The local platform supports tenant/client registration, SMART discovery diagnostics, SMART EHR launch, standalone SMART launch, callback/token exchange, hashed token metadata persistence, FHIR client reads/searches with retry and pagination, CDS Hooks `fhirAuthorization` validation, SMART Backend Services token acquisition, local SMART Health IT sandbox seeding and smoke tests, an admin EHR Integrations UI, and a first Bulk Data job ledger plus kickoff/poll/manifest parsing service.

The work is still uncommitted and the worktree is intentionally dirty because the broader EHR implementation spans many new files, migrations, scripts, and route/service modules. Root validation gates are currently passing. Migration 067 was applied locally, and `db:migrate:list` reported no pending migrations after application.

Current completion estimate:

- **Full Epic/Cerner/other-EHR program:** about 55 percent complete.
- **Local vendor-neutral platform:** about 80 percent complete.
- **Epic/Cerner production onboarding:** still low, roughly 20-25 percent, because vendor credentials, app registration, sandbox launch evidence, customer scope approval, patient-context sync, monitoring, runbooks, and go-live artifacts remain external or incomplete.

## Current Worktree State

The repository is not clean. The EHR integration tranche is spread across tracked modifications and untracked new files.

Tracked files currently modified include:

- `.env.example`
- `package.json`
- `package-lock.json`
- `turbo.json`
- `apps/api/package.json`
- `apps/api/src/config.ts`
- `apps/api/src/routes/cds-hooks/feedback.ts`
- `apps/api/src/routes/cds-hooks/index.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/services/fhir/capabilityStatement.ts`
- `apps/web/src/pages/AdminPage.tsx`
- `apps/web/src/pages/admin/helpers.tsx`
- `apps/web/src/pages/admin/types.ts`
- `apps/web/src/stores/announcer.ts`
- `apps/web/src/stores/announcer.test.ts`
- `packages/db/package.json`
- `packages/db/src/migrate.ts`

New untracked EHR integration files include:

- `apps/api/src/routes/ehr/`
- `apps/api/src/scripts/`
- `apps/api/src/services/cds/fhirAuthorization.ts`
- `apps/api/src/services/cds/fhirAuthorization.test.ts`
- `apps/api/src/services/ehr/`
- `apps/web/src/pages/admin/EhrIntegrationsTab.tsx`
- `docs/superpowers/plans/2026-06-16-ehr-integration-implementation-plan.md`
- `packages/db/migrations/060_ehr_tenant_registry.sql`
- `packages/db/migrations/061_ehr_resource_crosswalk.sql`
- `packages/db/migrations/063_ehr_ingest_runs.sql`
- `packages/db/migrations/064_smart_launch_sessions.sql`
- `packages/db/migrations/065_smart_launch_pkce.sql`
- `packages/db/migrations/066_ehr_workbook_metadata.sql`
- `packages/db/migrations/067_ehr_bulk_jobs.sql`
- `packages/db/src/seed-ehr-sandbox.ts`

No commit has been created for this tranche.

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
- Redirects to the app `return_to` URL with `smart_session_id` when supplied.

Important remaining gaps:

- `iss` is accepted but still needs strict validation against tenant issuer/FHIR base URL.
- ID token validation is still incomplete.
- Callback does not yet establish a first-class Medgnosis application session bound to SMART context.
- EHR user linking and patient crosswalk/import are not complete.
- Patient-context sync is not queued after launch yet.

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

- EDW normalization from staged resources to `phm_edw.patient`, `encounter`, `condition`, `observation`, medications, allergies, procedures, immunizations, and document references is not complete.
- Crosswalk creation is partially scaffolded but not yet a full normalization contract.
- Data-quality issue rows for unmapped codes/units/statuses remain to be implemented.
- Patient-context sync is not yet wired after SMART launch.

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

A first Bulk Data foundation is implemented. This is intentionally an auditable job boundary, not yet a full NDJSON downloader/importer.

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

Known remaining gaps:

- No scheduler/worker polls jobs automatically yet.
- Polling is not yet exponential/backoff-managed by a queue.
- NDJSON download is not implemented.
- Content type and line-level NDJSON validation are not implemented.
- Staging/normalization from Bulk output is not implemented.
- Local mock Bulk server integration test remains to be added.
- No real Epic/Cerner Bulk Data sandbox job has been run.

Key implementation files:

- `packages/db/migrations/067_ehr_bulk_jobs.sql`
- `apps/api/src/services/ehr/bulkData.ts`
- `apps/api/src/services/ehr/bulkData.test.ts`

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

Known UI gaps:

- No dedicated UI test yet for admin-only EHR visibility or secret redaction.
- Last sync display is not complete because patient-context sync and scheduled ingestion are not complete.
- Bulk job status UI is not implemented.
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

## Database State

New migrations in the EHR tranche:

- `060_ehr_tenant_registry.sql`
- `061_ehr_resource_crosswalk.sql`
- `063_ehr_ingest_runs.sql`
- `064_smart_launch_sessions.sql`
- `065_smart_launch_pkce.sql`
- `066_ehr_workbook_metadata.sql`
- `067_ehr_bulk_jobs.sql`

Local database status:

- Migration 067 was applied successfully.
- `db:migrate:list` reported 67 applied migrations and no pending migrations.
- The migration runner still reports one historical applied migration no longer present on disk: `029_solr_cdc_triggers`. This predates the EHR tranche and was not modified here.

CLI note:

- The local `.env` uses `host.docker.internal` for `DATABASE_URL`.
- Host shell DB commands in this checkout require a CLI-only host override to `127.0.0.1`.
- Do not commit local DB URL modifications unless deliberately changing environment policy.

## Validation Evidence

Latest root gates passed after the admin endpoint alias additions:

- `npm run typecheck`
- `npm run test`
- `npm run lint`
- `npm run build`
- `git diff --check`

Latest full test summary:

- API: 70 test files passed, 1 skipped; 427 tests passed, 1 skipped.
- Web: 24 test files passed; 41 tests passed.
- Shared: 1 test file passed; 37 tests passed.
- Solr: 2 test files passed; 18 tests passed.
- Turbo task summary: all requested tasks successful.

Focused tests run during this tranche:

- `apps/api/src/routes/ehr/admin.test.ts`
- `apps/api/src/routes/ehr/launch.test.ts`
- `apps/api/src/routes/ehr/launch.integration.test.ts`
- `apps/api/src/services/ehr/smartLaunch.test.ts`
- `apps/api/src/services/ehr/bulkData.test.ts`

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

## Runtime State at Handoff

Local API:

- Running detached on `http://127.0.0.1:3002`.
- Health check returned HTTP 200.
- Redis DNS was unavailable in local dev startup, so WebSocket broadcast degraded gracefully.
- Solr health was unavailable in local dev startup, so API fell back to PostgreSQL.

Local web:

- Existing Vite/web surface is available on `http://127.0.0.1:5175`.
- `/admin` returned HTTP 200.
- EHR Integrations tab is accessible through the Admin Panel for admin users.

Security note:

- A first detached API startup briefly exposed the local DB URL in the process command line. That process group was terminated and restarted using a safer shell form that computes the DB URL inside the detached shell. Current process listing no longer exposes the local DB URL from the Medgnosis API command.

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

- Strict `iss` validation.
- ID token validation.
- User linking between EHR user and Medgnosis user.
- Patient crosswalk from EHR patient ID to `phm_edw.patient`.
- Patient-context import when local patient is absent.
- Medgnosis app session establishment bound to SMART context.
- Best-page routing after launch.
- End-to-end launch simulation into patient detail.

### Patient-Context Sync

Still needed:

- Queue patient-context sync after SMART callback.
- Fetch and stage `Patient` first.
- Fetch recent `Encounter`.
- Fetch active/recent pilot resources: `Condition`, `Observation`, `MedicationRequest`, allergies, procedures, immunizations.
- Normalize staged resources into EDW tables.
- Record sync status.
- Show sync status and stale-data warnings in the UI.

### Bulk Data Import

Still needed:

- Polling worker/queue.
- Exponential or vendor-safe polling schedule.
- NDJSON download after completion.
- NDJSON content type validation.
- Line-level FHIR JSON validation.
- Staging by resource type.
- Resume/replay path.
- Admin UI for job status and errors.
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

### Clinical Safety and Governance

Still needed:

- Production CDS auth policy.
- CDS card governance: interruptive policy, override reasons, duplicate suppression, action/systemAction rules.
- Customer/clinical review of care-gap text and workflows.
- Legal/security review for PHI flows, retention, BAA/customer contracts.
- Explicit no-writeback default and future writeback feature flags.

## Current Risk Register

### Risk: Overstating vendor readiness

The platform is locally strong, but real Epic/Cerner readiness is not achieved until vendor sandbox launch, token, patient read, and Bulk flows are completed.

Mitigation:

- Keep implementation plan checkboxes conservative.
- Keep live SMART Health IT evidence separate from Epic/Cerner evidence.
- Do not mark vendor go-live tasks complete until portal/customer validation exists.

### Risk: SMART launch context not yet connected to patient workspace

Launch/callback/token mechanics work, but patient crosswalk and local session binding remain incomplete.

Mitigation:

- Prioritize patient-context sync next.
- Add end-to-end synthetic launch that opens patient detail.
- Add patient crosswalk tests before production launch work.

### Risk: Bulk Data incomplete after manifest

Bulk kickoff/poll/manifest persistence exists, but no downloader/importer exists yet.

Mitigation:

- Implement NDJSON download and validation next.
- Stage files through existing resource staging.
- Keep Bulk Data explicitly for bootstrap/group use cases, not low-latency UI sync.

### Risk: Secrets and tokens

The code avoids returning raw secret refs and persists token hashes only, but production secret management and key rotation are not complete.

Mitigation:

- Keep using refs such as `env:` or future secret-manager refs.
- Add key rotation runbook.
- Add manual secret leakage review before any PR/merge.

## Recommended Next Development Sequence

1. **Patient-context sync after SMART callback**
   - Add a sync job/service that takes SMART launch context and fetches/stages `Patient`, `Encounter`, `Condition`, `Observation`, and `MedicationRequest`.
   - Add sync status persistence and admin/clinician-safe error reporting.

2. **EHR patient crosswalk and EDW normalization**
   - Map EHR patient IDs to local `phm_edw.patient`.
   - Implement Patient and Encounter normalization first.
   - Add Observation and Condition next because they drive care gaps and clinical summary value.

3. **Strict SMART security**
   - Validate `iss`.
   - Validate ID token when returned.
   - Add SMART session binding and user linking flow.

4. **Bulk Data downloader/importer**
   - Download NDJSON only after completed manifest.
   - Validate content type and line-level FHIR JSON.
   - Stage each resource through `resourceStaging.ts`.
   - Add local mock Bulk server integration test.

5. **Admin UI completion**
   - Add UI test for secret redaction/admin-only access.
   - Add Bulk job status panel.
   - Add last sync and resource-level sync errors.

6. **Epic/Cerner vendor readiness**
   - Use onboarding profiles to register real sandbox apps.
   - Validate Epic and Oracle Cerner launch/callback/token flows.
   - Validate patient-context reads.
   - Validate system-token flow where approved.
   - Capture evidence and update plan checkboxes only after real validation.

## Current File Landmarks

Planning:

- `docs/superpowers/plans/2026-06-16-ehr-integration-implementation-plan.md`

Admin API:

- `apps/api/src/routes/ehr/admin.ts`
- `apps/api/src/routes/ehr/admin.test.ts`

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
- `packages/db/migrations/067_ehr_bulk_jobs.sql`

Resource staging:

- `apps/api/src/services/ehr/resourceStaging.ts`
- `apps/api/src/services/ehr/ingestRuns.ts`

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
- `packages/db/src/seed-ehr-sandbox.ts`

## Completion Snapshot

| Area | Status | Notes |
| --- | --- | --- |
| Tenant registry | Mostly complete | Needs production secret-manager policy and audit logs |
| Admin onboarding API | Mostly complete | CRUD/upsert/detail/diagnostics/capabilities/test-connection present |
| Admin EHR UI | Partial | Tenant onboarding/readiness present; Bulk/sync status missing |
| SMART discovery | Partial | Works locally; needs HTTPS enforcement, hash/drift detection |
| EHR launch | Partial | Launch/callback works; patient session/linking/sync incomplete |
| Standalone launch | Partial | Route and scope behavior present; end-to-end patient selection evidence pending |
| Token metadata | Mostly complete | Hash-only persistence present; refresh/reacquisition remains |
| Backend Services | Partial | Token flow implemented; no real vendor validation |
| FHIR client | Mostly complete | Reads/search/pagination/retry present; vendor-specific constraints need expansion |
| Resource staging | Partial | Raw staging works; normalization incomplete |
| CDS Hooks auth | Partial | JWT/JWKS validation present; production governance incomplete |
| Bulk Data | Early partial | Kickoff/poll/manifest ledger present; no download/import worker |
| Epic readiness | Early | Requires real app registration and sandbox validation |
| Oracle Cerner readiness | Early | Requires Code Console registration and sandbox validation |
| Observability/runbooks | Not complete | Dashboards, alerts, audit lifecycle, runbooks remain |

Overall: the local platform can support the next engineering slices without needing vendor credentials, but actual Epic/Cerner readiness requires external sandbox and customer onboarding work.
