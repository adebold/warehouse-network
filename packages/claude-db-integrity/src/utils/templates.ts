/**
 * Template utilities for generating configuration files and code snippets
 */

export interface TemplateOptions {
  name?: string;
  description?: string;
  version?: string;
  [key: string]: any;
}

/**
 * Generate a basic configuration template
 */
export function generateConfigTemplate(options: TemplateOptions = {}): string {
  return `{
  "name": "${options.name || 'claude-db-integrity-config'}",
  "version": "${options.version || '1.0.0'}",
  "description": "${options.description || 'Database integrity configuration'}",
  "database": {
    "host": "localhost",
    "port": 5432,
    "username": "postgres",
    "password": "",
    "database": "mydb"
  },
  "monitoring": {
    "enabled": true,
    "interval": 300000,
    "alertThreshold": 5
  },
  "validation": {
    "schemas": true,
    "constraints": true,
    "indexes": true,
    "relationships": true
  }
}`;
}

/**
 * Generate a migration template
 */
export function generateMigrationTemplate(name: string): string {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  return `-- Migration: ${timestamp}_${name}
-- Description: ${name}

-- Up Migration
BEGIN;

-- Add your migration SQL here

COMMIT;

-- Down Migration
-- BEGIN;
-- Add your rollback SQL here
-- COMMIT;
`;
}

/**
 * Generate a validation rule template
 */
export function generateValidationTemplate(tableName: string): string {
  return `export const ${tableName}ValidationRules = {
  table: '${tableName}',
  rules: [
    {
      column: 'id',
      type: 'uuid',
      required: true,
      primaryKey: true
    },
    {
      column: 'created_at',
      type: 'timestamp',
      required: true,
      default: 'CURRENT_TIMESTAMP'
    },
    {
      column: 'updated_at',
      type: 'timestamp',
      required: true,
      default: 'CURRENT_TIMESTAMP'
    }
  ],
  constraints: [
    // Add your constraints here
  ],
  indexes: [
    // Add your indexes here
  ]
};`;
}

/**
 * Generate a test template
 */
export function generateTestTemplate(name: string): string {
  return `import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { DatabaseIntegrity } from '../src';

describe('${name}', () => {
  let dbIntegrity: DatabaseIntegrity;

  beforeAll(async () => {
    dbIntegrity = new DatabaseIntegrity({
      // Test configuration
    });
    await dbIntegrity.connect();
  });

  afterAll(async () => {
    await dbIntegrity.disconnect();
  });

  it('should validate database integrity', async () => {
    const result = await dbIntegrity.validate();
    expect(result.isValid).toBe(true);
  });
});`;
}