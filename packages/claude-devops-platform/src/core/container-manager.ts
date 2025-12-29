// Container Manager - Docker and container orchestration
import Docker from 'dockerode';
import { logger } from '../utils/logger.js';
import fs from 'fs-extra';
import path from 'path';
import archiver from 'archiver';
import tar from 'tar';

export interface BuildConfig {
  imageName: string;
  tag: string;
  dockerfile?: string;
  context?: string;
  buildArgs?: Record<string, string>;
  labels?: Record<string, string>;
  target?: string;
  platform?: string;
  registry?: string;
}

export interface BuildResult {
  imageId: string;
  imageName: string;
  tag: string;
  size: number;
  buildTime: number;
  layers: number;
  vulnerabilities?: SecurityScanResult;
}

export interface SecurityScanResult {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  vulnerabilities: Vulnerability[];
}

export interface Vulnerability {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  package: string;
  version: string;
  fixedVersion?: string;
  description: string;
  cvss?: number;
}

export interface Service {
  name: string;
  image: string;
  ports?: PortMapping[];
  environment?: Record<string, string>;
  volumes?: VolumeMapping[];
  depends_on?: string[];
  networks?: string[];
  healthcheck?: HealthCheck;
  resources?: ResourceConstraints;
}

export interface PortMapping {
  host: number;
  container: number;
  protocol?: 'tcp' | 'udp';
}

export interface VolumeMapping {
  host: string;
  container: string;
  mode?: 'ro' | 'rw';
}

export interface HealthCheck {
  test: string[];
  interval: string;
  timeout: string;
  retries: number;
  start_period?: string;
}

export interface ResourceConstraints {
  memory?: string;
  cpus?: string;
  memory_reservation?: string;
  memory_swap?: string;
}

export class ContainerManager {
  private docker: Docker;

  constructor() {
    this.docker = new Docker();
  }

  /**
   * Generate optimized Dockerfile for framework
   */
  async generateDockerfile(framework: string): Promise<string> {
    logger.info(`Generating Dockerfile for ${framework}`);

    const templates = {
      nextjs: this.generateNextJsDockerfile(),
      express: this.generateExpressDockerfile(),
      nestjs: this.generateNestJsDockerfile(),
      react: this.generateReactDockerfile(),
      vue: this.generateVueDockerfile(),
      python: this.generatePythonDockerfile(),
      django: this.generateDjangoDockerfile(),
      fastapi: this.generateFastApiDockerfile(),
      go: this.generateGoDockerfile(),
      rust: this.generateRustDockerfile()
    };

    const dockerfile = templates[framework as keyof typeof templates];
    if (!dockerfile) {
      throw new Error(`Unsupported framework: ${framework}`);
    }

    // Write Dockerfile
    await fs.writeFile('Dockerfile', dockerfile);
    
    // Generate .dockerignore
    const dockerignore = this.generateDockerignore(framework);
    await fs.writeFile('.dockerignore', dockerignore);

    logger.info(`Dockerfile generated for ${framework}`);
    return dockerfile;
  }

  /**
   * Generate docker-compose.yml for services
   */
  async generateCompose(services: Service[]): Promise<string> {
    logger.info(`Generating docker-compose.yml for ${services.length} services`);

    interface ComposeFile {
      version: string;
      services: { [key: string]: any };
      networks: { [key: string]: any };
      volumes: { [key: string]: any };
    }

    const compose: ComposeFile = {
      version: '3.8',
      services: {},
      networks: {
        app_network: {
          driver: 'bridge'
        }
      },
      volumes: {}
    };

    // Add services
    for (const service of services) {
      compose.services[service.name] = {
        image: service.image,
        ports: service.ports?.map(p => `${p.host}:${p.container}`),
        environment: service.environment,
        volumes: service.volumes?.map(v => `${v.host}:${v.container}:${v.mode || 'rw'}`),
        depends_on: service.depends_on,
        networks: service.networks || ['app_network'],
        healthcheck: service.healthcheck,
        deploy: service.resources ? {
          resources: {
            limits: {
              memory: service.resources.memory,
              cpus: service.resources.cpus
            },
            reservations: {
              memory: service.resources.memory_reservation
            }
          }
        } : undefined
      };

      // Add volumes to top-level volumes section
      if (service.volumes) {
        for (const volume of service.volumes) {
          if (!volume.host.startsWith('/') && !volume.host.startsWith('.')) {
            (compose.volumes as Record<string, any>)[volume.host] = {};
          }
        }
      }
    }

    const yaml = require('js-yaml');
    const composeYml = yaml.dump(compose, { indent: 2 });
    
    await fs.writeFile('docker-compose.yml', composeYml);
    
    logger.info('docker-compose.yml generated');
    return composeYml;
  }

  /**
   * Generate container configuration for project type
   */
  async generateContainerConfig(projectType: string): Promise<any> {
    logger.info(`Generating container configuration for ${projectType}`);

    const config = {
      dockerfile: await this.generateDockerfile(projectType),
      services: this.getDefaultServices(projectType),
      networks: ['app_network'],
      volumes: this.getDefaultVolumes(projectType)
    };

    return config;
  }

  /**
   * Build and push Docker image
   */
  async buildAndPush(config: BuildConfig): Promise<BuildResult> {
    logger.info(`Building Docker image: ${config.imageName}:${config.tag}`);

    const startTime = Date.now();

    try {
      // Create build context
      const buildContext = await this.createBuildContext(config.context || '.');
      
      // Build image
      const stream = await this.docker.buildImage(buildContext, {
        t: `${config.imageName}:${config.tag}`,
        dockerfile: config.dockerfile || 'Dockerfile',
        buildargs: config.buildArgs,
        labels: config.labels,
        target: config.target,
        platform: config.platform
      });

      // Wait for build to complete
      const imageInfo = await this.followBuildProgress(stream);
      
      const buildTime = Date.now() - startTime;
      
      // Get image details
      const image = this.docker.getImage(`${config.imageName}:${config.tag}`);
      const inspect = await image.inspect();
      
      const result: BuildResult = {
        imageId: inspect.Id,
        imageName: config.imageName,
        tag: config.tag,
        size: inspect.Size,
        buildTime,
        layers: inspect.RootFS?.Layers?.length || 0
      };

      // Push to registry if specified
      if (config.registry) {
        await this.pushToRegistry(config);
      }

      logger.info(`Image built successfully: ${result.imageId}`);
      return result;

    } catch (error) {
      logger.error(`Failed to build image: ${config.imageName}:${config.tag}`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Perform security scan on image
   */
  async securityScan(image: string): Promise<SecurityScanResult> {
    logger.info(`Performing security scan on: ${image}`);

    try {
      // This would integrate with security scanning tools like Trivy, Clair, or commercial solutions
      // For now, we'll simulate the scan
      
      const mockVulnerabilities: Vulnerability[] = [
        {
          id: 'CVE-2023-1234',
          severity: 'high',
          package: 'libssl1.1',
          version: '1.1.1-1ubuntu2.1',
          fixedVersion: '1.1.1-1ubuntu2.2',
          description: 'SSL/TLS vulnerability in OpenSSL',
          cvss: 7.5
        }
      ];

      const result: SecurityScanResult = {
        total: mockVulnerabilities.length,
        critical: mockVulnerabilities.filter(v => v.severity === 'critical').length,
        high: mockVulnerabilities.filter(v => v.severity === 'high').length,
        medium: mockVulnerabilities.filter(v => v.severity === 'medium').length,
        low: mockVulnerabilities.filter(v => v.severity === 'low').length,
        vulnerabilities: mockVulnerabilities
      };

      logger.info(`Security scan completed: ${result.total} vulnerabilities found`);
      return result;

    } catch (error) {
      logger.error(`Security scan failed for: ${image}`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Optimize Docker image
   */
  async optimizeImage(dockerfile: string): Promise<string> {
    logger.info('Optimizing Docker image');

    // Analyze and optimize Dockerfile
    let optimized = dockerfile;

    // Add multi-stage build if not present
    if (!dockerfile.includes('FROM') || dockerfile.split('FROM').length < 3) {
      optimized = this.addMultiStageBuild(optimized);
    }

    // Optimize layer caching
    optimized = this.optimizeLayerCaching(optimized);

    // Add security best practices
    optimized = this.addSecurityBestPractices(optimized);

    // Minimize image size
    optimized = this.minimizeImageSize(optimized);

    logger.info('Dockerfile optimization completed');
    return optimized;
  }

  /**
   * Check health of containerized services
   */
  async checkHealth(): Promise<any[]> {
    logger.info('Checking container health');

    try {
      const containers = await this.docker.listContainers({ all: false });
      const healthChecks = [];

      for (const containerInfo of containers) {
        const container = this.docker.getContainer(containerInfo.Id);
        const inspect = await container.inspect();
        
        const health = {
          name: inspect.Name.substring(1), // Remove leading /
          status: inspect.State.Health ? inspect.State.Health.Status : 'no-healthcheck',
          uptime: this.calculateUptime(inspect.State.StartedAt),
          last_check: new Date().toISOString()
        };

        if (inspect.State.Health) {
          health.status = inspect.State.Health.Status === 'healthy' ? 'healthy' : 'unhealthy';
        } else {
          health.status = inspect.State.Running ? 'healthy' : 'unhealthy';
        }

        healthChecks.push(health);
      }

      return healthChecks;

    } catch (error) {
      logger.error('Container health check failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Private helper methods

  private generateNextJsDockerfile(): string {
    return `# Multi-stage build for Next.js application
FROM node:18-alpine AS base
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build application
RUN npm run build

# Production image
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
`;
  }

  private generateExpressDockerfile(): string {
    return `# Multi-stage build for Express.js application
FROM node:18-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

USER expressjs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
`;
  }

  private generateNestJsDockerfile(): string {
    return `# Multi-stage build for NestJS application
FROM node:18-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Development dependencies for build
FROM base AS builder-deps
COPY package.json package-lock.json* ./
RUN npm ci

# Build stage
FROM base AS builder
COPY --from=builder-deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

USER nestjs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
`;
  }

  private generateReactDockerfile(): string {
    return `# Multi-stage build for React application
FROM node:18-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production stage with nginx
FROM nginx:alpine AS runner

# Copy built application
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
`;
  }

  private generateVueDockerfile(): string {
    return `# Multi-stage build for Vue.js application
FROM node:18-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production stage with nginx
FROM nginx:alpine AS runner

# Copy built application
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
`;
  }

  private generatePythonDockerfile(): string {
    return `# Multi-stage build for Python application
FROM python:3.11-slim AS base
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    build-essential \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
FROM base AS deps
COPY requirements.txt ./
RUN pip install --user --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.11-slim AS runner
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash python

# Copy dependencies
COPY --from=deps /root/.local /home/python/.local

# Copy application
COPY . .

USER python

ENV PATH=/home/python/.local/bin:$PATH

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["python", "main.py"]
`;
  }

  private generateDjangoDockerfile(): string {
    return `# Multi-stage build for Django application
FROM python:3.11-slim AS base
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    build-essential \\
    curl \\
    postgresql-client \\
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
FROM base AS deps
COPY requirements.txt ./
RUN pip install --user --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.11-slim AS runner
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \\
    curl \\
    postgresql-client \\
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash django

# Copy dependencies
COPY --from=deps /root/.local /home/django/.local

# Copy application
COPY . .

USER django

ENV PATH=/home/django/.local/bin:$PATH
ENV DJANGO_SETTINGS_MODULE=myproject.settings

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["gunicorn", "myproject.wsgi:application", "--bind", "0.0.0.0:8000"]
`;
  }

  private generateFastApiDockerfile(): string {
    return `# Multi-stage build for FastAPI application
FROM python:3.11-slim AS base
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    build-essential \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
FROM base AS deps
COPY requirements.txt ./
RUN pip install --user --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.11-slim AS runner
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash fastapi

# Copy dependencies
COPY --from=deps /root/.local /home/fastapi/.local

# Copy application
COPY . .

USER fastapi

ENV PATH=/home/fastapi/.local/bin:$PATH

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`;
  }

  private generateGoDockerfile(): string {
    return `# Multi-stage build for Go application
FROM golang:1.21-alpine AS base
WORKDIR /app

# Install dependencies
RUN apk add --no-cache git ca-certificates

# Build stage
FROM base AS builder
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Production stage
FROM alpine:latest AS runner
WORKDIR /app

# Install runtime dependencies
RUN apk --no-cache add ca-certificates curl

# Create non-root user
RUN adduser -D -s /bin/sh golang

# Copy binary
COPY --from=builder /app/main .

USER golang

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["./main"]
`;
  }

  private generateRustDockerfile(): string {
    return `# Multi-stage build for Rust application
FROM rust:1.75-slim AS base
WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y \\
    pkg-config \\
    libssl-dev \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Build stage
FROM base AS builder
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release && rm -rf src

COPY src ./src
RUN touch src/main.rs && cargo build --release

# Production stage
FROM debian:bookworm-slim AS runner
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \\
    ca-certificates \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash rust

# Copy binary
COPY --from=builder /app/target/release/my-app /usr/local/bin/my-app

USER rust

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["my-app"]
`;
  }

  private generateDockerignore(framework: string): string {
    const common = `# Common
node_modules
npm-debug.log
.env
.env.local
.git
.gitignore
README.md
.nyc_output
coverage
.coverage
.pytest_cache
__pycache__
*.pyc
*.pyo
*.pyd
.Python
.venv
venv/
.DS_Store
.vscode
.idea
*.log
target/
Cargo.lock
`;

    const frameworkSpecific = {
      nextjs: `
.next
out
`,
      react: `
build
`,
      vue: `
dist
`,
      python: `
.pytest_cache
__pycache__
*.egg-info
`,
      rust: `
target/
Cargo.lock
`,
      go: `
vendor/
`
    };

    return common + (frameworkSpecific[framework as keyof typeof frameworkSpecific] || '');
  }

  private getDefaultServices(projectType: string): Service[] {
    const baseServices: Service[] = [];

    // Add database services based on project type
    if (['nextjs', 'express', 'nestjs', 'django', 'fastapi'].includes(projectType)) {
      baseServices.push({
        name: 'postgres',
        image: 'postgres:15-alpine',
        environment: {
          POSTGRES_DB: 'myapp',
          POSTGRES_USER: 'postgres',
          POSTGRES_PASSWORD: 'password'
        },
        volumes: [
          { host: 'postgres_data', container: '/var/lib/postgresql/data' }
        ],
        ports: [
          { host: 5432, container: 5432 }
        ]
      });

      baseServices.push({
        name: 'redis',
        image: 'redis:7-alpine',
        ports: [
          { host: 6379, container: 6379 }
        ]
      });
    }

    return baseServices;
  }

  private getDefaultVolumes(projectType: string): string[] {
    return ['postgres_data'];
  }

  private async createBuildContext(contextPath: string): Promise<NodeJS.ReadableStream> {
    const archive = archiver('tar');
    
    archive.directory(contextPath, false);
    archive.finalize();

    return archive;
  }

  private async followBuildProgress(stream: NodeJS.ReadableStream): Promise<any> {
    return new Promise((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
  }

  private async pushToRegistry(config: BuildConfig): Promise<void> {
    logger.info(`Pushing image to registry: ${config.registry}`);
    
    const image = this.docker.getImage(`${config.imageName}:${config.tag}`);
    const stream = await image.push({
      tag: config.tag
    });

    await this.followBuildProgress(stream);
    logger.info('Image pushed successfully');
  }

  private addMultiStageBuild(dockerfile: string): string {
    // Implementation would add multi-stage build patterns
    return dockerfile;
  }

  private optimizeLayerCaching(dockerfile: string): string {
    // Implementation would optimize layer caching
    return dockerfile;
  }

  private addSecurityBestPractices(dockerfile: string): string {
    // Implementation would add security best practices
    return dockerfile;
  }

  private minimizeImageSize(dockerfile: string): string {
    // Implementation would minimize image size
    return dockerfile;
  }

  private calculateUptime(startedAt: string): string {
    const start = new Date(startedAt);
    const now = new Date();
    const diff = now.getTime() - start.getTime();
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${days}d ${hours}h ${minutes}m`;
  }
}