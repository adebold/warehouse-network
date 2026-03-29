const request = require('supertest');
const mongoose = require('mongoose');
const APIManagementPlatform = require('../../src/app');
const User = require('../../src/auth/models/User');

describe('API Management Platform Integration Tests', () => {
  let app;
  let server;
  let adminUser;
  let regularUser;
  let adminToken;
  let userToken;

  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/api-platform-test';
    await mongoose.connect(mongoUri);

    // Initialize application
    const platform = new APIManagementPlatform();
    await platform.initialize();
    app = platform.app;
    server = platform.server;

    // Create test users
    adminUser = new User({
      email: 'admin@test.com',
      password: 'password123',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      tier: 'enterprise',
      status: 'active',
      emailVerified: true
    });
    await adminUser.save();

    regularUser = new User({
      email: 'user@test.com',
      password: 'password123',
      firstName: 'Regular',
      lastName: 'User',
      role: 'user',
      tier: 'free',
      status: 'active',
      emailVerified: true
    });
    await regularUser.save();

    // Generate tokens
    const JWTService = require('../../src/auth/services/JWTService');
    const jwtService = new JWTService();

    adminToken = jwtService.generateAccessToken({
      id: adminUser._id,
      email: adminUser.email,
      role: adminUser.role,
      tier: adminUser.tier
    });

    userToken = jwtService.generateAccessToken({
      id: regularUser._id,
      email: regularUser.email,
      role: regularUser.role,
      tier: regularUser.tier
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await User.deleteMany({});
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();

    if (server) {
      server.close();
    }
  });

  describe('Health Check', () => {
    test('GET /health should return 200', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Authentication', () => {
    test('POST /auth/login with valid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.email).toBe('admin@test.com');
    });

    test('POST /auth/login with invalid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('POST /auth/register with valid data', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'newuser@test.com',
          password: 'password123',
          firstName: 'New',
          lastName: 'User',
          organization: 'Test Corp'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('newuser@test.com');
    });
  });

  describe('Gateway Routes', () => {
    test('GET /api/gateway/status should return gateway metrics', async () => {
      const response = await request(app)
        .get('/api/gateway/status')
        .set('Authorization', \`Bearer \${adminToken}\`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('uptime');
      expect(response.body.data).toHaveProperty('totalRequests');
    });

    test('GET /api/gateway/routes should return configured routes', async () => {
      const response = await request(app)
        .get('/api/gateway/routes')
        .set('Authorization', \`Bearer \${adminToken}\`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('routes');
      expect(response.body.data).toHaveProperty('pagination');
    });

    test('POST /api/gateway/routes should create a new route', async () => {
      const routeData = {
        path: '/test-api/v1/*',
        target: 'https://api.example.com',
        method: 'GET',
        description: 'Test API route',
        authentication: { required: false },
        rateLimit: { requests: 100, window: 60000 }
      };

      const response = await request(app)
        .post('/api/gateway/routes')
        .set('Authorization', \`Bearer \${adminToken}\`)
        .send(routeData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.route.path).toBe(routeData.path);
      expect(response.body.data.route.target).toBe(routeData.target);
    });
  });

  describe('GraphQL API', () => {
    test('POST /graphql should handle valid queries', async () => {
      const query = \`
        query {
          me {
            id
            email
            firstName
            lastName
            role
          }
        }
      \`;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', \`Bearer \${userToken}\`)
        .send({ query });

      expect(response.status).toBe(200);
      expect(response.body.data.me.email).toBe('user@test.com');
      expect(response.body.data.me.role).toBe('user');
    });

    test('POST /graphql should handle authentication errors', async () => {
      const query = \`
        query {
          me {
            id
            email
          }
        }
      \`;

      const response = await request(app)
        .post('/graphql')
        .send({ query });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('authentication');
    });
  });

  describe('Rate Limiting', () => {
    test('Should enforce rate limits for unauthenticated requests', async () => {
      const requests = [];

      // Make multiple requests quickly
      for (let i = 0; i < 15; i++) {
        requests.push(request(app).get('/health'));
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('Should allow higher limits for authenticated users', async () => {
      const requests = [];

      // Make multiple authenticated requests
      for (let i = 0; i < 50; i++) {
        requests.push(
          request(app)
            .get('/api/gateway/status')
            .set('Authorization', \`Bearer \${userToken}\`)
        );
      }

      const responses = await Promise.all(requests);
      const successfulResponses = responses.filter(r => r.status === 200);

      expect(successfulResponses.length).toBeGreaterThan(40);
    });
  });

  describe('Webhook Management', () => {
    let webhookId;

    test('POST /webhooks should create a new webhook', async () => {
      const webhookData = {
        name: 'Test Webhook',
        url: 'https://webhook.example.com/endpoint',
        events: ['api.request', 'api.error'],
        headers: [
          { name: 'X-Custom-Header', value: 'test-value' }
        ],
        retryPolicy: {
          maxAttempts: 3,
          backoffMultiplier: 2.0
        }
      };

      const response = await request(app)
        .post('/webhooks')
        .set('Authorization', \`Bearer \${userToken}\`)
        .send(webhookData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.webhook.name).toBe(webhookData.name);
      expect(response.body.data.webhook.url).toBe(webhookData.url);

      webhookId = response.body.data.webhook.id;
    });

    test('GET /webhooks should list user webhooks', async () => {
      const response = await request(app)
        .get('/webhooks')
        .set('Authorization', \`Bearer \${userToken}\`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.webhooks).toHaveLength(1);
    });

    test('POST /webhooks/:id/test should test webhook delivery', async () => {
      const response = await request(app)
        .post(\`/webhooks/\${webhookId}/test\`)
        .set('Authorization', \`Bearer \${userToken}\`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('scheduled');
    });
  });

  describe('Marketplace', () => {
    test('GET /marketplace/integrations should return public integrations', async () => {
      const response = await request(app).get('/marketplace/integrations');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('integrations');
      expect(response.body.data).toHaveProperty('pagination');
    });

    test('GET /marketplace/integrations/featured should return featured integrations', async () => {
      const response = await request(app).get('/marketplace/integrations/featured');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.integrations)).toBe(true);
    });

    test('GET /marketplace/categories should return available categories', async () => {
      const response = await request(app).get('/marketplace/categories');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.categories)).toBe(true);
    });
  });

  describe('Analytics', () => {
    test('GET /analytics/dashboard should return dashboard metrics for admin', async () => {
      const response = await request(app)
        .get('/analytics/dashboard')
        .set('Authorization', \`Bearer \${adminToken}\`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('metrics');
      expect(response.body.data.metrics).toHaveProperty('totalRequests');
      expect(response.body.data.metrics).toHaveProperty('totalUsers');
    });

    test('GET /analytics/api/:apiId/metrics should return API-specific metrics', async () => {
      const response = await request(app)
        .get('/analytics/api/test-api/metrics?timeRange=24h')
        .set('Authorization', \`Bearer \${adminToken}\`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('metrics');
    });
  });

  describe('SDK Generation', () => {
    test('POST /sdk/generate should generate SDK for valid API spec', async () => {
      const sdkRequest = {
        apiSpec: {
          info: { title: 'Test API', version: '1.0.0' },
          servers: [{ url: 'https://api.example.com' }],
          paths: {
            '/users': {
              get: {
                operationId: 'getUsers',
                summary: 'Get users',
                responses: { 200: { description: 'Success' } }
              }
            }
          }
        },
        languages: ['javascript', 'python'],
        options: {
          apiName: 'Test API',
          packageName: 'test-api-sdk'
        }
      };

      const response = await request(app)
        .post('/sdk/generate')
        .set('Authorization', \`Bearer \${userToken}\`)
        .send(sdkRequest);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('results');
      expect(response.body.data.results).toHaveProperty('javascript');
      expect(response.body.data.results).toHaveProperty('python');
    });
  });

  describe('API Versioning', () => {
    test('POST /versioning/apis/:apiId/versions should create new version', async () => {
      const versionData = {
        version: '1.1.0',
        changelog: 'Added new endpoints',
        schema: {
          paths: {
            '/users': { get: {} },
            '/posts': { get: {}, post: {} }
          }
        },
        strategy: 'semantic'
      };

      const response = await request(app)
        .post('/versioning/apis/test-api/versions')
        .set('Authorization', \`Bearer \${userToken}\`)
        .send(versionData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.version.version).toBe('1.1.0');
      expect(response.body.data.version.strategy).toBe('semantic');
    });
  });

  describe('Error Handling', () => {
    test('Should handle 404 errors gracefully', async () => {
      const response = await request(app).get('/nonexistent-endpoint');

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Resource not found');
    });

    test('Should handle validation errors properly', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          password: '123'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('Should handle unauthorized access', async () => {
      const response = await request(app)
        .get('/api/gateway/routes')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('Performance', () => {
    test('Response time should be under 500ms for simple requests', async () => {
      const start = Date.now();
      const response = await request(app).get('/health');
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(500);
    });

    test('Should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 20;
      const requests = Array(concurrentRequests).fill().map(() =>
        request(app).get('/health')
      );

      const start = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      expect(responses.every(r => r.status === 200)).toBe(true);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});