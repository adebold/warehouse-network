const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');

const securityPackages = [
  'helmet', // Security headers
  'express-rate-limit', // Rate limiting
  'express-mongo-sanitize', // NoSQL injection prevention
  'xss-clean', // XSS prevention
  'hpp', // HTTP parameter pollution
  'cors', // CORS
  'csurf', // CSRF protection
  'express-validator', // Input validation
  'joi', // Schema validation
  'bcrypt', // Password hashing
  'argon2', // Password hashing
  'jsonwebtoken', // JWT
  'dotenv', // Environment variables
  'crypto' // Built-in crypto
];

const vulnerabilityPatterns = [
  {
    pattern: /eval\s*\(/g,
    message: 'eval() usage detected - potential code injection risk'
  },
  {
    pattern: /new Function\s*\(/g,
    message: 'new Function() detected - potential code injection risk'
  },
  {
    pattern: /innerHTML\s*=/g,
    message: 'innerHTML assignment detected - potential XSS risk'
  },
  {
    pattern: /document\.write/g,
    message: 'document.write detected - potential XSS risk'
  },
  {
    pattern: /SQL.*\+.*['"]/g,
    message: 'String concatenation in SQL query - potential SQL injection'
  },
  {
    pattern: /exec\s*\(|spawn\s*\(/g,
    message: 'Command execution detected - validate and sanitize inputs'
  },
  {
    pattern: /readFileSync.*\+|readFile.*\+/g,
    message: 'Dynamic file path - potential directory traversal'
  },
  {
    pattern: /createReadStream.*\+/g,
    message: 'Dynamic file streaming - validate file paths'
  },
  {
    pattern: /require\s*\(.*\+/g,
    message: 'Dynamic require - potential security risk'
  }
];

const securityHeaders = [
  'X-Frame-Options',
  'X-Content-Type-Options',
  'X-XSS-Protection',
  'Strict-Transport-Security',
  'Content-Security-Policy'
];

async function check(projectPath, config) {
  const errors = [];
  const warnings = [];
  const info = [];
  
  try {
    // Check for security packages
    const packageJsonPath = path.join(projectPath, 'package.json');
    const installedSecurityPackages = [];
    
    if (await fs.exists(packageJsonPath)) {
      const packageJson = await fs.readJSON(packageJsonPath);
      const allDeps = {
        ...packageJson.dependencies || {},
        ...packageJson.devDependencies || {}
      };
      
      securityPackages.forEach(pkg => {
        if (pkg in allDeps) {
          installedSecurityPackages.push(pkg);
        }
      });
      
      if (installedSecurityPackages.length > 0) {
        info.push(`Security packages detected: ${installedSecurityPackages.join(', ')}`);
      }
      
      // Check critical security packages
      if (!installedSecurityPackages.includes('helmet')) {
        warnings.push('helmet not installed - security headers may be missing');
      }
      
      if (!installedSecurityPackages.includes('bcrypt') && 
          !installedSecurityPackages.includes('argon2')) {
        errors.push('No secure password hashing library detected (bcrypt or argon2)');
      }
      
      if (!installedSecurityPackages.some(pkg => pkg.includes('rate-limit'))) {
        warnings.push('No rate limiting package detected');
      }
    }
    
    // Scan for security vulnerabilities
    const files = glob.sync('**/*.{js,ts,jsx,tsx}', {
      cwd: projectPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**']
    });
    
    const vulnerabilities = [];
    
    for (const file of files) {
      const filePath = path.join(projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        vulnerabilityPatterns.forEach(({ pattern, message }) => {
          if (pattern.test(line)) {
            vulnerabilities.push({
              file: file,
              line: index + 1,
              message: message,
              code: line.trim()
            });
          }
        });
      });
    }
    
    if (vulnerabilities.length > 0) {
      errors.push(`Found ${vulnerabilities.length} potential security vulnerability(ies)`);
      
      // Group by type and show examples
      const grouped = {};
      vulnerabilities.forEach(vuln => {
        if (!grouped[vuln.message]) {
          grouped[vuln.message] = [];
        }
        grouped[vuln.message].push(vuln);
      });
      
      Object.entries(grouped).forEach(([message, vulns]) => {
        errors.push(`  ${message} (${vulns.length} occurrence(s))`);
        // Show first example
        const first = vulns[0];
        errors.push(`    ${first.file}:${first.line} - ${first.code.substring(0, 50)}...`);
      });
    }
    
    // Check for HTTPS/TLS
    const httpPatterns = [
      /http:\/\//g,
      /createServer\s*\(/g,
      /listen\s*\(\s*80/g
    ];
    
    let hasInsecureHttp = false;
    for (const file of files) {
      const content = await fs.readFile(path.join(projectPath, file), 'utf-8');
      
      if (httpPatterns.some(pattern => pattern.test(content))) {
        hasInsecureHttp = true;
        break;
      }
    }
    
    if (hasInsecureHttp) {
      warnings.push('Insecure HTTP usage detected - use HTTPS in production');
    }
    
    // Check for environment variables usage
    const envPatterns = [
      /process\.env\./g,
      /import\.meta\.env/g
    ];
    
    let usesEnvVars = false;
    for (const file of files.slice(0, 20)) {
      const content = await fs.readFile(path.join(projectPath, file), 'utf-8');
      
      if (envPatterns.some(pattern => pattern.test(content))) {
        usesEnvVars = true;
        break;
      }
    }
    
    if (usesEnvVars) {
      info.push('Environment variables usage detected');
      
      // Check for .env in gitignore
      const gitignorePath = path.join(projectPath, '.gitignore');
      if (await fs.exists(gitignorePath)) {
        const gitignore = await fs.readFile(gitignorePath, 'utf-8');
        if (!gitignore.includes('.env')) {
          errors.push('.env file not in .gitignore - secrets may be exposed');
        }
      }
    }
    
    // Check for security headers configuration
    const headerPatterns = securityHeaders.map(header => 
      new RegExp(header.replace('-', '[-\\s]?'), 'gi')
    );
    
    let securityHeadersConfigured = 0;
    for (const file of files) {
      const content = await fs.readFile(path.join(projectPath, file), 'utf-8');
      
      headerPatterns.forEach((pattern, index) => {
        if (pattern.test(content)) {
          securityHeadersConfigured++;
        }
      });
      
      if (securityHeadersConfigured >= 3) break;
    }
    
    if (securityHeadersConfigured === 0) {
      errors.push('No security headers configuration detected');
      errors.push('Use helmet or configure security headers manually');
    } else if (securityHeadersConfigured < 3) {
      warnings.push('Limited security headers detected - ensure all headers are configured');
    } else {
      info.push('Security headers configuration detected');
    }
    
    // Check for input validation
    const validationPatterns = [
      /validate|validator|validation/i,
      /sanitize|sanitizer/i,
      /joi\..*validate/i,
      /express-validator/i
    ];
    
    let hasValidation = false;
    for (const file of files.slice(0, 30)) {
      const content = await fs.readFile(path.join(projectPath, file), 'utf-8');
      
      if (validationPatterns.some(pattern => pattern.test(content))) {
        hasValidation = true;
        break;
      }
    }
    
    if (!hasValidation) {
      warnings.push('No input validation detected - validate all user inputs');
    } else {
      info.push('Input validation detected');
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
      errors: [`Failed to check security: ${error.message}`],
      warnings,
      info
    };
  }
}

module.exports = { check };