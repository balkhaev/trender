## syntax=docker/dockerfile:1.7

# Shared Prisma client generation stage
# Used by: server, web
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
