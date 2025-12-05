'use strict';

/**
 * Simple PostgreSQL integration using node-postgres (pg) with a pooled connection.
 * - Reads connection configuration from environment variables (do not hardcode).
 * - Exposes a reusable query method for parameterized SQL.
 * - Provides ensureSchema() which creates required tables if they do not exist.
 */

const { Pool } = require('pg');

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const poolConfig = hasDatabaseUrl
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: parseInt(process.env.PGPOOL_MAX || '10', 10),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    }
  : {
      host: process.env.PGHOST,
      port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : undefined,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: parseInt(process.env.PGPOOL_MAX || '10', 10),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    };

const pool = new Pool(poolConfig);

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
  // Create extensions optionally (uuid not strictly required since we generate in app)
  // await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

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
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

  // Helpful index examples (optional, no-ops if re-run)
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
