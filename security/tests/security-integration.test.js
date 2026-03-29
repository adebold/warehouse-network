/**
 * Comprehensive integration tests for the security credential management system
 */

import { jest } from '@jest/globals';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import SecurityManager from '../src/index.js';
import { SecurePasswordGenerator } from '../src/crypto/password-generator.js';
import { SecureCredentialStorage } from '../src/storage/credential-storage.js';
import { SecurityValidator } from '../src/validation/security-validator.js';

describe('Security Integration Tests', () => {
  let securityManager;
  let tempDir;
  let testCredentials;

  beforeAll(async () => {
    // Create temporary directory for test files
    tempDir = path.join(process.cwd(), 'test-temp');
    await fs.mkdir(tempDir, { recursive: true });

    // Initialize security manager
    securityManager = new SecurityManager({
      environment: 'test',
      enableRotation: false, // Disable rotation for tests
      enableAuditLogging: true,
      auditOptions: {
        enableFileLogging: true,
        logDirectory: tempDir,
        enableCloudLogging: false
      },
      storageOptions: {
        maxFileSize: 1048576 // 1MB for tests
      }
    });

    await securityManager.initialize();

    // Test credentials for various scenarios
    testCredentials = {
      strongPassword: 'ComplexP@ssw0rd!2024#',
      weakPassword: 'password123',
      apiKey: 'ak_test_1234567890abcdef',
      encryptionKey: crypto.randomBytes(32).toString('base64')
    };
  });

  afterAll(async () => {
    // Cleanup temporary files
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch (error) {
      console.warn('Failed to cleanup temp directory:', error.message);
    }
  });

  describe('Password Generation', () => {
    test('should generate secure passwords with various options', async () => {
      const passwordGenerator = new SecurePasswordGenerator();

      // Standard password
      const standardResult = await passwordGenerator.generatePassword({
        type: 'standard',
        length: 16,
        includeSymbols: true
      });

      expect(standardResult.password).toHaveLength(16);
      expect(standardResult.metadata.entropy).toBeGreaterThan(50);
      expect(standardResult.metadata.compliance.enterprise).toBe(true);

      // Passphrase
      const passphraseResult = await passwordGenerator.generatePassword({
        type: 'passphrase',
        wordCount: 4,
        includeNumbers: true
      });

      expect(passphraseResult.password).toMatch(/\w+-\w+-\w+-\w+-\d+/);
      expect(passphraseResult.metadata.type).toBe('passphrase');

      // Alphanumeric only
      const alphanumericResult = await passwordGenerator.generatePassword({
        type: 'alphanumeric',
        length: 20
      });

      expect(alphanumericResult.password).toHaveLength(20);
      expect(alphanumericResult.password).toMatch(/^[A-Za-z0-9]+$/);

      // Hex password
      const hexResult = await passwordGenerator.generatePassword({
        type: 'hex',
        length: 32
      });

      expect(hexResult.password).toHaveLength(32);
      expect(hexResult.password).toMatch(/^[0-9a-f]+$/);
    });

    test('should generate API keys with proper format', async () => {
      const passwordGenerator = new SecurePasswordGenerator();

      const apiKeyResult = await passwordGenerator.generateApiKey({
        prefix: 'test_',
        length: 32
      });

      expect(apiKeyResult.apiKey).toMatch(/^test_[A-Za-z0-9_-]+$/);
      expect(apiKeyResult.metadata.type).toBe('api_key');
    });

    test('should generate encryption keys with proper metadata', async () => {
      const passwordGenerator = new SecurePasswordGenerator();

      const keyResult = await passwordGenerator.generateEncryptionKey('aes-256-gcm');

      expect(keyResult.key).toBeTruthy();
      expect(keyResult.iv).toBeTruthy();
      expect(keyResult.metadata.algorithm).toBe('aes-256-gcm');
      expect(keyResult.metadata.keyLength).toBe(32);
    });
  });

  describe('Credential Storage', () => {
    test('should store and retrieve credentials securely', async () => {
      const storage = new SecureCredentialStorage();
      const credentials = {
        database: {
          password: testCredentials.strongPassword,
          type: 'database_password'
        },
        api: {
          key: testCredentials.apiKey,
          type: 'api_key'
        }
      };

      const masterPassword = 'SecureMasterPassword123!';
      const filePath = path.join(tempDir, 'test-credentials.cred');

      // Store credentials
      const storeResult = await storage.storeCredentials(
        credentials,
        masterPassword,
        filePath
      );

      expect(storeResult.success).toBe(true);
      expect(storeResult.metadata.credentialCount).toBe(2);

      // Retrieve credentials
      const retrieveResult = await storage.retrieveCredentials(
        filePath,
        masterPassword
      );

      expect(retrieveResult.credentials.database.password).toBe(testCredentials.strongPassword);
      expect(retrieveResult.credentials.api.key).toBe(testCredentials.apiKey);
    });

    test('should fail with wrong master password', async () => {
      const storage = new SecureCredentialStorage();
      const credentials = { test: { value: 'test', type: 'test' } };
      const masterPassword = 'CorrectPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const filePath = path.join(tempDir, 'test-wrong-password.cred');

      // Store with correct password
      await storage.storeCredentials(credentials, masterPassword, filePath);

      // Try to retrieve with wrong password
      await expect(storage.retrieveCredentials(filePath, wrongPassword))
        .rejects.toThrow();
    });

    test('should update specific credentials', async () => {
      const storage = new SecureCredentialStorage();
      const credentials = {
        database: { password: 'oldPassword', type: 'database' }
      };
      const masterPassword = 'MasterPassword123!';
      const filePath = path.join(tempDir, 'test-update.cred');

      // Store initial credentials
      await storage.storeCredentials(credentials, masterPassword, filePath);

      // Update credential
      const newValue = { password: 'newPassword', type: 'database' };
      const updateResult = await storage.updateCredential(
        filePath,
        masterPassword,
        'database',
        newValue
      );

      expect(updateResult.success).toBe(true);

      // Verify update
      const retrieveResult = await storage.retrieveCredentials(filePath, masterPassword);
      expect(retrieveResult.credentials.database.password).toBe('newPassword');
      expect(retrieveResult.credentials.database.version).toBe(2);
    });
  });

  describe('Security Validation', () => {
    test('should validate password strength correctly', async () => {
      const validator = new SecurityValidator();

      // Strong password
      const strongValidation = await validator.validatePasswordStrength(testCredentials.strongPassword);
      expect(strongValidation.isValid).toBe(true);
      expect(strongValidation.strength).toBeGreaterThanOrEqual(4);
      expect(strongValidation.entropy).toBeGreaterThan(60);

      // Weak password
      const weakValidation = await validator.validatePasswordStrength(testCredentials.weakPassword);
      expect(weakValidation.isValid).toBe(false);
      expect(weakValidation.errors.length).toBeGreaterThan(0);
    });

    test('should validate encryption configurations', async () => {
      const validator = new SecurityValidator();

      // Valid configuration
      const validConfig = {
        algorithm: 'aes-256-gcm',
        keyLength: 256
      };
      const validResult = await validator.validateEncryptionConfig(validConfig);
      expect(validResult.isValid).toBe(true);

      // Invalid configuration
      const invalidConfig = {
        algorithm: 'des-56-ecb', // Weak algorithm
        keyLength: 56
      };
      const invalidResult = await validator.validateEncryptionConfig(invalidConfig);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });

    test('should detect security issues in secrets', async () => {
      const validator = new SecurityValidator();

      // Secure secret
      const secureSecret = crypto.randomBytes(32).toString('base64');
      const secureResult = await validator.validateSecretSecurity(secureSecret);
      expect(secureResult.isSecure).toBe(true);
      expect(secureResult.riskLevel).toBe('low');

      // Potentially exposed secret (fake Stripe key)
      const exposedSecret = 'sk_test_' + crypto.randomBytes(16).toString('hex');
      const exposedResult = await validator.validateSecretSecurity(exposedSecret);
      expect(exposedResult.isSecure).toBe(false);
      expect(exposedResult.riskLevel).toBe('medium');
      expect(exposedResult.issues).toContain('Stripe test key detected');
    });

    test('should validate system health', async () => {
      const validator = new SecurityValidator();

      const healthResult = await validator.validateSystemHealth();
      expect(healthResult.isHealthy).toBe(true);
      expect(healthResult.checks.memory.status).toBe('healthy');
      expect(healthResult.checks.filesystem.status).toBe('healthy');
    });
  });

  describe('Full Integration', () => {
    test('should generate complete credential set with compliance validation', async () => {
      const credentialConfig = {
        includePassword: true,
        includeApiKey: true,
        includeEncryptionKey: true,
        storeLocally: true,
        masterPassword: 'IntegrationTestMaster123!',
        filePath: path.join(tempDir, 'integration-test.cred'),
        passwordOptions: {
          type: 'standard',
          length: 20,
          includeSymbols: true
        },
        apiKeyOptions: {
          prefix: 'int_',
          length: 32
        }
      };

      const result = await securityManager.generateSecureCredentials(credentialConfig);

      // Verify all credentials were generated
      expect(result.credentials.password).toBeTruthy();
      expect(result.credentials.apiKey).toBeTruthy();
      expect(result.credentials.encryptionKey).toBeTruthy();

      // Verify metadata
      expect(result.metadata.password.strength).toBeGreaterThanOrEqual(4);
      expect(result.metadata.apiKey.type).toBe('api_key');
      expect(result.metadata.encryptionKey.algorithm).toBe('aes-256-gcm');

      // Verify local storage
      expect(result.metadata.localStorage.success).toBe(true);

      // Verify compliance
      expect(result.metadata.compliance.overall).toBe('compliant');
    });

    test('should handle credential retrieval from different sources', async () => {
      // Store test credentials locally
      const credentials = {
        test: { value: 'testValue', type: 'test' }
      };
      const masterPassword = 'RetrievalTestMaster123!';
      const filePath = path.join(tempDir, 'retrieval-test.cred');

      await securityManager.credentialStorage.storeCredentials(
        credentials,
        masterPassword,
        filePath
      );

      // Retrieve from local storage
      const localResult = await securityManager.retrieveCredentials(
        'local',
        'test',
        { filePath, masterPassword }
      );

      expect(localResult.credentials.test.value).toBe('testValue');
    });

    test('should generate comprehensive security report', async () => {
      const reportOptions = {
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        endDate: new Date()
      };

      const report = await securityManager.generateSecurityReport(reportOptions);

      expect(report.reportId).toBeTruthy();
      expect(report.systemHealth).toBeTruthy();
      expect(report.systemHealth.isHealthy).toBe(true);
      expect(report.complianceSummary).toBeTruthy();
      expect(report.complianceSummary.standards.nist).toBe('compliant');
    });

    test('should test complete security configuration', async () => {
      const configTest = await securityManager.testSecurityConfiguration();

      expect(configTest.overall).toMatch(/passed|partial/);
      expect(configTest.details.passwordGeneration).toBe(true);
      expect(configTest.details.encryption).toBe(true);
      expect(configTest.details.validation).toBe(true);
      expect(configTest.details.auditLogging).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid password generation options', async () => {
      const passwordGenerator = new SecurePasswordGenerator();

      await expect(passwordGenerator.generatePassword({
        type: 'standard',
        length: 0 // Invalid length
      })).rejects.toThrow();
    });

    test('should handle corrupted credential files', async () => {
      const storage = new SecureCredentialStorage();
      const corruptedFilePath = path.join(tempDir, 'corrupted.cred');

      // Create corrupted file
      await fs.writeFile(corruptedFilePath, 'corrupted data');

      await expect(storage.retrieveCredentials(
        corruptedFilePath,
        'password'
      )).rejects.toThrow();
    });

    test('should validate non-existent credential access', async () => {
      const validator = new SecurityValidator();

      const accessResult = await validator.validateCredentialAccess('non-existent');
      expect(accessResult.hasAccess).toBe(false);
    });

    test('should handle uninitialized security manager', async () => {
      const uninitializedManager = new SecurityManager();

      await expect(uninitializedManager.generateSecureCredentials({}))
        .rejects.toThrow('SecurityManager must be initialized');
    });
  });

  describe('Performance and Security Benchmarks', () => {
    test('password generation performance', async () => {
      const passwordGenerator = new SecurePasswordGenerator();
      const iterations = 100;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        await passwordGenerator.generatePassword({
          type: 'standard',
          length: 16
        });
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      // Should generate passwords quickly (under 10ms average)
      expect(avgTime).toBeLessThan(10);
    });

    test('encryption/decryption performance', async () => {
      const storage = new SecureCredentialStorage();
      const credentials = {
        perf: { value: 'x'.repeat(1000), type: 'test' } // 1KB of data
      };
      const masterPassword = 'PerfTestMaster123!';
      const filePath = path.join(tempDir, 'perf-test.cred');
      const iterations = 50;

      // Encryption performance
      const encStartTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        const testPath = path.join(tempDir, `perf-${i}.cred`);
        await storage.storeCredentials(credentials, masterPassword, testPath);
      }
      const encEndTime = performance.now();
      const avgEncTime = (encEndTime - encStartTime) / iterations;

      // Decryption performance
      const decStartTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        const testPath = path.join(tempDir, `perf-${i}.cred`);
        await storage.retrieveCredentials(testPath, masterPassword);
      }
      const decEndTime = performance.now();
      const avgDecTime = (decEndTime - decStartTime) / iterations;

      // Should encrypt/decrypt reasonably quickly
      expect(avgEncTime).toBeLessThan(100); // Under 100ms average
      expect(avgDecTime).toBeLessThan(50);  // Under 50ms average

      // Cleanup performance test files
      for (let i = 0; i < iterations; i++) {
        try {
          await fs.unlink(path.join(tempDir, `perf-${i}.cred`));
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });

    test('entropy validation for generated credentials', async () => {
      const passwordGenerator = new SecurePasswordGenerator();
      const entropies = [];

      // Generate multiple passwords and check entropy distribution
      for (let i = 0; i < 50; i++) {
        const result = await passwordGenerator.generatePassword({
          type: 'standard',
          length: 16,
          includeSymbols: true
        });
        entropies.push(result.metadata.entropy);
      }

      // All should have high entropy
      const lowEntropyCount = entropies.filter(e => e < 70).length;
      expect(lowEntropyCount).toBe(0);

      // Entropy should vary (not all identical)
      const uniqueEntropies = new Set(entropies).size;
      expect(uniqueEntropies).toBeGreaterThan(1);
    });
  });
});