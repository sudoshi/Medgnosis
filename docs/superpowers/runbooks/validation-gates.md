# Medgnosis Validation Gates Runbook

Last updated: 2026-06-18

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

Migration commands require `DATABASE_URL` to be present in the shell
environment. The scripts do not load `.env.production` automatically.

Production-style check:

```bash
set -a
. ./.env.production
set +a
npm run db:migrate:list
npm run db:migrate:dry-run
```

Expected result as of 2026-06-19:

- Applied migrations: 78
- Pending migrations in this worktree before apply: `080_invite_activation_tokens.sql`, `081_password_reset_tokens.sql`, `082_refresh_token_session_metadata.sql`, `083_totp_mfa_lifecycle.sql`, and `084_smart_launch_handoff_binding.sql`

For local demo work, use the `.env` file that points at the local demo database:

```bash
set -a
. ./.env
set +a
npm run db:migrate:list
```

## Standards Validation

FHIR fixtures:

```bash
./scripts/fhir-validate.sh
```

Expected result as of 2026-06-18:

- 0 errors
- 0 warnings

DEQM Gaps-in-Care fixture:

```bash
./scripts/deqm-validate.sh
```

Expected result as of 2026-06-18:

- 0 errors
- 0 warnings

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
  authenticated provider workflows, full admin workflows, EHR admin workflows, measure
  governance, or patient workspace behavior.

## Release Evidence Checklist

Before a release or handoff, record:

- [ ] Commit or diff under review.
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `git diff --check`
- [ ] `npm run db:migrate:list` with explicit env
- [ ] `npm run db:migrate:dry-run` with explicit env
- [ ] `./scripts/fhir-validate.sh`
- [ ] `./scripts/deqm-validate.sh`
- [ ] `npm run test:e2e --workspace=apps/web`
- [ ] Local `/health`
- [ ] Public `/health`

## Known Gaps To Close

- Add QRDA Cat I/Cat III Cypress/CVU validation once reporting artifacts are
  complete enough for submission-grade checks.
- Add QPP JSON validation against an official schema or sandbox.
- Expand Playwright to authenticated role-based workflows.
- Add worker, queue, CQL sidecar, EHR tenant, and Bulk Data checks to admin
  health and release smoke checks.
