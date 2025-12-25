// Minimal Claude Dev Standards configuration
module.exports = {
  projectType: 'auto',
  checks: {
    noMocks: true,
    realDatabase: true,
    authentication: false, // Optional for minimal
    errorHandling: true,
    logging: true,
    testing: false, // Optional for minimal
    docker: false, // Optional for minimal
    ci: false, // Optional for minimal
    security: true,
    monitoring: false // Optional for minimal
  },
  custom: {
    minTestCoverage: 60, // Lower requirement
    requiredEnvVars: [
      'NODE_ENV',
      'DATABASE_URL'
    ],
    forbiddenPatterns: [
      'console.log', // Still no console.log in production
      'eval\\(',
      'debugger'
    ],
    requiredFiles: [
      '.gitignore',
      'README.md',
      'package.json'
    ],
    databases: [], // No specific requirement
    security: {
      headers: [
        'X-Frame-Options',
        'X-Content-Type-Options'
      ],
      rateLimit: {
        windowMs: 900000,
        max: 200 // More permissive
      }
    }
  },
  hooks: {
    preCommit: ['validate'],
    prePush: [],
    postInstall: []
  }
};