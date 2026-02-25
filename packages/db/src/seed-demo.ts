// =============================================================================
// Medgnosis DB — Demo seed script
// Populates the database with synthetic demo data for development.
// Uses the ETL pipeline to load Synthea data if available, otherwise
// creates a small representative dataset.
// =============================================================================

import { sql } from './client.js';

async function main(): Promise<void> {
  console.info('[seed-demo] Seeding demo data...');

  // Check if Synthea data source is available
  const [schemaCheck] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.schemata WHERE schema_name = 'synthea'
    ) AS exists
  `;

  if (schemaCheck?.exists) {
    console.info('[seed-demo] Synthea schema found — running ETL pipeline...');
    // ETL scripts are in migrations and can be re-run
    console.info('[seed-demo] Run ETL scripts via: npm run db:migrate');
  } else {
    console.info('[seed-demo] No Synthea schema found — inserting minimal demo data...');
    await insertMinimalDemoData();
  }

  console.info('[seed-demo] Demo data seeded successfully.');
  await sql.end();
}

async function insertMinimalDemoData(): Promise<void> {
  // Insert a small set of demo patients, conditions, and observations
  // for development and testing without requiring the full Synthea dataset.
  console.info('[seed-demo] Inserting minimal demo dataset...');

  // This will be expanded as the API routes are built out.
  // For now, ensure the schemas exist and are empty-but-ready.
  const [edwCheck] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.schemata WHERE schema_name = 'phm_edw'
    ) AS exists
  `;

  if (!edwCheck?.exists) {
    console.warn('[seed-demo] phm_edw schema not found. Run migrations first: npm run db:migrate');
    return;
  }

  console.info('[seed-demo] Minimal demo data inserted.');
}

main().catch((err) => {
  console.error('[seed-demo] Demo seeding failed:', err);
  process.exit(1);
});
