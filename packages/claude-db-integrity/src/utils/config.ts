import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from './logger';
import type { IntegrityConfig } from '../types';

const DEFAULT_CONFIG_FILENAME = 'claude-db-integrity.config.js';

export class ConfigManager {
  private configPath: string;
  private config: IntegrityConfig | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), DEFAULT_CONFIG_FILENAME);
  }

  async configExists(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  getConfig(): IntegrityConfig {
    if (!this.config) {
      this.config = this.loadConfig();
    }
    return this.config;
  }

  private loadConfig(): IntegrityConfig {
    try {
      // Clear require cache to get fresh config
      delete require.cache[require.resolve(this.configPath)];
      
      const configModule = require(this.configPath);
      const config = configModule.default || configModule;
      
      logger.debug(`Loaded configuration from ${this.configPath}`);
      return this.validateConfig(config);
    } catch (error) {
      logger.warn(`Failed to load config from ${this.configPath}, using defaults:`, error);
      return this.getDefaultConfig();
    }
  }

  async saveConfig(config: IntegrityConfig): Promise<void> {
    const configContent = this.generateConfigContent(config);
    await fs.writeFile(this.configPath, configContent);
    
    this.config = config;
    logger.info(`Configuration saved to ${this.configPath}`);
  }

  async resetConfig(): Promise<void> {
    const defaultConfig = this.getDefaultConfig();
    await this.saveConfig(defaultConfig);
    logger.info('Configuration reset to defaults');
  }

  private validateConfig(config: any): IntegrityConfig {
    // Validate required fields and provide defaults
    const validated: IntegrityConfig = {
      database: {
        provider: config.database?.provider || 'prisma',
        url: config.database?.url || process.env.DATABASE_URL || '',
        schema: config.database?.schema || 'public',
        migrations: {
          directory: config.database?.migrations?.directory || './prisma/migrations',
          tableName: config.database?.migrations?.tableName || '_prisma_migrations'
        },
        backup: {
          enabled: config.database?.backup?.enabled ?? true,
          schedule: config.database?.backup?.schedule || '0 2 * * *',
          retention: config.database?.backup?.retention || 7
        }
      },
      validation: {
        forms: {
          enabled: config.validation?.forms?.enabled ?? true,
          directory: config.validation?.forms?.directory || './src',
          patterns: config.validation?.forms?.patterns || ['**/*.tsx', '**/*.ts', '**/*.jsx', '**/*.js']
        },
        routes: {
          enabled: config.validation?.routes?.enabled ?? true,
          directory: config.validation?.routes?.directory || './src/pages/api',
          patterns: config.validation?.routes?.patterns || ['**/*.ts', '**/*.js']
        },
        schemas: {
          strict: config.validation?.schemas?.strict ?? true,
          allowExtraFields: config.validation?.schemas?.allowExtraFields ?? false
        }
      },
      memory: {
        claude: {
          enabled: config.memory?.claude?.enabled ?? true,
          namespace: config.memory?.claude?.namespace || 'claude-db-integrity',
          ttl: config.memory?.claude?.ttl || 3600,
          syncInterval: config.memory?.claude?.syncInterval || 300
        },
        cache: {
          provider: config.memory?.cache?.provider || 'memory',
          options: config.memory?.cache?.options || {}
        }
      },
      monitoring: {
        enabled: config.monitoring?.enabled ?? true,
        interval: config.monitoring?.interval || 30,
        alerts: {
          email: config.monitoring?.alerts?.email || [],
          webhook: config.monitoring?.alerts?.webhook,
          slack: config.monitoring?.alerts?.slack
        },
        logging: {
          level: config.monitoring?.logging?.level || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
          file: config.monitoring?.logging?.file || './logs/claude-db-integrity.log',
          maxSize: config.monitoring?.logging?.maxSize || '10m',
          maxFiles: config.monitoring?.logging?.maxFiles || 5
        }
      },
      templates: {
        framework: config.templates?.framework || 'generic',
        features: config.templates?.features || [],
        customizations: config.templates?.customizations || {}
      }
    };

    // Validate database URL if not empty
    if (validated.database.url && !this.isValidDatabaseUrl(validated.database.url)) {
      logger.warn('Invalid database URL format detected');
    }

    return validated;
  }

  private isValidDatabaseUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private getDefaultConfig(): IntegrityConfig {
    return {
      database: {
        provider: 'prisma',
        url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/dbname',
        schema: 'public',
        migrations: {
          directory: './prisma/migrations',
          tableName: '_prisma_migrations'
        },
        backup: {
          enabled: true,
          schedule: '0 2 * * *',
          retention: 7
        }
      },
      validation: {
        forms: {
          enabled: true,
          directory: './src',
          patterns: ['**/*.tsx', '**/*.ts', '**/*.jsx', '**/*.js']
        },
        routes: {
          enabled: true,
          directory: './src/pages/api',
          patterns: ['**/*.ts', '**/*.js']
        },
        schemas: {
          strict: true,
          allowExtraFields: false
        }
      },
      memory: {
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
      },
      monitoring: {
        enabled: true,
        interval: 30,
        alerts: {
          email: [],
          webhook: undefined,
          slack: undefined
        },
        logging: {
          level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
          file: './logs/claude-db-integrity.log',
          maxSize: '10m',
          maxFiles: 5
        }
      },
      templates: {
        framework: 'generic',
        features: [],
        customizations: {}
      }
    };
  }

  private generateConfigContent(config: IntegrityConfig): string {
    return `module.exports = ${JSON.stringify(config, null, 2).replace(/"([^"]+)":/g, '$1:')};`;
  }

  // Environment-specific configurations
  getEnvironmentConfig(env: 'development' | 'production' | 'test'): Partial<IntegrityConfig> {
    const baseConfig = this.getConfig();
    
    switch (env) {
      case 'development':
        return {
          ...baseConfig,
          monitoring: {
            ...baseConfig.monitoring,
            interval: 60, // Less frequent checks in dev
            logging: {
              ...baseConfig.monitoring.logging,
              level: 'debug'
            }
          },
          validation: {
            ...baseConfig.validation,
            schemas: {
              ...baseConfig.validation.schemas,
              strict: false // More lenient in dev
            }
          }
        };
        
      case 'production':
        return {
          ...baseConfig,
          monitoring: {
            ...baseConfig.monitoring,
            interval: 15, // More frequent checks in prod
            logging: {
              ...baseConfig.monitoring.logging,
              level: 'warn'
            }
          },
          validation: {
            ...baseConfig.validation,
            schemas: {
              ...baseConfig.validation.schemas,
              strict: true // Strict validation in prod
            }
          }
        };
        
      case 'test':
        return {
          ...baseConfig,
          monitoring: {
            ...baseConfig.monitoring,
            enabled: false // Disable monitoring in tests
          },
          memory: {
            ...baseConfig.memory,
            claude: {
              ...baseConfig.memory.claude,
              enabled: false // Disable Claude sync in tests
            }
          }
        };
        
      default:
        return baseConfig;
    }
  }

  // Configuration validation
  async validateCurrentConfig(): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const config = this.getConfig();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate database configuration
    if (!config.database.url) {
      errors.push('Database URL is required');
    } else if (!this.isValidDatabaseUrl(config.database.url)) {
      errors.push('Database URL format is invalid');
    }

    // Validate directories exist
    try {
      if (config.validation.forms.enabled) {
        await fs.access(config.validation.forms.directory);
      }
    } catch {
      warnings.push(`Forms directory does not exist: ${config.validation.forms.directory}`);
    }

    try {
      if (config.validation.routes.enabled) {
        await fs.access(config.validation.routes.directory);
      }
    } catch {
      warnings.push(`Routes directory does not exist: ${config.validation.routes.directory}`);
    }

    // Validate monitoring settings
    if (config.monitoring.interval < 10) {
      warnings.push('Monitoring interval is very low (<10s), this may impact performance');
    }

    // Validate memory settings
    if (config.memory.claude.ttl < 60) {
      warnings.push('Claude memory TTL is very low (<60s), this may cause frequent cache misses');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Configuration migration (for future versions)
  async migrateConfig(fromVersion: string, toVersion: string): Promise<void> {
    logger.info(`Migrating configuration from ${fromVersion} to ${toVersion}`);
    
    // Future implementation for configuration migrations
    // This would handle breaking changes between versions
  }
}