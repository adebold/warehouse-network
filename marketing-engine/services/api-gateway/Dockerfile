# Build stage
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy workspace files
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy service files
COPY services/api-gateway/package*.json ./services/api-gateway/
COPY services/api-gateway/tsconfig.json ./services/api-gateway/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm ci --workspace=@marketing/api-gateway

# Copy source code
COPY services/api-gateway/src ./services/api-gateway/src
COPY packages/shared/src ./packages/shared/src

# Build the application
RUN npm run build --workspace=@marketing/api-gateway

# Production stage
FROM node:18-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/services/api-gateway/package*.json ./services/api-gateway/
COPY --from=builder /app/packages/shared/package*.json ./packages/shared/

# Install production dependencies only
RUN npm ci --workspace=@marketing/api-gateway --production && \
    npm cache clean --force

# Copy built application
COPY --from=builder /app/services/api-gateway/dist ./services/api-gateway/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Set environment
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048"

# Start the application with signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "services/api-gateway/dist/index.js"]