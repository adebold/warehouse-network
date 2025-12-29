/**
 * Integration tests for analytics package
 */

import { AnalyticsClient } from '../src/core/client';
import { AnalyticsConfig } from '../src/core/config';
import { v4 as uuidv4 } from 'uuid';

describe('Analytics Integration Tests', () => {
  let client: AnalyticsClient;
  const testUserId = `test_user_${Date.now()}`;
  const testAnonymousId = uuidv4();

  beforeAll(async () => {
    // Use test configuration
    const config: Partial<AnalyticsConfig> = {
      database: {
        url: process.env.TEST_DATABASE_URL || 'postgresql://localhost/marketing_analytics_test',
        poolMin: 1,
        poolMax: 5,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 3000
      },
      redis: {
        url: process.env.TEST_REDIS_URL || 'redis://localhost:6379',
        db: 1,
        keyPrefix: 'analytics_test:',
        streamKey: 'analytics_test:events',
        consumerGroup: 'test-consumers',
        maxRetries: 3
      },
      ga4: {
        measurementId: 'G-TEST123456',
        apiSecret: 'test_secret',
        propertyId: 'properties/12345',
        batchSize: 10,
        flushInterval: 100,
        enabled: false // Disable for tests
      },
      mixpanel: {
        projectToken: 'test_token',
        euResidency: false,
        batchSize: 10,
        flushInterval: 100,
        enabled: false // Disable for tests
      }
    } as any;

    client = new AnalyticsClient({ config: config as any });
    await client.initialize();
  }, 30000);

  afterAll(async () => {
    await client.shutdown();
  });

  describe('Event Tracking', () => {
    test('should track basic event', async () => {
      await expect(
        client.track(
          'test_event',
          testUserId,
          testAnonymousId,
          { category: 'test', value: 123 },
          {
            page: {
              url: 'https://example.com/test',
              path: '/test',
              title: 'Test Page'
            }
          }
        )
      ).resolves.not.toThrow();
    });

    test('should track conversion event', async () => {
      await expect(
        client.trackConversion(
          testUserId,
          testAnonymousId,
          99.99,
          'USD',
          {
            transactionId: 'test_txn_123',
            items: [
              {
                itemId: 'SKU123',
                itemName: 'Test Product',
                quantity: 1,
                price: 99.99,
                currency: 'USD'
              }
            ]
          }
        )
      ).resolves.not.toThrow();
    });
  });

  describe('User Management', () => {
    test('should identify user', async () => {
      await expect(
        client.identify(testUserId, {
          email: 'test@example.com',
          name: 'Test User',
          plan: 'premium',
          createdAt: new Date().toISOString()
        })
      ).resolves.not.toThrow();
    });

    test('should create user alias', async () => {
      await expect(
        client.alias(testUserId, testAnonymousId)
      ).resolves.not.toThrow();
    });
  });

  describe('Analytics Queries', () => {
    test('should get metrics', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date();

      const metrics = await client.getMetrics(startDate, endDate, 'day');
      expect(Array.isArray(metrics)).toBe(true);
    });

    test('should get processing stats', () => {
      const stats = client.getStats();
      expect(stats).toHaveProperty('database');
      expect(stats).toHaveProperty('processing');
      expect(stats).toHaveProperty('ga4');
      expect(stats).toHaveProperty('mixpanel');
    });
  });

  describe('GDPR Compliance', () => {
    test('should process access request', async () => {
      const requestId = await client.processGDPRRequest(testUserId, 'access');
      expect(requestId).toBeTruthy();
      expect(typeof requestId).toBe('string');
    });

    test('should update consent', async () => {
      await expect(
        client.updateConsent(testUserId, {
          analytics: true,
          marketing: false,
          personalization: true
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Attribution', () => {
    test('should get attribution results', async () => {
      const attribution = await client.getAttribution(testUserId, 'linear');
      expect(attribution).toBeTruthy();
    });
  });
});