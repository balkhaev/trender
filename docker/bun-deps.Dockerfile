## syntax=docker/dockerfile:1.7

# Shared Bun dependencies stage
# Used by: server, web
FROM oven/bun:1.3.3 AS deps

WORKDIR /repo

# Bun config is required (install.linker = isolated)
COPY bunfig.toml package.json bun.lock* ./

# Copy only manifests first for better caching
COPY packages/config/package.json packages/config/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/db/package.json packages/db/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/scrapper/package.json apps/scrapper/package.json

# bun's install scripts expect `node-gyp` in PATH; provide a tiny shim via bunx
RUN printf '%s\n' \
    '#!/bin/sh' \
    'exec bunx node-gyp@latest "$@"' \
    > /usr/local/bin/node-gyp && chmod +x /usr/local/bin/node-gyp

# Optional native deps (e.g. msgpackr-extract) need a build toolchain
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,id=bun-cache,target=/root/.bun \
    bun install --frozen-lockfile
