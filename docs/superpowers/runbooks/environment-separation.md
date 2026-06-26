# Medgnosis Environment Separation

Last updated: 2026-06-26

## Purpose

This runbook defines which environment file is safe in which environment, how EHR
client secrets and signing keys are referenced rather than embedded, and the
no-demo-credentials-in-production rule. It complements the README "Production
Checklist" and "Environment Variables" sections and the Phase 8 "Finalize
environment separation" plan item.

Related: [release-checklist.md](release-checklist.md),
[deployment-runbooks.md](deployment-runbooks.md),
[validation-gates.md](validation-gates.md).

## Environment Tiers

| Tier | Database | Auth/registration posture | Demo credentials | Notes |
| --- | --- | --- | --- | --- |
| Local | Local demo Postgres via `npm run demo:infra` | Local JWT auth, demo quick-fill allowed | Seeded demo users expected | Developer machine only. |
| Demo | Disposable demo/sandbox DB | Local auth, demo quick-fill allowed | Demo/sandbox data only | Shareable showcase; never real PHI. |
| Staging | Staging DB (separate from prod) | Production-like posture | None | Mirror production policy; use sandbox EHR tenants. |
| Production | `phm_edw` / `phm_star` production warehouse | Local + OIDC, public registration and demo quick-fill disabled | Forbidden | `medgnosis.acumenus.net`. |

## Env Files And Where They Are Safe

The repository tracks two templates/files and one git-ignored production file:

- `.env.example` - the committed template. Safe to read and copy anywhere. It
  contains placeholders only, never real secrets.
- `.env` - the local/demo working file, created with `cp .env.example .env`.
  Points at the local demo database and local services. Safe for local and demo
  use. Not safe to reuse as a production file.
- `.env.production` - the production runtime env file, read by
  `medgnosis-api`, `medgnosis-worker`, and `medgnosis-cdc` via
  `EnvironmentFile=`. It is git-ignored (`git check-ignore .env.production`
  confirms it is ignored) and must stay that way. Never commit it, never paste
  its contents into logs, devlogs, issues, or chat.

Safe-by-tier rule:

- Local/demo commands use `.env` (or no `--env-file`):
  ```bash
  npm run release:migrations
  ```
- Production-targeted commands use `.env.production` explicitly:
  ```bash
  npm run release:migrations -- --env-file .env.production
  ```
  Prefer the parsed `--env-file` helper over `set -a; . ./.env.production`. The
  parsed helper does not shell-execute unquoted values (such as OIDC group names)
  and avoids the known lines 84-85 sourcing warnings. When a script must source
  the file (for example the Solr reindex and CQL smoke scripts), the lines 84-85
  warnings are expected and benign as long as the required variables load.

Staging should have its own `.env.staging`-style file managed the same way as
`.env.production` (git-ignored, never committed) and must follow the production
posture below, not the demo posture.

## Production Posture (must hold before go-live)

From the README Production Checklist, enforced in production env files:

- Replace all demo credentials and localhost-only URLs.
- Set a high-entropy `JWT_SECRET`.
- Confirm `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN`, `WEB_APP_URL`,
  `FHIR_BASE_URL`, and `CQL_ENGINE_URL` point at production services.
- `PUBLIC_REGISTRATION_ENABLED=false` unless the inactive-user activation
  workflow is intentionally enabled; production exposure additionally requires
  `PUBLIC_REGISTRATION_ALLOW_PRODUCTION=true`.
- `DEMO_QUICK_FILL_ENABLED=false` in any shared or production env file; the API
  also suppresses it when `NODE_ENV=production`.
- Leave `SWAGGER_ENABLED` unset/false; the API also suppresses Swagger when
  `NODE_ENV=production`.
- Set `CDS_HOOKS_SECRET` before accepting production POST hook traffic.
- Keep Redis and Solr internal-only unless intentionally exposed.

Verify the live posture with the public-hostname smoke in
[release-checklist.md](release-checklist.md) section 7: `/auth/providers` must
report `registration_enabled:false` and `demo_quick_fill_enabled:false`, public
register must return `403`, and the Swagger route must return `404`.

## Secret-Reference Strategy For EHR Client Secrets And Private Keys

EHR onboarding and backend-services auth use OAuth2/SMART Backend Services. The
sensitive material is: EHR backend client secrets, the backend-services private
signing key (PEM or JWK), and CDS Hooks client secrets. These must be referenced,
not embedded in database rows.

Principles:

1. Store secrets in the environment, not in `ehr_tenant` (or other) table
   columns. The onboarding flow already uses reference-style fields - for
   example `EHR_ONBOARD_CDS_CLIENT_SECRET_REF` carries a reference, not the raw
   secret. Persist the reference; resolve the value from the environment at
   runtime.
2. Private signing keys load from environment variables such as
   `EHR_BACKEND_PRIVATE_KEY_PEM`, `EHR_BACKEND_PRIVATE_JWK_JSON`, or
   `EHR_PRIVATE_KEY_PEM`. Keep the private JWK/PEM in the git-ignored production
   env file (or an external secret manager that populates the env), never in the
   repository and never in a DB row.
3. Publish only the public JWKS. `/.well-known/jwks.json` exposes public signing
   keys; private keys never leave the server environment.
4. Generate keys with the provided tooling rather than hand-editing:
   ```bash
   npm run ehr:keygen -- --help
   ```
5. Onboard tenants from env-driven config so secrets are supplied as references
   and key material as env values:
   ```bash
   npm run ehr:onboard -- --help
   ```
6. PHI-safe and secret-safe audit/log discipline: audit rows and alert snapshots
   record tenant/org/vendor, action flags, ids, statuses, and aggregate counts
   only. They must never persist tokens, token hashes, secret refs resolved to
   values, raw FHIR/NDJSON payloads, Bulk output/status URLs, or engine URLs.
   Production Pino logs and Sentry telemetry are redacted for the same fields.

Rotation: when a client secret or signing key is rotated, update the production
env file (or secret manager) and restart the affected services so the new
`EnvironmentFile` value is read:

```bash
sudo systemctl restart medgnosis-api medgnosis-worker medgnosis-cdc
```

Restart, not reload - systemd does not re-read `EnvironmentFile` without a service
restart. Then re-run the EHR readiness/token-check evidence from
[ehr-sync-alerts-stale-data.md](ehr-sync-alerts-stale-data.md).

## No Demo Credentials In Production

The seeded demo users (`admin@medgnosis.app`, `dr.chen@medgnosis.app`,
`nurse.williams@medgnosis.app`, `analyst@medgnosis.app`,
`coordinator@medgnosis.app`, all with password `password`) are development-only.

Rules:

- Never seed demo users (`npm run db:seed`, `db:seed-demo`, demo quick-fill
  accounts) into a production or staging database.
- Never enable `DEMO_QUICK_FILL_ENABLED` in a production/staging env file. The API
  also suppresses it when `NODE_ENV=production`, but the env file must not enable
  it either - defense in depth.
- The protected auth system requires that the superuser `admin@acumenus.net`
  exists with `must_change_password=false`; that is a real production account, not
  a demo credential, and is governed by `.claude/rules/auth-system.md`. Do not
  conflate it with the seeded demo `admin@medgnosis.app`.
- Production go-live confirms, via the public-hostname smoke, that demo quick-fill
  is suppressed and public registration is closed.

## Verification

```bash
# Confirm production env file is git-ignored.
git check-ignore .env.production

# Confirm production policy is live (run against the public hostname).
curl -fsS --max-time 10 https://medgnosis.acumenus.net/api/v1/auth/providers
```

`/auth/providers` must report `registration_enabled:false` and
`demo_quick_fill_enabled:false` in production.
