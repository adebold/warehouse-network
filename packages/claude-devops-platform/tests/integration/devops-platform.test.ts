import request from 'supertest';
import { createApp, startServer } from '../../src';
import { Database } from '../../src/database';
import { config } from '../../src/config';
import { KubernetesService } from '../../src/services/kubernetes';
import { DockerService } from '../../src/services/docker';
import { GitHubService } from '../../src/services/github';
import { QueueService } from '../../src/services/queue';
import { generateToken, generateApiKey } from '../../src/middleware/auth';

describe('DevOps Platform Integration Tests', () => {
  let app: any;
  let authToken: string;
  let apiKey: string;

  beforeAll(async () => {
    // Initialize services
    await Database.initialize();
    await KubernetesService.initialize();
    await DockerService.initialize();
    await QueueService.initialize();
    
    // Create test app
    app = await createApp();
    
    // Generate auth credentials for tests
    authToken = await generateToken('test-user-id');
    const { key } = await generateApiKey();
    apiKey = key;
  }, 30000);

  afterAll(async () => {
    await QueueService.getInstance().shutdown();
    await Database.shutdown();
  });

  describe('Health Endpoints', () => {
    test('GET /health should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: expect.stringMatching(/healthy|degraded/),
        version: expect.any(String),
        uptime: expect.any(Number),
        timestamp: expect.any(String),
        checks: expect.objectContaining({
          database: expect.any(Object),
          redis: expect.any(Object),
        }),
      });
    });

    test('GET /health/liveness should return alive status', async () => {
      const response = await request(app)
        .get('/health/liveness')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'alive',
        timestamp: expect.any(String),
      });
    });

    test('GET /health/readiness should return ready status', async () => {
      const response = await request(app)
        .get('/health/readiness')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ready',
        timestamp: expect.any(String),
        checks: expect.any(Object),
      });
    });

    test('GET /health/metrics should return Prometheus metrics', async () => {
      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      expect(response.text).toContain('# TYPE');
      expect(response.text).toContain('# HELP');
    });
  });

  describe('Deployment API', () => {
    let deploymentConfigId: string;

    test('POST /api/v1/deployments/configs should create deployment configuration', async () => {
      const deploymentConfig = {
        name: 'test-deployment',
        application: 'test-app',
        version: '1.0.0',
        environment: 'development',
        strategy: 'rolling-update',
        target: {
          type: 'kubernetes',
          config: {
            namespace: 'default',
            deployment: 'test-app',
            replicas: 2,
          },
        },
        source: {
          type: 'docker-image',
          config: {
            repository: 'test-app',
            tag: '1.0.0',
          },
        },
        healthCheck: {
          enabled: true,
          type: 'http',
          config: {
            url: 'http://test-app:8080/health',
          },
          interval: 30,
          timeout: 10,
          retries: 3,
          startPeriod: 60,
        },
      };

      const response = await request(app)
        .post('/api/v1/deployments/configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deploymentConfig)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(String),
        },
      });

      deploymentConfigId = response.body.data.id;
    });

    test('POST /api/v1/deployments should create deployment (dry run)', async () => {
      const response = await request(app)
        .post('/api/v1/deployments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          configId: deploymentConfigId,
          dryRun: true,
        })
        .expect(202);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(String),
          status: 'pending',
        },
      });
    });

    test('GET /api/v1/deployments should list deployments', async () => {
      const response = await request(app)
        .get('/api/v1/deployments')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });
  });

  describe('Pipeline API', () => {
    let pipelineId: string;

    test('POST /api/v1/pipelines should create pipeline', async () => {
      const pipelineConfig = {
        name: 'test-pipeline',
        description: 'Test CI/CD pipeline',
        stages: [
          {
            name: 'build',
            type: 'build',
            steps: [
              {
                name: 'docker-build',
                type: 'docker-build',
                config: {
                  context: '.',
                  dockerfile: 'Dockerfile',
                  tags: ['test-app:latest'],
                },
              },
            ],
          },
          {
            name: 'test',
            type: 'test',
            parallel: true,
            steps: [
              {
                name: 'unit-tests',
                type: 'script',
                config: {
                  script: 'npm test',
                },
              },
              {
                name: 'integration-tests',
                type: 'script',
                config: {
                  script: 'npm run test:integration',
                },
              },
            ],
          },
        ],
        triggers: [
          {
            type: 'webhook',
            config: {
              secret: 'test-webhook-secret',
            },
          },
        ],
        notifications: [
          {
            type: 'slack',
            events: ['start', 'success', 'failure'],
            config: {
              webhookUrl: 'https://hooks.slack.com/services/test',
              channel: '#deployments',
            },
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/pipelines')
        .set('Authorization', `Bearer ${authToken}`)
        .send(pipelineConfig)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: expect.any(String),
        },
      });

      pipelineId = response.body.data.id;
    });

    test('GET /api/v1/pipelines should list pipelines', async () => {
      const response = await request(app)
        .get('/api/v1/pipelines')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: pipelineId,
            name: 'test-pipeline',
          }),
        ]),
      });
    });
  });

  describe('Kubernetes API', () => {
    test('GET /api/v1/kubernetes/namespaces should list namespaces', async () => {
      const response = await request(app)
        .get('/api/v1/kubernetes/namespaces')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    test('GET /api/v1/kubernetes/deployments should list deployments', async () => {
      const response = await request(app)
        .get('/api/v1/kubernetes/deployments')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ namespace: 'default' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });
  });

  describe('Docker API', () => {
    test('GET /api/v1/docker/images should list images', async () => {
      const response = await request(app)
        .get('/api/v1/docker/images')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    test('GET /api/v1/docker/containers should list containers', async () => {
      const response = await request(app)
        .get('/api/v1/docker/containers')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });
  });

  describe('Terraform API', () => {
    test('POST /api/v1/terraform/workspaces should create workspace', async () => {
      const workspaceConfig = {
        name: 'test-workspace',
        workingDirectory: './terraform',
        backend: {
          type: 'local',
          config: {},
        },
        variables: {
          region: 'us-east-1',
          environment: 'test',
        },
      };

      const response = await request(app)
        .post('/api/v1/terraform/workspaces')
        .set('Authorization', `Bearer ${authToken}`)
        .send(workspaceConfig)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          name: 'test-workspace',
        },
      });
    });

    test('GET /api/v1/terraform/workspaces should list workspaces', async () => {
      const response = await request(app)
        .get('/api/v1/terraform/workspaces')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.arrayContaining(['test-workspace']),
      });
    });
  });

  describe('Monitoring API', () => {
    test('GET /api/v1/monitoring/alerts should list alerts', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    test('GET /api/v1/monitoring/metrics/:application should get application metrics', async () => {
      const response = await request(app)
        .get('/api/v1/monitoring/metrics/test-app')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ environment: 'development' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          cpuUsage: expect.any(Number),
          memoryUsage: expect.any(Number),
          requestRate: expect.any(Number),
          errorRate: expect.any(Number),
        }),
      });
    });
  });

  describe('Authentication', () => {
    test('Requests without authentication should fail', async () => {
      const response = await request(app)
        .get('/api/v1/deployments')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: expect.any(String),
        },
      });
    });

    test('Requests with invalid token should fail', async () => {
      const response = await request(app)
        .get('/api/v1/deployments')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: expect.any(String),
        },
      });
    });

    test('API key authentication should work', async () => {
      const response = await request(app)
        .get('/api/v1/deployments')
        .set('Authorization', `ApiKey ${apiKey}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });
  });

  describe('Rate Limiting', () => {
    test('Should rate limit excessive requests', async () => {
      const requests = Array.from({ length: 105 }, () =>
        request(app)
          .get('/health')
          .set('X-Forwarded-For', '1.2.3.4')
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
      expect(rateLimited[0].body).toMatchObject({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: expect.any(String),
        },
      });
    });
  });
});