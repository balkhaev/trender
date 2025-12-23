-- CreateEnum
CREATE TYPE "SpanKind" AS ENUM ('internal', 'server', 'client', 'producer', 'consumer');

-- CreateEnum
CREATE TYPE "SpanStatus" AS ENUM ('unset', 'ok', 'error');

-- AlterTable
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TemplateBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Trace" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rootService" TEXT NOT NULL,
    "rootPath" TEXT,
    "userId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "status" "SpanStatus" NOT NULL DEFAULT 'unset',
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TraceSpan" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "spanId" TEXT NOT NULL,
    "parentSpanId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "SpanKind" NOT NULL DEFAULT 'internal',
    "service" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "status" "SpanStatus" NOT NULL DEFAULT 'unset',
    "errorMessage" TEXT,
    "attributes" JSONB,
    "events" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraceSpan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Template_isFeatured_idx" ON "Template"("isFeatured");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TemplateBookmark_userId_templateId_key" ON "TemplateBookmark"("userId", "templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateBookmark_userId_idx" ON "TemplateBookmark"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TemplateBookmark_templateId_idx" ON "TemplateBookmark"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Trace_traceId_key" ON "Trace"("traceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Trace_traceId_idx" ON "Trace"("traceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Trace_startedAt_idx" ON "Trace"("startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Trace_status_idx" ON "Trace"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Trace_rootService_idx" ON "Trace"("rootService");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TraceSpan_traceId_idx" ON "TraceSpan"("traceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TraceSpan_spanId_idx" ON "TraceSpan"("spanId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TraceSpan_parentSpanId_idx" ON "TraceSpan"("parentSpanId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TraceSpan_service_idx" ON "TraceSpan"("service");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TraceSpan_startedAt_idx" ON "TraceSpan"("startedAt");

-- AddForeignKey
ALTER TABLE "TemplateBookmark" DROP CONSTRAINT IF EXISTS "TemplateBookmark_templateId_fkey";
ALTER TABLE "TemplateBookmark" ADD CONSTRAINT "TemplateBookmark_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceSpan" DROP CONSTRAINT IF EXISTS "TraceSpan_traceId_fkey";
ALTER TABLE "TraceSpan" ADD CONSTRAINT "TraceSpan_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "Trace"("traceId") ON DELETE CASCADE ON UPDATE CASCADE;
