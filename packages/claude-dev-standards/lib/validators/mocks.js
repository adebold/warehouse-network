const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');

const mockPatterns = [
  // Database mocks
  /mockDB|inMemoryDB|fakeDatabase/gi,
  /createMockDatabase|mockRepository/gi,
  /__mocks__\/.*db/gi,
  
  // Auth mocks
  /mockUser|fakeUser|testUser/gi,
  /hardcodedUsers|dummyAuth/gi,
  /mockAuth|fakeAuth/gi,
  
  // API mocks
  /mockAPI|stubAPI|fakeAPI/gi,
  /nock\(|sinon\.stub/gi,
  /jest\.mock\(/gi,
  
  // Service mocks
  /mockService|fakeService/gi,
  /\.mock\(\)|\.stub\(\)/gi
];

const allowedPatterns = [
  // Test files are allowed to use mocks
  /\.(test|spec)\.(js|ts|jsx|tsx)$/,
  /__tests__\//,
  /test\//,
  /tests\//
];

async function check(projectPath, config) {
  const errors = [];
  const warnings = [];
  const info = [];
  
  try {
    // Find all source files
    const files = glob.sync('**/*.{js,ts,jsx,tsx,py,go,java}', {
      cwd: projectPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**']
    });
    
    let mockCount = 0;
    const mockLocations = [];
    
    for (const file of files) {
      const filePath = path.join(projectPath, file);
      
      // Skip test files
      if (allowedPatterns.some(pattern => pattern.test(file))) {
        continue;
      }
      
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        mockPatterns.forEach(pattern => {
          if (pattern.test(line)) {
            mockCount++;
            mockLocations.push({
              file: file,
              line: index + 1,
              content: line.trim(),
              pattern: pattern.toString()
            });
          }
        });
      });
    }
    
    // Report findings
    if (mockCount > 0) {
      errors.push(`Found ${mockCount} mock usage(s) in production code`);
      
      // Add first few locations as examples
      mockLocations.slice(0, 5).forEach(location => {
        errors.push(`  ${location.file}:${location.line} - ${location.content.substring(0, 60)}...`);
      });
      
      if (mockLocations.length > 5) {
        errors.push(`  ... and ${mockLocations.length - 5} more`);
      }
    } else {
      info.push('No mock usage detected in production code');
    }
    
    // Check for mock dependencies in package.json
    if (await fs.exists(path.join(projectPath, 'package.json'))) {
      const packageJson = await fs.readJSON(path.join(projectPath, 'package.json'));
      const dependencies = packageJson.dependencies || {};
      
      const mockDeps = Object.keys(dependencies).filter(dep => 
        /mock|fake|stub|dummy/i.test(dep)
      );
      
      if (mockDeps.length > 0) {
        warnings.push(`Found mock-like dependencies: ${mockDeps.join(', ')}`);
        warnings.push('Consider moving these to devDependencies if they are for testing only');
      }
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
      errors: [`Failed to check mocks: ${error.message}`],
      warnings,
      info
    };
  }
}

module.exports = { check };