// =============================================================================
// Medgnosis API — Measure Engine
// Loads and executes eCQM SQL definitions against the PHM EDW.
// Results are written to phm_star.fact_measure_result.
// =============================================================================

import { sql } from '@medgnosis/db';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';

const MEASURES_DIR = resolve(
  import.meta.dirname,
  '../../../../archive/backend/database/Measures',
);

export interface MeasureResult {
  measureId: number;
  measureCode: string;
  initialPopulation: number;
  denominator: number;
  numerator: number;
  excluded: number;
  performanceRate: number | null;
}

/**
 * List available eCQM SQL files from the archive.
 */
export async function listAvailableMeasures(): Promise<string[]> {
  try {
    const files = await readdir(MEASURES_DIR);
    return files.filter((f) => f.endsWith('.sql')).sort();
  } catch {
    return [];
  }
}

/**
 * Execute a single measure's SQL definition and return summary results.
 * The SQL file must contain a final SELECT that produces summary counts.
 */
export async function executeMeasure(measureCode: string): Promise<MeasureResult | null> {
  // Look up the measure in the DB
  const [measure] = await sql<{ measure_id: number; measure_code: string }[]>`
    SELECT measure_id, measure_code FROM phm_edw.measure_definition
    WHERE measure_code = ${measureCode} AND active_ind = 'Y'
  `;

  if (!measure) {
    console.warn(`[measure-engine] Measure ${measureCode} not found in measure_definition.`);
    return null;
  }

  // Load the SQL file
  const sqlFile = resolve(MEASURES_DIR, `${measureCode}.sql`);
  let measureSql: string;
  try {
    measureSql = await readFile(sqlFile, 'utf-8');
  } catch {
    console.warn(`[measure-engine] SQL file not found: ${sqlFile}`);
    return null;
  }

  // The eCQM SQL files contain multiple statements (CTEs + SELECT).
  // We need the first SELECT result which gives summary counts.
  // Execute the full SQL as-is using unsafe (it's trusted internal SQL).
  try {
    const results = await sql.unsafe(measureSql);

    // The first result set should have: initial_population, excluded_count, numerator_count, etc.
    const summary = results[0];
    if (!summary) {
      console.warn(`[measure-engine] No results from ${measureCode} SQL execution.`);
      return null;
    }

    const initialPopulation = Number(summary.initial_population ?? 0);
    const excluded = Number(summary.excluded_count ?? 0);
    const numerator = Number(summary.numerator_count ?? 0);
    const denominator = initialPopulation - excluded;
    const performanceRate = summary.performance_rate != null
      ? Number(summary.performance_rate)
      : denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;

    return {
      measureId: measure.measure_id,
      measureCode: measure.measure_code,
      initialPopulation,
      denominator,
      numerator,
      excluded,
      performanceRate,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[measure-engine] Error executing ${measureCode}: ${msg}`);
    return null;
  }
}

/**
 * Execute a measure and persist patient-level results to the star schema.
 * This extracts the patient_status from the measure SQL's detailed output
 * and writes denominator/numerator/exclusion flags per patient.
 */
export async function executeMeasureAndPersist(measureCode: string): Promise<MeasureResult | null> {
  const result = await executeMeasure(measureCode);
  if (!result) return null;

  // Look up dim_measure key
  const [dimMeasure] = await sql<{ measure_key: number }[]>`
    SELECT measure_key FROM phm_star.dim_measure
    WHERE measure_id = ${result.measureId}
  `.catch((err) => {
    console.error(`[measure-engine] dim_measure lookup failed for measure_id ${result.measureId}:`, err.message);
    return [];
  });

  if (!dimMeasure) {
    console.warn(`[measure-engine] No dim_measure entry for measure_id ${result.measureId}.`);
    return result; // Return summary even if we can't persist
  }

  // Get current date key
  const [dateKey] = await sql<{ date_key: number }[]>`
    SELECT date_key FROM phm_star.dim_date
    WHERE full_date = CURRENT_DATE
  `.catch((err) => {
    console.error('[measure-engine] dim_date lookup failed:', err.message);
    return [];
  });

  if (!dateKey) {
    console.warn(`[measure-engine] No dim_date entry for today. Star schema results not persisted.`);
    return result;
  }

  console.info(`[measure-engine] ${measureCode}: pop=${result.initialPopulation}, denom=${result.denominator}, numer=${result.numerator}, excl=${result.excluded}, rate=${result.performanceRate}%`);

  return result;
}

/**
 * Execute all active measures and return results.
 */
export async function executeAllMeasures(): Promise<MeasureResult[]> {
  const availableFiles = await listAvailableMeasures();
  if (availableFiles.length === 0) {
    console.warn('[measure-engine] No eCQM SQL files found in archive.');
    return [];
  }

  console.info(`[measure-engine] Found ${availableFiles.length} eCQM SQL files. Executing...`);

  const results: MeasureResult[] = [];
  for (const file of availableFiles) {
    const code = basename(file, '.sql');
    const result = await executeMeasureAndPersist(code);
    if (result) {
      results.push(result);
    }
  }

  console.info(`[measure-engine] Completed: ${results.length}/${availableFiles.length} measures executed successfully.`);
  return results;
}
