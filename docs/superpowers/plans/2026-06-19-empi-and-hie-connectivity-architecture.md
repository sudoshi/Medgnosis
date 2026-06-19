# Medgnosis — EMPI Need & Standards-Based HIE Connectivity

**Date:** 2026-06-19
**Author:** Architecture analysis (Sanjay Udoshi / Acumenus Data Sciences)
**Status:** Decision memo + implementation plan
**Scope:** (1) Does Medgnosis need an EMPI? (2) How should it achieve standards-based connectivity with modern HIEs?

---

## TL;DR

1. **EMPI: Yes — you need a patient identity-resolution layer, and you need it *before* you connect to any HIE/QHIN.** Today Medgnosis has effectively *no* cross-source patient matching: `smartPatientSync.reconcileLocalPatient()` issues a blind `INSERT` for every incoming FHIR `Patient`, and the only dedupe is a tenant-scoped uniqueness on `(ehr_tenant_id, resource_type, ehr_resource_id)` in `ehr_resource_crosswalk`. The same human appearing in two tenants — or via HIE query vs. SMART launch — becomes two `phm_edw.patient` rows, two `dim_patient` rows, two `fact_patient_composite` rows. That silently corrupts the exact outputs the product sells: **quality-measure denominators, care-gap status, and risk stratification.**

2. **You do not need to *buy* a commercial EMPI, and you must not *hand-roll a probabilistic matcher*.** The right shape is a **graduated identity layer**: (a) a proper OMOP-aligned identity model with a multi-source identifier table now; (b) deterministic + FHIR `$match`-based matching adopting the HL7 Identity Matching IG scoring rubric; (c) a dedicated MPI microservice (**SanteMPI**, Apache-2.0, or **HAPI FHIR MDM**, Apache-2.0) when probabilistic accuracy is required; (d) **defer to QHIN/TEFCA-provided matching** where an upstream trusted match exists.

3. **HIE connectivity: Do not build IHE SOAP/SAML stacks and do not become a QHIN.** Terminate that complexity at a QHIN or aggregator. **Reuse what you already have** — SMART Backend Services (`client_credentials` + signed JWT assertion) and FHIR Bulk Data `$export` are precisely the FHIR-era primitives. **Add UDAP** (dynamic client registration, JWT software statements, tiered OAuth, mTLS) to become TEFCA facilitated-FHIR-ready. **Sequence:** aggregator first (Health Gorilla or 1upHealth) → TEFCA Subparticipant → SMART-direct (Epic Showroom / Oracle Code Console) for flagship embedded workflows.

---

## Part 1 — Current-State Assessment (grounded in the codebase)

### 1.1 What Medgnosis already does well

The EHR integration layer (`apps/api/src/services/ehr/`) is genuinely strong and standards-forward:

| Capability | Where | Standard |
|---|---|---|
| FHIR R4 read/search with retry/backoff, bounded pagination | `fhirClient.ts` | FHIR R4 |
| SMART App Launch (EHR + standalone), PKCE, private_key_jwt, ID-token verification | `smartLaunch.ts` (~1000 LOC) | SMART App Launch v1.0 |
| SMART Backend Services (`client_credentials` + JWT assertion, RS384/ES384) | `backendServices.ts` | SMART Backend Services |
| FHIR Bulk Data `$export` (system/group/patient), async poll, NDJSON manifest import, content-hash idempotency | `bulkData.ts` (72KB) | FHIR Bulk Data ("Flat FHIR") |
| Recurring bulk schedules (`none`/`fixed`/`last_success`) | `bulkSchedules.ts` | — |
| Ingest ledger (incremental/backfill/bulk/manual) | `ingestRuns.ts` | — |
| FHIR → QDM v5.6 normalization with lineage crosswalk | `qdmBridge.ts` | QDM v5.6 |
| Vendor adapters (Epic, Oracle Cerner, generic SMART, HAPI, other) | `vendorAdapters/` | — |
| Multi-tenant registry, capability discovery, JWKS endpoint | `tenantRegistry.ts`, `smartDiscovery.ts`, `routes/ehr/jwks.ts` | SMART `.well-known` |

**This means ~70% of the FHIR-era HIE plumbing already exists.** The gap is not FHIR mechanics — it's (a) patient identity, and (b) the TEFCA/UDAP trust layer.

### 1.2 The identity gap (the core finding)

**`phm_edw.patient`** (`packages/db/migrations/001_phm_edw_schema.sql`) is a classic single-source EDW patient:

```sql
CREATE TABLE phm_edw.patient (
  patient_id SERIAL PRIMARY KEY,
  mrn        VARCHAR(50) NULL,   -- ONE mrn, no source-system scoping
  ssn        VARCHAR(11) NULL,   -- plaintext (see §1.3)
  first_name ..., last_name ..., date_of_birth ...,
  ...
);
```

- **No `patient_identifier` / `external_id` table.** A person cannot hold "MRN X at hospital A and MRN Y at hospital B." This is the structural blocker to multi-source identity.
- **No source-system column.** You cannot audit which feed contributed which row.

**`ehr_resource_crosswalk`** (`061_ehr_resource_crosswalk.sql`) *stores* the full FHIR `Patient.identifier[]` array in `ehr_identifier JSONB` — but **only for change detection/audit**. Nothing ever queries that array to find an existing person. Its uniqueness constraint is `(ehr_tenant_id, resource_type, ehr_resource_id)` — i.e., identity is **tenant-scoped by the EHR's own resource ID**, never reconciled across tenants or against demographics.

**`smartPatientSync.reconcileLocalPatient()`** is the smoking gun:

```ts
// NO SELECT to find an existing patient by MRN+system, name+DOB, SSN, or identifiers.
const rows = await sql`INSERT INTO phm_edw.patient (...) VALUES (...) RETURNING patient_id`;
```

Every FHIR `Patient` → a brand-new local patient. The crosswalk's `ON CONFLICT` only prevents *re-ingesting the same EHR's same resource ID* from duplicating.

**Resulting failure matrix:**

| Scenario | Current result |
|---|---|
| Same EHR patient via SMART launch *and* bulk export | ✅ Same local patient (crosswalk hit) |
| Same person in Epic tenant **and** Cerner tenant | ❌ Two local patients |
| Same person, different MRN across two facilities | ❌ Two local patients |
| Same person re-registered with a typo / new address | ❌ Two local patients |
| **Same person returned by an HIE/QHIN query** | ❌ New local patient every time |

The last row is why this becomes urgent the moment you connect an HIE: HIE/QHIN query is *designed* to surface the same person from many communities. Without identity resolution, **HIE connectivity multiplies duplicates rather than enriching records.**

### 1.3 Incidental finding (fix alongside)

`phm_edw.patient.ssn` is stored as plaintext `VARCHAR(11)`. SSN is a strong matching identifier and PHI — when you build the identifier table, store SSN (and any SSN-bearing identifiers) **hashed/tokenized**, not in cleartext. This is a HIPAA-minimization issue independent of EMPI but naturally fixed in the same migration.

---

## Part 2 — Question 1: Does Medgnosis need an EMPI?

### 2.1 The decision rests on one question

> **Does an upstream system already hand you a trustworthy cross-source identifier?**

- **If yes** (a QHIN-resolved match, a shared MRN namespace, or — someday — a national ID): a Postgres cross-reference table + deterministic dedupe suffices. You can *defer* to upstream matching.
- **If no** (you stitch raw demographics from disparate FHIR servers/HIEs): probabilistic matching is mandatory, because the failure modes below are the documented *default*, not edge cases.

Medgnosis sits in **both** worlds: SMART-launched single-EHR data is effectively pre-keyed (defer is fine), but the population-health mission — aggregating across orgs and HIEs — lands squarely in the "no trusted upstream ID" case. **So you need the layer, but it can lean on upstream matches when present.**

### 2.2 Why it matters specifically for *this* product

There is no US national patient identifier (Section 510 of Labor-HHS approps has barred federal funds for one since FY1999; both chambers' committees removed the language in 2024 but it is **not yet repealed into law** — do not architect around a national ID). Demographics-based matching remains mandatory in the US.

Documented real-world consequences (for the decision memo):
- Match rates **~80% within one care setting**, **as low as ~50% across organizations** (Pew, 2018).
- Black Book: organizations average **~18% duplicate records**; ONC's <2%/0.01% targets were **not met**.
- Duplicates cost **~$1,950/inpatient stay**, **>$800/ED visit**; **~33% of denied claims** tie to misidentification (~$1.5M/yr/hospital).
- AHIMA / Patient ID Now classify misidentification as a **patient-safety** issue (overlaid records → wrong allergies/meds).

For a population-health/CDS platform the damage is specifically: **fragmented longitudinal records, duplicated or split eCQM denominators, care gaps that read "open" on one fragment and "closed" on another, and risk scores computed on partial histories.** These are your headline outputs.

### 2.3 Standards you will implement against (not invent)

- **HL7 FHIR `Patient/$match`** — POST a partial Patient, receive a Bundle ranked by `Bundle.entry.search.score` (0–1) + `match-grade` extension. The FHIR-era successor to PDQ patient discovery.
- **HL7 Identity Matching IG** — gives you a *concrete* scoring rubric and minimum data set: e.g. `0.99` (identifier + name/DOB), `0.8` (name+DOB+address/subscriber), `0.7` (name+DOB+sex+SSN4/phone/zip), `0.6` (name+DOB+sex, the floor); input-field weights rank gov-ID(5) > address/email/phone(4) > name(3) > DOB(2). **Implement your blocking + scoring against this.**
- **IHE PIXm / PDQm** (FHIR cross-reference & demographics match; PDQm ITI-119 profiles `$match`), **PMIR** (master identity registry) — the profiles a QHIN/HIE will speak; you consume, not implement, the SOAP-era **PIX/PDQ**.

### 2.4 Options evaluated (fit for TypeScript/Postgres/OMOP)

| Option | License | `$match` | Matching | Fit |
|---|---|---|---|---|
| **SanteMPI / SanteDB** | Apache-2.0 | PIX/PDQ + PIXm/PDQm + FHIR | Deterministic **+ probabilistic** | **Strong.** Mature, standards-deep, peer-reviewed ML-linkage validation. Runs as a separate service called over FHIR — language-agnostic beside TS/PG. |
| **HAPI FHIR MDM** (Smile) | Apache-2.0 | **Native `Patient/$match`** | **Deterministic** rules only (probabilistic deliberately omitted) | **Best embed option** if you'll run a FHIR repo anyway; Postgres-backed. Limitation: no probabilistic engine. |
| **OpenCR** (IntraHealth) | OSS | FHIR client registry | Prob + det, 25 algo variants | Good OpenHIE fit; FHIR-first. |
| **JeMPI** (Jembi) | MPL-2.0 | Standards CR/MPI | Det + prob (batch + txn) | Capable but **heavy** (Dgraph + Kafka + Swarm) — national-HIE scale; overkill here. |
| **Verato** | Commercial | API | **Referential** (300M+ identity ref) | Highest accuracy; SaaS + BAA + cost. Consider only if patient-safety-critical and steward bandwidth is scarce. |
| **Azure Health Data Services / Google Cloud Healthcare** | Commercial managed | FHIR + `$match` | — | Viable if you go cloud-managed. **Note: legacy Azure API for FHIR retires 2026-09-30** → target Azure Health Data Services. |
| **OpenEMPI** | OSS | Limited | Det/prob | **Avoid — effectively unmaintained.** |

Typical 2026 EMPI auto-merge thresholds run **96–99% precision/recall with ~2–5% flagged for human review**. **Operational reality teams underestimate:** an EMPI needs data stewards working a **match-review queue** (resolving POSSIBLE_MATCH, executing merges, *un-merging overlays*), survivorship rules, audit trails, and periodic threshold re-tuning. Budget the *workflow*, not just the software.

### 2.5 Recommendation (EMPI)

**Adopt a graduated identity layer, build none of the matching math yourself:**

1. **Now (foundation):** OMOP-aligned identity model — `person`/`patient_identifier` xref + source-system + merge-audit tables; deterministic match on strong identifiers before any `INSERT`. Fixes the duplicate-on-ingest bug and unblocks everything else. *(Build in-house — it's schema + a lookup, not matching math.)*
2. **Next (probabilistic via adoption):** Stand up **SanteMPI** (or **HAPI FHIR MDM** if you also want a FHIR repo) as a sidecar microservice. Medgnosis calls `Patient/$match` over FHIR; SanteMPI owns the Fellegi-Sunter scoring and the review queue. Implement the HL7 Identity Matching IG minimum-data-set + scoring.
3. **Always (defer when trusted):** When a QHIN/HIE hands you a resolved cross-reference, **trust it as a deterministic link** but sample-validate. Store the QHIN-provided identifier as just another row in `patient_identifier`.

This honors "adopt/port a proven approach over net-new code" and "standards-first."

---

## Part 3 — Question 2: Standards-Based HIE Connectivity (2026)

### 3.1 The landscape, current to mid-2026

- **TEFCA** is live (Dec 2023); **>500M records exchanged by Feb 2026**; ~71k+ sites. RCE is still **The Sequoia Project** in partnership with **ASTP/ONC** (ONC reorganized into ASTP/ONC). **Common Agreement v2.1 (Nov 2024)**; TEFCA final rule Dec 16, 2024. v2's central change: **FHIR-based exchange** added alongside IHE document exchange.
- **11 designated QHINs:** eHealth Exchange, Epic Nexus, Health Gravity/Health Gorilla, KONZA, MedAllies, Kno2, CommonWell, eClinicalWorks, and the **2025 additions Surescripts, Netsmart, Oracle Health**.
- **FHIR Roadmap for TEFCA** is 4 stages: (1) FHIR content over IHE brokering → (2) QHIN-facilitated FHIR → (3) **QHIN-to-QHIN FHIR (piloted 2025, UDAP-based)** → (4) end-to-end FHIR. Governing docs: **Facilitated FHIR Implementation SOP v2.0 draft (Oct 2025)**, **QTF v2.1 draft (Dec 2025)**.
- **Carequality + CommonWell** are the dominant *current* query rails; CommonWell is a QHIN and (Nov 2025) migrated members to ELLKAY for TEFCA readiness; Carequality is converging its framework with TEFCA.
- **CMS Interoperability Framework** (late 2025, voluntary): ~60 early adopters pledged FHIR APIs on **US Core + USCDI v3+**. Track for federal-pressure direction.

### 3.2 IHE profiles still in production (terminate at a QHIN/aggregator — don't build)

**XCPD** (cross-community patient discovery), **XCA** (query/retrieve documents), **XDS.b** (within-domain sharing), **XDR** (point-to-point push), payload **C-CDA**. All are SOAP/WS-* with **SAML assertions + mutual TLS**. A "QHIN Query" = XCPD + XCA. You do **not** want this XML/SOAP machinery in Node — let the QHIN/aggregator terminate it.

### 3.3 FHIR exchange targets (what you build against)

- **FHIR R4 + US Core.** Target **US Core v6.1.0 (USCDI v3)** now, plan **v7.0.0 (USCDI v4)** (v7 requires SMART App Launch v2.0+ granular scopes).
- **SMART App Launch v2.x** + **SMART Backend Services** (`client_credentials` + signed JWT assertion) — *you already have this.*
- **Bulk Data / Flat FHIR `$export`** v1.0.1/2.0.0 — *you already have this; it is your highest-leverage asset for population queries.*
- **`Patient/$match`** — the FHIR analog of XCPD patient correlation; ties directly to Part 2.
- **(g)(10):** You're an *app*, not a Health IT Module, so you *consume* (g)(10) APIs rather than certify. **Validate your client against the Inferno (g)(10) Test Kit.**

### 3.4 Trust/security layer — the real gap

| Mode | Transport/auth | Assertion | Trust anchor |
|---|---|---|---|
| IHE XCPD/XCA (SOAP) | mTLS + WS-Security | **SAML 2.0** | network CA / RCE certs |
| FHIR (SMART Backend Services) | TLS + OAuth2 `client_credentials` | **signed JWT assertion** | pre-registered JWKS ✅ *(have)* |
| **FHIR under TEFCA (facilitated FHIR)** | TLS + OAuth2 | **UDAP** | **TEFCA-issued certs** |
| Direct Secure Messaging | SMTP + S/MIME | X.509 per address | **DirectTrust** anchors |

**UDAP** (HL7 SSRAA IG, v2.0.0 current / v3.0.0 in ballot) is what TEFCA facilitated-FHIR adopts: **(1)** dynamic client registration, **(2)** JWT-based client auth via signed software statements, **(3)** tiered OAuth, **(4)** mTLS client auth. You already have the JWT-assertion primitive — UDAP is mostly software-statement construction + JWKS hosting + mTLS + DCR on top.

**Direct Secure Messaging** still matters for *push* (referrals, transitions of care, public-health reporting) via a HISP + DirectTrust. Integrate a HISP if your workflows include outbound transitions of care; don't build SMTP/S-MIME.

### 3.5 Three connectivity paths for an independent vendor

- **(a) TEFCA Participant/Subparticipant via a QHIN** — durable, authoritative, broad. Contract + conformance heavy (weeks-months); gated by the QHIN's FHIR maturity (many still IHE-document-first in 2026). *Subparticipant* is the typical slot.
- **(b) Aggregator / API vendor** — fastest (days-weeks): **Health Gorilla** (itself a QHIN — QHIN-native reach without becoming a Participant), **1upHealth** (Bulk FHIR ingestion — *best fit given your `$export` investment and population-analytics mission*), **Zus**, **Metriport** (OSS-leaning), **Particle** (diligence Epic purpose-of-use constraints). Commercial API key + BAA; vendor handles certs/network trust.
- **(c) SMART-direct app-store** — deepest per-site: **Epic Showroom** (replaced App Orchard in 2024; Connection Hub ~$500/yr → Toolbox → Workshop), **Oracle Health Code Console** (**DSTU2 fully deprecated Dec 2025 — R4 mandatory**). Real-time, in-workflow, but doesn't aggregate and repeats onboarding per vendor + per site.

### 3.6 Recommendation (HIE connectivity)

**Lead with (b), plan (a), reserve (c).**
1. **Aggregator first** — 1upHealth (population/bulk alignment) or Health Gorilla (QHIN-native reach). Reuses your SMART Backend Services + `$export` immediately; data flowing in days-weeks.
2. **TEFCA Subparticipant next** — durable trust path; add **UDAP** to your existing OAuth to be facilitated-FHIR-ready.
3. **SMART-direct** — for flagship EHR-embedded workflows only.
4. **Track:** Facilitated FHIR SOP v2.0, QTF v2.1, US Core v7/USCDI v4, CMS Interoperability Framework.

---

## Part 4 — Why the two questions are one architecture

Connecting to an HIE/QHIN is the single biggest *source-diversity* increase you can make — and source diversity is exactly what breaks the crosswalk-only identity model. **EMPI is a prerequisite for HIE connectivity, not a parallel track.** Conversely, TEFCA gives you an out: where a QHIN resolves identity, you defer. The clean seam is: **every inbound patient — SMART, bulk, aggregator, or QHIN — passes through one `resolvePatientIdentity()` chokepoint** before it can create or attach to a `person`.

---

## Part 5 — Implementation Plan

### Phase 0 — Identity chokepoint + model (foundation, no external deps) — **~1 sprint**

**Goal:** Stop minting duplicate patients on ingest; introduce an OMOP-aligned, multi-source identity model.

1. **Migrations** (`packages/db/migrations/`, next free band):
   - `phm_edw.person` — the golden/enterprise identity (surrogate `person_id`, survivorship demographics, `created/updated`). *(Maps to OMOP `person`.)*
   - `phm_edw.patient_identifier` — one-to-many: `(person_id, system, value, source_system, ehr_tenant_id, type_code, value_hash, active, first_seen, last_seen)`. Unique on `(system, value)` per assigning authority. **Store SSN/strong IDs hashed in `value_hash`, not cleartext.**
   - `phm_edw.patient_link` — maps existing `phm_edw.patient.patient_id` → `person_id` (preserves current rows; non-destructive).
   - `phm_edw.patient_merge_log` — append-only audit of merges/un-merges (who/when/why/before-after), supports reversal.
2. **`resolvePatientIdentity()` service** (`apps/api/src/services/ehr/identity/`):
   - Single chokepoint called by `smartPatientSync`, `edwHydration`, and bulk import *before* any patient `INSERT`.
   - **Deterministic tier:** match on `(system, value)` strong identifiers (incl. QHIN-provided), then `(name + DOB + sex)` exact as a floor per the Identity Matching IG.
   - Returns `{ personId, matchGrade, isNew }`. On `certain` → attach; on `possible` → attach to a review queue, create provisional person; on `none` → new person.
3. **Refactor `reconcileLocalPatient()`** to call the chokepoint instead of blind `INSERT`. Backfill `patient_link` for existing rows.
4. **Tests (TDD):** dual-tenant same-person → one `person`; typo demographics → review queue not silent dupe; QHIN identifier → deterministic attach. Extend `smartLaunch.test.ts` / add `identity/*.test.ts`.

**Exit:** No new `phm_edw.patient` rows are created for an already-known person across tenants. Quality-measure denominators dedupe at the `person` grain.

### Phase 1 — Probabilistic matching via adopted MPI — **~1–2 sprints**

**Goal:** Tolerant matching without building Fellegi-Sunter ourselves.

1. **Stand up SanteMPI** (Apache-2.0) as a Docker sidecar (or HAPI FHIR MDM if a FHIR repo is also wanted). Configure the HL7 Identity Matching IG scoring + minimum data set.
2. **Wire `resolvePatientIdentity()` probabilistic tier** → call SanteMPI `Patient/$match`; consume `search.score` + `match-grade`. Auto-accept ≥ threshold; route the `~2–5%` band to the review queue.
3. **Steward review UI** (admin, reuse `routes/ehr/admin.ts` + an admin tab): POSSIBLE_MATCH queue, merge, **un-merge/overlay reversal**, all writing `patient_merge_log`.
4. **Tests:** FEBRL-style benchmark fixtures; assert sensitivity/specificity/PPV and review-queue fraction targets.

**Exit:** Tolerant matching live with a measured, bounded steward queue; thresholds tunable.

### Phase 2 — UDAP / TEFCA facilitated-FHIR readiness — **~1–2 sprints**

**Goal:** Extend existing OAuth to the TEFCA trust layer.

1. **UDAP support** on top of `backendServices.ts`: signed software statements, **dynamic client registration (DCR)**, tiered OAuth, **mTLS** client auth (HL7 SSRAA IG v2.0.0).
2. **Certificate/key lifecycle in Postgres:** JWKS rotation, TEFCA/UDAP cert storage, expiry alerting. Extend `tokenStore.ts` / tenant registry.
3. **`Patient/$match` client** for cross-network discovery (ties to Phase 1).
4. **Validate against Inferno (g)(10) Test Kit** and any QHIN/aggregator sandbox.

**Exit:** Medgnosis can authenticate to a facilitated-FHIR endpoint with UDAP + mTLS.

### Phase 3 — First live HIE connection via aggregator — **~1–2 sprints**

**Goal:** Real cross-org data flowing through the identity chokepoint.

1. **Select aggregator:** 1upHealth (bulk/population alignment) or Health Gorilla (QHIN-native). Execute BAA, obtain API credentials.
2. **New vendor adapter** (`vendorAdapters/`, e.g. `aggregator.ts`) — same `EhrVendorAdapter` interface; map the aggregator's FHIR + bulk semantics.
3. **Route inbound through `resolvePatientIdentity()`** — every aggregator patient resolves to a `person` before staging; trust aggregator/QHIN identifiers as deterministic links.
4. **End-to-end verification:** ingest a known multi-org patient; confirm a single `person`, merged longitudinal record, correct care-gap recomputation.

**Exit:** One production HIE source live; duplicates measured at `person` grain ≈ baseline EMPI targets.

### Phase 4 — TEFCA Subparticipant + Direct (durable) — **ongoing / business-led**

1. **Engage a QHIN** (likely via the aggregator already in place) for Subparticipant onboarding (contracts + conformance).
2. **Direct/HISP** integration *only if* outbound transitions-of-care/referrals are in scope.
3. **Roadmap tracking:** Facilitated FHIR SOP v2.0, QTF v2.1, US Core v7/USCDI v4, CMS Interoperability Framework milestones.

---

## Part 6 — Risks & Non-Negotiables

- **Do not build a probabilistic matcher from scratch** (even HAPI's team declined it). Adopt SanteMPI/HAPI MDM.
- **Do not implement IHE SOAP/SAML or pursue QHIN status.** Terminate at a QHIN/aggregator.
- **Identity migrations are additive only** (`patient_link` preserves existing `patient` rows; merges are logged and reversible) — per the project's non-destructive rule.
- **Stewardship is a staffing commitment**, not just code — plan the review-queue workflow.
- **No national patient identifier** exists in law — keep demographics matching mandatory.
- **Auth system is protected** (`.claude/rules/auth-system.md`) — UDAP work is *additive* to `backendServices.ts`; do not alter the protected user-auth endpoints/flows.

---

## Appendix — Key source files

- Identity gap: `apps/api/src/services/ehr/smartPatientSync.ts` (`reconcileLocalPatient`, `upsertPatientCrosswalk`)
- Patient schema: `packages/db/migrations/001_phm_edw_schema.sql`
- Crosswalk: `packages/db/migrations/061_ehr_resource_crosswalk.sql`
- Tenant registry: `packages/db/migrations/060_ehr_tenant_registry.sql`
- Hydration: `apps/api/src/services/ehr/edwHydration.ts`
- Backend OAuth (UDAP extension point): `apps/api/src/services/ehr/backendServices.ts`, `tokenStore.ts`
- Bulk/`$export`: `apps/api/src/services/ehr/bulkData.ts`, `bulkSchedules.ts`
- Analytics grain: `packages/db/migrations/013_star_schema_enhancement.sql` (`fact_patient_composite`)
