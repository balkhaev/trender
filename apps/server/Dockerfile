## syntax=docker/dockerfile:1.7

# Prisma client generation (run on Debian + Node for compatibility)
FROM node:22-bookworm-slim AS prisma-gen

WORKDIR /work/packages/db

COPY packages/db/prisma ./prisma
COPY packages/db/prisma.config.ts ./prisma.config.ts

RUN npm init -y >/dev/null && \
    npm install --no-package-lock --silent prisma@7.1.0 tsx

# Prisma 7.x uses prisma.config.ts for datasource config
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    NODE_ENV=production \
    npx prisma generate

# Dependencies stage (Bun in isolated linker mode)
FROM oven/bun:1.3.3 AS deps

WORKDIR /repo

# Bun config is required (install.linker = isolated)
COPY bunfig.toml package.json bun.lock* ./

# Copy only manifests first for better caching
# Note: Docker COPY doesn't support globs with directory structure preservation
COPY packages/config/package.json packages/config/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/db/package.json packages/db/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/scrapper/package.json apps/scrapper/package.json
COPY apps/video-frames/package.json apps/video-frames/package.json
COPY apps/playwright/package.json apps/playwright/package.json

# bun's install scripts expect `node-gyp` in PATH; provide a tiny shim via bunx
RUN printf '%s\n' \
    '#!/bin/sh' \
    'exec bunx node-gyp@latest "$@"' \
    > /usr/local/bin/node-gyp && chmod +x /usr/local/bin/node-gyp

# Optional native deps (e.g. msgpackr-extract) need a build toolchain
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,id=bun-cache-server,target=/root/.bun \
    bun install --frozen-lockfile

# Build stage
FROM oven/bun:1.3.3 AS builder

WORKDIR /repo

COPY bunfig.toml package.json bun.lock* ./

# Copy sources
COPY packages ./packages
COPY apps/server ./apps/server

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /repo/packages/auth/node_modules ./packages/auth/node_modules
COPY --from=deps /repo/apps/server/node_modules ./apps/server/node_modules

COPY --from=prisma-gen /work/packages/db/prisma/generated ./packages/db/prisma/generated

# Build server
WORKDIR /repo/apps/server
RUN bun run build

# Production stage (slim image without Playwright)
FROM oven/bun:1.3.3 AS runner

WORKDIR /repo

ENV NODE_ENV=production
ENV PORT=3000

# Runtime tools for healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd --system --gid 1001 appgroup && \
    useradd --system --uid 1001 --gid 1001 --create-home appuser

COPY --from=builder --chown=appuser:appgroup /repo/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /repo/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder --chown=appuser:appgroup /repo/apps/server/dist ./apps/server/dist
COPY --from=builder --chown=appuser:appgroup /repo/apps/server/package.json ./apps/server/package.json

# Prisma migrations support
COPY --from=builder --chown=appuser:appgroup /repo/packages/db/prisma ./packages/db/prisma
COPY --from=builder --chown=appuser:appgroup /repo/packages/db/package.json ./packages/db/package.json
COPY --from=builder --chown=appuser:appgroup /repo/packages/db/prisma.config.ts ./packages/db/prisma.config.ts
COPY --from=builder --chown=appuser:appgroup /repo/packages/db/node_modules ./packages/db/node_modules

# Entrypoint script for migrations
COPY --chown=appuser:appgroup apps/server/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create data directory for cookies, session storage, etc.
ENV DATA_DIR=/repo/data
RUN mkdir -p /repo/data && chown appuser:appgroup /repo/data

# Playwright service URL (used instead of local Playwright)
ENV PLAYWRIGHT_SERVICE_URL=http://playwright:3002

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
    CMD curl -fsS http://localhost:3000/ >/dev/null || exit 1

WORKDIR /repo/apps/server
ENTRYPOINT ["/entrypoint.sh"]
