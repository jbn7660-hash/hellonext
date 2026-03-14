# ============================
# ArcUp/HelloNext Golf Coaching Platform
# Multi-stage Dockerfile for Next.js 14 Monorepo
# Phase 8 Enhanced Production Deployment
# Optimized for security, caching, and patent engine monitoring
# ============================

# Build arguments for configuration injection
ARG SENTRY_DSN
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NODE_VERSION=20

# ============================
# Dependencies Stage
# Optimized for Docker layer caching
# ============================
FROM node:${NODE_VERSION}-alpine AS deps

RUN npm install -g pnpm@9 && \
    apk add --no-cache dumb-init

WORKDIR /app

# Copy dependency files first (better cache layer ordering)
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY packages/*/package.json ./packages/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile && \
    pnpm store prune

# ============================
# Builder Stage
# Full build environment with dev dependencies
# ============================
FROM node:${NODE_VERSION}-alpine AS builder

RUN npm install -g pnpm@9 && \
    apk add --no-cache dumb-init

WORKDIR /app

# Copy pnpm lockfile and package files
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY packages/ ./packages/

# Install all dependencies (including dev)
RUN pnpm install --frozen-lockfile

# Copy application source
COPY apps/ ./apps/
COPY tsconfig.json turbo.json ./

# Build Next.js application with env variables
ARG SENTRY_DSN
ARG NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SENTRY_DSN=${SENTRY_DSN}
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm run build && \
    pnpm prune --prod

# ============================
# Production Runtime Stage
# Minimal, hardened image
# ============================
FROM node:${NODE_VERSION}-alpine AS runner

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chmod 755 /usr/bin/dumb-init

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Allow configurable port
ARG PORT=3000
ENV PORT=${PORT}

# Copy production dependencies from deps stage
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./

# Switch to non-root user for security
USER nextjs

# Expose configurable port
EXPOSE ${PORT}

# Enhanced health check
# - Checks HTTP response status
# - Validates critical health endpoint
# - Ensures both API and internal services respond
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "\
    const http = require('http'); \
    const healthUrl = process.env.HEALTH_CHECK_URL || 'http://localhost:' + (process.env.PORT || 3000) + '/api/health'; \
    http.get(healthUrl, (res) => { \
      if (res.statusCode === 200) process.exit(0); \
      else { console.error('Health check failed:', res.statusCode); process.exit(1); } \
    }).on('error', (e) => { console.error('Health check error:', e); process.exit(1); }); \
    setTimeout(() => { console.error('Health check timeout'); process.exit(1); }, 8000); \
  "

# Use dumb-init to properly handle signals and prevent zombie processes
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]
