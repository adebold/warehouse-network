import request from 'supertest';
import app from '@/index';
import { setupTestDatabase, setupTestRedis, cleanupTestDatabase, cleanupTestRedis } from './setup';

describe('Marketing Platform API Integration Tests', () => {
  let authToken: string;
  let refreshToken: string;
  let testUser: any;
  let testOrganization: any;
  let testCampaign: any;

  beforeAll(async () => {
    await setupTestDatabase();
    await setupTestRedis();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
    await cleanupTestRedis();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        services: {
          database: { status: 'healthy' },
          redis: { status: 'healthy' }
        }
      });
    });
  });

  describe('Authentication Flow', () => {
    it('should register a new user', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'John',
        lastName: 'Doe'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'User registered successfully',
        user: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName
        }
      });

      testUser = response.body.user;
    });

    it('should reject duplicate email registration', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'Jane',
        lastName: 'Doe'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Email already exists'
      });
    });

    it('should login with valid credentials', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Login successful',
        user: {
          email: credentials.email
        }
      });

      expect(response.body.accessToken).toBeDefined();
      authToken = response.body.accessToken;
    });

    it('should reject invalid credentials', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'WrongPassword'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid credentials'
      });
    });

    it('should get user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        user: {
          email: 'test@example.com'
        }
      });
    });

    it('should reject requests without token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Access token required'
      });
    });
  });

  describe('Campaign Management', () => {
    beforeAll(async () => {
      // Create a test organization first
      // In real implementation, this would be done through organization endpoints
      testOrganization = { id: 'test-org-123' };
    });

    it('should create a new campaign', async () => {
      const campaignData = {
        organizationId: testOrganization.id,
        name: 'Test Campaign',
        description: 'Test campaign for integration testing',
        objectives: {
          primary: 'lead_generation',
          secondary: 'brand_awareness'
        },
        targetAudience: {
          demographics: { age_range: '25-45' },
          interests: ['technology', 'marketing']
        },
        budgetTotal: 10000.00
      };

      const response = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send(campaignData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Campaign created successfully',
        campaign: {
          name: campaignData.name,
          status: 'draft',
          budgetTotal: campaignData.budgetTotal
        }
      });

      testCampaign = response.body.campaign;
    });

    it('should validate campaign data', async () => {
      const invalidCampaignData = {
        organizationId: 'invalid-uuid',
        name: '', // Invalid: empty name
        budgetTotal: -100 // Invalid: negative budget
      };

      const response = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidCampaignData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Validation failed'
      });
    });

    it('should get campaign by ID', async () => {
      const response = await request(app)
        .get(`/api/campaigns/${testCampaign.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        campaign: {
          id: testCampaign.id,
          name: 'Test Campaign'
        }
      });
    });

    it('should update campaign', async () => {
      const updateData = {
        name: 'Updated Test Campaign',
        budgetTotal: 15000.00
      };

      const response = await request(app)
        .put(`/api/campaigns/${testCampaign.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Campaign updated successfully',
        campaign: {
          name: updateData.name,
          budgetTotal: updateData.budgetTotal
        }
      });
    });

    it('should update campaign status', async () => {
      const statusUpdate = { status: 'active' };

      const response = await request(app)
        .patch(`/api/campaigns/${testCampaign.id}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(statusUpdate)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        campaign: {
          status: 'active'
        }
      });
    });

    it('should get campaign performance metrics', async () => {
      const startDate = new Date('2023-01-01').toISOString();
      const endDate = new Date('2023-01-31').toISOString();

      const response = await request(app)
        .get(`/api/campaigns/${testCampaign.id}/performance`)
        .query({ startDate, endDate })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        performance: {
          impressions: expect.any(Number),
          clicks: expect.any(Number),
          conversions: expect.any(Number)
        }
      });
    });

    it('should duplicate campaign', async () => {
      const duplicateData = {
        name: 'Duplicated Campaign'
      };

      const response = await request(app)
        .post(`/api/campaigns/${testCampaign.id}/duplicate`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(duplicateData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Campaign duplicated successfully',
        campaign: {
          name: duplicateData.name,
          status: 'draft'
        }
      });
    });
  });

  describe('Analytics Tracking', () => {
    it('should track analytics events', async () => {
      const eventData = {
        organizationId: testOrganization.id,
        campaignId: testCampaign.id,
        eventType: 'click',
        eventData: {
          url: 'https://example.com',
          source: 'google',
          medium: 'cpc'
        },
        sessionId: 'session-123'
      };

      const response = await request(app)
        .post('/api/analytics/track')
        .send(eventData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Event tracked successfully',
        eventId: expect.any(String)
      });
    });

    it('should validate analytics event data', async () => {
      const invalidEventData = {
        eventType: 'click',
        eventData: {}
        // Missing organizationId
      };

      const response = await request(app)
        .post('/api/analytics/track')
        .send(invalidEventData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Validation failed'
      });
    });

    it('should get campaign metrics', async () => {
      const startDate = new Date('2023-01-01').toISOString();
      const endDate = new Date('2023-01-31').toISOString();

      const response = await request(app)
        .get(`/api/analytics/campaigns/${testCampaign.id}/metrics`)
        .query({ startDate, endDate })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        metrics: expect.any(Object),
        dateRange: {
          start: startDate,
          end: endDate
        }
      });
    });

    it('should get conversion funnel', async () => {
      const startDate = new Date('2023-01-01').toISOString();
      const endDate = new Date('2023-01-31').toISOString();

      const response = await request(app)
        .get(`/api/analytics/campaigns/${testCampaign.id}/funnel`)
        .query({ startDate, endDate })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        funnel: {
          impressions: expect.any(Number),
          clicks: expect.any(Number),
          conversions: expect.any(Number),
          clickThroughRate: expect.any(Number),
          conversionRate: expect.any(Number)
        }
      });
    });

    it('should get dashboard data', async () => {
      const response = await request(app)
        .get(`/api/analytics/organizations/${testOrganization.id}/dashboard`)
        .query({ days: 30 })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        dashboard: {
          summary: expect.any(Object),
          trends: expect.any(Object),
          topCampaigns: expect.any(Array),
          channelBreakdown: expect.any(Object)
        }
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = [];
      
      // Make multiple rapid requests to trigger rate limit
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: 'nonexistent@example.com',
              password: 'WrongPassword'
            })
        );
      }

      const responses = await Promise.all(requests);
      
      // At least one should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should handle 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Endpoint not found'
      });
    });

    it('should handle invalid JSON', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid JSON in request body'
      });
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });
  });
});