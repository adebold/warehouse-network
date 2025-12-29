// Main exports for the claude-db-integrity package
export { IntegrityEngine } from './core/IntegrityEngine';
export { ClaudeMemoryManager } from './memory/ClaudeMemoryManager';
export { ValidationManager } from './validators/ValidationManager';
export { SchemaManager } from './core/SchemaManager';
export { ConfigManager } from './utils/config';
export { generateConfigTemplate, generateMigrationTemplate, generateValidationTemplate, generateTestTemplate } from './utils/templates';
export { CLIController } from './cli/controller';

// Persona-based testing exports
export { PersonaManager } from './personas/PersonaManager';
export { BrowserAutomation } from './testing/BrowserAutomation';

// Type exports
export type {
  IntegrityConfig,
  IntegrityCheck,
  IntegrityReport,
  SchemaDrift,
  SchemaChange,
  ValidationResult,
  ClaudeMemoryEntry,
  MemoryStats,
  MigrationResult,
  MonitoringEvent,
  CLIOptions,
  TemplateMetadata,
  // Persona testing types
  Persona,
  UserJourney,
  TestScenario,
  TestStep,
  TestAssertion,
  PersonaTestSuite,
  PersonaValidationResult,
  PersonaViolation,
  PersonaConfig,
  BrowserConfig,
  AutomationResult,
  ScreenshotOptions
} from './types';

// Utility exports
export { logger } from './utils/logger';
export { DEFAULT_CONFIG as createDefaultConfig } from './utils/defaults';

// Framework integrations
export * from './integrations/nextjs';
export * from './integrations/express';
export * from './integrations/nestjs';

// Constants
export const VERSION = '1.0.0';
export const SUPPORTED_DATABASES = ['prisma', 'typeorm', 'generic'];
export const SUPPORTED_FRAMEWORKS = ['nextjs', 'express', 'nestjs', 'generic'];

// Default configuration factory
export function createIntegrityEngine(configPath?: string): import('./core/IntegrityEngine').IntegrityEngine {
  const { IntegrityEngine } = require('./core/IntegrityEngine');
  return new IntegrityEngine(configPath);
}

// Quick setup helpers
export async function quickSetup(framework: 'nextjs' | 'express' | 'nestjs' | 'generic' = 'generic') {
  const { CLIController } = await import('./cli/controller');
  const cli = new CLIController();
  
  await cli.init({
    template: framework,
    skipInstall: false
  });
}

// Health check helper
export async function healthCheck(configPath?: string): Promise<{
  status: 'healthy' | 'unhealthy' | 'error';
  checks: Record<string, any>;
  timestamp: string;
}> {
  try {
    const { IntegrityEngine } = await import('./core/IntegrityEngine');
    const engine = new IntegrityEngine(configPath);
    await engine.initialize();
    
    const report = await engine.runIntegrityChecks();
    await engine.shutdown();
    
    return {
      status: report.summary.failed === 0 ? 'healthy' : 'unhealthy',
      checks: {
        total: report.summary.total,
        passed: report.summary.passed,
        failed: report.summary.failed,
        skipped: report.summary.skipped
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'error',
      checks: {
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      timestamp: new Date().toISOString()
    };
  }
}

// Memory management helper
export function createMemoryManager(config?: any): import('./memory/ClaudeMemoryManager').ClaudeMemoryManager {
  const { ClaudeMemoryManager } = require('./memory/ClaudeMemoryManager');
  const defaultConfig = {
    claude: {
      enabled: true,
      namespace: 'claude-db-integrity',
      ttl: 3600,
      syncInterval: 300
    },
    cache: {
      provider: 'memory',
      options: {}
    }
  };
  
  return new ClaudeMemoryManager(config || defaultConfig);
}

// Express middleware factory
export function createExpressMiddleware(config?: any) {
  const { createIntegrityMiddleware } = require('./integrations/express');
  return createIntegrityMiddleware(config);
}

// Next.js middleware factory
export function createNextJSMiddleware(config?: any) {
  const { createNextIntegrityMiddleware } = require('./integrations/nextjs');
  return createNextIntegrityMiddleware(config);
}

// CLI runner for programmatic usage
export async function runCLI(args: string[]) {
  const { CLIController } = await import('./cli/controller');
  const cli = new CLIController();
  
  // Parse basic commands
  const [command, ...rest] = args;
  
  switch (command) {
    case 'init':
      const template = rest.find(arg => arg.startsWith('--template='))?.split('=')[1] || 'generic';
      await cli.init({ template });
      break;
      
    case 'check':
      const fix = rest.includes('--fix');
      const verbose = rest.includes('--verbose');
      await cli.check({ fix, verbose });
      break;
      
    case 'drift':
      await cli.checkDrift({});
      break;
      
    case 'validate':
      await cli.validate({});
      break;
      
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

// Package metadata
export const PACKAGE_INFO = {
  name: 'claude-db-integrity',
  version: VERSION,
  description: 'Comprehensive database integrity system with Claude Flow memory integration',
  author: 'Claude DB Integrity Team',
  repository: 'https://github.com/warehouse-network/claude-db-integrity',
  documentation: 'https://github.com/warehouse-network/claude-db-integrity#readme',
  support: {
    issues: 'https://github.com/warehouse-network/claude-db-integrity/issues',
    discord: 'https://discord.gg/claude-db-integrity',
    email: 'support@claude-db-integrity.com'
  }
};