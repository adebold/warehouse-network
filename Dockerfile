# Multi-stage Dockerfile for Next.js application
FROM node:22-alpine AS deps
WORKDIR /app

# Install dependencies and pnpm
RUN apk add --no-cache openssl && \
    corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN pnpm install

# Builder stage
FROM node:22-alpine AS builder
WORKDIR /app

# Install OpenSSL and pnpm
RUN apk add --no-cache openssl && \
    corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

# Generate Prisma Client
RUN cd apps/web && pnpm exec prisma format && pnpm exec prisma generate

# Build the application (skip for dev mode)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=development
ENV SKIP_ENV_VALIDATION=1
# RUN cd apps/web && pnpm run build

# Runner stage
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install system dependencies for production
RUN apk add --no-cache curl dumb-init openssl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Create necessary directories
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Copy Prisma files
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/prisma ./apps/web/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/server.js"]