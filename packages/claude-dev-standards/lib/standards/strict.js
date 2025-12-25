// Strict Claude Dev Standards configuration
module.exports = {
  projectType: 'auto',
  checks: {
    noMocks: true,
    realDatabase: true,
    authentication: true,
    errorHandling: true,
    logging: true,
    testing: true,
    docker: true,
    ci: true,
    security: true,
    monitoring: true
  },
  custom: {
    minTestCoverage: 90, // Higher coverage requirement
    requiredEnvVars: [
      'NODE_ENV',
      'PORT',
      'DATABASE_URL',
      'REDIS_URL',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'SESSION_SECRET',
      'CORS_ORIGIN',
      'LOG_LEVEL'
    ],
    forbiddenPatterns: [
      'console.log',
      'console.error',
      'console.warn',
      'console.info',
      'TODO',
      'FIXME',
      'HACK',
      'XXX',
      '// @ts-ignore',
      '// @ts-nocheck',
      '// eslint-disable',
      'any as any',
      'as any',
      ': any',
      'debugger',
      'alert\\(',
      'confirm\\(',
      'prompt\\('
    ],
    requiredFiles: [
      '.env.example',
      '.gitignore',
      'README.md',
      'package.json',
      'Dockerfile',
      'docker-compose.yml',
      '.github/workflows',
      'LICENSE',
      'CONTRIBUTING.md',
      'SECURITY.md'
    ],
    databases: ['postgres', 'redis'],
    security: {
      headers: [
        'X-Frame-Options',
        'X-Content-Type-Options',
        'X-XSS-Protection',
        'Strict-Transport-Security',
        'Content-Security-Policy',
        'X-Permitted-Cross-Domain-Policies',
        'Referrer-Policy',
        'Feature-Policy'
      ],
      rateLimit: {
        windowMs: 900000, // 15 minutes
        max: 50, // More restrictive
        skipSuccessfulRequests: false
      },
      cors: {
        credentials: true,
        maxAge: 86400,
        preflightContinue: false
      },
      csrf: {
        enabled: true
      },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      }
    }
  },
  hooks: {
    preCommit: ['validate --strict', 'test', 'lint'],
    prePush: ['validate --strict', 'test:coverage', 'security:audit'],
    postInstall: ['check all']
  }
};