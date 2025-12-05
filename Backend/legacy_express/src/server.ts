/**
 * HTTP server entrypoint (TypeScript).
 * - Starts the Express app on HOST:PORT (defaults to 0.0.0.0:3001).
 * - Conditional DB initialization: if DB is not configured, skip ensureSchema to avoid startup failures.
 * - Graceful shutdown on SIGTERM.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import app from './app';

/**
 * Normalize the port from env and default to 3001 for preview stability.
 * Treats "0" as invalid here to avoid ephemeral port binding.
 */
function normalizePort(val?: string): number {
  const p = parseInt(val || '', 10);
  if (!Number.isFinite(p) || p <= 0 || p > 65535) return 3001;
  return p;
}

/**
 * Determine if DB configuration is present:
 * - DATABASE_URL set
 * - or both PGHOST and PGDATABASE set
 * - or DB_CONNECTION_FILE points to an existing file
 */
function isDbConfigured(): boolean {
  if (process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim() !== '') return true;
  if (
    process.env.PGHOST && String(process.env.PGHOST).trim() !== '' &&
    process.env.PGDATABASE && String(process.env.PGDATABASE).trim() !== ''
  ) {
    return true;
  }
  const f = process.env.DB_CONNECTION_FILE;
  if (f) {
    try {
      return fs.existsSync(path.resolve(f));
    } catch {
      return false;
    }
  }
  return false;
}

const PORT: number = normalizePort(process.env.PORT);
const HOST: string = (process.env.HOST && String(process.env.HOST).trim() !== '') ? (process.env.HOST as string) : '0.0.0.0';

// Ensure DB schema (non-blocking startup) only when configured
if (isDbConfigured()) {
  // Use require for JS interop and to avoid module load when DB is not configured.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  try {
    const { ensureSchema } = require('./db');
    ensureSchema().catch((e: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[server] ensureSchema error:', e);
    });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[server] Skipping ensureSchema (db module failed to load):', e?.message || e);
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

// PUBLIC_INTERFACE
export default server;
