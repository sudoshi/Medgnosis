# Epic on FHIR — App Registration Prep (Medgnosis Sandbox)

- **Date:** 2026-06-20
- **Scope:** Repo-side preparation for the two Epic sandbox app registrations (Backend Services + SMART App Launch) described in `EPIC_REGISTRATION_HANDOFF.md`.
- **Status:** LIVE. Tenant id=2 in the **production** registry with both Epic Client IDs. Propagation cleared; backend `private_key_jwt` token exchange succeeds and authenticated FHIR reads work against sandbox patient Camila Lopez (`erXuFYUfucBZaryVksYEcMg3`). Re-onboarded with the expanded 15-resource scope set (Epic sandbox grants all backend scopes automatically). See `2026-06-20-fhir-edw-expansion-closeout.md` for the end-to-end verification.

## Registered Client IDs (Epic sandbox, non-production)

- App A — Backend Services: `f9bbfd9b-c3dd-4aca-a040-de458de56e05` (registry client id=7, `backend_services`, `private_key_jwt`)
- App B — SMART App Launch: `2fe29423-25b7-46f8-a69e-454f4d3ead72` (registry client id=6, `smart_launch`, `public_pkce`)
- Tenant: id=2, `Epic Sandbox`, vendor=epic, environment=sandbox

## Smoke evidence (2026-06-20 16:12 UTC, ~45s after registration)

`node --env-file=../../.env.production --import tsx/esm src/scripts/smoke-ehr-onboarding.ts --tenant-id 2 --api-base-url https://medgnosis.acumenus.net --request-backend-token --backend-scope "..."`

- PASS tenant registry · PASS SMART discovery (auth+token+ehrLaunch+standalone, CapabilityStatement 200) · PASS SMART launch client · PASS backend client config (private_key_jwt ready, kid resolves, JWKS reachable, 1 key) · PASS public JWKS endpoint (HTTPS, RS384)
- FAIL backend token exchange → `invalid_client` (expected: client not yet propagated; assertion is well-formed — Epic returned `invalid_client`, not an assertion/alg error)
- SKIP FHIR read (needs the access token)

## Re-run after propagation (≤ 60 min)

```bash
cd /home/smudoshi/Github/Medgnosis/apps/api && \
node --env-file=../../.env.production --import tsx/esm src/scripts/smoke-ehr-onboarding.ts \
  --tenant-id 2 \
  --api-base-url https://medgnosis.acumenus.net \
  --request-backend-token \
  --backend-scope "system/Patient.rs system/Observation.rs system/Condition.rs"
```

Once `backend token exchange` flips to PASS, add a FHIR read against the sandbox test patient to verify §4.4(c):

```bash
# Mint a token first (the smoke prints scope/expiry on success); then:
node --env-file=../../.env.production --import tsx/esm src/scripts/smoke-ehr-onboarding.ts \
  --tenant-id 2 --api-base-url https://medgnosis.acumenus.net \
  --request-backend-token --backend-scope "system/Patient.rs" \
  --fhir-access-token "<ACCESS_TOKEN>" --fhir-read Patient/erXuFYUfucBZaryVksYEcMg3
```

## ORIGINAL PREP NOTES (pre-registration)


## Key reconciliation against the handoff (illustrative names → actual code)

| Handoff concept | Actual Medgnosis implementation |
|---|---|
| Shared signing key / JWKS | **Already live in production.** `kid=medgnosis-prod-backend-20260617130907`, `alg=RS384`, RSA-3072, served at `https://medgnosis.acumenus.net/.well-known/jwks.json` (Apache proxies `/.well-known/jwks.json` → API:3081). No tunnel needed; no new key generated. |
| Private key storage | `.env.production` → `EHR_BACKEND_PRIVATE_JWK_JSON` (gitignored, host-only). Public set in `EHR_BACKEND_PUBLIC_JWKS_JSON`. Never in DB. |
| JWT `exp` ≤ 5 min (Epic req) | `DEFAULT_ASSERTION_TTL_SECONDS = 300` in `backendServices.ts`. ✓ |
| Tenant/client registry | **DB-backed**, not env Client IDs. Register via `npm run ehr:onboard`. |
| Backend scopes | SMART **v2** syntax (`.rs`), emitted by `scopePolicy.ts` / epic adapter. |
| SMART redirect URI | `<api-base>/api/v1/ehr/launch/callback` (derived from `onboardingProfile.ts`). |
| Private key ref kid | Must be `medgnosis-prod-backend-20260617130907` (the live published kid), **not** the profile's default `backend-key-1`. |

## Verified now (no Client IDs required)

- `GET https://medgnosis.acumenus.net/.well-known/jwks.json` → HTTP 200, one key, `{kid: medgnosis-prod-backend-20260617130907, alg: RS384, kty: RSA, use: sig}`. Public reachable over HTTPS. ✓
- Private JWK kid in `.env.production` matches the published public kid; signer selects key by kid. ✓
- JWT assertion TTL = 300 s (≤ 5 min). ✓
- Private key gitignored (`.env.*` ignored, `.env.example` excepted); no key in source or DB rows. ✓

## Values for the Epic registration forms (human, in browser)

**Shared (both apps):**
- Non-Production JWK Set URL: `https://medgnosis.acumenus.net/.well-known/jwks.json`
- Is Confidential Client: **checked**
- Can Register Dynamic Clients: **unchecked**

**App A — Backend Services**
- Application Name: `Medgnosis Backend Services (Sandbox)`
- Application Audience: **Backend Systems**
- Endpoint URI: *(leave blank)*
- Requires Persistent Access: **unchecked**
- Scopes (SMART v2 system):
  `system/Patient.rs system/Encounter.rs system/Condition.rs system/Observation.rs system/MedicationRequest.rs system/AllergyIntolerance.rs system/Procedure.rs system/Immunization.rs`

**App B — SMART App Launch (Clinician/Admin)**
- Application Name: `Medgnosis Clinician App (Sandbox)`
- Application Audience: **Clinicians or Administrative Users**
- Redirect URI (Endpoint URI): `https://medgnosis.acumenus.net/api/v1/ehr/launch/callback`
  - (Add `http://localhost:3002/api/v1/ehr/launch/callback` too if testing locally.)
- Requires Persistent Access: **unchecked** (check only for standalone + offline)
- Scopes (patient-context EHR launch):
  `openid fhirUser launch patient/Patient.r patient/Encounter.rs patient/Condition.rs patient/Observation.rs patient/MedicationRequest.rs patient/AllergyIntolerance.rs patient/Procedure.rs`

> Non-prod Client IDs can take up to ~60 min to propagate before token requests succeed.

## Staged post-registration command (run after Client IDs return)

Replace the two placeholders with the real Non-Production Client IDs:

```bash
npm run ehr:onboard -- \
  --vendor epic \
  --environment sandbox \
  --name "Epic Sandbox" \
  --fhir-base-url https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4 \
  --api-base-url https://medgnosis.acumenus.net \
  --smart-client-id '<APP_B_LAUNCH_CLIENT_ID>' \
  --backend-client-id '<APP_A_BACKEND_CLIENT_ID>' \
  --backend-private-key-ref 'env:EHR_BACKEND_PRIVATE_JWK_JSON?kid=medgnosis-prod-backend-20260617130907&alg=RS384' \
  --run-smoke
```

Then verify (Backend Services token → Patient read → `$export`):

```bash
npm run ehr:smoke -- --tenant-id <NEW_TENANT_ID>
# Sandbox test patient: erXuFYUfucBZaryVksYEcMg3
# Sandbox Bulk Group:   e3iabhmS8rsueyz7vaimuiaSmfGvi.QwjVXJANlPOgR83
```

## Open infra note

`ehr:onboard` writes to the tenant registry DB. Confirm whether to register against the host
`medgnosis` DB (prod registry) or a dev DB before running — the smoke path calls live Epic
endpoints with real signed assertions.
