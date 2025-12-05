'use strict';

const { getUserById, listUsers } = require('../services/users');

class UsersController {
  /**
   * Returns the profile of the current authenticated user.
   */
  // PUBLIC_INTERFACE
  async me(req, res) {
    try {
      const sub = req.auth && req.auth.sub;
      if (!sub) {
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Missing subject in token',
          code: 401,
        });
      }
      const user = await getUserById(sub);
      if (!user) {
        return res.status(404).json({
          error: 'not_found',
          message: 'User not found',
          code: 404,
        });
      }
      return res.status(200).json(user);
    } catch (err) {

      console.error('[users] me error:', err);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch profile',
        code: 500,
      });
    }
  }

  /**
   * Returns list of users; if the current user has organizationId, list same org.
   */
  // PUBLIC_INTERFACE
  async list(req, res) {
    try {
      const orgId = req.query.orgId || (req.auth && req.auth.organizationId) || undefined;
      const users = await listUsers({ organizationId: orgId });
      return res.status(200).json(users);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[users] list error:', err);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to list users',
        code: 500,
      });
    }
  }
}

module.exports = new UsersController();
