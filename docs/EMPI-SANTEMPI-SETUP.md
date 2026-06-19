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

1. **Start the sidecar** (it's behind the `mpi` compose profile, so it never starts by default):
   ```bash
   docker compose --profile mpi up -d santempi
   ```
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

## Verification (when enabled)
```bash
# MPI reachable + $match responds
curl -s -X POST http://localhost:8085/fhir/Patient/\$match \
  -H 'content-type: application/fhir+json' \
  -d '{"resourceType":"Parameters","parameter":[{"name":"resource","resource":{"resourceType":"Patient","name":[{"family":"Hopper","given":["Grace"]}],"birthDate":"1906-12-09","gender":"female"}}]}'
```
Then confirm Medgnosis routes through it: ingest a near-duplicate and check `phm_edw.identity_review_queue` for a new row (mid-confidence) or a shared `person_id` (high-confidence).
