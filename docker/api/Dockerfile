# =============================================================================
# Medgnosis API — Multi-stage Docker build
# Stage 1: Install deps + compile TypeScript
# Stage 2: Slim runtime with only dist/ + production node_modules
# =============================================================================

# --------------- Stage 1: Builder ---------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace structure for dependency resolution
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/db/package.json packages/db/tsconfig.json ./packages/db/
COPY packages/solr/package.json packages/solr/tsconfig.json ./packages/solr/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY apps/api/src ./apps/api/src
COPY packages/shared/src ./packages/shared/src
COPY packages/db/src ./packages/db/src
COPY packages/db/migrations ./packages/db/migrations
COPY packages/db/seeds ./packages/db/seeds
COPY packages/solr/src ./packages/solr/src

# Build all packages in dependency order
RUN npx turbo build --filter=@medgnosis/api

# --------------- Stage 2: Runtime ---------------
FROM node:22-alpine AS runtime

WORKDIR /app

# Safety net: config.ts defaults to 3000, but nginx proxies to 3002
ENV API_PORT=3002
ENV NODE_ENV=production

# Copy package files for production install
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/solr/package.json ./packages/solr/

# Install production dependencies only
RUN npm ci --omit=dev --workspace=apps/api --workspace=packages/shared --workspace=packages/db --workspace=packages/solr \
    && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/migrations ./packages/db/migrations
COPY --from=builder /app/packages/db/seeds ./packages/db/seeds
COPY --from=builder /app/packages/solr/dist ./packages/solr/dist

# Non-root user for security
RUN addgroup -S medgnosis && adduser -S medgnosis -G medgnosis
USER medgnosis

EXPOSE 3002

# Default: API server. Override with command: ["node", "apps/api/dist/worker.js"] for worker
CMD ["node", "apps/api/dist/server.js"]
