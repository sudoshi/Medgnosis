# UDAP / TEFCA Facilitated-FHIR — Enrollment Runbook

The in-repo UDAP machinery is built (`udapRegistration.ts` builds the signed
software statement; `udapEnrollment.ts` loads PKI creds + registers). What
remains is **external PKI enrollment** — obtaining certificates from a
UDAP-recognized Certificate Authority. This runbook covers that.

## 1. What you're getting
UDAP authentication is **certificate-based**. You need:
- An **X.509 client certificate** whose Subject Alternative Name (SAN) is your
  client's unique URI (`UDAP_ISSUER`, e.g. `https://medgnosis.acumenus.net`).
- The **full cert chain** (leaf → intermediate → root) in PEM.
- The matching **private key** (PKCS#8 PEM).

## 2. Where to get certificates
- **Sandbox / testing:** the **UDAP test tools** at <https://www.udap.org/> and
  the community **UDAP test CA** (e.g. EMR Direct's test certificates) issue free
  certs for the `udap.fhirlabs.net` / test ecosystem. Use these to exercise the
  full DCR + token flow before production.
- **Production (TEFCA):** obtain certs from a **TEFCA/UDAP-recognized CA** as part
  of QHIN/Participant onboarding. The cert's trust community must be one the target
  server accepts. This is part of the broader TEFCA Subparticipant process and is
  contractual, not self-serve.

## 3. Configure (env / secret)
Once you hold the cert chain + key:
```
UDAP_ENABLED=true
UDAP_ISSUER=https://medgnosis.acumenus.net          # must match a cert SAN
UDAP_REGISTRATION_ENDPOINT=https://<server>/udap/register
UDAP_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...    # PKCS#8 PEM (leaf key)
UDAP_CERT_CHAIN=-----BEGIN CERTIFICATE-----\n...     # PEM chain, leaf first
UDAP_ALG=ES384                                       # or RS384
UDAP_SCOPE=system/Patient.read system/Observation.read
UDAP_GRANT_TYPES=client_credentials                  # or authorization_code,refresh_token
# UDAP_CLIENT_NAME=Medgnosis
# UDAP_REDIRECT_URIS=...                             # only for authorization_code
```
`loadUdapCredentialsFromEnv()` parses the PEM chain into the `x5c` header and
imports the key; `registerWithUdap()` signs the software statement and performs
Dynamic Client Registration, returning the `client_id`.

## 4. Validate against the sandbox
Register against the UDAP test server's registration endpoint; on success you get
a `client_id`. Then obtain tokens via `client_credentials` + the signed JWT
assertion (the existing SMART Backend Services primitive in `backendServices.ts`,
which UDAP reuses) and call FHIR.

## 5. Still to build (after certs land)
- Wire `registerWithUdap()` into an onboarding flow (store the returned `client_id`
  + use it for token requests). Today the module is ready but not yet invoked.
- **UDAP tiered-OAuth + mTLS** for cross-organization user auth (the next UDAP
  layer beyond B2B client_credentials), if/when the use case needs it.

**Status:** machinery + config-loading + tests in place; **blocked on external
cert enrollment.** No further in-repo UDAP work is meaningful until certs exist.
