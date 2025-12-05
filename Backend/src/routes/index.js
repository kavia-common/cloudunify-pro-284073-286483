const express = require('express');
const healthController = require('../controllers/health');
const seedRouter = require('./seed');
const authRouter = require('./auth');
const usersRouter = require('./users');
const orgsRouter = require('./organizations');
const resourcesRouter = require('./resources');

const router = express.Router();
// Health endpoint

/**
 * @swagger
 * /:
 *   get:
 *     summary: Health endpoint
 *     responses:
 *       200:
 *         description: Service health check passed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: Service is healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                   example: development
 */
router.get('/', healthController.check.bind(healthController));

// Public auth route
router.use('/auth', authRouter);

// Protected/public data routes
router.use('/users', usersRouter);
router.use('/organizations', orgsRouter);
router.use('/resources', resourcesRouter);

// Internal seed routes
router.use('/_internal/seed', seedRouter);

module.exports = router;
