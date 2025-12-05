'use strict';

const express = require('express');
const usersController = require('../controllers/users');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Users
 *     description: User endpoints
 */

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get current authenticated user profile.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 email: { type: string, format: email }
 *                 name: { type: string }
 *                 role: { type: string }
 *                 organizationId: { type: string, format: uuid, nullable: true }
 *                 createdAt: { type: string, format: date-time, nullable: true }
 *       401:
 *         description: Authentication failed or token missing/invalid.
 *       default:
 *         description: Unexpected error.
 */
router.get('/me', requireAuth, usersController.me.bind(usersController));

/**
 * @swagger
 * /users:
 *   get:
 *     summary: List all users in the organization
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of users.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string }
 *                   email: { type: string, format: email }
 *                   name: { type: string }
 *                   role: { type: string }
 *                   organizationId: { type: string, format: uuid, nullable: true }
 *                   createdAt: { type: string, format: date-time, nullable: true }
 *       401:
 *         description: Authentication failed or token missing/invalid.
 *       default:
 *         description: Unexpected error.
 */
router.get('/', requireAuth, usersController.list.bind(usersController));

module.exports = router;
