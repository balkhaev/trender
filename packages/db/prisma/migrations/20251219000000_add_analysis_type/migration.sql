-- Add analysisType field to VideoAnalysis for distinguishing standard vs frame-by-frame analysis
ALTER TABLE "VideoAnalysis" ADD COLUMN "analysisType" TEXT NOT NULL DEFAULT 'standard';

-- Create composite index for efficient queries by sourceId and analysisType
CREATE INDEX "VideoAnalysis_sourceId_analysisType_idx" ON "VideoAnalysis"("sourceId", "analysisType");
