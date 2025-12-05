const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CloudUnify Pro REST API',
      version: '1.0.0',
      description: 'REST API for CloudUnify Pro: unified multi-cloud resource management, cost analytics, and automation.',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Bearer authentication for protected endpoints.',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            code: { type: 'integer' },
            details: { type: 'object', nullable: true },
          },
          required: ['error', 'message', 'code'],
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Users', description: 'User endpoints' },
      { name: 'Organizations', description: 'Organization endpoints' },
      { name: 'Resources', description: 'Multi-cloud resources' },
      { name: 'Seed', description: 'Internal endpoints for loading mock data into the database' },
    ],
  },
  apis: ['./src/routes/*.js'], // Path to the API docs
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;
