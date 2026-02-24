import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Smart Timetable Scheduler API',
      version: '1.0.0',
      description: 'REST API for the Smart Timetable Management System',
    },
    servers: [
      { url: '/api', description: 'Internal API (session cookie auth)' },
      { url: '/api/v1/public', description: 'Public API (API key auth)' },
    ],
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'token' },
        apiKeyAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'API_KEY' },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Users', description: 'User management (Super_Admin)' },
      { name: 'Rooms', description: 'Room CRUD' },
      { name: 'Departments', description: 'Department CRUD' },
      { name: 'Batches', description: 'Batch CRUD' },
      { name: 'Timeslots', description: 'Timeslot CRUD' },
      { name: 'Subjects', description: 'Subject CRUD' },
      { name: 'Faculty', description: 'Faculty profile CRUD' },
      { name: 'Schedule', description: 'Scheduling job management' },
      { name: 'Timetable', description: 'Timetable view and management' },
      { name: 'Analytics', description: 'Analytics dashboard' },
      { name: 'Import', description: 'Excel bulk import' },
      { name: 'ShareLinks', description: 'Shareable public timetable links' },
      { name: 'Wizard', description: 'Guided setup wizard' },
      { name: 'SoftWeights', description: 'Soft constraint weight configuration' },
      { name: 'PublicAPI', description: 'Public read-only API (API key required)' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/auth/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
