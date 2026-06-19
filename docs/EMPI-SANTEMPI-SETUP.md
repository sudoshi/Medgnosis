# EMPI Phase 1 — SanteMPI Probabilistic Matching

**Status:** scaffolded, **off by default.** Identity resolution is deterministic-only (Phase 0) until you deploy SanteMPI and set `MPI_ENABLED=true`.

This document covers what was built, how to turn it on, and the SanteMPI-side configuration (matching weights, master-authority OID) you must complete for it to be useful.

---

## What this adds

Phase 0 gave `resolvePatientIdentity` two deterministic tiers (strong identifier, then a name+DOB+sex floor key). Phase 1 adds an **optional third tier**: when both deterministic tiers miss, the resolver POSTs the inbound demographics to an external MPI's **FHIR `Patient/$match`** and acts on the scored candidates:

| Best candidate score | Action |
|---|---|
| `>= MPI_AUTO_THRESHOLD` (default 0.9) | **Auto-attach** to the local person carrying that MPI master identifier (or mint one and attach the master id) — `certain` |
| `[MPI_REVIEW_THRESHOLD, AUTO)` (default 0.6–0.9) | Mint a **provisional** person + enqueue a steward review — `possible` |
| `< MPI_REVIEW_THRESHOLD` | Ignored — falls through to normal new-person creation (`none`) |

SanteMPI owns the probabilistic (Fellegi-Sunter) scoring and tuning; Medgnosis only marshals the request, applies the threshold policy, and records the result. **Auto-merge of two *existing* local persons never happens here** — mid-confidence always routes to review (overlay safety).

### Code touchpoints
- `apps/api/src/services/ehr/identity/mpiClient.ts` — `FhirMpiClient` (`Patient/$match`).
- `apps/api/src/services/ehr/identity/probabilisticMatch.ts` — pure score-band policy.
- `apps/api/src/services/ehr/identity/resolvePatientIdentity.ts` — optional `mpi` tier.
- `apps/api/src/services/ehr/identity/mpiResolution.ts` — env-driven factory (returns `undefined` when disabled).
- Both ingestion paths (`smartPatientSync`, bulk `edwHydration`) call `reconcilePatient`, which injects the MPI tier automatically when enabled.

---

## Turn it on

1. **Start the sidecar** (behind the `mpi` compose profile — never starts by default). This brings up both SanteMPI and its dedicated, internal-only Postgres (`santedb-db`, isolated from the app/prod database):
   ```bash
   docker compose --profile mpi up -d santedb-db   # wait for pg_isready
   docker compose --profile mpi up -d santempi      # first run installs schema (~40s)
   ```
   SanteMPI creates the `santedb` + `auditdb` schemas on first start, exposes FHIR at host `http://localhost:8099/fhir` (in-network `http://santempi:8080/fhir`), and an OAuth2 token service at `/auth`. **All FHIR endpoints require auth** (the `SEC`/`OPENID` features) — an unauthenticated request returns `403 Missing Authorization header`. Obtain a token from `/auth/oauth2_token` and set it as `MPI_ACCESS_TOKEN` (below) before enabling.
2. **Configure SanteMPI** (see next section) — matching weights + master-authority OID.
3. **Point the API at it** (env / `.env`):
   ```
   MPI_ENABLED=true
   MPI_BASE_URL=http://santempi:8080/fhir
   MPI_MASTER_ID_SYSTEM=urn:oid:<your master authority OID>   # MUST match SanteMPI
   MPI_AUTO_THRESHOLD=0.9
   MPI_REVIEW_THRESHOLD=0.6
   # MPI_ACCESS_TOKEN=...    # only if the FHIR endpoint requires auth
   ```
   `docker compose up -d api` (restart does **not** reload `env_file`).

---

## SanteMPI configuration (required for usefulness)

### 1. Master-authority OID
`MPI_MASTER_ID_SYSTEM` **must equal** the system URI of the identifier SanteMPI returns for the enterprise/master identity in `$match` results. Medgnosis stores that master id on `phm_edw.person` (as a `patient_identifier`) so a future `$match` re-resolves to the same local person via the deterministic identifier tier.

### 2. Matching configuration — HL7 Identity Matching IG
Configure SanteMPI's matching against the **HL7 Identity Matching IG** minimum data set and weighting:
- **Blocking** on coarse keys (e.g. `soundex(last) + birthYear`, `zip + sex`) to bound candidate sets.
- **Field weights / agreement scores** roughly per the IG search-score rubric:
  - identifier + name/DOB ≈ 0.99
  - name + DOB + address/subscriber ≈ 0.8
  - name + DOB + sex + SSN4/phone/zip ≈ 0.7
  - name + DOB + sex (floor) ≈ 0.6
- **String similarity** (Jaro-Winkler) + phonetic (Soundex/Metaphone) on name; date tolerance on DOB.
- Emit `Bundle.entry.search.score` (0–1) and the `match-grade` extension — the client consumes both.

Tune thresholds against a labeled sample; the `MPI_AUTO_THRESHOLD` / `MPI_REVIEW_THRESHOLD` split should track the precision you require for auto-accept vs. the steward review budget.

### 3. Feeding the index (operational prerequisite)
`$match` only returns candidates for patients SanteMPI already knows. You must **feed** patients into SanteMPI — via PIXm Patient Identity Feed (`ITI-104`) or FHIR `Patient` create — as part of ingestion or a one-time load of the existing population. **Until the index is fed, `$match` returns nothing and the tier is a no-op.** (Wiring the feed into the ingestion paths is the next implementation step; the master-id-on-person design above is what makes repeat matches converge.)

---

## Known Phase-1 limitations / next steps
- **Feed not yet wired** into ingestion (see §3) — required before the tier does anything.
- **Review provenance**: MPI-sourced reviews currently reuse the `demographic_only_match` reason in `identity_review_queue` (no schema change). Split into a distinct `probabilistic_match` reason when the steward UI lands.
- **No live validation here** — bring the container up and exercise `$match` against a labeled set before enabling in production.
- Steward review UI (work the `identity_review_queue`: confirm/merge/un-merge → `patient_merge_log`) is still pending.

---

## Verification

Container health (no auth needed):
```bash
docker compose ps santempi                       # Up
curl -s -o /dev/null -w '%{http_code}\n' \
  http://localhost:8099/fhir/metadata            # 403 = up + auth-gated (expected)
```

`$match` (needs an OAuth token — FHIR is auth-gated):
```bash
TOKEN=$(curl -s http://localhost:8099/auth/oauth2_token \
  -d grant_type=password -d username=<admin> -d password=<pw> \
  -d scope='*' -u '<client_id>:<client_secret>' | jq -r .access_token)
curl -s -X POST http://localhost:8099/fhir/Patient/\$match \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/fhir+json' \
  -d '{"resourceType":"Parameters","parameter":[{"name":"resource","resource":{"resourceType":"Patient","name":[{"family":"Hopper","given":["Grace"]}],"birthDate":"1906-12-09","gender":"female"}}]}'
```
Then confirm Medgnosis routes through it: ingest a near-duplicate and check `phm_edw.identity_review_queue` for a new row (mid-confidence) or a shared `person_id` (high-confidence).

> **Deployed state (2026-06-19):** container verified Up — `santedb` + `auditdb` created, schema installed (94 tables), OAuth2 on `/auth`, FHIR auth-gated, ~577 MiB idle. `MPI_ENABLED` remains `false` (no app behavior change).

### Verified working recipe (2026-06-19)
Live `$match` was confirmed end-to-end through `FhirMpiClient`. Gotchas baked into the code/config:
- **Auth (machine-to-machine):** SanteDB-native OAuth `client_credentials`, **client id/secret in the POST body** (not HTTP Basic). The seeded dev client `fiddler`/`fiddler` works; the `Administrator` user and `org.santedb.*` clients are also seeded. (Medgnosis app credentials do **not** work here — separate identity domain.)
  ```bash
  curl -s http://localhost:8099/auth/oauth2_token -d grant_type=client_credentials \
    -d client_id=fiddler -d client_secret=fiddler -d scope='*'
  ```
- **`$match` requires a `count` parameter** — without it SanteDB throws `NullReferenceException` (`error.messaging.fhir.match.operation`). `FhirMpiClient` always sends `count`.
- **Candidates are keyed by SanteDB resource id**, not an identifier in `MPI_MASTER_ID_SYSTEM`; the client uses `resource.id` as the master value (fallback).
- **Feeding requires registered identity domains:** a FHIR `Patient` create with an identifier in an unregistered system 400s (`Could not find identity domain <system>`). Register each source system's assigning authority in SanteDB first, or feed demographics-only. **(This is the key task for wiring the feed into ingestion.)**
- The default match config `org.santedb.matching.patient.default` (AbsoluteScore, nonmatch 6.0 / match 12.0) is present; tune it to the HL7 Identity Matching IG before production.

**Remaining before enabling `MPI_ENABLED`:** client_credentials token fetch/refresh in `FhirMpiClient`; register source-system identity domains + wire the patient feed into ingestion; tune matching weights; steward UI.
