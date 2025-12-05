'use strict';

const express = require('express');
const authController = require('../controllers/auth');

const router = express.Router();

// Basic rate limiting for login route
let rateLimit;
try {
  // express-rate-limit v6 default export; v7 named export compatibility
  // This approach works across versions since require returns a function in CJS too

  rateLimit = require('express-rate-limit');
  if (rateLimit && rateLimit.rateLimit) {
    rateLimit = rateLimit.rateLimit;
  }
} catch (e) {
  rateLimit = null;
}

const windowMs = parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 minute
const maxReq = parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10); // 10 per min
const loginLimiter = rateLimit
  ? rateLimit({
      windowMs,
      max: maxReq,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: 'too_many_requests',
        message: 'Too many login attempts, please try again later.',
        code: 429,
      },
    })
  : (req, _res, next) => next();

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication endpoints
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Authenticate user and return JWT token.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *             required: [email, password]
 *     responses:
 *       200:
 *         description: Successful login.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string, format: uuid }
 *                     email: { type: string, format: email }
 *                     name: { type: string }
 *                     role: { type: string }
 *                     organizationId: { type: string, format: uuid, nullable: true }
 *                     createdAt: { type: string, format: date-time, nullable: true }
 *               required: [token, user]
 *       401:
 *         description: Authentication failed or token missing/invalid.
 *       default:
 *         description: Unexpected error.
 */
router.post('/login', loginLimiter, authController.login.bind(authController));

module.exports = router;
