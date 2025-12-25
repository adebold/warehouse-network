/**
 * Example usage of claude-dev-standards as a library
 */

const { detectProjectType, validate, loadConfig } = require('claude-dev-standards');

async function example() {
  try {
    // Detect project type
    const projectType = await detectProjectType(process.cwd());
    console.log(`Project type: ${projectType}`);
    
    // Load configuration
    const config = await loadConfig(process.cwd());
    console.log('Configuration loaded:', config);
    
    // Run validation
    const results = await validate(process.cwd(), config);
    
    // Check results
    if (results.passed) {
      console.log('✅ All checks passed!');
    } else {
      console.log('❌ Validation failed:');
      results.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    // Access specific information
    console.log(`\nSummary:`);
    console.log(`  Errors: ${results.errors.length}`);
    console.log(`  Warnings: ${results.warnings.length}`);
    console.log(`  Auto-fixable: ${results.fixable?.length || 0}`);
    
  } catch (error) {
    console.error('Error:', error.message);
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
  console.log('Custom validation results:', results);
}

// Run examples
if (require.main === module) {
  example().then(() => customValidatorExample());
}