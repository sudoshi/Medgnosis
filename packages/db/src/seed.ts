// =============================================================================
// Medgnosis DB — Seed script
// Populates the database with initial reference data.
// For demo data, use seed-demo.ts instead.
// =============================================================================

import { sql } from './client.js';

async function main(): Promise<void> {
  console.info('[seed] Seeding reference data...');

  // Ensure test user exists for development
  await sql`
    INSERT INTO phm_edw.organization (organization_id, organization_name, organization_type, active_ind, created_date, updated_date)
    VALUES (1, 'Medgnosis Health System', 'Health System', 'Y', NOW(), NOW())
    ON CONFLICT DO NOTHING
  `;

  console.info('[seed] Reference data seeded successfully.');
  await sql.end();
}

main().catch((err) => {
  console.error('[seed] Seeding failed:', err);
  process.exit(1);
});
