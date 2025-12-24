/**
 * Типы для Reel'ов и скрапинга
 */

export type SortMode = "top" | "recent";

export type ReelStatus =
  | "scraped"
  | "downloading"
  | "downloaded"
  | "analyzing"
  | "analyzed"
  | "failed";

export type ReelLog = {
  id: string;
  level: "debug" | "info" | "warn" | "error";
  stage: string;
  message: string;
  createdAt: string;
};

export type Reel = {
  id: string;
  url: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  author?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  duration?: number;
  hashtag?: string;
  source: string;
  status: ReelStatus;
  localPath?: string;
  s3Key?: string;
  errorMessage?: string;
  progress: number;
  progressStage: string;
  progressMessage: string;
  lastActivityAt?: string;
  recentLogs?: ReelLog[];
  scrapedAt: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Минимальный Reel для скрапера (без DB полей)
 */
export type ScrapedReel = {
  id: string;
  url: string;
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  author?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  duration?: number;
};

export type ScraperConfig = {
  limit: number;
  sortMode: SortMode;
  minLikes?: number;
  cookiesPath?: string;
};

export type ScrapeRequest = {
  limit?: number;
  sort?: SortMode;
  minLikes?: number;
};

export type ScrapeResponse = {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  message: string;
};
