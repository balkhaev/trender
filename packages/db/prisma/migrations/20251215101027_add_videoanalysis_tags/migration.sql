-- AlterTable
ALTER TABLE "VideoAnalysis" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE INDEX "VideoAnalysis_tags_idx" ON "VideoAnalysis" USING GIN ("tags");




