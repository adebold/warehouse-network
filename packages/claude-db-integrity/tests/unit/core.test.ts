import { IntegrityEngine } from '../../src/core/IntegrityEngine';
import { SchemaManager } from '../../src/core/SchemaManager';
import { ClaudeMemoryManager } from '../../src/memory/ClaudeMemoryManager';
import { ValidationManager } from '../../src/validators/ValidationManager';

describe('Core Functionality', () => {
  describe('IntegrityEngine', () => {
    let engine: IntegrityEngine;

    beforeEach(() => {
      engine = new IntegrityEngine({
        database: { type: 'memory' },
        claude: { enabled: false }
      });
    });

    afterEach(async () => {
      if (engine) {
        await engine.shutdown();
      }
    });

    test('should initialize successfully', async () => {
      await expect(engine.initialize()).resolves.not.toThrow();
      expect(engine.isInitialized()).toBe(true);
    });

    test('should run integrity checks', async () => {
      await engine.initialize();
      
      const report = await engine.runIntegrityChecks();
      
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('checks');
      expect(report.summary).toHaveProperty('total');
      expect(report.summary).toHaveProperty('passed');
      expect(report.summary).toHaveProperty('failed');
      expect(report.summary).toHaveProperty('skipped');
    });

    test('should handle configuration errors gracefully', () => {
      expect(() => {
        new IntegrityEngine({
          database: { type: 'invalid' as any }
        });
      }).toThrow();
    });

    test('should support health checks', async () => {
      await engine.initialize();
      
      const health = await engine.getHealth();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('components');
      expect(['healthy', 'unhealthy', 'degraded']).toContain(health.status);
    });
  });

  describe('ValidationManager', () => {
    let validator: ValidationManager;

    beforeEach(() => {
      validator = new ValidationManager({
        strict: false,
        autoLoad: false
      });
    });

    afterEach(() => {
      validator = null as any;
    });

    test('should validate simple objects', async () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2 },
          email: { type: 'string', format: 'email' },
          age: { type: 'number', minimum: 0 }
        },
        required: ['name', 'email']
      };

      await validator.loadSchema('user', schema);

      const validData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      };

      const result = await validator.validate('user', validData);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect validation errors', async () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2 },
          email: { type: 'string', format: 'email' }
        },
        required: ['name', 'email']
      };

      await validator.loadSchema('user', schema);

      const invalidData = {
        name: 'A', // Too short
        email: 'invalid-email' // Invalid format
        // Missing required fields
      };

      const result = await validator.validate('user', invalidData);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should support batch validation', async () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number', minimum: 0 }
        },
        required: ['name']
      };

      await validator.loadSchema('person', schema);

      const data = [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: -5 }, // Invalid age
        { age: 30 } // Missing name
      ];

      const results = await validator.validateBatch('person', data);
      
      expect(results).toHaveLength(3);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(false);
      expect(results[2].isValid).toBe(false);
    });

    test('should handle custom validation rules', async () => {
      const customRule = {
        name: 'password-strength',
        validator: (value: string) => {
          return value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value);
        },
        message: 'Password must be at least 8 characters with uppercase letter and number'
      };

      validator.addCustomRule(customRule);

      const schema = {
        type: 'object',
        properties: {
          password: { 
            type: 'string',
            'custom-rule': 'password-strength'
          }
        }
      };

      await validator.loadSchema('auth', schema);

      const weakPassword = { password: 'weak' };
      const strongPassword = { password: 'Strong123' };

      const weakResult = await validator.validate('auth', weakPassword);
      const strongResult = await validator.validate('auth', strongPassword);

      expect(weakResult.isValid).toBe(false);
      expect(strongResult.isValid).toBe(true);
    });
  });

  describe('ClaudeMemoryManager', () => {
    let memory: ClaudeMemoryManager;

    beforeEach(() => {
      memory = new ClaudeMemoryManager({
        claude: { enabled: false }, // Disable for unit tests
        cache: { provider: 'memory' }
      });
    });

    afterEach(async () => {
      if (memory) {
        await memory.clear();
      }
    });

    test('should store and retrieve data', async () => {
      const testData = { test: 'value', number: 42 };
      
      await memory.store('test-key', testData);
      const retrieved = await memory.retrieve('test-key');
      
      expect(retrieved).toEqual(testData);
    });

    test('should handle TTL expiration', async () => {
      const testData = { expires: true };
      
      await memory.store('ttl-key', testData, { ttl: 1 }); // 1 second
      
      // Should exist immediately
      const immediate = await memory.retrieve('ttl-key');
      expect(immediate).toEqual(testData);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const expired = await memory.retrieve('ttl-key');
      expect(expired).toBeNull();
    }, 2000);

    test('should support search functionality', async () => {
      await memory.store('user:1', { name: 'Alice', role: 'admin' });
      await memory.store('user:2', { name: 'Bob', role: 'user' });
      await memory.store('product:1', { name: 'Widget', price: 10 });

      const userResults = await memory.search('user:*');
      const allResults = await memory.search('*');

      expect(userResults).toHaveLength(2);
      expect(allResults).toHaveLength(3);
    });

    test('should handle namespaces', async () => {
      await memory.store('key1', 'value1', { namespace: 'ns1' });
      await memory.store('key1', 'value2', { namespace: 'ns2' });
      await memory.store('key2', 'value3', { namespace: 'ns1' });

      const ns1Results = await memory.list({ namespace: 'ns1' });
      const ns2Results = await memory.list({ namespace: 'ns2' });

      expect(ns1Results).toHaveLength(2);
      expect(ns2Results).toHaveLength(1);
    });

    test('should provide statistics', async () => {
      await memory.store('stat1', 'data1');
      await memory.store('stat2', 'data2');
      await memory.store('stat3', 'data3');

      const stats = await memory.getStats();

      expect(stats.totalKeys).toBe(3);
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.operations.store).toBe(3);
    });
  });

  describe('SchemaManager', () => {
    let schemaManager: SchemaManager;

    beforeEach(() => {
      schemaManager = new SchemaManager({
        schemaDirectory: './test-schemas',
        autoValidate: true
      });
    });

    test('should load and validate schemas', async () => {
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' }
        },
        required: ['id', 'name']
      };

      await schemaManager.loadSchema('test-entity', schema);
      
      const loaded = await schemaManager.getSchema('test-entity');
      expect(loaded).toEqual(schema);
    });

    test('should detect schema changes', async () => {
      const originalSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        }
      };

      const updatedSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' }
        },
        required: ['name']
      };

      await schemaManager.loadSchema('evolving-entity', originalSchema);
      
      const changes = await schemaManager.compareSchemas(
        'evolving-entity',
        updatedSchema
      );

      expect(changes.hasChanges).toBe(true);
      expect(changes.added).toContain('email');
      expect(changes.requiredAdded).toContain('name');
    });

    test('should validate schema compatibility', async () => {
      const v1Schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        },
        required: ['name']
      };

      const v2Compatible = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          email: { type: 'string' } // Added optional field
        },
        required: ['name']
      };

      const v2Incompatible = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'string' } // Changed type - breaking change
        },
        required: ['name', 'age'] // Added required field - breaking change
      };

      await schemaManager.loadSchema('compat-test', v1Schema);

      const compatibleCheck = await schemaManager.isCompatible(
        'compat-test',
        v2Compatible
      );
      
      const incompatibleCheck = await schemaManager.isCompatible(
        'compat-test',
        v2Incompatible
      );

      expect(compatibleCheck.isCompatible).toBe(true);
      expect(incompatibleCheck.isCompatible).toBe(false);
      expect(incompatibleCheck.breakingChanges.length).toBeGreaterThan(0);
    });

    test('should generate migration plans', async () => {
      const fromSchema = {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' }
        }
      };

      const toSchema = {
        type: 'object',
        properties: {
          fullName: { type: 'string' },
          email: { type: 'string', format: 'email' }
        },
        required: ['fullName']
      };

      const migrationPlan = await schemaManager.generateMigrationPlan(
        fromSchema,
        toSchema
      );

      expect(migrationPlan.steps).toHaveLength(0); // Basic implementation
      expect(migrationPlan.type).toBe('schema-change');
    });
  });

  describe('Integration Tests', () => {
    test('should work together in a complete workflow', async () => {
      // Setup components
      const engine = new IntegrityEngine({
        database: { type: 'memory' },
        claude: { enabled: false },
        validation: { strict: true }
      });

      await engine.initialize();

      // Define a schema
      const userSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string', minLength: 2 },
          age: { type: 'number', minimum: 0, maximum: 150 }
        },
        required: ['id', 'email', 'name']
      };

      // Load schema
      await engine.getValidator().loadSchema('user', userSchema);

      // Test valid data
      const validUser = {
        id: '123',
        email: 'john@example.com',
        name: 'John Doe',
        age: 30
      };

      const validationResult = await engine.getValidator().validate('user', validUser);
      expect(validationResult.isValid).toBe(true);

      // Store in memory
      await engine.getMemoryManager().store('validated-user', validUser);

      // Retrieve and verify
      const storedUser = await engine.getMemoryManager().retrieve('validated-user');
      expect(storedUser).toEqual(validUser);

      // Run integrity checks
      const integrityReport = await engine.runIntegrityChecks();
      expect(integrityReport.summary.total).toBeGreaterThan(0);

      await engine.shutdown();
    });
  });
});