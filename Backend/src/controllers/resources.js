'use strict';

const { listResources } = require('../services/resources');

class ResourcesController {
  // PUBLIC_INTERFACE
  async list(req, res) {
    try {
      const filters = {
        provider: req.query.provider,
        status: req.query.status,
      };
      const resources = await listResources(filters);
      return res.status(200).json(resources);
    } catch (err) {

      console.error('[resources] list error:', err);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to list resources',
        code: 500,
      });
    }
  }
}

module.exports = new ResourcesController();
