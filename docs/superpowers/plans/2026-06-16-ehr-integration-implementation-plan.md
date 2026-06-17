# EHR Integration Implementation Plan - Epic, Oracle Cerner, and Other EHRs

> **For agentic workers:** Use the existing Medgnosis TDD pattern. Steps use checkbox (`- [ ]`) syntax. Keep changes additive, scoped, and validated against sandbox EHRs before production tenant enablement.

**Goal.** Make Medgnosis a repeatable, standards-first EHR-integrated application for Epic, Oracle Cerner, and other FHIR-capable EHRs. The integration must support embedded clinician workflows, CDS interventions, population-health ingestion, quality-measure exchange, and legacy event feeds without fragmenting into vendor-specific one-off implementations.

**Core strategy.** Build one vendor-neutral EHR integration platform inside Medgnosis, then supply vendor adapters for Epic, Oracle Cerner, SMART Health IT, HAPI/Smile/Health Gorilla style FHIR servers, and site-specific interface engines. The primary standards are SMART App Launch, SMART Backend Services, HL7 FHIR R4/US Core/QI-Core, CDS Hooks 2.0.1, Bulk Data Access, Da Vinci DEQM, QRDA fallback, and HL7 v2 only where FHIR cannot supply the operational signal.

**Current Medgnosis baseline.**
- Fastify API, React SPA, PostgreSQL, Redis, BullMQ workers, Solr search acceleration.
- EDW schema `phm_edw` and analytics schema `phm_star` already model patients, encounters, conditions, observations, medications, measures, care gaps, alerts, notes, orders, and cohorts.
- FHIR R4 read endpoints already exist for `Patient`, `Condition`, `Observation`, `MedicationRequest`, `Patient/:id/$everything`, `ValueSet/$expand`, `ValueSet/$validate-code`, and clinical reasoning measure operations.
- QI-Core export, CQL evaluation, persisted `MeasureReport`, DEQM Gaps-in-Care, QRDA Cat I/III, and VSAC terminology support already exist.
- CDS Hooks discovery and service handlers exist. A CDS Hooks 2.0.1 feedback table and feedback/burden routes exist, but card hardening, JWT `fhirAuthorization`, SMART launch, and full vendor onboarding are not complete.

**Implementation progress - 2026-06-16.**
- Added tenant/client registry, resource crosswalk, ingest-run, staged-resource, SMART launch-session, and token metadata persistence support.
- Added Epic, Oracle Cerner, SMART Health IT, and generic SMART adapter foundations with SMART discovery diagnostics.
- Added EHR admin diagnostics, SMART EHR launch/callback routing, PKCE/session handling, hashed token metadata storage, and local SMART Health IT sandbox seeding.
- Added FHIR client, pagination/error normalization, resource staging, ingest run tracking, and local smoke coverage using public SMART Health IT data.
- Added CDS Hooks `fhirAuthorization` JWT/JWKS validation and feedback hardening while retaining the shared-secret compatibility path for development.
- Added SMART Backend Services `client_credentials` + `private_key_jwt` token acquisition with runtime-only private-key refs and hashed token metadata persistence.
- Added `/.well-known/jwks.json` publication for backend-services public signing keys via environment-provided public JWKS/JWK.
- Added `npm run ehr:smoke` onboarding smoke harness for tenant registry, SMART discovery, launch-client readiness, JWKS, backend-token, and authenticated FHIR-read checks.
- Added auth-method-aware smoke readiness for SMART launch and Backend Services, including `public_pkce`, `client_secret_basic`, `client_secret_post`, and `private_key_jwt` credential checks.
- Verified SMART Health IT sandbox tenant 1 with live discovery and launch readiness smoke, plus a local API redirect probe to the SMART authorize endpoint.
- Added admin onboarding API support for tenant/client registration upsert, sanitized tenant detail/readiness reporting, and persisted capability snapshots from diagnostics runs.
- Added synthetic SMART route integration coverage for launch initiation through callback/token exchange without raw token persistence.
- Added an explicit standalone SMART launch route that requests `launch/patient` and reuses the callback/token path.
- Added an admin EHR Integrations UI for tenant onboarding, tenant filters, readiness details, and diagnostics execution.
- Added Bulk Data job ledger migration 067 plus kickoff, polling, manifest parsing, and PHI-safe job metadata persistence service coverage.
- Added admin discovery/capabilities/test-connection route aliases for persisted capability snapshots and operator diagnostics.
- Verified with `npm run typecheck`, `npm run test`, `npm run lint`, `npm run build`, and `git diff --check`.

---

## Guiding Principles

- **Standards first, vendor adapters second.** Avoid Epic-only or Cerner-only domain logic except where a vendor has specific registration, launch, scope, paging, or `OperationOutcome` behavior.
- **No app-user auth regression.** SMART authorization is a separate EHR/FHIR authorization surface. Do not alter the existing Medgnosis login, registration, refresh, MFA, temporary-password, or `must_change_password` behavior.
- **Least privilege scopes.** Prefer explicit scopes over wildcards. Use `patient/*.rs` only for patient-context launch and explicit `system/{Resource}.rs` scopes for backend jobs.
- **Tenant isolation.** Every EHR tenant/site must have independent client IDs, JWKS/keys, launch URLs, webhook/CDS configuration, data-retention rules, and audit boundaries.
- **FHIR source-of-truth preservation.** Store original source system IDs and raw resource snapshots where useful. Normalize into `phm_edw`, but keep enough provenance to reconcile with the EHR.
- **Bounded ingestion.** Never scan billion-row clinical tables or EHR-wide exports casually. Use `_type`, `_typeFilter`, date bounds, group scope, patient scope, pagination, backoff, and hard timeouts.
- **Clinical safety.** CDS cards must be explainable, suppressible, measurable, and auditable. Defaults should avoid interruptive alerts unless severity and evidence justify interruption.
- **Production integration is a program, not an endpoint.** Each EHR customer needs security review, tenant registration, sandbox validation, implementation workbook, go-live runbook, support process, and monitoring.

---

## Target Integration Surface

| Capability | Standard / mechanism | Primary use in Medgnosis | Vendor notes |
|---|---|---|---|
| Embedded clinician app | SMART App Launch, EHR launch, PKCE | Launch Medgnosis inside Epic/Cerner with patient, encounter, and user context | Register launch URL and redirect URI per vendor tenant |
| Standalone clinician app | SMART standalone launch | User starts in Medgnosis and selects/searches patient through EHR authorization | Useful for non-embedded deployments |
| Backend ingestion | SMART Backend Services, private_key_jwt/client credentials | Nightly or scheduled FHIR pulls, Bulk Data kickoffs, quality jobs | Use per-tenant system app registration |
| Patient-context data reads | FHIR R4, US Core, QI-Core where applicable | Pull demographics, encounters, conditions, labs, meds, procedures, immunizations, allergies, documents | Normalize vendor-specific gaps into EDW |
| Population bootstrap | FHIR Bulk Data Access | Initial load, targeted rosters, periodic small/medium cohorts | Not a low-latency incremental sync |
| Real-time workflow CDS | CDS Hooks 2.0.1 | patient-view, order-select, order-sign care-gap and problem-list suggestions | Feedback loop required for alert burden governance |
| Quality exchange | DEQM, MeasureReport, $care-gaps, QRDA fallback | Payer/provider quality reporting, care-gap exchange, eCQM evidence | Medgnosis already has DEQM/QRDA foundations |
| Legacy events | HL7 v2 ADT/ORM/ORU/SIU via interface engine | Incremental admissions, discharges, order/result events where FHIR events are unavailable | Keep optional and mapped into the same ingestion bus |
| Auth and audit | SMART/OAuth, JWT/JWKS, tenant audit logs | Per-tenant access control, PHI audit, traceability | Do not mix EHR tokens with app-user JWTs |

---

## Proposed Architecture

### Runtime Components

1. **EHR Tenant Registry**
   - Stores each customer EHR environment, vendor, FHIR base URL, SMART configuration, app registrations, scopes, key material references, enabled resources, CDS services, and operational status.
   - Lives in Postgres, with secrets stored through environment/secret-manager indirection rather than raw database plaintext.

2. **SMART Authorization Layer**
   - Supports EHR launch, standalone launch, authorization code + PKCE, backend services, JWKS/private-key JWT, token refresh, and token introspection where available.
   - Produces Medgnosis-internal `EhrSession` and `FhirAccessToken` records separate from app-user JWT auth.

3. **FHIR Client and Vendor Adapter Layer**
   - Vendor-neutral FHIR client handles search/read/batch, pagination, `_include`, `_revinclude` where supported, retry/backoff, rate limits, `OperationOutcome`, and resource validation.
   - Vendor adapters customize endpoint discovery, scope names, search constraints, patient/encounter context quirks, bulk support, and error normalization.

4. **Ingestion and Normalization Pipeline**
   - Pulls FHIR resources into an immutable staging table, maps to source-crosswalk tables, then upserts normalized rows into `phm_edw`.
   - Emits downstream jobs for measure recalculation, care-gap detection, Solr reindex, rules evaluation, and alert generation.

5. **CDS Hooks Service Layer**
   - Public discovery at `/cds-services`.
   - Authenticated service POSTs for `patient-view`, `order-select`, `order-sign`.
   - Feedback route for accepted/overridden outcomes, alert-burden analytics, and suppression policy.

6. **Quality Exchange Layer**
   - Exposes `MeasureReport`, `$evaluate-measure`, `$care-gaps`, DEQM Gaps-in-Care bundles, QRDA Cat I/III, and QPP JSON where needed.
   - Connects to existing CQL engine, EDW-to-QI-Core projection, and measure reconciliation services.

7. **Operations Console**
   - Admin UI for tenant setup, SMART metadata discovery, launch testing, scope grants, last sync status, bulk job status, CDS traffic, alert burden, and data-quality exceptions.

---

## Data Model Plan

### Migration 060 or next available - EHR tenant registry

Create:
- `phm_edw.ehr_tenant`
  - `id BIGSERIAL PRIMARY KEY`
  - `org_id INTEGER NULL`
  - `vendor VARCHAR(40) NOT NULL` (`epic`, `oracle_cerner`, `smart_generic`, `hapi`, `other`)
  - `name VARCHAR(200) NOT NULL`
  - `environment VARCHAR(40) NOT NULL` (`sandbox`, `staging`, `production`)
  - `fhir_base_url TEXT NOT NULL`
  - `smart_config_url TEXT`
  - `issuer TEXT`
  - `audience TEXT`
  - `status VARCHAR(40) NOT NULL DEFAULT 'draft'`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

- `phm_edw.ehr_client_registration`
  - `id BIGSERIAL PRIMARY KEY`
  - `ehr_tenant_id BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id)`
  - `client_type VARCHAR(40) NOT NULL` (`smart_launch`, `backend_services`, `cds_hooks`)
  - `client_id VARCHAR(300) NOT NULL`
  - `client_secret_ref TEXT`
  - `jwks_url TEXT`
  - `private_key_ref TEXT`
  - `redirect_uris JSONB NOT NULL DEFAULT '[]'::jsonb`
  - `launch_url TEXT`
  - `scopes_requested TEXT NOT NULL DEFAULT ''`
  - `scopes_granted TEXT NOT NULL DEFAULT ''`
  - `enabled BOOLEAN NOT NULL DEFAULT false`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

- `phm_edw.ehr_capability_snapshot`
  - `id BIGSERIAL PRIMARY KEY`
  - `ehr_tenant_id BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id)`
  - `smart_configuration JSONB`
  - `capability_statement JSONB`
  - `resource_support JSONB NOT NULL DEFAULT '{}'::jsonb`
  - `captured_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Indexes:
- `(vendor, environment, status)`
- `(ehr_tenant_id, client_type)`
- `(ehr_tenant_id, captured_at DESC)`

### Migration 061 - EHR identity crosswalk and provenance

Create:
- `phm_edw.ehr_resource_crosswalk`
  - `id BIGSERIAL PRIMARY KEY`
  - `ehr_tenant_id BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id)`
  - `resource_type VARCHAR(80) NOT NULL`
  - `ehr_resource_id VARCHAR(300) NOT NULL`
  - `ehr_identifier JSONB NOT NULL DEFAULT '[]'::jsonb`
  - `local_table VARCHAR(120)`
  - `local_id BIGINT`
  - `patient_id INTEGER`
  - `source_version_id VARCHAR(200)`
  - `source_last_updated TIMESTAMPTZ`
  - `hash VARCHAR(128)`
  - `last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

- `phm_edw.fhir_ingest_staging`
  - `id BIGSERIAL PRIMARY KEY`
  - `ehr_tenant_id BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id)`
  - `ingest_run_id UUID NOT NULL`
  - `resource_type VARCHAR(80) NOT NULL`
  - `resource_id VARCHAR(300)`
  - `patient_ref VARCHAR(300)`
  - `resource JSONB NOT NULL`
  - `source_last_updated TIMESTAMPTZ`
  - `normalized BOOLEAN NOT NULL DEFAULT false`
  - `normalization_error TEXT`
  - `received_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Indexes:
- Unique `(ehr_tenant_id, resource_type, ehr_resource_id)` on crosswalk.
- `(ehr_tenant_id, patient_id, resource_type)`
- `(ingest_run_id, normalized)`
- `(ehr_tenant_id, resource_type, source_last_updated)`

### Migration 062 - SMART sessions and token metadata

Create:
- `phm_edw.smart_launch_session`
  - `id UUID PRIMARY KEY`
  - `ehr_tenant_id BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id)`
  - `state_hash VARCHAR(128) NOT NULL`
  - `nonce_hash VARCHAR(128)`
  - `code_challenge VARCHAR(256)`
  - `code_challenge_method VARCHAR(20)`
  - `launch_context JSONB NOT NULL DEFAULT '{}'::jsonb`
  - `requested_scopes TEXT NOT NULL`
  - `granted_scopes TEXT`
  - `ehr_user_ref VARCHAR(300)`
  - `ehr_patient_ref VARCHAR(300)`
  - `ehr_encounter_ref VARCHAR(300)`
  - `local_user_id INTEGER`
  - `local_patient_id INTEGER`
  - `expires_at TIMESTAMPTZ NOT NULL`
  - `completed_at TIMESTAMPTZ`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

- `phm_edw.ehr_token_grant`
  - `id BIGSERIAL PRIMARY KEY`
  - `ehr_tenant_id BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id)`
  - `grant_type VARCHAR(80) NOT NULL`
  - `subject_type VARCHAR(40) NOT NULL` (`user`, `system`)
  - `ehr_user_ref VARCHAR(300)`
  - `ehr_patient_ref VARCHAR(300)`
  - `scope TEXT NOT NULL`
  - `access_token_hash VARCHAR(128) NOT NULL`
  - `refresh_token_ref TEXT`
  - `expires_at TIMESTAMPTZ`
  - `revoked_at TIMESTAMPTZ`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Never store raw access tokens unencrypted in application tables. If persistence is required, store through a secret manager or encrypted-at-rest field with key rotation.

### Migration 063 - Ingestion runs and jobs

Create:
- `phm_edw.ehr_ingest_run`
  - `id UUID PRIMARY KEY`
  - `ehr_tenant_id BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id)`
  - `mode VARCHAR(60) NOT NULL` (`launch_prefetch`, `patient_sync`, `bulk_group`, `bulk_patient`, `hl7v2_event`, `manual_replay`)
  - `status VARCHAR(40) NOT NULL`
  - `resource_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`
  - `patient_count INTEGER`
  - `resource_count INTEGER`
  - `started_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `finished_at TIMESTAMPTZ`
  - `error TEXT`
  - `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`

- `phm_edw.ehr_bulk_job`
  - `id BIGSERIAL PRIMARY KEY`
  - `ehr_tenant_id BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id)`
  - `ingest_run_id UUID REFERENCES phm_edw.ehr_ingest_run(id)`
  - `bulk_request_url TEXT NOT NULL`
  - `content_location TEXT`
  - `status VARCHAR(40) NOT NULL`
  - `requested_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`
  - `type_filter TEXT`
  - `group_id VARCHAR(300)`
  - `patient_id VARCHAR(300)`
  - `last_poll_at TIMESTAMPTZ`
  - `next_poll_at TIMESTAMPTZ`
  - `expires_at TIMESTAMPTZ`
  - `manifest JSONB`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Migration 064 - Legacy event feed tracking

Create only if a pilot requires HL7 v2:
- `phm_edw.ehr_legacy_event`
  - `id BIGSERIAL PRIMARY KEY`
  - `ehr_tenant_id BIGINT NOT NULL REFERENCES phm_edw.ehr_tenant(id)`
  - `feed_type VARCHAR(40) NOT NULL` (`adt`, `oru`, `orm`, `siu`)
  - `message_control_id VARCHAR(200)`
  - `event_type VARCHAR(40)`
  - `patient_identifier JSONB`
  - `message_hash VARCHAR(128) NOT NULL`
  - `raw_ref TEXT`
  - `mapped_resource_type VARCHAR(80)`
  - `mapped_local_id BIGINT`
  - `processed_at TIMESTAMPTZ`
  - `error TEXT`
  - `received_at TIMESTAMPTZ NOT NULL DEFAULT now()`

---

## API and Service Layout

### New backend modules

Create:
- `apps/api/src/services/ehr/tenantRegistry.ts`
- `apps/api/src/services/ehr/smartDiscovery.ts`
- `apps/api/src/services/ehr/smartLaunch.ts`
- `apps/api/src/services/ehr/backendServices.ts`
- `apps/api/src/services/ehr/fhirClient.ts`
- `apps/api/src/services/ehr/vendorAdapters/index.ts`
- `apps/api/src/services/ehr/vendorAdapters/epic.ts`
- `apps/api/src/services/ehr/vendorAdapters/oracleCerner.ts`
- `apps/api/src/services/ehr/vendorAdapters/genericSmart.ts`
- `apps/api/src/services/ehr/resourceNormalize.ts`
- `apps/api/src/services/ehr/bulkData.ts`
- `apps/api/src/services/ehr/ingestRuns.ts`
- `apps/api/src/services/ehr/tokenStore.ts`
- `apps/api/src/services/ehr/operationOutcome.ts`
- `apps/api/src/services/ehr/scopePolicy.ts`
- `apps/api/src/services/ehr/__tests__/*.test.ts`

Create routes:
- `apps/api/src/routes/ehr/admin.ts`
- `apps/api/src/routes/ehr/smart.ts`
- `apps/api/src/routes/ehr/launch.ts`
- `apps/api/src/routes/ehr/sync.ts`
- `apps/api/src/routes/ehr/index.ts`

Mount:
- `/.well-known/smart-configuration` for Medgnosis as a FHIR server if external clients call Medgnosis.
- `/api/ehr/admin/*` for tenant setup and diagnostics.
- `/api/ehr/sync/*` for authenticated internal sync controls.
- `/ehr/launch/:tenantKey` or `/api/ehr/launch/:tenantKey` as the SMART launch URL registered with EHR vendors.
- `/ehr/callback/:tenantKey` as the SMART redirect URI.

### Existing modules to extend

Modify:
- `apps/api/src/config.ts`
  - Add EHR/SMART/CDS config keys, but keep app-user auth unchanged.
- `apps/api/src/routes/index.ts`
  - Mount EHR routes.
- `apps/api/src/routes/fhir/index.ts`
  - Add SMART token/scope enforcement for external clients.
  - Preserve existing app JWT auth for internal Medgnosis users.
- `apps/api/src/routes/cds-hooks/index.ts`
  - Finish CDS Hooks 2.0.1 card hardening and authenticated `fhirAuthorization`.
- `apps/api/src/routes/cds-hooks/feedback.ts`
  - Move shared-secret-only auth behind compatibility config and add JWT path.
- `apps/api/src/services/fhir/capabilityStatement.ts`
  - Advertise supported interactions and operations accurately.
- `apps/api/src/services/fhir/mappers.ts`
  - Add resource imports from EHR FHIR into EDW-friendly normalized rows where not already covered.

---

## Configuration Plan

Add to `.env.example`:

```env
# EHR integration
EHR_INTEGRATION_ENABLED=false
EHR_PUBLIC_BASE_URL=http://localhost:3002
EHR_SMART_STATE_SECRET=
EHR_TOKEN_ENCRYPTION_KEY_REF=

# Medgnosis as SMART/FHIR server
SMART_AUTH_ENABLED=false
SMART_ISSUER=http://localhost:3002/api/fhir
SMART_AUTHORIZATION_URL=http://localhost:3002/smart/authorize
SMART_TOKEN_URL=http://localhost:3002/smart/token
SMART_JWKS_URL=http://localhost:3002/smart/jwks.json
SMART_SIGNING_KEY_REF=

# EHR client defaults
EHR_DEFAULT_TIMEOUT_MS=30000
EHR_DEFAULT_PAGE_LIMIT=100
EHR_DEFAULT_RETRY_ATTEMPTS=3
EHR_BULK_POLL_MIN_SECONDS=600
EHR_BULK_POLL_MAX_SECONDS=1800

# CDS Hooks production auth
CDS_FHIR_AUTH_REQUIRED=false
CDS_SHARED_SECRET_COMPAT=true
CDS_JWKS_CACHE_TTL_SECONDS=300
```

Config rules:
- Production must set `EHR_INTEGRATION_ENABLED=true` only after tenant registry migrations and secret references are configured.
- Production CDS service POSTs must require JWT `fhirAuthorization` or a site-approved shared-secret fallback with an expiration plan.
- Token/key config values should be references, not raw private keys, wherever possible.

---

## Implementation Epics

## Epic 0 - Discovery, Gap Audit, and Safety Baseline

**Goal.** Confirm what Medgnosis already supports, what each target vendor supports, and what must be built before the first sandbox launch.

**Files:** docs only plus tests for existing endpoints if gaps are found.

- [ ] Inventory current FHIR endpoints and compare to target resources: `Patient`, `Encounter`, `Condition`, `Observation`, `MedicationRequest`, `MedicationStatement`, `AllergyIntolerance`, `Procedure`, `DiagnosticReport`, `Immunization`, `DocumentReference`, `CarePlan`, `CareTeam`, `ServiceRequest`, `Practitioner`, `Organization`, `Location`, `Coverage`.
- [ ] Run current FHIR route tests and smoke tests.
- [ ] Verify `CapabilityStatement` accurately advertises only implemented interactions.
- [ ] Confirm existing `measureOps`, DEQM, QRDA, QI-Core export, and CQL evaluator test status.
- [ ] Confirm existing CDS feedback and burden routes are covered by tests and mounted correctly.
- [ ] Produce a per-resource support matrix: `read`, `search`, `create`, `update`, `bulk`, `normalized_to_edw`, `used_by_measures`, `used_by_cds`.
- [ ] Define first pilot scope: recommended `Patient`, `Encounter`, `Condition`, `Observation` labs/vitals, `MedicationRequest`, `AllergyIntolerance`, `Procedure`, `Immunization`, `Practitioner`, `Organization`, `Location`.

**Validation.**
- [ ] `npm run test --workspace=apps/api`
- [ ] `npm run typecheck`
- [ ] `npm run lint`

**Exit criteria.**
- [ ] A documented support matrix exists.
- [ ] No `CapabilityStatement` overclaims.
- [ ] First pilot scope is approved.

---

## Epic 1 - EHR Tenant Registry and Admin Diagnostics

**Goal.** Create the source of truth for all EHR tenants and make tenant setup observable before implementing launch or ingestion.

**Create:** tenant registry services, migrations 060/061, admin routes, tests.

### Task 1.1 - Tenant registry schema
- [ ] Write failing migration metadata/checksum tests if available.
- [x] Add `ehr_tenant`, `ehr_client_registration`, `ehr_capability_snapshot`.
- [x] Add `ehr_resource_crosswalk` and `fhir_ingest_staging`.
- [x] Add seed data only for local demo/sandbox tenants, never production tenants.
- [x] Apply migrations locally and verify `_migrations`.

### Task 1.2 - Tenant registry service
- [x] Implement CRUD for tenant records with validation.
- [x] Support `vendor`, `environment`, `fhir_base_url`, `smart_config_url`, `status`.
- [x] Implement app registration record management without exposing secrets in API responses.
- [x] Implement capability snapshot persistence.

### Task 1.3 - Admin diagnostics routes
- [x] `GET /api/ehr/admin/tenants`
- [x] `POST /api/ehr/admin/tenants`
- [x] `GET /api/ehr/admin/tenants/:id`
- [x] `POST /api/ehr/admin/tenants/:id/discover`
- [x] `GET /api/ehr/admin/tenants/:id/capabilities`
- [x] `POST /api/ehr/admin/tenants/:id/test-connection`

### Task 1.4 - UI diagnostics
- [x] Add an admin-only EHR Integrations page.
- [ ] Show tenant status, vendor, FHIR base URL, latest SMART discovery timestamp, resource support, and last sync.
- [x] Provide a "Run Discovery" action and display sanitized errors.

**Validation.**
- [x] Unit tests mock `sql` for registry operations.
- [x] Route tests assert RBAC admin-only access.
- [ ] UI test confirms non-admin users cannot see tenant secrets or admin page.

**Exit criteria.**
- [ ] An admin can create an Epic sandbox tenant and Oracle Cerner sandbox tenant record.
- [x] Discovery stores SMART config and CapabilityStatement snapshots.
- [x] Secrets are never returned from admin endpoints.

---

## Epic 2 - SMART Discovery, Launch, and Token Handling

**Goal.** Support embedded and standalone SMART launches from Epic, Oracle Cerner, and generic SMART launchers.

**Create:** `smartDiscovery.ts`, `smartLaunch.ts`, `tokenStore.ts`, launch routes, callback routes, tests.

### Task 2.1 - SMART metadata discovery
- [ ] Implement retrieval of `/.well-known/smart-configuration` relative to each tenant FHIR base URL.
- [ ] Parse `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `grant_types_supported`, `code_challenge_methods_supported`, `token_endpoint_auth_methods_supported`, `scopes_supported`.
- [ ] Validate HTTPS for production tenants.
- [ ] Store snapshots with hash and timestamp.
- [ ] Flag endpoint changes for admin review.

### Task 2.2 - EHR launch start endpoint
- [x] Implement `GET /ehr/launch/:tenantKey`.
- [x] Accept SMART `iss` and `launch` parameters.
- [ ] Validate `iss` against the tenant FHIR base URL.
- [x] Generate `state`, `nonce`, PKCE verifier/challenge, and launch session.
- [x] Redirect to the discovered authorization endpoint.
- [ ] Request minimal scopes for first pilot:
  - `openid`
  - `fhirUser`
  - `launch`
  - `patient/Patient.r`
  - `patient/Encounter.rs`
  - `patient/Condition.rs`
  - `patient/Observation.rs`
  - `patient/MedicationRequest.rs`
  - `patient/AllergyIntolerance.rs`
  - `patient/Procedure.rs`
  - `online_access` only if refresh is required and vendor allows it.

### Task 2.3 - Standalone launch
- [x] Implement `GET /ehr/standalone/:tenantKey`.
- [x] Request `launch/patient` where supported.
- [x] Support patient selection result from token response.
- [x] Use the same callback/token exchange path as EHR launch.

### Task 2.4 - OAuth callback and token exchange
- [ ] Implement `GET /ehr/callback/:tenantKey`.
- [x] Validate `state`, session expiry, tenant, and PKCE.
- [x] Exchange authorization code for token.
- [ ] Validate ID token where returned.
- [x] Persist token metadata, not raw tokens unless encrypted.
- [x] Extract and store `patient`, `encounter`, `fhirUser`, and `scope` from token response.
- [ ] Map EHR user to existing Medgnosis user or create a pending user-link record for admin approval.
- [ ] Map EHR patient ID to `phm_edw.patient` using crosswalk or trigger patient-context import.
- [ ] Establish a Medgnosis application session bound to EHR launch context.

### Task 2.5 - Launch context page routing
- [ ] After callback, route user to the best Medgnosis page:
  - Patient detail if patient context exists.
  - Encounter-aware Super Note if encounter context exists and feature enabled.
  - Care gaps panel if launch source is CDS card.
  - EHR connection error page if patient mapping fails.

### Task 2.6 - SMART backend services
- [ ] Implement private-key JWT client authentication for system access.
- [ ] Support tenant-specific JWKS/private key references.
- [ ] Request system scopes:
  - `system/Patient.rs`
  - `system/Encounter.rs`
  - `system/Condition.rs`
  - `system/Observation.rs`
  - `system/MedicationRequest.rs`
  - `system/AllergyIntolerance.rs`
  - `system/Procedure.rs`
  - `system/Immunization.rs`
  - `system/DocumentReference.rs` only if needed.
- [ ] Persist system token metadata and expiration.
- [ ] Implement token refresh/reacquisition with lock to avoid stampede.

**Validation.**
- [x] Unit tests for state/nonce/PKCE creation and validation.
- [x] Unit tests for token exchange success/failure.
- [x] Route tests with mocked authorization/token endpoints.
- [x] Sandbox launch smoke against SMART Health IT. Passed 2026-06-17 against tenant 1.
- [ ] Epic sandbox EHR launch smoke.
- [ ] Oracle Cerner sandbox launch smoke.

**Exit criteria.**
- [ ] SMART launch works in at least one public sandbox and one vendor sandbox.
- [ ] Patient context opens the correct Medgnosis page.
- [ ] Existing Medgnosis login flow remains unchanged and tests still pass.

---

## Epic 3 - FHIR Client, Vendor Adapters, and Resource Normalization

**Goal.** Build a robust FHIR access layer and normalize EHR data into Medgnosis EDW without vendor-specific business logic leaking through the application.

**Create:** `fhirClient.ts`, adapters, normalization services, crosswalk tests.

### Task 3.1 - Generic FHIR client
- [x] Implement `readResource(tenant, token, type, id)`.
- [x] Implement `search(tenant, token, type, params)`.
- [x] Handle Bundle pagination via `link[relation=next]`.
- [x] Implement `_count` control with vendor defaults.
- [x] Normalize `OperationOutcome` into typed errors.
- [x] Implement retry/backoff for `429`, `503`, transient network errors.
- [x] Respect `Retry-After`.
- [x] Add request/response audit metadata without logging PHI payloads.

### Task 3.2 - Vendor adapter contract
- [ ] Define `EhrVendorAdapter`:
  - `vendor`
  - `discover`
  - `defaultScopes`
  - `resourceSupport`
  - `normalizeSearchParams`
  - `handleOperationOutcome`
  - `paginationPolicy`
  - `bulkCapabilities`
  - `cdsCapabilities`
  - `launchContextMapper`
- [x] Implement `genericSmart`.
- [x] Implement `epic`.
- [x] Implement `oracleCerner`.

### Task 3.3 - Epic adapter
- [ ] Support Epic FHIR base URL and SMART discovery.
- [ ] Enforce Epic search result constraints and paging behavior.
- [ ] Add Epic-specific `OperationOutcome` handling for access denied, break-the-glass/restricted patient, merged patient, missing required search parameter, too many results.
- [ ] Use Epic-supported Bulk Data only for approved group export workflows.
- [ ] Capture Epic patient list/group constraints in tenant metadata.
- [ ] Document app registration and customer activation steps.

### Task 3.4 - Oracle Cerner adapter
- [ ] Support Oracle Health Millennium FHIR base URL and SMART discovery.
- [ ] Handle Cerner CapabilityStatement resource/search constraints.
- [ ] Support patient and group bulk operations where tenant has permission.
- [ ] Handle Oracle/Cerner auth persona differences and endpoint discovery.
- [ ] Document Code Console registration, 15-minute propagation expectation, sandbox launch, and production activation steps.

### Task 3.5 - Resource staging
- [x] Implement immutable staging insert from FHIR resource.
- [x] Compute stable hash from canonicalized JSON.
- [x] Skip unchanged resources unless replay requested.
- [x] Store `source_last_updated` from `meta.lastUpdated`.
- [x] Track `ingest_run_id`.

### Task 3.6 - Resource normalization
- [ ] Map `Patient` to `phm_edw.patient`.
- [ ] Map `Encounter` to `phm_edw.encounter`.
- [ ] Map `Condition` problem-list and encounter diagnoses to `condition` and `condition_diagnosis`.
- [ ] Map `Observation` labs/vitals with LOINC and units to observation/lab/vital tables as applicable.
- [ ] Map `MedicationRequest` and optionally `MedicationStatement` to medication order/medication tables.
- [ ] Map `AllergyIntolerance`, `Procedure`, `Immunization`, `DiagnosticReport`, `DocumentReference` where pilot scope requires.
- [ ] Preserve source identifiers in `ehr_resource_crosswalk`.
- [ ] Build data-quality issue rows for unmapped codes, unknown units, missing patient refs, or unsupported status codes.

### Task 3.7 - Terminology crosswalks
- [ ] Reuse existing VSAC/LOINC/SNOMED/RxNorm support.
- [ ] Add local-code mapping table if needed:
  - `ehr_tenant_id`
  - `resource_type`
  - `source_system`
  - `source_code`
  - `target_system`
  - `target_code`
  - `target_display`
  - `confidence`
  - `review_status`
- [ ] Add admin UI for unmapped code review.

**Validation.**
- [x] Unit tests for FHIR client pagination/retry/OperationOutcome.
- [ ] Golden fixture tests for Epic-like and Cerner-like resources.
- [ ] Normalization tests assert idempotent upsert and crosswalk creation.
- [ ] Data-quality tests assert unmapped codes do not silently disappear.

**Exit criteria.**
- [ ] Same application service can read from Epic, Oracle Cerner, and generic SMART sandbox through adapter abstraction.
- [ ] Imported patient-context resources show correctly in Medgnosis patient detail.
- [ ] No PHI is logged in production logs.

---

## Epic 4 - Patient-Context Sync and Embedded Workflow

**Goal.** Make an EHR-launched clinician land in a useful Medgnosis view with current patient context, care gaps, risk, and notes.

### Task 4.1 - Launch prefetch/sync
- [ ] On SMART launch completion, queue a patient-context sync job.
- [ ] Fetch `Patient` first and map/crosswalk local patient.
- [ ] Fetch recent `Encounter` context if available.
- [ ] Fetch active `Condition`, recent `Observation`, active/recent `MedicationRequest`, allergies, procedures, immunizations.
- [ ] Use tight date windows for observations and encounters by default.
- [ ] Store sync status and expose it to the UI.

### Task 4.2 - Optimistic UI and stale-data indicators
- [ ] Show patient shell immediately after launch if local patient exists.
- [ ] Display "Syncing from EHR" status while job runs.
- [ ] Show last EHR sync timestamp.
- [ ] Show resource-level errors with admin-only detail and clinician-safe copy.

### Task 4.3 - Care-gap recalculation after sync
- [ ] Trigger rules engine and care-gap recalculation after relevant resources change.
- [ ] Update Solr index for patient and clinical docs.
- [ ] Re-run measure fragments only for affected patient/resources where possible.

### Task 4.4 - Embedded write-back policy
- [ ] For first release, keep EHR write-back narrow:
  - CDS Hook suggestions create draft `ServiceRequest` through CDS response, not direct Medgnosis FHIR write.
  - Notes/orders created in Medgnosis remain local unless a site explicitly enables write-back.
- [ ] Add feature flags for future write-back:
  - problem-list add/update
  - ServiceRequest create
  - DocumentReference create
  - Communication/Task create
- [ ] Require legal/security review and vendor scope approval before any production write-back.

**Validation.**
- [ ] E2E launch simulation opens patient detail.
- [ ] Patient sync job is idempotent.
- [ ] Care-gap updates are visible after sync.
- [ ] Stale-data state appears when sync fails.

**Exit criteria.**
- [ ] Clinician can launch from EHR and see a current patient summary within target latency.
- [ ] No direct write-back is enabled by default.

---

## Epic 5 - CDS Hooks 2.0.1 Production Readiness

**Goal.** Make CDS Hooks useful, safe, measurable, and vendor deployable.

**Build on existing:** `apps/api/src/routes/cds-hooks/index.ts`, `apps/api/src/routes/cds-hooks/feedback.ts`, `apps/api/src/services/cds/feedback.ts`, migration `059`.

### Task 5.1 - Discovery hardening
- [ ] Relabel all docs/comments/discovery metadata to CDS Hooks 2.0.1.
- [ ] Add services:
  - `medgnosis-care-gaps` for `order-sign`
  - `medgnosis-order-select` for `order-select`
  - `medgnosis-problem-list` for `patient-view`
  - optional `medgnosis-risk-summary` for `patient-view` only after alert burden review
- [ ] Define prefetch templates for each service.
- [ ] Add `usageRequirements` and clear service descriptions.

### Task 5.2 - Service auth
- [x] Implement `apps/api/src/services/cds/fhirAuthorization.ts`.
- [x] Verify `fhirAuthorization` JWT signature, issuer, audience, expiration, and scopes.
- [x] Cache JWKS with TTL.
- [ ] Keep shared-secret compatibility only behind `CDS_SHARED_SECRET_COMPAT=true`.
- [ ] In production, require either configured JWT auth or explicit site-approved shared-secret fallback.

### Task 5.3 - Card contract
- [ ] Add `source.topic`.
- [ ] Add coded `overrideReasons` for interruptive cards.
- [ ] Add deterministic card UUID generation for duplicate suppression where clinically safe.
- [ ] Use `indicator` consistently:
  - `info`: non-interruptive informational card
  - `warning`: actionable gap or data quality issue
  - `critical`: rare safety issue only
- [ ] Add SMART links to deep Medgnosis context views.
- [ ] Support `suggestions` and `actions` only where the EHR supports them.
- [ ] Add `systemActions` only for vendor-supported use cases.

### Task 5.4 - Feedback and burden loop
- [ ] Extend `recordFeedback` tests for malformed payloads, multiple feedback entries, override reason coding, accepted suggestions.
- [ ] Store hook instance, patient ID, card UUID, outcome timestamp, and user context where available.
- [ ] Add per-tenant/service burden aggregation.
- [ ] Add dashboard filters: tenant, service, clinician role, hook, date range, accepted, overridden, no-action.
- [ ] Alert when override rate exceeds threshold or accepted rate drops sharply.

### Task 5.5 - Suppression and governance
- [ ] Add migration for alert suppression and interruptive flags if not already implemented.
- [ ] Implement site-level and user-level suppression.
- [ ] Implement quiet period and repeat-card suppression.
- [ ] Add admin UI for suppression policy and audit.

### Task 5.6 - Vendor certification/sandbox
- [ ] Test CDS discovery with generic CDS Hooks sandbox.
- [ ] Test service POSTs with synthetic patient context.
- [ ] Test Epic CDS Hooks if customer/vendor environment supports configured hooks.
- [ ] Test Oracle Cerner CDS integration path if available for the customer environment.
- [ ] Capture every unsupported action type per vendor.

**Validation.**
- [ ] CDS route tests for all hooks.
- [ ] Auth tests with local JWKS keypair.
- [ ] Feedback persistence tests.
- [ ] Burden aggregation tests.
- [ ] Manual sandbox screenshots and request/response samples with PHI-free fixtures.

**Exit criteria.**
- [ ] Discovery returns all enabled services.
- [ ] Service POSTs are authenticated in production mode.
- [ ] Cards are non-interruptive by default unless governance policy says otherwise.
- [ ] Feedback appears in alert-burden dashboard.

---

## Epic 6 - Bulk Data and Population-Health Ingestion

**Goal.** Load and refresh patient populations for EDW, care-gap, measure, and risk analytics using bounded, tenant-approved workflows.

### Task 6.1 - Bulk capability detection
- [ ] Detect whether tenant supports Bulk Data.
- [ ] Store supported export operations:
  - group export
  - patient export
  - system export, if available
  - `_type`
  - `_typeFilter`
  - delete request
  - status polling behavior
- [ ] For Epic, assume group export only unless capability and customer approval say otherwise.
- [ ] For Oracle Cerner, support group and patient export where authorized.

### Task 6.2 - Bulk job orchestration
- [x] Implement kickoff with selected resource types.
- [ ] Require explicit patient group/roster or patient ID set.
- [x] Require `_type` for all production jobs.
- [x] Use `_typeFilter` or vendor-supported date filters where available.
- [x] Persist content-location/status URL.
- [ ] Poll with exponential backoff and vendor-safe intervals.
- [ ] Download NDJSON files only after job completion.
- [ ] Validate content type and line-level FHIR JSON.
- [ ] Queue staging/normalization by resource type.
- [ ] Delete/cleanup remote bulk files where supported after successful import.

### Task 6.3 - Roster strategy
- [ ] Support EHR group IDs supplied by customer.
- [ ] Support Epic patient lists/groups where authorized.
- [ ] Support Medgnosis cohort-derived patient sets where allowed by vendor and customer.
- [ ] Support CSV/manual roster only as a controlled bootstrap path with audit.

### Task 6.4 - Incremental strategy
- [ ] Do not rely on Bulk Data for low-latency incremental sync.
- [ ] Use patient-context FHIR reads during SMART launch.
- [ ] Use scheduled FHIR searches with date bounds for resource types that support `_lastUpdated` or clinically relevant date parameters.
- [ ] Use HL7 v2/event feeds where the site needs true event-driven ADT/orders/results.
- [ ] Reconcile nightly with targeted FHIR searches for recently changed or recently seen patients.

### Task 6.5 - EDW pipeline
- [ ] Import staged resources to `phm_edw`.
- [ ] Record per-run metrics: patients, resources, inserted, updated, unchanged, failed.
- [ ] Trigger downstream jobs:
  - Solr reindex
  - rules engine
  - care-gap recalculation
  - measure calculator
  - data-quality detector
  - cohort refresh

**Validation.**
- [x] Unit tests for bulk kickoff/status/manifest parsing.
- [ ] NDJSON parser tests with partial bad lines.
- [ ] Integration test with local mock bulk server.
- [ ] Sandbox bulk job with small approved group.
- [ ] Verify no ingestion query or EDW transform performs unbounded observation scans.

**Exit criteria.**
- [ ] First tenant can run a small approved group export and import resources into EDW.
- [ ] Bulk failures are resumable or replayable.
- [ ] Admin UI shows job status and error details.

---

## Epic 7 - Quality Reporting and Care-Gap Exchange

**Goal.** Package Medgnosis quality intelligence in standards EHRs, payers, and quality teams can consume.

**Build on existing:** `measureReportStore`, `deqm/careGaps`, `qrda/`, `qicoreExport`, `measureOps`.

### Task 7.1 - DEQM conformance refresh
- [ ] Validate existing Gaps-in-Care sample against current pinned DEQM package.
- [ ] Keep a pinned validator version in CI.
- [ ] Regenerate golden sample from test fixtures, not live PHI.
- [ ] Add per-measure fixture cases: open, closed, prospective, exclusion.

### Task 7.2 - EHR-sourced data provenance
- [ ] Add provenance links from `MeasureReport` back to source tenant/run.
- [ ] Include source-system references in audit metadata, not necessarily in public report payload.
- [ ] Ensure patient identifiers in quality exports match the recipient contract.

### Task 7.3 - Measure evaluation jobs
- [ ] Run measure evaluation after bulk imports and nightly schedules.
- [ ] Support CQL evaluator for measures with QI-Core export readiness.
- [ ] Keep SQL evaluator for measures not yet promoted to CQL.
- [ ] Persist reconciliation deltas between SQL and CQL.
- [ ] Surface quality data gaps in admin UI.

### Task 7.4 - Payer/provider exchange
- [ ] Support `GET /api/fhir/Measure/:id/$evaluate-measure`.
- [ ] Support `GET /api/fhir/Measure/$care-gaps`.
- [ ] Support QRDA Cat I patient-level export.
- [ ] Support QRDA Cat III summary export.
- [ ] Support QPP JSON where current code already supports it.
- [ ] Add tenant-specific export profiles if customer contracts require them.

### Task 7.5 - EHR workflow surfacing
- [ ] Link DEQM care gaps to CDS `patient-view` cards.
- [ ] Link measure dossier to Medgnosis SMART-launched detail page.
- [ ] Allow clinician to see evidence behind each care gap.
- [ ] Track feedback: accepted, overridden, dismissed, addressed outside Medgnosis.

**Validation.**
- [ ] FHIR validator passes for DEQM sample.
- [ ] QRDA tests pass.
- [ ] Measure route tests pass.
- [ ] Sandbox patient data produces explainable care-gap cards.

**Exit criteria.**
- [ ] Medgnosis can export standards-conformant gaps and measure reports for a pilot tenant.
- [ ] Quality artifacts trace back to EHR ingestion runs and measure logic version.

---

## Epic 8 - Legacy HL7 v2 and Interface Engine Bridge

**Goal.** Provide a pragmatic path for sites whose operational events are still delivered through HL7 v2, without making HL7 v2 the primary data model.

### Task 8.1 - Interface engine contract
- [ ] Define whether Mirth/Rhapsody/Cloverleaf/Redox/Health Gorilla/customer engine receives HL7 v2 and posts normalized events to Medgnosis.
- [ ] Prefer HTTPS JSON/FHIR event receiver over raw MLLP inside Medgnosis.
- [ ] If raw MLLP is required, isolate it in a separate service/process, not the Fastify API.

### Task 8.2 - Event types
- [ ] ADT: patient registration, admission, discharge, transfer, merge.
- [ ] ORU: lab/result notifications.
- [ ] ORM: order events.
- [ ] SIU: scheduling.
- [ ] MDM: documents, only if DocumentReference FHIR is unavailable.

### Task 8.3 - Normalization path
- [ ] Convert events to FHIR-like internal events or staged FHIR resources.
- [ ] Route through same staging/crosswalk/normalization code as FHIR ingestion.
- [ ] De-duplicate by message control ID and hash.
- [ ] Preserve raw message outside DB or in encrypted reference storage if required.

### Task 8.4 - Safety and reconciliation
- [ ] Treat HL7 v2 events as incremental hints.
- [ ] Reconcile against FHIR reads on patient launch or nightly targeted sync.
- [ ] Add merge handling for patient identity updates.

**Validation.**
- [ ] Fixture tests for ADT A01/A03/A04/A08/A40, ORU result, ORM order.
- [ ] Replay tests verify idempotency.
- [ ] Reconciliation tests verify HL7 event followed by FHIR read updates same local patient.

**Exit criteria.**
- [ ] A site can feed ADT/results incrementally without bypassing FHIR normalization or audit.

---

## Epic 9 - Security, Compliance, Audit, and Tenant Operations

**Goal.** Make integration acceptable to health system security teams and safe for PHI.

### Task 9.1 - Threat model
- [ ] Document trust boundaries:
  - EHR browser launch to Medgnosis
  - Medgnosis to EHR FHIR APIs
  - EHR/CDS client to Medgnosis CDS services
  - Bulk file download and storage
  - Admin tenant configuration
  - Legacy interface engine feed
- [ ] Document token risks and mitigations.
- [ ] Document launch CSRF/session fixation defenses.
- [ ] Document PHI logging controls.

### Task 9.2 - Audit logging
- [ ] Audit every SMART launch.
- [ ] Audit token exchange success/failure without token contents.
- [ ] Audit FHIR reads by tenant/resource/patient/user.
- [ ] Audit CDS service calls and feedback.
- [ ] Audit bulk job lifecycle.
- [ ] Audit admin changes to tenant/client configuration.

### Task 9.3 - Secrets and keys
- [ ] Move client secrets/private keys to secret manager references.
- [ ] Implement key rotation runbook.
- [ ] Support per-tenant JWKS.
- [ ] Do not print secrets in diagnostics.

### Task 9.4 - Access control
- [ ] Admin-only tenant configuration.
- [ ] Provider/care coordinator scoped launch access.
- [ ] Patient-level access checks for launched context.
- [ ] Scope enforcement for SMART tokens on Medgnosis FHIR routes.
- [ ] Break-glass/restricted-patient handling as denied or explicitly marked per customer policy.

### Task 9.5 - BAA and AI controls
- [ ] Ensure AI insights remain disabled unless BAA and consent gates allow them.
- [ ] Ensure EHR-ingested PHI is covered by customer contracts.
- [ ] Add integration-specific retention settings.

**Validation.**
- [ ] Security unit tests for auth bypass attempts.
- [ ] Redaction tests for logs.
- [ ] Admin RBAC tests.
- [ ] Manual secret leakage review.

**Exit criteria.**
- [ ] Security review package exists and matches implementation.
- [ ] All EHR integration endpoints have explicit auth posture.

---

## Epic 10 - Observability, Reliability, and Support

**Goal.** Make production integrations supportable after go-live.

### Task 10.1 - Metrics
- [ ] SMART launches started/completed/failed by tenant/vendor.
- [ ] Token exchange latency/failure rate.
- [ ] FHIR request count, latency, status, resource type.
- [ ] Rate-limit and retry counts.
- [ ] Patient sync duration and resource counts.
- [ ] Bulk job duration, file sizes, resources, failures.
- [ ] CDS calls, cards returned, accepted, overridden, dismissed.
- [ ] Normalization errors by resource/code/tenant.

### Task 10.2 - Dashboards
- [ ] EHR tenant health dashboard.
- [ ] SMART launch health dashboard.
- [ ] FHIR API health dashboard.
- [ ] Bulk ingestion dashboard.
- [ ] CDS alert-burden dashboard.
- [ ] Data-quality dashboard.

### Task 10.3 - Alerts
- [ ] Token exchange failure spike.
- [ ] FHIR 401/403 spike.
- [ ] FHIR 429 rate-limit spike.
- [ ] Bulk job stuck beyond threshold.
- [ ] CDS service error rate above threshold.
- [ ] Normalization error rate above threshold.
- [ ] No successful sync for active tenant in expected interval.

### Task 10.4 - Runbooks
- [ ] SMART launch failure runbook.
- [ ] EHR token rotation runbook.
- [ ] Bulk job failure/retry runbook.
- [ ] CDS service outage runbook.
- [ ] Patient mapping conflict runbook.
- [ ] Vendor production activation checklist.

**Validation.**
- [ ] Simulate launch failure and verify dashboard/alert.
- [ ] Simulate FHIR 429 and verify backoff.
- [ ] Simulate bulk job timeout and verify runbook steps.

**Exit criteria.**
- [ ] Support team can diagnose common integration issues without database shell access.

---

## Epic 11 - Vendor Onboarding Tracks

## Epic Track A - Epic

### A1 - Developer and app registration
- [ ] Create/confirm Epic on FHIR developer account.
- [ ] Register Medgnosis SMART app.
- [ ] Configure launch URL and redirect URI.
- [ ] Register backend/system app if needed for Bulk Data or scheduled FHIR reads.
- [ ] Request minimum scopes for pilot.
- [ ] Configure Connection Hub/Showroom only when commercially appropriate. It is not required for initial customer connection.

### A2 - Sandbox validation
- [ ] Validate `.well-known/smart-configuration` discovery.
- [ ] Validate EHR launch.
- [ ] Validate standalone launch if desired.
- [ ] Validate patient-context FHIR reads.
- [ ] Validate restricted/merged/no-access patient errors.
- [ ] Validate CDS Hooks discovery and services if sandbox/customer supports them.
- [ ] Validate Bulk Data only for approved group export flow.

### A3 - Customer activation
- [ ] Provide customer with app/client IDs.
- [ ] Confirm customer allows requested scopes and patient groups.
- [ ] Configure production tenant with customer FHIR base URL.
- [ ] Complete test patient launch in customer non-prod.
- [ ] Complete small pilot group import.
- [ ] Complete go-live checklist.

### A4 - Epic-specific implementation notes
- [ ] Avoid relying on Bulk Data for incremental warehouse sync.
- [ ] Use `_type` and targeted groups for bulk jobs.
- [ ] Account for search result limits and required search parameters.
- [ ] Treat break-the-glass/restricted patient responses as access-denied unless customer policy provides a workflow.

## Epic Track B - Oracle Cerner

### B1 - Developer and Code Console setup
- [ ] Create/confirm Oracle Health Developer Program/Code Console access.
- [ ] Register SMART provider-facing app.
- [ ] Configure launch URL and redirect URI.
- [ ] Register system/backend application for scheduled ingestion and/or Bulk Data.
- [ ] Wait for configuration propagation before retesting after changes.

### B2 - Sandbox validation
- [ ] Discover authorization and token endpoints from tenant well-known SMART config.
- [ ] Validate EHR launch from sandbox launcher.
- [ ] Validate patient context and user identity.
- [ ] Validate FHIR reads for pilot resources.
- [ ] Validate system token flow.
- [ ] Validate Bulk Data group/patient operations where authorized.

### B3 - Customer activation
- [ ] Confirm customer tenant/domain details.
- [ ] Confirm scopes and personas.
- [ ] Confirm PowerChart launch placement.
- [ ] Configure non-prod tenant.
- [ ] Run patient-context sync.
- [ ] Run approved population import.
- [ ] Complete production readiness review.

### B4 - Oracle Cerner-specific implementation notes
- [ ] Always discover endpoint URLs, do not hard-code auth/token endpoints.
- [ ] Respect CapabilityStatement resource/search constraints.
- [ ] Use Bulk Data for approved large/group use cases, not immediate UI sync.

## Epic Track C - Generic SMART/FHIR EHRs

### C1 - Compatibility requirements
- [ ] FHIR R4 server.
- [ ] SMART App Launch or OAuth-compatible authorization.
- [ ] `.well-known/smart-configuration` or documented authorization endpoints.
- [ ] CapabilityStatement.
- [ ] Supported resources for pilot scope.

### C2 - Onboarding path
- [ ] Add generic tenant record.
- [ ] Run discovery.
- [ ] Run launch simulation.
- [ ] Run resource search smoke.
- [ ] Configure adapter overrides only for documented differences.

---

## Test Strategy

### Unit tests
- [ ] Tenant registry validation.
- [ ] SMART discovery parsing.
- [ ] SMART launch URL construction.
- [ ] State/nonce/PKCE validation.
- [ ] Token exchange and token metadata persistence.
- [ ] Backend private-key JWT assertion.
- [ ] FHIR client pagination/retry/backoff.
- [ ] OperationOutcome normalization.
- [ ] Vendor adapter search-param normalization.
- [ ] Resource staging and hashing.
- [ ] Resource normalization and crosswalk.
- [ ] CDS fhirAuthorization validation.
- [ ] CDS card construction and feedback.
- [ ] Bulk manifest parsing.

### Integration tests
- [ ] Mock SMART authorization server.
- [ ] Mock FHIR server with CapabilityStatement and paginated Bundle responses.
- [ ] Mock Bulk Data server with kickoff/status/files/delete.
- [ ] Local HAPI FHIR or test container for basic R4 behavior.
- [ ] End-to-end launch callback into patient sync.

### E2E tests
- [ ] Admin creates tenant.
- [ ] Admin runs discovery.
- [ ] Simulated SMART launch opens patient detail.
- [ ] Patient sync shows current status.
- [ ] CDS burden dashboard shows feedback.

### Sandbox tests
- [x] SMART Health IT launch smoke. Passed 2026-06-17 against tenant 1.
- [ ] Epic sandbox launch.
- [ ] Oracle Cerner sandbox launch.
- [ ] Epic or Cerner patient-context resource pull.
- [ ] Small approved bulk import.

### Conformance tests
- [ ] FHIR resource validation for emitted Medgnosis FHIR resources.
- [ ] DEQM validator for `$care-gaps`.
- [ ] QRDA Cat I/III validation.
- [ ] CDS Hooks request/response contract tests.
- [ ] SMART conformance metadata checks.

---

## Delivery Sequence

Recommended order:

1. **Epic 0 - Audit and support matrix**
2. **Epic 1 - Tenant registry and admin diagnostics**
3. **Epic 2 - SMART launch and token handling**
4. **Epic 3 - FHIR client, adapters, normalization**
5. **Epic 4 - Patient-context sync**
6. **Epic 5 - CDS Hooks production readiness**
7. **Epic 6 - Bulk Data ingestion**
8. **Epic 7 - Quality exchange**
9. **Epic 9 and 10 - Security/observability hardening in parallel with Epics 2-7**
10. **Epic 11 - Vendor onboarding tracks**
11. **Epic 8 - HL7 v2 bridge only if required by pilot customer**

Rationale:
- SMART launch proves clinician workflow value fastest.
- Patient-context FHIR reads are lower risk than bulk ingestion.
- CDS Hooks should ship after launch/data context and before broad production rollout.
- Bulk Data is valuable for PHM but should not block embedded launch.
- HL7 v2 should be introduced only for specific operational event gaps.

---

## Go-Live Checklist

### Technical readiness
- [ ] Tenant registry record approved.
- [ ] SMART discovery successful in customer production tenant.
- [ ] Launch URL and redirect URI registered.
- [ ] Client IDs and scopes confirmed.
- [ ] Backend/system app credentials configured.
- [ ] Key rotation runbook approved.
- [ ] FHIR pilot resource reads pass.
- [ ] Patient mapping/crosswalk tested.
- [ ] CDS services authenticated and enabled only where approved.
- [ ] Bulk jobs configured only for approved groups and resources.
- [ ] Monitoring dashboards live.
- [ ] Alerts configured.
- [ ] Runbooks reviewed.

### Clinical readiness
- [ ] Care-gap logic validated with customer clinical owner.
- [ ] CDS card text approved.
- [ ] Interruptive alert policy approved.
- [ ] Override reasons approved.
- [ ] Suppression policy approved.
- [ ] Data freshness expectations documented.

### Compliance readiness
- [ ] BAA/customer agreement covers PHI flows.
- [ ] Security review complete.
- [ ] PHI logging redaction verified.
- [ ] Audit logging verified.
- [ ] Data retention configured.
- [ ] Incident contact path documented.

### Operational readiness
- [ ] Support owner assigned.
- [ ] Vendor/customer contacts listed.
- [ ] Sandbox/non-prod test evidence archived.
- [ ] Rollback plan documented.
- [ ] First pilot users trained.
- [ ] First-day monitoring window scheduled.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Vendor sandbox differs from customer production | Launch or scopes work in sandbox but fail in production | Per-tenant discovery, customer non-prod validation, capability snapshots |
| Overbroad scopes rejected | App cannot launch or retrieve needed data | Start least-privilege, document optional scopes, degrade gracefully |
| Bulk Data used for wrong workload | Slow jobs, stale data, operational strain | Use bulk only for bootstrap/targeted cohorts; use launch sync and events for recency |
| Alert fatigue | Clinicians ignore or disable CDS | Non-interruptive defaults, feedback loop, burden dashboard, suppression policy |
| Patient identity mismatch | Wrong-patient safety risk | Strong crosswalk, identifiers, DOB/name checks, manual conflict workflow |
| Vendor-specific `OperationOutcome` surprises | Poor UX and support burden | Adapter normalization, fixture library, sandbox evidence |
| PHI leakage in logs | Compliance incident | Redaction tests, structured audit metadata, no payload logging in prod |
| Write-back risk | Unintended EHR chart changes | Read-first launch, CDS suggestions only, feature flags and explicit site approval |
| Existing app auth regression | User lockout/security issue | SMART auth surface stays separate; run auth regression tests every epic |

---

## Definition of Done

An EHR integration capability is done only when:

- [ ] It has unit and route tests.
- [ ] It is tenant-scoped.
- [ ] It has audit logging.
- [ ] It avoids raw secret/token leakage.
- [ ] It has admin diagnostics.
- [ ] It handles vendor errors cleanly.
- [ ] It has sandbox evidence.
- [ ] It has runbook coverage.
- [ ] It does not alter app-user auth behavior.
- [ ] It has documented clinical safety behavior where CDS or care gaps are involved.

---

## Reference Links

- HL7 SMART App Launch 2.2.0: https://hl7.org/fhir/smart-app-launch/
- SMART scopes and launch context: https://build.fhir.org/ig/HL7/smart-app-launch/scopes-and-launch-context.html
- HL7 CDS Hooks 2.0.1: https://cds-hooks.hl7.org/
- Epic on FHIR: https://fhir.epic.com/
- Epic Bulk Data tutorial/documentation: https://fhir.epic.com/Documentation?docId=testpatients
- Oracle Health SMART authorization framework: https://docs.oracle.com/en/industries/health/millennium-platform-apis/fhir-authorization-framework/
- Oracle Health FHIR R4 APIs: https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/r4_overview.html
- Oracle Health Bulk Data: https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfbda/bulk_data_access.html
- HL7 Bulk Data Access IG: https://hl7.org/fhir/uv/bulkdata/
- US Core Implementation Guide: https://build.fhir.org/ig/HL7/US-Core/
- QI-Core Implementation Guide: https://build.fhir.org/ig/HL7/fhir-qi-core/
- DEQM IG overview: https://ecqi.healthit.gov/tool/deqm-ig
