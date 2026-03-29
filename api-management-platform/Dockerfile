# Multi-stage build for production optimization
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build application if needed
RUN npm run build || true

# Production stage
FROM node:18-alpine AS production

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app .

# Create necessary directories
RUN mkdir -p logs uploads generated-sdks && \
    chown -R nodejs:nodejs logs uploads generated-sdks

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8000

# Start application with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/app.js"]

# Development stage
FROM node:18-alpine AS development

WORKDIR /app

# Install all dependencies (including dev dependencies)
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Create directories
RUN mkdir -p logs uploads generated-sdks

# Expose port and debug port
EXPOSE 8000 9229

# Start with nodemon for development
CMD ["npm", "run", "dev"]