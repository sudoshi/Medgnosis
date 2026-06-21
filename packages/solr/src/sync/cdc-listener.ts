#!/usr/bin/env node
// =============================================================================
// CDC Listener — standalone worker that listens for PG NOTIFY events on
// the 'solr_sync' channel and pushes incremental updates to Solr.
//
// Features:
//   - PG advisory lock for singleton enforcement
//   - Redis queue drain on startup + delta reindex (last 15 min)
//   - Batched notifications (100ms debounce / 500 docs max)
//   - Periodic soft commit (5s) and hard commit (60s)
//   - Graceful shutdown on SIGINT/SIGTERM
// =============================================================================

import { sql } from '@medgnosis/db';
import RedisLib from 'ioredis';
const Redis = RedisLib.default ?? RedisLib;
import { SolrClient } from '../client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CdcEvent {
  table: string;
  id: number;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
}

// Table -> Solr core mapping
const TABLE_CORE_MAP: Record<string, string> = {
  patient: 'search',
  care_gap: 'search',
  encounter: 'clinical',
  condition_diagnosis: 'clinical',
  observation: 'clinical',
  medication_order: 'clinical',
};

// Table -> primary key column
const TABLE_PK_MAP: Record<string, string> = {
  patient: 'patient_id',
  care_gap: 'care_gap_id',
  encounter: 'encounter_id',
  condition_diagnosis: 'condition_diagnosis_id',
  observation: 'observation_id',
  medication_order: 'medication_order_id',
};

// Table -> Solr doc_type + id prefix
const TABLE_DOCTYPE_MAP: Record<string, string> = {
  patient: 'patient',
  care_gap: 'care_gap',
  encounter: 'encounter',
  condition_diagnosis: 'condition',
  observation: 'observation',
  medication_order: 'medication',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REDIS_KEY = 'solr:cdc:queue';
const REDIS_MAX_QUEUE = 50_000;
const BATCH_DEBOUNCE_MS = 100;
const BATCH_MAX_DOCS = 500;
const SOFT_COMMIT_INTERVAL_MS = 5_000;
const HARD_COMMIT_INTERVAL_MS = 60_000;
const DELTA_LOOKBACK_MINUTES = 15;
// Hard ceiling on each per-table delta id-scan. phm_edw.observation is ~1B rows
// (191GB) and has no index on updated_at, so its delta query is a full parallel
// seq scan. Without this bound, every CDC (re)start would saturate the shared
// NVMe — the same I/O that has tanked neighbouring prod. Tables that can't answer
// the window query within this budget are skipped (the real-time NOTIFY path,
// which fetches a single row by PK, still keeps them in sync going forward).
const DELTA_STATEMENT_TIMEOUT_MS = 4000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const solr = new SolrClient();
const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

let pendingBatch: CdcEvent[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let softCommitInterval: ReturnType<typeof setInterval> | null = null;
let hardCommitInterval: ReturnType<typeof setInterval> | null = null;
let shutdownRequested = false;
let listenConnection: Awaited<ReturnType<typeof sql.listen>> | null = null;

// ---------------------------------------------------------------------------
// Fetch full row from PG and map to Solr doc
// ---------------------------------------------------------------------------

async function fetchAndMapDoc(
  table: string,
  id: number,
): Promise<Record<string, unknown> | null> {
  const pk = TABLE_PK_MAP[table];
  const docType = TABLE_DOCTYPE_MAP[table];
  if (!pk || !docType) return null;

  switch (table) {
    case 'patient': {
      const rows = await sql`
        SELECT
          p.patient_id, p.mrn, p.first_name, p.last_name,
          p.date_of_birth, p.gender, p.race, p.ethnicity,
          p.primary_phone, p.email,
          a.city, a.state, a.zip AS zip_code, p.pcp_provider_id,
          rh.band AS risk_tier, rh.score AS risk_score, rh.computed_at AS risk_computed_at
        FROM phm_edw.patient p
        LEFT JOIN phm_edw.address a ON a.address_id = p.address_id
        LEFT JOIN LATERAL (
          SELECT band, score, computed_at
          FROM public.patient_risk_history prh
          WHERE prh.patient_id = p.patient_id
          ORDER BY prh.computed_at DESC LIMIT 1
        ) rh ON true
        WHERE p.patient_id = ${id}
      `;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: `patient_${r.patient_id}`,
        doc_type: 'patient',
        patient_id: r.patient_id,
        mrn: r.mrn,
        first_name: r.first_name,
        last_name: r.last_name,
        full_name: [r.first_name, r.last_name].filter(Boolean).join(' '),
        date_of_birth: r.date_of_birth ? new Date(r.date_of_birth).toISOString() : null,
        gender: r.gender,
        primary_phone: r.primary_phone,
        email: r.email,
        provider_id: r.pcp_provider_id,
        risk_tier: r.risk_tier,
        risk_score: r.risk_score,
        active_ind: 'Y',
      };
    }

    case 'care_gap': {
      const rows = await sql`
        SELECT
          cg.care_gap_id, cg.patient_id, p.first_name, p.last_name, p.mrn,
          p.pcp_provider_id, cg.measure_id, md.measure_name, md.measure_code,
          cg.gap_status, cg.gap_priority, cg.due_date,
          cg.identified_date, cg.resolved_date
        FROM phm_edw.care_gap cg
        JOIN phm_edw.patient p ON p.patient_id = cg.patient_id
        LEFT JOIN phm_edw.measure_definition md ON md.measure_id = cg.measure_id
        WHERE cg.care_gap_id = ${id}
      `;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: `care_gap_${r.care_gap_id}`,
        doc_type: 'care_gap',
        care_gap_id: r.care_gap_id,
        patient_id: r.patient_id,
        patient_name: [r.first_name, r.last_name].filter(Boolean).join(' '),
        mrn: r.mrn,
        provider_id: r.pcp_provider_id,
        measure_id: r.measure_id,
        measure_name: r.measure_name,
        measure_code: r.measure_code,
        gap_status: r.gap_status,
        gap_priority: r.gap_priority,
        due_date: r.due_date,
        identified_date: r.identified_date,
        resolved_date: r.resolved_date,
      };
    }

    case 'encounter': {
      const rows = await sql`
        SELECT
          e.encounter_id, e.patient_id, e.encounter_type,
          e.encounter_datetime,
          o.organization_name AS facility_name,
          e.disposition, e.provider_id
        FROM phm_edw.encounter e
        LEFT JOIN phm_edw.organization o ON o.org_id = e.org_id
        WHERE e.encounter_id = ${id}
      `;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: `encounter_${r.encounter_id}`,
        doc_type: 'encounter',
        encounter_id: r.encounter_id,
        patient_id: r.patient_id,
        encounter_type: r.encounter_type,
        encounter_datetime: r.encounter_datetime ? new Date(r.encounter_datetime).toISOString() : null,
        facility_name: r.facility_name,
        disposition: r.disposition,
        provider_id: r.provider_id,
      };
    }

    case 'condition_diagnosis': {
      const rows = await sql`
        SELECT
          cd.condition_diagnosis_id, cd.patient_id, cd.encounter_id,
          cd.condition_id, c.condition_name, c.condition_code AS icd10_code,
          cd.diagnosis_status, cd.onset_date
        FROM phm_edw.condition_diagnosis cd
        JOIN phm_edw.condition c ON c.condition_id = cd.condition_id
        WHERE cd.condition_diagnosis_id = ${id}
      `;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: `condition_${r.condition_diagnosis_id}`,
        doc_type: 'condition',
        patient_id: r.patient_id,
        condition_id: r.condition_id,
        condition_name: r.condition_name,
        icd10_code: r.icd10_code,
        diagnosis_status: r.diagnosis_status,
        onset_date: r.onset_date ? new Date(r.onset_date).toISOString() : null,
      };
    }

    case 'observation': {
      const rows = await sql`
        SELECT
          ob.observation_id, ob.patient_id, ob.encounter_id,
          ob.observation_code, ob.observation_desc,
          ob.value_numeric, ob.value_text, ob.units,
          ob.observation_datetime
        FROM phm_edw.observation ob
        WHERE ob.observation_id = ${id}
      `;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: `observation_${r.observation_id}`,
        doc_type: 'observation',
        observation_id: r.observation_id,
        patient_id: r.patient_id,
        encounter_id: r.encounter_id,
        observation_code: r.observation_code,
        observation_name: r.observation_desc,
        value_numeric: r.value_numeric,
        value_text: r.value_text,
        units: r.units,
        observation_datetime: r.observation_datetime,
      };
    }

    case 'medication_order': {
      const rows = await sql`
        SELECT
          mo.medication_order_id, mo.patient_id, mo.encounter_id,
          mo.medication_id, m.medication_name,
          mo.prescription_status, mo.order_datetime,
          mo.start_date, mo.end_date
        FROM phm_edw.medication_order mo
        JOIN phm_edw.medication m ON m.medication_id = mo.medication_id
        WHERE mo.medication_order_id = ${id}
      `;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: `medication_${r.medication_order_id}`,
        doc_type: 'medication',
        medication_order_id: r.medication_order_id,
        patient_id: r.patient_id,
        medication_name: r.medication_name,
        prescription_status: r.prescription_status,
      };
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Batch processing
// ---------------------------------------------------------------------------

async function processBatch(batch: CdcEvent[]): Promise<void> {
  // Check if full reindex is running — if so, push to Redis
  const [{ locked }] = await sql`
    SELECT NOT pg_try_advisory_lock(hashtext('solr_reindex')) AS locked
  `;
  if (locked) {
    console.log(`[cdc] Reindex lock held, queueing ${batch.length} events to Redis`);
    await pushToRedis(batch);
    return;
  }
  // Release the lock we just acquired for checking
  await sql`SELECT pg_advisory_unlock(hashtext('solr_reindex'))`;

  // Group by core for efficient updates
  const searchDocs: Record<string, unknown>[] = [];
  const clinicalDocs: Record<string, unknown>[] = [];
  const searchDeletes: string[] = [];
  const clinicalDeletes: string[] = [];

  for (const event of batch) {
    const core = TABLE_CORE_MAP[event.table];
    const docType = TABLE_DOCTYPE_MAP[event.table];
    const pk = TABLE_PK_MAP[event.table];
    if (!core || !docType || !pk) continue;

    if (event.op === 'DELETE') {
      const solrId = `${docType}_${event.id}`;
      if (core === 'search') {
        searchDeletes.push(solrId);
      } else {
        clinicalDeletes.push(solrId);
      }
    } else {
      const doc = await fetchAndMapDoc(event.table, event.id);
      if (doc) {
        if (core === 'search') {
          searchDocs.push(doc);
        } else {
          clinicalDocs.push(doc);
        }
      }
    }
  }

  // Push updates
  if (searchDocs.length > 0) {
    await solr.update('search', searchDocs);
  }
  if (clinicalDocs.length > 0) {
    await solr.update('clinical', clinicalDocs);
  }

  // Process deletes
  for (const id of searchDeletes) {
    await solr.deleteByQuery('search', `id:"${id}"`);
  }
  for (const id of clinicalDeletes) {
    await solr.deleteByQuery('clinical', `id:"${id}"`);
  }

  const total = searchDocs.length + clinicalDocs.length + searchDeletes.length + clinicalDeletes.length;
  if (total > 0) {
    console.log(
      `[cdc] Processed batch: ${searchDocs.length + clinicalDocs.length} upserts, ` +
      `${searchDeletes.length + clinicalDeletes.length} deletes`,
    );
  }
}

function scheduleBatch(): void {
  if (batchTimer) return;

  batchTimer = setTimeout(async () => {
    batchTimer = null;
    if (pendingBatch.length === 0) return;

    const batch = pendingBatch.splice(0, BATCH_MAX_DOCS);
    try {
      await processBatch(batch);
    } catch (err) {
      console.error('[cdc] Batch processing failed, queueing to Redis:', err);
      await pushToRedis(batch).catch((e) => console.error('[cdc] Redis queue failed:', e));
    }
  }, BATCH_DEBOUNCE_MS);
}

function enqueueEvent(event: CdcEvent): void {
  pendingBatch.push(event);

  if (pendingBatch.length >= BATCH_MAX_DOCS) {
    // Flush immediately
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    const batch = pendingBatch.splice(0, BATCH_MAX_DOCS);
    processBatch(batch).catch((err) => {
      console.error('[cdc] Immediate batch failed:', err);
      pushToRedis(batch).catch((e) => console.error('[cdc] Redis queue failed:', e));
    });
  } else {
    scheduleBatch();
  }
}

// ---------------------------------------------------------------------------
// Redis queue
// ---------------------------------------------------------------------------

async function pushToRedis(events: CdcEvent[]): Promise<void> {
  if (events.length === 0) return;

  const pipeline = redis.pipeline();
  for (const event of events) {
    pipeline.rpush(REDIS_KEY, JSON.stringify(event));
  }
  pipeline.ltrim(REDIS_KEY, -REDIS_MAX_QUEUE, -1);
  await pipeline.exec();
}

async function drainRedisQueue(): Promise<CdcEvent[]> {
  const events: CdcEvent[] = [];
  while (true) {
    const item = await redis.lpop(REDIS_KEY);
    if (!item) break;
    try {
      events.push(JSON.parse(item) as CdcEvent);
    } catch {
      console.warn('[cdc] Skipping malformed Redis queue item');
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Delta reindex — catch up on changes from last 15 minutes
// ---------------------------------------------------------------------------

async function deltaReindex(): Promise<void> {
  console.log(`[cdc] Running delta reindex (last ${DELTA_LOOKBACK_MINUTES} min)...`);

  const tables = Object.keys(TABLE_CORE_MAP);
  let totalDocs = 0;

  for (const table of tables) {
    const core = TABLE_CORE_MAP[table];
    const pk = TABLE_PK_MAP[table];
    if (!core || !pk) continue;

    // Query for recently updated rows, bounded by a statement timeout so a
    // huge unindexed table (e.g. observation) aborts fast instead of scanning
    // 191GB on the shared NVMe. A timed-out/failed table is skipped, not fatal.
    let rows: Array<{ id: number }>;
    try {
      rows = (await sql.begin(async (tx) => {
        await tx.unsafe(`SET LOCAL statement_timeout = '${DELTA_STATEMENT_TIMEOUT_MS}'`);
        return tx.unsafe(
          `SELECT ${pk} AS id FROM phm_edw.${table}
           WHERE updated_at > NOW() - INTERVAL '${DELTA_LOOKBACK_MINUTES} minutes'
           ORDER BY ${pk} ASC`,
        );
      })) as Array<{ id: number }>;
    } catch (err) {
      console.warn(`[cdc]   ${table}: delta scan skipped (${(err as Error).message})`);
      continue;
    }

    if (rows.length === 0) continue;

    const docs: Record<string, unknown>[] = [];
    for (const row of rows) {
      const doc = await fetchAndMapDoc(table, row.id as number);
      if (doc) docs.push(doc);
    }

    if (docs.length > 0) {
      await solr.update(core, docs);
      totalDocs += docs.length;
      console.log(`[cdc]   ${table}: ${docs.length} docs`);
    }
  }

  if (totalDocs > 0) {
    await solr.softCommit('search');
    await solr.softCommit('clinical');
  }

  console.log(`[cdc] Delta reindex complete: ${totalDocs} docs`);
}

// ---------------------------------------------------------------------------
// Periodic commits
// ---------------------------------------------------------------------------

function startCommitTimers(): void {
  softCommitInterval = setInterval(async () => {
    try {
      await solr.softCommit('search');
      await solr.softCommit('clinical');
    } catch (err) {
      console.error('[cdc] Soft commit failed:', err);
    }
  }, SOFT_COMMIT_INTERVAL_MS);

  hardCommitInterval = setInterval(async () => {
    try {
      await solr.commit('search');
      await solr.commit('clinical');
    } catch (err) {
      console.error('[cdc] Hard commit failed:', err);
    }
  }, HARD_COMMIT_INTERVAL_MS);
}

function stopCommitTimers(): void {
  if (softCommitInterval) {
    clearInterval(softCommitInterval);
    softCommitInterval = null;
  }
  if (hardCommitInterval) {
    clearInterval(hardCommitInterval);
    hardCommitInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(): Promise<void> {
  if (shutdownRequested) return;
  shutdownRequested = true;
  console.log('\n[cdc] Shutting down...');

  // Stop accepting new events
  stopCommitTimers();
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  // Flush remaining batch
  if (pendingBatch.length > 0) {
    console.log(`[cdc] Flushing ${pendingBatch.length} pending events...`);
    try {
      await processBatch(pendingBatch.splice(0));
    } catch (err) {
      console.error('[cdc] Final flush failed:', err);
    }
  }

  // Final commits
  try {
    await solr.commit('search');
    await solr.commit('clinical');
  } catch {
    // Ignore commit errors during shutdown
  }

  // Release advisory lock
  try {
    await sql`SELECT pg_advisory_unlock(hashtext('solr_cdc'))`;
    console.log('[cdc] Advisory lock released.');
  } catch {
    // Ignore
  }

  // Close connections
  try {
    if (listenConnection) {
      await listenConnection.unlisten();
    }
  } catch {
    // Ignore
  }

  try {
    await redis.quit();
  } catch {
    // Ignore
  }

  try {
    await sql.end();
  } catch {
    // Ignore
  }

  console.log('[cdc] Shutdown complete.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('[cdc] Starting Solr CDC listener...');

  // Acquire advisory lock for singleton
  const [{ acquired }] = await sql`
    SELECT pg_try_advisory_lock(hashtext('solr_cdc')) AS acquired
  `;
  if (!acquired) {
    console.error('[cdc] Another CDC listener is already running (advisory lock held). Exiting.');
    await sql.end();
    process.exit(1);
  }
  console.log('[cdc] Advisory lock acquired (singleton enforced).');

  // Connect to Redis
  try {
    await redis.connect();
    console.log('[cdc] Redis connected.');
  } catch (err) {
    console.warn('[cdc] Redis connection failed, running without queue:', err);
  }

  // Drain Redis queue from previous run
  try {
    const queued = await drainRedisQueue();
    if (queued.length > 0) {
      console.log(`[cdc] Draining ${queued.length} events from Redis queue...`);
      await processBatch(queued);
    }
  } catch (err) {
    console.warn('[cdc] Redis drain failed:', err);
  }

  // Delta reindex for recent changes
  try {
    await deltaReindex();
  } catch (err) {
    console.error('[cdc] Delta reindex failed:', err);
  }

  // Start LISTEN on solr_sync channel
  listenConnection = await sql.listen('solr_sync', (payload: string) => {
    if (shutdownRequested) return;

    try {
      const event = JSON.parse(payload) as CdcEvent;
      if (TABLE_CORE_MAP[event.table]) {
        enqueueEvent(event);
      }
    } catch (err) {
      console.error('[cdc] Failed to parse notification:', err);
    }
  });

  console.log('[cdc] Listening on channel "solr_sync"...');

  // Start periodic commit timers
  startCommitTimers();

  // Register shutdown handlers
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('[cdc] CDC listener is running. Press Ctrl+C to stop.');
}

main().catch(async (err) => {
  console.error('[cdc] Fatal error:', err);
  try {
    await sql.end();
  } catch {
    // Ignore
  }
  process.exit(1);
});
