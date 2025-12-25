const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');

const loggingLibraries = [
  'winston',
  'pino',
  'bunyan',
  'log4js',
  'morgan',
  'debug'
];

const badLoggingPatterns = [
  /console\.(log|error|warn|info)/g,
  /process\.stdout\.write/g,
  /process\.stderr\.write/g
];

const structuredLoggingPatterns = [
  /logger\.(info|error|warn|debug)\s*\({/,
  /\.log\s*\({.*level:/,
  /structured.*log/i,
  /json.*log/i
];

async function check(projectPath, config) {
  const errors = [];
  const warnings = [];
  const info = [];
  const fixable = [];
  
  try {
    // Check for logging library in dependencies
    const packageJsonPath = path.join(projectPath, 'package.json');
    let hasLoggingLibrary = false;
    
    if (await fs.exists(packageJsonPath)) {
      const packageJson = await fs.readJSON(packageJsonPath);
      const allDeps = {
        ...packageJson.dependencies || {},
        ...packageJson.devDependencies || {}
      };
      
      hasLoggingLibrary = loggingLibraries.some(lib => lib in allDeps);
      
      if (hasLoggingLibrary) {
        const foundLibs = loggingLibraries.filter(lib => lib in allDeps);
        info.push(`Logging library detected: ${foundLibs.join(', ')}`);
      } else {
        errors.push('No structured logging library detected');
        errors.push('Install winston, pino, or similar: npm install winston');
      }
    }
    
    // Check for console.log usage in production code
    const files = glob.sync('**/*.{js,ts,jsx,tsx}', {
      cwd: projectPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**', '**/*.test.*', '**/*.spec.*']
    });
    
    let consoleLogCount = 0;
    const consoleLogLocations = [];
    
    for (const file of files) {
      const filePath = path.join(projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        badLoggingPatterns.forEach(pattern => {
          const matches = line.match(pattern);
          if (matches) {
            consoleLogCount++;
            consoleLogLocations.push({
              file: file,
              line: index + 1,
              content: line.trim()
            });
          }
        });
      });
    }
    
    if (consoleLogCount > 0) {
      errors.push(`Found ${consoleLogCount} console.log usage(s) in production code`);
      
      // Show first few examples
      consoleLogLocations.slice(0, 3).forEach(location => {
        errors.push(`  ${location.file}:${location.line} - ${location.content.substring(0, 50)}...`);
      });
      
      if (consoleLogLocations.length > 3) {
        errors.push(`  ... and ${consoleLogLocations.length - 3} more`);
      }
      
      // Mark as fixable
      fixable.push({
        type: 'console-log',
        locations: consoleLogLocations
      });
    }
    
    // Check for structured logging
    let hasStructuredLogging = false;
    for (const file of files.slice(0, 20)) { // Check first 20 files for performance
      const content = await fs.readFile(path.join(projectPath, file), 'utf-8');
      
      if (structuredLoggingPatterns.some(pattern => pattern.test(content))) {
        hasStructuredLogging = true;
        break;
      }
    }
    
    if (!hasStructuredLogging && hasLoggingLibrary) {
      warnings.push('Structured logging pattern not detected');
      warnings.push('Use logger.info({ message, userId, action }) instead of logger.info(string)');
    } else if (hasStructuredLogging) {
      info.push('Structured logging detected');
    }
    
    // Check for log configuration
    const logConfigFiles = [
      'logger.js',
      'logger.ts',
      'logging.js',
      'logging.ts',
      'config/logger.js',
      'config/logging.js',
      'src/logger.js',
      'src/utils/logger.js',
      'lib/logger.js'
    ];
    
    let hasLogConfig = false;
    for (const configFile of logConfigFiles) {
      if (await fs.exists(path.join(projectPath, configFile))) {
        hasLogConfig = true;
        info.push(`Logger configuration found: ${configFile}`);
        break;
      }
    }
    
    if (!hasLogConfig && hasLoggingLibrary) {
      warnings.push('No logger configuration file found');
      warnings.push('Create a centralized logger configuration');
    }
    
    // Check for correlation ID / request ID
    const correlationPatterns = [
      /correlation.?id/i,
      /request.?id/i,
      /trace.?id/i,
      /x-request-id/i
    ];
    
    let hasCorrelationId = false;
    for (const file of files.slice(0, 20)) {
      const content = await fs.readFile(path.join(projectPath, file), 'utf-8');
      
      if (correlationPatterns.some(pattern => pattern.test(content))) {
        hasCorrelationId = true;
        break;
      }
    }
    
    if (!hasCorrelationId) {
      warnings.push('No correlation/request ID implementation detected');
      warnings.push('Consider adding request IDs for distributed tracing');
    } else {
      info.push('Correlation/request ID implementation detected');
    }
    
    return {
      passed: errors.length === 0,
      errors,
      warnings,
      info,
      fixable
    };
    
  } catch (error) {
    return {
      passed: false,
      errors: [`Failed to check logging: ${error.message}`],
      warnings,
      info
    };
  }
}

module.exports = { check };