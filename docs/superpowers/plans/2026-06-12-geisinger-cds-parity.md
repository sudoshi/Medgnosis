# Geisinger CDS Compendium Parity — Gap Analysis & Implementation Plan

> **For agentic workers:** This is a **master roadmap**, not a single executable plan. It covers 8 independent subsystems. Per the writing-plans scope rule, each phase below MUST get its own detailed task-level plan (`docs/superpowers/plans/YYYY-MM-DD-phase-N-<name>.md`) before execution, using superpowers:writing-plans → superpowers:subagent-driven-development. Do not attempt to execute this document directly.

**Goal:** Make Medgnosis the complete realization of the Geisinger CDS portfolio (`~/Documents/Geisinger-CDS-Compendium/index.html`) — population identification, anticipatory care, closed-loop safety, real-time surveillance, and self-coding documentation — on modern standards (FHIR R4, SNOMED CT, ICD-10-CM, LOINC, CDS Hooks).

**Architecture:** Everything builds on what already exists: `phm_edw` (operational EDW) + `phm_star` (dimensional model) + BullMQ workers + the nightly scheduler + WebSocket alert push. The two genuinely new infrastructure pieces are a **versioned rules-as-data engine** (replacing hardcoded TypeScript rules) and a **real-time ingest lane** (hot partition unioned with the warehouse). Every clinical program is then content + worklist + UI on top of those.

**Tech Stack:** Fastify 5 / TypeScript, React 19 + Vite + TanStack Query + Zustand, PostgreSQL 17 (host, `claude_dev` via pgpass), Redis/BullMQ, Solr, Anthropic + Ollama via existing `llmClient`.

---

## Part 1 — Compendium Capability Inventory

The nine chapters decompose into 16 distinct capabilities:

| # | Capability | Compendium chapter | Essence |
|---|-----------|--------------------|---------|
| C1 | Dimensional "Bundle of Bundles" platform | 01, 09 | Conformed star schema, daily refresh, 410+ measures / 25 conditions |
| C2 | Business rules engine (logic as data) | 01, 09 | EAV rows, effective/expiration dates, time-travel evaluation, transparency |
| C3 | Real-time lane / hot partition | 01, 03, 04, 09 | HL7 stream ∪ nightly warehouse = one queryable "now" |
| C4 | Data discovery / data quality discipline | 01, 09 | Anomaly hunting (impossible values, zombies, NULL drift), 5 tests per feed |
| C5 | Care gaps engine (data → action) | 01, 07 | Daily gap computation, population→patient drill-down |
| C6 | Auto-Orders | 07 | Protocol enrollment (co-sign once), monthly batch generation, future-dated, revocable |
| C7 | AMP — Anticipatory Management | 07 | Gaps worked T-14 days pre-visit; 4 tiers; disposition ledger; no-show reduction |
| C8 | Close the Loop | 05 | Enumerate denominator → encode guideline matrix → verify closure evidence → worklist to documented resolution |
| C9 | MEWS early warning | 04 | Continuous vitals scoring, 4-rung nursing action ladder, live census, audit trail |
| C10 | Inpatient Glucometrics | 03 | Two transparent rules (≥300 once / 24h-avg ≥180), unit census triage, insulin ledger drill-down |
| C11 | SuperNote | 06 | Pre-assembled note: generated history, interval events, organ-grouped problems, in-note care gaps, typing→coding, recommendation cards |
| C12 | Problem List Analytics / diagnosis taxonomy | 02, 08 | Staged mutually-exclusive taxonomies (CKD/HF/obesity), two-pass population identification, bulk load utility |
| C13 | Cohort Manager | 02, 07 | Specialist-defined cohorts, continuously computed high-risk flags, trend views, structured closed-loop messaging to PCP |
| C14 | Auto-Referral for med therapy | 01, 07 | Persistently uncontrolled → pharmacist referral → repatriation at goal |
| C15 | Predictive risk (BCRA) | 05 | Validated risk model (Gail, 7 factors) run population-wide; chemoprevention gap surfaced |
| C16 | HCC capture / coding support | 06 | A&P-driven diagnosis coding, E&M complexity documentation |

## Part 2 — Medgnosis Current State (verified 2026-06-12)

**Present and solid:**
- **C1 ✅** `phm_star` (8 dims, 7 facts incl. `fact_care_gap`, `fact_measure_result`), measure calculator v2 (star aggregation), `nightly-scheduler.ts` (BullMQ cron → rules + risk + measures), mat-view refresh. 45 condition bundles (`docs/Medgnosis_CareGap_Bundles*.xlsx`), CMS eCQM SQL in `archive/`.
- **C5 ✅ (core)** `care-gaps` route, `phm_edw.care_gap`, bundles route (`/bundles`, `/overlaps`, `/population`), dashboards.
- Order **placement** exists: `orders/worklist`, `orders/place`, `orders/place-batch` emitting FHIR ServiceRequest with LOINC/CPT (`docs/Medgnosis_OrderSet_LOINC_CPT.xlsx`).
- Alerts: `clinical_alerts` table, list/acknowledge API, WebSocket push (`plugins/websocket.ts → publishAlert`).
- CDS Hooks (`/cds-services`, `medgnosis-care-gaps`), FHIR R4 read (Patient/Condition/Observation/MedicationRequest), Solr search, AI assistant "Abby" (`insights`, patient-context chat), AI scribe SOAP notes (`clinical-notes`), `riskScoring.ts`, OMOP export, admin (users/FHIR endpoints/audit/ETL).

**Partial:**
- **C2 ⚠️** `workers/rules-engine.ts` exists but rules are **hardcoded TypeScript** (`ALERT_RULE_KEYS`, `ALERT_THRESHOLDS`) — no versioning, no effective dating, no time-travel, no transparency endpoint.
- **C6 ⚠️** Can place orders, but no protocol/enrollment lifecycle (co-sign, standing 5-yr enrollment, monthly generation, expiry, dis-enrollment, exclusions).
- **C11 ⚠️** SOAP notes + AI scribe exist; none of the SuperNote assembly machinery.
- **C13 ⚠️** Care lists page exists; no criteria-based cohort builder, computed flags, or closed-loop messaging.
- **C15 ⚠️** Generic `computeRiskScore`; no validated published models (Gail/BCRA).

**Absent entirely:**
- **C3 ❌** No HL7/streaming ingest, no hot partition, no real-time anything.
- **C4 ❌** No data-quality module.
- **C8 ❌** No abnormal-result loop tracking (note: `phm_edw.order_result` exists as raw material).
- **C9 ❌ / C10 ❌** No inpatient surveillance (depends on C3). `phm_edw.vital_sign` exists (demo-scale).
- **C12 ❌ (engine)** No diagnosis ontology (dx → disease process → organ system → generate_plan), no staged taxonomies, no bulk load utility, no two-pass finder.
- **C14 ❌** No auto-referral *workflow* (a `referral` table exists).
- **C16 ❌** No HCC/coding analytics.

> **Correction (live-DB audit, 2026-06-12):** the live `phm_edw` has 114 tables — far beyond the archive DDL. Already present: `appointment` (4,276 rows) + `provider_schedule`, `problem_list` (12,067), `vital_sign` (4,414), `alert_rule` (5 rows, jsonb trigger logic — *not* versioned/effective-dated), `order_set`/`order_set_item`/`order_set_version` (55 sets), `clinical_order` (3,045), `order_result` (2,500), `referral`, `surveillance_schedule`. Consequently **D3 (appointments) is already done** except star-schema `fact_appointment` (deferred to Phase 4 where AMP needs it), and **D4's table exists** — Phase 2 builds the curation/bulk-load layer on top of it. Phase 1 scope is therefore: rules engine (D1) + dx ontology (D2).

---

## Part 3 — Delta Todo

Ordered by build sequence (dependencies flow downward). This is the canonical checklist; strike items as phases complete.

### Foundations
- [x] **D1. Rules-as-data engine** ✅ *Phase 1 (migrations 031/032, `feature/cds-phase1-rules-engine`).* `phm_edw.clinical_rule` EAV table (used phm_edw, not a new `app` schema — live DB has none) with effective/expiration dating; `apps/api/src/services/rulesEngine.ts` (`evaluate`/`getNumericThreshold`/`getValueSet`/`explain`/`listEntities`, time-travel + constant fallbacks); `GET /api/v1/rules` + `/api/v1/rules/:entity/:attribute?as_of=` transparency endpoints; alert worker migrated to read `CARE_GAP_CRITICAL_DAYS` from the engine. (C2)
- [x] **D2. Diagnosis ontology** ✅ *Phase 1.* `phm_edw.dx_ontology` (code → disease_process → organ_system → generate_plan, one code → many processes). 35 seeded rows: CKD GFR-staged (N18.x), HF 18-dx function×etiology taxonomy (I50/I42/I27), obesity BMI-banded (E66.x), E11.22 dual-mapped Nephrology+Endocrine, TBD placeholders. ICD-10-CM mapped; SNOMED enrichment deferred (not guessed). (C12)
- [x] **D3. Appointment data model** ✅ *Pre-existing* — `phm_edw.appointment` (4,276 rows) + `provider_schedule` already in live DB (migrations 010/018). `phm_star.fact_appointment` deferred to Phase 4 (where AMP consumes it). (prereq for C7)
- [x] **D4. Problem-list curation layer** ✅ *Phase 2 (migration 033).* `problem_list.provenance`+`ontology_id`, `problem_list_audit`, and `problemListService.applyBulk` (add/resolve/restage, dry-run, per-chart audit). `POST /api/v1/problem-list/bulk`. (C12)

### Population identification
- [x] **D5. Two-pass population finder** ✅ *Phase 2.* `populationFinder.runFinder` (cohort-scoped, per-patient via `fact_observation` code-filtered index + `dim_patient(patient_id)` index from mig 034); nightly BullMQ job; `population_finder_candidate` queue; `/api/v1/population-finder` accept(→bulk-load)/reject/dismiss; `PopulationFinderPage` worklist. Live-verified: 22 ckd_restage + 5 ckd_unlabeled (correct KDIGO staging) + 154 obesity over the 1,277-pt cohort. eGFR code = **33914-3** (MDRD, the resulted code) + 48642-3. EF→HF deferred (no EF data wired yet). (C12)
- [x] **D6. Recommendation cards** ✅ *Phase 2.* `medgnosis-problem-list` CDS Hooks `patient-view` service (evidence + add-Condition suggestion + Population-Finder link); *Does not have X* (permanent) + 12-month snooze are first-class in `recommendation_dismissal`, honored by the finder. (C11/C12)

- [x] **D7. Auto-Orders protocol lifecycle** ✅ *Phase 4 (migrations 037/038).* `phm_edw.order_protocol(_item)` + `protocol_enrollment` (provider co-sign → active, 5-yr standing, deny/dis-enroll); `autoOrders.generateForEnrollments` emits future-dated `clinical_order`s (`order_source='protocol'`) for due items; monthly BullMQ job; `/auto-orders` routes + co-sign queue UI. Seeded CHRONIC_MONITORING protocol (A1c/lipid/uACR/renal). Live-verified: enroll→cosign→active, 4 orders generated. (C6)
- [x] **D8. AMP pre-visit engine** ✅ *Phase 4.* Tiering (1 pre-visit via **seeded future appointments** / 2 not-seen-1yr / 3 drifted) + `amp_outreach` disposition ledger (**declined is counted**); `measure_definition.net_revenue` + capture-rate ROI (`/amp/roi`, the signature slider). Live-verified: 17,581 outreach rows (tier1 $83.6K / tier2 $88.9K / tier3 $267K opportunity), declined disposition persists + audits. **Deviation:** AMP-1 needed synthetic future appointments (all real appts were past); AMP-2/3 from real last-seen (391/68). (C7)
- [x] **D9. Auto-referral MTM** ✅ *Phase 4.* Uncontrolled detector (rules-engine thresholds A1c≥9 / SBP≥140 / LDL≥100; latest values via `fact_observation` code-filtered + `vital_sign`); `mtm_referral` state machine (referred→managed→at_goal→repatriated) over the existing `referral` table; `/mtm` routes + UI. Live-verified: 181 referrals from 584 DM/HTN/HLD patients (triggers genuinely uncontrolled), advance state machine works. (C14) Codes: A1c `4548-4`, LDL `18262-6`, SBP `vital_sign`. 

### Closed-loop safety
- [x] **D10. Close the Loop engine** ✅ *Phase 3 (migrations 035/036).* `phm_edw.result_loop` (result → obligation → window → status); guideline matrices in the rules engine — `RESULT_FOLLOWUP` active, `ASCCP_CYTOLOGY` seeded as **ready content** (no cytology data exists, so the engine runs over the 199 real abnormal `order_result` rows instead). Closure-evidence scan (reviewed / follow-up order); `/close-the-loop` worklist + `/stats` census + `/:id/resolve` with 4 documented terminal dispositions (appropriate_care / reviewed / refused / unable_to_reach). `CloseTheLoopPage`. Live-verified: 199 scanned → 24 open / 175 closed; resolve persists + audits. (C8)
- [x] **D11. Population risk models** ✅ *Phase 3.* Pluggable registry (`riskModels/`, extends `dim_risk_model`). **CHA₂DS₂-VASc** computed on real conditions+demographics — the flagship-on-real-data (same shape as BCRA's chemoprevention gap), surfacing the anticoagulation gap. Gail/BCRA registered but returns `insufficient_data` (reproductive/family-history inputs absent — honest, not faked). Live-verified: 15 AFib patients scored (0 gaps — all already anticoagulated, confirmed real); 350 Gail eligibles correctly insufficient_data. (C15) **Deviation:** CHA₂DS₂-VASc over Gail because demo data has AFib+conditions but no Gail inputs. (C15) (C11 BCRA "chemoprevention" pattern → anticoagulation gap.) 

### Real-time surveillance
- [x] **D12. Real-time lane** ✅ *Phase 5 (migrations 039/040).* `phm_rt` hot-partition schema (admission/vital_stream/glucose_stream/insulin_admin/ews_score); a **synthetic streamer** (`streamTick`, BullMQ repeatable every 5 min) appends readings + scores on arrival — structured so a real MLLP/HL7v2 source writes the same tables. **Deviation:** no live HL7 feed / no unit-bed in `encounter` → simulated stream over real patients (the lane is real, the feed is simulated). (C3)
- [x] **D13. Generic early-warning scoring engine** ✅ *Phase 5.* `ewsEngine.scoreVitals` is band-driven over the Phase-1-seeded rules — **MEWS + NEWS2** from one engine (numeric + discrete bands, F→C, single-param-3 escalation). Live unit census (`/surveillance/census`) with scores + action ladder + WebSocket escalation at MEWS≥5/NEWS2≥7; bedside drill-down. Live-verified: seeded deteriorating bed = MEWS 5 → RRT (the compendium worked example). (C9)
- [x] **D14. Glucometrics** ✅ *Phase 5.* Two-rule triage (`glucoseRisk`: any ≥300 / 24h-avg ≥180, thresholds from rules engine), unit census + drill-down (glucose trend + insulin ledger + context flags DM/on-insulin with freshness labels). Live-verified: 7/30 high-risk (persistent + severe-excursion). (C10)

### Documentation
- [x] **D15. SuperNote assembly** ✅ *Phase 6 (migration 041).* `superNote.assembleSuperNote` builds the note from the record: deterministic Brief Clinical History (leads with what's due), interval events (encounters/admits/referrals), organ-system-grouped problem list via the D2 ontology (dual-mapping preserved), in-note care gaps (include-toggle + as-of), 8-analyte trended labs (`fact_observation` code-filtered), and an A&P scaffold. `finalizeSuperNote` writes a `clinical_note` (`visit_type='supernote'`) + `note_coded_diagnosis` — **typing the plan codes the diagnosis** (HCC-relevance flagged, feeds Phase 8). `/supernote/:id` + finalize routes + `SuperNotePage`. Live-verified end-to-end (patient 9: 3 systems, 23 A&P entries, 2 dx coded incl. E11.22→HCC). **Deviation:** deterministic assembly (LLM narrative deferred — testable, no flakiness); OurNotes/PRO sections empty (no patient-entered data exists). (C11)
- [ ] **D16. Coding/HCC analytics** — HCC capture rate per provider, E&M level distribution shift, missed-opportunity report. (C16)

### Trust layer
- [x] **D17. Data-quality discovery module** ✅ *Phase 7 (migrations 042/043).* `dqDetectors.runDqScan` over small tables (vital_sign/provider) — impossible heights/temps/weights, implausible weight jumps, trailing-space identity; `dq_finding` rogues' gallery (confirm → `is_regression` standing check / dismiss); `dq_feed` five-tests board (accurate/timely/complete/understood/trusted + freshness/latency). Nightly worker. Live-verified: all 5 seeded specimens caught (985in, 212°F, 1480lb, jump, trailing-space provider). **Deviations:** "zombie" detector dropped (no death column); anomalies seeded (Synthea data clean); NEVER scans observation/patient (memory rule). (C4)
- [x] **D18. Cohort Manager** ✅ *Phase 7.* `cohortFlags`: criteria-based `cohort_definition` + `previewCohort` (condition-prefix + flag membership); continuously-computed `patient_flag` (**HYPERKALEMIA / GFR_LOW / NEW_ACEARB_NO_BMP** via `fact_observation` code-filtered + med/BMP signals); `/cohorts` routes + flagged worklist + **structured closed-loop `cohort_message`** specialist→PCP (required disposition, tracked sent→resolved); `CohortManagerPage`. Live-verified: GFR_LOW 110 / NEW_ACEARB_NO_BMP 367 flags, cohort 1 = 55 members (flag+condition), message sent→resolved. (C13)

---

## Part 4 — Phased Implementation Plan

Dependency graph:

```
Phase 1 (rules engine + ontology + appointments)
  ├─→ Phase 2 (problem list & population identification)
  │     └─→ Phase 6 (SuperNote)  ─→ Phase 8 (coding analytics)
  ├─→ Phase 3 (Close the Loop + risk models)
  ├─→ Phase 4 (Auto-Orders + AMP + auto-referral)
  ├─→ Phase 5 (real-time lane → MEWS + Glucometrics)
  └─→ Phase 7 (data quality + cohort manager)   [7 can start anytime after 1]
```

### Phase 1 — Rules Engine, Ontology, Appointments (foundations)
**Delivers:** D1, D2, D3. **Everything else keys off this** — the compendium's own lesson ("the problem list is destiny", "logic out of code, into data").
- New tables: `app.clinical_rule` (entity, attribute, value, value_type, effective_date, expiration_date, created_by, source), `app.dx_ontology`, `phm_edw.appointment`, `phm_star.fact_appointment`.
- New service: `apps/api/src/services/rulesEngine.ts` — `evaluate(entity, attribute, asOf?)` returning typed value sets; `explain()` returning the active rows (transparency endpoint `GET /rules/:entity/:attribute`).
- Refactor: `workers/rules-engine.ts` reads thresholds/criteria from the engine instead of `ALERT_THRESHOLDS`.
- Seed: CKD staging bands, HF taxonomy (18 dx), obesity BMI bands, MEWS/NEWS2 scoring bands (used in Phase 5), glucometrics thresholds, bundle inclusion criteria for the top conditions.
- Demo data: appointment generator (forward-dated appointments for ~20% of active patients, realistic no-show base rate).

### Phase 2 — Problem List Analytics & Population Identification
**Delivers:** D4, D5, D6. The CKD playbook: name → find → act.
- `app.problem_list_entry` + bulk load utility (`POST /problem-list/bulk` with add/resolve/move actions, dry-run mode, per-chart audit log).
- Two-pass finder as BullMQ jobs; results land in a review worklist (`/population-finder` page), clinician approves → bulk load executes.
- Recommendation cards: new CDS Hooks service `medgnosis-problem-list` + in-app card component with dismissal semantics ("does not have X" persisted, 12-month snooze honored).
- KPI instrumentation from day one: staged-diagnosis share over time (the +196% chart), % of identified patients addressed at next encounter (the 10× chart).

### Phase 3 — Close the Loop & Population Risk
**Delivers:** D10, D11. Highest clinical-safety value per engineering hour; needs only batch data that already exists.
- `app.result_loop`, `app.loop_disposition`; guideline matrix rows in the rules engine (age × result × HPV → action + window), closure-evidence scanner (orders, procedures, notes) as nightly job.
- CTL worklist page: open loops sorted by clock urgency, disposition capture, "the denominator is the deliverable" dashboard (every abnormal result and its status, continuously verified).
- Risk model registry (`apps/api/src/services/riskModels/`) with Gail as first entrant; population sweep job; results to `phm_star`; chemoprevention-gap worklist.

### Phase 4 — Auto-Orders, AMP & Auto-Referral
**Delivers:** D7, D8, D9. Requires Phase 1 appointments.
- Protocol tables + enrollment state machine; monthly generation worker (future-dated, auto-expiring orders into the existing `orders` pipeline); provider co-sign queue UI with throttling.
- AMP engine: nightly T-14 sweep producing tiered outreach worklists; outreach UI with scripted education content per gap; disposition ledger where *declined* and *unable to reach* are counted outcomes (the Close-the-Loop instinct applied to outreach).
- ROI dashboard: per-gap net revenue × capture-rate slider (10/20/30/100%), exactly as the program modeled it.
- Auto-referral: uncontrol detector + referral state machine, repatriation on N consecutive in-goal results.

### Phase 5 — Real-Time Lane, MEWS & Glucometrics
**Delivers:** D12, D13, D14. The biggest architectural addition — isolated on purpose so its risk doesn't block Phases 2–4.
- Ingest: MLLP listener (HL7v2 ORU^R01, ADT) → `phm_rt.observation_hot`; views union hot + warehouse; nightly absorb-and-truncate. Demo mode: synthetic inpatient census + vitals/glucose/insulin streamer so the feature is demonstrable without a hospital feed.
- Scoring engine evaluates on arrival (BullMQ); scores → WebSocket census channel; advisory + order-set linkage; documentation-cadence audit.
- Two UIs: unit census (live score column, flag highlighting) and patient drill-down (trend + ledger + context flags with freshness labels).
- Process analytics: nursing adherence and provider acknowledgment run charts — the program audits itself.

### Phase 6 — SuperNote
**Delivers:** D15. Requires Phases 1–2 (ontology, problem list, care gaps in good order); lands after the data it assembles is trustworthy — same sequencing Geisinger used (2013–15, after the platform matured).
- Note assembly service composing: generated history, interval events, organ-grouped problems, in-note gaps, trended labs, A&P-with-previous-plan. Abby (existing `llmClient`) drafts narrative *from assembled structured data*, never from scratch.
- Typing-becomes-coding: A&P entries bind to ontology dx; signing the note emits coded diagnoses (and feeds Phase 8 HCC metrics).
- OurNotes: patient pre-visit narrative + structured PRO instruments (NYHA etc.) via existing patient model.

### Phase 7 — Data Quality & Cohort Manager
**Delivers:** D17, D18. Can run in parallel with Phases 3–6 after Phase 1.
- DQ: detector jobs + `app.dq_finding` + gallery dashboard + feed-level 5-tests metadata; confirmed anomalies auto-register as recurring checks.
- Cohort Manager: cohort builder UI (criteria over dims/labs/flags), continuous flag evaluation via rules engine, trend views, structured specialist→PCP message with required-disposition tracking.

### Phase 8 — Coding & HCC Analytics
**Delivers:** D16. Thin reporting layer over Phase 6 output: HCC capture trend, E&M distribution shift per provider, missed-opportunity report.

---

## Part 5 — Deliberate Modernizations (not literal ports)

| Geisinger (2007–2015) | Medgnosis equivalent | Why |
|---|---|---|
| ICD-9 taxonomies | SNOMED CT + ICD-10-CM | Standards-first; ICD-9 is dead |
| Teradata + Informatica | PostgreSQL 17 star schema (exists) | Already built |
| eGate HL7 engine | Node MLLP listener + FHIR Subscription support | Right-sized; FHIR-native sources skip v2 entirely |
| Epic Bulk Order Utility | FHIR ServiceRequest batch (exists in `orders`) | Vendor-neutral |
| Epic In Basket closed-loop messages | In-app structured messaging + FHIR Communication | Vendor-neutral |
| ASCCP matrix (2006-era) | ASCCP 2019 risk-based guidelines as rules-engine content | Clinical currency; the *design* (computable matrix) is what's ported |
| MEWS only | MEWS + NEWS2 from one generic scoring engine | NEWS2 is the current standard; engine is score-agnostic |
| BPA advisories | CDS Hooks cards (exists) + WebSocket alerts (exists) | Standards-first |

**Doctrines ported unchanged:** transparency → trust (every score/gap explains its criteria); adoption by choice (no forced workflows, "does not have X" is first-class); declined/unreachable are counted terminal states, never silence; delegation to the discipline best built to act; measure process honestly, label freshness on-screen.

---

## Part 6 — Execution Protocol

1. Each phase: `superpowers:writing-plans` → detailed TDD plan → `superpowers:subagent-driven-development`.
2. Per project rules: auth system untouchable (`.claude/rules/auth-system.md`); DB work via `claude_dev` on host PG17; additive migrations only; conventional commits; `npx tsc --noEmit` **and** `npx vite build` before every commit.
3. Every phase ships its own KPI instrumentation (the compendium's discipline: the program audits itself).
