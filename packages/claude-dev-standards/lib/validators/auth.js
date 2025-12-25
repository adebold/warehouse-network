const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');

const authPatterns = {
  good: [
    // JWT patterns
    /jwt\.sign|jsonwebtoken/gi,
    /passport\.|passport-/gi,
    /express-jwt|koa-jwt/gi,
    /oauth|OAuth/gi,
    
    // Session management
    /express-session|koa-session/gi,
    /connect-redis|redis.*session/gi,
    
    // Security middleware
    /helmet|cors|bcrypt/gi,
    /argon2|scrypt|pbkdf2/gi
  ],
  bad: [
    // Hardcoded credentials
    /password\s*=\s*["'](?!process\.env|config)/gi,
    /secret\s*=\s*["'](?!process\.env|config)/gi,
    /api_key\s*=\s*["'](?!process\.env|config)/gi,
    
    // Weak patterns
    /users\s*=\s*\[.*{.*password.*}.*\]/gi,
    /hardcoded.*auth|dummy.*auth/gi,
    /test.*user.*password/gi
  ]
};

async function check(projectPath, config) {
  const errors = [];
  const warnings = [];
  const info = [];
  
  try {
    // Check for authentication implementation
    const authImplementations = {
      jwt: false,
      oauth: false,
      sessions: false,
      passwordHashing: false,
      middleware: false
    };
    
    // Find auth-related files
    const files = glob.sync('**/*.{js,ts,jsx,tsx}', {
      cwd: projectPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**', '**/*.test.*', '**/*.spec.*']
    });
    
    for (const file of files) {
      const filePath = path.join(projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Check for good auth patterns
      authPatterns.good.forEach(pattern => {
        if (pattern.test(content)) {
          if (/jwt|jsonwebtoken/i.test(pattern.source)) authImplementations.jwt = true;
          if (/oauth/i.test(pattern.source)) authImplementations.oauth = true;
          if (/session/i.test(pattern.source)) authImplementations.sessions = true;
          if (/bcrypt|argon2|scrypt|pbkdf2/i.test(pattern.source)) authImplementations.passwordHashing = true;
          if (/helmet|cors/i.test(pattern.source)) authImplementations.middleware = true;
        }
      });
      
      // Check for bad patterns
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        authPatterns.bad.forEach(pattern => {
          if (pattern.test(line)) {
            errors.push(`Potential security issue in ${file}:${index + 1} - ${line.trim().substring(0, 60)}...`);
          }
        });
      });
    }
    
    // Validate authentication setup
    const hasAuth = Object.values(authImplementations).some(v => v);
    if (!hasAuth) {
      errors.push('No authentication implementation detected');
      errors.push('Required: JWT, OAuth, or secure session management');
    } else {
      if (authImplementations.jwt) info.push('JWT authentication detected');
      if (authImplementations.oauth) info.push('OAuth implementation detected');
      if (authImplementations.sessions) info.push('Session management detected');
    }
    
    if (!authImplementations.passwordHashing) {
      warnings.push('No password hashing library detected (bcrypt, argon2, etc.)');
    }
    
    if (!authImplementations.middleware) {
      warnings.push('Security middleware not detected (helmet, cors)');
    }
    
    // Check for required environment variables
    const envVars = config.custom?.requiredEnvVars || [];
    const authEnvVars = envVars.filter(v => /JWT|SECRET|AUTH/i.test(v));
    if (authEnvVars.length === 0) {
      warnings.push('No authentication-related environment variables configured');
    }
    
    // Check for .env files in repository
    const envFiles = glob.sync('.env*', { cwd: projectPath, dot: true });
    const trackedEnvFiles = envFiles.filter(f => !f.includes('.example') && !f.includes('.sample'));
    if (trackedEnvFiles.length > 0) {
      errors.push(`Environment files should not be committed: ${trackedEnvFiles.join(', ')}`);
    }
    
    return {
      passed: errors.length === 0,
      errors,
      warnings,
      info
    };
    
  } catch (error) {
    return {
      passed: false,
      errors: [`Failed to check authentication: ${error.message}`],
      warnings,
      info
    };
  }
}

module.exports = { check };