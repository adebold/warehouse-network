// Recommended Claude Dev Standards configuration
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
    minTestCoverage: 80,
    requiredEnvVars: [
      'NODE_ENV',
      'PORT',
      'DATABASE_URL',
      'JWT_SECRET'
    ],
    forbiddenPatterns: [
      'console.log',
      'console.error',
      'TODO',
      'FIXME',
      '// @ts-ignore',
      'any as any'
    ],
    requiredFiles: [
      '.env.example',
      '.gitignore',
      'README.md',
      'package.json'
    ],
    databases: ['postgres', 'redis'],
    security: {
      headers: [
        'X-Frame-Options',
        'X-Content-Type-Options',
        'X-XSS-Protection',
        'Strict-Transport-Security',
        'Content-Security-Policy'
      ],
      rateLimit: {
        windowMs: 900000, // 15 minutes
        max: 100
      },
      cors: {
        credentials: true,
        maxAge: 86400
      }
    }
  },
  hooks: {
    preCommit: ['validate'],
    prePush: ['validate --strict'],
    postInstall: []
  }
};