# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (preferred - uses Makefile)
make dev              # Install deps + start infra + run all services
make setup            # Full setup (deps + python + db) - first time only

# Individual services
bun run dev:web       # Start Next.js frontend (port 3000)
bun run dev:server    # Start Hono backend (port 3001)
bun run dev:scrapper  # Start Python scrapper
bun run dev:video-frames # Start Python video-frames service

# Database
make db-push          # Push schema changes (dev only, may lose data)
make db-migrate       # Run migrations (production-safe)
make db-studio        # Open Prisma Studio UI
make db-reset         # Reset database completely

# Infrastructure
make infra            # Start postgres, redis, minio
make infra-down       # Stop infrastructure

# Code quality
bun run check         # Run Biome linting/formatting
bun run check-types   # TypeScript type checking

# Tests
bun test              # Run all tests
bun test <file>       # Run specific test file
```

## Architecture

**Monorepo** using Turborepo with Bun as package manager.

### Apps
- `apps/web` - Next.js 16 frontend (React 19, TailwindCSS, shadcn/ui) - port 3000
- `apps/server` - Hono backend API with BullMQ queues - port 3001
- `apps/scrapper` - Python Instagram scraping service - port 8001
- `apps/video-frames` - Python video processing (PySceneDetect) - port 8002

### Packages
- `@trender/db` - Prisma ORM with multi-file schema (`packages/db/prisma/schema/`)
- `@trender/auth` - Better-Auth configuration

### Server structure (`apps/server/src/`)
- `routes/` - Hono API routes
- `services/` - Business logic:
  - `queues/` - BullMQ queue implementations (pipeline, video-gen, scrape, scene-gen)
  - `jobs/` - Job processing with unified job service
  - `instagram/` - Instagram metadata extraction, credentials, scraping
  - `video/` - Video downloading and loading
  - `analysis/` - AI-powered video/scene analysis
  - `base/` - AI service abstractions
- `config/` - Environment configuration
- `schemas/` - OpenAPI schemas

### Key integrations
- **AI**: Google Gemini (primary for video analysis), OpenAI
- **Storage**: S3-compatible (MinIO locally)
- **Queue**: Redis + BullMQ for background jobs
- **Video**: Kling AI for video generation, PySceneDetect for scene detection

## Database

Schema files located in `packages/db/prisma/schema/` (multi-file schema):
- `schema.prisma` - main config
- `reels.prisma`, `video.prisma`, `template.prisma` - domain models
- `auth.prisma` - authentication tables
- `logs.prisma`, `settings.prisma` - auxiliary

**Workflow for schema changes:**
1. Edit schema files in `packages/db/prisma/schema/*.prisma`
2. Run `make db-migrate` to create and apply migration
3. Prisma client auto-regenerates

**Important:**
- Use `db-migrate` for production-ready changes (creates migration files)
- Use `db-push` only for rapid prototyping (no migration files, may lose data)

## Code Standards

Uses Ultracite (Biome preset). Run `bun run check` before committing.

Key conventions:
- Arrow functions for callbacks
- `for...of` over `.forEach()`
- `async/await` over promise chains
- Function components in React
- Semantic HTML with ARIA attributes

## Logs

Server logs are written to `apps/server/logs/` directory. Check logs for debugging queue jobs and AI service calls.
