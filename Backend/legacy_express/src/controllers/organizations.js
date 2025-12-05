'use strict';

const { listOrganizations } = require('../services/organizations');

class OrganizationsController {
  // PUBLIC_INTERFACE
  async list(req, res) {
    try {
      const organizations = await listOrganizations();
      return res.status(200).json(organizations);
    } catch (err) {

      console.error('[orgs] list error:', err);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to list organizations',
        code: 500,
      });
    }
  }
}

module.exports = new OrganizationsController();
