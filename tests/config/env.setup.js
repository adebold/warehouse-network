// Environment setup for tests
process.env.NODE_ENV = 'test'

// Database configuration for testing
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/skidspace_test'

// NextAuth configuration
process.env.NEXTAUTH_SECRET = 'test-secret-key-for-testing-only'
process.env.NEXTAUTH_URL = 'http://localhost:3000'

// OAuth providers (mock credentials)
process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret'
process.env.GITHUB_CLIENT_ID = 'mock-github-client-id'
process.env.GITHUB_CLIENT_SECRET = 'mock-github-client-secret'

// Redis configuration for session storage
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1'

// Email service configuration
process.env.EMAIL_SERVER_USER = 'test@example.com'
process.env.EMAIL_SERVER_PASSWORD = 'test-password'
process.env.EMAIL_SERVER_HOST = 'smtp.example.com'
process.env.EMAIL_SERVER_PORT = '587'
process.env.EMAIL_FROM = 'noreply@skidspace.com'

// Rate limiting configuration
process.env.RATE_LIMIT_MAX = '1000'
process.env.RATE_LIMIT_WINDOW_MS = '900000'

// Security configuration
process.env.BCRYPT_ROUNDS = '4' // Lower for faster testing
process.env.JWT_EXPIRE_TIME = '1h'
process.env.SESSION_MAX_AGE = '86400'

// Feature flags
process.env.ENABLE_MFA = 'true'
process.env.ENABLE_AUDIT_LOGGING = 'true'
process.env.ENABLE_RATE_LIMITING = 'false' // Disable for testing

// Tenant configuration
process.env.DEFAULT_TENANT_ID = 'test-tenant'
process.env.SUPER_ADMIN_EMAIL = 'admin@skidspace.com'

console.log('Test environment configured with mock credentials and settings')