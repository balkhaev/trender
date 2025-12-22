import type {
  JobProgress,
  JobStatus,
  Reel,
  SortMode,
} from "../instagram/types";

// Scrape Queue
export type ScrapeJobData = {
  sortMode: SortMode;
  limit: number;
  minLikes: number;
};

export type ScrapeJobProgress = JobProgress & {
  reels: Reel[];
  downloadedFiles: string[];
  error?: string;
};

export type ScrapeJobResult = {
  reels: Reel[];
  downloadedFiles: string[];
};

// Pipeline Queue
export type PipelineJobData = {
  reelId: string;
  action: "process" | "download" | "analyze" | "analyze-frames";
  options?: {
    skipDownload?: boolean;
    skipAnalysis?: boolean;
    forceReprocess?: boolean;
    useFrames?: boolean;
  };
};

export type PipelineJobProgress = {
  stage: "download" | "analyze" | "template";
  percent: number;
  message: string;
};

export type PipelineJobResult = {
  reelId: string;
  templateId?: string;
  analysisId?: string;
  error?: string;
};

/**
 * Image element for Kling multi-image reference
 */
export type KlingImageElement = {
  referenceImageUrls: string[];
  frontalImageUrl?: string;
};

// Video Generation Queue (Kling video-to-video)
export type VideoGenJobData = {
  generationId: string;
  analysisId: string;
  provider: "kling";
  prompt: string; // Change prompt for video-to-video
  sourceVideoUrl?: string; // Source video URL for reference
  sourceVideoS3Key?: string; // S3 key of source video
  options?: {
    duration?: number; // 1-10 seconds
    aspectRatio?: "16:9" | "9:16" | "1:1" | "auto";
    keepAudio?: boolean;
    /** Image URLs for @Image1, @Image2... references */
    imageUrls?: string[];
    /** Elements for @Element1, @Element2... references */
    elements?: KlingImageElement[];
  };
};

export type VideoGenJobProgress = {
  stage: "pending" | "processing" | "downloading" | "uploading";
  percent: number;
  message: string;
};

export type VideoGenJobResult = {
  generationId: string;
  videoUrl?: string;
  s3Key?: string;
  klingTaskId?: string;
  error?: string;
};

// Job info for API responses
export type QueueJobInfo = {
  id: string;
  name: string;
  status: JobStatus;
  progress: number;
  data: Record<string, unknown>;
  createdAt: Date;
  finishedAt?: Date;
  failedReason?: string;
};
