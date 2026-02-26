// =============================================================================
// Medgnosis DB — PostgreSQL client
// Uses the `postgres` library (tagged template literals) — same pattern as MindLog.
// =============================================================================

import postgres from 'postgres';

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Main database connection. Uses DATABASE_URL from environment.
 * The `postgres` library returns a tagged template function that
 * provides safe parameterized queries:
 *
 *   const rows = await sql`SELECT * FROM patients WHERE id = ${id}`;
 */
export const sql = postgres(required('DATABASE_URL'), {
  // Connection pool settings
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,

  // Transform column names from snake_case to camelCase? No — we keep snake_case
  // to match the database schema and shared types exactly.
  transform: {
    undefined: null,
  },

  // SSL for production
  ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,

  // Debug logging in development
  debug: process.env['NODE_ENV'] === 'development'
    ? (_connection, query, params) => {
        console.debug(`[sql] ${query.substring(0, 200)}`, params?.length ? `(${params.length} params)` : '');
      }
    : undefined,
});

export default sql;
