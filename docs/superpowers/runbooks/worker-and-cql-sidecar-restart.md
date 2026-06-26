# Worker And CQL Sidecar Restart Runbook

Last updated: 2026-06-26

## Purpose

This runbook covers restart and recovery for the production background worker
and the opt-in CQL clinical-reasoning sidecar. It is written for the current
host-systemd production deployment at `/home/smudoshi/Github/Medgnosis`.

SQL measure results remain authoritative by default. Do not switch
`MEASURE_EVALUATOR=cql` globally during incident response unless a governed CQL
promotion path has already been accepted.

## Worker Restart

Use this path when System Health, EHR sync status, or journal logs show stalled
or failed background processing.

### 1. Check Current State

```bash
systemctl is-active medgnosis-api medgnosis-worker medgnosis-auto-deploy
systemctl is-enabled medgnosis-worker
journalctl -u medgnosis-worker -n 100 --no-pager
curl -fsS --max-time 10 https://medgnosis.acumenus.net/health
```

If `medgnosis-worker` is masked, do not treat restart failure as a code
deployment failure. The deploy script intentionally lets API release continue
when the worker unit is unavailable or masked.

### 2. Restart Only The Worker

```bash
sudo systemctl restart medgnosis-worker
sleep 5
systemctl is-active medgnosis-worker
journalctl -u medgnosis-worker -n 100 --no-pager
```

Do not clear Redis or BullMQ keys as a first response. Existing retry and failed
job retention are the recovery surface for Bulk imports, patient-context
refresh, rules, AI insights, measure calculation, and nightly scheduler work.

### 3. Restart API Plus Worker After Code Or Env Changes

```bash
./scripts/deploy-production.sh
```

The deploy script builds all workspaces, restarts `medgnosis-api`, restarts
`medgnosis-worker` when the unit exists and is not masked, and verifies the
local health endpoint.

### 4. Verify Recovery

```bash
systemctl is-active medgnosis-api medgnosis-worker medgnosis-auto-deploy
curl -fsS --max-time 10 https://medgnosis.acumenus.net/health
curl -fsS --max-time 10 https://medgnosis.acumenus.net/api/v1/auth/providers
```

Then use the admin UI:

- `/admin` -> `System Health` for worker and queue status.
- `/admin` -> `EHR Integrations` for Bulk job/file/schedule status, failed-file
  resume, overdue poll signals, and sync issue actions.
- `/admin` -> `Measure Governance` -> `Bridge Ops` for QDM bridge run state.

### 5. Escalation Rules

Escalate before destructive queue actions when:

- The same job fails repeatedly with a PHI or token-safety concern.
- Bulk import files are partially complete and failed-file-only resume should be
  used instead of a broad replay.
- The worker starts but immediately exits more than twice after a restart.
- `medgnosis-api` is unhealthy after worker recovery.

For Bulk import replay, use
`docs/superpowers/runbooks/ehr-bulk-replay-dead-letter.md`.

## CQL Sidecar Restart

The CQL engine is HAPI FHIR with clinical reasoning enabled. It is optional for
normal SQL-authoritative dashboards, but required for CQL/QDM smoke checks,
MeasureReport evidence, and reconciliation work.

### 1. Identify The Active Mode

Host-published smoke/reconciliation sidecar:

```bash
docker ps --filter 'name=medgnosis-cql-engine' --filter 'name=medgnosis-cql-engine-smoke'
echo "${CQL_ENGINE_URL:-http://localhost:18080/fhir}"
```

Docker compose profile sidecar:

```bash
docker compose --profile cql ps cql-engine
```

The compose sidecar is internal-only by design. The API reaches it at
`http://cql-engine:8080/fhir` on the compose network. Host smoke scripts use a
published port and default to `http://localhost:18080/fhir`.

### 2. Check Readiness

```bash
export CQL_ENGINE_URL="${CQL_ENGINE_URL:-http://localhost:18080/fhir}"
curl -fsS --max-time 10 "$CQL_ENGINE_URL/metadata" >/dev/null
```

If metadata is unavailable, check logs:

```bash
docker logs --tail 100 medgnosis-cql-engine 2>/dev/null || true
docker logs --tail 100 medgnosis-cql-engine-smoke 2>/dev/null || true
```

### 3. Restart The Compose Sidecar

Use this when the CQL sidecar is managed by `docker compose --profile cql`.

```bash
docker compose --profile cql restart cql-engine
```

If the container is missing or unhealthy:

```bash
docker compose --profile cql up -d cql-engine
```

Because the compose sidecar is internal-only, verify readiness from the compose
network:

```bash
docker compose exec -T api node -e \
  "fetch('http://cql-engine:8080/fhir/metadata').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
```

### 4. Recreate The Host Smoke Sidecar

Use this for host-run smoke scripts and bounded QDM/CQL reconciliation.

```bash
docker rm -f medgnosis-cql-engine-smoke 2>/dev/null || true
ENGINE_PORT=18080 bash scripts/cql-qdm-smoke.sh
```

`scripts/cql-qdm-smoke.sh` starts the sidecar if metadata is unavailable, loads
CMS122 executable artifacts, runs the QDM-to-QI-Core loader, and evaluates the
measure. It requires `DATABASE_URL`; load the intended environment explicitly:

```bash
set -a
. ./.env.production
set +a
ENGINE_PORT=18080 QDM_PATIENT_IDS=1,2,3 bash scripts/cql-qdm-smoke.sh
```

Known production note: sourcing `.env.production` currently emits warnings for
the unquoted group names on lines 84 and 85. The migration and smoke commands
still run when the required environment variables are present.

### 5. Validate CQL Recovery

Basic engine proof:

```bash
bash scripts/cql-engine-smoke.sh
```

Official CMS122 test-deck proof:

```bash
bash scripts/cql-realmeasure-smoke.sh
```

Bounded non-authoritative bridge refresh:

```bash
set -a
. ./.env.production
set +a
QDM_PATIENT_IDS=1,2,3 \
QDM_CQL_PERIOD_START=2026-01-01 \
QDM_CQL_PERIOD_END=2026-12-31 \
npm run qdm:shadow-refresh
```

After a CQL outage, compare the new QDM bridge run against the previous run in
`/admin` -> `Measure Governance` -> `Bridge Ops` before taking any promotion or
governance action.

## Release And Incident Evidence

Record this evidence after either restart path:

- Command used and timestamp.
- `systemctl is-active medgnosis-api medgnosis-worker medgnosis-auto-deploy`.
- Public `/health` response.
- Relevant `journalctl` or `docker logs` tail with PHI omitted.
- For CQL: metadata readiness plus the smoke or bounded shadow-refresh result.
- Any follow-up Bulk replay, QDM bridge issue, or Measure Governance decision.
