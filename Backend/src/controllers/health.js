const healthService = require('../services/health');

class HealthController {
  /**
   * PUBLIC_INTERFACE
   * Health check endpoint.
   * Returns service health status, environment, and timestamp.
   */
  check(req, res) {
    const healthStatus = healthService.getStatus();
    return res.status(200).json(healthStatus);
  }
}

module.exports = new HealthController();
