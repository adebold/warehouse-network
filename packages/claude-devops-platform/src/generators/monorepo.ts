import path from 'path';
import fs from 'fs-extra';
import { logger } from '../utils/logger';

export interface MonorepoOptions {
  typescript?: boolean;
  packageManager?: 'npm' | 'yarn' | 'pnpm';
}

export class MonorepoGenerator {
  constructor(
    private projectPath: string,
    private options: MonorepoOptions
  ) {}

  async generate(): Promise<void> {
    logger.debug('Generating monorepo structure...');

    await this.createMonorepoStructure();
    await this.generateRootConfigs();
    await this.generateSharedConfigs();
    await this.generatePackageTemplates();
    await this.generateBuildTools();
    await this.generateLernaConfig();
    await this.generateTurboConfig();
    await this.generateNxConfig();
  }

  private async createMonorepoStructure(): Promise<void> {
    const dirs = [
      'packages/shared',
      'packages/utils',
      'packages/types',
      'packages/config',
      'apps/api',
      'apps/web',
      'libs/ui',
      'libs/database',
      'tools/scripts',
      'tools/generators',
    ];

    for (const dir of dirs) {
      await fs.ensureDir(path.join(this.projectPath, dir));
    }
  }

  private async generateRootConfigs(): Promise<void> {
    // Update package.json for workspaces
    const packageJsonPath = path.join(this.projectPath, 'package.json');
    const packageJson = await fs.readJson(packageJsonPath);
    
    packageJson.workspaces = ['packages/*', 'apps/*', 'libs/*'];
    packageJson.scripts = {
      ...packageJson.scripts,
      'dev': 'turbo run dev',
      'build': 'turbo run build',
      'test': 'turbo run test',
      'lint': 'turbo run lint',
      'format': 'prettier --write "**/*.{ts,tsx,js,jsx,json,md}"',
      'clean': 'turbo run clean && rm -rf node_modules',
      'changeset': 'changeset',
      'version': 'changeset version',
      'release': 'turbo run build --filter=./packages/* && changeset publish',
      'graph': 'nx graph',
      'affected:test': 'nx affected:test',
      'affected:build': 'nx affected:build',
    };

    packageJson.devDependencies = {
      ...packageJson.devDependencies,
      '@changesets/cli': '^2.27.1',
      'turbo': '^1.11.2',
      'nx': '^17.2.8',
      'lerna': '^8.0.2',
      '@nrwl/workspace': '^17.2.8',
    };

    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });

    // Root tsconfig
    if (this.options.typescript) {
      const tsconfig = {
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@packages/*': ['packages/*/src'],
            '@apps/*': ['apps/*/src'],
            '@libs/*': ['libs/*/src'],
          },
        },
        references: [
          { path: 'packages/types' },
          { path: 'packages/utils' },
          { path: 'packages/config' },
          { path: 'packages/shared' },
          { path: 'apps/api' },
          { path: 'apps/web' },
          { path: 'libs/ui' },
          { path: 'libs/database' },
        ],
      };

      await fs.writeJson(
        path.join(this.projectPath, 'tsconfig.base.json'),
        tsconfig,
        { spaces: 2 }
      );
    }
  }

  private async generateSharedConfigs(): Promise<void> {
    const configPath = path.join(this.projectPath, 'packages', 'config');

    // Shared TypeScript config
    if (this.options.typescript) {
      const sharedTsConfig = {
        $schema: 'https://json.schemastore.org/tsconfig',
        extends: '../../../tsconfig.base.json',
        compilerOptions: {
          target: 'ES2022',
          module: 'commonjs',
          lib: ['ES2022'],
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          composite: true,
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noImplicitReturns: true,
          noFallthroughCasesInSwitch: true,
        },
      };

      await fs.writeJson(
        path.join(configPath, 'tsconfig.shared.json'),
        sharedTsConfig,
        { spaces: 2 }
      );
    }

    // Shared ESLint config
    const eslintConfig = `module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'import/order': [
      'error',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
        ],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
      },
    ],
  },
  settings: {
    'import/resolver': {
      typescript: {
        project: ['tsconfig.json', 'packages/*/tsconfig.json'],
      },
    },
  },
};
`;

    await fs.writeFile(
      path.join(configPath, 'eslint.config.js'),
      eslintConfig
    );

    // Shared Prettier config
    const prettierConfig = {
      semi: true,
      trailingComma: 'es5',
      singleQuote: true,
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      arrowParens: 'avoid',
      endOfLine: 'lf',
    };

    await fs.writeJson(
      path.join(configPath, 'prettier.config.json'),
      prettierConfig,
      { spaces: 2 }
    );

    // Package.json for config package
    const configPackageJson = {
      name: '@monorepo/config',
      version: '0.0.0',
      private: true,
      files: ['*.json', '*.js'],
    };

    await fs.writeJson(
      path.join(configPath, 'package.json'),
      configPackageJson,
      { spaces: 2 }
    );
  }

  private async generatePackageTemplates(): Promise<void> {
    // Generate types package
    await this.generateTypesPackage();
    
    // Generate utils package
    await this.generateUtilsPackage();
    
    // Generate shared package
    await this.generateSharedPackage();
    
    // Generate API app
    await this.generateApiApp();
    
    // Generate Web app
    await this.generateWebApp();
    
    // Generate UI library
    await this.generateUiLibrary();
    
    // Generate Database library
    await this.generateDatabaseLibrary();
  }

  private async generateTypesPackage(): Promise<void> {
    const typesPath = path.join(this.projectPath, 'packages', 'types');
    const srcPath = path.join(typesPath, 'src');
    await fs.ensureDir(srcPath);

    const packageJson = {
      name: '@monorepo/types',
      version: '0.0.0',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      files: ['dist'],
      scripts: {
        build: 'tsc',
        clean: 'rm -rf dist',
        dev: 'tsc --watch',
      },
      devDependencies: {
        typescript: '^5.3.3',
      },
    };

    await fs.writeJson(
      path.join(typesPath, 'package.json'),
      packageJson,
      { spaces: 2 }
    );

    if (this.options.typescript) {
      const tsconfig = {
        extends: '@monorepo/config/tsconfig.shared.json',
        compilerOptions: {
          rootDir: './src',
          outDir: './dist',
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist'],
      };

      await fs.writeJson(
        path.join(typesPath, 'tsconfig.json'),
        tsconfig,
        { spaces: 2 }
      );

      // Create index.ts with common types
      const indexContent = `// Common types used across the monorepo

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: string;
    version: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface Config {
  env: 'development' | 'staging' | 'production';
  port: number;
  database: {
    url: string;
    poolMin: number;
    poolMax: number;
  };
  redis: {
    url: string;
    ttl: number;
  };
  auth: {
    jwtSecret: string;
    jwtExpiry: string;
    refreshTokenExpiry: string;
  };
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>;
}[keyof T];
`;

      await fs.writeFile(path.join(srcPath, 'index.ts'), indexContent);
    }
  }

  private async generateUtilsPackage(): Promise<void> {
    const utilsPath = path.join(this.projectPath, 'packages', 'utils');
    const srcPath = path.join(utilsPath, 'src');
    await fs.ensureDir(srcPath);

    const packageJson = {
      name: '@monorepo/utils',
      version: '0.0.0',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      files: ['dist'],
      scripts: {
        build: 'tsc',
        clean: 'rm -rf dist',
        dev: 'tsc --watch',
        test: 'jest',
      },
      dependencies: {
        '@monorepo/types': 'workspace:*',
      },
      devDependencies: {
        '@types/jest': '^29.5.11',
        jest: '^29.7.0',
        'ts-jest': '^29.1.1',
        typescript: '^5.3.3',
      },
    };

    await fs.writeJson(
      path.join(utilsPath, 'package.json'),
      packageJson,
      { spaces: 2 }
    );

    if (this.options.typescript) {
      const tsconfig = {
        extends: '@monorepo/config/tsconfig.shared.json',
        compilerOptions: {
          rootDir: './src',
          outDir: './dist',
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist', '**/*.test.ts'],
        references: [
          { path: '../types' },
        ],
      };

      await fs.writeJson(
        path.join(utilsPath, 'tsconfig.json'),
        tsconfig,
        { spaces: 2 }
      );

      // Create utility functions
      const indexContent = `export * from './logger';
export * from './validators';
export * from './helpers';
export * from './errors';
`;

      await fs.writeFile(path.join(srcPath, 'index.ts'), indexContent);

      // Logger utility
      const loggerContent = `export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  constructor(private name: string, private level: LogLevel = LogLevel.INFO) {}

  debug(...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(\`[\${this.name}] [DEBUG]\`, ...args);
    }
  }

  info(...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info(\`[\${this.name}] [INFO]\`, ...args);
    }
  }

  warn(...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(\`[\${this.name}] [WARN]\`, ...args);
    }
  }

  error(...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(\`[\${this.name}] [ERROR]\`, ...args);
    }
  }

  child(name: string): Logger {
    return new Logger(\`\${this.name}:\${name}\`, this.level);
  }
}

export const createLogger = (name: string): Logger => new Logger(name);
`;

      await fs.writeFile(path.join(srcPath, 'logger.ts'), loggerContent);

      // Validators
      const validatorsContent = `import { z } from 'zod';

export const emailSchema = z.string().email();
export const uuidSchema = z.string().uuid();
export const dateSchema = z.string().datetime();

export const validateEmail = (email: string): boolean => {
  return emailSchema.safeParse(email).success;
};

export const validateUUID = (uuid: string): boolean => {
  return uuidSchema.safeParse(uuid).success;
};

export const validateUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const validatePhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
  return phoneRegex.test(phone);
};
`;

      await fs.writeFile(path.join(srcPath, 'validators.ts'), validatorsContent);

      // Helpers
      const helpersContent = `export const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

export const retry = async <T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    delay?: number;
    backoff?: number;
  } = {}
): Promise<T> => {
  const { attempts = 3, delay = 1000, backoff = 2 } = options;
  
  let lastError: Error;
  
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < attempts - 1) {
        await sleep(delay * Math.pow(backoff, i));
      }
    }
  }
  
  throw lastError!;
};

export const chunk = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export const debounce = <T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

export const throttle = <T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};
`;

      await fs.writeFile(path.join(srcPath, 'helpers.ts'), helpersContent);

      // Errors
      const errorsContent = `export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? \`\${resource} with id \${id} not found\` : \`\${resource} not found\`;
    super(message, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'CONFLICT', 409, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
  }
}
`;

      await fs.writeFile(path.join(srcPath, 'errors.ts'), errorsContent);
    }
  }

  private async generateSharedPackage(): Promise<void> {
    const sharedPath = path.join(this.projectPath, 'packages', 'shared');
    const srcPath = path.join(sharedPath, 'src');
    await fs.ensureDir(srcPath);

    const packageJson = {
      name: '@monorepo/shared',
      version: '0.0.0',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      files: ['dist'],
      scripts: {
        build: 'tsc',
        clean: 'rm -rf dist',
        dev: 'tsc --watch',
      },
      dependencies: {
        '@monorepo/types': 'workspace:*',
        '@monorepo/utils': 'workspace:*',
      },
      devDependencies: {
        typescript: '^5.3.3',
      },
    };

    await fs.writeJson(
      path.join(sharedPath, 'package.json'),
      packageJson,
      { spaces: 2 }
    );

    if (this.options.typescript) {
      const tsconfig = {
        extends: '@monorepo/config/tsconfig.shared.json',
        compilerOptions: {
          rootDir: './src',
          outDir: './dist',
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist'],
        references: [
          { path: '../types' },
          { path: '../utils' },
        ],
      };

      await fs.writeJson(
        path.join(sharedPath, 'tsconfig.json'),
        tsconfig,
        { spaces: 2 }
      );
    }
  }

  private async generateApiApp(): Promise<void> {
    const apiPath = path.join(this.projectPath, 'apps', 'api');
    const srcPath = path.join(apiPath, 'src');
    await fs.ensureDir(srcPath);

    const packageJson = {
      name: '@monorepo/api',
      version: '0.0.0',
      private: true,
      scripts: {
        dev: 'nodemon',
        build: 'tsc',
        start: 'node dist/index.js',
        test: 'jest',
        lint: 'eslint . --ext .ts,.tsx',
      },
      dependencies: {
        '@monorepo/types': 'workspace:*',
        '@monorepo/utils': 'workspace:*',
        '@monorepo/shared': 'workspace:*',
        '@libs/database': 'workspace:*',
        express: '^4.18.2',
        cors: '^2.8.5',
        helmet: '^7.1.0',
        'express-rate-limit': '^7.1.5',
        'express-validator': '^7.0.1',
        jsonwebtoken: '^9.0.2',
        bcryptjs: '^2.4.3',
        dotenv: '^16.3.1',
      },
      devDependencies: {
        '@types/express': '^4.17.21',
        '@types/cors': '^2.8.17',
        '@types/jsonwebtoken': '^9.0.5',
        '@types/bcryptjs': '^2.4.6',
        nodemon: '^3.0.2',
        'ts-node': '^10.9.2',
        typescript: '^5.3.3',
      },
    };

    await fs.writeJson(
      path.join(apiPath, 'package.json'),
      packageJson,
      { spaces: 2 }
    );

    if (this.options.typescript) {
      const tsconfig = {
        extends: '../../tsconfig.base.json',
        compilerOptions: {
          rootDir: './src',
          outDir: './dist',
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist'],
        references: [
          { path: '../../packages/types' },
          { path: '../../packages/utils' },
          { path: '../../packages/shared' },
          { path: '../../libs/database' },
        ],
      };

      await fs.writeJson(
        path.join(apiPath, 'tsconfig.json'),
        tsconfig,
        { spaces: 2 }
      );

      // Create basic Express app
      const appContent = `import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createLogger } from '@monorepo/utils';
import { Config } from '@monorepo/types';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { healthRouter } from './routes/health';

const logger = createLogger('api');

export const createApp = (config: Config) => {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());
  
  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  });
  app.use('/api/', limiter);

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Routes
  app.use('/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export const startServer = async (app: express.Application, config: Config) => {
  const server = app.listen(config.port, () => {
    logger.info(\`Server running on port \${config.port} in \${config.env} mode\`);
  });

  // Graceful shutdown
  const gracefulShutdown = () => {
    logger.info('Received shutdown signal, closing server...');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  return server;
};
`;

      await fs.writeFile(path.join(srcPath, 'app.ts'), appContent);

      // Create index file
      const indexContent = `import dotenv from 'dotenv';
import { createLogger } from '@monorepo/utils';
import { Config } from '@monorepo/types';
import { createApp, startServer } from './app';
import { connectDatabase } from '@libs/database';

dotenv.config();

const logger = createLogger('api:main');

const config: Config = {
  env: (process.env.NODE_ENV as Config['env']) || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost/myapp',
    poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    ttl: parseInt(process.env.REDIS_TTL || '3600', 10),
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
    jwtExpiry: process.env.JWT_EXPIRY || '7d',
    refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || '30d',
  },
};

async function main() {
  try {
    // Connect to database
    await connectDatabase(config.database);
    logger.info('Database connected');

    // Create and start server
    const app = createApp(config);
    await startServer(app, config);
  } catch (error) {
    logger.error('Failed to start server:', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

main();
`;

      await fs.writeFile(path.join(srcPath, 'index.ts'), indexContent);
    }
  }

  private async generateWebApp(): Promise<void> {
    const webPath = path.join(this.projectPath, 'apps', 'web');
    const srcPath = path.join(webPath, 'src');
    await fs.ensureDir(srcPath);

    const packageJson = {
      name: '@monorepo/web',
      version: '0.0.0',
      private: true,
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        lint: 'next lint',
        test: 'jest',
      },
      dependencies: {
        '@monorepo/types': 'workspace:*',
        '@monorepo/utils': 'workspace:*',
        '@libs/ui': 'workspace:*',
        next: '^14.0.4',
        react: '^18.2.0',
        'react-dom': '^18.2.0',
      },
      devDependencies: {
        '@types/react': '^18.2.45',
        '@types/react-dom': '^18.2.18',
        '@types/node': '^20.10.5',
        typescript: '^5.3.3',
        'eslint-config-next': '^14.0.4',
      },
    };

    await fs.writeJson(
      path.join(webPath, 'package.json'),
      packageJson,
      { spaces: 2 }
    );
  }

  private async generateUiLibrary(): Promise<void> {
    const uiPath = path.join(this.projectPath, 'libs', 'ui');
    const srcPath = path.join(uiPath, 'src');
    await fs.ensureDir(srcPath);

    const packageJson = {
      name: '@libs/ui',
      version: '0.0.0',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      files: ['dist'],
      scripts: {
        build: 'tsc',
        dev: 'tsc --watch',
        storybook: 'storybook dev -p 6006',
        'build-storybook': 'storybook build',
      },
      peerDependencies: {
        react: '>=17.0.0',
        'react-dom': '>=17.0.0',
      },
      devDependencies: {
        '@types/react': '^18.2.45',
        '@storybook/react': '^7.6.7',
        '@storybook/react-webpack5': '^7.6.7',
        '@storybook/addon-essentials': '^7.6.7',
        typescript: '^5.3.3',
      },
    };

    await fs.writeJson(
      path.join(uiPath, 'package.json'),
      packageJson,
      { spaces: 2 }
    );
  }

  private async generateDatabaseLibrary(): Promise<void> {
    const dbPath = path.join(this.projectPath, 'libs', 'database');
    const srcPath = path.join(dbPath, 'src');
    await fs.ensureDir(srcPath);

    const packageJson = {
      name: '@libs/database',
      version: '0.0.0',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      files: ['dist'],
      scripts: {
        build: 'tsc',
        'db:generate': 'prisma generate',
        'db:push': 'prisma db push',
        'db:migrate': 'prisma migrate dev',
        'db:studio': 'prisma studio',
      },
      dependencies: {
        '@prisma/client': '^5.7.1',
        '@monorepo/types': 'workspace:*',
      },
      devDependencies: {
        prisma: '^5.7.1',
        typescript: '^5.3.3',
      },
    };

    await fs.writeJson(
      path.join(dbPath, 'package.json'),
      packageJson,
      { spaces: 2 }
    );

    // Create Prisma schema
    const prismaSchema = `// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  posts     Post[]
  profile   Profile?
}

model Profile {
  id        String   @id @default(cuid())
  bio       String?
  avatar    String?
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
`;

    await fs.ensureDir(path.join(dbPath, 'prisma'));
    await fs.writeFile(
      path.join(dbPath, 'prisma', 'schema.prisma'),
      prismaSchema
    );
  }

  private async generateBuildTools(): Promise<void> {
    // Generate shared build configuration
    const toolsPath = path.join(this.projectPath, 'tools');
    await fs.ensureDir(toolsPath);

    // Webpack config for packages
    const webpackConfig = `const path = require('path');

module.exports = {
  mode: process.env.NODE_ENV || 'development',
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    libraryTarget: 'commonjs2',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  externals: {
    react: 'react',
    'react-dom': 'react-dom',
  },
};
`;

    await fs.writeFile(
      path.join(toolsPath, 'webpack.config.js'),
      webpackConfig
    );

    // Jest config for monorepo
    const jestConfig = `module.exports = {
  projects: [
    '<rootDir>/packages/*',
    '<rootDir>/apps/*',
    '<rootDir>/libs/*',
  ],
  testEnvironment: 'node',
  transform: {
    '^.+\.tsx?$': 'ts-jest',
  },
  moduleNameMapper: {
    '@packages/(.*)': '<rootDir>/packages/$1/src',
    '@apps/(.*)': '<rootDir>/apps/$1/src',
    '@libs/(.*)': '<rootDir>/libs/$1/src',
  },
  collectCoverageFrom: [
    'packages/*/src/**/*.{ts,tsx}',
    'apps/*/src/**/*.{ts,tsx}',
    'libs/*/src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/*.test.{ts,tsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
`;

    await fs.writeFile(
      path.join(this.projectPath, 'jest.config.js'),
      jestConfig
    );
  }

  private async generateLernaConfig(): Promise<void> {
    const lernaConfig = {
      $schema: 'node_modules/lerna/schemas/lerna-schema.json',
      version: 'independent',
      npmClient: this.options.packageManager || 'npm',
      command: {
        publish: {
          conventionalCommits: true,
          message: 'chore(release): publish',
          registry: 'https://registry.npmjs.org',
        },
        version: {
          allowBranch: ['main', 'release/*'],
          conventionalCommits: true,
          createRelease: 'github',
          exact: true,
          message: 'chore(release): version %v',
        },
      },
      packages: ['packages/*', 'apps/*', 'libs/*'],
    };

    await fs.writeJson(
      path.join(this.projectPath, 'lerna.json'),
      lernaConfig,
      { spaces: 2 }
    );
  }

  private async generateTurboConfig(): Promise<void> {
    const turboConfig = {
      $schema: 'https://turbo.build/schema.json',
      globalDependencies: ['.env*'],
      pipeline: {
        build: {
          dependsOn: ['^build'],
          outputs: ['dist/**', '.next/**'],
        },
        test: {
          dependsOn: ['build'],
          outputs: [],
          cache: false,
        },
        lint: {
          outputs: [],
        },
        dev: {
          cache: false,
          persistent: true,
        },
        clean: {
          cache: false,
        },
      },
    };

    await fs.writeJson(
      path.join(this.projectPath, 'turbo.json'),
      turboConfig,
      { spaces: 2 }
    );
  }

  private async generateNxConfig(): Promise<void> {
    const nxConfig = {
      extends: 'nx/presets/npm.json',
      tasksRunnerOptions: {
        default: {
          runner: 'nx/tasks-runners/default',
          options: {
            cacheableOperations: ['build', 'lint', 'test', 'e2e'],
          },
        },
      },
      targetDefaults: {
        build: {
          dependsOn: ['^build'],
          inputs: ['production', '^production'],
        },
        test: {
          inputs: ['default', '^production', '{workspaceRoot}/jest.preset.js'],
        },
      },
      namedInputs: {
        default: ['{projectRoot}/**/*', 'sharedGlobals'],
        production: [
          'default',
          '!{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)?(.snap)',
          '!{projectRoot}/tsconfig.spec.json',
          '!{projectRoot}/.eslintrc.json',
        ],
        sharedGlobals: [],
      },
      generators: {
        '@nx/react': {
          application: {
            style: 'css',
            linter: 'eslint',
            bundler: 'vite',
          },
          component: {
            style: 'css',
          },
          library: {
            style: 'css',
            linter: 'eslint',
          },
        },
      },
    };

    await fs.writeJson(
      path.join(this.projectPath, 'nx.json'),
      nxConfig,
      { spaces: 2 }
    );
  }
}