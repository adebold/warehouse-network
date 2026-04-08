#!/usr/bin/env node

/**
 * Authentication Test Validation Script
 * Validates authentication tests in both mocked and integration modes
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test validation results
const results = {
  unitTests: { status: 'pending', output: '', errors: '' },
  integrationTests: { status: 'pending', output: '', errors: '' },
  configValidation: { status: 'pending', output: '', errors: '' }
};

// Helper function to run shell commands
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      shell: true,
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr
      });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

// Validate Jest configuration
async function validateJestConfig() {
  console.log('🔍 Validating Jest configuration...');

  try {
    const configPath = path.join(__dirname, '..', 'jest.config.js');
    if (!fs.existsSync(configPath)) {
      throw new Error('Jest configuration file not found');
    }

    const result = await runCommand('npx', ['jest', '--showConfig'], {
      cwd: path.join(__dirname, '..')
    });

    if (result.code === 0) {
      results.configValidation.status = 'passed';
      results.configValidation.output = 'Jest configuration is valid';
    } else {
      results.configValidation.status = 'failed';
      results.configValidation.errors = result.stderr;
    }
  } catch (error) {
    results.configValidation.status = 'failed';
    results.configValidation.errors = error.message;
  }
}

// Run unit tests (mocked)
async function runUnitTests() {
  console.log('🧪 Running unit tests (mocked mode)...');

  try {
    const result = await runCommand('npx', [
      'jest',
      '--selectProjects=API Tests',
      '--testNamePattern=register',
      '--bail=1',
      '--verbose',
      '--testTimeout=10000'
    ], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_TYPE: 'unit'
      }
    });

    if (result.code === 0) {
      results.unitTests.status = 'passed';
      results.unitTests.output = result.stdout;
    } else {
      results.unitTests.status = 'failed';
      results.unitTests.output = result.stdout;
      results.unitTests.errors = result.stderr;
    }
  } catch (error) {
    results.unitTests.status = 'failed';
    results.unitTests.errors = error.message;
  }
}

// Run integration tests (real database)
async function runIntegrationTests() {
  console.log('🗄️  Running integration tests (real database)...');

  try {
    const result = await runCommand('npx', [
      'jest',
      '--selectProjects=API Tests',
      '--testNamePattern=register',
      '--bail=1',
      '--verbose',
      '--testTimeout=30000'
    ], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TEST_TYPE: 'integration',
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/warehouse_test'
      }
    });

    if (result.code === 0) {
      results.integrationTests.status = 'passed';
      results.integrationTests.output = result.stdout;
    } else {
      results.integrationTests.status = 'failed';
      results.integrationTests.output = result.stdout;
      results.integrationTests.errors = result.stderr;
    }
  } catch (error) {
    results.integrationTests.status = 'failed';
    results.integrationTests.errors = error.message;
  }
}

// Generate validation report
function generateReport() {
  console.log('\n📊 Authentication Test Validation Report');
  console.log('=' .repeat(50));

  console.log('\n🔧 Jest Configuration:');
  console.log(`Status: ${results.configValidation.status}`);
  if (results.configValidation.errors) {
    console.log(`Errors: ${results.configValidation.errors}`);
  }

  console.log('\n🧪 Unit Tests (Mocked):');
  console.log(`Status: ${results.unitTests.status}`);
  if (results.unitTests.output) {
    console.log('Output:', results.unitTests.output.substring(0, 500) + '...');
  }
  if (results.unitTests.errors) {
    console.log('Errors:', results.unitTests.errors.substring(0, 500) + '...');
  }

  console.log('\n🗄️  Integration Tests (Real DB):');
  console.log(`Status: ${results.integrationTests.status}`);
  if (results.integrationTests.output) {
    console.log('Output:', results.integrationTests.output.substring(0, 500) + '...');
  }
  if (results.integrationTests.errors) {
    console.log('Errors:', results.integrationTests.errors.substring(0, 500) + '...');
  }

  console.log('\n📈 Summary:');
  const totalTests = 3;
  const passedTests = Object.values(results).filter(r => r.status === 'passed').length;
  console.log(`Passed: ${passedTests}/${totalTests}`);

  if (passedTests === totalTests) {
    console.log('✅ All authentication tests are working correctly!');
    return true;
  } else {
    console.log('❌ Some authentication tests need attention.');
    return false;
  }
}

// Main validation function
async function main() {
  console.log('🚀 Starting Authentication Test Validation');
  console.log('Agent ID: test-validator-agent-1775563562413');
  console.log('Coordination: ruv-swarm hierarchical topology');

  try {
    // Step 1: Validate Jest configuration
    await validateJestConfig();

    // Step 2: Run unit tests
    await runUnitTests();

    // Step 3: Run integration tests
    await runIntegrationTests();

    // Step 4: Generate report
    const success = generateReport();

    // Exit with appropriate code
    process.exit(success ? 0 : 1);

  } catch (error) {
    console.error('❌ Validation failed with error:', error.message);
    process.exit(1);
  }
}

// Run the validation
if (require.main === module) {
  main();
}

module.exports = { main, results };