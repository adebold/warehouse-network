#!/usr/bin/env node

/**
 * Basic Usage Example for Claude DB Integrity
 * 
 * This example demonstrates the fundamental features of the package:
 * - Initializing the integrity engine
 * - Loading and validating schemas
 * - Running integrity checks
 * - Using Claude memory integration
 * - Error handling
 */

const { 
  createIntegrityEngine, 
  createMemoryManager, 
  ValidationManager,
  healthCheck 
} = require('claude-db-integrity');
const { logger } = require('../../../../../../utils/logger');

async function basicUsageExample() {
  logger.info('🚀 Claude DB Integrity - Basic Usage Example');
  logger.info('=============================================\n');

  try {
    // 1. Quick health check
    logger.info('1. Running health check...');
    const health = await healthCheck();
    logger.info(`   Status: ${health.status}`);
    logger.info(`   Checks: ${JSON.stringify(health.checks, null, 2)}\n`);

    // 2. Initialize integrity engine
    logger.info('2. Initializing integrity engine...');
    const engine = createIntegrityEngine();
    await engine.initialize();
    logger.info('   ✅ Engine initialized\n');

    // 3. Create and load a schema
    logger.info('3. Loading validation schema...');
    const userSchema = {
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
        age: { 
          type: 'number', 
          minimum: 0, 
          maximum: 150 
        },
        preferences: {
          type: 'object',
          properties: {
            theme: { 
              type: 'string', 
              enum: ['light', 'dark'] 
            },
            notifications: { 
              type: 'boolean' 
            }
          }
        }
      },
      required: ['id', 'email', 'name'],
      additionalProperties: false
    };

    const validator = new ValidationManager();
    await validator.loadSchema('user', userSchema);
    logger.info('   ✅ User schema loaded\n');

    // 4. Validate some data
    logger.info('4. Validating data...');
    
    const validUser = {
      id: 'user12345',
      email: 'john.doe@example.com',
      name: 'John Doe',
      age: 30,
      preferences: {
        theme: 'dark',
        notifications: true
      }
    };

    const invalidUser = {
      id: '123', // Too short
      email: 'invalid-email', // Invalid format
      name: 'A', // Too short
      age: -5, // Negative
      extraField: 'not allowed' // Additional property
    };

    logger.info('   Validating valid user...');
    const validResult = await validator.validate('user', validUser);
    logger.info(`   Result: ${validResult.isValid ? '✅ Valid' : '❌ Invalid'}`);
    
    logger.info('   Validating invalid user...');
    const invalidResult = await validator.validate('user', invalidUser);
    logger.info(`   Result: ${invalidResult.isValid ? '✅ Valid' : '❌ Invalid'}`);
    logger.info(`   Errors: ${JSON.stringify(invalidResult.errors, null, 2)}\n`);

    // 5. Batch validation
    logger.info('5. Running batch validation...');
    const batchData = [
      { id: 'user001', email: 'alice@example.com', name: 'Alice Smith', age: 25 },
      { id: 'user002', email: 'bob@example.com', name: 'Bob Johnson', age: 35 },
      { id: 'invalid', email: 'bad-email', name: 'X' }, // Invalid
      { id: 'user003', email: 'charlie@example.com', name: 'Charlie Brown', age: 40 }
    ];

    const batchResults = await validator.validateBatch('user', batchData);
    const validCount = batchResults.filter(r => r.isValid).length;
    logger.info(`   Batch results: ${validCount}/${batchResults.length} valid\n`);

    // 6. Claude memory integration
    logger.info('6. Using Claude memory integration...');
    const memory = createMemoryManager({
      claude: {
        enabled: true,
        namespace: 'example-app'
      }
    });

    // Store validation results
    await memory.store('validation-summary', {
      totalValidated: batchResults.length,
      validCount: validCount,
      invalidCount: batchResults.length - validCount,
      timestamp: new Date().toISOString(),
      sampleData: validUser
    }, { ttl: 3600 });

    logger.info('   ✅ Validation results stored in memory\n');

    // 7. Run integrity checks
    logger.info('7. Running integrity checks...');
    const integrityReport = await engine.runIntegrityChecks();
    logger.info(`   Summary:`);
    logger.info(`     Total checks: ${integrityReport.summary.total}`);
    logger.info(`     Passed: ${integrityReport.summary.passed}`);
    logger.info(`     Failed: ${integrityReport.summary.failed}`);
    logger.info(`     Skipped: ${integrityReport.summary.skipped}\n`);

    // 8. Check for schema drift
    logger.info('8. Checking for schema drift...');
    const driftReport = await engine.checkSchemaDrift();
    logger.info(`   Has changes: ${driftReport.hasChanges}`);
    if (driftReport.hasChanges) {
      logger.info(`   Changes detected: ${JSON.stringify(driftReport.changes, null, 2)}`);
    }
    logger.info();

    // 9. Retrieve data from memory
    logger.info('9. Retrieving data from memory...');
    const storedData = await memory.retrieve('validation-summary');
    if (storedData) {
      logger.info(`   Retrieved: ${JSON.stringify(storedData, null, 2)}\n`);
    }

    // 10. Get memory statistics
    logger.info('10. Memory statistics...');
    const stats = await memory.getStats();
    logger.info(`    Total keys: ${stats.totalKeys}`);
    logger.info(`    Memory usage: ${stats.memoryUsage} bytes`);
    logger.info(`    Operations: ${JSON.stringify(stats.operations)}\n`);

    // Clean up
    await engine.shutdown();
    await memory.clear();

    logger.info('✅ Basic usage example completed successfully!');
    
  } catch (error) {
    logger.error('❌ Error in basic usage example:', error);
    process.exit(1);
  }
}

// Advanced usage examples
async function advancedUsageExample() {
  logger.info('\n🔬 Advanced Usage Examples');
  logger.info('===========================\n');

  try {
    // Custom validation rules
    logger.info('1. Custom validation rules...');
    const validator = new ValidationManager();
    
    // Add custom password strength rule
    validator.addCustomRule({
      name: 'strong-password',
      validator: (value) => {
        return value.length >= 8 && 
               /[A-Z]/.test(value) && 
               /[a-z]/.test(value) && 
               /[0-9]/.test(value) && 
               /[!@#$%^&*]/.test(value);
      },
      message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
    });

    const authSchema = {
      type: 'object',
      properties: {
        username: { type: 'string', minLength: 3 },
        password: { 
          type: 'string',
          'custom-rule': 'strong-password'
        }
      },
      required: ['username', 'password']
    };

    await validator.loadSchema('auth', authSchema);

    const weakAuth = { username: 'user', password: 'weak' };
    const strongAuth = { username: 'user', password: 'Strong123!' };

    const weakResult = await validator.validate('auth', weakAuth);
    const strongResult = await validator.validate('auth', strongAuth);

    logger.info(`   Weak password valid: ${weakResult.isValid}`);
    logger.info(`   Strong password valid: ${strongResult.isValid}\n`);

    // Schema evolution and migration
    logger.info('2. Schema evolution...');
    const engine = createIntegrityEngine();
    await engine.initialize();

    const originalSchema = {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' }
      }
    };

    const evolvedSchema = {
      type: 'object',
      properties: {
        fullName: { type: 'string' }, // Combined field
        email: { type: 'string', format: 'email' } // New field
      },
      required: ['fullName']
    };

    const schemaManager = engine.getSchemaManager();
    await schemaManager.loadSchema('person', originalSchema);

    const compatibility = await schemaManager.isCompatible('person', evolvedSchema);
    logger.info(`   Schema compatibility: ${compatibility.isCompatible}`);
    logger.info(`   Breaking changes: ${compatibility.breakingChanges.length}\n`);

    // Performance monitoring
    logger.info('3. Performance monitoring...');
    const startTime = Date.now();
    
    // Simulate bulk validation
    const bulkData = Array.from({ length: 1000 }, (_, i) => ({
      id: `user${i}`,
      email: `user${i}@example.com`,
      name: `User ${i}`
    }));

    await validator.loadSchema('bulk-user', {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string', format: 'email' },
        name: { type: 'string' }
      },
      required: ['id', 'email', 'name']
    });

    const bulkResults = await validator.validateBatch('bulk-user', bulkData);
    const duration = Date.now() - startTime;
    const throughput = bulkData.length / (duration / 1000);

    logger.info(`   Validated ${bulkData.length} records in ${duration}ms`);
    logger.info(`   Throughput: ${throughput.toFixed(0)} records/second\n`);

    await engine.shutdown();

    logger.info('✅ Advanced usage examples completed!');

  } catch (error) {
    logger.error('❌ Error in advanced usage example:', error);
  }
}

// Error handling examples
async function errorHandlingExample() {
  logger.info('\n⚠️  Error Handling Examples');
  logger.info('============================\n');

  try {
    // 1. Graceful handling of invalid configurations
    logger.info('1. Invalid configuration handling...');
    try {
      const engine = createIntegrityEngine('./non-existent-config.js');
      await engine.initialize();
    } catch (error) {
      logger.info(`   ✅ Caught configuration error: ${error.message}\n`);
    }

    // 2. Schema validation errors
    logger.info('2. Schema validation errors...');
    const validator = new ValidationManager();
    
    try {
      await validator.loadSchema('invalid', {
        type: 'invalid-type' // This will cause an error
      });
    } catch (error) {
      logger.info(`   ✅ Caught schema error: ${error.message}\n`);
    }

    // 3. Data validation error handling
    logger.info('3. Data validation error handling...');
    await validator.loadSchema('test', {
      type: 'object',
      properties: {
        name: { type: 'string' }
      },
      required: ['name']
    });

    const invalidData = { age: 25 }; // Missing required field
    const result = await validator.validate('test', invalidData);
    
    if (!result.isValid) {
      logger.info('   ✅ Validation failed as expected');
      logger.info(`   Errors: ${result.errors.map(e => e.message).join(', ')}\n`);
    }

    // 4. Memory operation error handling
    logger.info('4. Memory operation error handling...');
    const memory = createMemoryManager();
    
    try {
      // Try to store extremely large data
      const largeData = 'x'.repeat(1000000); // 1MB string
      await memory.store('large-key', largeData);
      logger.info('   Large data stored successfully');
    } catch (error) {
      logger.info(`   ✅ Caught memory error: ${error.message}`);
    }

    logger.info('\n✅ Error handling examples completed!');

  } catch (error) {
    logger.error('❌ Unexpected error in error handling example:', error);
  }
}

// Run all examples
async function runAllExamples() {
  await basicUsageExample();
  await advancedUsageExample();
  await errorHandlingExample();
  
  logger.info('\n🎉 All examples completed successfully!');
  logger.info('');
  logger.info('Next steps:');
  logger.info('- Customize schemas for your data models');
  logger.info('- Set up monitoring dashboard: npm run integrity:monitor');
  logger.info('- Integrate with your application framework');
  logger.info('- Set up automated integrity checks in CI/CD');
  logger.info('');
  logger.info('Documentation: https://github.com/warehouse-network/claude-db-integrity');
}

// Run if called directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}

module.exports = {
  basicUsageExample,
  advancedUsageExample,
  errorHandlingExample,
  runAllExamples
};