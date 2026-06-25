# EHR Bulk Replay And Dead-Letter Runbook

Last updated: 2026-06-25

## Purpose

This runbook covers operational recovery for EHR Bulk Data exports, completed-job
imports, failed-file resume, and QDM replay. It is intentionally PHI-light:
operators should use job ids, ingest-run ids, file hashes, resource types, row
counts, and status timestamps instead of raw NDJSON payloads, raw output URLs,
access tokens, patient names, or demographic identifiers.

## Current Surfaces

- Admin UI: `/admin` -> `EHR Integrations` -> `Bulk Data`.
- Bulk job API: `GET /api/ehr/admin/tenants/:id/bulk-jobs?limit=5`.
- Manual Bulk import queue: `POST /api/ehr/admin/tenants/:id/bulk-imports`.
- Manual active-job cancel: `POST /api/ehr/admin/tenants/:id/bulk-jobs/:bulkJobId/cancel`.
- Manual QDM replay: `POST /api/ehr/admin/tenants/:id/ingest-runs/:runId/qdm-normalization`.
- System Health: worker/queue status and EHR Bulk readiness.
- Audit actions: `ehr_bulk_export_enqueue`, `ehr_bulk_import_enqueue`,
  `ehr_bulk_cancel`, `ehr_bulk_worker_*`, and `ehr_qdm_normalization_replay`.

## First Checks

Run from the repository root:

```bash
curl -fsS https://medgnosis.acumenus.net/health
systemctl is-active medgnosis-api medgnosis-worker medgnosis-auto-deploy || true
```

Confirm migrations are current before replaying imports:

```bash
set -a
. ./.env.production
set +a
npm run db:migrate:dry-run
```

The current `.env.production` file emits warnings on lines 84-85 when sourced;
that warning is known and does not by itself mean the migration check failed.

## Admin Recovery Flow

1. Open the EHR tenant in Admin -> EHR Integrations.
2. Refresh `Bulk status`.
3. Check the Bulk row:
   - `Import` shows files completed, rows read, resources staged, and file errors.
   - `QDM` shows `Not ready`, `Ready`, `Replayed`, or `Failed`.
   - `Status` shows a recommended operator action.
   - `Polls` shows how many vendor status polls have occurred.
4. If the job is `completed` and files are not imported, click `Import`.
5. If one or more import files failed, click `Resume`. Resume imports only failed
   or incomplete files and skips already completed file hashes.
6. If rows are staged and QDM status is `Ready` or `Failed`, click `QDM` to rerun
   staged-resource normalization for the linked ingest run.
7. If a job is still `accepted` or `in_progress` and vendor polling is overdue,
   verify `medgnosis-worker` is active before canceling or starting a new export.

## Dead-Letter Triage

Treat these as dead-letter candidates:

- Bulk worker failure audit events in the last 24 hours.
- Active Bulk jobs past `next_poll_at`.
- Import files with `status = failed`.
- Ingest runs with Bulk import metadata and nonzero `error_count`.
- QDM replay status `failed`.

Use read-only SQL for operator triage:

```sql
SELECT id, status, export_level, resource_types, poll_count,
       requested_at, next_poll_at, completed_at, ingest_run_id
FROM phm_edw.ehr_bulk_job
WHERE ehr_tenant_id = :tenant_id
ORDER BY requested_at DESC
LIMIT 10;
```

```sql
SELECT bulk_job_id, resource_type, status, rows_read, resources_staged,
       error_count, file_url_redacted, started_at, completed_at
FROM phm_edw.ehr_bulk_import_file
WHERE ehr_tenant_id = :tenant_id
ORDER BY updated_at DESC
LIMIT 25;
```

```sql
SELECT id, status, mode, resources_received, resources_staged,
       resources_updated, error_count, error_message, metadata,
       started_at, finished_at
FROM phm_edw.ehr_ingest_run
WHERE ehr_tenant_id = :tenant_id
  AND mode = 'bulk'
ORDER BY started_at DESC
LIMIT 10;
```

Do not paste raw `request_url`, `status_url`, raw file URLs, access tokens, or raw
FHIR payloads into incident notes. Use redacted URLs, hashes, counts, statuses,
and timestamps.

## Replay Decision Matrix

| State | Action |
| --- | --- |
| Completed export, zero import files | Click `Import` or enqueue `/bulk-imports` for the job id. |
| Completed export, failed import files | Click `Resume`; do not restart the full import first. |
| Staged rows, QDM `Ready` | Click `QDM` to replay normalization for the linked ingest run. |
| QDM `Failed` | Review audit/error summary, patch mapper if needed, then click `QDM` again. |
| Active job overdue | Verify worker health and vendor status; cancel only when vendor polling is unrecoverable. |
| Job failed before manifest | Start a fresh export after resolving vendor/auth/scope error. |

## Worker Logs

Use service logs for stack traces, but redact any accidental URL or token-bearing
content before sharing:

```bash
journalctl -u medgnosis-worker -n 200 --no-pager
journalctl -u medgnosis-api -n 200 --no-pager
```

## Completion Criteria

A Bulk replay incident is closed when all of these are true:

- `medgnosis-api` and `medgnosis-worker` are active.
- The public health endpoint is healthy.
- Production migration dry-run has no pending migrations.
- The affected Bulk job has no active or failed import files that require action.
- The linked ingest run has expected staged/updated counts.
- QDM replay is either `Replayed` or explicitly not required for that job.
- The incident note uses only PHI-light identifiers and redacted file references.
