-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('debug', 'info', 'warn', 'error');

-- CreateEnum
CREATE TYPE "AIProvider" AS ENUM ('gemini', 'openai', 'kling');

-- CreateTable
CREATE TABLE "ReelLog" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL,
    "stage" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AILog" (
    "id" TEXT NOT NULL,
    "reelId" TEXT,
    "generationId" TEXT,
    "provider" "AIProvider" NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "inputMeta" JSONB,
    "outputMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AILog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReelLog_reelId_idx" ON "ReelLog"("reelId");

-- CreateIndex
CREATE INDEX "ReelLog_stage_idx" ON "ReelLog"("stage");

-- CreateIndex
CREATE INDEX "ReelLog_createdAt_idx" ON "ReelLog"("createdAt");

-- CreateIndex
CREATE INDEX "AILog_provider_idx" ON "AILog"("provider");

-- CreateIndex
CREATE INDEX "AILog_reelId_idx" ON "AILog"("reelId");

-- CreateIndex
CREATE INDEX "AILog_createdAt_idx" ON "AILog"("createdAt");

-- CreateIndex
CREATE INDEX "AILog_status_idx" ON "AILog"("status");

-- AddForeignKey
ALTER TABLE "ReelLog" ADD CONSTRAINT "ReelLog_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
