-- AlterTable
ALTER TABLE "VideoGeneration" ADD COLUMN "imageReferences" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "VideoGeneration" ADD COLUMN "remixSource" TEXT;

-- CreateIndex
CREATE INDEX "VideoGeneration_remixSource_idx" ON "VideoGeneration"("remixSource");
