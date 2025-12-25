import path from 'path';
import fs from 'fs-extra';
import handlebars from 'handlebars';
import { logger } from '../utils/logger';

export interface PlatformOptions {
  name: string;
  typescript?: boolean;
  gitops?: boolean;
  monorepo?: boolean;
  infrastructure?: boolean;
  cloud?: 'aws' | 'gcp' | 'azure' | 'all';
  kubernetes?: boolean;
  observability?: boolean;
  security?: boolean;
}

export class PlatformGenerator {
  constructor(
    private projectPath: string,
    private options: PlatformOptions
  ) {}

  async generate(): Promise<void> {
    logger.debug('Generating platform base...');

    // Create base directories
    await this.createDirectoryStructure();

    // Generate base files
    await this.generatePackageJson();
    await this.generateReadme();
    await this.generateGitignore();
    await this.generateEditorConfig();
    await this.generatePrettierConfig();
    await this.generateESLintConfig();
    await this.generateTsConfig();
    await this.generateDockerfiles();
    await this.generateMakeFile();
    await this.generateEnvironmentFiles();
  }

  private async createDirectoryStructure(): Promise<void> {
    const dirs = [
      'src',
      'tests',
      'docs',
      'scripts',
      'config',
      '.github',
      '.vscode',
    ];

    if (this.options.monorepo) {
      dirs.push('packages', 'apps', 'libs');
    }

    if (this.options.infrastructure) {
      dirs.push('infrastructure', 'terraform', 'ansible');
    }

    if (this.options.kubernetes) {
      dirs.push('k8s', 'helm');
    }

    for (const dir of dirs) {
      await fs.ensureDir(path.join(this.projectPath, dir));
    }
  }

  private async generatePackageJson(): Promise<void> {
    const packageJson = {
      name: this.options.name,
      version: '0.1.0',
      description: `${this.options.name} - Built with Claude DevOps Platform`,
      private: this.options.monorepo,
      workspaces: this.options.monorepo ? ['packages/*', 'apps/*', 'libs/*'] : undefined,
      scripts: {
        dev: 'npm run dev:app',
        build: 'npm run build:all',
        test: 'jest',
        lint: 'eslint . --ext .ts,.tsx,.js,.jsx',
        format: 'prettier --write "**/*.{ts,tsx,js,jsx,json,md}"',
        'type-check': 'tsc --noEmit',
        'pre-commit': 'lint-staged',
        prepare: 'husky install',
        ...this.getAdditionalScripts(),
      },
      dependencies: {},
      devDependencies: {
        '@types/node': '^20.10.5',
        '@typescript-eslint/eslint-plugin': '^6.15.0',
        '@typescript-eslint/parser': '^6.15.0',
        'eslint': '^8.56.0',
        'prettier': '^3.1.1',
        'typescript': '^5.3.3',
        'jest': '^29.7.0',
        'ts-jest': '^29.1.1',
        'husky': '^8.0.3',
        'lint-staged': '^15.2.0',
        'concurrently': '^8.2.2',
      },
      'lint-staged': {
        '*.{ts,tsx,js,jsx}': ['eslint --fix', 'prettier --write'],
        '*.{json,md,yml,yaml}': 'prettier --write',
      },
      engines: {
        node: '>=18.0.0',
        npm: '>=9.0.0',
      },
    };

    await fs.writeJson(
      path.join(this.projectPath, 'package.json'),
      packageJson,
      { spaces: 2 }
    );
  }

  private getAdditionalScripts(): Record<string, string> {
    const scripts: Record<string, string> = {};

    if (this.options.monorepo) {
      scripts['dev:all'] = 'concurrently "npm:dev:*"';
      scripts['build:all'] = 'npm run build:libs && npm run build:apps';
      scripts['build:libs'] = 'npm run build --workspaces --if-present';
      scripts['build:apps'] = 'npm run build --workspace=apps --if-present';
      scripts['changeset'] = 'changeset';
      scripts['version'] = 'changeset version';
      scripts['release'] = 'changeset publish';
    }

    if (this.options.gitops) {
      scripts['ci:setup'] = 'node scripts/setup-ci.js';
      scripts['ci:validate'] = 'node scripts/validate-ci.js';
    }

    if (this.options.infrastructure) {
      scripts['infra:init'] = 'cd infrastructure && terraform init';
      scripts['infra:plan'] = 'cd infrastructure && terraform plan';
      scripts['infra:apply'] = 'cd infrastructure && terraform apply';
      scripts['infra:destroy'] = 'cd infrastructure && terraform destroy';
    }

    if (this.options.kubernetes) {
      scripts['k8s:deploy'] = 'kubectl apply -k k8s/overlays/development';
      scripts['k8s:deploy:prod'] = 'kubectl apply -k k8s/overlays/production';
      scripts['helm:deploy'] = 'helm upgrade --install app ./helm/app';
    }

    if (this.options.security) {
      scripts['security:scan'] = 'npm audit && trivy fs .';
      scripts['security:sast'] = 'semgrep --config=auto .';
    }

    return scripts;
  }

  private async generateReadme(): Promise<void> {
    const readme = `# ${this.options.name}

> Built with Claude DevOps Platform

## 🚀 Quick Start

\`\`\`bash
# Install dependencies
npm install

# Start development
npm run dev

# Build for production
npm run build

# Run tests
npm test
\`\`\`

## 🏛️ Architecture

${this.options.monorepo ? 'This is a monorepo project using npm workspaces.' : 'This is a single package project.'}

### Project Structure

\`\`\`
${this.options.name}/
├── src/              # Source code
├── tests/            # Test files
├── docs/             # Documentation
├── scripts/          # Build and utility scripts
├── config/           # Configuration files
${this.options.monorepo ? '├── packages/         # Shared packages\n├── apps/             # Applications\n├── libs/             # Libraries\n' : ''}\
${this.options.infrastructure ? '├── infrastructure/   # Infrastructure as Code\n├── terraform/        # Terraform modules\n' : ''}\
${this.options.kubernetes ? '├── k8s/              # Kubernetes manifests\n├── helm/             # Helm charts\n' : ''}\
└── package.json      # Project configuration
\`\`\`

## 🔧 Available Scripts

### Development
- \`npm run dev\` - Start development server
- \`npm run build\` - Build for production
- \`npm test\` - Run tests
- \`npm run lint\` - Lint code
- \`npm run format\` - Format code

${this.options.gitops ? `### CI/CD
- \`npm run ci:setup\` - Set up CI/CD pipelines
- \`npm run ci:validate\` - Validate CI configuration
` : ''}

${this.options.infrastructure ? `### Infrastructure
- \`npm run infra:init\` - Initialize Terraform
- \`npm run infra:plan\` - Plan infrastructure changes
- \`npm run infra:apply\` - Apply infrastructure changes
- \`npm run infra:destroy\` - Destroy infrastructure
` : ''}

${this.options.kubernetes ? `### Kubernetes
- \`npm run k8s:deploy\` - Deploy to development
- \`npm run k8s:deploy:prod\` - Deploy to production
- \`npm run helm:deploy\` - Deploy using Helm
` : ''}

${this.options.security ? `### Security
- \`npm run security:scan\` - Run security scanning
- \`npm run security:sast\` - Run static analysis
` : ''}

## 🚀 Deployment

${this.options.gitops ? 'This project uses GitOps for deployment. Push to the main branch to trigger automatic deployment.' : 'See deployment documentation in `docs/deployment.md`.'}

## 📖 Documentation

- [Architecture](docs/architecture.md)
- [Development Guide](docs/development.md)
- [API Documentation](docs/api.md)
${this.options.infrastructure ? '- [Infrastructure Guide](docs/infrastructure.md)\n' : ''}\
${this.options.kubernetes ? '- [Kubernetes Guide](docs/kubernetes.md)\n' : ''}\

## 🤝 Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
`;

    await fs.writeFile(path.join(this.projectPath, 'README.md'), readme);
  }

  private async generateGitignore(): Promise<void> {
    const gitignore = `# Dependencies
node_modules/
*.pnp
.pnp.js

# Testing
coverage/
*.lcov
.nyc_output/

# Production
build/
dist/
out/
*.production.js

# Misc
.DS_Store
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# Editor
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
*.swp
*.swo
*~
.idea/

# OS
.DS_Store
Thumbs.db

# Terraform
${this.options.infrastructure ? `*.tfstate
*.tfstate.*
.terraform/
.terraform.lock.hcl
terraform.tfvars
*.auto.tfvars` : ''}

# Kubernetes
${this.options.kubernetes ? `kubeconfig
*.kubeconfig` : ''}

# Temporary
.tmp/
.cache/
*.tmp
*.temp
`;

    await fs.writeFile(path.join(this.projectPath, '.gitignore'), gitignore.trim());
  }

  private async generateEditorConfig(): Promise<void> {
    const editorconfig = `# EditorConfig is awesome: https://EditorConfig.org

root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false

[*.{yml,yaml}]
indent_size = 2

[Makefile]
indent_style = tab
`;

    await fs.writeFile(path.join(this.projectPath, '.editorconfig'), editorconfig);
  }

  private async generatePrettierConfig(): Promise<void> {
    const prettierrc = {
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
      path.join(this.projectPath, '.prettierrc'),
      prettierrc,
      { spaces: 2 }
    );

    const prettierIgnore = `# Dependencies
node_modules/

# Build outputs
build/
dist/
out/
coverage/

# Terraform
*.tfstate
*.tfstate.*
.terraform/

# Generated files
*.generated.*
`;

    await fs.writeFile(path.join(this.projectPath, '.prettierignore'), prettierIgnore);
  }

  private async generateESLintConfig(): Promise<void> {
    const eslintrc = {
      root: true,
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      plugins: ['@typescript-eslint'],
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
      ],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'warn',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-non-null-assertion': 'warn',
      },
      ignorePatterns: ['dist/', 'build/', 'coverage/', 'node_modules/'],
    };

    await fs.writeJson(
      path.join(this.projectPath, '.eslintrc.json'),
      eslintrc,
      { spaces: 2 }
    );
  }

  private async generateTsConfig(): Promise<void> {
    if (!this.options.typescript) return;

    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'commonjs',
        lib: ['ES2022'],
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        ...(this.options.monorepo ? {
          composite: true,
          baseUrl: '.',
          paths: {
            '@packages/*': ['packages/*/src'],
            '@apps/*': ['apps/*/src'],
            '@libs/*': ['libs/*/src'],
          },
        } : {}),
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist', '**/*.test.ts'],
      ...(this.options.monorepo ? {
        references: [
          { path: './packages/*' },
          { path: './apps/*' },
          { path: './libs/*' },
        ],
      } : {}),
    };

    await fs.writeJson(
      path.join(this.projectPath, 'tsconfig.json'),
      tsconfig,
      { spaces: 2 }
    );
  }

  private async generateDockerfiles(): Promise<void> {
    const dockerfile = `# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
${this.options.monorepo ? 'COPY packages/*/package*.json ./packages/\nCOPY apps/*/package*.json ./apps/\nCOPY libs/*/package*.json ./libs/' : ''}

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
`;

    await fs.writeFile(path.join(this.projectPath, 'Dockerfile'), dockerfile);

    // Docker compose for local development
    const dockerCompose = {
      version: '3.8',
      services: {
        app: {
          build: '.',
          ports: ['3000:3000'],
          environment: {
            NODE_ENV: 'development',
            DATABASE_URL: 'postgresql://user:password@db:5432/myapp',
            REDIS_URL: 'redis://redis:6379',
          },
          depends_on: ['db', 'redis'],
          volumes: [
            './src:/app/src',
            './package.json:/app/package.json',
          ],
          command: 'npm run dev',
        },
        db: {
          image: 'postgres:15-alpine',
          environment: {
            POSTGRES_USER: 'user',
            POSTGRES_PASSWORD: 'password',
            POSTGRES_DB: 'myapp',
          },
          volumes: ['postgres_data:/var/lib/postgresql/data'],
          ports: ['5432:5432'],
        },
        redis: {
          image: 'redis:7-alpine',
          ports: ['6379:6379'],
          volumes: ['redis_data:/data'],
        },
      },
      volumes: {
        postgres_data: {},
        redis_data: {},
      },
    };

    await fs.writeFile(
      path.join(this.projectPath, 'docker-compose.yml'),
      require('js-yaml').dump(dockerCompose)
    );
  }

  private async generateMakeFile(): Promise<void> {
    const makefile = `.PHONY: help install dev build test lint format clean docker-build docker-run

# Default target
.DEFAULT_GOAL := help

# Help target
help:
	@echo "Available targets:"
	@echo "  install      - Install dependencies"
	@echo "  dev          - Start development server"
	@echo "  build        - Build for production"
	@echo "  test         - Run tests"
	@echo "  lint         - Lint code"
	@echo "  format       - Format code"
	@echo "  clean        - Clean build artifacts"
	@echo "  docker-build - Build Docker image"
	@echo "  docker-run   - Run Docker container"

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

test:
	npm test

lint:
	npm run lint

format:
	npm run format

clean:
	rm -rf dist build coverage node_modules

docker-build:
	docker build -t ${this.options.name}:latest .

docker-run:
	docker-compose up

${this.options.kubernetes ? `# Kubernetes targets
k8s-deploy:
	npm run k8s:deploy

k8s-deploy-prod:
	npm run k8s:deploy:prod
` : ''}

${this.options.infrastructure ? `# Infrastructure targets
infra-init:
	npm run infra:init

infra-plan:
	npm run infra:plan

infra-apply:
	npm run infra:apply

infra-destroy:
	npm run infra:destroy
` : ''}
`;

    await fs.writeFile(path.join(this.projectPath, 'Makefile'), makefile);
  }

  private async generateEnvironmentFiles(): Promise<void> {
    const envExample = `# Application
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/myapp
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis
REDIS_URL=redis://localhost:6379
REDIS_TTL=3600

# Authentication
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=7d
REFRESH_TOKEN_EXPIRY=30d

# API Keys (replace with your own)
API_KEY=your-api-key

${this.options.cloud === 'aws' || this.options.cloud === 'all' ? `# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
` : ''}

${this.options.cloud === 'gcp' || this.options.cloud === 'all' ? `# Google Cloud
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
` : ''}

${this.options.cloud === 'azure' || this.options.cloud === 'all' ? `# Azure
AZURE_SUBSCRIPTION_ID=your-subscription-id
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
` : ''}

${this.options.observability ? `# Observability
OTEL_SERVICE_NAME=${this.options.name}
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
JAEGER_ENDPOINT=http://localhost:14268/api/traces
` : ''}
`;

    await fs.writeFile(path.join(this.projectPath, '.env.example'), envExample);
  }
}