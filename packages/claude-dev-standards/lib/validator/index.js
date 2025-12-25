const validators = require('../validators');
const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');

async function validate(projectPath, config) {
  const results = {
    passed: true,
    errors: [],
    warnings: [],
    info: [],
    fixable: [],
    summary: {}
  };
  
  // Run all enabled checks
  for (const [checkName, enabled] of Object.entries(config.checks)) {
    if (!enabled) continue;
    
    const validator = validators[checkName];
    if (!validator) {
      results.warnings.push(`Unknown check: ${checkName}`);
      continue;
    }
    
    try {
      const checkResult = await validator.check(projectPath, config);
      
      // Aggregate results
      if (checkResult.errors && checkResult.errors.length > 0) {
        results.errors.push(...checkResult.errors.map(e => `[${checkName}] ${e}`));
        results.passed = false;
      }
      
      if (checkResult.warnings && checkResult.warnings.length > 0) {
        results.warnings.push(...checkResult.warnings.map(w => `[${checkName}] ${w}`));
      }
      
      if (checkResult.info && checkResult.info.length > 0) {
        results.info.push(...checkResult.info.map(i => `[${checkName}] ${i}`));
      }
      
      // Collect fixable issues
      if (checkResult.fixable && checkResult.fixable.length > 0) {
        results.fixable.push(...checkResult.fixable);
      }
      
      results.summary[checkName] = {
        passed: checkResult.passed,
        errors: checkResult.errors?.length || 0,
        warnings: checkResult.warnings?.length || 0
      };
      
    } catch (error) {
      results.errors.push(`[${checkName}] Check failed: ${error.message}`);
      results.passed = false;
      results.summary[checkName] = {
        passed: false,
        errors: 1,
        warnings: 0
      };
    }
  }
  
  // Run custom validators if provided
  if (config.validators) {
    for (const [name, validator] of Object.entries(config.validators)) {
      try {
        const result = await validator(projectPath, config);
        if (result.errors) results.errors.push(...result.errors);
        if (result.warnings) results.warnings.push(...result.warnings);
        if (result.info) results.info.push(...result.info);
        if (!result.passed) results.passed = false;
      } catch (error) {
        results.errors.push(`[custom:${name}] ${error.message}`);
        results.passed = false;
      }
    }
  }
  
  // Check custom patterns
  if (config.custom.forbiddenPatterns && config.custom.forbiddenPatterns.length > 0) {
    const patternResults = await checkForbiddenPatterns(projectPath, config.custom.forbiddenPatterns);
    results.errors.push(...patternResults.errors);
    results.warnings.push(...patternResults.warnings);
    if (patternResults.errors.length > 0) results.passed = false;
  }
  
  // Check required files
  if (config.custom.requiredFiles && config.custom.requiredFiles.length > 0) {
    const fileResults = await checkRequiredFiles(projectPath, config.custom.requiredFiles);
    results.errors.push(...fileResults.errors);
    results.fixable.push(...fileResults.fixable);
    if (fileResults.errors.length > 0) results.passed = false;
  }
  
  // Add metadata
  results.metadata = {
    timestamp: new Date().toISOString(),
    projectPath: projectPath,
    configUsed: config
  };
  
  return results;
}

async function checkForbiddenPatterns(projectPath, patterns) {
  const results = { errors: [], warnings: [] };
  
  const files = glob.sync('**/*.{js,ts,jsx,tsx}', {
    cwd: projectPath,
    ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**']
  });
  
  for (const file of files) {
    const filePath = path.join(projectPath, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      patterns.forEach(pattern => {
        const regex = new RegExp(pattern, 'gi');
        if (regex.test(line)) {
          // Skip if in test file for some patterns
          if (file.includes('.test.') || file.includes('.spec.')) {
            results.warnings.push(`Forbidden pattern "${pattern}" in test file ${file}:${index + 1}`);
          } else {
            results.errors.push(`Forbidden pattern "${pattern}" found in ${file}:${index + 1}`);
          }
        }
      });
    });
  }
  
  return results;
}

async function checkRequiredFiles(projectPath, requiredFiles) {
  const results = { errors: [], fixable: [] };
  
  for (const file of requiredFiles) {
    const filePath = path.join(projectPath, file);
    const exists = await fs.exists(filePath);
    
    if (!exists) {
      results.errors.push(`Required file missing: ${file}`);
      
      // Some files can be auto-created
      if (file === '.env.example' || file === '.gitignore') {
        results.fixable.push({
          type: `missing-${file.replace('.', '')}`,
          file: file
        });
      }
    }
  }
  
  return results;
}

module.exports = {
  validate
};