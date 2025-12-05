'use strict';

/**
 * Simple PostgreSQL integration using node-postgres (pg) with a pooled connection.
 * - Reads connection configuration from environment variables (prefer DATABASE_URL).
 * - Exposes a reusable query method for parameterized SQL.
 * - Provides ensureSchema() which creates required tables if they do not exist.
 * - Adds startup logging (sanitized connection string) and pool error handling.
 */

const { Pool } = require('pg');

/**
 * Mask username/password from a database URL for safe logging.
 * @param {string} raw
 * @returns {string}
 */
function sanitizeDatabaseUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.username) u.username = '***';
    if (u.password) u.password = '***';
    return u.toString();
  } catch (_e) {
    return 'postgresql://***:***@***:***/***';
  }
}

const hasDatabaseUrl = !!process.env.DATABASE_URL;

const basePoolOpts = {
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: parseInt(process.env.PGPOOL_MAX || '10', 10),
  connectionTimeoutMillis: parseInt(process.env.PGCONNECT_TIMEOUT_MS || '5000', 10),
  idleTimeoutMillis: parseInt(process.env.PGIDLE_TIMEOUT_MS || '30000', 10),
  application_name: process.env.PGAPPNAME || 'cloudunify-pro-backend',
};

const poolConfig = hasDatabaseUrl
  ? {
      connectionString: process.env.DATABASE_URL,
      ...basePoolOpts,
    }
  : {
    // Fallback discrete variables if DATABASE_URL is not set
      host: process.env.PGHOST,
      port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : undefined,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ...basePoolOpts,
    };

const pool = new Pool(poolConfig);

// Log which connection mode we are using (sanitized)
try {
  if (hasDatabaseUrl) {
    // eslint-disable-next-line no-console
    console.log('[db] Using DATABASE_URL:', sanitizeDatabaseUrl(process.env.DATABASE_URL));
  } else {
    // eslint-disable-next-line no-console
    console.log(
      '[db] Using discrete PG* env vars (PGHOST=%s, PGPORT=%s, PGDATABASE=%s)',
      process.env.PGHOST || '<unset>',
      process.env.PGPORT || '<unset>',
      process.env.PGDATABASE || '<unset>'
    );
  }
} catch (_e) {
  // ignore logging issues
}

// Global pool error handler
pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] Unexpected idle client error:', err);
});

/**
 * Execute a parameterized SQL query using the shared pool.
 * @param {string} text SQL text
 * @param {any[]} [params] parameter array
 * @returns {Promise<import('pg').QueryResult>}
 */
// PUBLIC_INTERFACE
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Ensure required tables and indices exist.
 * This is safe to call multiple times (CREATE IF NOT EXISTS).
 */
// PUBLIC_INTERFACE
async function ensureSchema() {
  // Organizations table
  await query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Users table
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      organization_id UUID NULL REFERENCES organizations(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      password_hash TEXT NULL
    );
  `);

  // Ensure unique index on email (if not created by constraint above)
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_email_key'
      ) THEN
        CREATE UNIQUE INDEX users_email_key ON users(email);
      END IF;
    END
    $$;
  `);

  // Add password_hash if missing (for existing databases)
  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_hash TEXT NULL;
  `);

  // Helpful index for frequent organization-based queries
  await query('CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);');

  // Resources table
  await query(`
    CREATE TABLE IF NOT EXISTS resources (
      id UUID PRIMARY KEY,
      provider TEXT NOT NULL CHECK (provider IN ('AWS', 'Azure', 'GCP')),
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '{}'::jsonb,
      cost NUMERIC NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Helpful indexes for resources (no-ops if re-run)
  await query('CREATE INDEX IF NOT EXISTS idx_resources_provider ON resources(provider);');
  await query('CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);');
}

/**
 * Graceful shutdown helper to close the pool.
 */
// PUBLIC_INTERFACE
async function closePool() {
  await pool.end();
}

module.exports = {
  query,
  ensureSchema,
  closePool,
  pool,
};
