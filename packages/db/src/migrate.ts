// =============================================================================
// Medgnosis DB — Migration runner
// Reads SQL files from ./migrations/ and applies them in order.
// Tracks applied migrations in a `_migrations` table.
// =============================================================================

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

interface MigrationRecord {
  name: string;
  applied_at: string;
}

async function ensureMigrationsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const rows = await sql<MigrationRecord[]>`
    SELECT name FROM _migrations ORDER BY name
  `;
  return new Set(rows.map((r) => r.name));
}

async function getMigrationFiles(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexicographic sort ensures 001, 002, 003... order
}

async function applyMigration(name: string): Promise<void> {
  const filePath = join(MIGRATIONS_DIR, name);
  const content = await readFile(filePath, 'utf-8');

  console.info(`[migrate] Applying: ${name}`);
  const start = Date.now();

  await sql.begin(async (tx) => {
    // Execute the migration SQL
    await tx.unsafe(content);

    // Record it
    await tx.unsafe(
      `INSERT INTO _migrations (name) VALUES ($1)`,
      [name],
    );
  });

  const elapsed = Date.now() - start;
  console.info(`[migrate] Applied: ${name} (${elapsed}ms)`);
}

async function main(): Promise<void> {
  console.info('[migrate] Starting migration runner...');

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const files = await getMigrationFiles();

  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.info('[migrate] All migrations are up to date.');
  } else {
    console.info(`[migrate] ${pending.length} pending migration(s).`);
    for (const file of pending) {
      await applyMigration(file);
    }
    console.info('[migrate] All migrations applied successfully.');
  }

  await sql.end();
}

main().catch((err) => {
  console.error('[migrate] Migration failed:', err);
  process.exit(1);
});
