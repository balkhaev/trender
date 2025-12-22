## syntax=docker/dockerfile:1.7

# Use official Playwright image with pre-installed Chromium
FROM mcr.microsoft.com/playwright:v1.52.0-noble AS base

WORKDIR /app

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Copy package files
COPY apps/playwright/package.json ./

# Install dependencies
RUN --mount=type=cache,id=bun-playwright,target=/root/.bun \
    bun install

# Copy source
COPY apps/playwright/src ./src
COPY apps/playwright/tsconfig.json ./

# Production stage
FROM mcr.microsoft.com/playwright:v1.52.0-noble AS runner

WORKDIR /app

# Install Bun runtime
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Non-root user (playwright image has pwuser)
ENV HOME=/home/pwuser

COPY --from=base --chown=pwuser:pwuser /app/src ./src
COPY --from=base --chown=pwuser:pwuser /app/node_modules ./node_modules
COPY --from=base --chown=pwuser:pwuser /app/package.json ./
COPY --from=base --chown=pwuser:pwuser /app/tsconfig.json ./

USER pwuser

ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
    CMD curl -fsS http://localhost:3002/health >/dev/null || exit 1

CMD ["bun", "run", "src/main.ts"]
