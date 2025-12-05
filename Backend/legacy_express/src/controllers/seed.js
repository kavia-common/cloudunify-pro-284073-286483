'use strict';

const { ENTITIES, seedEntity, seedAll, getSeedCounts } = require('../services/seed');

class SeedController {
  /**
   * Seed a single entity. Body is optional (array); if missing, load from .projdefn.
   */
  // PUBLIC_INTERFACE
  async seedOne(req, res) {
    try {
      const { entity } = req.params;
      if (!ENTITIES.includes(entity)) {
        return res.status(400).json({
          error: 'invalid_entity',
          message: `Entity must be one of ${ENTITIES.join(', ')}`,
          code: 400,
        });
      }

      const body = Array.isArray(req.body) ? req.body : undefined;
      const result = await seedEntity(entity, body);
      return res.status(200).json({
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
      });
    } catch (err) {
      console.error('[seed] seedOne error:', err);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to seed data',
        code: 500,
      });
    }
  }

  /**
   * Seed all entities in the deterministic order organizations -> users -> resources.
   * Optional body: { organizations?: [], users?: [], resources?: [] }
   */
  // PUBLIC_INTERFACE
  async seedAll(req, res) {
    try {
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await seedAll(payload);

      // Log aggregate totals for visibility in CI logs
      const totals = result && result.total ? result.total : { inserted: 0, updated: 0, skipped: 0 };
      console.log(
        '[seed] totals: inserted=%d, updated=%d, skipped=%d',
        totals.inserted || 0,
        totals.updated || 0,
        totals.skipped || 0
      );

      return res.status(200).json(result);
    } catch (err) {
      console.error('[seed] seedAll error:', err);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to seed all entities',
        code: 500,
      });
    }
  }

  /**
   * Return simple counts for each entity to verify seeding worked.
   */
  // PUBLIC_INTERFACE
  async verify(req, res) {
    try {
      const counts = await getSeedCounts();
      return res.status(200).json({
        ok: true,
        counts,
      });
    } catch (err) {
      console.error('[seed] verify error:', err);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to verify seed counts',
        code: 500,
      });
    }
  }
}

module.exports = new SeedController();
