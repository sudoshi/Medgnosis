#!/usr/bin/env node
// =============================================================================
// Full Reindex Script — reindex search or clinical core from PostgreSQL
// Usage:
//   node --import tsx/esm src/sync/full-reindex.ts --core=search
//   node --import tsx/esm src/sync/full-reindex.ts --core=clinical
// =============================================================================

import { sql } from '@medgnosis/db';
import { SolrClient } from '../client.js';
import { reindexPatients } from '../indexers/patients.js';
import { reindexCareGaps } from '../indexers/care-gaps.js';
import { reindexEncounters } from '../indexers/encounters.js';
import { reindexConditions } from '../indexers/conditions.js';
import { reindexObservations } from '../indexers/observations.js';
import { reindexMedications } from '../indexers/medications.js';

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

type CoreArg = 'search' | 'clinical';

function parseCoreArg(): CoreArg {
  const arg = process.argv.find((a) => a.startsWith('--core='));
  if (!arg) {
    console.error('Usage: full-reindex.ts --core=search|clinical');
    process.exit(1);
  }
  const value = arg.split('=')[1];
  if (value !== 'search' && value !== 'clinical') {
    console.error(`Invalid core: "${value}". Must be "search" or "clinical".`);
    process.exit(1);
  }
  return value;
}

// ---------------------------------------------------------------------------
// ETL log helper
// ---------------------------------------------------------------------------

async function logEtl(
  step: string,
  source: string,
  rowsInserted: number,
  status: string,
  durationMs: number,
): Promise<void> {
  await sql`
    INSERT INTO phm_edw.etl_log (source_system, load_start_timestamp, load_end_timestamp, rows_inserted, load_status)
    VALUES (${`solr-reindex:${step}:${source}`}, NOW() - INTERVAL '1 millisecond' * ${durationMs}, NOW(), ${rowsInserted}, ${status})
  `;
  console.log(`  [etl_log] ${step} ${source}: ${rowsInserted} rows, ${status} (${durationMs}ms)`);
}

// ---------------------------------------------------------------------------
// Progress printer
// ---------------------------------------------------------------------------

function makeProgressLogger(label: string) {
  return (indexed: number, total: number) => {
    const pct = total > 0 ? ((indexed / total) * 100).toFixed(1) : '0.0';
    process.stdout.write(`\r  ${label}: ${indexed.toLocaleString()} / ${total.toLocaleString()} (${pct}%)`);
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const core = parseCoreArg();
  const solr = new SolrClient();
  const overallStart = Date.now();

  // Verify Solr is reachable
  console.log(`Pinging Solr core "${core}"...`);
  const alive = await solr.ping(core);
  if (!alive) {
    console.error(`Solr core "${core}" is not reachable. Aborting.`);
    process.exit(1);
  }
  console.log('Solr is reachable.\n');

  // Acquire advisory lock
  console.log('Acquiring PG advisory lock...');
  const [{ acquired }] = await sql`
    SELECT pg_try_advisory_lock(hashtext('solr_reindex')) AS acquired
  `;
  if (!acquired) {
    console.error('Another reindex is already running (advisory lock held). Aborting.');
    process.exit(1);
  }
  console.log('Lock acquired.\n');

  try {
    if (core === 'search') {
      await reindexSearchCore(solr);
    } else {
      await reindexClinicalCore(solr);
    }

    // Final hard commit
    console.log(`\nCommitting ${core} core...`);
    await solr.commit(core);
    console.log('Commit complete.');
  } finally {
    // Release advisory lock
    await sql`SELECT pg_advisory_unlock(hashtext('solr_reindex'))`;
    console.log('Advisory lock released.');
  }

  const totalMs = Date.now() - overallStart;
  console.log(`\nFull reindex of "${core}" completed in ${(totalMs / 1000).toFixed(1)}s`);

  await sql.end();
}

// ---------------------------------------------------------------------------
// Search core: patients + care_gaps (sequential — same core)
// ---------------------------------------------------------------------------

async function reindexSearchCore(solr: SolrClient): Promise<void> {
  console.log('Clearing search core...');
  await solr.deleteByQuery('search', '*:*');
  await solr.commit('search');
  console.log('Search core cleared.\n');

  // Patients
  console.log('Indexing patients...');
  const pStart = Date.now();
  const patientCount = await reindexPatients(solr, 5000, makeProgressLogger('patients'));
  console.log(''); // newline after \r progress
  await logEtl('reindex', 'patients', patientCount, 'success', Date.now() - pStart);

  // Care gaps
  console.log('Indexing care gaps...');
  const cgStart = Date.now();
  const careGapCount = await reindexCareGaps(solr, 5000, makeProgressLogger('care_gaps'));
  console.log('');
  await logEtl('reindex', 'care_gaps', careGapCount, 'success', Date.now() - cgStart);
}

// ---------------------------------------------------------------------------
// Clinical core: encounters + conditions + observations + medications (parallel)
// ---------------------------------------------------------------------------

async function reindexClinicalCore(solr: SolrClient): Promise<void> {
  console.log('Clearing clinical core...');
  await solr.deleteByQuery('clinical', '*:*');
  await solr.commit('clinical');
  console.log('Clinical core cleared.\n');

  console.log('Indexing encounters, conditions, observations, medications in parallel...');
  const start = Date.now();

  const [encounterCount, conditionCount, observationCount, medicationCount] = await Promise.all([
    reindexEncounters(solr, 5000, makeProgressLogger('encounters')),
    reindexConditions(solr, 5000, makeProgressLogger('conditions')),
    reindexObservations(solr, 5000, makeProgressLogger('observations')),
    reindexMedications(solr, 5000, makeProgressLogger('medications')),
  ]);

  console.log(''); // newline after progress output
  const elapsed = Date.now() - start;

  await Promise.all([
    logEtl('reindex', 'encounters', encounterCount, 'success', elapsed),
    logEtl('reindex', 'conditions', conditionCount, 'success', elapsed),
    logEtl('reindex', 'observations', observationCount, 'success', elapsed),
    logEtl('reindex', 'medications', medicationCount, 'success', elapsed),
  ]);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('Full reindex failed:', err);
  sql.end().finally(() => process.exit(1));
});
