'use strict';

const express = require('express');
const orgsController = require('../controllers/organizations');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Organizations
 *     description: Organization endpoints
 */

/**
 * @swagger
 * /organizations:
 *   get:
 *     summary: List all organizations
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of organizations.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, format: uuid }
 *                   name: { type: string }
 *                   createdAt: { type: string, format: date-time }
 *       401:
 *         description: Authentication failed or token missing/invalid.
 *       default:
 *         description: Unexpected error.
 */
router.get('/', requireAuth, orgsController.list.bind(orgsController));

module.exports = router;
