# Multi-stage build for AI/ML Platform
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install system dependencies for TensorFlow
RUN apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    libc6-compat

# Set working directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S aiuser && \
    adduser -S aiuser -u 1001

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Create directories and set permissions
RUN mkdir -p logs models data && \
    chown -R aiuser:aiuser /app

# Switch to non-root user
USER aiuser

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/v1/health', (res) => { \
    process.exit(res.statusCode === 200 ? 0 : 1) \
  }).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "dist/index.js"]

# Labels for metadata
LABEL maintainer="Warehouse Network Team"
LABEL version="1.0.0"
LABEL description="AI/ML Platform for Warehouse Intelligence"