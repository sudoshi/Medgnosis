// =============================================================================
// Medgnosis DB — Migration runner
// Reads SQL files from ./migrations/ and applies them in order.
// Tracks applied migrations in a `_migrations` table.
// =============================================================================

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');
const MIGRATION_LOCK_KEY = 'medgnosis:migrations';

interface MigrationRecord {
  name: string;
  checksum: string | null;
  applied_at: Date;
}

interface MigrationFile {
  name: string;
  content: string;
  checksum: string;
}

interface MigrationPlan {
  applied: Map<string, MigrationRecord>;
  legacyChecksumBaselines: MigrationFile[];
  missingFiles: MigrationRecord[];
  pending: MigrationFile[];
}

interface MigrationTableState {
  exists: boolean;
  hasChecksum: boolean;
  hasExecutionMs: boolean;
}

interface MigrationTableStateRow {
  exists: boolean;
  has_checksum: boolean;
  has_execution_ms: boolean;
}

interface RunMode {
  dryRun: boolean;
  listOnly: boolean;
}

type SqlClient = typeof sql;

function checksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function parseRunMode(argv: string[]): RunMode {
  const allowed = new Set(['--dry-run', '--list', '--help', '-h']);
  const unknown = argv.filter((arg) => !allowed.has(arg));

  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.join(', ')}`);
  }

  if (argv.includes('--help') || argv.includes('-h')) {
    console.info('Usage: npm run db:migrate -- [--dry-run|--list]');
    console.info('');
    console.info('  --dry-run  Validate metadata and print pending migrations without applying them.');
    console.info('  --list     Print applied/pending migration status without applying migrations.');
    process.exit(0);
  }

  return {
    dryRun: argv.includes('--dry-run'),
    listOnly: argv.includes('--list'),
  };
}

async function acquireMigrationLock(db: SqlClient): Promise<void> {
  console.info('[migrate] Acquiring migration lock...');
  await db.unsafe(
    `SELECT pg_advisory_lock(hashtext($1)::bigint)`,
    [MIGRATION_LOCK_KEY],
  );
}

async function releaseMigrationLock(db: SqlClient): Promise<void> {
  await db.unsafe(
    `SELECT pg_advisory_unlock(hashtext($1)::bigint)`,
    [MIGRATION_LOCK_KEY],
  );
  console.info('[migrate] Released migration lock.');
}

async function ensureMigrationsTable(db: SqlClient): Promise<void> {
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      checksum    TEXT,
      execution_ms INTEGER,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.unsafe(`
    ALTER TABLE _migrations
      ADD COLUMN IF NOT EXISTS checksum TEXT
  `);

  await db.unsafe(`
    ALTER TABLE _migrations
      ADD COLUMN IF NOT EXISTS execution_ms INTEGER
  `);
}

async function getMigrationTableState(db: SqlClient): Promise<MigrationTableState> {
  const rows = await db.unsafe<MigrationTableStateRow[]>(`
    WITH migration_table AS (
      SELECT to_regclass('_migrations') AS oid
    )
    SELECT
      oid IS NOT NULL AS exists,
      EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = oid
          AND attname = 'checksum'
          AND NOT attisdropped
      ) AS has_checksum,
      EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = oid
          AND attname = 'execution_ms'
          AND NOT attisdropped
      ) AS has_execution_ms
    FROM migration_table
  `);

  const row = rows[0];
  return {
    exists: row?.exists ?? false,
    hasChecksum: row?.has_checksum ?? false,
    hasExecutionMs: row?.has_execution_ms ?? false,
  };
}

async function getAppliedMigrations(
  db: SqlClient,
  tableState: MigrationTableState,
): Promise<Map<string, MigrationRecord>> {
  if (!tableState.exists) {
    return new Map();
  }

  const checksumProjection = tableState.hasChecksum
    ? 'checksum'
    : 'NULL::text AS checksum';

  const rows = await db.unsafe<MigrationRecord[]>(`
    SELECT name, ${checksumProjection}, applied_at
    FROM _migrations
    ORDER BY name
  `);

  return new Map(rows.map((row) => [row.name, row]));
}

async function getMigrationFiles(): Promise<MigrationFile[]> {
  const files = await readdir(MIGRATIONS_DIR);
  const names = files
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexicographic sort ensures 001, 002, 003... order

  return Promise.all(
    names.map(async (name) => {
      const content = await readFile(join(MIGRATIONS_DIR, name), 'utf-8');
      return {
        name,
        content,
        checksum: checksum(content),
      };
    }),
  );
}

function buildMigrationPlan(
  applied: Map<string, MigrationRecord>,
  files: MigrationFile[],
): MigrationPlan {
  const filesByName = new Map(files.map((file) => [file.name, file]));
  const legacyChecksumBaselines: MigrationFile[] = [];
  const missingFiles: MigrationRecord[] = [];

  for (const record of applied.values()) {
    const file = filesByName.get(record.name);

    if (!file) {
      missingFiles.push(record);
      continue;
    }

    if (record.checksum === null) {
      legacyChecksumBaselines.push(file);
      continue;
    }

    if (record.checksum !== file.checksum) {
      throw new Error(
        `Applied migration checksum mismatch for ${record.name}. ` +
          'Migrations are immutable after they have been applied; create a new migration instead.',
      );
    }
  }

  return {
    applied,
    legacyChecksumBaselines,
    missingFiles,
    pending: files.filter((file) => !applied.has(file.name)),
  };
}

async function recordLegacyChecksumBaselines(
  db: SqlClient,
  baselines: MigrationFile[],
): Promise<void> {
  for (const file of baselines) {
    await db.unsafe(
      `
        UPDATE _migrations
        SET checksum = $1
        WHERE name = $2
          AND checksum IS NULL
      `,
      [file.checksum, file.name],
    );
    console.info(`[migrate] Recorded checksum baseline for legacy migration: ${file.name}`);
  }
}

function printMigrationPlan(plan: MigrationPlan): void {
  console.info(`[migrate] Applied migrations: ${plan.applied.size}`);

  if (plan.missingFiles.length > 0) {
    console.warn(`[migrate] ${plan.missingFiles.length} applied migration(s) are no longer present on disk:`);
    for (const record of plan.missingFiles) {
      console.warn(`  - ${record.name}`);
    }
  }

  if (plan.legacyChecksumBaselines.length > 0) {
    console.info(
      `[migrate] ${plan.legacyChecksumBaselines.length} legacy migration checksum baseline(s) need recording.`,
    );
  }

  if (plan.pending.length === 0) {
    console.info('[migrate] Pending migrations: none');
    return;
  }

  console.info(`[migrate] Pending migrations (${plan.pending.length}):`);
  for (const file of plan.pending) {
    console.info(`  - ${file.name}`);
  }
}

function printTableState(tableState: MigrationTableState, mode: RunMode): void {
  if (!mode.listOnly && !mode.dryRun) {
    return;
  }

  if (!tableState.exists) {
    console.info('[migrate] Migration table does not exist yet.');
    return;
  }

  if (!tableState.hasChecksum) {
    console.info('[migrate] Migration table has no checksum column yet; next apply run will add it.');
  }

  if (!tableState.hasExecutionMs) {
    console.info('[migrate] Migration table has no execution_ms column yet; next apply run will add it.');
  }
}

async function applyMigration(db: SqlClient, migration: MigrationFile): Promise<void> {
  console.info(`[migrate] Applying: ${migration.name}`);
  const start = Date.now();

  if (containsTransactionControl(migration.content)) {
    await db.unsafe(migration.content);
    await db.unsafe(
      `
        INSERT INTO _migrations (name, checksum, execution_ms)
        VALUES ($1, $2, $3)
      `,
      [migration.name, migration.checksum, Date.now() - start],
    );
    const elapsed = Date.now() - start;
    console.info(`[migrate] Applied: ${migration.name} (${elapsed}ms)`);
    return;
  }

  await db.unsafe('BEGIN');
  try {
    await db.unsafe(migration.content);

    await db.unsafe(
      `
        INSERT INTO _migrations (name, checksum, execution_ms)
        VALUES ($1, $2, $3)
      `,
      [migration.name, migration.checksum, Date.now() - start],
    );
    await db.unsafe('COMMIT');
  } catch (err) {
    await db.unsafe('ROLLBACK');
    throw err;
  }

  const elapsed = Date.now() - start;
  console.info(`[migrate] Applied: ${migration.name} (${elapsed}ms)`);
}

function containsTransactionControl(content: string): boolean {
  return /^\s*(BEGIN|COMMIT|ROLLBACK)\b/im.test(content);
}

async function main(): Promise<void> {
  const mode = parseRunMode(process.argv.slice(2));
  console.info('[migrate] Starting migration runner...');

  const db = await sql.reserve();
  let lockAcquired = false;

  try {
    await acquireMigrationLock(db);
    lockAcquired = true;

    if (!mode.listOnly && !mode.dryRun) {
      await ensureMigrationsTable(db);
    }

    const tableState = await getMigrationTableState(db);
    printTableState(tableState, mode);

    const applied = await getAppliedMigrations(db, tableState);
    const files = await getMigrationFiles();
    const plan = buildMigrationPlan(applied, files);

    printMigrationPlan(plan);

    if (mode.listOnly || mode.dryRun) {
      console.info('[migrate] No migrations applied.');
      return;
    }

    await recordLegacyChecksumBaselines(db, plan.legacyChecksumBaselines);

    if (plan.pending.length === 0) {
      console.info('[migrate] All migrations are up to date.');
    } else {
      for (const migration of plan.pending) {
        await applyMigration(db, migration);
      }
      console.info('[migrate] All migrations applied successfully.');
    }
  } finally {
    if (lockAcquired) {
      await releaseMigrationLock(db);
    }
    db.release();
    await sql.end();
  }
}

main().catch((err) => {
  console.error('[migrate] Migration failed:', err);
  process.exit(1);
});
