/**
 * Типы для работы с Job'ами (scrape, pipeline, video-gen)
 */

export type JobType = "scrape" | "pipeline" | "video-gen";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export type EntityType = "reel" | "generation" | "scrape";

export type JobProgress = {
  scraped: number;
  downloaded: number;
  total: number;
  scanned: number;
  found: number;
  currentReelId?: string;
  currentLikes?: number;
  lastFoundReel?: {
    id: string;
    likes: number;
  };
};

export type JobResult = {
  // Scrape
  reelsCount?: number;
  downloadedCount?: number;
  // Pipeline
  reelId?: string;
  templateId?: string;
  analysisId?: string;
  // Video Generation
  generationId?: string;
  videoUrl?: string;
  s3Key?: string;
};

export type UnifiedJobResponse = {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  stage: string;
  message: string;
  entityId?: string;
  entityType?: EntityType;
  data?: Record<string, unknown>;
  result?: JobResult;
  error?: string;
  attempts: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
};

export type JobFilters = {
  type?: JobType;
  status?: JobStatus;
  limit?: number;
  offset?: number;
};

/**
 * Маппинг состояний BullMQ на унифицированные статусы
 */
export function mapBullStateToStatus(state: string | undefined): JobStatus {
  switch (state) {
    case "waiting":
    case "delayed":
    case "prioritized":
      return "pending";
    case "active":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

/**
 * Определяет тип job'а по его ID
 */
export function getJobTypeFromId(jobId: string): JobType | null {
  if (jobId.startsWith("scrape-")) {
    return "scrape";
  }
  if (
    jobId.startsWith("process-") ||
    jobId.startsWith("download-") ||
    jobId.startsWith("analyze-")
  ) {
    return "pipeline";
  }
  if (jobId.startsWith("video-gen-") || jobId.startsWith("gen-")) {
    return "video-gen";
  }
  return null;
}
