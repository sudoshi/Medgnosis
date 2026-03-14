# Measure Calculator v2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken 45-file SQL eCQM engine with a single-query star schema aggregation that populates `fact_measure_result` from `fact_patient_bundle_detail`.

**Architecture:** `measureCalculatorV2.ts` wraps a transactional TRUNCATE + INSERT that maps `gap_status` (open/closed/excluded) to denominator/numerator/exclusion flags. BullMQ worker triggers it nightly; admin route triggers it on demand.

**Tech Stack:** TypeScript, `postgres` (tagged template SQL), BullMQ, Fastify

**Spec:** `docs/superpowers/specs/2026-03-13-measure-calculator-v2-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/services/measureCalculatorV2.ts` | **Create** | Star schema aggregation: `refreshMeasureResults()` + `getMeasureSummary()` |
| `apps/api/src/services/measureEngine.ts` | **Delete** | Old 45-file SQL engine — replaced |
| `apps/api/src/workers/measure-calculator.ts` | **Rewrite** | BullMQ worker: calls v2, simplified job type |
| `apps/api/src/workers/nightly-scheduler.ts` | **Update line 69-71** | Import from updated measure-calculator |
| `apps/api/src/routes/admin/index.ts` | **Add** | `POST /admin/refresh-measures` + extend mat-views endpoint |
| `apps/api/src/routes/measures/index.ts` | **Bugfix line 63** | Fix `measure_key` vs `measure_id` mismatch |
| `apps/api/src/routes/admin/index.ts` | **Bugfix line 396** | Fix `measure_id` → `measure_key` in analytics/overview |

---

## Chunk 1: Core Calculator Service

### Task 1: Create `measureCalculatorV2.ts`

**Files:**
- Create: `apps/api/src/services/measureCalculatorV2.ts`

- [ ] **Step 1: Create the service file**

```typescript
// =============================================================================
// Medgnosis API — Measure Calculator v2
// Aggregates fact_patient_bundle_detail → fact_measure_result.
// Replaces the old measureEngine.ts (45 broken SQL files).
// =============================================================================

import { sql } from '@medgnosis/db';

export interface RefreshResult {
  rowCount: number;
  durationMs: number;
}

export interface MeasureSummaryRow {
  measure_key: number;
  measure_code: string;
  measure_name: string;
  eligible: number;
  met: number;
  excluded: number;
  performance_rate: number | null;
}

/**
 * Refresh fact_measure_result by aggregating fact_patient_bundle_detail.
 * Runs inside a transaction so a failed INSERT rolls back the TRUNCATE.
 * SET LOCAL scopes the statement timeout to the transaction — no pool leak.
 */
export async function refreshMeasureResults(): Promise<RefreshResult> {
  const t0 = performance.now();

  const result = await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL statement_timeout = '30s'");
    await tx.unsafe('TRUNCATE phm_star.fact_measure_result');
    return tx.unsafe(`
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
  });

  const durationMs = Math.round(performance.now() - t0);
  const rowCount = result.count ?? 0;

  console.info(`[measure-calc-v2] Refreshed fact_measure_result: ${rowCount} rows in ${durationMs}ms`);
  return { rowCount, durationMs };
}

/**
 * Return per-measure performance summary from fact_measure_result.
 */
export async function getMeasureSummary(): Promise<MeasureSummaryRow[]> {
  return sql<MeasureSummaryRow[]>`
    SELECT
      dm.measure_key,
      dm.measure_code,
      dm.measure_name,
      COUNT(*) FILTER (WHERE fmr.denominator_flag)::int AS eligible,
      COUNT(*) FILTER (WHERE fmr.numerator_flag)::int AS met,
      COUNT(*) FILTER (WHERE fmr.exclusion_flag)::int AS excluded,
      ROUND(
        COUNT(*) FILTER (WHERE fmr.numerator_flag)::numeric /
        NULLIF(COUNT(*) FILTER (WHERE fmr.denominator_flag), 0) * 100, 1
      ) AS performance_rate
    FROM phm_star.fact_measure_result fmr
    JOIN phm_star.dim_measure dm ON dm.measure_key = fmr.measure_key
    GROUP BY dm.measure_key, dm.measure_code, dm.measure_name
    ORDER BY dm.measure_code
  `;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors related to `measureCalculatorV2.ts`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/measureCalculatorV2.ts
git commit -m "feat: add measure calculator v2 — star schema aggregation engine"
```

---

### Task 2: Delete `measureEngine.ts`

**Files:**
- Delete: `apps/api/src/services/measureEngine.ts`

- [ ] **Step 1: Delete the old engine**

```bash
rm apps/api/src/services/measureEngine.ts
```

- [ ] **Step 2: Verify no other files import it**

Run: `grep -r "measureEngine" apps/api/src/ --include="*.ts" -l`
Expected: Only `workers/measure-calculator.ts` (will be updated in Task 3)

- [ ] **Step 3: Do NOT commit yet** — Task 3 will fix the broken import before committing

---

## Chunk 2: Worker Update

### Task 3: Rewrite `measure-calculator.ts`

**Files:**
- Modify: `apps/api/src/workers/measure-calculator.ts`

- [ ] **Step 1: Replace the entire file contents**

```typescript
// =============================================================================
// Medgnosis API — Measure Calculator Worker (BullMQ)
// Triggers star-schema-based measure result refresh.
// =============================================================================

import { Worker, Queue } from 'bullmq';
import { connection } from './rules-engine.js';
import { refreshMeasureResults } from '../services/measureCalculatorV2.js';

export const MEASURE_QUEUE_NAME = 'medgnosis-measure-calc';

export const measureQueue = new Queue(MEASURE_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 300_000 }, // retry once after 5 min
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export interface MeasureJobData {
  triggerType: 'nightly' | 'manual';
}

async function processMeasureJob(job: { data: MeasureJobData }): Promise<void> {
  const { triggerType } = job.data;
  console.info(`[measure-calc] ${triggerType} refresh starting...`);

  const result = await refreshMeasureResults();
  console.info(
    `[measure-calc] ${triggerType} refresh complete: ${result.rowCount} rows in ${result.durationMs}ms`,
  );
}

export function startMeasureCalculatorWorker(): Worker<MeasureJobData> {
  const worker = new Worker<MeasureJobData>(
    MEASURE_QUEUE_NAME,
    processMeasureJob,
    { connection, concurrency: 1 },
  );

  worker.on('completed', (job) => {
    console.info(`[measure-calc] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[measure-calc] Job ${job?.id ?? '?'} failed:`, err.message);
  });

  return worker;
}
```

> **Note:** The spec calls for a per-worker SIGTERM handler, but `worker.ts` (lines 24-31) already handles SIGTERM/SIGINT by calling `.close()` on all workers returned from start functions. No per-worker handler is needed.

- [ ] **Step 2: Update nightly-scheduler import**

In `apps/api/src/workers/nightly-scheduler.ts`, the import on line 13 and usage on lines 69-71 reference the old `MeasureJobData` type which had `measureCode?: string`. The new type drops that field, but the nightly scheduler only ever passes `{ triggerType: 'nightly' }` (line 69-71), so no code change is needed — just verify the types align.

Run: `grep -n 'measureCode\|MeasureJobData' apps/api/src/workers/nightly-scheduler.ts`
Expected: Line 13 imports `MeasureJobData`, lines 69-71 use `triggerType: 'nightly'` only — no `measureCode` reference.

- [ ] **Step 3: Verify compilation**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit the engine swap**

```bash
git add apps/api/src/services/measureEngine.ts apps/api/src/services/measureCalculatorV2.ts apps/api/src/workers/measure-calculator.ts
git commit -m "refactor: replace broken eCQM SQL engine with star schema aggregation

Old engine loaded 45 CMS SQL files via sql.unsafe() — most were broken,
caused connection exhaustion and runaway queries (March 8 incident).

New engine: single transactional TRUNCATE + INSERT from
fact_patient_bundle_detail → fact_measure_result. Sub-second execution."
```

---

## Chunk 3: Admin Routes + Measures Bugfix

### Task 4: Add admin refresh-measures endpoint and extend mat-views

**Files:**
- Modify: `apps/api/src/routes/admin/index.ts`

- [ ] **Step 1: Add import at top of file**

After the existing `import { sql } from '@medgnosis/db';` line, add:

```typescript
import { refreshMeasureResults } from '../../services/measureCalculatorV2.js';
```

- [ ] **Step 2: Add `POST /admin/refresh-measures` endpoint**

Add before the `// ---- Analytics Overview` comment (around line 386):

```typescript
  // ---- Refresh Measure Results ----

  app.post('/refresh-measures', async (req, reply) => {
    try {
      const result = await refreshMeasureResults();

      await sql`
        INSERT INTO public.audit_log (user_id, action, resource_type, details)
        VALUES (
          ${req.user.sub}::UUID,
          'measure_refresh',
          'measure_result',
          ${JSON.stringify({ rowCount: result.rowCount, durationMs: result.durationMs })}::jsonb
        )
      `;

      return reply.send({
        success: true,
        data: {
          rows_refreshed: result.rowCount,
          duration_ms: result.durationMs,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        success: false,
        error: { message: `Measure refresh failed: ${msg}` },
      });
    }
  });
```

- [ ] **Step 3: Extend mat-views endpoint to also refresh measures**

In the existing `POST /refresh-mat-views` handler, replace this block (lines 380-383):

```typescript
    const allOk = results.every((r) => r.status === 'ok');
    return reply
      .status(allOk ? 200 : 207)
      .send({ success: allOk, data: { results } });
```

With:

```typescript
    // Also refresh measure results after mat views
    try {
      await refreshMeasureResults();
      results.push({ view: 'fact_measure_result', status: 'ok' });
    } catch (err) {
      results.push({ view: 'fact_measure_result', status: 'error', error: String(err) });
    }

    const allOk = results.every((r) => r.status === 'ok');
    return reply
      .status(allOk ? 200 : 207)
      .send({ success: allOk, data: { results } });
```

- [ ] **Step 4: Verify compilation**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/index.ts
git commit -m "feat: add POST /admin/refresh-measures + extend mat-views to refresh measures"
```

---

### Task 5: Fix measure_key vs measure_id bug in measures route

**Files:**
- Modify: `apps/api/src/routes/measures/index.ts:57-63`

- [ ] **Step 1: Fix the population stats query**

Replace lines 57-63:

```typescript
    // Get population analysis from star schema
    const populationStats = await sql`
      SELECT
        COUNT(*)::int AS total_patients,
        COUNT(*) FILTER (WHERE numerator_flag = TRUE)::int AS compliant,
        COUNT(*) FILTER (WHERE denominator_flag = TRUE)::int AS eligible
      FROM phm_star.fact_measure_result
      WHERE measure_key = ${id}::int
    `.catch((err) => {
```

With:

```typescript
    // Get population analysis from star schema
    // measure_id (from measure_definition) != measure_key (from dim_measure)
    // so we must join through dim_measure to resolve the correct key
    const populationStats = await sql`
      SELECT
        COUNT(*)::int AS total_patients,
        COUNT(*) FILTER (WHERE fmr.numerator_flag = TRUE)::int AS compliant,
        COUNT(*) FILTER (WHERE fmr.denominator_flag = TRUE)::int AS eligible
      FROM phm_star.fact_measure_result fmr
      JOIN phm_star.dim_measure dm ON dm.measure_key = fmr.measure_key
      WHERE dm.measure_id = ${id}::int
    `.catch((err) => {
```

- [ ] **Step 2: Verify compilation**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/measures/index.ts
git commit -m "fix: measures detail route — join through dim_measure to resolve measure_key

measure_id (measure_definition PK, e.g. 91) != measure_key (dim_measure PK,
e.g. 586). The old query WHERE measure_key = <measure_id> always returned
zero rows. Now joins dim_measure to resolve the correct FK."
```

---

### Task 5b: Fix measure_id bug in admin analytics/overview

**Files:**
- Modify: `apps/api/src/routes/admin/index.ts:396`

The existing analytics/overview endpoint has `COUNT(DISTINCT measure_id)` but `fact_measure_result` has no `measure_id` column — only `measure_key`. This was latent (table was empty) but will crash once populated.

- [ ] **Step 1: Fix the column reference**

Replace:

```typescript
      sql`SELECT COUNT(DISTINCT measure_id) AS count FROM phm_star.fact_measure_result`,
```

With:

```typescript
      sql`SELECT COUNT(DISTINCT measure_key) AS count FROM phm_star.fact_measure_result`,
```

- [ ] **Step 2: Commit with Task 5**

```bash
git add apps/api/src/routes/measures/index.ts apps/api/src/routes/admin/index.ts
git commit -m "fix: correct measure_key column references in measures + admin routes

measures/:id used measure_id as measure_key (always returned 0 rows).
admin/analytics/overview referenced non-existent measure_id column."
```

> **Note:** This commit covers both Task 5 and Task 5b since they are the same class of bug. Remove the separate commit from Task 5 Step 3.

---

## Chunk 4: Build + Verify

### Task 6: Full build verification

- [ ] **Step 1: Run full Turbo build**

Run: `npx turbo build`
Expected: All 4 packages build successfully

- [ ] **Step 2: Run measure refresh manually via psql to validate the query**

```bash
psql -U smudoshi -d medgnosis -c "
  BEGIN;
  SET LOCAL statement_timeout = '30s';
  TRUNCATE phm_star.fact_measure_result;
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
  FROM phm_star.fact_patient_bundle_detail d;
  COMMIT;
"
```

Expected: `INSERT 0 26967` (or close to it)

- [ ] **Step 3: Validate the data**

```bash
psql -U smudoshi -d medgnosis -c "
  SELECT COUNT(*) AS total,
    COUNT(*) FILTER (WHERE denominator_flag) AS in_denominator,
    COUNT(*) FILTER (WHERE numerator_flag) AS in_numerator,
    COUNT(*) FILTER (WHERE exclusion_flag) AS excluded
  FROM phm_star.fact_measure_result;
"
```

Expected: total ~26,967; in_denominator ~24,278 (open+closed); in_numerator ~6,697 (closed); excluded ~2,689

- [ ] **Step 4: Verify measure summary query**

```bash
psql -U smudoshi -d medgnosis -c "
  SELECT dm.measure_code, dm.measure_name,
    COUNT(*) FILTER (WHERE fmr.denominator_flag)::int AS eligible,
    COUNT(*) FILTER (WHERE fmr.numerator_flag)::int AS met,
    ROUND(COUNT(*) FILTER (WHERE fmr.numerator_flag)::numeric /
      NULLIF(COUNT(*) FILTER (WHERE fmr.denominator_flag), 0) * 100, 1) AS rate
  FROM phm_star.fact_measure_result fmr
  JOIN phm_star.dim_measure dm ON dm.measure_key = fmr.measure_key
  GROUP BY dm.measure_key, dm.measure_code, dm.measure_name
  ORDER BY dm.measure_code
  LIMIT 10;
"
```

Expected: Non-zero eligible/met counts with sensible performance rates

- [ ] **Step 5: Rebuild and restart Docker containers**

```bash
docker compose up --build -d
```

- [ ] **Step 6: Test the admin endpoint**

```bash
# Login to get a token
TOKEN=$(curl -s http://localhost:3002/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@medgnosis.app","password":"password"}' | \
  jq -r '.data.tokens.accessToken')

# Trigger measure refresh
curl -s http://localhost:3002/api/v1/admin/refresh-measures \
  -H "Authorization: Bearer $TOKEN" \
  -X POST | jq
```

Expected: `{ "success": true, "data": { "rows_refreshed": 26967, "duration_ms": <sub-1000> } }`

- [ ] **Step 7: Verify — no commit needed**

This chunk is verification-only. All code changes were committed in Chunks 1-3. If the build or endpoints fail, fix the issue and commit the fix specifically.
