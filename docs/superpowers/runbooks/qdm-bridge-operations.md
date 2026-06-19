# QDM Bridge Operations Runbook

Last updated: 2026-06-19

## Purpose

This runbook covers the operational path for the FHIR/QDM/CQL bridge. It keeps
QDM/CQL refreshes auditable and non-authoritative until measure governance
explicitly accepts promotion.

## Current Authority Model

- SQL bundle rows remain authoritative unless `measure_promotion_config.authoritative_source` is intentionally changed by the guarded promotion service.
- `qdm:shadow-refresh` is non-authoritative. It can refresh QDM/CQL evidence, CQL shadow star rows, reconciliation rows, and semantic drift evidence, but it forces `QDM_CQL_PROMOTION_ELIGIBLE=false`.
- Raw QDM/FHIR evidence is not duplicated in the operational ledger. Use the audited semantic drift detail route for selected patient-level evidence review.

## CMS122 Promotion Hold Criteria

Keep `CMS122v12` on `sql_bundle` authority and `cql_shadow` or manual hold until
all of these are true:

1. A full-population CQL reconciliation run is accepted, linked to the persisted
   population `MeasureReport`, and marked promotion eligible by the guarded
   reconciliation service.
2. The semantic drift dossier has been reviewed for initial-population,
   denominator, numerator, and exclusion differences between the local `DM-02`
   SQL surrogate and the published CMS122 eCQM semantics.
3. Residual denominator drift has either been remediated in QDM/QI-Core mapping
   or explicitly accepted as a governed measure-definition difference.
4. The CMS122 numerator mismatch is resolved or explicitly accepted. Local
   care-gap closure is not equivalent to the CMS122 numerator definition, which
   counts poor control, missing HbA1c/GMI result, or not-performed logic.
5. Patient-level MeasureReport evidence coverage is complete enough for
   promotion validation, including resolved patient, measure, and period
   dimensions for all promoted evidence rows.
6. The MADiE test-deck proof remains green through
   `scripts/cql-realmeasure-smoke.sh`. This is required artifact evidence, but
   it is not sufficient for production promotion without local population
   reconciliation and clinical/product sign-off.

## Operator Commands

Run from the repository root with an explicit database environment:

```bash
set -a
. ./.env.production
set +a
```

Check migration state:

```bash
npm run db:migrate:dry-run
```

Run a bounded non-authoritative QDM/CQL shadow refresh:

```bash
QDM_PATIENT_IDS=1,2,3 \
QDM_CQL_PERIOD_START=2026-01-01 \
QDM_CQL_PERIOD_END=2026-12-31 \
npm run qdm:shadow-refresh
```

For a scheduled run, set:

```bash
QDM_BRIDGE_TRIGGER=scheduled
```

The wrapper creates a `phm_edw.qdm_bridge_run` row, passes that UUID as
`QDM_RUN_ID`, runs `scripts/cql-qdm-smoke.sh`, and marks the ledger row
`completed` or `failed`.

## Admin Monitoring

Admin API:

- `GET /api/admin/qdm-bridge/status?measureCode=CMS122v12`
- `GET /api/admin/qdm-bridge/runs?measureCode=CMS122v12&operation=cql_shadow_refresh`
- `GET /api/admin/qdm-bridge/issues?measureCode=CMS122v12&status=open`

Admin UI:

- `/admin` -> `Measure Governance` -> `Bridge Ops`

Database views:

- `phm_edw.v_qdm_bridge_operational_status`
- `phm_star.v_measure_evidence_lineage`

## Replay Procedure

1. Identify the failed or stale run:

```sql
SELECT *
FROM phm_edw.qdm_bridge_run
WHERE measure_code = 'CMS122v12'
ORDER BY started_at DESC
LIMIT 10;
```

2. Verify open blocking issues:

```sql
SELECT issue_type, severity, message, created_at
FROM phm_edw.qdm_bridge_issue
WHERE measure_code = 'CMS122v12'
  AND status IN ('open', 'acknowledged')
ORDER BY created_at DESC;
```

3. Re-run with the same bounded patient/date scope. Do not widen scope during
replay unless the original failure was explicitly caused by insufficient bounds.

4. Compare `phm_star.v_measure_evidence_lineage` and reconciliation deltas before
any promotion action.

## Bad Mapping Rollback

Do not delete source FHIR staging rows or raw QDM event rows as the first move.

1. Mark affected bridge issues with `status = 'acknowledged'`.
2. Keep SQL authoritative.
3. Patch the mapper or value-set binding.
4. Re-run a bounded shadow refresh.
5. Confirm the corrected run produces expected CQL shadow rows and drift counts.
6. Only after verification, suppress obsolete issue rows or leave them as resolved
audit evidence.

## Value-Set Drift

When a value set or measure artifact changes:

1. Persist the new artifact criteria.
2. Run a bounded shadow refresh.
3. Compare reconciliation deltas against the prior run.
4. Generate a semantic drift dossier when local SQL baseline semantics differ.
5. Keep promotion blocked until the drift is clinically reviewed.

## CQL Engine Outage

If the sidecar is unavailable:

1. The wrapper records the run as `failed`.
2. Existing SQL-authoritative dashboards continue to read SQL bundle rows.
3. Do not retry in a tight loop; use the run ledger to verify outage duration and
   last successful shadow refresh.
4. After recovery, rerun the bounded shadow refresh and compare reconciliation
   deltas before taking governance action.
