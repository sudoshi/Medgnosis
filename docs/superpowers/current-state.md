# Medgnosis Current-State Index

Last updated: 2026-06-26

## Purpose

This index points to the active current-state, completion, and operations docs
for Medgnosis. Use it before starting new implementation work so older plans and
devlogs do not override the current codebase state.

## Active Completion Track

- [Application completion plan](plans/2026-06-18-medgnosis-application-completion-plan.md) - phased todo list for unfinished application work.
- [EHR integration current-state devlog](devlogs/2026-06-17-ehr-integration-current-state-devlog.md) - current EHR/SMART/Bulk/QDM integration status and gaps.
- [FHIR/QDM bridge completion devlog](devlogs/2026-06-18-fhir-qdm-dimensional-bridge-completion.md) - completed QDM/CQL shadow-governance milestone and CMS122 promotion hold evidence.
- [QDM bridge operations runbook](runbooks/qdm-bridge-operations.md) - how to run and monitor QDM/CQL shadow refreshes safely.
- [EHR Bulk replay and dead-letter runbook](runbooks/ehr-bulk-replay-dead-letter.md) - PHI-light Bulk import resume, QDM replay, and worker dead-letter triage.
- [EHR sync alerts and stale-data incident runbook](runbooks/ehr-sync-alerts-stale-data.md) - PHI-safe external alert routing, stale-data triage, and Bulk incident rehearsal checklist.
- [Role and permission matrix](runbooks/role-permission-matrix.md) - current route-family RBAC expectations and backend regression evidence.
- [Validation gates runbook](runbooks/validation-gates.md) - current command matrix for local/release validation.

## Active Implementation Plans

- [EHR integration implementation plan](plans/2026-06-16-ehr-integration-implementation-plan.md)
- [FHIR/QDM dimensional bridge implementation plan](plans/2026-06-17-fhir-qdm-dimensional-bridge-implementation-plan.md)
- [Phase 1 CQL engine plan](plans/2026-06-13-phase-1-cql-engine.md)
- [Phase 2 FHIR dQM plan](plans/2026-06-13-phase-2-fhir-dqm.md)
- [Phase 3 SMART/CDS Hooks/alert burden plan](plans/2026-06-14-phase-3-smart-cdshooks-alertburden.md)
- [UX/UI improvement plan](plans/2026-06-15-ux-ui-improvement-plan.md)

## Current Authority Model

- SQL star-schema measure results remain authoritative by default.
- CQL/QDM output is available for shadow evaluation, reconciliation, and
  governance review.
- Measure authority changes only through per-measure promotion configuration and
  accepted reconciliation evidence.
- EHR integration has tenant registry, strict SMART launch validation, short-lived
  app handoff binding, initial SMART launch Patient import/crosswalk, bounded
  launch-context staging for supported patient-context resources with first-pass
  EDW hydration and automatic QDM replay, backend-services queued refresh with
  continuation jobs, recent tenant ingest-run sync visibility, diagnostics,
  tenant readiness evidence, onboarding scripts, SMART lifecycle audit/rate
  limits, Bulk kickoff/polling ledger support, completed-job NDJSON import
  worker support, manual/admin Bulk kickoff, vendor-safe worker polling,
  PHI-safe automated Bulk worker audit, automatic import enqueue on completion,
  manual completed-job import replay, failed-file-only resume, active-job
  cancellation, tenant-specific recurring Bulk schedules, optional manifest
  checksum/size validation, Bulk Patient EMPI/crosswalk seeding, and admin Bulk
  job/file/schedule visibility with worker failure/overdue-poll sync metrics.
  First-pass EDW hydration now includes `DocumentReference`, `DiagnosticReport`,
  `MedicationDispense`, and `MedicationAdministration` in addition to the core
  patient workspace resources.
- Production checkpoint on 2026-06-25 deployed `e467846`; production migrations
  are current through `091_ehr_medication_events.sql`, post-deploy migration
  dry-run reported 90 applied migrations and no pending migrations, and both
  local and public health endpoints returned healthy.
  The EHR sync-status surface now includes bounded patient/resource rollups with
  stale-patient counts in addition to tenant/resource rollups.
- Follow-up production checkpoint on 2026-06-25 deployed the patient/resource
  sync-rollup application release `25b6f7d`; `medgnosis-api`,
  `medgnosis-worker`, and `medgnosis-auto-deploy` were active, public health was
  healthy, and production migration dry-run still reported no pending migrations.
- Follow-up production checkpoint on 2026-06-25 deployed the sync-status
  drilldown release `ab87e84`; tenant sync status now returns bounded crosswalk
  conflict targets, stale patient/resource drilldowns, and structured sync issue
  source/recommended-action metadata. Focused API tests, API/web typechecks,
  API/web lint, API/web builds, `git diff --check`, a read-only production
  tenant-2 service probe, `./scripts/deploy-production.sh`, public health,
  service status, and production migration dry-run passed; production still
  reports 90 applied migrations and no pending migrations.
- Follow-up production checkpoint on 2026-06-25 deployed the Bulk replay
  drilldown release `9ba7246`; Bulk job status now returns import/QDM replay
  summaries, poll-count and normalized-row visibility, a QDM replay action for
  linked Bulk ingest runs, durable manual QDM replay metadata, and the EHR Bulk
  replay and dead-letter runbook. Focused API tests, full `npm run test`,
  API/web typechecks, API/web lint, API/web builds, `git diff --check`, a
  read-only production tenant-2 Bulk summary probe, `./scripts/deploy-production.sh`,
  public health, service status, and production migration dry-run passed;
  production still reports 90 applied migrations and no pending migrations.
- Follow-up production checkpoint on 2026-06-25 deployed the ingest-run
  drilldown release `95af0de`; recent EHR ingest runs now return PHI-light
  operational summaries, selectable keyboard-accessible run details outside the
  Bulk table, context/EDW/QDM counts, QDM replay state, linked Bulk job ids,
  recommended actions, and an ingest-run QDM replay control. Focused API tests,
  full `npm run test`, API/web typechecks, API/web lint, API/web builds,
  `git diff --check`, a read-only production tenant-2 ingest-run summary probe,
  `./scripts/deploy-production.sh`, public health, service status, and
  production migration dry-run passed; production still reports 90 applied
  migrations and no pending migrations.
- Follow-up production checkpoint on 2026-06-25 deployed the readiness token
  diagnostics release `1c560e0`; tenant readiness evidence now includes
  previous-snapshot CapabilityStatement drift, required Bulk resource capability
  coverage, backend-services credential/token age evidence, aggregate Bulk
  diagnostics, and an explicit audited backend token-check admin action. Focused
  API tests, full `npm run test`, API/web typechecks, API/web lint, API/web
  builds, `git diff --check`, a read-only production tenant-2 readiness probe,
  `./scripts/deploy-production.sh`, public health, service status, and
  production migration dry-run passed; production still reports 90 applied
  migrations and no pending migrations.
- Follow-up production checkpoint on 2026-06-25 deployed the EHR sync alert
  dispatch release `1eba305`; System Health now includes EHR Sync Alerts
  configuration and last-dispatch state, admins can manually dispatch PHI-safe
  aggregate alert snapshots, nightly dispatch is available behind explicit env
  flags, webhook payloads are signed when `EHR_SYNC_ALERT_WEBHOOK_SECRET` is set,
  and the stale-data/Bulk incident runbook is linked from this index. Focused
  API/web tests, full `npm run test`, API/web typechecks, API/web lint, API/web
  builds, and `git diff --check` passed before release.
- Follow-up continuation added PHI-safe failed FHIR read/search and backend-token
  request audit rows plus EHR sync-alert summaries for FHIR 401/403/429, backend
  token auth failures, rate-limit spikes, and repeated FHIR network failures.
- This continuation adds PHI-safe QDM/CQL promotion attempt audits for validated
  dry-run, promoted, and failed CQL-authoritative promotion requests, with
  aggregate-only coverage, materialization, and guardrail-failure metadata.
- Follow-up continuation added PHI-safe EHR tenant mutation audit coverage for
  tenant/client upserts, diagnostics/test-connection actions, backend-token
  checks, manual refresh/replay controls, QDM/CQL load actions, Bulk
  schedule/export/import/resume/cancel controls, and worker-adjacent state
  transitions. Audit details record tenant/org/vendor, action flags, ids,
  statuses, and aggregate counts only; they do not store secrets, tokens, raw
  FHIR/NDJSON payloads, patient identifiers, group identifiers, or engine URLs.
- Follow-up continuation added API PHI redaction hardening for production Pino
  structured logs and Sentry error telemetry. Shared redaction configuration now
  covers common auth/secrets/patient identifiers, request query/params/body
  fields, settings secrets, and server-error message/stack paths, while Sentry
  `beforeSend` and captured exception context are sanitized before delivery.
- Follow-up continuation tightened production HTTP hardening. API Helmet options
  now use an explicit production CSP with named script/connect/img/font/form
  directives, HSTS remains production-only, local/test CSP remains disabled for
  tooling, and Swagger registration is blocked in production even if
  `SWAGGER_ENABLED=true` is accidentally set.
- Follow-up continuation closed the public auth exposure policy gap.
  `/auth/providers` now returns effective public-registration and demo quick-fill
  policy, production public registration requires both
  `PUBLIC_REGISTRATION_ENABLED=true` and
  `PUBLIC_REGISTRATION_ALLOW_PRODUCTION=true`, demo quick-fill is suppressed in
  production, and the login/register UI hides or blocks those surfaces when the
  backend policy disables them.
- Follow-up continuation documented the backend role/permission matrix and added
  regression coverage for admin-role inheritance, super-admin-only auth-provider
  governance, super-admin grants, EHR admin inheritance, and Bulk tenant/org
  mismatch rejection before import side effects.
- Follow-up continuation added auth-provider last-test evidence to System
  Health. OIDC provider tests now write PHI-free success/failure evidence, auth
  health aggregates provider status, and the admin System Health tab shows
  provider availability, issuer/error detail, and latest test timing.
- Follow-up continuation added OIDC JIT and group reconciliation regression
  coverage for denied groups, active analyst/admin JIT creation, inactive mapped
  account denial, additive admin promotion, super-admin preservation, and email
  alias linking.
- Follow-up continuation closed another admin audit gap: admin user profile
  updates and user deactivation now emit PHI-light audit rows with role/active
  state and changed-field categories rather than email or name details.
- Follow-up continuation scoped admin-user listing/mutations/invite controls and
  actor-user audit-log reads by org for normal admins while keeping
  `super_admin` global, including regression coverage for org-scoped reads,
  out-of-org mutation denial, malformed org claims, super-admin target-org user
  creation, and global super-admin audit visibility.
- Follow-up continuation added PHI-light audit rows and regression coverage for
  remaining admin FHIR endpoint mutations, auth-provider test attempts,
  materialized-view refresh runs, clinical-note lifecycle mutations, and manual
  surveillance tick runs. Audit details intentionally avoid endpoint URLs,
  provider test error text, SOAP note content, chief complaint text, and
  amendment reason text.
- Follow-up continuation expanded Playwright coverage with configurable E2E
  ports and a catch-all mocked authenticated protected-route smoke that walks
  every top-level protected route in `apps/web/src/App.tsx` without production
  credentials or API proxy leakage.
- EMPI Phase 0 schema is deployed. Legacy patient identity backfill is available
  as an explicit operator script, `npm run db:backfill-empi -- --dry-run`, but
  has not been applied to production.
- EHR production completion still requires remaining EDW/local-matching breadth
  for tenant-specific patient-detail needs, exercised Bulk replay/dead-letter
  incident evidence, vendor sandbox evidence, a configured external alert
  destination, and live stale-data/Bulk incident evidence using the new runbook.

## First Implementation Priorities

1. Keep README, env docs, and validation runbooks truthful.
2. Expand role-based Playwright workflow coverage beyond the current login, MFA, password-reset, invite, settings, admin smoke, and protected-route smoke paths.
3. Keep MFA lifecycle coverage current as auth provider and session behavior evolves.
4. Capture vendor sandbox evidence and exercise the new ingest-run detail panel against sandbox or failed-file replay incidents.
5. Exercise the Bulk replay/dead-letter and EHR sync alert runbooks against a failed-file, stale-data, or sandbox replay incident.
6. Extend the worker/EHR/Bulk System Health visibility with CQL, FHIR, and DEQM readiness.
7. Broaden role-based E2E beyond the current auth/admin/settings/protected-route smoke paths.
