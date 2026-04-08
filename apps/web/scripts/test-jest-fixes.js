#!/usr/bin/env node

/**
 * Test Jest Configuration Fixes Validation Script
 * Validates the Jest configuration fixes and environment separation
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🔧 Validating Jest Configuration Fixes...\n');

const runCommand = (command, args, env = {}) => {
  return new Promise((resolve, reject) => {
    console.log(`\n📋 Running: ${command} ${args.join(' ')}`);

    const child = spawn(command, args, {
      stdio: 'inherit',
      env: { ...process.env, ...env },
      cwd: process.cwd()
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${command} completed successfully\n`);
        resolve();
      } else {
        console.log(`❌ ${command} failed with code ${code}\n`);
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    child.on('error', (error) => {
      console.error(`❌ Failed to start ${command}:`, error);
      reject(error);
    });
  });
};

const validateTests = async () => {
  try {
    console.log('1️⃣ Testing API Tests (Node environment)...');
    await runCommand('npx', ['jest', '--testNamePattern="API Tests"', '--verbose'], {
      NODE_ENV: 'test',
      TEST_TYPE: 'unit'
    });

    console.log('2️⃣ Testing specific register API test...');
    await runCommand('npx', ['jest', 'tests/api/auth/register.test.ts', '--verbose'], {
      NODE_ENV: 'test',
      TEST_TYPE: 'unit'
    });

    console.log('3️⃣ Checking Jest configuration syntax...');
    await runCommand('npx', ['jest', '--showConfig']);

    console.log('4️⃣ Running all tests to check environment separation...');
    await runCommand('npx', ['jest', '--passWithNoTests'], {
      NODE_ENV: 'test',
      TEST_TYPE: 'unit'
    });

    console.log('\n🎉 All Jest configuration tests passed!');
    console.log('\n✅ Key fixes validated:');
    console.log('   - Environment separation (jsdom vs node)');
    console.log('   - Proper Prisma mock handling');
    console.log('   - Setup file imports');
    console.log('   - Transform configurations');

  } catch (error) {
    console.error('\n💥 Test validation failed:', error.message);
    console.log('\n🔍 Check the following:');
    console.log('   - Jest configuration syntax');
    console.log('   - Setup file paths');
    console.log('   - Mock imports');
    console.log('   - Environment variables');
    process.exit(1);
  }
};

// Run validation
validateTests().catch(console.error);