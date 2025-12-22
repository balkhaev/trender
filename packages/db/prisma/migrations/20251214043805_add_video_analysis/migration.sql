-- CreateTable
CREATE TABLE "VideoAnalysis" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "fileName" TEXT,
    "action" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "cameraWork" TEXT NOT NULL,
    "lighting" TEXT NOT NULL,
    "colorPalette" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "pacing" TEXT NOT NULL,
    "veo3Prompt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoGeneration" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "prompt" TEXT NOT NULL,
    "videoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "durationSec" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "VideoGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoAnalysis_sourceType_idx" ON "VideoAnalysis"("sourceType");

-- CreateIndex
CREATE INDEX "VideoAnalysis_createdAt_idx" ON "VideoAnalysis"("createdAt");

-- CreateIndex
CREATE INDEX "VideoGeneration_analysisId_idx" ON "VideoGeneration"("analysisId");

-- CreateIndex
CREATE INDEX "VideoGeneration_status_idx" ON "VideoGeneration"("status");

-- AddForeignKey
ALTER TABLE "VideoGeneration" ADD CONSTRAINT "VideoGeneration_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "VideoAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
