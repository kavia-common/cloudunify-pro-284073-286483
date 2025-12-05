'use strict';

const bcrypt = require('bcryptjs');
const { signToken } = require('../services/auth');
const { getUserByEmail, mapUserRow } = require('../services/users');

class AuthController {
  /**
   * Handle user login: verify email and password, return { token, user }.
   * Body:
   *  - email: string (required)
   *  - password: string (required)
   */
  // PUBLIC_INTERFACE
  async login(req, res) {
    try {
      const { email, password } = req.body || {};
      if (typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({
          error: 'validation_error',
          message: 'email and password are required',
          code: 400,
        });
      }

      // If JWT is not configured, do not proceed with login to avoid issuing tokens without a secret
      if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).trim() === '') {
        return res.status(503).json({
          error: 'auth_disabled',
          message: 'Login is disabled because JWT_SECRET is not configured.',
          code: 503,
        });
      }

      const dbUser = await getUserByEmail(email.toLowerCase());
      if (!dbUser || !dbUser.password_hash) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Invalid email or password',
          code: 401,
        });
      }

      const ok = await bcrypt.compare(password, dbUser.password_hash);
      if (!ok) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Invalid email or password',
          code: 401,
        });
      }

      const user = mapUserRow(dbUser);
      const token = signToken(user);
      return res.status(200).json({ token, user });
    } catch (err) {

      console.error('[auth] login error:', err);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Login failed',
        code: 500,
      });
    }
  }
}

module.exports = new AuthController();
