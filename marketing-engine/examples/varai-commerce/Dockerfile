# Multi-stage production Dockerfile
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY src ./src
COPY database ./database

# Build application
RUN npm run build

# Production stage
FROM node:20-alpine

# Install production dependencies
RUN apk add --no-cache curl postgresql-client redis

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --chown=nodejs:nodejs database ./database
COPY --chown=nodejs:nodejs scripts ./scripts

# Create required directories
RUN mkdir -p logs uploads tmp && \
    chown -R nodejs:nodejs logs uploads tmp

# Security hardening
RUN chmod -R 750 /app && \
    rm -rf /var/cache/apk/*

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health/live || exit 1

# Start application
CMD ["node", "dist/index.js"]