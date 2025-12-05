'use strict';

const express = require('express');
const resourcesController = require('../controllers/resources');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Resources
 *     description: Multi-cloud resources
 */

/**
 * @swagger
 * /resources:
 *   get:
 *     summary: List all resources across clouds
 *     tags: [Resources]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: provider
 *         in: query
 *         schema: { type: string, enum: [AWS, Azure, GCP] }
 *         required: false
 *       - name: status
 *         in: query
 *         schema: { type: string }
 *         required: false
 *     responses:
 *       200:
 *         description: List of resources
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, format: uuid }
 *                   provider: { type: string, enum: [AWS, Azure, GCP] }
 *                   type: { type: string }
 *                   name: { type: string }
 *                   tags: { type: object, additionalProperties: { type: string } }
 *                   cost: { type: number }
 *                   status: { type: string }
 *                   createdAt: { type: string, format: date-time }
 *       401:
 *         description: Authentication failed or token missing/invalid.
 *       default:
 *         description: Unexpected error.
 */
router.get('/', requireAuth, resourcesController.list.bind(resourcesController));

module.exports = router;
