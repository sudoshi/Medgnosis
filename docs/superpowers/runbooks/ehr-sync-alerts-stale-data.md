# EHR Sync Alerts And Stale-Data Incident Runbook

Last updated: 2026-06-25

## Scope

Use this runbook for EHR operational incidents raised by tenant readiness or
sync-status evidence: stale patient resources, crosswalk collisions, Bulk worker
failures, overdue Bulk polling, Bulk import file errors, backend-token readiness,
and missing Bulk capability coverage.

Do not use this runbook for EMPI identity merge policy decisions. Keep EMPI work
on the parallel identity track.

## Alert Routing

External EHR sync alerting is disabled unless all of these are true in the API
environment:

- `EHR_SYNC_ALERTING_ENABLED=true`
- `EHR_SYNC_ALERT_WEBHOOK_URL` is a valid HTTPS webhook endpoint
- `EHR_SYNC_ALERT_NIGHTLY_ENABLED=true` if nightly automatic dispatch is desired

Optional settings:

- `EHR_SYNC_ALERT_WEBHOOK_SECRET` signs payloads with `x-medgnosis-signature`.
- `EHR_SYNC_ALERT_TIMEOUT_MS` defaults to `5000` and is clamped between 1 and 30
  seconds.

The payload is an operational snapshot only. It includes tenant id, org id,
vendor, environment, issue codes, severity counts, stale counts, worker counts,
Bulk schedule counts, backend token age state, and recommended operator actions.
It must not include patient ids, group ids, FHIR payloads, Bulk output URLs,
status URLs, bearer tokens, token hashes, secret refs, or raw vendor error
payloads.

## Manual Dispatch

From the Admin Panel:

1. Open Admin -> System Health.
2. Find `EHR Sync Alerts`.
3. Confirm `External` is `Configured` before expecting delivery.
4. Click `Dispatch`.
5. Confirm the dispatch result line shows `sent`, `skipped`, or `failed`.

The API route is:

```text
POST /api/v1/admin/system-health/ehr-sync-alerts/dispatch
```

Every manual dispatch writes `audit_log.action = 'ehr_sync_alert_dispatch'` with
aggregate counts and endpoint host only.

## Triage

1. Open Admin -> System Health.
2. Check `EHR Sync Alerts` for the last dispatch status and issue counts.
3. Open Admin -> EHR Integrations for the affected tenant.
4. Review tenant readiness evidence first:
   - Backend credential status
   - Backend token endpoint and latest token expiry
   - Capability drift and required Bulk resource coverage
   - Bulk diagnostics strip
5. Review sync status:
   - Worker failures and overdue polls
   - Patient/resource stale counts
   - Crosswalk conflict targets
   - Bulk import/QDM replay summaries
6. If the alert involves Bulk import files, follow
   [EHR Bulk replay and dead-letter runbook](ehr-bulk-replay-dead-letter.md).

## Stale-Data Closure

Use this checklist when the issue code is `patient_resource_stale` or
`crosswalk_stale_resource`.

- Confirm the stale count and resource type in EHR Integrations.
- Verify the tenant has backend-services credentials ready for refresh.
- Run the explicit backend token-check action if token evidence is expired or
  missing.
- Trigger a tenant or patient-context refresh from the EHR Integrations controls
  when credentials are ready.
- If Bulk is the expected bootstrap path, run or schedule a Bulk export and then
  verify import/QDM replay state.
- Re-open sync status after refresh completes.
- Confirm stale counts decrease or record the tenant/vendor reason they remain.
- Dispatch an EHR sync alert snapshot manually after closure if external alerting
  is configured.

Closure evidence should include:

- Timestamp of the refresh, Bulk run, or replay action
- Pre/post stale counts
- Pre/post issue codes
- Relevant Bulk job id or ingest-run id
- Whether QDM replay state is `replayed`, `failed`, or not applicable
- Any follow-up vendor credential or scope action

## Bulk Incident Rehearsal

Use this checklist when issue codes include `bulk_worker_failures_24h`,
`bulk_worker_poll_overdue`, `bulk_import_file_errors`, `bulk_failures_24h`, or
`bulk_schedules_overdue`.

- Confirm `medgnosis-worker` is active.
- Review System Health queue counts for `EHR Bulk import`.
- Open the tenant Bulk job panel in EHR Integrations.
- For active overdue jobs, verify the next poll time and worker logs.
- For failed import files, use failed-file-only resume after correcting importer
  errors.
- For completed jobs with staged resources and missing QDM replay, run the linked
  QDM replay action.
- If a schedule is overdue, confirm next-run and last-failure state before
  manually kicking off a new export.
- Dispatch an EHR sync alert snapshot after the rehearsal and verify audit
  details contain only aggregate counts and endpoint host.

## Verification Commands

```bash
npm run test --workspace=apps/api -- syncAlerts.test.ts systemHealth.test.ts index.test.ts
npm run test --workspace=apps/web -- SystemHealthTab.test.tsx
npm run typecheck --workspace=apps/api
npm run typecheck --workspace=apps/web
npm run lint --workspace=apps/api
npm run lint --workspace=apps/web
npm run build --workspace=apps/api
npm run build --workspace=apps/web
git diff --check
```
