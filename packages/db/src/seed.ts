// =============================================================================
// Medgnosis DB — Seed script
// Populates the database with initial reference data.
// For demo data, use seed-demo.ts instead.
// =============================================================================

import { sql } from './client.js';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

async function main(): Promise<void> {
  console.info('[seed] Seeding reference data...');

  // Ensure default organization exists
  await sql`
    INSERT INTO phm_edw.organization (organization_name, organization_type, active_ind, created_date, updated_date)
    SELECT 'Medgnosis Health System', 'Health System', 'Y', NOW(), NOW()
    WHERE NOT EXISTS (
      SELECT 1
      FROM phm_edw.organization
      WHERE organization_name = 'Medgnosis Health System'
    )
  `;

  // Ensure admin user exists with proper bcrypt hash
  const passwordHash = await bcrypt.hash('password', BCRYPT_ROUNDS);
  await sql`
    INSERT INTO app_users (email, password_hash, first_name, last_name, role, mfa_enabled)
    VALUES ('admin@medgnosis.app', ${passwordHash}, 'System', 'Admin', 'admin', FALSE)
    ON CONFLICT (email) DO UPDATE SET password_hash = ${passwordHash}
  `;

  console.info('[seed] Reference data seeded successfully.');
  await sql.end();
}

main().catch((err) => {
  console.error('[seed] Seeding failed:', err);
  process.exit(1);
});
