/**
 * HTTP server entrypoint (TypeScript).
 * - Starts the Express app on HOST:PORT (from env or defaults).
 * - Adds graceful shutdown on SIGTERM.
 */
import app from './app';

const PORT: number = parseInt(process.env.PORT || '3000', 10);
const HOST: string = process.env.HOST || '0.0.0.0';

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
