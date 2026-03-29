# Enterprise Security Credential Management System

A comprehensive, enterprise-grade security system for credential generation, storage, rotation, and management with GCP integration.

## 🔐 Features

### Core Security Features
- **Cryptographically Secure Password Generation** - NIST SP 800-63B compliant
- **Enterprise-Grade Encryption** - AES-256-GCM with secure key derivation
- **GCP Secret Manager Integration** - Full lifecycle management
- **Automated Credential Rotation** - Configurable schedules and emergency rotation
- **Comprehensive Audit Logging** - SOC 2 compliant with real-time monitoring
- **Security Validation Framework** - Enterprise compliance standards

### Compliance Standards
- ✅ **NIST SP 800-63B** - Password and authentication guidelines
- ✅ **ISO 27001:2022** - Information security management
- ✅ **SOC 2 Type II** - Security, availability, and confidentiality
- ✅ **GDPR** - Data protection and privacy
- 🔄 **PCI DSS 4.0** - Payment card industry standards (configurable)

## 🚀 Quick Start

### Installation

```bash
npm install @warehouse-network/security
```

### Basic Usage

```javascript
import SecurityManager from '@warehouse-network/security';

// Initialize security manager
const securityManager = new SecurityManager({
  environment: 'production',
  projectId: 'your-gcp-project',
  enableRotation: true,
  enableAuditLogging: true
});

await securityManager.initialize();

// Generate secure credentials
const credentials = await securityManager.generateSecureCredentials({
  includePassword: true,
  includeApiKey: true,
  includeEncryptionKey: true,
  storeInGCP: true,
  enableRotation: true,
  passwordOptions: {
    type: 'standard',
    length: 20,
    includeSymbols: true
  }
});

console.log('Secure credentials generated:', credentials.metadata);
```

## 📋 Components

### 1. Password Generator
Cryptographically secure password generation with multiple formats:

```javascript
import { SecurePasswordGenerator } from '@warehouse-network/security';

const generator = new SecurePasswordGenerator();

// Standard complex password
const password = await generator.generatePassword({
  type: 'standard',
  length: 16,
  includeSymbols: true
});

// Passphrase
const passphrase = await generator.generatePassword({
  type: 'passphrase',
  wordCount: 4,
  includeNumbers: true
});

// API key
const apiKey = await generator.generateApiKey({
  prefix: 'prod_',
  length: 32
});
```

### 2. Credential Storage
Encrypted local storage with integrity verification:

```javascript
import { SecureCredentialStorage } from '@warehouse-network/security';

const storage = new SecureCredentialStorage();

// Store credentials
await storage.storeCredentials(
  credentials,
  masterPassword,
  './secure-credentials.enc'
);

// Retrieve credentials
const retrieved = await storage.retrieveCredentials(
  './secure-credentials.enc',
  masterPassword
);
```

### 3. GCP Secret Manager
Enterprise integration with Google Cloud:

```javascript
import { GCPSecretManager } from '@warehouse-network/security';

const secretManager = new GCPSecretManager({
  projectId: 'your-project-id'
});

// Create secret
const result = await secretManager.createSecret(
  'database-password',
  securePassword,
  {
    rotationEnabled: true,
    labels: { environment: 'production' }
  }
);
```

### 4. Credential Rotation
Automated rotation with configurable policies:

```javascript
import { CredentialRotationManager } from '@warehouse-network/security';

const rotationManager = new CredentialRotationManager();

// Schedule rotation
await rotationManager.scheduleRotation({
  credentialId: 'db-password-prod',
  type: 'database_password',
  interval: '30d',
  gracePeriod: '7d',
  notifications: ['security@company.com']
});

// Emergency rotation
await rotationManager.emergencyRotation(
  'compromised-api-key',
  'Security incident - potential exposure'
);
```

### 5. Security Validation
Comprehensive compliance and security checks:

```javascript
import { SecurityValidator } from '@warehouse-network/security';

const validator = new SecurityValidator();

// Validate password strength
const validation = await validator.validatePasswordStrength(password);
console.log('Password strength:', validation.strength);
console.log('Compliance:', validation.compliance);

// Validate encryption config
const encryptionValidation = await validator.validateEncryptionConfig({
  algorithm: 'aes-256-gcm',
  keyLength: 256
});
```

### 6. Audit Logging
Enterprise-grade logging and monitoring:

```javascript
import { AuditLogger } from '@warehouse-network/security';

const auditLogger = new AuditLogger({
  enableCloudLogging: true,
  enableFileLogging: true,
  projectId: 'your-project-id'
});

// Security operations are automatically logged
// Generate audit reports
const report = await auditLogger.generateAuditReport({
  startDate: new Date('2024-01-01'),
  endDate: new Date()
});
```

## 🛡️ Security Features

### Password Generation
- **Cryptographic Security**: Uses Node.js crypto.randomBytes()
- **Entropy Calculation**: Shannon entropy with minimum thresholds
- **Pattern Detection**: Prevents common password patterns
- **Compliance Validation**: NIST SP 800-63B requirements
- **Multiple Formats**: Standard, passphrase, hex, base64, alphanumeric

### Encryption
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Derivation**: scrypt with configurable parameters
- **Integrity**: HMAC verification and checksum validation
- **Forward Secrecy**: Unique IV/nonce for each operation
- **Memory Protection**: Secure buffer handling

### Access Control
- **Principle of Least Privilege**: Minimal required permissions
- **Multi-Factor Authentication**: TOTP, WebAuthn, SMS support
- **Session Management**: Configurable timeouts and limits
- **Rate Limiting**: Protection against abuse
- **Anomaly Detection**: Suspicious pattern identification

### Audit & Compliance
- **Structured Logging**: JSON format with correlation IDs
- **Real-time Monitoring**: Immediate alerts for security events
- **Compliance Reporting**: Automated SOC 2, ISO 27001 reports
- **Forensic Logging**: Tamper-proof audit trails
- **Retention Policies**: Configurable data retention

## 🔧 Configuration

### Environment Variables

```bash
# GCP Configuration
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# Security Settings
SECURITY_ENVIRONMENT=production
SECURITY_LOG_LEVEL=info
SECURITY_AUDIT_RETENTION=2557440000  # 7 years in milliseconds

# Encryption Settings
SECURITY_MASTER_KEY_ID=projects/your-project/locations/global/keyRings/security/cryptoKeys/master
```

### Security Policies

Configure security policies in `config/security-policies.json`:

```json
{
  "passwordPolicies": {
    "enterprise": {
      "minLength": 14,
      "minEntropy": 70,
      "maxAge": "90d",
      "complexityScore": 4
    }
  },
  "rotationPolicies": {
    "apiKeys": {
      "interval": "30d",
      "gracePeriod": "7d"
    }
  }
}
```

## 📊 Monitoring & Alerting

### Security Metrics
- Password generation rates and entropy distribution
- Credential access patterns and anomalies
- Rotation success/failure rates
- Compliance score trends
- System health and performance

### Alerts
- **High Severity**: Unauthorized access attempts, failed rotations
- **Medium Severity**: Policy violations, unusual patterns
- **Low Severity**: System warnings, maintenance notifications

### Dashboards
- Real-time security operations dashboard
- Compliance status monitoring
- Performance metrics and trends
- Incident response tracking

## 🧪 Testing

### Run Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Security tests
npm run test:security

# Performance tests
npm run test:performance
```

### Security Testing

The system includes comprehensive security tests:
- Cryptographic strength validation
- Encryption/decryption verification
- Access control testing
- Compliance requirement verification
- Performance benchmarking

## 🚨 Security Considerations

### Production Deployment
1. **Key Management**: Use GCP KMS for key encryption
2. **Network Security**: Deploy in private VPC with restricted access
3. **Monitoring**: Enable comprehensive logging and alerting
4. **Backup**: Implement secure backup and recovery procedures
5. **Updates**: Regular security updates and vulnerability scanning

### Threat Model
- **Internal Threats**: Privilege escalation, data exfiltration
- **External Threats**: Brute force, credential stuffing, MITM
- **Infrastructure**: Container escapes, supply chain attacks
- **Operational**: Misconfiguration, human error, social engineering

## 📚 API Reference

### SecurityManager

The main interface for all security operations.

#### Methods

##### `initialize()`
Initialize the security manager and all components.

##### `generateSecureCredentials(config)`
Generate a complete set of secure credentials.

**Parameters:**
- `config.includePassword` (boolean) - Generate password
- `config.includeApiKey` (boolean) - Generate API key
- `config.includeEncryptionKey` (boolean) - Generate encryption key
- `config.storeInGCP` (boolean) - Store in GCP Secret Manager
- `config.storeLocally` (boolean) - Store in encrypted local file
- `config.enableRotation` (boolean) - Enable automatic rotation

##### `retrieveCredentials(source, identifier, options)`
Retrieve stored credentials from various sources.

##### `emergencyRotateCredentials(credentialId, reason)`
Immediately rotate credentials in emergency situations.

##### `generateSecurityReport(options)`
Generate comprehensive security audit report.

##### `testSecurityConfiguration()`
Validate entire security configuration and connectivity.

### SecurePasswordGenerator

Cryptographically secure password generation.

#### Methods

##### `generatePassword(options)`
Generate password with specified options.

**Options:**
- `type` - Password type: 'standard', 'passphrase', 'alphanumeric', 'hex', 'base64'
- `length` - Password length (8-128)
- `includeUppercase` - Include uppercase letters
- `includeLowercase` - Include lowercase letters
- `includeNumbers` - Include numbers
- `includeSymbols` - Include special characters
- `excludeAmbiguous` - Exclude ambiguous characters

##### `generateApiKey(options)`
Generate API key with optional prefix.

##### `generateEncryptionKey(algorithm)`
Generate encryption key for specified algorithm.

##### `generateSalt(length)`
Generate cryptographic salt.

### Additional Components

See individual component documentation for detailed API reference:
- [Credential Storage API](./api/credential-storage.md)
- [GCP Secret Manager API](./api/gcp-secret-manager.md)
- [Rotation Manager API](./api/rotation-manager.md)
- [Security Validator API](./api/security-validator.md)
- [Audit Logger API](./api/audit-logger.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push branch: `git push origin feature/new-feature`
5. Submit a pull request

### Development Guidelines
- Follow security-first development practices
- Write comprehensive tests for all security features
- Document security implications of changes
- Follow code style guidelines and linting rules
- Security review required for all changes

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [https://docs.warehouse-network.com/security](https://docs.warehouse-network.com/security)
- **Issues**: [GitHub Issues](https://github.com/warehouse-network/security/issues)
- **Security Reports**: security@warehouse-network.com (PGP key available)
- **Enterprise Support**: enterprise@warehouse-network.com

---

**⚠️ Security Notice**: This is a security-critical component. Always follow security best practices and conduct thorough security reviews before production deployment.