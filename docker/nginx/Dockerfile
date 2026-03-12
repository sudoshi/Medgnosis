# =============================================================================
# Medgnosis Web — Multi-stage Docker build
# Stage 1: Build Vite SPA
# Stage 2: Serve with nginx
# =============================================================================

# --------------- Stage 1: Frontend Build ---------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace structure
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/tsconfig.json ./apps/web/
COPY apps/web/vite.config.ts apps/web/tailwind.config.ts apps/web/postcss.config.js ./apps/web/
COPY apps/web/index.html ./apps/web/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/

# Install dependencies
RUN npm ci

# Copy source
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public
COPY packages/shared/src ./packages/shared/src

# Build the SPA
RUN npx turbo build --filter=@medgnosis/web

# --------------- Stage 2: nginx Runtime ---------------
FROM nginx:1.27-alpine AS runtime

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our config
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy built SPA from builder
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# nginx runs as root by default in Alpine (needed for port 80)
CMD ["nginx", "-g", "daemon off;"]
