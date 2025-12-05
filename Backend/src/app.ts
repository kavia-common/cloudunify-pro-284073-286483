 /**
 * Express application initialization (TypeScript).
 * - Configures CORS and JSON parsing.
 * - Adds helmet security headers and pino-http logging.
 * - Serves dynamic Swagger UI at /docs and OpenAPI JSON at /openapi.json with runtime server URL resolution.
 * - Mounts API routes from ./routes.
 * - Centralized error handler.
 */
import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
// Swagger spec remains as a JS module at project root; interop enabled via tsconfig
import swaggerSpec from '../swagger';
// Routes are kept in JS; tsc (allowJs) will copy them into dist for production
import routes from './routes';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pinoHttp = require('pino-http');

function parseCorsOrigins(): string | string[] {
  const raw = process.env.CORS_ORIGIN || '*';
  if (raw.trim() === '*') return '*';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const app: Application = express();

// Security headers
app.use(helmet());

// HTTP logging
app.use(
  pinoHttp({
    level: (process.env.REACT_APP_LOG_LEVEL || process.env.LOG_LEVEL || 'info') as any,
    customProps: (_req: Request, _res: Response) => ({
      app: 'cloudunify-pro-backend',
      env: process.env.NODE_ENV || 'development',
    }),
  })
);

// Configure CORS
app.use(
  cors({
    origin: parseCorsOrigins(),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.set('trust proxy', (process.env.REACT_APP_TRUST_PROXY || 'true') === 'true');

// Dynamic Swagger UI that sets server URL based on request
app.use('/docs', swaggerUi.serve, (req: Request, res: Response, next: NextFunction) => {
  const host = req.get('host') || '';
  let protocol = req.protocol;

  const actualPort = (req.socket as any)?.localPort as number | undefined;
  const hasPort = host.includes(':');

  const needsPort =
    !hasPort &&
    !!actualPort &&
    ((protocol === 'http' && actualPort !== 80) || (protocol === 'https' && actualPort !== 443));

  const fullHost = needsPort ? `${host}:${actualPort}` : host;
  protocol = (req as any).secure ? 'https' : protocol;

  const dynamicSpec: any = {
    ...(swaggerSpec as any),
    servers: [
      {
        url: `${protocol}://${fullHost}`,
      },
    ],
  };

  return (swaggerUi.setup(dynamicSpec) as unknown as express.RequestHandler)(req, res, next);
});

// Expose raw OpenAPI JSON (useful for tooling and CI)
app.get('/openapi.json', (req: Request, res: Response) => {
  const host = req.get('host') || '';
  let protocol = req.protocol;
  const actualPort = (req.socket as any)?.localPort as number | undefined;
  const hasPort = host.includes(':');
  const needsPort =
    !hasPort &&
    !!actualPort &&
    ((protocol === 'http' && actualPort !== 80) || (protocol === 'https' && actualPort !== 443));
  const fullHost = needsPort ? `${host}:${actualPort}` : host;
  protocol = (req as any).secure ? 'https' : protocol;

  const dynamicSpec: any = {
    ...(swaggerSpec as any),
    servers: [{ url: `${protocol}://${fullHost}` }],
  };
  res.json(dynamicSpec);
});

// Parse JSON request body
app.use(express.json());

// Mount routes
app.use('/', routes);

// Error handling middleware
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err && (err as any).stack ? (err as any).stack : err);
  res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
  });
});

// PUBLIC_INTERFACE
export default app;
