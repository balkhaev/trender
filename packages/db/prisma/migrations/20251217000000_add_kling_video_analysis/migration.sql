-- AlterTable: Extend VideoAnalysis with detailed fields for Kling OmniVideo
ALTER TABLE "VideoAnalysis" 
ADD COLUMN IF NOT EXISTS "mood" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "cameraStyle" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "duration" INTEGER,
ADD COLUMN IF NOT EXISTS "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
ADD COLUMN IF NOT EXISTS "scenes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "characters" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "objects" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "cameraMovements" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "transitions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "audio" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "textOverlays" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "klingPrompt" TEXT NOT NULL DEFAULT '';

-- Make legacy fields optional with defaults
ALTER TABLE "VideoAnalysis" 
ALTER COLUMN "pacing" SET DEFAULT '',
ALTER COLUMN "cameraWork" SET DEFAULT '',
ALTER COLUMN "veo3Prompt" SET DEFAULT '';

-- Copy cameraWork to cameraStyle for existing records
UPDATE "VideoAnalysis" SET "cameraStyle" = "cameraWork" WHERE "cameraStyle" = '' AND "cameraWork" != '';

-- AlterTable: Extend VideoGeneration for Kling video-to-video
ALTER TABLE "VideoGeneration"
ADD COLUMN IF NOT EXISTS "sourceVideoUrl" TEXT,
ADD COLUMN IF NOT EXISTS "sourceVideoS3Key" TEXT,
ADD COLUMN IF NOT EXISTS "outputDuration" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS "outputAspectRatio" TEXT NOT NULL DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS "keepAudio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "klingTaskId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VideoGeneration_klingTaskId_idx" ON "VideoGeneration"("klingTaskId");
