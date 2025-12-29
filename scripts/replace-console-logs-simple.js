#!/usr/bin/env node

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
import { logger } from './utils/logger';

// Directories to skip
const SKIP_DIRS = [
  'node_modules',
  '.next',
  'dist',
  'build',
  '.git',
  'coverage',
  '.cache',
  'out',
  '.turbo',
  '.swarm',
  '.claude-flow'
];

// File extensions to process
const VALID_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs'];

// Regex patterns for console statements
const CONSOLE_PATTERNS = [
  {
    pattern: /console\.log\s*\(/g,
    replacement: 'logger.info(',
    type: 'log'
  },
  {
    pattern: /console\.error\s*\(/g,
    replacement: 'logger.error(',
    type: 'error'
  },
  {
    pattern: /console\.warn\s*\(/g,
    replacement: 'logger.warn(',
    type: 'warn'
  },
  {
    pattern: /console\.debug\s*\(/g,
    replacement: 'logger.debug(',
    type: 'debug'
  },
  {
    pattern: /console\.info\s*\(/g,
    replacement: 'logger.info(',
    type: 'info'
  }
];

// Check if path should be skipped
function shouldSkipPath(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  for (const dir of SKIP_DIRS) {
    if (normalizedPath.includes(`/${dir}/`) || normalizedPath.includes(`/${dir}\\`)) {
      return true;
    }
  }
  
  return false;
}

// Check if logger is already imported
function hasLoggerImport(content) {
  const importPatterns = [
    /import\s+{[^}]*logger[^}]*}\s+from\s+['"][^'"]+logger['"]/,
    /const\s+{[^}]*logger[^}]*}\s+=\s+require\s*\(['"][^'"]+logger['"]\)/,
    /import\s+logger\s+from\s+['"][^'"]+logger['"]/,
    /const\s+logger\s+=\s+require\s*\(['"][^'"]+logger['"]\)/
  ];
  
  return importPatterns.some(pattern => pattern.test(content));
}

// Determine the correct logger import path
function getLoggerImportPath(filePath) {
  const dir = path.dirname(filePath);
  
  // Check if we're in a package
  if (filePath.includes('/packages/')) {
    // For packages, use relative path to utils/logger
    const packageMatch = filePath.match(/\/packages\/[^\/]+/);
    if (packageMatch) {
      const packageRoot = packageMatch[0];
      const fromPackageRoot = filePath.substring(packageRoot.length + 1);
      const depth = fromPackageRoot.split('/').length - 1;
      const prefix = '../'.repeat(depth);
      return prefix + 'utils/logger';
    }
  }
  
  // For root src files
  if (filePath.includes('/src/')) {
    const fromSrc = filePath.substring(filePath.indexOf('/src/') + 5);
    const depth = fromSrc.split('/').length - 1;
    if (depth === 0) {
      return './utils/logger';
    } else {
      return '../'.repeat(depth) + 'utils/logger';
    }
  }
  
  return './utils/logger';
}

// Add logger import to file content
function addLoggerImport(content, filePath) {
  const ext = path.extname(filePath);
  const loggerPath = getLoggerImportPath(filePath);
  
  let importStatement;
  if (ext === '.js' || ext === '.cjs' || ext === '.mjs') {
    // Check if file uses ES modules
    if (content.includes('export ') || content.includes('import ')) {
      importStatement = `import { logger } from '${loggerPath}';`;
    } else {
      importStatement = `const { logger } = require('${loggerPath}');`;
    }
  } else {
    // TypeScript files use import
    importStatement = `import { logger } from '${loggerPath}';`;
  }
  
  // Find where to insert the import
  const lines = content.split('\n');
  let insertIndex = 0;
  let lastImportIndex = -1;
  
  // Look for existing imports
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip shebang, comments, and use strict
    if (line.startsWith('#!') || 
        line.startsWith('//') || 
        line.startsWith('/*') || 
        line === "'use strict';" ||
        line === '"use strict";') {
      continue;
    }
    
    // If we find an import or require
    if (line.includes('import ') || line.includes('require(')) {
      lastImportIndex = i;
    } else if (lastImportIndex >= 0 && line.length > 0) {
      // We've passed all imports
      insertIndex = lastImportIndex + 1;
      break;
    }
  }
  
  // Insert the import
  if (lastImportIndex >= 0) {
    lines.splice(lastImportIndex + 1, 0, importStatement);
  } else {
    // No imports found, add at the beginning after any header comments
    let firstCodeLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length > 0 && 
          !line.startsWith('#!') && 
          !line.startsWith('//') && 
          !line.startsWith('/*') &&
          line !== "'use strict';" &&
          line !== '"use strict";') {
        firstCodeLine = i;
        break;
      }
    }
    lines.splice(firstCodeLine, 0, importStatement + '\n');
  }
  
  return lines.join('\n');
}

// Process a single file
async function processFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    const originalContent = content;
    let hasConsoleStatements = false;
    const replacements = [];
    
    // Check for console statements
    for (const consolePattern of CONSOLE_PATTERNS) {
      const matches = content.match(consolePattern.pattern);
      if (matches && matches.length > 0) {
        hasConsoleStatements = true;
        replacements.push({
          type: consolePattern.type,
          count: matches.length
        });
      }
    }
    
    if (!hasConsoleStatements) {
      return null;
    }
    
    // Replace console statements
    for (const consolePattern of CONSOLE_PATTERNS) {
      content = content.replace(consolePattern.pattern, consolePattern.replacement);
    }
    
    // Add logger import if needed
    if (!hasLoggerImport(content)) {
      content = addLoggerImport(content, filePath);
    }
    
    // Write back the file
    await fs.writeFile(filePath, content, 'utf8');
    
    return {
      file: filePath,
      replacements
    };
  } catch (error) {
    logger.error(`Error processing file ${filePath}:`, error.message);
    return null;
  }
}

// Walk directory recursively
async function walkDirectory(dir, fileCallback) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (shouldSkipPath(fullPath)) {
      continue;
    }
    
    if (entry.isDirectory()) {
      await walkDirectory(fullPath, fileCallback);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (VALID_EXTENSIONS.includes(ext)) {
        await fileCallback(fullPath);
      }
    }
  }
}

// Create logger utilities
async function createLoggerUtility(packagePath, isTypeScript) {
  const utilsPath = path.join(packagePath, 'src', 'utils');
  await fs.mkdir(utilsPath, { recursive: true });
  
  const loggerPath = path.join(utilsPath, isTypeScript ? 'logger.ts' : 'logger.js');
  
  if (fsSync.existsSync(loggerPath)) {
    return false;
  }
  
  const content = isTypeScript ? `// Production-ready logger utility
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: process.env.SERVICE_NAME || 'warehouse-network' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Production environment adjustments
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({ filename: 'error.log', level: 'error' }));
  logger.add(new winston.transports.File({ filename: 'combined.log' }));
}
` : `// Production-ready logger utility
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: process.env.SERVICE_NAME || 'warehouse-network' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Production environment adjustments
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({ filename: 'error.log', level: 'error' }));
  logger.add(new winston.transports.File({ filename: 'combined.log' }));
}

module.exports = { logger };
`;

  await fs.writeFile(loggerPath, content, 'utf8');
  logger.info(`Created logger utility at: ${loggerPath}`);
  return true;
}

// Main function
async function main() {
  const rootDir = process.cwd();
  logger.info(`Scanning for console statements in: ${rootDir}`);
  logger.info(`Skipping directories: ${SKIP_DIRS.join(', ')}`);
  logger.info(`Processing file types: ${VALID_EXTENSIONS.join(', ')}\n`);
  
  // Create logger utilities first
  logger.info('Creating logger utilities...\n');
  
  // Check packages
  const packagesDir = path.join(rootDir, 'packages');
  if (fsSync.existsSync(packagesDir)) {
    const packages = await fs.readdir(packagesDir, { withFileTypes: true });
    for (const pkg of packages) {
      if (pkg.isDirectory() && !shouldSkipPath(pkg.name)) {
        const pkgPath = path.join(packagesDir, pkg.name);
        const hasTS = fsSync.existsSync(path.join(pkgPath, 'tsconfig.json'));
        await createLoggerUtility(pkgPath, hasTS);
      }
    }
  }
  
  // Create for root if src exists
  if (fsSync.existsSync(path.join(rootDir, 'src'))) {
    const hasTS = fsSync.existsSync(path.join(rootDir, 'tsconfig.json'));
    await createLoggerUtility(rootDir, hasTS);
  }
  
  logger.info('\nProcessing files...\n');
  
  const results = [];
  let totalFiles = 0;
  
  await walkDirectory(rootDir, async (filePath) => {
    totalFiles++;
    const result = await processFile(filePath);
    if (result) {
      results.push(result);
      const relativePath = path.relative(rootDir, filePath);
      logger.info(`✓ Processed: ${relativePath}`);
      result.replacements.forEach(r => {
        logger.info(`  - Replaced ${r.count} console.${r.type} statements`);
      });
    }
  });
  
  // Summary
  logger.info('\n=== Summary ===');
  logger.info(`Total files scanned: ${totalFiles}`);
  logger.info(`Files modified: ${results.length}`);
  
  if (results.length > 0) {
    const totalReplacements = results.reduce((sum, r) => {
      return sum + r.replacements.reduce((s, rep) => s + rep.count, 0);
    }, 0);
    logger.info(`Total console statements replaced: ${totalReplacements}`);
    
    // Group by type
    const byType = {};
    results.forEach(r => {
      r.replacements.forEach(rep => {
        byType[rep.type] = (byType[rep.type] || 0) + rep.count;
      });
    });
    
    logger.info('\nReplacements by type:');
    Object.entries(byType).forEach(([type, count]) => {
      logger.info(`  console.${type} → logger.${type === 'log' ? 'info' : type}: ${count}`);
    });
  }
  
  logger.info('\n✅ Console log replacement completed successfully!');
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { processFile };