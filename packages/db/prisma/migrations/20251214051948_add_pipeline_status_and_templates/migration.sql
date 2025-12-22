-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('debug', 'info', 'warn', 'error');

-- CreateEnum
CREATE TYPE "ReelStatus" AS ENUM ('scraped', 'downloading', 'downloaded', 'analyzing', 'analyzed', 'failed');

-- DropForeignKey
ALTER TABLE "VideoGeneration" DROP CONSTRAINT "VideoGeneration_analysisId_fkey";

-- AlterTable
ALTER TABLE "Reel" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "localPath" TEXT,
ADD COLUMN     "status" "ReelStatus" NOT NULL DEFAULT 'scraped';

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
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "tags" TEXT[],
    "category" TEXT,
    "reelId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "generationCount" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReelLog_reelId_idx" ON "ReelLog"("reelId");

-- CreateIndex
CREATE INDEX "ReelLog_stage_idx" ON "ReelLog"("stage");

-- CreateIndex
CREATE INDEX "ReelLog_createdAt_idx" ON "ReelLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Template_reelId_key" ON "Template"("reelId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_analysisId_key" ON "Template"("analysisId");

-- CreateIndex
CREATE INDEX "Template_isPublished_idx" ON "Template"("isPublished");

-- CreateIndex
CREATE INDEX "Template_category_idx" ON "Template"("category");

-- CreateIndex
CREATE INDEX "Template_createdAt_idx" ON "Template"("createdAt");

-- CreateIndex
CREATE INDEX "Reel_status_idx" ON "Reel"("status");

-- CreateIndex
CREATE INDEX "VideoAnalysis_sourceId_idx" ON "VideoAnalysis"("sourceId");

-- AddForeignKey
ALTER TABLE "ReelLog" ADD CONSTRAINT "ReelLog_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "VideoAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoGeneration" ADD CONSTRAINT "VideoGeneration_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "VideoAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
