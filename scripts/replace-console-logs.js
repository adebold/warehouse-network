#!/usr/bin/env node

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { glob } = require('glob');

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

// Logger import statements for different file types
const LOGGER_IMPORTS = {
  '.js': "const { logger } = require('./utils/logger');",
  '.mjs': "import { logger } from './utils/logger.js';",
  '.ts': "import { logger } from './utils/logger';",
  '.tsx': "import { logger } from './utils/logger';",
  '.jsx': "import { logger } from './utils/logger';"
};

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

// Check if file should be skipped
function shouldSkipFile(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Skip if in a skip directory
  for (const dir of SKIP_DIRS) {
    if (normalizedPath.includes(`/${dir}/`) || normalizedPath.includes(`${dir}/`)) {
      return true;
    }
  }
  
  // Skip if not a valid extension
  const ext = path.extname(filePath);
  if (!VALID_EXTENSIONS.includes(ext)) {
    return true;
  }
  
  // Skip test files if desired
  if (normalizedPath.includes('.test.') || normalizedPath.includes('.spec.')) {
    return false; // Process test files too
  }
  
  return false;
}

// Determine the correct logger import path based on file location
function getLoggerImportPath(filePath) {
  const dir = path.dirname(filePath);
  const packageRoot = findPackageRoot(dir);
  
  if (!packageRoot) {
    return '../utils/logger'; // Fallback
  }
  
  // Calculate relative path from file to logger
  const loggerPath = path.join(packageRoot, 'src', 'utils', 'logger');
  let relativePath = path.relative(dir, loggerPath);
  
  // Ensure path starts with './'
  if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
    relativePath = './' + relativePath;
  }
  
  // Remove file extension for import
  relativePath = relativePath.replace(/\.(ts|js)$/, '');
  
  return relativePath;
}

// Find the package root (contains package.json)
function findPackageRoot(dir) {
  let currentDir = dir;
  
  while (currentDir !== path.parse(currentDir).root) {
    if (fsSync.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  
  return null;
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

// Add logger import to file content
function addLoggerImport(content, filePath) {
  const ext = path.extname(filePath);
  const loggerPath = getLoggerImportPath(filePath);
  
  let importStatement;
  if (ext === '.js' || ext === '.cjs') {
    importStatement = `const { logger } = require('${loggerPath}');`;
  } else {
    importStatement = `import { logger } from '${loggerPath}';`;
  }
  
  // Find where to insert the import
  const lines = content.split('\n');
  let insertIndex = 0;
  let hasOtherImports = false;
  
  // Look for existing imports
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip shebang and comments
    if (line.startsWith('#!') || line.startsWith('//') || line.startsWith('/*')) {
      continue;
    }
    
    // If we find an import or require
    if (line.match(/^(import|const|let|var).*require\s*\(/) || line.startsWith('import ')) {
      hasOtherImports = true;
      insertIndex = i + 1;
    } else if (hasOtherImports && line.length > 0 && !line.match(/^(import|const|let|var).*require/)) {
      // We've passed all imports
      break;
    }
  }
  
  // Insert the import
  if (hasOtherImports) {
    lines.splice(insertIndex, 0, importStatement);
  } else {
    // No imports found, add at the beginning after any comments
    let firstCodeLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length > 0 && !line.startsWith('#!') && !line.startsWith('//') && !line.startsWith('/*')) {
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
      if (consolePattern.pattern.test(content)) {
        hasConsoleStatements = true;
        const matches = content.match(consolePattern.pattern);
        if (matches) {
          replacements.push({
            type: consolePattern.type,
            count: matches.length
          });
        }
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

// Find all files to process
async function findFiles(rootDir) {
  return new Promise((resolve, reject) => {
    const pattern = path.join(rootDir, '**/*');
    
    glob(pattern, { 
      nodir: true,
      dot: false,
      ignore: SKIP_DIRS.map(dir => `**/${dir}/**`)
    }, (err, files) => {
      if (err) {
        reject(err);
      } else {
        resolve(files.filter(file => !shouldSkipFile(file)));
      }
    });
  });
}

// Main function
async function main() {
  const rootDir = process.cwd();
  logger.info(`Scanning for console statements in: ${rootDir}`);
  logger.info(`Skipping directories: ${SKIP_DIRS.join(', ')}`);
  logger.info(`Processing file types: ${VALID_EXTENSIONS.join(', ')}\n`);
  
  try {
    const files = await findFiles(rootDir);
    logger.info(`Found ${files.length} files to check\n`);
    
    const results = [];
    let processedCount = 0;
    
    for (const file of files) {
      const result = await processFile(file);
      if (result) {
        results.push(result);
        processedCount++;
        
        // Show progress
        const relativePath = path.relative(rootDir, file);
        logger.info(`✓ Processed: ${relativePath}`);
        result.replacements.forEach(r => {
          logger.info(`  - Replaced ${r.count} console.${r.type} statements`);
        });
      }
    }
    
    // Summary
    logger.info('\n=== Summary ===');
    logger.info(`Total files scanned: ${files.length}`);
    logger.info(`Files modified: ${processedCount}`);
    
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
    
  } catch (error) {
    logger.error('Error:', error);
    process.exit(1);
  }
}

// Create logger utility files if they don't exist
async function createLoggerUtility() {
  const packages = [
    'packages/claude-agent-tracker/src/utils',
    'packages/claude-db-integrity/src/utils',
    'packages/claude-dev-standards/src/utils',
    'packages/claude-devops-platform/src/utils',
    'src/utils'
  ];
  
  const loggerContent = `// Production-ready logger utility
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

  const loggerContentTS = `// Production-ready logger utility
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
`;

  for (const pkgPath of packages) {
    const utilsPath = path.join(process.cwd(), pkgPath);
    const loggerPathJS = path.join(utilsPath, 'logger.js');
    const loggerPathTS = path.join(utilsPath, 'logger.ts');
    
    try {
      // Create utils directory if it doesn't exist
      await fs.mkdir(utilsPath, { recursive: true });
      
      // Check if TypeScript or JavaScript project
      const packageJsonPath = path.join(path.dirname(utilsPath), 'package.json');
      const hasTypeScript = fsSync.existsSync(path.join(path.dirname(utilsPath), 'tsconfig.json'));
      
      if (hasTypeScript && !fsSync.existsSync(loggerPathTS)) {
        await fs.writeFile(loggerPathTS, loggerContentTS, 'utf8');
        logger.info(`Created logger utility at: ${loggerPathTS}`);
      } else if (!hasTypeScript && !fsSync.existsSync(loggerPathJS)) {
        await fs.writeFile(loggerPathJS, loggerContent, 'utf8');
        logger.info(`Created logger utility at: ${loggerPathJS}`);
      }
    } catch (error) {
      logger.error(`Failed to create logger utility at ${utilsPath}:`, error.message);
    }
  }
}

// Run the script
if (require.main === module) {
  logger.info('Creating logger utilities...\n');
  createLoggerUtility().then(() => {
    logger.info('\nStarting console.log replacement...\n');
    main();
  });
}

module.exports = { processFile, findFiles };