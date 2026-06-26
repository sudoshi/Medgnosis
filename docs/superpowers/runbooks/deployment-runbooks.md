# Medgnosis Deployment Runbooks

Last updated: 2026-06-26

## Purpose

This runbook gives concrete command sequences for production deployment and
recovery. It is written for the current host-systemd production deployment of
`/home/smudoshi/Github/Medgnosis` on `beastmode`, where Apache serves the SPA
and proxies the API.

For the deploy/rollback gate sequence and the release evidence matrix, use
[release-checklist.md](release-checklist.md) and
[validation-gates.md](validation-gates.md). For env-file safety, see
[environment-separation.md](environment-separation.md).

## Production Topology

- `medgnosis-api.service` runs `node dist/server.js` from `apps/api`, reads
  `/home/smudoshi/Github/Medgnosis/.env.production`, and listens on `3081`.
- `medgnosis-worker.service` runs `node dist/worker.js` from `apps/api` with the
  same env file. It may be `masked`; a masked worker is intentional and does not
  fail an API release.
- `medgnosis-auto-deploy.service` runs `scripts/auto-deploy.sh` as root. It polls
  the working tree every 60 s, and when tracked source under `apps/api/src`,
  `apps/web/src`, `packages/shared/src`, or `packages/db/src` is newer than the
  last successful deploy hash, it runs `npm run build`, fixes `apps/web/dist`
  permissions, restarts the API (and worker when present), and advances the
  deploy hash only on a real `200` from `http://localhost:3081/health`.
- `medgnosis-cdc.service` runs the Solr CDC listener from
  `packages/solr/dist/sync/cdc-listener.js` with the same env file.
- Apache vhost: `DocumentRoot apps/web/dist`, `ProxyPass /api/ -> 127.0.0.1:3081`,
  public hostname `https://medgnosis.acumenus.net`.

Deploy trigger model: deployment is driven by changed source files in the local
working tree, not by a `git pull`. No deploy script fetches or pulls from
`origin/main`. Whoever updates the checkout (manual `git pull`, or a direct edit)
is responsible for the working-tree state the daemon picks up. To deploy a
specific commit, check it out first, then let the daemon rebuild or run the
deploy script directly.

## 1. Normal Deploy

### 1.1 Preferred Path (explicit deploy script)

Run the validation gates first; see [release-checklist.md](release-checklist.md).

```bash
cd /home/smudoshi/Github/Medgnosis
git status --short
git log -1 --oneline
./scripts/deploy-production.sh
```

`scripts/deploy-production.sh` builds all workspaces, normalizes
`apps/web/dist` permissions, restarts `medgnosis-api`, restarts
`medgnosis-worker` when it exists and is not masked, then verifies local health.
A non-zero exit means a service is not active; inspect with
`journalctl -u medgnosis-api -n 50`.

### 1.2 Auto-Deploy Path (daemon)

If `medgnosis-auto-deploy` is active and the working tree already holds the
intended source, no manual command is required. The daemon rebuilds within one
60 s interval and only advances its deploy hash on a `200` health check.

Watch it:

```bash
journalctl -u medgnosis-auto-deploy -f
```

A line like `Deploy complete - health 200` confirms success. A line like
`ERROR: API failed HTTP health check after restart` means the daemon left the
deploy hash unadvanced and will retry next interval once a fix lands.

### 1.3 Post-Deploy Verification (always)

```bash
systemctl is-active medgnosis-api medgnosis-worker medgnosis-auto-deploy medgnosis-cdc
curl -fsS --max-time 10 http://127.0.0.1:3081/health
curl -fsS --max-time 10 https://medgnosis.acumenus.net/health
curl -fsS --max-time 10 https://medgnosis.acumenus.net/api/v1/auth/providers
```

Expected: services active (or worker `inactive`/`masked` by design), both health
endpoints `status: healthy`, and `/auth/providers` reporting
`registration_enabled:false` plus `demo_quick_fill_enabled:false` in production.

## 2. Rollback

Rollback re-deploys a prior good ref. Because deployment is build-from-source,
rollback means putting the working tree back to a known-good commit and
rebuilding.

### 2.1 Identify The Last Good Ref

```bash
cd /home/smudoshi/Github/Medgnosis
git log --oneline -n 10
```

Choose the last commit whose release evidence (from the current-state index or a
devlog) recorded a healthy public `/health` and no pending migrations.

### 2.2 Revert The Bad Commit (preferred, keeps history forward)

Use this when one commit is at fault and no schema change has to be undone.

```bash
git revert --no-edit <bad-sha>
./scripts/deploy-production.sh
```

### 2.3 Redeploy A Prior Good Ref (when multiple commits are involved)

```bash
git checkout <good-sha>
./scripts/deploy-production.sh
```

After validation, return the branch to a forward-moving state rather than leaving
the checkout detached: cut a revert commit on `main` that matches the good ref,
or `git checkout main` once a corrected commit has landed. Do not force-push
shared history.

### 2.4 Migration-Aware Rollback

Migrations are forward-only and serialized with a PostgreSQL advisory lock. A
code rollback does NOT roll back schema. If the bad release added a migration:

- A purely additive migration (new table/column/index) is normally safe to leave
  in place under the older code; verify the older code does not require the new
  object to be absent.
- If the older code cannot run against the new schema, do not improvise a
  down-migration. Stop and follow section 3, and escalate before any destructive
  schema change. Never run a `migrate --force`-style command; production schema
  loss has occurred from forced migrations in sibling projects.

### 2.5 Verify

Run section 1.3, then confirm migration state with section 3.1.

## 3. DB Migration Failure Recovery

Migrations require `DATABASE_URL`. Prefer the parsed-env-file helper so unquoted
values (such as OIDC group names) are not shell-executed.

### 3.1 Establish Current State (read-only)

```bash
cd /home/smudoshi/Github/Medgnosis
npm run release:migrations -- --env-file .env.production
```

This runs `db:migrate:list` then `db:migrate:dry-run`. Record applied count and
pending list. As of 2026-06-26 production reports 91 applied and no pending.

Sourcing `.env.production` directly still emits warnings on lines 84-85 for
unquoted group names; that warning alone does not indicate a migration failure.

### 3.2 If A Migration Failed Mid-Run

The migrate runner takes a PG advisory lock and tracks checksums in
`public._migrations`. If a run failed:

1. Re-run the dry-run (3.1) to see which migration is pending and whether a
   partial object exists.
2. Inspect the failing migration file under `packages/db/migrations/` to know
   exactly what it attempts.
3. Confirm no advisory lock is stuck:
   ```bash
   set -a; . ./.env.production; set +a
   psql "$DATABASE_URL" -c "SELECT pid, locktype, granted FROM pg_locks WHERE locktype = 'advisory';"
   ```
   If a lock is held by a dead session, terminate only that session's `pid` after
   confirming no migrate process is running.
4. Once the cause is fixed (or the object is manually reconciled with explicit
   confirmation), apply forward:
   ```bash
   set -a; . ./.env.production; set +a
   npm run db:migrate
   ```
5. Re-run 3.1 to confirm no pending migrations remain.

Never reach for a forced/destructive migrate to "get past" a failure. Soft,
additive, forward-only recovery only. Escalate before dropping or rewriting any
production object.

### 3.3 Recover The App After A Schema Issue

If the API or worker is unhealthy because code expects schema that is not yet
applied (or vice versa), bring code and schema into agreement first, then:

```bash
sudo systemctl restart medgnosis-api
sudo systemctl restart medgnosis-worker
```

Verify with section 1.3.

## 4. Worker Restart

The worker hosts the BullMQ queues (rules, AI insights, measure calculator,
population finder, close-the-loop, risk model, auto-orders, AMP, MTM,
surveillance, data quality, cohort flags, nightly scheduler, EHR patient-context
refresh, EHR Bulk import).

```bash
systemctl is-enabled medgnosis-worker
journalctl -u medgnosis-worker -n 100 --no-pager
sudo systemctl restart medgnosis-worker
sleep 5
systemctl is-active medgnosis-worker
```

Do not clear Redis/BullMQ keys as a first response; retry and failed-job
retention are the recovery surface. A `masked` worker is not a deploy failure.
For the full worker and CQL recovery procedure, escalation rules, and post-restart
evidence, use
[worker-and-cql-sidecar-restart.md](worker-and-cql-sidecar-restart.md).

## 5. Solr Core Rebuild From DB

Solr provides search acceleration with graceful PG fallback when `SOLR_ENABLED`
is false or Solr is unreachable; a Solr outage degrades search but does not take
the app down. There are two cores: `search` (patients + care gaps) and `clinical`
(encounters, conditions, observations, medications).

### 5.1 Check State

```bash
cd /home/smudoshi/Github/Medgnosis
systemctl is-active medgnosis-cdc
journalctl -u medgnosis-cdc -n 100 --no-pager
docker compose -f docker-compose.demo.yml ps
```

The CDC listener (`medgnosis-cdc.service`) keeps cores current via PG
LISTEN/NOTIFY with a Redis overflow queue. Rebuild from DB only when cores are
stale, empty, or schema-mismatched.

### 5.2 Pause CDC During A Full Rebuild

```bash
sudo systemctl stop medgnosis-cdc
```

### 5.3 Reindex From PostgreSQL

Reindex requires `DATABASE_URL` (and Solr connection env). Load the production
env file, then run the workspace reindex scripts:

```bash
set -a; . ./.env.production; set +a
npm run reindex:search --workspace=@medgnosis/solr
npm run reindex:clinical --workspace=@medgnosis/solr
```

Or both in one step:

```bash
set -a; . ./.env.production; set +a
npm run reindex:all --workspace=@medgnosis/solr
```

The full-reindex script takes a PG advisory lock and writes `phm_edw.etl_log`
rows tagged `solr-reindex:...`, so progress is auditable.

### 5.4 Restart CDC And Verify

```bash
sudo systemctl start medgnosis-cdc
systemctl is-active medgnosis-cdc
```

Then confirm search works through the public app (global search returns results)
and check the admin System Health Solr core rows for per-core health and document
counts. The reindex `etl_log` rows should show `success` with expected row counts.

## 6. CQL / HAPI Sidecar Restart And Reload

The CQL engine is a HAPI FHIR clinical-reasoning sidecar. It is optional for
SQL-authoritative dashboards (SQL remains the default measure evaluator) but
required for CQL/QDM smoke, MeasureReport evidence, and reconciliation. Do not
flip `MEASURE_EVALUATOR=cql` globally during an incident unless a governed
promotion path is already accepted.

Quick identification and restart:

```bash
docker ps --filter 'name=medgnosis-cql-engine' --filter 'name=medgnosis-cql-engine-smoke'
docker compose --profile cql ps cql-engine
docker compose --profile cql restart cql-engine
```

If the container is missing or unhealthy:

```bash
docker compose --profile cql up -d cql-engine
```

For the full sidecar runbook, including readiness checks, host smoke-sidecar
recreation, CMS122 test-deck proofs, and bounded non-authoritative shadow
refresh, use
[worker-and-cql-sidecar-restart.md](worker-and-cql-sidecar-restart.md) and
[qdm-bridge-operations.md](qdm-bridge-operations.md).

## 7. EHR Tenant Incident Response

Use this entry point for EHR tenant problems: stale patient/resource data,
crosswalk collisions, backend-token/readiness failures, FHIR 401/403/429 spikes,
overdue Bulk polling, and Bulk import file errors.

First triage:

```bash
curl -fsS --max-time 10 https://medgnosis.acumenus.net/health
systemctl is-active medgnosis-api medgnosis-worker medgnosis-auto-deploy
```

Then work the tenant from the admin UI:

- `/admin` -> `System Health` -> `EHR Sync Alerts` for last dispatch and issue
  counts, and aggregate EHR/FHIR tenant readiness.
- `/admin` -> `EHR Integrations` for the affected tenant's readiness evidence,
  sync status, crosswalk conflicts, and Bulk job/file/schedule state.

For PHI-safe alert routing, FHIR auth/rate-limit triage, stale-data closure, and
the Bulk incident rehearsal checklist, use
[ehr-sync-alerts-stale-data.md](ehr-sync-alerts-stale-data.md). Keep EMPI
identity-merge policy decisions on the parallel identity track, not in EHR
incident response.

## 8. Bulk Import Replay

Do not duplicate the Bulk recovery procedure here. For completed-job import,
failed-file-only resume, QDM replay, dead-letter triage, the replay decision
matrix, and PHI-light operator SQL, use
[ehr-bulk-replay-dead-letter.md](ehr-bulk-replay-dead-letter.md).

Minimum first checks before any replay:

```bash
cd /home/smudoshi/Github/Medgnosis
curl -fsS https://medgnosis.acumenus.net/health
systemctl is-active medgnosis-api medgnosis-worker medgnosis-auto-deploy || true
npm run release:migrations -- --env-file .env.production
```

Confirm the worker is active and migrations are current before replaying any
Bulk import.

## Incident Evidence To Record

For every deploy, rollback, or recovery action capture:

- Command used and timestamp.
- `git log -1 --oneline` of the deployed/reverted ref.
- `systemctl is-active medgnosis-api medgnosis-worker medgnosis-auto-deploy medgnosis-cdc`.
- Local and public `/health` responses.
- `/auth/providers` policy line for production.
- `npm run release:migrations -- --env-file .env.production` applied/pending counts.
- Relevant `journalctl`/`docker logs` tail with PHI and secrets omitted.
