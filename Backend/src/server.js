'use strict';

/**
 * HTTP server entrypoint (JavaScript).
 * - Normalizes HOST/PORT and starts Express on 0.0.0.0:3001 by default.
 * - Avoids database initialization when DB is not configured to prevent startup failures in preview.
 * - Graceful shutdown on SIGTERM.
 */
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const app = require('./app');

/**
 * Normalize the port from env and default to 3001.
 * - Rejects invalid, NaN, or out-of-range ports.
 * - Treats "0" as invalid for preview environments (falls back to 3001).
 */
function normalizePort(val) {
  const p = parseInt(val || '', 10);
  if (!Number.isFinite(p) || p <= 0 || p > 65535) return 3001;
  return p;
}

/**
 * Detect whether database configuration is present.
 * - True if DATABASE_URL is set
 * - True if both PGHOST and PGDATABASE are set
 * - True if DB_CONNECTION_FILE points to an existing file
 */
function isDbConfigured() {
  if (process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim() !== '') return true;
  if ((process.env.PGHOST && process.env.PGDATABASE) && (String(process.env.PGHOST).trim() !== '' && String(process.env.PGDATABASE).trim() !== '')) return true;
  const f = process.env.DB_CONNECTION_FILE;
  if (f) {
    try {
      return fs.existsSync(path.resolve(f));
    } catch (_e) {
      return false;
    }
  }
  return false;
}

const PORT = normalizePort(process.env.PORT);
const HOST = (process.env.HOST && String(process.env.HOST).trim() !== '') ? process.env.HOST : '0.0.0.0';

// Initialize DB schema only if DB is configured; otherwise skip to keep health endpoints available
if (isDbConfigured()) {
  try {
    // Lazy-load DB module to avoid creating a Pool when DB is not configured
    const { ensureSchema } = require('./db');
    // Non-blocking, errors are logged but do not prevent startup
    ensureSchema().catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[server] ensureSchema error:', e);
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[server] Skipping ensureSchema (db module failed to load):', e && e.message ? e.message : e);
  }
} else {
  // eslint-disable-next-line no-console
  console.log('[server] DATABASE_URL/PG* not set and no DB_CONNECTION_FILE; starting without DB initialization.');
}

const server = app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running at http://${HOST}:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  // eslint-disable-next-line no-console
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    // eslint-disable-next-line no-console
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = server;
