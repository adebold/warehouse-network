/**
 * Example usage of claude-dev-standards as a library
 */

const { detectProjectType, validate, loadConfig } = require('claude-dev-standards');
const { logger } = require('../../../../../utils/logger');

async function example() {
  try {
    // Detect project type
    const projectType = await detectProjectType(process.cwd());
    logger.info(`Project type: ${projectType}`);
    
    // Load configuration
    const config = await loadConfig(process.cwd());
    logger.info('Configuration loaded:', config);
    
    // Run validation
    const results = await validate(process.cwd(), config);
    
    // Check results
    if (results.passed) {
      logger.info('✅ All checks passed!');
    } else {
      logger.info('❌ Validation failed:');
      results.errors.forEach(error => logger.info(`  - ${error}`));
    }
    
    // Access specific information
    logger.info(`\nSummary:`);
    logger.info(`  Errors: ${results.errors.length}`);
    logger.info(`  Warnings: ${results.warnings.length}`);
    logger.info(`  Auto-fixable: ${results.fixable?.length || 0}`);
    
  } catch (error) {
    logger.error('Error:', error.message);
  }
}

// Custom validator example
async function customValidatorExample() {
  const config = {
    extends: 'claude-dev-standards/recommended',
    validators: {
      customCheck: async (projectPath, config) => {
        // Your custom validation logic
        const errors = [];
        const warnings = [];
        
        // Example: Check for specific file
        const fs = require('fs-extra');
        const path = require('path');
        
        if (!await fs.exists(path.join(projectPath, 'ARCHITECTURE.md'))) {
          warnings.push('ARCHITECTURE.md file is recommended');
        }
        
        return {
          passed: errors.length === 0,
          errors,
          warnings
        };
      }
    }
  };
  
  const results = await validate(process.cwd(), config);
  logger.info('Custom validation results:', results);
}

// Run examples
if (require.main === module) {
  example().then(() => customValidatorExample());
}