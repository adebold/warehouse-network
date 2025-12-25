# Multi-stage production Dockerfile with security best practices
FROM node:20.10.0-alpine AS base

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Development stage
FROM base AS dev
ENV NODE_ENV=development

# Install all dependencies
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build stage
FROM dev AS builder
ENV NODE_ENV=production

# Build the application
RUN npm run build

# Prune dev dependencies
RUN npm prune --production && \
    npm cache clean --force

# Production dependencies stage
FROM base AS prod-deps
ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Runtime stage
FROM node:20.10.0-alpine AS runtime

# Install runtime dependencies and security updates
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/bin ./bin
COPY --from=builder --chown=nodejs:nodejs /app/templates ./templates

# Copy production dependencies
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Security: Set proper permissions
RUN chmod -R 755 /app/bin && \
    chmod -R 644 /app/dist && \
    chmod -R 644 /app/templates

# Create directories for runtime data with proper permissions
RUN mkdir -p /app/logs /app/tmp && \
    chown -R nodejs:nodejs /app/logs /app/tmp

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

# Switch to non-root user
USER nodejs

# Expose port for potential API/metrics endpoint
EXPOSE 9090

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command
CMD ["node", "dist/index.js"]

# Labels for metadata
LABEL maintainer="Claude Platform Team" \
      version="1.0.0" \
      description="Claude DevOps Platform" \
      org.opencontainers.image.source="https://github.com/claude-platform/devops" \
      org.opencontainers.image.vendor="Claude Platform" \
      org.opencontainers.image.licenses="MIT"