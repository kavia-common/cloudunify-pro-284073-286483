class HealthService {
    /**
     * PUBLIC_INTERFACE
     * Returns a simple health object with status, message, current timestamp,
     * and the current NODE_ENV value (defaults to development).
     */
    getStatus() {
      return {
        status: 'ok',
        message: 'Service is healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      };
    }
  }
  
module.exports = new HealthService();
