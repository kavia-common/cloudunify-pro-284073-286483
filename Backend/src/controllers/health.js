const healthService = require('../services/health');

class HealthController {
  /**
   * Health check endpoint.
   * Returns service health status, environment, and timestamp.
   */
  // PUBLIC_INTERFACE
  check(req, res) {
    const healthStatus = healthService.getStatus();
    return res.status(200).json(healthStatus);
  }
}

module.exports = new HealthController();
