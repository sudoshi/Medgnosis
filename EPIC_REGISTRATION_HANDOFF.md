# Epic on FHIR — App Registration Handoff (Medgnosis)

**Audience:** Claude Code, working inside the `Medgnosis` repo in VS Code.
**Goal:** Register Medgnosis with the Epic on FHIR sandbox (`fhir.epic.com`) and wire the
resulting credentials into the codebase so both interoperability surfaces work end-to-end.
**Author of intent:** Sanjay (repo owner).
**Status:** Sandbox / non-production first. Production is a later, gated step.

---

## 0. TL;DR

Medgnosis exposes **two distinct OAuth surfaces**, and Epic binds **one client ID per OAuth
flow/audience**. Therefore Medgnosis needs **two separate Epic registrations**:

| # | Epic app | Audience | Flow | Medgnosis surface it serves |
|---|----------|----------|------|------------------------------|
| **A** | Medgnosis Backend Services | **Backend Systems** | `client_credentials` + signed JWT | Bulk Data `$export` → `phm_edw` ingestion, system-to-system reads, `/.well-known/jwks.json`, background EHR sync workers |
| **B** | Medgnosis Clinician App | **Clinicians or Administrative Users** | SMART App Launch (authorization code) | EHR-launched / standalone-launch clinical + admin SPA |

**Single key strategy:** Medgnosis already serves a JWKS at `/.well-known/jwks.json` and signs
assertions with its own keys. **Use the JWKS URL for both registrations and do not configure a
client secret.** One asymmetric key path, nothing symmetric to rotate.

> **Division of labor (read this first).**
> The browser steps on `fhir.epic.com` (filling the registration form, clicking Save, copying the
> generated Client ID) **must be done by the human in the browser.** Claude Code should **not**
> attempt to automate the Epic web form, enter credentials/secrets into any web field, or sign in
> on the user's behalf. Claude Code's job is everything *inside the repo*: generating keys,
> exposing/validating the JWKS, deriving the correct redirect URI and scopes from the code, wiring
> Client IDs into env files, and running the verification scripts. Each section below is tagged
> **[HUMAN]** or **[CLAUDE CODE]**.

---

## 1. Canonical Epic sandbox facts (verify against live docs before relying on them)

These values are stable but Epic does change them; re-confirm against the linked docs.

| Thing | Value |
|-------|-------|
| Registration portal | `https://fhir.epic.com/Developer/Apps` |
| FHIR R4 base (sandbox) | `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4` |
| OAuth token endpoint (sandbox) | `https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token` |
| OAuth authorize endpoint (sandbox) | `https://fhir.epic.com/interconnect-fhir-oauth/oauth2/authorize` |
| SMART configuration | `…/api/FHIR/R4/.well-known/smart-configuration` |
| Capability statement | `…/api/FHIR/R4/metadata` |
| **JWT signing algorithm** | **`RS384`** (Epic requirement — not RS256) |
| Key type / length | RSA, **≥ 2048 bits** |
| JWT `exp` window | **≤ 5 minutes** after `iat`/`nbf` |
| Public-key registration formats | JWK Set URL **or** base64-encoded X.509 public cert |
| Sample Bulk Data Group ID (sandbox) | `e3iabhmS8rsueyz7vaimuiaSmfGvi.QwjVXJANlPOgR83` |
| Canonical sandbox test patient (Camila Lopez) | `erXuFYUfucBZaryVksYEcMg3` |

Reference docs:
- OAuth 2.0 tutorial: `https://fhir.epic.com/Documentation?docId=oauth2`
- Backend services / JWT: `https://fhir.epic.com/Documentation?docId=oauth2backend`
- Test data (sandbox patients/credentials): `https://fhir.epic.com/Documentation?docId=testpatients`
- Bulk Data: `https://fhir.epic.com/Documentation?docId=bulkdata`

> **Note on the JWT `exp` window:** Epic rejects assertions whose lifetime exceeds ~5 minutes.
> Confirm Medgnosis's JWT builder sets a short expiry, not the more common 1-hour default.

---

## 2. Prerequisites

**[HUMAN]**
- An Epic on FHIR account with access to **Build Apps** at `https://fhir.epic.com/Developer/Apps`.
- Ability to receive the auto-generated **non-production Client ID** after Save.

**[CLAUDE CODE]**
- Repo checked out, `main` branch, dependencies installed (`npm install`).
- `cp .env.example .env` already done (or do it). Read `.env.example` to learn the **exact**
  `EHR_*`, `FHIR_*`, and related variable names — **do not invent variable names**; reconcile
  every value below against what `.env.example` actually declares.
- Locate the existing EHR helper scripts and confirm their flags:
  ```bash
  npm run ehr:keygen   -- --help
  npm run ehr:onboard  -- --help
  npm run ehr:profile  -- --help
  npm run ehr:smoke    -- --help
  ```
- Confirm the JWKS route handler exists and what key(s) it publishes:
  ```bash
  rg -n "well-known/jwks" apps/api
  rg -n "jwks|JWKS|RS384|client_assertion|client_credentials" apps/api/src
  ```

---

## 3. Shared step — Key material & JWKS (do this once, used by both apps)

**[CLAUDE CODE]**

Both registrations verify Medgnosis-signed JWTs against the **same** public key, so generate one
non-production keypair and publish it via the JWKS endpoint.

1. **Generate the keypair.** Prefer the repo's own helper so key format/placement match what the
   app expects:
   ```bash
   npm run ehr:keygen -- --help    # discover exact output paths & flags first
   npm run ehr:keygen              # then run per its documented flags
   ```
   If (and only if) no helper covers this, the manual equivalent is:
   ```bash
   # Private key (PKCS#8, RSA 2048)
   openssl genrsa -out epic_sandbox_private.pem 2048
   openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
     -in epic_sandbox_private.pem -out epic_sandbox_private_pkcs8.pem
   # Public key
   openssl rsa -in epic_sandbox_private.pem -pubout -out epic_sandbox_public.pem
   # Base64 X.509 cert form (fallback registration method, see §4 option 2)
   openssl req -new -x509 -key epic_sandbox_private.pem \
     -subj "/CN=medgnosis-sandbox" -days 365 -out epic_sandbox_public_x509.pem
   ```

2. **Confirm the JWKS reflects this key.** The published JWK must include:
   - `kty: RSA`, `use: sig`, `alg: RS384`
   - a stable `kid` (the signer must set the **same** `kid` in the JWT header)
   - matching `n` / `e`
   ```bash
   # Bring the API up locally, then:
   curl -s http://localhost:<API_PORT>/.well-known/jwks.json | jq .
   ```

3. **Make the JWKS reachable by Epic over public HTTPS.** Epic fetches the JWK Set URL from the
   internet; `localhost` will not work. Pick one:
   - **Tunnel (recommended for sandbox dev):** `cloudflared tunnel --url http://localhost:<API_PORT>`
     (or `ngrok http <API_PORT>`). The public URL's `/.well-known/jwks.json` becomes the
     registered **Non-Production JWK Set URL**.
   - **Deployed staging host:** use the real `https://<staging-host>/.well-known/jwks.json`.

4. **Secrets hygiene (mandatory).**
   - The private key is **never** committed. Confirm it is git-ignored:
     ```bash
     git check-ignore -v epic_sandbox_private*.pem || echo "ADD THESE TO .gitignore"
     ```
   - Per the repo's Production Checklist, EHR secrets are stored as **environment references**, not
     raw rows in the database. Keep the private key out of `phm_edw`/`public` tables.
   - Use **separate** keypairs for non-production and production.

---

## 4. App A — Backend Services registration

### 4.1 [HUMAN] Register on fhir.epic.com

Go to `https://fhir.epic.com/Developer/Apps` → **Create**. Set the visible fields exactly:

| Field | Value | Why |
|-------|-------|-----|
| Application Name | `Medgnosis Backend Services (Sandbox)` | identifiable |
| **Application Audience** | **Backend Systems** | drives `client_credentials` |
| **Endpoint URI** | *(leave blank)* | no user redirect in backend flow; the "valid endpoint URI" error clears once audience = Backend Systems |
| Can Register Dynamic Clients | **unchecked** | not a DCR platform |
| Is Confidential Client | **checked** | server-held key |
| Requires Persistent Access | **unchecked** | backend re-auths with a fresh JWT each call; no refresh tokens |
| **Non-Production JWK Set URL** | dropdown → **`https://`**, value = your tunnel/staging `/.well-known/jwks.json` | asymmetric auth |
| Production JWK Set URL | defer (sandbox only for now) | |
| Sandbox Client Secret / Generate Secret / Store Hash | **ignore** | backend services is asymmetric-only |

**APIs / scopes section** (below what's in the screenshot): request **system-level** scopes for the
resources Medgnosis bulk-ingests. See §4.2 for how Claude Code derives the list.

**Option 2 (no public JWKS available):** instead of a JWK Set URL, upload the base64 X.509 public
cert from §3 step 1. Use this only if you cannot expose the JWKS URL; the URL approach is cleaner
because it matches Medgnosis's existing architecture and supports rotation.

Click **Save**. Epic generates a **Non-Production Client ID**. Copy it. (Non-prod client IDs can
take up to ~60 minutes to propagate before token requests succeed.)

### 4.2 [CLAUDE CODE] Derive the exact scope list from the code

Do not guess scopes. Enumerate what the app actually reads and request matching `system/` scopes.
The README advertises Patient, Condition, Observation, MedicationRequest, and `$everything`-style
bundles, plus Bulk Data. Confirm in code:
```bash
rg -n "system/|user/|patient/|\\.read|\\.rs|\\$export|\\$everything" apps/api/src | rg -i "scope|fhir|bulk"
rg -n "Resource(Type)?|fhirResources|SUPPORTED_RESOURCES" apps/api/src packages/shared
```
- Default to SMART **v1** read syntax (`system/Patient.read`, `system/Observation.read`, …) unless
  the code requests **v2** (`system/Patient.rs`). Match whichever the token/validation code expects.
- For Bulk Data group export, ensure the resource scopes cover every type the import worker parses
  from the NDJSON manifest.

Record the final list in the handoff notes and in the registration's scope selection (browser).

### 4.3 [CLAUDE CODE] Wire the Client ID into env

Open `.env.example`, find the EHR/Epic backend block, and set the real keys (names below are
illustrative — **use the actual names from `.env.example`**):
```dotenv
# --- Epic Sandbox: Backend Services (App A) ---
EHR_EPIC_SANDBOX_BACKEND_CLIENT_ID=<paste Non-Production Client ID>
EHR_EPIC_SANDBOX_TOKEN_URL=https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token
EHR_EPIC_SANDBOX_FHIR_BASE=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
EHR_EPIC_SANDBOX_JWT_ALG=RS384
EHR_EPIC_SANDBOX_PRIVATE_KEY_PATH=/secure/path/epic_sandbox_private_pkcs8.pem   # or secret ref
EHR_EPIC_SANDBOX_JWK_KID=<kid published in jwks.json>
EHR_EPIC_SANDBOX_BULK_GROUP_ID=e3iabhmS8rsueyz7vaimuiaSmfGvi.QwjVXJANlPOgR83
```
If the tenant registry is DB-backed rather than env-backed, register the sandbox tenant via the
onboarding script instead and store the key as a reference:
```bash
npm run ehr:onboard -- --help     # follow its flags to add the Epic sandbox tenant
```

### 4.4 [CLAUDE CODE] Verify Backend Services end-to-end

**(a) JWT assertion shape.** The signer must produce, with header `{ "alg": "RS384", "typ": "JWT",
"kid": "<kid>" }` and claims:
```json
{
  "iss": "<BACKEND_CLIENT_ID>",
  "sub": "<BACKEND_CLIENT_ID>",
  "aud": "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token",
  "jti": "<unique uuid per request>",
  "iat": <now>,
  "nbf": <now>,
  "exp": <now + 300>
}
```
`iss == sub == client_id`, `aud == token endpoint`, unique `jti`, `exp` ≤ 5 min.

**(b) Token request:**
```bash
curl -s -X POST "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \
  --data-urlencode "client_assertion=<SIGNED_JWT>" | jq .
```
Expect `{ "access_token": "...", "token_type": "Bearer", "expires_in": 3600, "scope": "..." }`.

**(c) FHIR read with the token:**
```bash
curl -s "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/Patient/erXuFYUfucBZaryVksYEcMg3" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Accept: application/fhir+json" | jq .name
```

**(d) Bulk Data kickoff (the real integration target):**
```bash
curl -s -X GET \
  "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/Group/e3iabhmS8rsueyz7vaimuiaSmfGvi.QwjVXJANlPOgR83/\$export" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Accept: application/fhir+json" \
  -H "Prefer: respond-async" -i
```
Capture the `Content-Location` poll URL, poll to completion, then confirm Medgnosis's NDJSON import
worker hydrates `phm_edw`. Prefer driving this through the repo's own orchestration + smoke test:
```bash
npm run ehr:smoke -- --help      # run the backend-services / bulk smoke path it provides
```

---

## 5. App B — SMART App Launch (Clinician/Admin) registration

### 5.1 [CLAUDE CODE] Derive the **exact** redirect URI and launch type from the code

Do not guess the redirect URI — it must match byte-for-byte. Find the SMART launch callback that
exchanges the authorization code (this is the EHR/SMART launch handler, **not** the external-IdP
OIDC callback Medgnosis uses for its own login):
```bash
rg -n "redirect_uri|oauth2/authorize|smart.*callback|launch|state|code_verifier|PKCE" apps/api/src apps/web/src
rg -n "WEB_APP_URL|CORS_ORIGIN|FHIR_BASE_URL" .env.example
```
Determine:
- The **redirect URI** path (e.g. `<WEB_APP_URL>/smart/callback` — confirm the real route).
- Whether Medgnosis supports **EHR launch**, **standalone launch**, or both.
- Whether the flow uses **PKCE** and/or a confidential credential (it can present the same signed
  JWT via `private_key_jwt`, reusing the §3 key — preferred — or a client secret).

For sandbox, `http://localhost:5175/<callback>` is accepted; production must be HTTPS. List **every**
environment's redirect URI you need (local, tunnel, staging) — Epic lets you add multiple.

### 5.2 [HUMAN] Register on fhir.epic.com

`https://fhir.epic.com/Developer/Apps` → **Create**:

| Field | Value |
|-------|-------|
| Application Name | `Medgnosis Clinician App (Sandbox)` |
| **Application Audience** | **Clinicians or Administrative Users** |
| **Endpoint URI** | the exact redirect URI from §5.1 (add one per environment via **Add Another URI**) |
| Can Register Dynamic Clients | **unchecked** |
| Is Confidential Client | **checked** |
| Requires Persistent Access | **unchecked** for in-EHR launch (session-scoped). **Check only** if you want standalone launch with offline access via refresh tokens. |
| Non-Production JWK Set URL | same `/.well-known/jwks.json` (`https://`) if using `private_key_jwt` |
| Client Secret | only if you opted for symmetric auth instead of the shared key (not recommended) |

**APIs / scopes:** request user-context scopes plus launch scopes:
`openid fhirUser launch launch/patient user/Patient.read user/Condition.read
user/Observation.read user/MedicationRequest.read` (+ `offline_access` only if Requires Persistent
Access is checked). Trim/extend to match §5.1 findings.

Save → copy the **Non-Production Client ID** for App B (distinct from App A's).

### 5.3 [CLAUDE CODE] Wire App B into env
```dotenv
# --- Epic Sandbox: SMART App Launch (App B) ---
EHR_EPIC_SANDBOX_LAUNCH_CLIENT_ID=<paste App B Non-Production Client ID>
EHR_EPIC_SANDBOX_AUTHORIZE_URL=https://fhir.epic.com/interconnect-fhir-oauth/oauth2/authorize
EHR_EPIC_SANDBOX_REDIRECT_URI=<exact redirect URI registered>
EHR_EPIC_SANDBOX_LAUNCH_SCOPES=openid fhirUser launch launch/patient user/Patient.read ...
```
(Names illustrative — reconcile with `.env.example`.)

### 5.4 [CLAUDE CODE] Verify SMART launch
- Use Epic's **SMART launch sandbox / app launcher** to launch App B against the sandbox and confirm:
  issuer validation, `id_token` claims (`fhirUser`, `nonce`), authorization-code exchange, and
  launch-context Patient import/crosswalk land correctly.
- Run the repo's launch smoke path if one exists:
  ```bash
  npm run ehr:smoke -- --help
  npm run ehr:profile -- --help    # capability diagnostics against the sandbox
  ```
- Confirm callback-staged resources trigger the QDM replay path described in the README.

---

## 6. Consolidated environment matrix

| Concern | App A (Backend) | App B (Launch) |
|--------|------------------|----------------|
| Client ID | `…BACKEND_CLIENT_ID` | `…LAUNCH_CLIENT_ID` |
| Grant type | `client_credentials` | `authorization_code` |
| Endpoint used | token | authorize → token |
| Redirect URI | none | required, exact match |
| Scopes prefix | `system/` | `user/` + `launch` |
| Persistent access | no | optional (`offline_access`) |
| Auth credential | `private_key_jwt` (shared key) | `private_key_jwt` (shared key) |
| JWKS URL | shared `/.well-known/jwks.json` | shared `/.well-known/jwks.json` |
| Signing alg | RS384 | RS384 |

Shared: `EHR_EPIC_SANDBOX_FHIR_BASE`, `EHR_EPIC_SANDBOX_PRIVATE_KEY_PATH`,
`EHR_EPIC_SANDBOX_JWK_KID`. Keep these defined once and referenced by both apps.

---

## 7. Acceptance checklist (Claude Code: do not mark done until all pass)

- [ ] `.env.example` and `.env` contain both Client IDs under the **actual** declared key names.
- [ ] Private key git-ignored; `git status` shows no key/secret staged; no key in DB rows.
- [ ] `/.well-known/jwks.json` is publicly reachable over HTTPS and advertises `alg: RS384` + stable `kid`.
- [ ] JWT signer emits `RS384`, `iss==sub==client_id`, `aud==token endpoint`, unique `jti`, `exp ≤ 5min`, matching `kid`.
- [ ] App A: token request returns an access token; Patient read succeeds; `$export` kickoff returns a poll URL; NDJSON import hydrates `phm_edw`.
- [ ] App B: SMART launch completes auth-code exchange; launch-context Patient import + QDM replay succeed.
- [ ] `npm run ehr:smoke` (both paths) passes; `npm run ehr:profile` capability diagnostics clean.
- [ ] `npm run typecheck && npm run lint && npm run test && npm run build` all green.
- [ ] Verification evidence appended to the EHR devlog under `docs/superpowers/devlogs/`.

---

## 8. Troubleshooting (common Epic sandbox failures)

| Symptom | Likely cause | Fix |
|--------|--------------|-----|
| `invalid_client` on token request | client ID not yet propagated, or JWKS not reachable / `kid` mismatch | wait up to ~60 min; confirm public HTTPS JWKS; ensure JWT header `kid` matches a published key |
| `invalid_client` with correct JWKS | wrong alg (RS256) or `exp` too far out | sign with **RS384**; set `exp ≤ 5 min` |
| `aud` rejected | `aud` not exactly the token endpoint | set `aud` to the literal token URL |
| `unsupported_grant_type` | wrong grant or missing assertion type | `grant_type=client_credentials` + `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer` |
| Redirect URI mismatch (App B) | registered URI ≠ runtime URI | make them byte-identical; register every environment's URI |
| `403`/empty on FHIR read | scope not granted for that resource | add the `system/`/`user/` scope and re-register |
| `$export` 400 | wrong Group ID or missing `Prefer: respond-async` | use the sandbox Group ID; include the async header |
| "Bad Request" opening the FHIR base URL in a browser | expected — endpoint is programmatic only | use curl/Postman/app code |

---

## 9. Production (later — do NOT do now)

- Generate **separate** production keypairs; publish a **production** JWKS URL; fill the **Production
  JWK Set URL** field.
- Production access requires Epic review/approval and an Epic community member's ECSA to map the
  client ID to a service account at their org. Budget weeks, not minutes.
- Re-run the full §7 checklist against the org's production FHIR base URL (org-specific, not the
  sandbox URL).

---

## 10. Note on Parthenon (separate, later)

Parthenon is a distinct platform and gets its **own** Epic registration(s) under its own JWKS/keys —
do not reuse Medgnosis client IDs or keys. When that work begins, repeat this document's structure:
decide audience(s), generate dedicated keys, register, wire env, verify. Track it as a separate
handoff.

---

### Appendix — quick command index
```bash
# discovery
npm run ehr:keygen  -- --help
npm run ehr:onboard -- --help
npm run ehr:profile -- --help
npm run ehr:smoke   -- --help
rg -n "well-known/jwks|client_assertion|RS384|redirect_uri|oauth2/authorize" apps

# jwks check
curl -s http://localhost:<API_PORT>/.well-known/jwks.json | jq .

# gates
npm run typecheck && npm run lint && npm run test && npm run build
```
