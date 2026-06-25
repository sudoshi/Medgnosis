# Medgnosis Current-State Index

Last updated: 2026-06-25

## Purpose

This index points to the active current-state, completion, and operations docs
for Medgnosis. Use it before starting new implementation work so older plans and
devlogs do not override the current codebase state.

## Active Completion Track

- [Application completion plan](plans/2026-06-18-medgnosis-application-completion-plan.md) - phased todo list for unfinished application work.
- [EHR integration current-state devlog](devlogs/2026-06-17-ehr-integration-current-state-devlog.md) - current EHR/SMART/Bulk/QDM integration status and gaps.
- [FHIR/QDM bridge completion devlog](devlogs/2026-06-18-fhir-qdm-dimensional-bridge-completion.md) - completed QDM/CQL shadow-governance milestone and CMS122 promotion hold evidence.
- [QDM bridge operations runbook](runbooks/qdm-bridge-operations.md) - how to run and monitor QDM/CQL shadow refreshes safely.
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
- EMPI Phase 0 schema is deployed. Legacy patient identity backfill is available
  as an explicit operator script, `npm run db:backfill-empi -- --dry-run`, but
  has not been applied to production.
- EHR production completion still requires remaining EDW/local-matching breadth
  for tenant-specific patient-detail needs, deeper Bulk replay/dead-letter runbooks,
  vendor sandbox evidence, broader patient/resource last-success rollups,
  FHIR-read/QDM-promotion audit coverage, and alerting.

## First Implementation Priorities

1. Keep README, env docs, and validation runbooks truthful.
2. Expand role-based Playwright coverage beyond the current login, MFA, password-reset, invite, settings, and admin smoke paths.
3. Keep MFA lifecycle coverage current as auth provider and session behavior evolves.
4. Add broader patient/resource last-success rollups and capture vendor sandbox evidence.
5. Add deeper Bulk replay/dead-letter runbooks on top of the manual/admin kickoff, resume, recurring schedule, and EMPI-seeded Patient crosswalk path.
6. Extend the new worker/EHR/Bulk System Health visibility with CQL, FHIR, DEQM, and alert readiness.
7. Broaden role-based E2E beyond the current auth/admin/settings smoke paths.
