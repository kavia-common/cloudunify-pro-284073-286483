'use strict';

const jwt = require('jsonwebtoken');

/**
 * Utility helpers for JWT signing and verification.
 * Reads secrets and options from environment variables; do not hardcode.
 */

// PUBLIC_INTERFACE
function signToken(user) {
  /**
   * Signs a JWT for the given user.
   * Payload includes standard claims: sub, email, role.
   */
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  const expiresIn = process.env.JWT_EXPIRES_IN || '1h';
  const issuer = process.env.JWT_ISSUER || 'cloudunify-pro';
  const audience = process.env.JWT_AUDIENCE || 'cloudunify-pro-frontend';

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, secret, { expiresIn, issuer, audience });
}

// PUBLIC_INTERFACE
function verifyToken(token) {
  /**
   * Verifies a JWT and returns the decoded payload.
   */
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const issuer = process.env.JWT_ISSUER || 'cloudunify-pro';
  const audience = process.env.JWT_AUDIENCE || 'cloudunify-pro-frontend';

  return jwt.verify(token, secret, { issuer, audience });
}

module.exports = {
  signToken,
  verifyToken,
};
