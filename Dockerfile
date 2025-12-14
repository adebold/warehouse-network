# Multi-stage Dockerfile for Next.js application
FROM node:18-alpine AS deps
# Install pnpm
RUN npm install -g pnpm@8.6.1
# Add libc6-compat for Alpine compatibility
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/integrations/package.json ./packages/integrations/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Builder stage
FROM node:18-alpine AS builder
RUN npm install -g pnpm@8.6.1
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

# Generate Prisma Client
RUN cd packages/db && pnpm prisma generate

# Build the application
ENV NEXT_TELEMETRY_DISABLED 1
RUN pnpm run build --filter=web

# Runner stage
FROM node:18-alpine AS runner
RUN npm install -g pnpm@8.6.1
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# Copy Prisma schema and generated client
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "apps/web/server.js"]