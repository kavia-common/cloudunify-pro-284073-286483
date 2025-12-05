'use strict';

const { verifyToken } = require('../services/auth');

/**
 * Extract Bearer token from Authorization header.
 */
function getTokenFromHeader(req) {
  const header = req.get('Authorization') || req.get('authorization');
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2) return null;
  const [scheme, token] = parts;
  if (!/^Bearer$/i.test(scheme)) {
    return null;
  }
  return token;
}

/**
 * Middleware that requires a valid JWT. Attaches decoded claims to req.auth.
 * If JWT is not configured (JWT_SECRET missing), gracefully disable auth flows
 * with a clear 503 response instead of attempting verification.
 */
// PUBLIC_INTERFACE
function requireAuth(req, res, next) {
  try {
    // If JWT is not configured, disable auth-protected routes with clear 503 response.
    if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).trim() === '') {
      return res.status(503).json({
        error: 'auth_disabled',
        message: 'Authentication is not configured. Set JWT_SECRET environment variable.',
        code: 503,
      });
    }

    const token = getTokenFromHeader(req);
    if (!token) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Missing Authorization header',
        code: 401,
      });
    }
    const decoded = verifyToken(token);
    req.auth = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Invalid or expired token',
      code: 401,
    });
  }
}

module.exports = {
  requireAuth,
};
