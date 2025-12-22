## syntax=docker/dockerfile:1.7

# Prisma client generation (Node + glibc)
FROM node:22-bookworm-slim AS prisma-gen

WORKDIR /work/packages/db

COPY packages/db/prisma ./prisma

RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    npm init -y >/dev/null && \
    npm install --no-package-lock --silent prisma@7.1.0

RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    npx prisma generate --schema=./prisma/schema

# Dependencies stage (Bun in isolated linker mode)
FROM oven/bun:1.3.3 AS deps

WORKDIR /repo

# Bun config is required (install.linker = isolated)
COPY bunfig.toml package.json bun.lock* ./

# Copy only manifests first for better caching
COPY packages/config/package.json packages/config/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/db/package.json packages/db/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/scrapper/package.json apps/scrapper/package.json
COPY apps/video-frames/package.json apps/video-frames/package.json
COPY apps/playwright/package.json apps/playwright/package.json

# Optional native deps (e.g. msgpackr-extract) need a build toolchain
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# bun's install scripts expect `node-gyp` in PATH; provide a tiny shim via bunx
RUN printf '%s\n' \
    '#!/bin/sh' \
    'exec bunx node-gyp@latest "$@"' \
    > /usr/local/bin/node-gyp && chmod +x /usr/local/bin/node-gyp

RUN --mount=type=cache,id=bun-cache-web,target=/root/.bun \
    bun install --frozen-lockfile

# Builder stage (Node runs Next scripts reliably)
FROM node:22-bookworm-slim AS builder

WORKDIR /repo

COPY packages ./packages
COPY apps/web ./apps/web

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /repo/packages/auth/node_modules ./packages/auth/node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules

COPY --from=prisma-gen /work/packages/db/prisma/generated ./packages/db/prisma/generated

# Build arguments for environment variables (used in client code)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

WORKDIR /repo/apps/web
RUN npm run build

# Production stage
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Install curl for healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nextjs && \
    useradd --system --uid 1001 --gid 1001 --create-home nextjs

# Next standalone output preserves monorepo structure under /app
COPY --from=builder --chown=nextjs:nextjs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /repo/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
    CMD curl -fsS http://localhost:3000/ >/dev/null || exit 1

CMD ["node", "apps/web/server.js"]
