# Codebase Hardening Remediation Plan

> **Status:** Implementation pass completed on 2026-06-14; deployment review remains.

**Goal:** Turn the current Medgnosis monorepo into a safer, easier-to-operate clinical app by closing high-risk exposure paths, restoring reliable validation, and creating a prioritized backlog for the larger authorization, dependency, and data-platform work.

**Current stack:** Fastify API, React/Vite web app, PostgreSQL/postgres.js, Redis/BullMQ, Solr, Docker nginx, Vitest, Playwright, Turbo.

## Initial Assessment Summary

- Public registration currently creates active analyst accounts by default.
- Refresh-token rotation is split across multiple statements without a row lock or transaction.
- Swagger UI and Solr admin are exposed through production-facing nginx/API defaults.
- Helmet disables Content Security Policy entirely.
- CDS Hooks discovery is correctly public, but POST hook handlers are unauthenticated.
- Solr query construction accepts raw query/filter values and arbitrary filter fields.
- WebSocket E2E config can accidentally reuse another app on the same local port.
- `npm audit --json` reports 24 advisories, including critical Vitest and high-severity Fastify, Vite, React Router, esbuild, tsx, lodash, and Solr-adjacent tooling issues.
- Provider scoping exists in some routes, but the sweep is incomplete. FHIR and some patient subresources need explicit patient-access checks.
- Existing migration execution has no visible checksum/lock model; that should be addressed before production data migrations grow further.

## Phase 0 - Preserve Current Worktree

- [x] Inspect `git status --short` before edits.
- [x] Treat existing package/lint/test changes and untracked CMS/QDM source documents as user work unless explicitly told otherwise.
- [x] Clean only generated Playwright artifacts from this run.
- [x] Verify baseline commands that are cheap and non-destructive.

## Phase 1 - Immediate Security Defaults

- [x] Add `PUBLIC_REGISTRATION_ENABLED=false` default in config and `.env.example`.
- [x] Return `403 REGISTRATION_DISABLED` before registration work when the flag is off.
- [x] If registration is enabled, create self-registered users inactive pending admin activation.
- [x] Update auth route tests for disabled default and enabled legacy behavior.
- [x] Move refresh-token rotation into a single transaction with `FOR UPDATE`.
- [x] Revoke expired tokens on refresh attempt.
- [x] Preserve `must_change_password` in refreshed JWT payload.
- [x] Update DB mocks for transaction-backed refresh tests.

## Phase 2 - Production Exposure Controls

- [x] Add `SWAGGER_ENABLED`, defaulting to false in production.
- [x] Register Swagger/OpenAPI only when enabled.
- [x] Enable a production CSP baseline through Helmet.
- [x] Keep local/dev ergonomics by allowing Swagger in development.
- [x] Add `CDS_HOOKS_SECRET`.
- [x] Leave `GET /cds-services` public, but require a shared secret for POST hook handlers in production or whenever a secret is configured.
- [x] Fail closed with `503` if production CDS Hooks are enabled without a configured secret.
- [x] Stop nginx from exposing `/solr/` publicly by default.
- [x] Fix nginx WebSocket routing so `/ws` and `/api/v1/ws` reach the Fastify `/ws` endpoint consistently.

## Phase 3 - Query Safety and Route Coverage

- [x] Escape Solr query strings and filter values.
- [x] Allowlist Solr filter fields.
- [x] Treat `providerId = 0` as a real value instead of skipping the filter.
- [x] Add Solr query builder tests for escaping and unknown filter rejection.
- [x] Add a shared authorization helper for admin/provider/forbidden scopes.
- [x] Apply patient-access checks to patient detail/subresource routes.
- [x] Apply provider scoping to global search PostgreSQL fallback.
- [x] Apply FHIR patient access checks to `/Patient`, `/Patient/:id`, `$everything`, `Condition`, `Observation`, and `MedicationRequest`.
- [x] Add route tests for provider-scoped denial paths before broadening the sweep.

## Phase 4 - Frontend Validation and Performance

- [x] Make Playwright use an isolated strict Vite port instead of reusing any local server.
- [x] Mock invalid-login API response in E2E so smoke tests do not require the API.
- [x] Update stale login/branding selectors.
- [x] Split heavy route pages with React lazy/Suspense.
- [x] Dynamically load React Query Devtools only in development.
- [x] Add a small API response parser guard for empty/204 responses.
- [x] Recheck production bundle size after route splitting.

## Phase 5 - Dependency Security

- [x] Upgrade Fastify and plugins to patched versions and re-run API tests.
- [x] Upgrade React Router to a patched 7.x release and rerun web unit/E2E tests.
- [x] Upgrade Vite/Vitest/coverage tooling together, because the audit fix path is coupled.
- [x] Upgrade tsx/esbuild-compatible tooling.
- [x] Upgrade bullmq/resend instead of keeping a vulnerable transitive `uuid` path.
- [x] Run `npm audit --json` after upgrades and confirm no remaining advisories.

## Phase 6 - Migration and Operations Hardening

- [x] Add migration checksums or immutable migration metadata.
- [x] Add an advisory lock around migration execution.
- [x] Make migration failure behavior explicit and documented.
- [x] Add a dry-run/list command for pending migrations.
- [x] Review Docker exposed ports: Redis and Solr should not bind publicly in production defaults.
- [x] Document required production env vars and unsafe dev defaults.

## Phase 7 - Verification Gates

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run build`
- [x] `npm run test:e2e --workspace=apps/web`
- [x] `npm audit --json`
- [x] `docker compose config --quiet`
- [x] `npm run db:migrate:dry-run`
- [x] `npm run db:migrate:list`
- [x] Manual review of nginx/API exposure paths before deployment.
