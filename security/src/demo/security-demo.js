/**
 * Security system demonstration script
 * Shows all major features of the credential management system
 */

import SecurityManager from '../index.js';
import { SecurePasswordGenerator } from '../crypto/password-generator.js';
import { SecurityValidator } from '../validation/security-validator.js';
import fs from 'fs/promises';
import path from 'path';

async function demonstrateSecurityFeatures() {
  console.log('🔐 Security Credential Management System Demo');
  console.log('='.repeat(50));

  try {
    // 1. Password Generation Demo
    console.log('\n1. 🔑 Password Generation');
    console.log('-'.repeat(30));

    const passwordGenerator = new SecurePasswordGenerator();

    // Generate various types of passwords
    const standardPassword = await passwordGenerator.generatePassword({
      type: 'standard',
      length: 16,
      includeSymbols: true
    });

    const passphrase = await passwordGenerator.generatePassword({
      type: 'passphrase',
      wordCount: 4,
      includeNumbers: true
    });

    const apiKey = await passwordGenerator.generateApiKey({
      prefix: 'demo_',
      length: 32
    });

    console.log(`Standard Password: ${standardPassword.password}`);
    console.log(`  Entropy: ${standardPassword.metadata.entropy.toFixed(1)} bits`);
    console.log(`  Strength: ${standardPassword.metadata.strength}/5`);

    console.log(`\nPassphrase: ${passphrase.password}`);
    console.log(`  Words: ${passphrase.metadata.wordCount}`);

    console.log(`\nAPI Key: ${apiKey.apiKey}`);
    console.log(`  Format: ${apiKey.metadata.format}`);

    // 2. Security Validation Demo
    console.log('\n\n2. 🛡️ Security Validation');
    console.log('-'.repeat(30));

    const validator = new SecurityValidator();

    // Validate password strength
    const strongValidation = await validator.validatePasswordStrength(standardPassword.password);
    const weakValidation = await validator.validatePasswordStrength('password123');

    console.log(`Strong Password Validation:`);
    console.log(`  Valid: ${strongValidation.isValid}`);
    console.log(`  Strength: ${strongValidation.strength}/5`);
    console.log(`  Entropy: ${strongValidation.entropy.toFixed(1)} bits`);

    console.log(`\nWeak Password Validation:`);
    console.log(`  Valid: ${weakValidation.isValid}`);
    console.log(`  Errors: ${weakValidation.errors.join(', ')}`);

    // Validate encryption configuration
    const encryptionValidation = await validator.validateEncryptionConfig({
      algorithm: 'aes-256-gcm',
      keyLength: 256
    });

    console.log(`\nEncryption Config Validation:`);
    console.log(`  Valid: ${encryptionValidation.isValid}`);

    // 3. System Health Check
    console.log('\n\n3. 🏥 System Health Check');
    console.log('-'.repeat(30));

    const healthCheck = await validator.validateSystemHealth();

    console.log(`System Health: ${healthCheck.isHealthy ? '✅ Healthy' : '❌ Issues'}`);
    console.log(`Memory Status: ${healthCheck.checks.memory.status}`);
    console.log(`Memory Usage: ${healthCheck.checks.memory.usage.toFixed(1)}%`);
    console.log(`Filesystem: ${healthCheck.checks.filesystem.status}`);

    // 4. Security Manager Integration Demo
    console.log('\n\n4. 🔗 Security Manager Integration');
    console.log('-'.repeat(40));

    // Create temporary directory for demo
    const demoDir = path.join(process.cwd(), 'demo-temp');
    await fs.mkdir(demoDir, { recursive: true });

    const securityManager = new SecurityManager({
      environment: 'demo',
      enableRotation: false,
      enableAuditLogging: true,
      auditOptions: {
        enableFileLogging: true,
        logDirectory: demoDir,
        enableCloudLogging: false,
        enableConsoleLogging: true
      }
    });

    await securityManager.initialize();
    console.log('✅ Security Manager initialized');

    // Generate complete credential set
    const credentialSet = await securityManager.generateSecureCredentials({
      includePassword: true,
      includeApiKey: true,
      includeEncryptionKey: true,
      storeLocally: true,
      masterPassword: 'DemoMasterPassword123!',
      filePath: path.join(demoDir, 'demo-credentials.cred'),
      passwordOptions: {
        type: 'standard',
        length: 20,
        includeSymbols: true
      }
    });

    console.log('\n✅ Complete credential set generated:');
    console.log(`  Password strength: ${credentialSet.metadata.password.strength}/5`);
    console.log(`  API key format: ${credentialSet.metadata.apiKey.format}`);
    console.log(`  Encryption algorithm: ${credentialSet.metadata.encryptionKey.algorithm}`);
    console.log(`  Local storage: ${credentialSet.metadata.localStorage.success ? '✅' : '❌'}`);
    console.log(`  Compliance status: ${credentialSet.metadata.compliance.overall}`);

    // 5. Configuration Test
    console.log('\n\n5. 🧪 Configuration Test');
    console.log('-'.repeat(30));

    const configTest = await securityManager.testSecurityConfiguration();

    console.log(`Configuration Test: ${configTest.overall === 'passed' ? '✅ Passed' : '⚠️ Partial'}`);
    console.log(`  Password Generation: ${configTest.details.passwordGeneration ? '✅' : '❌'}`);
    console.log(`  Encryption: ${configTest.details.encryption ? '✅' : '❌'}`);
    console.log(`  Validation: ${configTest.details.validation ? '✅' : '❌'}`);
    console.log(`  Audit Logging: ${configTest.details.auditLogging ? '✅' : '❌'}`);
    console.log(`  Tests Passed: ${configTest.passed}/${configTest.total}`);

    // 6. Performance Benchmark
    console.log('\n\n6. ⚡ Performance Benchmark');
    console.log('-'.repeat(30));

    const iterations = 10;

    // Password generation performance
    const passwordStartTime = performance.now();
    for (let i = 0; i < iterations; i++) {
      await passwordGenerator.generatePassword({ type: 'standard', length: 16 });
    }
    const passwordEndTime = performance.now();
    const avgPasswordTime = (passwordEndTime - passwordStartTime) / iterations;

    // Encryption performance
    const encryptionStartTime = performance.now();
    for (let i = 0; i < iterations; i++) {
      await securityManager.credentialStorage.storeCredentials(
        { test: { value: 'test-value', type: 'test' } },
        'TestPassword123!',
        path.join(demoDir, `perf-test-${i}.cred`)
      );
    }
    const encryptionEndTime = performance.now();
    const avgEncryptionTime = (encryptionEndTime - encryptionStartTime) / iterations;

    console.log(`Password Generation: ${avgPasswordTime.toFixed(2)}ms average`);
    console.log(`Encryption: ${avgEncryptionTime.toFixed(2)}ms average`);

    // 7. Security Standards Compliance
    console.log('\n\n7. 📋 Compliance Standards');
    console.log('-'.repeat(30));

    const complianceReport = await securityManager.generateComplianceSummary();

    console.log('Compliance Status:');
    Object.entries(complianceReport.standards).forEach(([standard, status]) => {
      const icon = status === 'compliant' ? '✅' : '❌';
      console.log(`  ${standard.toUpperCase()}: ${icon} ${status}`);
    });

    // Cleanup
    console.log('\n\n8. 🧹 Cleanup');
    console.log('-'.repeat(20));

    try {
      await fs.rmdir(demoDir, { recursive: true });
      console.log('✅ Demo files cleaned up');
    } catch (error) {
      console.log('⚠️ Some demo files may remain in demo-temp/');
    }

    console.log('\n🎉 Security demonstration completed successfully!');
    console.log('\nKey Features Demonstrated:');
    console.log('  • Cryptographically secure password generation');
    console.log('  • Enterprise-grade encryption and storage');
    console.log('  • Comprehensive security validation');
    console.log('  • System health monitoring');
    console.log('  • Performance optimization');
    console.log('  • Compliance standards adherence');
    console.log('  • Integrated security management');

  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the demonstration
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateSecurityFeatures()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { demonstrateSecurityFeatures };