# Medgnosis Validation Gates Runbook

Last updated: 2026-06-26

## Purpose

This runbook records the validation commands that should be used before and
after substantial Medgnosis changes. It also documents the environment handling
needed for migration checks.

## Baseline Local Gates

Run from the repository root:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
git diff --check
```

Expected result as of 2026-06-18:

- Typecheck passes across API, DB, shared, Solr, and web packages.
- Lint passes for API and web targets.
- Unit tests pass across API, web, shared, and Solr.
- Production build passes across all packages.
- `git diff --check` reports no whitespace errors.

## Database Migration Gates

Migration commands require `DATABASE_URL`. Prefer the release helper below so
the env file is parsed once and passed to both migration commands without
shell-sourcing fragile values.

Production-style check:

```bash
npm run release:migrations -- --env-file .env.production
```

The helper runs `npm run db:migrate:list` and
`npm run db:migrate:dry-run` with the parsed env file. It handles unquoted
values with spaces, such as OIDC group names, without executing them as shell
commands.

Expected result as of 2026-06-26:

- Applied migrations: 91
- Pending migrations: none

For local demo work, use the `.env` file that points at the local demo database:

```bash
npm run release:migrations
```

## Standards Validation

The admin System Health tab includes a Standards Readiness section that reports
whether the CQL smoke assets, FHIR validation assets, and DEQM validation assets
are present/configured. Use the commands below for the actual release gate;
System Health intentionally does not run these expensive validators on every
poll.

FHIR fixtures:

```bash
./scripts/fhir-validate.sh
```

Expected result as of 2026-06-26:

- 0 errors
- 0 warnings
- Runs with offline terminology by default (`FHIR_VALIDATOR_TX=n/a` and
  `FHIR_VALIDATOR_TX_CACHE=n/a`) so CI is not blocked by transient
  `tx.fhir.org` cache/session failures.

DEQM Gaps-in-Care fixture:

```bash
./scripts/deqm-validate.sh
```

Expected result as of 2026-06-26:

- 0 errors
- 0 warnings
- Runs with offline terminology by default for the same deterministic CI
  behavior as the FHIR fixture gate.

To run a deliberate live terminology check, provide both a terminology server
and an isolated cache path:

```bash
FHIR_VALIDATOR_TX=http://tx.fhir.org FHIR_VALIDATOR_TX_CACHE=/tmp/medgnosis-tx-cache ./scripts/fhir-validate.sh
FHIR_VALIDATOR_TX=http://tx.fhir.org FHIR_VALIDATOR_TX_CACHE=/tmp/medgnosis-tx-cache ./scripts/deqm-validate.sh
```

QRDA Cat I/Cat III local structural fixtures:

```bash
./scripts/qrda-validate.sh
```

Expected local result as of 2026-06-26:

- `apps/api/test-fixtures/quality/qrda-cat1-sample.xml` parses as CDA XML.
- `apps/api/test-fixtures/quality/qrda-cat3-sample.xml` parses as CDA XML.
- Official Cypress CVU+ validation is skipped unless `QRDA_CVU_CAT1_CMD` and
  `QRDA_CVU_CAT3_CMD` are configured.

QPP JSON local structural fixture:

```bash
./scripts/qpp-validate.sh
```

Expected local result as of 2026-06-26:

- `apps/api/test-fixtures/quality/qpp-submission-sample.json` has the expected
  quality `measurementSets` / `electronicHealthRecord` shape and non-negative
  integer counts.
- Official QPP sandbox/API validation is skipped unless `QPP_VALIDATE_CMD` is
  configured.

## Runtime Health Checks

Local production container/proxy:

```bash
curl -fsS --max-time 10 http://127.0.0.1:3081/health
```

Public hostname:

```bash
curl -fsS --max-time 10 https://medgnosis.acumenus.net/health
```

Both should return `status: healthy` before declaring a runtime release healthy.

Public auth and docs exposure checks:

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
`registration_enabled:false` and `demo_quick_fill_enabled:false`, public
registration returns `403`, and the API Swagger route returns `404`.

## Web E2E

Run:

```bash
npm run test:e2e --workspace=apps/web
```

For the focused release-smoke path that CI runs before the full suite:

```bash
PLAYWRIGHT_PORT=<free-port> npm run test:e2e:release --workspace=apps/web
```

The Playwright web server sets `VITE_REALTIME_ALERTS_ENABLED=false` because the
frontend-only E2E suite does not start the API websocket endpoint.

Current scope:

- Login redirect when unauthenticated.
- Login form rendering.
- Invalid credential error handling.
- MFA login challenge before auth persistence and verify-to-dashboard path.
- Login page branding.
- 404 page rendering.
- Password reset request, reset completion, and invalid-token error paths.
- Invite activation missing-token, invalid-token, set-password, API-failure,
  login-redirect, and dashboard-redirect paths.
- Settings Security active-session/device list and per-session revoke path.
- Settings Security TOTP setup, recovery-code display, and disable path.
- Authenticated admin dashboard, Users tab, and invite revoke smoke paths.
- Authenticated admin operational release smoke for System Health, EHR
  Integrations, and Measure Governance with fully mocked APIs and unhandled
  request detection.
- CI runs `npm run test:e2e:release --workspace=apps/web`, which explicitly
  covers `role-workflows.spec.ts` and `admin-release-smoke.spec.ts`, before the
  full web E2E suite on `main` pushes.
- CI runs a Reporting Conformance job for local QRDA Cat I/Cat III structural
  validation and QPP JSON structural validation. Official Cypress CVU+ and QPP
  sandbox/API checks remain opt-in through external command environment
  variables.
- CI FHIR/DEQM conformance scripts run in offline terminology mode by default,
  after a 2026-06-26 GitHub Actions run failed on `tx.fhir.org` timeout and
  cache-session errors rather than fixture/profile errors.
- API admin route contract coverage includes the non-EMPI OMOP de-identified
  cohort POST path with invalid-input rejection and PHI-safe aggregate audit
  details.
- SMART launch completion path for resolved Patient, dashboard fallback, invalid
  handoff, and preserved login return.
- API SMART launch regression coverage includes missing-crosswalk Patient
  read/stage/import/crosswalk behavior and bounded launch-context resource
  staging with non-fatal per-resource errors, first-pass EDW hydration,
  automatic QDM replay, and Patient/EDW crosswalk preservation during replay.
- API EHR refresh regression coverage includes backend-services patient-context
  refresh token acquisition, bounded FHIR search/staging, EDW hydration, QDM
  replay, next-link continuation, failed-run bookkeeping, and admin/manual
  refresh enqueue validation.
- EDW hydration regression coverage includes Encounter, Condition, Observation,
  MedicationRequest, Procedure, AllergyIntolerance, and Immunization crosswalk
  targets.
- EHR admin regression coverage includes tenant ingest-run status listing with
  status/mode/resource filters for sync visibility.
- Web typecheck covers the EHR Integrations recent ingest-run sync panel typed
  against the admin status API response.

Important limitation:

- Current E2E remains a shallow frontend suite. It does not yet prove
  complete write-path admin workflows, live EHR admin workflows, live measure
  governance, or full patient workspace behavior.

## Release Evidence Checklist

Before a release or handoff, record:

- [ ] Commit or diff under review.
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `git diff --check`
- [ ] `npm run release:migrations -- --env-file <target-env>`
- [ ] `./scripts/fhir-validate.sh`
- [ ] `./scripts/deqm-validate.sh`
- [ ] Admin System Health shows Standards Readiness for CQL/FHIR/DEQM assets.
- [ ] Admin System Health shows Redis pub/sub, Solr core, and scheduler queue timing details.
- [ ] Admin System Health shows aggregate EHR/FHIR tenant readiness with disabled/degraded/blocked/healthy semantics and 24-hour FHIR/backend-token failure counts from stored evidence.
- [ ] `npm run test:e2e --workspace=apps/web`
- [ ] `PLAYWRIGHT_PORT=<free-port> npm run test:e2e:release --workspace=apps/web`
- [ ] `PLAYWRIGHT_PORT=<free-port> npm run test:e2e --workspace=apps/web -- admin-release-smoke.spec.ts`
- [ ] Local `/health`
- [ ] Public `/health`

## Known Gaps To Close

- Local QRDA/QPP fixture and structural validation scripts now run in CI;
  official QRDA Cat I/Cat III Cypress CVU+ validation and QPP sandbox/API
  validation still require the external validator/runtime and credentials.
- Live FHIR terminology-server validation remains an operator-run evidence
  item because the release CI intentionally uses offline terminology for
  deterministic profile/structure validation.
- Expand Playwright beyond current login, MFA, invite, settings,
  protected-route smoke, role-boundary, provider, analyst, admin, and
  super-admin workflows.
- Add release smoke checks that assert the existing worker, queue, CQL/FHIR/DEQM,
  EHR/FHIR tenant readiness, EHR sync alerting, and Bulk Data health sections are
  visible after deployment.
