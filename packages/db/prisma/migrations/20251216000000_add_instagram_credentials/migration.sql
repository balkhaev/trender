-- CreateTable
CREATE TABLE "instagram_credentials" (
    "id" TEXT NOT NULL,
    "cookies" JSONB NOT NULL,
    "state" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "instagram_credentials_pkey" PRIMARY KEY ("id")
);

