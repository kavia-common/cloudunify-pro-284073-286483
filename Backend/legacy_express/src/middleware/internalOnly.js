'use strict';

/**
 * Middleware to protect internal routes:
 * - Allows all access if NODE_ENV !== 'production'
 * - Otherwise requires header X-Seed-Token to match env SEED_ADMIN_TOKEN
 */
// PUBLIC_INTERFACE
function internalSeedGuard(req, res, next) {
  const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';

  if (!isProd) {
    return next();
  }

  const headerToken = req.get('X-Seed-Token') || req.get('x-seed-token') || '';
  const envToken = process.env.SEED_ADMIN_TOKEN || '';

  if (envToken && headerToken && headerToken === envToken) {
    return next();
  }

  return res.status(403).json({
    error: 'forbidden',
    message: 'Access denied. Provide valid X-Seed-Token header in production.',
    code: 403,
  });
}

module.exports = {
  internalSeedGuard,
};
