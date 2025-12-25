const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');

const testFrameworks = {
  javascript: ['jest', 'mocha', 'vitest', 'jasmine', 'ava', 'tape'],
  python: ['pytest', 'unittest', 'nose2'],
  go: ['testing', 'testify'],
  java: ['junit', 'testng'],
  ruby: ['rspec', 'minitest']
};

const testFilePatterns = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/test/**/*',
  '**/tests/**/*',
  '**/__tests__/**/*',
  '**/test_*.py',
  '**/*_test.go'
];

async function check(projectPath, config) {
  const errors = [];
  const warnings = [];
  const info = [];
  
  try {
    // Detect project type
    const projectType = await detectProjectType(projectPath);
    const relevantFrameworks = testFrameworks[projectType] || testFrameworks.javascript;
    
    // Check for test framework
    let hasTestFramework = false;
    let detectedFramework = null;
    
    if (projectType === 'javascript') {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.exists(packageJsonPath)) {
        const packageJson = await fs.readJSON(packageJsonPath);
        const allDeps = {
          ...packageJson.dependencies || {},
          ...packageJson.devDependencies || {}
        };
        
        for (const framework of relevantFrameworks) {
          if (framework in allDeps) {
            hasTestFramework = true;
            detectedFramework = framework;
            break;
          }
        }
        
        // Check test script
        if (packageJson.scripts && packageJson.scripts.test) {
          const testScript = packageJson.scripts.test;
          if (testScript === 'echo "Error: no test specified" && exit 1') {
            warnings.push('Default test script detected - no actual tests configured');
          } else {
            info.push(`Test script configured: ${testScript}`);
          }
        } else {
          warnings.push('No test script defined in package.json');
        }
      }
    }
    
    if (hasTestFramework) {
      info.push(`Test framework detected: ${detectedFramework}`);
    } else {
      errors.push(`No test framework detected. Install one of: ${relevantFrameworks.join(', ')}`);
    }
    
    // Count test files
    const testFiles = [];
    for (const pattern of testFilePatterns) {
      const files = glob.sync(pattern, {
        cwd: projectPath,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**']
      });
      testFiles.push(...files);
    }
    
    const uniqueTestFiles = [...new Set(testFiles)];
    
    if (uniqueTestFiles.length === 0) {
      errors.push('No test files found');
      errors.push('Create test files matching patterns: *.test.*, *.spec.*, or in test/ directory');
    } else {
      info.push(`Found ${uniqueTestFiles.length} test file(s)`);
    }
    
    // Check for test coverage configuration
    const coverageFiles = [
      '.nycrc',
      '.nycrc.json',
      'jest.config.js',
      'jest.config.json',
      'vitest.config.js',
      'coverage/**'
    ];
    
    let hasCoverageConfig = false;
    for (const file of coverageFiles) {
      const filePath = path.join(projectPath, file);
      if (await fs.exists(filePath)) {
        hasCoverageConfig = true;
        break;
      }
    }
    
    // Check package.json for coverage config
    if (projectType === 'javascript' && !hasCoverageConfig) {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.exists(packageJsonPath)) {
        const packageJson = await fs.readJSON(packageJsonPath);
        if (packageJson.jest?.collectCoverage || packageJson.nyc) {
          hasCoverageConfig = true;
        }
      }
    }
    
    if (!hasCoverageConfig) {
      warnings.push('No test coverage configuration detected');
      warnings.push('Configure coverage reporting for your test framework');
    } else {
      info.push('Test coverage configuration detected');
    }
    
    // Check minimum coverage threshold
    const minCoverage = config.custom?.minTestCoverage || 80;
    const coverageReportPath = path.join(projectPath, 'coverage', 'coverage-summary.json');
    
    if (await fs.exists(coverageReportPath)) {
      try {
        const coverageReport = await fs.readJSON(coverageReportPath);
        const totalCoverage = coverageReport.total;
        
        if (totalCoverage) {
          const avgCoverage = (
            totalCoverage.lines.pct +
            totalCoverage.statements.pct +
            totalCoverage.functions.pct +
            totalCoverage.branches.pct
          ) / 4;
          
          if (avgCoverage < minCoverage) {
            warnings.push(`Test coverage (${avgCoverage.toFixed(1)}%) is below minimum threshold (${minCoverage}%)`);
          } else {
            info.push(`Test coverage: ${avgCoverage.toFixed(1)}%`);
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    // Check for E2E tests
    const e2ePatterns = [
      '**/e2e/**/*',
      '**/cypress/**/*',
      '**/playwright/**/*',
      '**/*.e2e.*'
    ];
    
    let hasE2ETests = false;
    for (const pattern of e2ePatterns) {
      const files = glob.sync(pattern, {
        cwd: projectPath,
        ignore: ['node_modules/**']
      });
      
      if (files.length > 0) {
        hasE2ETests = true;
        info.push(`End-to-end tests detected: ${files.length} file(s)`);
        break;
      }
    }
    
    if (!hasE2ETests) {
      warnings.push('No end-to-end tests detected');
      warnings.push('Consider adding E2E tests with Cypress, Playwright, or similar');
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
      errors: [`Failed to check testing: ${error.message}`],
      warnings,
      info
    };
  }
}

async function detectProjectType(projectPath) {
  if (await fs.exists(path.join(projectPath, 'package.json'))) {
    return 'javascript';
  } else if (await fs.exists(path.join(projectPath, 'requirements.txt')) ||
             await fs.exists(path.join(projectPath, 'setup.py'))) {
    return 'python';
  } else if (await fs.exists(path.join(projectPath, 'go.mod'))) {
    return 'go';
  } else if (await fs.exists(path.join(projectPath, 'pom.xml')) ||
             await fs.exists(path.join(projectPath, 'build.gradle'))) {
    return 'java';
  } else if (await fs.exists(path.join(projectPath, 'Gemfile'))) {
    return 'ruby';
  }
  
  return 'unknown';
}

module.exports = { check };