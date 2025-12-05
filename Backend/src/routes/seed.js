'use strict';

const express = require('express');
const seedController = require('../controllers/seed');
const { internalSeedGuard } = require('../middleware/internalOnly');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Seed
 *     description: Internal endpoints for loading mock data into the database
 */

/**
 * @swagger
 * /_internal/seed/{entity}:
 *   post:
 *     summary: Seed mock data for a specific entity
 *     description: >
 *       Inserts or updates mock data into PostgreSQL. If the request body is an array of records,
 *       that array is used. Otherwise, this endpoint attempts to discover and load mock data from
 *       .projdefn JSON files (matching e.g. *users*.json, *organizations*.json, *resources*.json).
 *       Upserts are idempotent using primary keys (and email for users when id is absent).
 *     tags: [Seed]
 *     parameters:
 *       - in: path
 *         name: entity
 *         required: true
 *         schema:
 *           type: string
 *           enum: [users, organizations, resources]
 *         description: The entity type to seed
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *     responses:
 *       200:
 *         description: Seeding result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 inserted:
 *                   type: integer
 *                   description: Number of rows inserted
 *                 updated:
 *                   type: integer
 *                   description: Number of rows updated
 *                 skipped:
 *                   type: integer
 *                   description: Number of records skipped due to validation errors
 *                 errors:
 *                   type: array
 *                   maxItems: 10
 *                   items:
 *                     type: object
 *                     properties:
 *                       index:
 *                         type: integer
 *                       error:
 *                         type: string
 *       400:
 *         description: Invalid entity
 *       403:
 *         description: Forbidden in production without X-Seed-Token
 *       500:
 *         description: Internal error
 */
router.post('/:entity', internalSeedGuard, seedController.seedOne.bind(seedController));

/**
 * @swagger
 * /_internal/seed:
 *   post:
 *     summary: Seed all entities from .projdefn (no body required)
 *     description: >
 *       Convenience endpoint equivalent to POST /_internal/seed/all. When no request body is provided,
 *       the server discovers a `.projdefn` directory (or uses `PROJDEFN_DIR`) and loads files that match
 *       `*organizations*.json`, `*users*.json`, and `*resources*.json`. Seeding is performed in the order:
 *       organizations -> users -> resources. You may optionally provide a request body to override arrays.
 *     tags: [Seed]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               organizations:
 *                 type: array
 *                 items: { type: object }
 *               users:
 *                 type: array
 *                 items: { type: object }
 *               resources:
 *                 type: array
 *                 items: { type: object }
 *     responses:
 *       200:
 *         description: Aggregated seeding result
 *       403:
 *         description: Forbidden in production without X-Seed-Token
 *       500:
 *         description: Internal error
 */
router.post('/', internalSeedGuard, seedController.seedAll.bind(seedController));

/**
 * @swagger
 * /_internal/seed/all:
 *   post:
 *     summary: Seed all entities (organizations -> users -> resources)
 *     description: >
 *       Performs seeding for organizations, users, and resources in a deterministic order.
 *       Optional request body may include objects keyed by entity name containing arrays of records.
 *       Example:
 *       {
 *         "organizations": [...],
 *         "users": [...],
 *         "resources": [...]
 *       }
 *     tags: [Seed]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               organizations:
 *                 type: array
 *                 items: { type: object }
 *               users:
 *                 type: array
 *                 items: { type: object }
 *               resources:
 *                 type: array
 *                 items: { type: object }
 *     responses:
 *       200:
 *         description: Aggregated seeding result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 organizations:
 *                   type: object
 *                   properties:
 *                     inserted: { type: integer }
 *                     updated: { type: integer }
 *                     skipped: { type: integer }
 *                     errors:
 *                       type: array
 *                       items: { type: object }
 *                 users:
 *                   type: object
 *                   properties:
 *                     inserted: { type: integer }
 *                     updated: { type: integer }
 *                     skipped: { type: integer }
 *                     errors:
 *                       type: array
 *                       items: { type: object }
 *                 resources:
 *                   type: object
 *                   properties:
 *                     inserted: { type: integer }
 *                     updated: { type: integer }
 *                     skipped: { type: integer }
 *                     errors:
 *                       type: array
 *                       items: { type: object }
 *                 total:
 *                   type: object
 *                   properties:
 *                     inserted: { type: integer }
 *                     updated: { type: integer }
 *                     skipped: { type: integer }
 *       403:
 *         description: Forbidden in production without X-Seed-Token
 *       500:
 *         description: Internal error
 */
router.post('/all', internalSeedGuard, seedController.seedAll.bind(seedController));

/**
 * @swagger
 * /_internal/seed/verify:
 *   get:
 *     summary: Verify seeded counts for organizations, users, and resources
 *     description: Returns simple counts for each entity to confirm seeding completed successfully.
 *     tags: [Seed]
 *     responses:
 *       200:
 *         description: Counts by entity and total
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 counts:
 *                   type: object
 *                   properties:
 *                     organizations: { type: integer, example: 3 }
 *                     users: { type: integer, example: 10 }
 *                     resources: { type: integer, example: 120 }
 *                     total: { type: integer, example: 133 }
 *       403:
 *         description: Forbidden in production without X-Seed-Token
 *       500:
 *         description: Internal error
 */
router.get('/verify', internalSeedGuard, seedController.verify.bind(seedController));

module.exports = router;
