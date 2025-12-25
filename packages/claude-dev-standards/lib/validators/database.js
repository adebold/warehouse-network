const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');

const databasePatterns = {
  real: {
    postgres: /pg|postgres|postgresql|sequelize.*postgres|typeorm.*postgres|prisma.*postgresql/gi,
    mysql: /mysql2?|sequelize.*mysql|typeorm.*mysql|prisma.*mysql/gi,
    mongodb: /mongodb|mongoose|typeorm.*mongodb/gi,
    redis: /redis|ioredis/gi
  },
  fake: [
    /mockDB|inMemoryDB|fakeDB/gi,
    /sqlite.*:memory:|memoryDatabase/gi,
    /createMockDatabase|mockRepository/gi,
    /new Map\(\).*as.*database/gi,
    /database\s*=\s*\[\]/gi
  ],
  migrations: [
    /migrations?\//,
    /sequelize.*migration/gi,
    /typeorm.*migration/gi,
    /knex.*migrate/gi,
    /prisma.*migrate/gi,
    /flyway|liquibase/gi
  ],
  pooling: [
    /connectionPool|pool.*config/gi,
    /max.*connections|poolSize/gi,
    /pg.*Pool|mysql.*createPool/gi
  ]
};

async function check(projectPath, config) {
  const errors = [];
  const warnings = [];
  const info = [];
  
  try {
    // Check package.json for database drivers
    const packageJsonPath = path.join(projectPath, 'package.json');
    let hasRealDatabase = false;
    let detectedDatabases = [];
    
    if (await fs.exists(packageJsonPath)) {
      const packageJson = await fs.readJSON(packageJsonPath);
      const allDeps = {
        ...packageJson.dependencies || {},
        ...packageJson.devDependencies || {}
      };
      
      // Check for real database drivers
      Object.entries(databasePatterns.real).forEach(([dbName, pattern]) => {
        const hasDriver = Object.keys(allDeps).some(dep => pattern.test(dep));
        if (hasDriver) {
          hasRealDatabase = true;
          detectedDatabases.push(dbName);
        }
      });
    }
    
    if (!hasRealDatabase) {
      errors.push('No real database driver detected in dependencies');
      errors.push('Required: PostgreSQL, MySQL, MongoDB, or similar production database');
    } else {
      info.push(`Detected database(s): ${detectedDatabases.join(', ')}`);
    }
    
    // Check for fake databases in code
    const files = glob.sync('**/*.{js,ts,jsx,tsx}', {
      cwd: projectPath,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**', '**/*.test.*', '**/*.spec.*']
    });
    
    let fakeDbCount = 0;
    const fakeDbLocations = [];
    
    for (const file of files) {
      const filePath = path.join(projectPath, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        databasePatterns.fake.forEach(pattern => {
          if (pattern.test(line)) {
            fakeDbCount++;
            fakeDbLocations.push({
              file: file,
              line: index + 1,
              content: line.trim()
            });
          }
        });
      });
    }
    
    if (fakeDbCount > 0) {
      errors.push(`Found ${fakeDbCount} fake database usage(s)`);
      fakeDbLocations.slice(0, 3).forEach(location => {
        errors.push(`  ${location.file}:${location.line} - ${location.content.substring(0, 60)}...`);
      });
    }
    
    // Check for migrations
    const hasMigrations = files.some(file => {
      const filePath = path.join(projectPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      return databasePatterns.migrations.some(pattern => pattern.test(file) || pattern.test(content));
    });
    
    if (!hasMigrations) {
      warnings.push('No database migration system detected');
      warnings.push('Consider using migrations for schema version control');
    } else {
      info.push('Database migration system detected');
    }
    
    // Check for connection pooling
    let hasPooling = false;
    for (const file of files) {
      const content = await fs.readFile(path.join(projectPath, file), 'utf-8');
      if (databasePatterns.pooling.some(pattern => pattern.test(content))) {
        hasPooling = true;
        break;
      }
    }
    
    if (!hasPooling && hasRealDatabase) {
      warnings.push('No database connection pooling detected');
    } else if (hasPooling) {
      info.push('Database connection pooling detected');
    }
    
    // Check for database configuration in environment
    const requiredEnvVars = config.custom?.requiredEnvVars || [];
    const dbEnvVars = requiredEnvVars.filter(v => /DATABASE|POSTGRES|MYSQL|MONGO|REDIS/i.test(v));
    if (dbEnvVars.length === 0 && hasRealDatabase) {
      warnings.push('No database environment variables configured');
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
      errors: [`Failed to check database: ${error.message}`],
      warnings,
      info
    };
  }
}

module.exports = { check };