# Handoff: Incorporating Parthenon's eCQM Infrastructure into Medgnosis

**Date:** 2026-06-12
**From:** Claude Code session in `/home/smudoshi/Github/Parthenon`
**To:** Agent working in `/home/smudoshi/Github/Medgnosis`
**Status:** Reference + incorporation guide (not an executable plan — write your own per `superpowers:writing-plans` when you pick this up)

---

## 1. TL;DR

Parthenon (Laravel 11 / OMOP CDM) has a production eCQM stack built around **VSAC value sets**, **JSONB-defined quality measures**, **versioned population runs**, and a **swappable measure-evaluator interface**. Medgnosis already has its own measure calculator (48 CMS eCQMs, `fact_measure_result`, `measureCalculatorV2.ts`), so this is **not a code port**. The valuable imports are:

1. **The VSAC data asset** — 1,545 value sets / 225,261 codes / 72 CMS measure definitions, already ingested and sitting in Parthenon's PostgreSQL (`app.vsac_*` tables on host PG17). This replaces Medgnosis's hand-maintained CSV inclusion codes in `clinical_rule` with authoritative, versioned CMS value sets.
2. **The schema design** for value sets, measure criteria, and versioned measure runs (auditable, person-level drill-down).
3. **Two SQL techniques**: single-pass GROUPING SETS stratification, and temp-table person-set materialization.
4. **The evaluator-interface pattern** that lets a future CQL engine drop in without schema change.

Do **not** port: Laravel/Eloquent code, the OMOP `concept_ancestor` descendant expansion (Medgnosis has no OMOP vocab — VSAC expansions are pre-flattened anyway), or Parthenon's data-relative reporting anchor (see §6.2).

---

## 2. What Parthenon's eCQM Stack Is

Module name in Parthenon: **Care Bundles / Care Gaps** ("condition bundle" = disease framework, e.g. CKD; each bundle carries N quality measures). Flow:

```
VSAC workbooks ──ingest──▶ app.vsac_* tables ──crosswalk──▶ OMOP concept_ids
                                                              │
condition_bundles ──qualify population──▶ care_bundle_runs    │
        │                                      │              ▼
bundle_measures ──▶ quality_measures ──evaluate──▶ per-person numer/excl flags
 (M2M junction)     (JSONB criteria)               + GROUPING SETS strata
                                                   + aggregate rates
                                                              │
                                              FHIR Measure export / UI tiers
```

### Key source files (all under `/home/smudoshi/Github/Parthenon/`)

| Concern | Path |
|---|---|
| Evaluator contract (interface) | `backend/app/Services/CareBundles/CareBundleMeasureEvaluator.php` |
| SQL evaluator (the workhorse) | `backend/app/Services/CareBundles/Evaluators/CohortBasedMeasureEvaluator.php` |
| CQL evaluator (Phase 3b placeholder) | `backend/app/Services/CareBundles/Evaluators/CqlMeasureEvaluator.php` |
| Config (evaluator binding, CQL engine URL, min population) | `backend/config/care_bundles.php` |
| Measure model (JSONB criteria casts) | `backend/app/Models/App/QualityMeasure.php` |
| VSAC ingest script (Python, psycopg2 + openpyxl) | `scripts/importers/ingest_vsac.py` |
| VSAC→OMOP crosswalk (materialized view) | `backend/database/migrations/2026_04_24_000500_create_vsac_omop_crosswalk_view.php` |
| Core tables migration | `backend/database/migrations/2026_03_02_100000_create_care_bundles_tables.php` |
| Run/qualification/results/strata/person-status migrations | `backend/database/migrations/2026_04_23_*` and `2026_04_24_200000_*`, `2026_04_25_000100_*` |
| Wilson 95% CI helper | `backend/app/Services/CareBundles/WilsonCI.php` |
| FHIR Measure resource export | `backend/app/Services/CareBundles/FhirMeasureExporter.php` |
| Stratification / trends / comparison / roster services | `backend/app/Services/CareBundles/Measure{Stratification,Trend,Comparison,Roster}Service.php` |
| Seeders (45 condition bundles + measures) | `backend/database/seeders/ConditionBundleSeeder.php`, `AdditionalConditionBundleSeeder.php` |
| API controllers | `backend/app/Http/Controllers/Api/V1/{CareBundleController,CareGapController,VsacController}.php` |

---

## 3. The Data Asset (highest-value import)

### 3.1 VSAC tables — live in Parthenon's DB now

Database: `parthenon` on **host PG17** (`host=127.0.0.1 user=claude_dev`, auth via `~/.pgpass`). Schema `app`:

| Table | Rows | Contents |
|---|---|---|
| `app.vsac_value_sets` | 1,545 | One row per value-set OID: name, QDM category, definition/expansion versions, purpose fields |
| `app.vsac_value_set_codes` | 225,261 | (oid, code, description, code_system, code_system_oid, code_system_version) — the flattened expansions |
| `app.vsac_measures` | 72 | One per CMS measure (CMS2v15 … ), title, CBE number, program candidacy |
| `app.vsac_measure_value_sets` | 1,597 | M2M: measure → value-set OIDs |
| `app.vsac_value_set_omop_concepts` (matview) | 192,869 | VSAC code → OMOP `concept_id` crosswalk — **skip for Medgnosis** (no OMOP vocab); the raw codes are what you want |

Source files were `dqm_vs_20251117.xlsx` (CMS dQM VSAC, ~224K rows) and `ec_hospip_hospop_cms_20250508.xlsx` (one sheet per CMS measure). **These workbooks are no longer at the Parthenon repo root — the DB is the source of truth for transfer.**

### 3.2 Recommended transfer

```bash
# From the Medgnosis side — pull the four base tables (NOT the matview):
pg_dump -h 127.0.0.1 -U claude_dev -d parthenon \
  -t app.vsac_value_sets -t app.vsac_value_set_codes \
  -t app.vsac_measures -t app.vsac_measure_value_sets \
  --no-owner --no-privileges -f /tmp/vsac_export.sql
# Then adapt schema-qualification (app. → phm_edw. or a new ref_ schema) and load.
```

Alternatively, port `scripts/importers/ingest_vsac.py` to a Medgnosis seeder — but you'd need to re-source the CMS workbooks (VSAC downloads at https://vsac.nlm.nih.gov, requires UMLS license). The pg_dump route is faster and gives identical data.

VSAC code systems present: SNOMEDCT, ICD10CM, ICD10PCS, LOINC, RXNORM, CPT, HCPCS Level II, CVX, CDT — these align directly with the code columns Medgnosis already stores in `phm_edw` (`condition_diagnosis.condition_code` ICD-10, `observation.observation_code` LOINC, `medication_order.medication_code` RxNorm, `procedure.procedure_code` CPT). **No crosswalk needed** — join VSAC codes to your EDW columns directly.

---

## 4. Schema Designs Worth Adopting

### 4.1 Measure criteria as structured JSONB (vs. Medgnosis's CSV-in-EAV)

Parthenon's `quality_measures` table (338 rows):

```
measure_code (unique) | measure_name | measure_type (preventive|chronic|behavioral)
domain (condition|drug|procedure|measurement|observation)
numerator_criteria  jsonb   e.g. {"concept_ids": [4084765], "lookback_days": 365}
denominator_criteria jsonb
exclusion_criteria  jsonb   e.g. {"exclusions": [{"domain":"condition","concept_ids":[...],"lookback_days":730}]}
frequency | is_active
```

For Medgnosis, the analogous shape would reference **value-set OIDs instead of OMOP concept_ids**:

```json
{ "value_set_oids": ["2.16.840.1.113883.3.464.1003.198.12.1019"], "lookback_days": 365 }
```

This is strictly better than the current `clinical_rule` `INCLUSION_CODES` CSV approach because: (a) value sets are versioned by CMS, (b) one OID can carry thousands of codes across code systems, (c) re-ingesting a new VSAC release updates every measure at once. It also composes with the Phase-1 rules engine: `clinical_rule` can keep thresholds/logic while value-set membership moves to `vsac_*`.

### 4.2 Versioned runs + person-level status (auditability)

Parthenon separates **"who ran what, against which data, when"** from the results:

- `care_bundle_runs` — status, started/completed, `triggered_by`, `trigger_kind` (manual|scheduled), `qualified_person_count`, `bundle_version`, **`cdm_fingerprint`** (hash of source data state — lets you detect stale results)
- `care_bundle_qualifications` — (run_id, person_id, qualifies, measure_summary jsonb), unique on (run, person)
- `care_bundle_measure_results` — aggregate denom/numer/excl per (run, measure)
- `care_bundle_measure_strata` — per-dimension strata rows (age band, sex)
- `care_bundle_measure_person_status` — (run, measure, person_id, is_numer, is_excl) — powers drill-down to the **non-compliant patient roster** and cohort export

Medgnosis's `fact_patient_bundle_detail` ≈ `person_status`, but lacks run versioning. If the Geisinger plan's Phase 2 ("two-pass population finder") or Phase 7 ("Cohort Manager") needs reproducible, auditable measure snapshots — adopt the run-versioning layer. Each nightly `measureCalculatorV2` refresh becomes a run row instead of an in-place overwrite, and "as-of" comparisons (this month vs last) fall out for free (`MeasureTrendService.php` shows the query patterns).

---

## 5. SQL Techniques (directly portable, dialect-identical — both are PostgreSQL)

### 5.1 Single-pass GROUPING SETS stratification

`CohortBasedMeasureEvaluator.php:57-111`. Instead of re-running the cohort CTEs once for the headline rate and once per stratification dimension, classify each person once, then:

```sql
SELECT
  CASE GROUPING(age_band, sex_cat) WHEN 3 THEN 'all' WHEN 1 THEN 'age_band' WHEN 2 THEN 'sex' END AS dimension,
  ...,
  COUNT(*) FILTER (WHERE NOT is_excl)               AS denom,
  COUNT(*) FILTER (WHERE is_numer AND NOT is_excl)  AS numer,
  COUNT(*) FILTER (WHERE is_excl)                   AS excl
FROM classified
GROUP BY GROUPING SETS ((), (age_band), (sex_cat))
```

One scan produces headline + all strata. This replaced a 3x-cost pattern in Parthenon and would do the same in `measureCalculatorV2.ts`.

### 5.2 Temp-table person-set materialization

`CohortBasedMeasureEvaluator.php:186-193`: materialize numerator and exclusion person-sets as session temp tables (`CREATE TEMP TABLE ... ON COMMIT DROP`), index on person_id, `ANALYZE`, then hash-join. Heavy clinical-table scans happen **exactly once per measure**; explicit `DROP TABLE IF EXISTS` between measures (don't rely on ON COMMIT DROP mid-transaction — Parthenon learned this).

### 5.3 eCQM accounting semantics (copy exactly)

```
denom = qualified persons NOT in exclusion set
numer = qualified persons IN numerator set AND NOT in exclusion set
excl  = qualified persons IN exclusion set   (removed from BOTH denom and numer)
```

Exclusions reduce the denominator — they are not just "not in numerator." Verify `measureCalculatorV2.ts` does this; if `exclusion_flag` patients currently remain in the denominator, rates are understated.

### 5.4 Parameterized lookback intervals

PG can't parameterize `INTERVAL '365 days'` literals. Parthenon's trick (`CohortBasedMeasureEvaluator.php:218-232`): bind an integer and multiply — `... >= anchor_date - (? * INTERVAL '1 day')`. Keeps lookback out of the SQL string (injection defense-in-depth).

---

## 6. Differences & Gotchas — READ BEFORE PORTING

### 6.1 Data model mismatch (the big one)

Parthenon evaluates against **OMOP CDM** domain tables with **concept_id** semantics, including hierarchy expansion via `vocab.concept_ancestor` (an ancestor concept implies all descendants). **Medgnosis has neither OMOP vocab tables nor concept_ids.** This is fine: VSAC value-set expansions are already **flat, pre-expanded code lists** — descendant expansion is unnecessary when you consume VSAC directly. Your evaluator joins `vsac_value_set_codes.code` against `phm_edw` code columns. Domain routing table for Medgnosis:

| Parthenon domain | OMOP table | Medgnosis `phm_edw` equivalent | Join column |
|---|---|---|---|
| condition | condition_occurrence | `condition_diagnosis` | ICD-10 code |
| drug | drug_exposure | `medication_order` | RxNorm code |
| procedure | procedure_occurrence | `procedure` | CPT/SNOMED code |
| measurement | measurement | `lab_result` / `observation` | LOINC code |
| observation | observation | `observation` | LOINC code |

Watch code formatting: VSAC ICD-10 codes carry dots (`E11.9`); verify `condition_diagnosis` stores the same format before joining.

### 6.2 Reporting-period anchor

Parthenon anchors lookbacks to `MAX(date_column)` of each domain table because its CDMs are **static research datasets** (SynPUF data ends in 2010). Medgnosis is a **live operational system** — anchor to the measurement period (`CURRENT_DATE` or explicit calendar period per CMS spec). Do not copy the `SELECT MAX({date}) FROM ...` subquery; it also costs a full-column scan you don't need.

### 6.3 Evaluator-interface pattern (port the idea, not the code)

Parthenon binds `CareBundleMeasureEvaluator` via `config('care_bundles.evaluator')` — `cohort_based` today, `cql` (cqf-ruler bridge) later, **identical signature, no schema change**. The CQL implementation is an intentional placeholder that throws an actionable error at evaluation time, not boot. In Medgnosis terms: define a `MeasureEvaluator` TS interface now, implement `SqlMeasureEvaluator`, and the Geisinger roadmap's future CQL/FHIR Measure work slots in behind it. The Geisinger compendium's measure logic will eventually want real CQL — this seam is cheap insurance.

### 6.4 Medgnosis-side known landmines (from project memory)

- **postgres.js jsonb double-encoding**: pass objects through `sql.json(obj)`, never `JSON.stringify` first; migration runner needs `max: 1` connection.
- Statistical floor: Parthenon flags populations <100,000 persons as research-only (Wilson 95% CI on proportions tightens below ±0.5pp at that size — `config/care_bundles.php:55`). Medgnosis panels are far smaller, so **always show CIs** (`WilsonCI.php` is ~30 lines, trivially portable to TS) rather than gating.

---

## 7. Suggested Incorporation Order (maps to Geisinger CDS parity roadmap)

| Step | What | Roadmap fit | Effort |
|---|---|---|---|
| 1 | pg_dump/load the 4 `vsac_*` tables into Medgnosis (new `ref` schema or `phm_edw`); add migration + indexes (oid, code, code_system) | Foundation for Phase 2 population finder | S |
| 2 | Bridge: view or rules-engine entity mapping value-set OIDs → existing `measure_definition` / `clinical_rule` entities; migrate `INCLUSION_CODES` CSVs to OID references measure-by-measure | Phase 1 follow-through (rules-as-data) | M |
| 3 | Adopt eCQM accounting semantics (§5.3) + GROUPING SETS strata (§5.1) in `measureCalculatorV2.ts`; add Wilson CIs to measure API responses | Measure calculator hardening | M |
| 4 | Add run-versioning tables (`measure_run`, `measure_person_status`) modeled on Parthenon's `care_bundle_runs`/`..._person_status`; nightly BullMQ job writes a run instead of overwriting | Phase 2 (two-pass population finder needs reproducible snapshots), Phase 7 (Cohort Manager) | M-L |
| 5 | Define the `MeasureEvaluator` interface seam (§6.3) | Future CQL phase | S |
| 6 | (Optional) FHIR `Measure` resource export modeled on `FhirMeasureExporter.php` — canonical URL `${base}/Measure/{code}`; pairs with Medgnosis's existing FHIR R4 read endpoints and CDS Hooks `medgnosis-care-gaps` cards | Interop polish | S-M |

Steps 1–2 are the highest leverage: they turn Medgnosis's measure definitions from hand-typed code lists into CMS-versioned value sets without touching the calculator.

## 8. Verification Checklist (for whoever executes)

- [ ] Row counts after load match source: 1,545 / 225,261 / 72 / 1,597
- [ ] Spot-check 3 OIDs against VSAC website (code count + a sample code per code system)
- [ ] One migrated measure produces identical gap lists under CSV codes vs. OID-resolved codes (regression gate before cutting over)
- [ ] Exclusion semantics test: an excluded patient appears in neither numerator nor denominator
- [ ] `sql.json()` used for every jsonb write in new TS code
- [ ] CI/typecheck green (`tsc`), and measure nightly job runtime not regressed (GROUPING SETS should *improve* it)

---

*Parthenon contacts for deeper questions: this doc's session transcript, Parthenon Brain (`parthenon_docs` / `parthenon_code` ChromaDB collections — query e.g. "care bundle measure evaluator"), and `docs/devlog/` in the Parthenon repo.*
