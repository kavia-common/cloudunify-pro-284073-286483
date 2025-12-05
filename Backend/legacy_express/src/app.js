'use strict';

const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const routes = require('./routes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');

/**
 * Initialize express app with env-driven CORS, security headers, and HTTP logging.
 * - Helmet security headers
 * - pino-http logging with LOG_LEVEL/REACT_APP_LOG_LEVEL
 * - Dynamic Swagger docs at /docs and /openapi.json with runtime server URL
 * - Routes mounted from ./routes
 * - Centralized 404 and error handler
 */

/* Parse CORS origins from environment variable CORS_ORIGIN */
function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGIN || '*';
  if (raw.trim() === '*') return '*';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const app = express();

/**
 * Security headers
 * In PREVIEW_MODE we allow embedding inside Kavia preview iframes by:
 * - Disabling X-Frame-Options (frameguard)
 * - Setting CSP frame-ancestors to 'self' and https://*.cloud.kavia.ai
 * - Relaxing COEP/COOP to avoid issues in embedded contexts
 */
const previewMode = (process.env.PREVIEW_MODE || '').toLowerCase() === 'true';

if (previewMode) {
  app.use(
    helmet({
      // Remove X-Frame-Options header so CSP frame-ancestors controls embedding
      frameguard: false,
      // Only set frame-ancestors to allow Kavia preview domains to embed the app
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'frame-ancestors': ['\'self\'', 'https://*.cloud.kavia.ai'],
        },
      },
      // These can interfere with embedded contexts; relax in preview only
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    })
  );
} else {
  app.use(helmet());
}

// HTTP logging
app.use(
  pinoHttp({
    level: process.env.REACT_APP_LOG_LEVEL || process.env.LOG_LEVEL || 'info',
    customProps: (_req, _res) => ({
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

// Trust proxy can be toggled via env (defaults to true for modern deployments)
app.set('trust proxy', (process.env.REACT_APP_TRUST_PROXY || 'true') === 'true');

// Dynamic Swagger UI: inject server URL based on incoming request
app.use('/docs', swaggerUi.serve, (req, res, next) => {
  const host = req.get('host'); // may or may not include port
  let protocol = req.protocol;  // http or https

  const actualPort = req.socket.localPort;
  const hasPort = host.includes(':');

  const needsPort =
    !hasPort &&
    ((protocol === 'http' && actualPort !== 80) ||
      (protocol === 'https' && actualPort !== 443));
  const fullHost = needsPort ? `${host}:${actualPort}` : host;
  protocol = req.secure ? 'https' : protocol;

  const dynamicSpec = {
    ...swaggerSpec,
    servers: [
      {
        url: `${protocol}://${fullHost}`,
      },
    ],
  };
  swaggerUi.setup(dynamicSpec)(req, res, next);
});

// Expose raw OpenAPI JSON (useful for tooling and CI)
app.get('/openapi.json', (req, res) => {
  const host = req.get('host') || '';
  let protocol = req.protocol;

  const actualPort = req.socket.localPort;
  const hasPort = host.includes(':');

  const needsPort =
    !hasPort &&
    ((protocol === 'http' && actualPort !== 80) ||
      (protocol === 'https' && actualPort !== 443));
  const fullHost = needsPort ? `${host}:${actualPort}` : host;
  protocol = req.secure ? 'https' : protocol;

  const dynamicSpec = {
    ...swaggerSpec,
    servers: [
      {
        url: `${protocol}://${fullHost}`,
      },
    ],
  };
  res.json(dynamicSpec);
});

// Parse JSON request body
app.use(express.json());

// Mount routes
app.use('/', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Route not found',
    code: 404,
  });
});

/* Error handling middleware */
app.use((err, req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err && err.stack ? err.stack : err);
  res.status(500).json({
    error: 'internal_error',
    message: 'Internal Server Error',
    code: 500,
  });
});

module.exports = app;
