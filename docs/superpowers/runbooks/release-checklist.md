# Medgnosis Release Checklist

Last updated: 2026-06-26

## Purpose

This is the ordered gate sequence to run before and during a Medgnosis
production release. It reuses the command matrix from
[validation-gates.md](validation-gates.md) and the deploy/rollback procedures
from [deployment-runbooks.md](deployment-runbooks.md). Env-file safety is in
[environment-separation.md](environment-separation.md).

Run from the repository root unless a step says otherwise. Record the output of
each gate; "evidence before assertions" - do not mark a step done without the
command output.

## 0. Pre-Flight

- [ ] Confirm the working branch and the exact commit under release.
  ```bash
  cd /home/smudoshi/Github/Medgnosis
  git branch --show-current
  git log -1 --oneline
  git status --short
  ```
- [ ] Confirm you are releasing the intended ref. Deployment builds from the
  working tree, not from `origin/main` (see deployment-runbooks section "Production Topology").

## 1. Code Gates (typecheck, lint, test, build, whitespace)

Baseline local gates:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
git diff --check
```

For release evidence, use the no-cache aggregate gate so Turbo executes rather
than replays cached logs:

```bash
npm run verify:release
git diff --check
```

`verify:release` forces `typecheck`, `lint`, `test`, and `build`. Expected as of
2026-06-26: typecheck passes across API/DB/shared/Solr/web; lint passes for API
and web; unit tests pass across API/web/shared/Solr; production build passes for
all packages; `git diff --check` reports no whitespace errors.

- [ ] `npm run verify:release` passed.
- [ ] `git diff --check` clean.

## 2. Migration List And Dry-Run (explicit DATABASE_URL)

Migration commands require `DATABASE_URL`. Use the parsed-env-file helper so
unquoted values (such as OIDC group names) are not shell-executed:

```bash
npm run release:migrations -- --env-file .env.production
```

This runs `db:migrate:list` then `db:migrate:dry-run`. Expected as of
2026-06-26: 91 applied migrations, no pending migrations. Sourcing
`.env.production` directly still emits the known lines 84-85 warnings for
unquoted group names; that warning alone is not a failure.

For a local/demo target, use the `.env` file instead:

```bash
npm run release:migrations
```

- [ ] Applied/pending counts recorded for the target env.
- [ ] No unexpected pending migrations (or the migration plan is explicitly
  approved per deployment-runbooks section 3).

## 3. Standards Validators (FHIR, DEQM, QRDA, QPP)

These are the actual release gates; System Health only reports asset presence and
does not run these validators on every poll.

```bash
./scripts/fhir-validate.sh
./scripts/deqm-validate.sh
./scripts/qrda-validate.sh
./scripts/qpp-validate.sh
```

Expected as of 2026-06-26: FHIR and DEQM each `0 errors / 0 warnings` in offline
terminology mode by default (`FHIR_VALIDATOR_TX=n/a`,
`FHIR_VALIDATOR_TX_CACHE=n/a`); QRDA Cat I/Cat III fixtures parse as CDA XML; QPP
fixture matches the expected `measurementSets`/`electronicHealthRecord` shape.

Official Cypress CVU+ (QRDA) and QPP sandbox/API validation stay opt-in until
external validators and credentials are configured (`QRDA_CVU_CAT1_CMD`,
`QRDA_CVU_CAT3_CMD`, `QPP_VALIDATE_CMD`). A deliberate live FHIR terminology check
needs both a tx server and an isolated cache path:

```bash
FHIR_VALIDATOR_TX=http://tx.fhir.org FHIR_VALIDATOR_TX_CACHE=/tmp/medgnosis-tx-cache ./scripts/fhir-validate.sh
FHIR_VALIDATOR_TX=http://tx.fhir.org FHIR_VALIDATOR_TX_CACHE=/tmp/medgnosis-tx-cache ./scripts/deqm-validate.sh
```

- [ ] `./scripts/fhir-validate.sh` clean.
- [ ] `./scripts/deqm-validate.sh` clean.
- [ ] `./scripts/qrda-validate.sh` clean.
- [ ] `./scripts/qpp-validate.sh` clean.

## 4. Web E2E

```bash
npm run test:e2e --workspace=apps/web
PLAYWRIGHT_PORT=<free-port> npm run test:e2e:release --workspace=apps/web
```

`test:e2e:release` runs the focused role-workflow and admin operational smoke
specs that CI runs before the full suite on `main` pushes. The Playwright web
server sets `VITE_REALTIME_ALERTS_ENABLED=false` because the frontend-only E2E
suite does not start the API websocket endpoint. This remains a shallow frontend
suite; it uses fully mocked APIs and no production credentials.

- [ ] `npm run test:e2e --workspace=apps/web` passed.
- [ ] `PLAYWRIGHT_PORT=<free-port> npm run test:e2e:release --workspace=apps/web` passed.

## 5. Deploy

Follow [deployment-runbooks.md](deployment-runbooks.md) section 1. Preferred:

```bash
./scripts/deploy-production.sh
```

- [ ] Deploy script exited 0 (or the auto-deploy daemon logged `Deploy complete - health 200`).

## 6. Health Checks (local 3081 + public hostname)

```bash
curl -fsS --max-time 10 http://127.0.0.1:3081/health
curl -fsS --max-time 10 https://medgnosis.acumenus.net/health
```

Both must return `status: healthy`.

- [ ] Local `http://127.0.0.1:3081/health` healthy.
- [ ] Public `https://medgnosis.acumenus.net/health` healthy.

## 7. Public-Hostname Smoke (auth/docs exposure policy)

```bash
curl -fsS --max-time 10 https://medgnosis.acumenus.net/api/v1/auth/providers
curl -sS -o /tmp/medgnosis-register-check -w '%{http_code}\n' \
  -X POST https://medgnosis.acumenus.net/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"validation@example.invalid","firstName":"Validation","lastName":"Check"}'
curl -sS -o /tmp/medgnosis-swagger-check -w '%{http_code}\n' \
  http://127.0.0.1:3081/docs/json
```

Expected production defaults: `/auth/providers` reports
`registration_enabled:false` and `demo_quick_fill_enabled:false`; public register
returns `403`; the Swagger route returns `404`.

- [ ] `/auth/providers` policy correct (registration and demo quick-fill disabled).
- [ ] Public registration returns `403`.
- [ ] Swagger route returns `404`.

## 8. Service And Dependency Status

```bash
systemctl is-active medgnosis-api medgnosis-worker medgnosis-auto-deploy medgnosis-cdc
```

A `masked`/`inactive` worker is intentional and not a release failure. Then in
the admin UI confirm:

- [ ] System Health -> Standards Readiness shows CQL/FHIR/DEQM asset status.
- [ ] System Health shows Redis pub/sub, Solr core, and scheduler queue timing.
- [ ] System Health shows aggregate EHR/FHIR tenant readiness with
  disabled/degraded/blocked/healthy semantics and 24-hour FHIR/backend-token
  failure counts from stored evidence.

## 9. Rollback-Readiness Confirmation

Before declaring the release complete, confirm a rollback is possible:

- [ ] Last known-good ref identified: `git log --oneline -n 10`.
- [ ] The rollback path in [deployment-runbooks.md](deployment-runbooks.md)
  section 2 applies (revert commit, or redeploy prior good ref).
- [ ] Migration-aware rollback understood: schema is forward-only; an added
  migration is not auto-reverted by a code rollback, and no
  destructive/forced migration is run without explicit approval.
- [ ] Post-deploy migration dry-run still reports no pending migrations
  (section 2 rerun after deploy).

## Release Evidence Block

Record and attach to the release/devlog:

- [ ] Commit or diff under release.
- [ ] `npm run verify:release`
- [ ] `git diff --check`
- [ ] `npm run release:migrations -- --env-file <target-env>`
- [ ] `./scripts/fhir-validate.sh`
- [ ] `./scripts/deqm-validate.sh`
- [ ] `./scripts/qrda-validate.sh`
- [ ] `./scripts/qpp-validate.sh`
- [ ] `npm run test:e2e --workspace=apps/web`
- [ ] `PLAYWRIGHT_PORT=<free-port> npm run test:e2e:release --workspace=apps/web`
- [ ] `./scripts/deploy-production.sh` exit and service status.
- [ ] Local `/health` and public `/health`.
- [ ] Public `/auth/providers`, register `403`, Swagger `404`.
- [ ] Rollback-readiness confirmation.
