'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Mask username/password from a database URL for safe logging.
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

// Safe file read
function readTextSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (_e) {
    // ignore
  }
  return null;
}

// Extract first DSN token starting with postgres:// or postgresql://
function extractDsn(text) {
  if (!text || typeof text !== 'string') return null;
  let norm = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\r' || ch === '\n' || ch === '\t') {
      norm += ' ';
    } else {
      norm += ch;
    }
  }
  const parts = norm.split(' ').filter(Boolean);
  for (const token of parts) {
    const t = token.trim();
    if (t.startsWith('postgresql://') || t.startsWith('postgres://')) {
      return t;
    }
  }
  return null;
}

// Try to locate Database/db_connection.txt in common repo locations.
function findDbConnectionFile() {
  const exp = process.env.DB_CONNECTION_FILE;
  if (exp && fs.existsSync(exp)) return exp;

  // Determine likely repo root by ascending
  let root = path.resolve(__dirname);
  for (let i = 0; i < 8; i += 1) {
    const parent = path.dirname(root);
    if (parent === root) break;
    root = parent;
  }

  const repoRootCandidates = [
    path.resolve(__dirname, '../../../..'),
    process.cwd(),
    root,
  ];

  for (const repoRoot of repoRootCandidates) {
    try {
      if (!fs.existsSync(repoRoot) || !fs.statSync(repoRoot).isDirectory()) continue;

      const entries = fs.readdirSync(repoRoot, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const name = e.name || '';
        if (!name.includes('cloudunify-pro')) continue;
        const lname = name.toLowerCase();
        if (lname.includes('backend') || lname.includes('frontend')) continue;
        const candidate = path.join(repoRoot, name, 'Database', 'db_connection.txt');
        if (fs.existsSync(candidate)) return candidate;
      }

      const direct = path.join(repoRoot, 'Database', 'db_connection.txt');
      if (fs.existsSync(direct)) return direct;
    } catch (_e) {
      // ignore
    }
  }

  const known = path.resolve(__dirname, '../../../..', 'cloudunify-pro-284073-286484', 'Database', 'db_connection.txt');
  if (fs.existsSync(known)) return known;

  return null;
}

// Resolve pg Pool config using env or db_connection.txt or discrete PG* env vars
function resolvePoolConfig(basePoolOpts) {
  const envUrl = process.env.DATABASE_URL;
  if (envUrl) {
    return { connectionString: envUrl, ...basePoolOpts };
  }
  const connFile = findDbConnectionFile();
  if (connFile) {
    const raw = readTextSafe(connFile);
    const dsn = extractDsn(raw || '');
    if (dsn) {
      return { connectionString: dsn, ...basePoolOpts };
    }
  }
  return {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ...basePoolOpts,
  };
}

const basePoolOpts = {
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: parseInt(process.env.PGPOOL_MAX || '10', 10),
  connectionTimeoutMillis: parseInt(process.env.PGCONNECT_TIMEOUT_MS || '5000', 10),
  idleTimeoutMillis: parseInt(process.env.PGIDLE_TIMEOUT_MS || '30000', 10),
  application_name: process.env.PGAPPNAME || 'cloudunify-pro-backend',
};

const poolCfg = resolvePoolConfig(basePoolOpts);
const pool = new Pool(poolCfg);

// Log connection source (sanitized)
try {
  if (poolCfg.connectionString) {
    // eslint-disable-next-line no-console
    console.log('[db] Using DATABASE_URL:', sanitizeDatabaseUrl(poolCfg.connectionString));
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
  // ignore
}

// Global pool error handler
pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] Unexpected idle client error:', err);
});

// PUBLIC_INTERFACE
async function query(text, params) {
  return pool.query(text, params);
}

// PUBLIC_INTERFACE
async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

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

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_hash TEXT NULL;
  `);

  await query('CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);');

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

  await query('CREATE INDEX IF NOT EXISTS idx_resources_provider ON resources(provider);');
  await query('CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);');
}

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
