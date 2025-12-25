import { IntegrityEngine } from '../../src/core/IntegrityEngine';
import { CLIController } from '../../src/cli/controller';
import fs from 'fs/promises';
import path from 'path';

describe('End-to-End Integration', () => {
  const testDir = path.join(__dirname, 'e2e-temp');
  let engine: IntegrityEngine;

  beforeAll(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    
    // Create test configuration
    const config = {
      database: {
        type: 'memory',
        connection: 'memory'
      },
      claude: {
        enabled: false, // Disable for testing
        namespace: 'test-integrity'
      },
      validation: {
        strict: true,
        autoFix: false
      },
      schemas: {
        directory: path.join(testDir, 'schemas')
      }
    };

    await fs.mkdir(path.join(testDir, 'schemas'), { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'claude-db-integrity.config.js'),
      `module.exports = ${JSON.stringify(config, null, 2)};`
    );

    // Initialize engine
    engine = new IntegrityEngine(path.join(testDir, 'claude-db-integrity.config.js'));
    await engine.initialize();
  });

  afterAll(async () => {
    if (engine) {
      await engine.shutdown();
    }
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test directory:', error);
    }
  });

  describe('Schema Management Workflow', () => {
    test('should create, update, and validate schemas', async () => {
      const userSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: 'User',
        type: 'object',
        properties: {
          id: {
            type: 'string',
            pattern: '^[a-zA-Z0-9]{8,}$'
          },
          email: {
            type: 'string',
            format: 'email'
          },
          name: {
            type: 'string',
            minLength: 2,
            maxLength: 100
          },
          created_at: {
            type: 'string',
            format: 'date-time'
          }
        },
        required: ['id', 'email', 'name'],
        additionalProperties: false
      };

      // Save schema to file
      const schemaPath = path.join(testDir, 'schemas', 'user.json');
      await fs.writeFile(schemaPath, JSON.stringify(userSchema, null, 2));

      // Load schema into engine
      await engine.getSchemaManager().loadFromFile('user', schemaPath);

      // Test valid data
      const validUser = {
        id: 'user12345',
        email: 'test@example.com',
        name: 'Test User',
        created_at: new Date().toISOString()
      };

      const validResult = await engine.getValidator().validate('user', validUser);
      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      // Test invalid data
      const invalidUser = {
        id: '123', // Too short
        email: 'invalid-email', // Invalid format
        name: 'A', // Too short
        extra_field: 'not allowed' // Additional property
      };

      const invalidResult = await engine.getValidator().validate('user', invalidUser);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);

      // Update schema (add optional field)
      const updatedSchema = {
        ...userSchema,
        properties: {
          ...userSchema.properties,
          phone: {
            type: 'string',
            pattern: '^\\+?[1-9]\\d{1,14}$'
          }
        }
      };

      await fs.writeFile(schemaPath, JSON.stringify(updatedSchema, null, 2));
      await engine.getSchemaManager().reloadSchema('user');

      // Test with new optional field
      const userWithPhone = {
        ...validUser,
        phone: '+1234567890'
      };

      const phoneResult = await engine.getValidator().validate('user', userWithPhone);
      expect(phoneResult.isValid).toBe(true);
    });

    test('should detect and report schema drift', async () => {
      // Create initial schema snapshot
      const initialSnapshot = await engine.getSchemaManager().createSnapshot();
      expect(initialSnapshot).toBeDefined();

      // Simulate schema change by adding a new schema
      const productSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          price: { type: 'number', minimum: 0 }
        },
        required: ['id', 'name', 'price']
      };

      const productPath = path.join(testDir, 'schemas', 'product.json');
      await fs.writeFile(productPath, JSON.stringify(productSchema, null, 2));
      await engine.getSchemaManager().loadFromFile('product', productPath);

      // Check for drift
      const driftReport = await engine.checkSchemaDrift();
      expect(driftReport.hasChanges).toBe(true);
      expect(driftReport.changes.added).toContain('product');
    });
  });

  describe('Data Validation Workflow', () => {
    test('should validate batch data and generate reports', async () => {
      // Setup product schema for testing
      const productSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string', minLength: 1 },
          price: { type: 'number', minimum: 0 },
          category: { type: 'string', enum: ['electronics', 'clothing', 'books'] }
        },
        required: ['id', 'name', 'price', 'category']
      };

      await engine.getValidator().loadSchema('product', productSchema);

      // Test data with mix of valid and invalid records
      const testProducts = [
        {
          id: 'prod1',
          name: 'Laptop',
          price: 999.99,
          category: 'electronics'
        },
        {
          id: 'prod2',
          name: '', // Invalid: empty name
          price: 50,
          category: 'books'
        },
        {
          id: 'prod3',
          name: 'Shirt',
          price: -10, // Invalid: negative price
          category: 'clothing'
        },
        {
          id: 'prod4',
          name: 'Novel',
          price: 15.99,
          category: 'invalid-category' // Invalid: not in enum
        },
        {
          id: 'prod5',
          name: 'Phone',
          price: 699,
          category: 'electronics'
        }
      ];

      const batchResults = await engine.getValidator().validateBatch('product', testProducts);

      expect(batchResults).toHaveLength(5);
      expect(batchResults[0].isValid).toBe(true);
      expect(batchResults[1].isValid).toBe(false);
      expect(batchResults[2].isValid).toBe(false);
      expect(batchResults[3].isValid).toBe(false);
      expect(batchResults[4].isValid).toBe(true);

      // Generate validation report
      const report = engine.getValidator().generateBatchReport(batchResults);
      expect(report.summary.total).toBe(5);
      expect(report.summary.passed).toBe(2);
      expect(report.summary.failed).toBe(3);
      expect(report.errors.length).toBe(3);
    });
  });

  describe('Memory Integration Workflow', () => {
    test('should store validation results and retrieve analytics', async () => {
      const memory = engine.getMemoryManager();

      // Store validation results over time
      const validationEvents = [
        {
          entity: 'user',
          result: 'valid',
          timestamp: new Date().toISOString(),
          data: { id: 'user1', email: 'user1@test.com' }
        },
        {
          entity: 'user',
          result: 'invalid',
          timestamp: new Date().toISOString(),
          errors: ['email format invalid']
        },
        {
          entity: 'product',
          result: 'valid',
          timestamp: new Date().toISOString(),
          data: { id: 'prod1', name: 'Test Product' }
        }
      ];

      for (const [index, event] of validationEvents.entries()) {
        await memory.store(`validation:${Date.now()}-${index}`, event, {
          namespace: 'validation-history',
          ttl: 3600
        });
      }

      // Retrieve validation history
      const history = await memory.search('validation:*', {
        namespace: 'validation-history'
      });

      expect(history.length).toBe(3);

      // Generate analytics
      const stats = await memory.getStats();
      expect(stats.totalKeys).toBeGreaterThanOrEqual(3);
      expect(stats.namespaces).toContain('validation-history');
    });

    test('should support real-time integrity monitoring', async () => {
      const memory = engine.getMemoryManager();

      // Simulate real-time events
      const monitoringData = {
        checksPassed: 0,
        checksFailed: 0,
        lastCheck: null as string | null
      };

      // Run multiple integrity checks
      for (let i = 0; i < 5; i++) {
        const report = await engine.runIntegrityChecks();
        
        monitoringData.checksPassed += report.summary.passed;
        monitoringData.checksFailed += report.summary.failed;
        monitoringData.lastCheck = new Date().toISOString();

        await memory.store('monitoring:current', monitoringData, {
          namespace: 'monitoring',
          ttl: 300 // 5 minutes
        });

        // Small delay between checks
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const currentStats = await memory.retrieve('monitoring:current', {
        namespace: 'monitoring'
      });

      expect(currentStats).toBeDefined();
      expect(currentStats.checksPassed).toBeGreaterThan(0);
      expect(currentStats.lastCheck).toBeDefined();
    });
  });

  describe('CLI Integration', () => {
    test('should execute CLI commands programmatically', async () => {
      const cli = new CLIController({
        configPath: path.join(testDir, 'claude-db-integrity.config.js')
      });

      // Test init command
      await expect(cli.init({
        template: 'generic',
        skipInstall: true
      })).resolves.not.toThrow();

      // Test check command
      const checkResult = await cli.check({
        verbose: true,
        format: 'json'
      });

      expect(checkResult).toHaveProperty('summary');
      expect(checkResult).toHaveProperty('checks');

      // Test drift command
      const driftResult = await cli.checkDrift({
        checkOnly: true
      });

      expect(driftResult).toHaveProperty('hasChanges');
      expect(driftResult).toHaveProperty('changes');
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle database connection failures gracefully', async () => {
      const faultyEngine = new IntegrityEngine({
        database: {
          type: 'postgresql',
          url: 'postgresql://invalid:invalid@localhost:5432/invalid'
        },
        claude: { enabled: false }
      });

      // Should not throw on initialization
      await expect(faultyEngine.initialize()).rejects.toThrow();
    });

    test('should recover from validation errors', async () => {
      // Load invalid schema
      const invalidSchema = {
        type: 'object',
        properties: {
          name: { type: 'invalid-type' } // Invalid JSON Schema
        }
      };

      await expect(
        engine.getValidator().loadSchema('invalid', invalidSchema)
      ).rejects.toThrow();

      // Engine should still be functional for other operations
      const health = await engine.getHealth();
      expect(health.status).toBeDefined();
    });

    test('should handle memory storage failures', async () => {
      const memory = engine.getMemoryManager();

      // Try to store extremely large data
      const largeData = 'x'.repeat(10000000); // 10MB string
      
      await expect(
        memory.store('large-key', largeData)
      ).rejects.toThrow();

      // Memory should still be functional for normal operations
      await expect(
        memory.store('normal-key', { test: 'data' })
      ).resolves.not.toThrow();
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle concurrent validation requests', async () => {
      const userSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' }
        },
        required: ['id', 'email']
      };

      await engine.getValidator().loadSchema('concurrent-user', userSchema);

      // Create concurrent validation requests
      const concurrentPromises = [];
      for (let i = 0; i < 50; i++) {
        const userData = {
          id: `user${i}`,
          email: `user${i}@example.com`
        };
        
        concurrentPromises.push(
          engine.getValidator().validate('concurrent-user', userData)
        );
      }

      const results = await Promise.all(concurrentPromises);

      expect(results).toHaveLength(50);
      expect(results.every(r => r.isValid)).toBe(true);
    });

    test('should maintain performance under memory pressure', async () => {
      const memory = engine.getMemoryManager();
      const startTime = Date.now();

      // Store many items
      const storePromises = [];
      for (let i = 0; i < 1000; i++) {
        storePromises.push(
          memory.store(`perf-key-${i}`, {
            index: i,
            data: `test-data-${i}`,
            timestamp: new Date().toISOString()
          })
        );
      }

      await Promise.all(storePromises);

      const storeTime = Date.now() - startTime;

      // Retrieve items
      const retrieveStart = Date.now();
      const retrievePromises = [];
      for (let i = 0; i < 1000; i++) {
        retrievePromises.push(memory.retrieve(`perf-key-${i}`));
      }

      const retrievedItems = await Promise.all(retrievePromises);
      const retrieveTime = Date.now() - retrieveStart;

      expect(retrievedItems).toHaveLength(1000);
      expect(retrievedItems.every(item => item !== null)).toBe(true);

      // Performance should be reasonable (adjust thresholds as needed)
      expect(storeTime).toBeLessThan(5000); // 5 seconds
      expect(retrieveTime).toBeLessThan(2000); // 2 seconds

      console.log(`Performance: Store ${storeTime}ms, Retrieve ${retrieveTime}ms`);
    });
  });
});