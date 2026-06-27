# Medgnosis Application Completion Plan

Assessment date: 2026-06-18
Repository: `/home/smudoshi/Github/Medgnosis`
Purpose: deep completion assessment and phased todo list for unfinished application work.

## Assessment Basis

This plan is based on current code, current docs, local validation, migration state, and public/local runtime probes. It treats the live code as the source of truth when older planning docs disagree with implementation.

Validation performed:

- `npm run typecheck` - passed across `@medgnosis/api`, `@medgnosis/db`, `@medgnosis/shared`, `@medgnosis/solr`, and `@medgnosis/web`.
- `npm run lint` - passed for API and web lint targets.
- `npm run test` - passed. API: 93 files passed, 666 tests passed, 1 smoke test skipped. Web: 25 files passed, 42 tests passed. Shared: 43 tests passed. Solr: 18 tests passed. This includes the local Bulk Data mock-server integration path for kickoff, retry-after polling, completed manifest import, cancellation, output-fetch errors, failed-file-only resume, incomplete-import queue failure/dead-letter behavior, tenant recurring Bulk schedule state, System Health readiness, patient identity helpers, and structured measure test-deck coverage.
- Focused continuation validation: `npm run test --workspace=apps/api -- src/services/systemHealth.test.ts src/services/measureDossier.test.ts src/services/ehr/bulkData.test.ts src/workers/ehr-bulk-import.test.ts src/routes/admin/index.test.ts` passed with 5 files and 73 tests. `npm run typecheck --workspace=apps/api`, `npm run typecheck --workspace=apps/web`, and targeted ESLint for the touched API/web files also passed.
- `npm run build` - passed. API, DB, shared, Solr, and web production build succeeded.
- `npm run db:migrate:list` without env - failed because `DATABASE_URL` is not auto-loaded.
- DB dry-run with `.env` and `host.docker.internal` rewritten to `127.0.0.1` - passed with 78 applied migrations and 8 pending migrations: `080_invite_activation_tokens.sql`, `081_password_reset_tokens.sql`, `082_refresh_token_session_metadata.sql`, `083_totp_mfa_lifecycle.sql`, `084_smart_launch_handoff_binding.sql`, `085_ehr_bulk_import_files.sql`, `086_ehr_bulk_schedules.sql`, and `087_patient_identity_empi.sql`.
- `curl http://127.0.0.1:3081/health` - healthy.
- `curl https://medgnosis.acumenus.net/health` - healthy.
- `./scripts/fhir-validate.sh` - passed with 0 errors and 0 warnings for the current FHIR fixtures.
- `./scripts/deqm-validate.sh` - passed with 0 errors and 0 warnings for the current DEQM Gaps-in-Care fixture.
- `npm run test:e2e --workspace=apps/web` - passed 25 tests, including MFA login challenge, MFA setup/disable coverage, auth/admin/settings smoke paths, and SMART launch completion/patient-import failure coverage. The earlier `/api/v1/auth/providers` and `/ws` proxy failures are fixed for the frontend-only Playwright server.
- Production deployment checkpoint on 2026-06-19: migrations `080` through `087` were applied against `.env.production`, follow-up dry-run reported 86 applied and no pending migrations, `main`/`origin/main` deployed at `c8d662f`, `medgnosis-api` and `medgnosis-worker` were active, and the public health endpoint returned healthy.
- Focused continuation validation after Bulk Patient EMPI hydration and removal of the older direct Bulk Patient insert path: `npm run test --workspace=apps/api -- src/services/ehr/edwHydration.test.ts src/services/ehr/bulkData.test.ts src/services/ehr/identity` passed 5 files and 50 tests; `npm run typecheck --workspace=apps/api`, `npm run build --workspace=apps/api`, `npm run typecheck --workspace=packages/db`, and `npm run build --workspace=packages/db` passed. Local `npm run db:backfill-empi -- --dry-run` with the `.env` host override reported 1,005,791 unlinked legacy patients, all linkable by the Phase 0 demographic floor. Final slice gates also passed: `npm run typecheck`, `npm run build`, and `git diff --check`.
- Focused non-EMPI EHR readiness/audit/sync validation after the latest continuation: `npm run test --workspace=apps/api -- launch.test.ts`, `npm run test --workspace=apps/api -- readinessEvidence.test.ts admin.test.ts`, and `npm run test --workspace=apps/api -- auditLog.test.ts ehr-bulk-import.test.ts syncStatus.test.ts admin.test.ts` passed; the final focused run covered 4 files and 51 tests. `npm run typecheck --workspace=apps/api`, `npm run lint --workspace=apps/api`, `npm run build --workspace=apps/api`, `npm run typecheck --workspace=apps/web`, `npm run lint --workspace=apps/web`, `npm run build --workspace=apps/web`, and `git diff --check` passed.
- Focused protected-route E2E smoke validation after adding a configurable Playwright port and catch-all protected-route API fixture: `PLAYWRIGHT_PORT=5186 npm run test:e2e --workspace=apps/web -- protected-routes.spec.ts` passed. Full follow-up validation also passed: `npm run typecheck --workspace=apps/web`, `npm run lint --workspace=apps/web`, `npm run test --workspace=apps/web`, `npm run build --workspace=apps/web`, `PLAYWRIGHT_PORT=5186 npm run test:e2e --workspace=apps/web`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `git diff --check`. The smoke walks `/`, `/dashboard`, patients, patient detail, encounter-note, SuperNote, measures, bundles, care lists, population finder, close-the-loop, anticipatory care, surveillance, data quality, cohorts, coding, alerts, settings, and admin without production credentials or API proxy leakage. Commit `e4b5093` was pushed to `origin/main`; `./scripts/deploy-production.sh` passed; `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active; public `https://medgnosis.acumenus.net/health` returned healthy; `/api/v1/auth/providers` returned local and Authentik enabled; production migration dry-run reported 91 applied migrations and no pending migrations.
- Focused role-based E2E validation after adding provider, analyst, normal-admin, and super-admin session fixtures: `PLAYWRIGHT_PORT=5186 npm run test:e2e --workspace=apps/web -- role-workflows.spec.ts` passed 3 tests. The spec proves provider patient-detail access, analyst measure/population workflows, non-admin Admin nav suppression and direct `/admin` redirect, normal-admin Admin operations without the super-admin-only Auth Providers tab, and super-admin Auth Providers visibility.
- Focused System Health standards-readiness validation after adding the CQL/FHIR/DEQM readiness section: `npm run test --workspace=apps/api -- src/services/systemHealth.test.ts src/routes/admin/index.test.ts` passed 2 files and 68 tests; `npm run test --workspace=apps/web -- src/pages/admin/SystemHealthTab.test.tsx` passed 1 file and 2 tests. `npm run typecheck --workspace=apps/api`, `npm run lint --workspace=apps/api`, `npm run typecheck --workspace=apps/web`, and `npm run lint --workspace=apps/web` passed.
- Focused System Health runtime-detail validation after adding scheduler next/last-completed timestamps, Redis alert pub/sub counts, and Solr core detail: `npm run test --workspace=apps/api -- src/services/systemHealth.test.ts src/routes/admin/index.test.ts` passed 2 files and 70 tests; `npm run test --workspace=apps/web -- src/pages/admin/SystemHealthTab.test.tsx` passed 1 file and 2 tests. `npm run typecheck --workspace=apps/api`, `npm run lint --workspace=apps/api`, `npm run typecheck --workspace=apps/web`, and `npm run lint --workspace=apps/web` passed.
- Focused System Health EHR/FHIR tenant-readiness validation after adding aggregate disabled/degraded/blocked/healthy semantics and 24-hour FHIR/backend-token failure counts: `npm run test --workspace=apps/api -- src/services/systemHealth.test.ts src/routes/admin/index.test.ts` passed 2 files and 74 tests; `npm run test --workspace=apps/web -- src/pages/admin/SystemHealthTab.test.tsx` passed 1 file and 2 tests. `npm run typecheck --workspace=apps/api`, `npm run typecheck --workspace=apps/web`, `npm run lint --workspace=apps/api`, `npm run lint --workspace=apps/web`, `npm run build --workspace=apps/api`, `npm run build --workspace=apps/web`, `npm run test`, and `git diff --check` passed. Full root test summary: API 117 files passed with 911 tests passed and 1 smoke test skipped; web 27 files passed with 47 tests; shared 43 tests; Solr 18 tests. A read-only `.env.production` service probe for `getEhrTenantReadiness()` reached PostgreSQL and returned a degraded aggregate state for 2 active sandbox tenants with no 24-hour FHIR/backend-token failure rows; sourcing `.env.production` still emits the existing lines 84/85 warnings.
- Focused worker/release-evidence validation after adding an import-safe worker registry, worker boot smoke tests, and a migration release helper: `npm run test --workspace=apps/api -- src/worker.test.ts` passed 1 file and 5 tests; `npm run typecheck --workspace=apps/api`, `npm run lint --workspace=apps/api`, `npm run build --workspace=apps/api`, `node --check scripts/validate-migrations.js`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `git diff --check` passed. Full root test summary: API 118 files passed and 1 smoke file skipped with 916 tests passed and 1 skipped; web 27 files passed with 47 tests; shared 43 tests; Solr 18 tests. `npm run release:migrations -- --env-file .env.production` also passed, running both migration list and dry-run with 91 applied migrations and no pending migrations. The helper parses `.env.production` directly, so the existing OIDC group values with spaces no longer emit shell-source warnings.
- Focused admin operational release-smoke validation after adding fully mocked Playwright coverage for System Health, EHR Integrations, and Measure Governance: `PLAYWRIGHT_PORT=5187 npm run test:e2e --workspace=apps/web -- admin-release-smoke.spec.ts` passed 1 test, and the full `PLAYWRIGHT_PORT=5187 npm run test:e2e --workspace=apps/web` suite passed 30 tests after tightening an existing role-workflow CMS122 selector. `npm run typecheck --workspace=apps/web`, `npm run lint --workspace=apps/web`, `npm run test --workspace=apps/web`, `npm run build --workspace=apps/web`, and `git diff --check` also passed. The new spec uses a seeded admin session, fails on unhandled `/api/v1/**` calls, dispatches the EHR sync alert snapshot, and does not rely on production credentials or live backend state.
- Focused admin mutation contract validation after hardening `POST /api/admin/omop/cohort`: `npm run test --workspace=apps/api -- src/routes/admin/index.test.ts` passed 1 file and 66 tests; `npm run typecheck --workspace=apps/api`, `npm run lint --workspace=apps/api`, `npm run build --workspace=apps/api`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `git diff --check` passed. Full root test summary: API 118 files passed and 1 smoke file skipped with 921 tests passed and 1 skipped; web 27 files passed with 47 tests; shared 43 tests; Solr 18 tests. The route now validates de-identified cohort criteria before service calls, trims bounded condition filters, emits a PHI-safe aggregate `omop_deidentified_cohort_generate` audit event, and keeps raw condition codes out of audit details.
- Focused CI release-smoke validation after adding `npm run test:e2e:release --workspace=apps/web` and wiring it into `.github/workflows/ci.yml` before the full web E2E suite: `PLAYWRIGHT_PORT=5188 npm run test:e2e:release --workspace=apps/web` passed 4 tests across `role-workflows.spec.ts` and `admin-release-smoke.spec.ts`; `PLAYWRIGHT_PORT=5189 npm run test:e2e --workspace=apps/web` passed 30 tests. `.github/workflows/ci.yml` parsed successfully through the repo's Node YAML parser, and `npm run typecheck --workspace=apps/web`, `npm run lint --workspace=apps/web`, `npm run test --workspace=apps/web`, `npm run build --workspace=apps/web`, and `git diff --check` passed. This gives CI an explicit role-based happy path plus admin operational path on `main` pushes.
- Focused reporting-conformance CI validation after adding a `Reporting Conformance` workflow job: `./scripts/qrda-validate.sh` passed local Cat I/Cat III XML structural checks and explicitly skipped official Cypress CVU+ because `QRDA_CVU_CAT1_CMD`/`QRDA_CVU_CAT3_CMD` were not configured; `./scripts/qpp-validate.sh` passed local JSON structural checks and explicitly skipped official QPP sandbox/API validation because `QPP_VALIDATE_CMD` was not configured. `.github/workflows/ci.yml` parsed successfully through the repo's Node YAML parser, and `git diff --check` passed.
- Focused EDW medication-event continuation validation after adding `MedicationDispense` and `MedicationAdministration` landing tables/hydrators: `npm run test --workspace=apps/api -- edwHydration.test.ts patientContextRefresh.test.ts vendorAdapters.test.ts` passed 3 files and 58 tests. `npm run typecheck --workspace=apps/api`, `npm run lint --workspace=apps/api`, `npm run build --workspace=apps/api`, `npm run typecheck --workspace=packages/db`, `npm run build --workspace=packages/db`, and `git diff --check` passed. Production `.env.production` dry-run reported 89 applied migrations and one pending migration, `091_ehr_medication_events.sql`; `npm run db:migrate` applied it; the follow-up dry-run reported 90 applied migrations and no pending migrations. Commit `e467846` was pushed to `origin/main`, `./scripts/deploy-production.sh` passed, `medgnosis-api` and `medgnosis-worker` were active, and `https://medgnosis.acumenus.net/health` returned healthy.
- Focused EHR sync-status patient/resource rollup validation after adding bounded patient rollups to the existing tenant/resource status API/UI: `npm run test --workspace=apps/api -- syncStatus.test.ts admin.test.ts` passed 2 files and 40 tests. `npm run typecheck --workspace=apps/api`, `npm run typecheck --workspace=apps/web`, `npm run lint --workspace=apps/api`, `npm run lint --workspace=apps/web`, `npm run build --workspace=apps/api`, `npm run build --workspace=apps/web`, and `git diff --check` passed. A read-only production service probe against tenant 2 returned 12 resource rows, 7 tracked patients, 7 displayed patient rollups, and no sync issues. Commit `25b6f7d` was pushed to `origin/main`, `./scripts/deploy-production.sh` passed, `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active, production migration dry-run reported 90 applied migrations and none pending, and `https://medgnosis.acumenus.net/health` returned healthy.
- Focused EHR sync-status drilldown/action validation after adding bounded crosswalk conflict targets, stale patient/resource drilldowns, and structured issue source/recommended-action metadata to the existing sync-status API/UI: `npm run test --workspace=apps/api -- syncStatus.test.ts admin.test.ts` passed 2 files and 40 tests. `npm run typecheck --workspace=apps/api`, `npm run typecheck --workspace=apps/web`, `npm run lint --workspace=apps/api`, `npm run lint --workspace=apps/web`, `npm run build --workspace=apps/api`, `npm run build --workspace=apps/web`, and `git diff --check` passed. API lint emitted the existing warning in `apps/api/src/routes/admin/identityReview.test.ts`. A read-only production service probe against tenant 2 returned 12 resource rows, 7 tracked patients, 7 displayed patient rollups, 0 conflict targets, 0 stale patient/resource drilldowns, and no sync issues. Commit `ab87e84` was pushed to `origin/main`, `./scripts/deploy-production.sh` passed, `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active, production migration dry-run reported 90 applied migrations and none pending, and `https://medgnosis.acumenus.net/health` returned healthy.
- Focused EHR Bulk replay drilldown validation after adding Bulk import/QDM replay summaries, linked QDM replay controls, durable manual replay metadata, and the Bulk replay/dead-letter runbook: `npm run test --workspace=apps/api -- bulkData.test.ts admin.test.ts` passed 2 files and 69 tests. `npm run test` passed across API, web, shared, and Solr: API 106 files passed with 795 tests passed and 1 smoke test skipped; web 25 files passed with 42 tests; shared 43 tests; Solr 18 tests. `npm run typecheck --workspace=apps/api`, `npm run typecheck --workspace=apps/web`, `npm run lint --workspace=apps/api`, `npm run lint --workspace=apps/web`, `npm run build --workspace=apps/api`, `npm run build --workspace=apps/web`, and `git diff --check` passed. API lint emitted the existing warning in `apps/api/src/routes/admin/identityReview.test.ts`. A read-only production service probe against tenant 2 returned one completed group Bulk job with 14 polls, 12/12 completed import files, 2,897 rows read/staged, QDM `replayed`, 2,880 QDM resources normalized/events upserted, and no failed-file resume action required. Commit `9ba7246` was pushed to `origin/main`, `./scripts/deploy-production.sh` passed, `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active, production migration dry-run reported 90 applied migrations and none pending, and `https://medgnosis.acumenus.net/health` returned healthy.
- Focused EHR ingest-run drilldown validation after adding PHI-light ingest-run operational summaries and a selectable EHR Integrations run-detail view: `npm run test --workspace=apps/api -- ingestRuns.test.ts admin.test.ts` passed 2 files and 48 tests. `npm run test` passed across API, web, shared, and Solr: API 106 files passed with 795 tests passed and 1 smoke test skipped; web 25 files passed with 42 tests; shared 43 tests; Solr 18 tests. `npm run typecheck --workspace=apps/api`, `npm run typecheck --workspace=apps/web`, `npm run lint --workspace=apps/api`, `npm run lint --workspace=apps/web`, `npm run build --workspace=apps/api`, `npm run build --workspace=apps/web`, and `git diff --check` passed. API lint emitted the existing warning in `apps/api/src/routes/admin/identityReview.test.ts`. A read-only production service probe against tenant 2 returned one succeeded Bulk ingest run with 2,897 resources received/staged, QDM `replayed`, 2,880 QDM resources normalized/events upserted, 500 EDW resources hydrated, and no ingest errors. Commit `95af0de` was pushed to `origin/main`, `./scripts/deploy-production.sh` passed, `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active, production migration dry-run reported 90 applied migrations and none pending, and `https://medgnosis.acumenus.net/health` returned healthy.
- Focused EHR readiness token diagnostics validation after adding previous-snapshot CapabilityStatement drift, backend credential/token readiness, an explicit audited backend token-check action, and aggregate Bulk diagnostics: `npm run test --workspace=apps/api -- readinessEvidence.test.ts admin.test.ts` passed 2 files and 43 tests. `npm run test` passed across API, web, shared, and Solr: API 106 files passed with 798 tests passed and 1 smoke test skipped; web 25 files passed with 42 tests; shared 43 tests; Solr 18 tests. `npm run typecheck --workspace=apps/api`, `npm run typecheck --workspace=apps/web`, `npm run lint --workspace=apps/api`, `npm run lint --workspace=apps/web`, `npm run build --workspace=apps/api`, `npm run build --workspace=apps/web`, and `git diff --check` passed. API lint emitted the existing warning in `apps/api/src/routes/admin/identityReview.test.ts`. A read-only production service probe against tenant 2 returned readiness issues for missing backend token endpoint, missing discovery, missing Bulk resource capability coverage, expired backend token, and launch not exercised; it also returned one enabled backend-services client with ready credentials, no token requests in the last 24 hours, and no active or failed Bulk jobs. Commit `1c560e0` was pushed to `origin/main`, `./scripts/deploy-production.sh` passed, `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active, production migration dry-run reported 90 applied migrations and none pending, and `https://medgnosis.acumenus.net/health` returned healthy.
- Focused EHR sync alert dispatch validation after adding PHI-safe aggregate alert snapshots, explicit admin dispatch, System Health alerting status, optional nightly dispatch, webhook signing, and the stale-data/Bulk incident runbook: `npm run test --workspace=apps/api -- syncAlerts.test.ts systemHealth.test.ts index.test.ts` passed 8 files and 56 tests. `npm run test --workspace=apps/web -- SystemHealthTab.test.tsx` passed 1 file and 2 tests. `npm run test` passed across API, web, shared, and Solr: API 107 files passed with 804 tests passed and 1 smoke test skipped; web 25 files passed with 43 tests; shared 43 tests; Solr 18 tests. `npm run typecheck --workspace=apps/api`, `npm run typecheck --workspace=apps/web`, `npm run lint --workspace=apps/api`, `npm run lint --workspace=apps/web`, `npm run build --workspace=apps/api`, `npm run build --workspace=apps/web`, and `git diff --check` passed. API lint emitted the existing warning in `apps/api/src/routes/admin/identityReview.test.ts`. Commit `1eba305` added the application slice; production external alert delivery still requires setting `EHR_SYNC_ALERTING_ENABLED=true` and `EHR_SYNC_ALERT_WEBHOOK_URL`.
- Focused FHIR/token failure audit validation after adding PHI-safe failed FHIR read/search audit rows, backend-token request failure audit rows, and sync-alert summaries for FHIR 401/403/429, backend token auth failures, rate-limit spikes, and repeated network failures: `npm run test --workspace=apps/api -- fhirRequestAudit.test.ts fhirClient.test.ts backendServices.test.ts syncAlerts.test.ts` passed 4 files and 33 tests; `npm run typecheck --workspace=apps/api`, `npm run lint --workspace=apps/api`, `npm run test`, `npm run build`, and `git diff --check` passed. API lint emitted the existing warning in `apps/api/src/routes/admin/identityReview.test.ts`.
- Focused auth/session audit validation after adding PHI-safe route-level audit events for known-user local auth failures, MFA verification/disable failures, refresh-token rotation/replay/expiry/MFA-gate/user-missing branches, rejected password changes, public registration creation, session revoke misses, preferences updates, and OIDC callback success redaction: `npm run test --workspace=apps/api -- src/routes/auth/__tests__/auth.test.ts` passed 1 file and 55 tests. Full follow-up gates passed: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `git diff --check`. Production migration list with `.env.production` loaded reported 91 applied migrations and no pending migrations; sourcing `.env.production` still emits the existing lines 84/85 warnings. Commit `8d6ee91` was pushed to `origin/main`, `./scripts/deploy-production.sh` passed, `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active, public `https://medgnosis.acumenus.net/health` returned healthy, and `/api/v1/auth/providers` returned local plus Authentik enabled with public registration and demo quick-fill disabled.
- Focused non-EMPI mutation audit validation after adding CDS feedback audit rows, routing admin measure refresh through the request audit helper, and reducing clinical-note, order, cohort, population-finder, MTM, auto-order, invite, and refresh-token audit details to PHI-safe aggregate/bound flags: `npm run test --workspace=apps/api -- src/routes/orders/index.test.ts src/routes/population-finder/index.test.ts src/routes/auth/__tests__/auth.test.ts src/routes/clinical-notes/index.test.ts src/routes/cds-hooks/feedback.test.ts src/routes/admin/index.test.ts src/services/__tests__/problemListService.test.ts` passed 7 files and 136 tests. Full follow-up gates passed: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `git diff --check`. Full test summary: API 117 files passed with 901 tests passed and 1 smoke test skipped; web 27 files passed with 47 tests; shared 43 tests; Solr 18 tests. Commit `0e82fb3` was pushed to `origin/main`, `./scripts/deploy-production.sh` passed, `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active, production migration dry-run reported 91 applied migrations and no pending migrations, public `https://medgnosis.acumenus.net/health` returned healthy, and `/api/v1/auth/providers` returned local plus Authentik enabled with public registration and demo quick-fill disabled. Sourcing `.env.production` still emits the existing lines 84/85 warnings.
- Focused EHR audit redaction validation after removing token metadata ids, launch session ids, provider-supplied SMART callback error text, webhook endpoint hosts, and raw webhook/error strings from audit details: `npm run test --workspace=apps/api -- src/routes/ehr/admin.test.ts src/routes/ehr/launch.test.ts src/services/ehr/syncAlerts.test.ts src/services/systemHealth.test.ts` passed 4 files and 68 tests. Full follow-up gates passed: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `git diff --check`. Full test summary: API 117 files passed with 903 tests passed and 1 smoke test skipped; web 27 files passed with 47 tests; shared 43 tests; Solr 18 tests. Commit `737dfde` was pushed to `origin/main`, `./scripts/deploy-production.sh` passed, `medgnosis-api`, `medgnosis-worker`, and `medgnosis-auto-deploy` were active, production migration dry-run reported 91 applied migrations and no pending migrations, public `https://medgnosis.acumenus.net/health` returned healthy, and `/api/v1/auth/providers` returned local plus Authentik enabled with public registration and demo quick-fill disabled. Sourcing `.env.production` still emits the existing lines 84/85 warnings.
- Focused Bulk deleted-output validation confirmed that completed Bulk manifests process `manifest.deleted` Bundle NDJSON entries by `request.method=DELETE` and `request.url=ResourceType/id`, then soft-delete crosswalk-mapped EDW rows and stamp `ehr_resource_crosswalk.deleted_at/deleted_reason`: `npm run test --workspace=apps/api -- src/services/ehr/bulkData.test.ts src/services/ehr/edwHydration.test.ts` passed 2 files and 74 tests.
- Production worker/CQL restart runbook validation confirmed the documented commands against the current systemd worker unit, deploy script, Docker CQL profile, and CQL smoke scripts. `systemctl cat medgnosis-worker`, `systemctl cat medgnosis-api`, `systemctl is-active medgnosis-worker medgnosis-api`, `docker compose --profile cql config --services | rg '^cql-engine$'`, `bash -n scripts/cql-engine-smoke.sh scripts/cql-qdm-smoke.sh scripts/cql-realmeasure-smoke.sh scripts/deploy-production.sh`, and `git diff --check` passed for the docs-only slice.
- Focused QRDA/QPP local validation after adding deterministic Cat I, Cat III, and QPP fixtures plus validation scripts: `./scripts/qrda-validate.sh` passed local XML structural checks and explicitly skipped external CVU+ because `QRDA_CVU_CAT1_CMD`/`QRDA_CVU_CAT3_CMD` were not configured; `./scripts/qpp-validate.sh` passed local JSON structural checks and explicitly skipped external QPP sandbox/API validation because `QPP_VALIDATE_CMD` was not configured; `npm run test --workspace=apps/api -- src/services/qrda/qrdaCat1.test.ts src/services/qrda/qrdaCat3.test.ts` passed 2 files and 12 tests.
- Focused FHIR/DEQM CI stabilization after GitHub Actions run `28267861945` failed on `tx.fhir.org` timeout/cache-session errors rather than fixture/profile errors: `./scripts/fhir-validate.sh` and `./scripts/deqm-validate.sh` now default to offline terminology with no terminology cache, while explicit `FHIR_VALIDATOR_TX`/`FHIR_VALIDATOR_TX_CACHE` overrides remain available for live terminology evidence. Local deterministic runs passed for both scripts after the update.
- Focused Measure Governance UI validation after making the admin tab backend-config driven and adding audited action controls: `npm run typecheck --workspace=apps/web`, `npm run lint --workspace=apps/web`, and `PLAYWRIGHT_PORT=4217 npm run test:e2e --workspace=apps/web -- admin-release-smoke.spec.ts` passed. The release-smoke fixture now covers multiple governed measures, guarded dossier generation, dry-run promotion, disabled authoritative promotion when latest evidence is not eligible, and unhandled admin API request detection.

Areas examined:

- API route registry in `apps/api/src/routes/index.ts`.
- API app bootstrap in `apps/api/src/app.ts`.
- Worker registry in `apps/api/src/worker.ts`.
- Nightly scheduler and background workers in `apps/api/src/workers/`.
- Auth, admin, FHIR, measure, EHR, CDS Hooks, QDM bridge, QRDA, QPP, and DEQM services/routes.
- Web routes in `apps/web/src/App.tsx`.
- Admin UI tabs, especially System Health, EHR Integrations, and Measure Governance.
- Existing superpowers plans/devlogs/runbooks.
- README, `.env.example`, CI workflow, and design log.

## Current Completion Snapshot

Medgnosis is not a prototype shell. The core application builds, tests, serves health checks, exposes a broad clinical/product surface, and has real foundations for EHR integration, QDM/FHIR bridge work, CQL evaluation, DEQM output, audit, admin, worker scheduling, and role-based access.

The unfinished work is concentrated in productionizing those foundations:

- Auth/security claims are now closer to implementation. MFA has TOTP setup, QR/manual secret delivery, challenge verification before session issuance, hashed recovery codes, disable flow, OIDC/local enforcement, refresh-token MFA gating, and Settings UX. Admin-created users have tokenized invite activation with revoke/status UX, password reset uses one-time token links that revoke refresh tokens when complete, and Settings exposes active-session/device visibility with per-session revoke controls.
- Auth/session and non-EMPI mutation audit coverage now captures PHI-safe known-user security events for local login failures, MFA failures, refresh-token lifecycle and replay handling, rejected password changes, session revoke misses, public registration creation, preference updates, CDS feedback, admin measure refresh, clinical-note lifecycle, generated orders, cohort messages, population-finder accepts, MTM advances, and auto-order disenrollments while documenting no-audit rationale for anti-enumeration and untrusted-token branches. OIDC callback success audit details no longer persist raw email claims, and high-risk route details now use aggregate/bound flags instead of patient, care-gap, order-set, invite, refresh-session, provider, diagnosis, or note-content identifiers.
- EHR integration has credible tenant registry, strict SMART launch validation, short-lived Medgnosis handoff binding, initial launch Patient import/crosswalk, bounded launch-context resource staging with first-pass EDW hydration and automatic QDM replay, backend-services queued refresh plus continuation jobs for supported patient-context resources, tenant ingest-run status API and recent-sync panel, readiness evidence API/UI, previous-snapshot CapabilityStatement drift, backend credential/token age evidence, explicit audited backend token-check action, PHI-safe FHIR read/search and backend-token failure audit summaries, JWKS, discovery, onboarding, SMART lifecycle audit/rate limits, Bulk kickoff/polling ledger, manual/admin Bulk kickoff, worker polling/import orchestration, PHI-safe automated Bulk worker audit, manual completed-job import replay, failed-file-only resume, active-job cancellation, tenant-specific recurring Bulk schedules, aggregate Bulk diagnostics, Bulk Patient EMPI/crosswalk seeding, legacy-patient EMPI backfill tooling, admin Bulk job/file/schedule visibility, Bulk import/QDM replay summaries with poll-count and normalized-row visibility, linked QDM replay controls for Bulk ingest runs, PHI-light ingest-run operational summaries and selectable run-detail view, bounded patient/resource sync rollups, bounded conflict/stale-resource drilldowns, structured sync issue actions, PHI-safe external sync alert snapshots with FHIR/token failure spike summaries, PHI-safe QDM/CQL promotion attempt audits, PHI-safe EHR tenant mutation audit coverage, stale-data/Bulk incident runbook, and first-pass EDW hydration for `DocumentReference`, `DiagnosticReport`, `MedicationDispense`, and `MedicationAdministration`. It still lacks remaining EDW/local-matching breadth for tenant-specific patient-detail needs, exercised Bulk replay/dead-letter incident evidence, vendor sandbox evidence, a configured external alert destination, and live stale-data/Bulk incident evidence.
- CQL/QDM/quality reporting has a real seam and governance path, but SQL remains authoritative by default, CMS122 promotion is intentionally blocked by semantic drift, local CMS measure content is minimal, test-deck coverage is not surfaced in dossiers, and QRDA/QPP validation is limited to local structural CI checks until official Cypress CVU+ and QPP sandbox/API validation are configured.
- Some clinical workflows are intentionally simulated or narrow: the surveillance lane is synthetic, the rules worker evaluates only care-gap-overdue, and the AI worker has a `population_summary` job type without implementation.
- Frontend/admin coverage is functional but incomplete for production operations: System Health now shows workers, queues, EHR Bulk readiness, aggregate EHR/FHIR tenant readiness with blocked/degraded/healthy semantics and 24-hour FHIR/backend-token failure counts, EHR sync alert configuration/last-dispatch state, manual alert dispatch, Redis/Solr/scheduler runtime detail, and CQL/FHIR/DEQM standards-readiness artifacts; EHR Integrations now shows tenant readiness evidence, previous-snapshot capability drift, backend token/credential diagnostics with an explicit token-check action, aggregate Bulk diagnostics, recent ingest runs, selectable ingest-run operational details, worker failure/overdue-poll sync metrics, Bulk job/file status, completed-job import replay, failed-file-only resume, active-job cancellation, Bulk schedule next/last-success state, Bulk import/QDM replay summaries, linked QDM replay controls for Bulk ingest runs, bounded patient/resource rollups, bounded conflict/stale-resource drilldowns, and structured sync issue actions, but not full incident rehearsal evidence. Measure Governance defaults around CMS122, and E2E tests are still narrower than full product workflows.
- Historical documentation still has drift. README and `.env.example` have been brought closer to current behavior, but the design log still mixes old audit findings with "complete" phase status.

## Definition Of Complete

Treat the application as complete when the following are true:

- A clinician/admin can use the product through primary workflows without needing seed/demo-only assumptions.
- The security model matches documentation: MFA, invites, password reset, OIDC/local fallback, roles, audit, logging, and PHI controls are implemented and tested.
- At least one EHR sandbox path is end-to-end: tenant registration, SMART launch, token validation, patient context, patient import/crosswalk, FHIR reads, Bulk export ingestion, QDM normalization, and visible operational status.
- CQL/QDM governance can promote or hold measures with evidence: official artifacts, test decks, reconciliation, semantic-drift dossiers, patient-level evidence, and operator-visible gates.
- Reporting artifacts are validated against the relevant external validators or sandbox APIs: FHIR/DEQM, QRDA Cat I/III, QPP JSON, and MeasureReport output.
- Background work is observable: queues, workers, scheduler jobs, failures, retries, and last-success timestamps are visible in admin and alerting.
- E2E tests exercise authenticated role-based workflows, not only login shell and 404 behavior.
- Docs, runbooks, env examples, and operational checklists match the current product behavior.

## Phased Todo List

### Phase 0 - Source Of Truth And Baseline Hygiene

Objective: make the repo's documentation, env instructions, and current-state inventory trustworthy before deeper feature work continues.

- [ ] Decide whether to commit or otherwise preserve the updated EHR current-state devlog at `docs/superpowers/devlogs/2026-06-17-ehr-integration-current-state-devlog.md`.
- [x] Create or update a single current-state index that links the active EHR, QDM, CQL, DEQM, auth/admin, deployment, and UI plans.
- [x] Update `README.md` so it no longer claims incomplete features as complete.
  - [x] Remove or qualify "MFA support (TOTP)" until real setup and verification exist.
  - [x] Update route/page/package counts to reflect the current app.
  - [x] Add EHR, QDM bridge, CQL sidecar, DEQM, QRDA/QPP, and worker architecture sections.
  - [x] Document that DB migration commands require `DATABASE_URL` to be loaded.
- [x] Update `.env.example` CQL comments so they describe the current HAPI clinical-reasoning sidecar, not only a future cqf-ruler bridge.
- [x] Add a short operator note for migration commands:
  - [x] Example: `npm run release:migrations -- --env-file .env.production`.
  - [x] Explain which env file is safe for local, staging, and production.
- [x] Review `docs/DESIGNLOG.md` and mark old audit findings as resolved, still-open, or superseded.
- [x] Mark older phase plans as current, superseded, or completed so future work does not chase stale tasks.
- [x] Add a `docs/superpowers/runbooks/validation-gates.md` runbook with the exact command matrix from this assessment.

Acceptance gate:

- [ ] A new contributor can identify the active completion plan and current state without reading every historical devlog.
- [ ] README and `.env.example` no longer advertise unavailable behavior.
- [x] Migration list/dry-run instructions are reproducible from a clean shell.

### Phase 1 - CI, Test Depth, And Release Evidence

Objective: keep the currently green build reliable while expanding tests from unit coverage into real product workflows.

- [x] Keep the current root gates mandatory:
  - [x] Add `npm run verify:release` as the no-cache release evidence gate for root typecheck, lint, test, and build.
  - [x] Keep `git diff --check` in the release checklist.
- [x] Add a CI job or documented local script for migration list and dry-run with explicit `DATABASE_URL`.
- [ ] Improve E2E so it proves real authenticated workflows.
  - [x] Start an API server for Playwright or mock all required API bootstrap calls intentionally for protected-route smoke coverage.
  - [x] Remove the current passing-with-proxy-errors behavior around `/api/v1/auth/providers`.
  - [x] Disable realtime alert WebSocket connection during frontend-only Playwright runs.
  - [x] Add an authenticated admin smoke path for Admin dashboard and Users tab.
  - [x] Seed or fixture a provider, analyst, admin, and super-admin session.
    - [x] Seed reusable admin session fixture.
    - [x] Seed reusable provider, analyst, normal-admin, and super-admin session fixtures.
  - [x] Add dedicated invite activation E2E coverage.
  - [x] Add catch-all mocked protected-route smoke coverage for every top-level route in `apps/web/src/App.tsx`.
  - [x] Cover provider patient-detail access, analyst measure/population access, non-admin role restriction, normal-admin operations, and super-admin Auth Providers visibility.
  - [ ] Cover login, refresh, logout, invite completion, settings, dashboard, patient detail, care gaps, alerts, admin health, EHR tab, and Measure Governance tab.
    - [x] Cover admin health, EHR tab, and Measure Governance operational release-smoke rendering with fully mocked APIs and unhandled-request detection.
- [x] Add smoke coverage for all protected top-level web routes in `apps/web/src/App.tsx`.
- [ ] Add API contract tests for admin mutation routes that currently rely on manual UI behavior.
  - [x] Harden and test the non-EMPI OMOP de-identified cohort POST contract with PHI-safe aggregate audit coverage.
- [x] Add queue/worker boot smoke tests for the worker entrypoint or a safe worker registry factory.
- [x] Add a CI-named focused E2E release-smoke step for role workflows and admin operational readiness before the full E2E suite.
- [ ] Add QRDA/Cypress and QPP validation jobs once Phase 5 reporting artifacts are ready.
  - [x] Add local structural QRDA Cat I/Cat III and QPP JSON validation to CI.
  - [ ] Wire official QRDA Cypress CVU+ and QPP sandbox/API validation once external tools/credentials are available.
- [x] Keep FHIR/DEQM CI conformance deterministic by avoiding default live
  `tx.fhir.org` terminology dependencies; require explicit env overrides for
  operator-run live terminology evidence.
- [x] Decide whether Turbo cache replay is acceptable for local assessment commands or whether a no-cache command should be used in release checklists.
  - Normal local commands may use Turbo cache for speed; release evidence now uses `npm run verify:release`, which forces TypeScript, lint, test, and build tasks to execute.

Acceptance gate:

- [x] E2E passes without API proxy errors.
- [x] CI proves at least one role-based happy path and one admin operational path.
- [ ] Release evidence includes build, tests, migration state, health, FHIR/DEQM validation, and standards/reporting validation where applicable.

### Phase 2 - Auth, Admin, And Security Completion

Objective: make authentication and admin controls production-honest.

- [x] Implement real MFA instead of removing MFA claims from the product surface.
  - [x] Add TOTP setup initiation, QR/secret delivery, verify, enable, disable, recovery codes, and audit events.
  - [x] Enforce MFA during local login and OIDC exchange when `mfa_enabled=true`.
  - [x] Add focused API/E2E coverage for setup, challenge issuance, verification, session issuance, Settings setup, and Settings disable.
  - [x] Add edge tests for invalid codes, replay, disabled users, refresh-token behavior, and recovery-code consumption.
  - [x] Replace the disabled "Enable 2FA" UI in `apps/web/src/pages/SettingsPage.tsx`.
- [x] Complete invite and password lifecycle.
  - [x] Replace `INVITE_PENDING` as a dead-end password hash with a real invite token or activation table.
  - [x] Add invite email generation and an out-of-band activation URL surfaced to admins.
  - [x] Add accept-invite, set-password, and resend-invite endpoints with expiry enforcement.
  - [x] Add explicit revoke-invite endpoint and pending invite status/admin UX.
  - [x] Add password reset and forced password-change workflows.
  - [x] Ensure admin-created users cannot log in until activation is complete.
- [x] Harden OIDC/provider admin.
  - [x] Keep local login fallback unless explicitly disabled by env and documented.
  - [x] Either implement test flows for LDAP/OAuth2/SAML provider types or hide/disable those types until supported.
  - [x] Add provider health and last-test evidence to System Health.
  - [x] Add JIT provisioning and group reconciliation tests for role mapping edge cases.
- [ ] Finish role and permission matrix documentation.
  - [x] List route families and allowed roles.
  - [x] Add tests for admin-only and super-admin-only route behavior.
  - [x] Add bounded Bulk import tenant/org mismatch regression.
  - [ ] Confirm tenant/org isolation for EHR tenants, patient access, admin users, and audit views.
    - [x] Scope admin-user listing/mutations/invite controls and actor-user audit-log reads by org for normal admins; keep `super_admin` global.
  - [x] Decide and document global-admin versus org-scoped audit-log visibility before marking audit views complete.
- [ ] Strengthen audit coverage.
  - [x] Confirm every mutation route calls audit logging.
  - [x] Add audit entries for admin invite create/resend/revoke.
  - [x] Add audit entries for password reset request/completion.
  - [x] Add audit entries for MFA setup start, enable, verify, and disable.
  - [x] Add audit entries for SMART launch lifecycle, EHR tenant upsert, diagnostics success/failure, manual patient-context refresh, and QDM replay.
  - [x] Add audit entries for manual Bulk kickoff, import replay/resume, and cancellation controls.
  - [x] Add audit entries for automated Bulk worker kickoff, polling, import, incomplete import, and failure events.
  - [x] Add PHI-safe audit entries for failed tenant FHIR read/search paths and backend token request failures.
  - [x] Add route-level PHI-safe audit entries and coverage proof for QDM/CQL promotion attempts.
  - [x] Confirm EHR tenant mutation routes and worker-adjacent EHR controls emit PHI-safe audit rows.
  - [x] Add PHI-safe audit coverage for EHR QDM/CQL load actions and redaction proof for diagnostics/test-connection and patient-level Bulk controls.
  - [x] Add audit entries or coverage proof for auth provider changes.
  - [x] Add PHI-light audit entries for admin user profile updates and deactivation.
  - [x] Add PHI-light audit entries for legacy admin FHIR endpoint create/update/deactivate/sync, auth-provider test attempts, and materialized-view refresh runs.
  - [x] Add PHI-light audit entries for clinical-note create/update/finalize/amend/soft-delete lifecycle mutations and manual surveillance tick runs.
  - [x] Add focused API PHI redaction regression tests for Pino structured logging and Sentry error telemetry paths.
  - [x] Add PHI-safe auth/session audit entries and regression coverage for local known-user auth failures, MFA verification failure, refresh-token rotation/replay/MFA-gate failures, rejected password changes, public registration creation, session revoke misses, preferences updates, and OIDC success email-claim redaction.
  - [x] Add PHI-safe CDS feedback audit coverage, route admin measure refresh through `req.auditLog`, and reduce high-risk clinical/order/cohort/population-finder/MTM/auto-order/auth audit details to aggregate or bound flags with focused regression tests.
  - [x] Redact EHR admin/launch/sync-alert audit details so token metadata ids, SMART launch session ids, provider-supplied callback error text, webhook endpoint hosts, and raw dispatch error strings are not persisted in `audit_log`.
- [x] Tighten production headers and CSP.
  - [x] Review `apps/api/src/app.ts` CSP settings.
  - [x] Add explicit script/connect/img/font policies for production.
  - [x] Verify Swagger exposure policy in production.

Acceptance gate:

- [ ] Security section in README is fully true.
- [ ] Auth/admin E2E covers local login, optional OIDC path, MFA, invite activation, role restriction, and session revoke.
  - [x] MFA E2E covers pending challenge before auth persistence, verify-to-dashboard, setup, recovery-code display, and disable.
  - [x] Admin dashboard and Users tab smoke path covers an authenticated admin session.
  - [x] Invite activation E2E covers missing token, invalid token, set-password, activation API failure, login redirect, and dashboard redirect with returned tokens.
  - [x] Settings E2E covers active-session/device visibility and per-session revoke.
  - [x] Role restriction E2E covers provider/analyst Admin suppression and direct `/admin` redirect plus normal-admin versus super-admin tab visibility.
- [ ] Audit log shows complete coverage for user/admin/security mutations.

### Phase 3 - SMART App Launch And EHR Tenant Production Hardening

Objective: turn the current EHR foundation into a safe EHR-launched application path.

- [x] Harden SMART launch initiation in `apps/api/src/routes/ehr/launch.ts`.
  - [x] Require and validate `iss` for EHR launch against tenant issuer/FHIR base URL.
  - [x] Preserve standalone launch behavior with explicit launch-mode rules.
  - [x] Log and audit launch attempts, denials, tenant mismatches, callback outcomes, and handoff outcomes.
  - [x] Rate-limit SMART launch, callback, and handoff endpoints.
- [x] Validate SMART callback tokens beyond basic token exchange.
  - [x] Validate `id_token` signature when OpenID scope is requested or an ID token is returned.
  - [x] Validate nonce against stored nonce hash.
  - [x] Validate issuer, audience, expiration, issued-at, authorized party, and token-use semantics.
  - [x] Reject OpenID launch callbacks when the EHR omits `id_token`.
- [x] Bind SMART launch to a Medgnosis session.
  - [x] Create a backend exchange endpoint for one-time `smart_handoff` codes.
  - [x] Add a frontend SMART callback/complete route that consumes `smart_handoff`.
  - [ ] Create or associate a Medgnosis user based on `fhirUser`, OIDC user, or tenant policy.
  - [x] Avoid leaking launch session IDs in long-lived browser URLs.
- [x] Resolve initial Patient context after launch when no local crosswalk exists.
  - [x] Read launch patient context from token response.
  - [x] Resolve existing `ehr_resource_crosswalk` patient identity and redirect into the patient workspace.
  - [x] Fetch Patient from the tenant FHIR API while the raw SMART access token remains only in memory.
  - [x] Stage raw Patient resources in `fhir_ingest_staging` under a manual EHR ingest run.
  - [x] Create the internal patient record when required demographics are present.
  - [x] Populate `ehr_resource_crosswalk` with tenant-scoped Patient identity.
  - [x] Preserve existing non-null crosswalk mappings rather than reassigning patients automatically.
  - [x] Provide clear completion failure states for missing/expired handoff and resolver failures.
  - [ ] Add tenant policy for provider access/PCP attribution after imported Patient creation.
- [ ] Complete tenant readiness gates.
  - [x] Expose tenant readiness evidence API/UI for SMART discovery, launch, callback, and handoff health.
  - [x] Enforce HTTPS and known vendor metadata for production tenants.
  - [x] Detect drift between registered tenant values and discovered SMART/CapabilityStatement metadata.
  - [x] Surface last successful discovery, launch, callback, and handoff evidence from capability snapshots, launch sessions, and audit rows.
  - [x] Store or surface backend token-refresh timestamps.
- [ ] Complete vendor sandbox validation.
  - [ ] Epic sandbox: registration, launch, callback, FHIR read, patient context, and evidence capture.
  - [ ] Oracle Cerner sandbox: registration, launch, callback, FHIR read, patient context, and evidence capture.
  - [ ] SMART Health IT sandbox: keep as low-risk regression fixture.

Acceptance gate:

- [ ] A sandbox EHR launch lands the user in the correct Medgnosis patient workspace.
- [x] Invalid issuer, invalid state, expired session, nonce mismatch, wrong org, callback claim failures, handoff failures, and unsupported auth method are tested.
- [x] Admin EHR readiness shows launch health and last-success evidence.

### Phase 4 - EHR Data Ingestion, Bulk Data, And Patient Sync

Objective: move from EHR connectivity metadata to repeatable ingestion that updates Medgnosis data safely.

- [ ] Build Bulk Data worker support.
  - [x] Add a BullMQ queue and worker for completed Bulk manifest download, validation, staging, EDW hydration, and QDM replay.
  - [x] Register the Bulk import worker in `apps/api/src/worker.ts`.
  - [x] Add tenant-scoped admin enqueue endpoint for completed Bulk job imports.
  - [x] Add BullMQ kickoff/poll orchestration instead of requiring manual completed-job import enqueueing.
  - [x] Add scheduler rules for tenant-specific Bulk jobs.
  - [x] Respect vendor polling min/max settings from adapters.
  - [x] Add manual active-job cancellation through the vendor Bulk status endpoint.
  - [x] Add automatic retry, failed-import resume, and dead-letter behavior through BullMQ retries/failed-job retention plus failed-file-only resume mode.
- [ ] Extend `apps/api/src/services/ehr/bulkData.ts` beyond metadata.
  - [x] Download manifest output NDJSON files for completed jobs.
  - [x] Stream files instead of loading large files into memory.
  - [x] Validate resource type, content type, output origin for token-bearing fetches, and access scope.
  - [x] Validate checksum/size when vendors provide it.
  - [x] Persist file-level import status and errors.
  - [x] Never persist raw bearer tokens or raw NDJSON payloads in Bulk ledgers, queue payloads, or logs.
- [ ] Stage and normalize FHIR resources.
  - [x] Use existing resource staging and QDM bridge services for completed Bulk import files.
  - [x] Add Patient crosswalk creation before downstream EDW/QDM normalization when a Bulk Patient can be mapped safely.
  - [x] Route staged Bulk `Patient` hydration through EMPI so strong identifiers attach to `phm_edw.person` and local `phm_edw.patient` rows are linked before child resources normalize.
  - [x] Remove the older direct Bulk Patient insert/crosswalk helper so Bulk Patient creation has one EMPI chokepoint.
  - [x] Add an explicit dry-run/apply operator script for legacy `phm_edw.patient` to `phm_edw.person`/`patient_link` backfill.
  - [x] Record provenance per resource, run, tenant, and source file ledger.
  - [ ] Normalize all staged Bulk resource families into durable EDW domain tables.
  - [x] Define delete/tombstone behavior for Bulk `deleted` output by processing deleted Bundle entries and soft-deleting crosswalk-mapped EDW rows.
- [ ] Add incremental FHIR sync for launch patients.
  - [x] After SMART launch, fetch/stage/import the launch Patient needed for workspace routing.
  - [x] Fetch/stage bounded launch-context resources for `Encounter`, `Condition`, `Observation`, `MedicationRequest`, `Procedure`, and `AllergyIntolerance` when granted patient scopes allow it.
  - [x] Replay callback-staged launch-context resources through the QDM bridge and persist replay summaries in SMART launch context.
  - [x] Hydrate callback-staged `Encounter`, `Condition`, `Observation`, `MedicationRequest`, `Procedure`, `AllergyIntolerance`, and `Immunization` resources into EDW workspace tables and point source crosswalks at EDW rows.
  - [x] Queue a backend-services BullMQ refresh after SMART launch for broader `Encounter`, `Condition`, `Observation`, `MedicationRequest`, `Procedure`, `AllergyIntolerance`, and `Immunization` patient-context pages without storing SMART launch bearer tokens.
  - [x] Add an admin endpoint to enqueue a manual patient-context refresh for a tenant and patient resource id.
  - [x] Add refresh continuation jobs for searches that return remaining next links.
  - [x] Broaden staged-resource EDW normalization beyond callback-bounded core resources where current EDW tables already exist.
  - [x] Add EDW hydration for `DocumentReference`, `DiagnosticReport`, `MedicationDispense`, and `MedicationAdministration`.
  - [ ] Continue remaining EDW/local-matching breadth for tenant-specific patient-detail needs.
  - [ ] Avoid blocking launch on full data import.
- [ ] Add admin UI for ingestion.
  - [x] Add a read-only tenant ingest-run status API with status/mode/resource filters.
  - [x] Add recent ingest-run status to the EHR Integrations readiness panel.
  - [x] Bulk jobs table: tenant, level, group/patient, status, files, rows staged, failures, next poll, and timestamps.
  - [x] Add manual completed-job import replay and active-job cancel actions.
  - [x] Extend Bulk jobs table with poll count, normalized row counts, and QDM replay links.
  - [x] Add failed-import resume controls for completed jobs with failed file rows.
  - [x] Add bounded patient/resource last-seen rollups and stale-patient warnings to tenant sync status.
  - [x] Expand patient/resource sync visibility with bounded conflict drilldowns, stale-resource drilldowns, and structured issue action metadata.
  - [x] Add stale-data runbooks and external alert routing for sync issues.
  - [x] Add Bulk schedule next-run and last-success visibility to the EHR Integrations Bulk panel.
  - [x] Add audit coverage for manual Bulk kickoff, import replay/resume, and cancellation controls.
  - [x] Add audit coverage for automated Bulk worker lifecycle events and expose worker failures/overdue polls in sync status.
- [ ] Add integration fixtures.
  - [x] Mock Bulk server with 202, retry-after, completed manifest, NDJSON files, cancellation, and output-fetch errors.
  - [ ] Epic/Cerner sandbox replay fixtures where allowed.
  - [x] Regression test for missing Patient crosswalk.

Acceptance gate:

- [x] A Bulk export can be kicked off, polled, downloaded, staged, replayed to QDM, and surfaced in admin without manual SQL when the Bulk queue is enabled.
- [x] Initial launch Patient crosswalks are created or flagged for review.
- [x] Failed imports are resumable and visible.

### Phase 5 - QDM, CQL, Measures, And Reporting Completion

Objective: make quality measurement standards work governable, reproducible, and submission-ready.

- [ ] Keep SQL authoritative until CQL promotion gates pass per measure.
  - [ ] Do not flip `MEASURE_EVALUATOR=cql` globally until reconciliation and performance gates are met.
  - [ ] Keep per-measure promotion configuration as the source of truth.
- [ ] Finish CMS122 governance decision.
  - [ ] Use the semantic drift dossier to decide whether CMS122 remains on manual hold, gets SQL remediation, gets QDM/QI-Core mapping remediation, or gets CQL authoritative promotion.
  - [ ] Document denominator, numerator, exclusion, and initial-population differences.
  - [ ] Require clinical/product sign-off before promotion.
- [ ] Broaden official measure coverage.
  - [ ] Add official CMS FHIR/QI-Core bundles or a documented fetch/cache process for the target reporting year.
  - [ ] Start with a small portfolio: CMS122, CMS165, CMS130, CMS125, and one non-diabetes measure.
  - [ ] Add known MADiE test-deck subjects and expected MeasureReports for each.
  - [x] Surface `testDeckCoverage` in `MeasureDossier` instead of returning `null`.
- [ ] Operationalize CQL engine loading.
  - [ ] Define bounded cohort export limits.
  - [ ] Add scheduled or operator-triggered QI-Core/QDM loading jobs with row counts and last-success timestamps.
  - [ ] Add engine health, loaded artifact count, and loaded patient count to admin health.
  - [ ] Capture engine version in measure reports and reconciliation runs.
- [ ] Schedule QDM bridge operations.
  - [ ] Add nightly or tenant-triggered QDM shadow refresh where safe.
  - [ ] Add backpressure and limits for large populations.
  - [ ] Add issue triage states for `qdm_bridge_issue` beyond open issue listing.
- [ ] Complete reporting artifact validation.
  - [x] Add deterministic QRDA Cat I, QRDA Cat III, and QPP sample fixtures plus local structural validation scripts and external validator handoff hooks.
  - [ ] QRDA Cat I: fill complete QDM patient data entries and validate with Cypress/CVU for the target reporting year.
  - [ ] QRDA Cat III: validate aggregate reports with Cypress/CVU and reporting-year template IDs.
  - [ ] QPP JSON: validate against the current QPP submission API sandbox or official schema/test harness.
  - [ ] FHIR MeasureReport: validate representative individual, subject-list, and population reports.
  - [ ] DEQM: keep current validator pass and add more representative care-gap bundles.
- [ ] Add reporting admin UX.
  - [x] Surface per-measure dossier artifact binding, version, latest MeasureReport summary, and structured test-deck status in Measure Governance.
  - [ ] Add value-set drilldown, latest SQL/CQL count comparison, promotion mode actions, and drift summary controls.
  - [ ] Export controls for QRDA Cat I/III, QPP JSON, DEQM, and FHIR MeasureReport.
  - [ ] Clear "not submission-ready" warnings until external validation passes.

Acceptance gate:

- [ ] At least three target measures have official artifacts, test decks, reconciliation, dossier evidence, and a documented promotion decision.
- [ ] QRDA Cat I/III and QPP artifacts pass an external validator or official sandbox.
- [ ] Measure Governance can explain why each measure is SQL authoritative, CQL shadow, CQL authoritative, or held.

### Phase 6 - Clinical Workflow Completion

Objective: replace narrow/demo clinical behavior with workflows that can survive real clinical use.

- [ ] Expand rules engine coverage.
  - [x] Move beyond only care-gap-overdue in `apps/api/src/workers/rules-engine.ts`.
  - [ ] Add rule families for high-risk labs, medication safety, referral leakage, abnormal vitals, no-show risk, and unresolved critical alerts.
  - [x] Add rule-specific duplicate suppression and auto-resolution logic.
  - [x] Add tests for each rule family.
- [x] Implement `population_summary` in the AI insights worker or remove the job type.
  - [x] Define input shape, cohort scope, output JSON schema, storage target, and PHI policy.
  - [x] Add BAA/consent gating behavior for cloud providers.
- [x] Replace synthetic surveillance with a real feed path.
  - [x] Keep simulated streamer as a demo-only mode.
  - [x] Add an HL7 v2 MLLP, FHIR Subscription, or vendor event ingestion adapter.
  - [x] Add replay fixtures and operator-visible source status.
- [x] Complete SuperNote AI narrative decision.
  - [x] Either wire LLM narrative with strict clinical safety gates or keep deterministic assembly and remove deferred claims.
  - [x] Add provenance, clinician review, edit tracking, and no-autosign policy.
- [x] Harden orders/writeback workflows.
  - [x] Define which order actions are internal recommendations versus EHR writeback.
  - [x] Keep writeback behind tenant and role feature flags.
  - [x] Add audit and clinical review for all generated orders.
- [ ] Close the loop on clinical outcomes.
  - [x] Track gap closure, order completion, referral completion, alert acknowledgment, and patient outreach outcomes.
  - [ ] Add outcome dashboards with real denominators and time windows.

Acceptance gate:

- [ ] Clinical workflows are clearly labeled as read-only, recommendation-only, or writeback-capable.
- [ ] No workflow silently depends on synthetic data unless demo mode is explicit.
- [ ] AI output cannot enter the chart or recommendations without provenance and review controls.

### Phase 7 - Frontend Product And Operator UX Completion

Objective: expose the production-critical back-end state to users and operators.

- [x] Add SMART launch completion UX.
  - [x] Add route that consumes one-time `smart_handoff` codes.
  - [x] Show recoverable failure states for missing/expired handoff, resolver failures, and Patient import failures.
  - [x] Redirect into the patient workspace only after a valid session/patient binding exists.
  - [ ] Show richer launch progress and patient-context resolution status.
- [ ] Expand EHR Integrations UI.
  - [x] Add Bulk job status and file-level import status.
  - [x] Add Bulk schedule next-run and last-success visibility.
  - [x] Add tenant readiness evidence for discovery, launch, callback, and handoff health.
  - [x] Add tenant sync-status metrics for crosswalk, ingest, Bulk import, Bulk schedule, worker failures, and overdue polls.
  - [x] Add bounded conflict/stale-resource drilldowns and structured issue actions to patient sync status.
  - [x] Add Bulk-linked import/QDM replay summaries and QDM normalization replay controls.
  - [x] Add broader import-run detail view outside the Bulk job table.
  - [x] Add capability drift warnings and backend token checks.
  - [x] Add manual diagnostic/readiness actions for Bulk controls.
  - [x] Add audit coverage for Bulk kickoff/import/resume/cancel controls.
- [ ] Expand System Health UI.
  - [x] Add worker registry, queue depths, failed jobs, and EHR Bulk readiness/status visibility.
  - [x] Add EHR sync alert configuration, last-dispatch status, and manual dispatch.
  - [x] Add CQL engine smoke-asset status plus FHIR/DEQM validator artifact status.
  - [x] Add scheduler next/last-completed run detail, Redis alert pub/sub counts, and Solr core detail.
  - [x] Add deeper EHR/FHIR tenant readiness with stored SMART/FHIR discovery, backend-services, token, launch, FHIR/backend-token failure, and Bulk resource coverage evidence.
  - [x] Distinguish disabled, degraded, blocked, and healthy semantics for EHR/FHIR tenant readiness.
- [ ] Expand Measure Governance UI.
  - [x] Make it multi-measure by default instead of CMS122-centric.
  - [ ] Add direct actions for dossier generation, shadow refresh, test-deck run, promotion dry-run, and promotion request.
    - [x] Add backend-config-driven measure selection.
    - [x] Add audited shadow-mode, semantic-drift dossier generation, promotion dry-run, and guarded promotion-request controls where current reconciliation/MeasureReport evidence exists.
    - [ ] Add a real test-deck run action after a backend runner/official harness exists.
    - [ ] Add an operator-triggered CQL shadow-refresh job instead of read-only bridge run status only.
  - [ ] Add review states and assignee/comment support for semantic drift rows.
- [ ] Finish security settings UX.
  - [x] Replace disabled 2FA panel with TOTP setup/disable UX.
  - [x] Add active sessions and device/session revoke list.
  - [ ] Add password change/reset state clarity.
- [ ] Raise route-level UX quality.
  - [x] Audit loading, empty, error, and permission-denied states on every route.
  - [ ] Add responsive checks for admin tables and patient workspace.
  - [ ] Add keyboard/focus coverage for dense clinical tables.
  - [ ] Use consistent icons and buttons for actions.
- [x] Audit design-system drift.
  - [x] Resolve stale raw class findings in `docs/DESIGNLOG.md`.
  - [x] Check raw color usage, dark/light token consistency, focus rings, and accessible contrast.

Acceptance gate:

- [ ] Operators can diagnose EHR, queue, worker, measure, and ingestion state without database access.
- [ ] A clinician can complete the core patient/care-gap workflow on desktop and mobile-width layouts.
- [ ] Playwright covers authenticated navigation and at least one workflow per major product area.

### Phase 8 - Observability, Deployment, And Incident Readiness

Objective: make production operation boring and auditable.

- [ ] Add operational dashboards.
  - [ ] API latency/error rate.
  - [x] Worker queue depth and failure rate.
  - [x] Nightly scheduler success/failure.
  - [x] EHR launch success/failure.
  - [x] Bulk import throughput/failure.
  - [x] CQL engine availability and measure evaluation failures.
  - [x] DB migration and materialized-view refresh status.
- [x] Add alerting.
  - [x] Health degraded.
  - [x] Worker queue stalled.
  - [x] Nightly job missed.
  - [x] EHR token refresh/readiness failures through PHI-safe EHR sync alert snapshots.
  - [x] FHIR 401/403/429 and backend token auth/rate-limit spikes through PHI-safe EHR sync alert snapshots.
  - [x] Bulk job stuck past vendor polling window through PHI-safe EHR sync alert snapshots.
  - [x] QDM bridge blocking issues.
  - [x] CQL engine unavailable.
- [x] Finish deployment runbooks.
  - [x] Normal deploy.
  - [x] Rollback.
  - [x] DB migration failure.
  - [x] Worker restart.
  - [x] Solr rebuild.
  - [x] CQL sidecar restart/reload.
  - [x] EHR tenant incident.
  - [x] Bulk import replay.
- [ ] Verify backup and restore.
  - [ ] Database restore drill.
  - [ ] Solr/index rebuild from DB.
  - [ ] Measure artifact and report retention.
  - [ ] Audit log retention and export.
- [ ] Finalize environment separation.
  - [x] Local, demo, staging, production env templates.
  - [x] Secret reference strategy for EHR client secrets and private keys.
  - [ ] No demo credentials in production.
  - [x] Explicit public registration, demo quick-fill, and Swagger policy.
- [x] Add release checklist.
  - [x] Validation gates.
  - [x] Migration state.
  - [x] Health checks.
  - [x] E2E.
  - [x] Standards validators.
  - [x] Smoke tests against public hostname.
  - [x] Rollback readiness.

Acceptance gate:

- [ ] An operator can deploy, rollback, diagnose, and replay ingestion using documented commands.
- [ ] Production health covers dependencies and background work, not only API plus database.
- [ ] Public-hostname smoke checks are part of every release.

### Phase 9 - Compliance, Customer Readiness, And Go-Live

Objective: close the non-code work required for real clinical/customer use.

- [ ] Complete PHI handling review.
  - [x] Logging: API Pino structured logs redact configured PHI/secrets/error paths.
  - [x] Sentry: API error telemetry uses sanitized `beforeSend` events and sanitized capture context.
  - [ ] AI prompts/responses.
  - [ ] Bulk files.
  - [ ] Export artifacts.
  - [ ] Audit logs.
- [ ] Prepare HIPAA/BAA evidence.
  - [ ] Vendor list.
  - [ ] AI provider mode and BAA status.
  - [ ] Hosting and backup controls.
  - [ ] Access control and audit evidence.
- [ ] Define clinical safety governance.
  - [ ] Human review policy.
  - [ ] Alert fatigue monitoring.
  - [ ] AI disclaimer and provenance.
  - [ ] Measure promotion sign-off.
  - [ ] EHR writeback restrictions.
- [ ] Prepare customer pilot checklist.
  - [ ] Tenant registration.
  - [ ] Sandbox validation.
  - [ ] Production credentials.
  - [ ] Patient matching policy.
  - [ ] Initial Bulk load.
  - [ ] Data-quality review.
  - [ ] User onboarding.
  - [ ] Support contact and incident process.
- [ ] Create training and support material.
  - [ ] Clinician workflow.
  - [ ] Admin workflow.
  - [ ] EHR integration operations.
  - [ ] Measure governance workflow.
  - [ ] Known limitations.

Acceptance gate:

- [ ] A pilot customer can be onboarded with a documented, auditable path from sandbox to production.
- [ ] Compliance evidence matches the product's actual behavior.
- [ ] Known limitations are explicit and visible to the right users.

## Priority Backlog

Recommended first sprint:

- [x] Phase 0: update README, `.env.example`, and current-state index.
- [x] Phase 1: fix Playwright API proxy behavior and add an authenticated admin smoke path.
- [x] Phase 2: decide MFA scope, then implement TOTP instead of removing MFA claims.
- [x] Phase 2: replace `INVITE_PENDING` with a real invite activation flow.
- [x] Phase 2: add invite revoke/status UX.
- [x] Phase 2: add password reset with refresh-token invalidation.
- [x] Phase 2: add active-session/device visibility and per-session revoke controls.
- [x] Phase 3: implement strict SMART issuer and ID-token/nonce validation.
- [x] Phase 3: add frontend SMART launch completion route for one-time `smart_handoff`.
- [x] Phase 3: add initial SMART launch Patient sync/import.
- [x] Phase 4: add bounded SMART launch context resource staging.
- [x] Phase 4: automatically replay SMART callback-staged resources into the QDM bridge.
- [x] Phase 4: hydrate callback-staged supported patient-context resources into EDW workspace tables.
- [x] Phase 4: add backend-services queued SMART patient-context refresh for supported resource types.
- [x] Phase 4: add FHIR next-link continuation jobs for queued patient-context refresh.
- [x] Phase 4: broaden EDW hydration to Procedure, AllergyIntolerance, and Immunization with source crosswalk targets.
- [x] Phase 4: add tenant ingest-run status API for admin sync visibility.
- [x] Phase 4: surface recent tenant ingest runs in the EHR Integrations readiness panel.
- [x] Phase 4: add tenant readiness evidence API/UI for discovery, launch, callback, and handoff evidence.
- [x] Phase 4: add PHI-safe automated Bulk worker audit and surface worker failures/overdue polls in sync status.
- [x] Phase 4: design Bulk NDJSON download/import schema and worker.
- [x] Phase 4: add manual/admin Bulk kickoff, worker polling, automatic completed-job import enqueueing, and admin Bulk status UI.
- [x] Phase 4: add manual completed-job Bulk import replay and active-job cancellation controls.
- [x] Phase 4: add tenant-specific recurring Bulk schedules and schedule next/last-success visibility.
- [x] Phase 5: surface `testDeckCoverage` in measure dossiers and document CMS122 promotion hold criteria.
- [x] Phase 7: add worker/queue and EHR readiness to System Health.

Recommended second sprint:

- [x] Add bounded patient/resource last-seen rollups to EHR sync status.
- [x] Add bounded conflict/stale-resource drilldowns and structured sync issue actions to EHR sync status.
- [x] Add Bulk replay/dead-letter runbook depth and Bulk job QDM replay drilldowns.
- [x] Add broader import-run detail pages outside the Bulk job table.
- [x] Add capability drift warnings, backend token checks, and aggregate Bulk readiness diagnostics.
- [x] Add external alert routing and stale-data/Bulk incident runbook depth.
- [x] Add PHI-safe FHIR/token failure audit and 401/403/429 sync-alert summaries.
- [ ] Add remaining EDW/local-matching breadth for tenant-specific patient-detail needs.
- [x] Add Bulk mock-server integration tests.
- [x] Add EHR admin Bulk/job status UI.
- [x] Add QRDA Cat I/III Cypress validation plan and script.
- [x] Add QPP validation plan and fixture.
- [ ] Expand role-based E2E coverage.
  - [x] Add authenticated admin protected-route smoke coverage across all top-level app routes.
  - [x] Add provider, analyst, normal-admin, and super-admin role fixtures with focused role-boundary workflow checks.
- [x] Add the EHR Bulk replay/dead-letter production runbook.
- [x] Add production runbooks for worker restart and CQL sidecar restart.

## Key Risks

- EHR integration risk: SMART launch can appear complete while still lacking vendor sandbox evidence, configured external alert delivery, access-policy attribution, and tenant-specific EDW/local-matching breadth.
- Data risk: Bulk Data kickoff/poll/import/scheduling can create a false sense of production readiness until vendor sandbox evidence, incident-tested replay/dead-letter workflows, vendor-specific tombstone evidence and edge cases, configured external alert delivery, and operator use of the new run-detail surface are proven.
- Measurement risk: SQL and CQL semantics can diverge; per-measure promotion must stay evidence-gated.
- Compliance risk: remaining audit-log storage/caller discipline, AI claims, Bulk files, and export artifacts must continue to match implemented controls as auth and EHR surfaces expand.
- Test risk: current E2E no longer passes with known API proxy errors, but it still needs broader authenticated provider, analyst, super-admin, EHR, and Measure Governance workflows.
- Documentation risk: stale README/design/phase docs can send future implementation work in the wrong direction.

## Open Decisions

- Which EHR vendor should be the first end-to-end production target: Epic, Oracle Cerner, or SMART generic?
- Should TOTP MFA be required for every role in production, or only elevated admin/provider roles?
- Which measure portfolio should define the first CQL promotion milestone?
- Should official CMS measure bundles be committed, vendored through a fetch script, or stored as external artifacts?
- What is the first acceptable QRDA/QPP external validation target?
- Should EHR writeback remain out of scope for the first pilot?
- What is the required production observability stack beyond current health checks and optional Sentry?
