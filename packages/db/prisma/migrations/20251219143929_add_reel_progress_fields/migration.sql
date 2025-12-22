-- AlterTable
ALTER TABLE "Reel" ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "progressMessage" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "progressStage" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "VideoAnalysis" ALTER COLUMN "mood" DROP DEFAULT,
ALTER COLUMN "cameraStyle" DROP DEFAULT;

-- AlterTable
ALTER TABLE "VideoGeneration" ADD COLUMN     "klingProgress" INTEGER,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "progressMessage" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "progressStage" TEXT NOT NULL DEFAULT 'pending';
