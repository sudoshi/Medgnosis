# Measure Calculator v2 — Star Schema Aggregation

**Date:** 2026-03-13
**Status:** Approved
**Replaces:** SQL-file-based eCQM engine (`measureEngine.ts` + 45 archive SQL files)

## Problem

The original measure calculator loaded 45 CMS eCQM SQL files from `archive/backend/database/Measures/` and executed them via `sql.unsafe()` against the PHM EDW. On March 8, 2026, the `medgnosis-worker.service` systemd unit triggered a nightly batch that:

1. **Most SQL files were broken** — referenced non-existent CTEs/tables (`final_calc`, `eligible_patients`, `retinopathy_patients`, etc.), had type mismatches, and missing columns
2. **Long-running queries exhausted PostgreSQL connections** — CMS347v7 ran for ~20 minutes
3. **No circuit breaker** — after all 45 failed, it restarted the entire batch
4. **Ignored SIGTERM** — required SIGKILL after 90s timeout
5. **10,108 log lines in 32 minutes** of cascading errors

The service was masked (`systemctl mask medgnosis-worker`) to stop the damage. `fact_measure_result` has 0 rows — it was never successfully populated.

## Solution

The star schema ETL (migration 014) already evaluates every patient against every bundle measure. `fact_patient_bundle_detail` contains 26,967 rows across 202 measures and 992 patients, with `gap_status` encoding the eCQM population logic:

| `gap_status` | eCQM meaning | `fact_measure_result` mapping |
|---|---|---|
| `open` | In denominator, not met | `denominator_flag=true, numerator_flag=false` |
| `closed` | In denominator, met | `denominator_flag=true, numerator_flag=true` |
| `excluded` | Excluded from measure | `exclusion_flag=true` |

**Note:** `gap_status` values are lowercase in the database (verified: `open`, `closed`, `excluded`). `dim_date` covers 1910-01-01 through 2040-12-31, so CURRENT_DATE is always present.

The new calculator replaces 45 broken SQL files with a single aggregation query.

## Architecture

```
fact_patient_bundle_detail (26,967 rows, populated by ETL 014)
        │
        ▼
measureCalculatorV2.ts
  - Single SQL inside a transaction: TRUNCATE + INSERT ... SELECT
  - Maps gap_status → denominator/numerator/exclusion flags
  - Sub-second execution
        │
        ▼
fact_measure_result (one row per patient × measure × date)
  - patient_key, measure_key, date_key_period
  - denominator_flag, numerator_flag, exclusion_flag
  - measure_value, count_measure
```

## Components

### 1. `services/measureCalculatorV2.ts` (new file, replaces `measureEngine.ts`)

Exports:

- `refreshMeasureResults()` — executes the aggregation query, returns `{ rowCount, durationMs }`
- `getMeasureSummary()` — returns per-measure performance rates from `fact_measure_result`

```typescript
interface MeasureSummaryRow {
  measure_key: number;
  measure_code: string;
  measure_name: string;
  eligible: number;    // denominator (open + closed)
  met: number;         // numerator (closed)
  excluded: number;
  performance_rate: number | null;  // met / eligible * 100
}
```

The core query uses `sql.begin()` for atomicity and `SET LOCAL` to scope the timeout:

```typescript
const result = await sql.begin(async (tx) => {
  await tx.unsafe('SET LOCAL statement_timeout = \'30s\'');
  await tx.unsafe('TRUNCATE phm_star.fact_measure_result');
  const rows = await tx.unsafe(`
    INSERT INTO phm_star.fact_measure_result
      (patient_key, measure_key, date_key_period,
       denominator_flag, numerator_flag, exclusion_flag,
       measure_value, count_measure)
    SELECT
      d.patient_key,
      d.measure_key,
      (SELECT date_key FROM phm_star.dim_date WHERE full_date = CURRENT_DATE),
      LOWER(d.gap_status) IN ('open', 'closed'),
      LOWER(d.gap_status) = 'closed',
      LOWER(d.gap_status) = 'excluded',
      NULL,
      1
    FROM phm_star.fact_patient_bundle_detail d
  `);
  return rows;
});
```

Key properties:
- **Atomic**: `sql.begin()` wraps TRUNCATE + INSERT in a transaction — if INSERT fails, TRUNCATE rolls back
- **Idempotent**: Safe to re-run anytime; produces identical results
- **Fast**: ~26,967 rows, sub-second on indexed star schema
- **No raw EDW access**: reads only from pre-aggregated star schema
- **Statement timeout**: `SET LOCAL` scoped to transaction — does not leak to connection pool
- **Case-safe**: `LOWER(d.gap_status)` handles any case variation

`getMeasureSummary()` query:

```sql
SELECT
  dm.measure_key,
  dm.measure_code,
  dm.measure_name,
  COUNT(*) FILTER (WHERE fmr.denominator_flag) AS eligible,
  COUNT(*) FILTER (WHERE fmr.numerator_flag) AS met,
  COUNT(*) FILTER (WHERE fmr.exclusion_flag) AS excluded,
  ROUND(
    COUNT(*) FILTER (WHERE fmr.numerator_flag)::numeric /
    NULLIF(COUNT(*) FILTER (WHERE fmr.denominator_flag), 0) * 100, 1
  ) AS performance_rate
FROM phm_star.fact_measure_result fmr
JOIN phm_star.dim_measure dm ON dm.measure_key = fmr.measure_key
GROUP BY dm.measure_key, dm.measure_code, dm.measure_name
ORDER BY dm.measure_code
```

### 2. `workers/measure-calculator.ts` (update existing)

Changes:
- Import from `measureCalculatorV2` instead of `measureEngine`
- Remove `measureCode` single-measure path (no longer needed — all-or-nothing aggregation)
- Add SIGTERM handler: `process.on('SIGTERM', () => worker.close())`
- Simplify: single job type triggers `refreshMeasureResults()`
- BullMQ config: `attempts: 2`, `backoff: { type: 'fixed', delay: 300_000 }` (retry once after 5 min for transient failures)
- Retain BullMQ queue for nightly repeatable job + manual trigger

### 3. `routes/admin/index.ts` (update existing)

- **Extend** `POST /admin/refresh-mat-views` to call `refreshMeasureResults()` after all mat views complete
- **Add** `POST /admin/refresh-measures` for on-demand measure-only refresh
- Both endpoints write to `audit_log` with action `measure_refresh`, recording row count and duration

### 4. `routes/measures/index.ts` (bugfix)

**Existing bug (latent — never triggered because `fact_measure_result` was empty):** Line 63 queries `WHERE measure_key = ${id}::int` but `id` comes from `measure_definition.measure_id`. Since `measure_key` (e.g. 586) != `measure_id` (e.g. 91), the detail query returns zero rows.

**Fix:** Join through `dim_measure` to resolve `measure_id` → `measure_key`, or query `fact_measure_result` via `dim_measure.measure_id`.

### 5. `services/measureEngine.ts` (delete)

- Remove the file entirely
- The 45 SQL files in `archive/backend/database/Measures/` remain as historical reference but are never executed

## Safety Guardrails

| Guardrail | Implementation |
|---|---|
| Atomic refresh | `sql.begin()` wraps TRUNCATE + INSERT — failed INSERT rolls back TRUNCATE |
| Statement timeout | `SET LOCAL statement_timeout = '30s'` inside transaction — no pool leak |
| Graceful SIGTERM | Worker registers `process.on('SIGTERM')`, calls `worker.close()` |
| Limited retry | BullMQ `attempts: 2`, 5-min backoff — recovers from transient failures without storms |
| Connection isolation | Uses existing `sql` pool, single connection per execution |
| Case-safe | `LOWER(d.gap_status)` handles any case variation in data |
| Idempotent | TRUNCATE + INSERT — re-run produces identical results |
| Audit trail | Admin-triggered refreshes logged to `audit_log` table |
| Logging | Structured log: row count, duration (ms), success/failure |

## What Does NOT Change

- No schema migrations — `fact_measure_result` table already exists with correct columns
- No new database tables
- No changes to `dim_measure`, `measure_definition`, or `bridge_bundle_measure`
- No changes to the frontend `MeasuresPage` — it already reads from the measures API
- No changes to FHIR routes or CDS Hooks
- The 45 legacy SQL files stay in `archive/` as documentation
- The masked `medgnosis-worker.service` systemd unit stays masked — Docker worker replaces it

## Data Flow

```
EDW tables (patient, condition_diagnosis, care_gap, encounter, ...)
    │
    ▼  (ETL migration 014 — already runs)
Star schema: fact_patient_bundle_detail
    │
    ▼  (measureCalculatorV2 — this spec)
Star schema: fact_measure_result
    │
    ▼  (existing API)
GET /measures, GET /measures/:code → MeasuresPage
```

## Trigger Mechanisms

1. **Nightly BullMQ repeatable job** — configured in Docker worker startup, runs at 2:00 AM ET (cron: `0 6 * * *` UTC)
2. **Admin Panel button** — "Refresh Mat Views" also triggers measure recalculation after views complete
3. **Manual** — `POST /admin/refresh-measures` endpoint for on-demand measure-only refresh

## Verification

After implementation:
- `SELECT COUNT(*) FROM phm_star.fact_measure_result` should return ~26,967 rows
- `SELECT measure_key, COUNT(*) FILTER (WHERE numerator_flag) as met, COUNT(*) FILTER (WHERE denominator_flag) as eligible FROM phm_star.fact_measure_result GROUP BY measure_key` should show non-zero counts matching `fact_patient_bundle_detail` gap_status distribution
- Execution time under 1 second
- Worker responds to SIGTERM within 5 seconds
- No PostgreSQL connection errors under normal operation
- `audit_log` contains entries for manual refreshes

## Files Changed

| File | Action |
|---|---|
| `apps/api/src/services/measureCalculatorV2.ts` | **Create** — star schema aggregation engine |
| `apps/api/src/services/measureEngine.ts` | **Delete** — replaced by v2 |
| `apps/api/src/workers/measure-calculator.ts` | **Update** — use v2, add safety, nightly schedule, SIGTERM handler |
| `apps/api/src/routes/admin/index.ts` | **Update** — add `/refresh-measures`, extend mat view refresh, audit logging |
| `apps/api/src/routes/measures/index.ts` | **Bugfix** — fix measure_key vs measure_id mismatch in detail query |
