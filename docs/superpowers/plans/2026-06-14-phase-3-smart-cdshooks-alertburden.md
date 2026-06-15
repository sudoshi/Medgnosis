# Phase 3 — SMART App Launch · CDS Hooks 2.0.1 · Alert-Burden Governance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax. TDD throughout.

**Goal.** Make Medgnosis embeddable in the clinician workflow and **close the CDS feedback loop**: bring CDS Hooks to full **2.0.1** conformance with a measured `/feedback` loop, ship an open **alert-burden** dashboard, and add **SMART App Launch 2.2.0** (asymmetric auth) for the FHIR/CDS surfaces — all **additive** to the protected app-user auth flow.

**Architecture.** The existing CDS Hooks surface (`routes/cds-hooks/index.ts`: discovery + `medgnosis-care-gaps` order-sign + `medgnosis-problem-list` patient-view, shared-secret auth, labeled "2.0") is extended to 2.0.1 and given a persisted feedback loop. Alerts (`routes/alerts`, `surveillance.ts`) gain governance (suppression/severity/non-interruptive defaults) + a public-facing burden summary. SMART App Launch is a **separate authorization surface** for FHIR/CDS clients — it never touches `plugins/auth.ts`'s app-user JWT, login/register, `must_change_password`, ChangePasswordModal, or Resend delivery.

**Tech Stack.** Fastify 5 · `@medgnosis/db` (postgres.js) · `jose` (asymmetric JWT verify/JWKS) · Vitest · React 19 + Vite.

---

## HARD GUARDRAILS (read `.claude/rules/auth-system.md` first)

- **The app-user auth flow MUST NOT be altered.** No edits to login/register/change-password/refresh/logout/me behavior, the `must_change_password` JWT claim, ChangePasswordModal, AuthGuard, or Resend temp-password delivery. SMART/asymmetric work is a **new, separate** authorization server for FHIR/CDS surfaces only — additive endpoints, additive config.
- **No CDS service runs unauthenticated** by the end of Phase 3 (success criterion). Inbound `fhirAuthorization` JWTs are verified; the shared-secret path remains for dev/back-compat behind config.
- **DB safety:** never `count(*)`/`GROUP BY` `phm_edw.observation`; migrations additive, applied via `claude_dev`, recorded in `_migrations`. Stage only this plan's files (concurrent sessions are active in this tree).

## Recommended order: **Epic 3.2 → 3.3 → 3.1**
3.2 (CDS Hooks 2.0.1) is the most self-contained, additive, and auth-safe — it builds directly on existing code and unblocks the feedback data the 3.3 dashboard needs. 3.1 (SMART/asymmetric auth) is the most complex + auth-adjacent and lands last, after the feedback loop is proven.

---

## EPIC 3.2 — CDS Hooks 2.0.1 conformance + closed feedback loop  *(do first)*

**Create:** `apps/api/src/services/cds/feedback.ts` (+ `.test.ts`), `packages/db/migrations/059_cds_alert_feedback.sql`, `apps/api/src/services/cds/fhirAuthorization.ts` (+ `.test.ts`).
**Modify:** `apps/api/src/routes/cds-hooks/index.ts`.

### Task 3.2.1: Alert-feedback store + migration 059
- [ ] Migration `059`: `phm_edw.cds_alert_feedback` (id, service_id, card_uuid, hook_instance, patient_id NULLABLE, outcome `accepted|overridden`, override_reason_key, override_reason_display, override_comment, accepted_suggestion_id, outcome_timestamp, created_at). Index (service_id, outcome, created_at).
- [ ] `feedback.ts`: `recordFeedback(serviceId, payload)` validates the CDS Hooks 2.0.1 feedback shape (`feedback[]` with `card`, `outcome`, `outcomeTimestamp`, `acceptedSuggestions[]`, `overrideReason{reason:Coding, userComment}`) and inserts rows. `serviceBurden(serviceId?)` returns accepted/overridden counts + override-reason histogram. TDD (mock `sql`). Apply 059 via `claude_dev`.

### Task 3.2.2: `POST /cds-services/{id}/feedback` + Card hardening
- [ ] **Failing test** — `POST /cds-services/medgnosis-care-gaps/feedback` with a 2.0.1 feedback body persists via `recordFeedback` and returns 200.
- [ ] Implement the route. Add `overrideReasons` (a coded set) to interruptive Cards; set `indicator` tiers; add `source.topic`. Relabel discovery + comments `2.0` → `2.0.1`. Add `systemActions` support on the order-sign response where applicable.

### Task 3.2.3: Verify inbound `fhirAuthorization` JWT
- [ ] `fhirAuthorization.ts`: `verifyFhirAuthorization(req, { jwksUrl, issuer, audience })` using `jose` — validates the bearer JWT (sig via JWKS, iss, aud, exp). Config-gated (`CDS_FHIR_AUTH_REQUIRED`); shared-secret remains the dev fallback. TDD with a local JWKS keypair (mirror the Aurora/Parthenon validator test pattern).
- [ ] Wire it as a preHandler on the service POSTs (NOT discovery — discovery stays open per spec). Add the third service **`medgnosis-order-select`** (order-select hook) reusing the care-gap detector.

> **CHECKPOINT after 3.2** — confirm discovery + 3 services + `/feedback` pass a CDS Hooks 2.0.1 conformance check; no service runs unauthenticated when `CDS_FHIR_AUTH_REQUIRED=true`.

---

## EPIC 3.3 — Alert-burden governance + open dashboard

**Create:** `apps/api/src/services/cds/alertGovernance.ts` (+ `.test.ts`), `apps/api/src/routes/cds/burden.ts` (+ `.test.ts`), `apps/web/src/pages/AlertBurdenPage.tsx`. **Modify:** `routes/alerts/index.ts`, `rulesEngine.ts`, `AlertsPage.tsx`, migration `060`.

### Task 3.3.1: Governance model + migration 060
- [ ] Migration `060`: `phm_edw.alert_suppression` (scope `site|user`, scope_id, service_id, suppressed_until, reason) + a `severity` + `interruptive` column path for alerts (additive). `alertGovernance.ts`: `isSuppressed(serviceId, ctx)`, `severityTier(card)`, `defaultNonInterruptive(card)` (cards are non-interruptive unless severity ≥ tier). TDD.

### Task 3.3.2: Burden API + public dashboard
- [ ] **Failing test** — `GET /cds/burden` returns per-service accepted/overridden rates + override-reason histogram (from `cds_alert_feedback`), respecting provider scoping. Implement.
- [ ] `AlertBurdenPage.tsx`: per-service override-rate cards + reason breakdown + trend; link from AlertsPage. (Bates "monitor and respond," operationalized.)

> **CHECKPOINT after 3.3** — dashboard reports real accepted/overridden rates per service.

---

## EPIC 3.1 — SMART App Launch 2.2.0 + asymmetric JWT  *(do last; auth-adjacent, additive only)*

**Create:** `apps/api/src/services/smart/smartConfiguration.ts` (+ `.test.ts`), `apps/api/src/routes/smart/index.ts` (`.well-known/smart-configuration`, authorize, token), `apps/api/src/services/smart/backendServices.ts` (+ `.test.ts`). **Modify:** `routes/fhir/index.ts` (scope enforcement), `config.ts` (additive SMART config).

### Task 3.1.1: `.well-known/smart-configuration` + capability advertisement
- [ ] **Failing test** — `GET /.well-known/smart-configuration` returns the SMART 2.2.0 document (authorization_endpoint, token_endpoint, grant_types incl. `client_credentials`, code_challenge_methods `S256`, token_endpoint_auth_methods incl. `private_key_jwt`, `token_endpoint_auth_signing_alg_values_supported` ES384/RS384, capabilities, scopes_supported with granular v2 scopes). Implement (static + config-driven). No app-user auth changes.

### Task 3.1.2: SMART Backend Services (asymmetric client auth)
- [ ] **Failing test** — `POST /smart/token` with a `client_assertion` (`private_key_jwt`, ES384/RS384) verified against the registered client JWKS issues a scoped FHIR access token; invalid assertion → 401. Use `jose`. TDD with a local keypair.
- [ ] Enforce granular v2 scopes on `routes/fhir` (read-only confirm: `patient/*.rs`, `system/*.rs`). This is a **new token type** — it does NOT replace or read the app-user JWT.

### Task 3.1.3: EHR + standalone launch (authorization code + PKCE)
- [ ] **Failing tests** — authorize endpoint issues a code bound to PKCE `code_challenge` + launch context; token endpoint exchanges it (PKCE `code_verifier`) for a scoped token. Standalone + EHR `launch` param. Implement, server-side single-use codes (mirror the OIDC handshake-store pattern).

> **CHECKPOINT after 3.1** — a SMART app launches against the FHIR server with granular scopes + asymmetric auth; app-user login/flow verified unchanged.

---

## Self-Review
- **Spec coverage:** 3.1→Epic 3.1; 3.2→Epic 3.2; 3.3→Epic 3.3. Success criteria: SMART launch w/ asymmetric auth (3.1.2/3.1.3), CDS Hooks 2.0.1 + `/feedback` (3.2), burden dashboard (3.3), no unauthenticated CDS service (3.2.3).
- **Auth guardrail:** every SMART/auth item is a NEW surface; zero edits to the protected app-user flow. 3.2.3 keeps shared-secret as dev fallback so existing integrations don't break.
- **Sequencing:** 3.2 first (self-contained, feeds 3.3 data), 3.3 next, 3.1 last (highest complexity/auth-adjacency).

## Execution Handoff
Recommended: execute **Epic 3.2** first (TDD, additive, no auth-flow risk), checkpoint, then 3.3, then 3.1. Each DB-touching task is a checkpoint. `jose` is the only new dependency (asymmetric JWT/JWKS) — add via `npm i jose --legacy-peer-deps`.
