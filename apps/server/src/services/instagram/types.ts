export type SortMode = "top" | "recent";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export type Reel = {
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

export type Job = {
  id: string;
  status: JobStatus;
  sortMode: SortMode;
  limit: number;
  minLikes: number;
  progress: JobProgress;
  reels: Reel[];
  downloadedFiles: string[];
  error?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ScrapeRequest = {
  limit?: number;
  sort?: SortMode;
  minLikes?: number;
};

export type ScrapeResponse = {
  jobId: string;
  status: JobStatus;
  message: string;
};

export type JobStatusResponse = {
  id: string;
  status: JobStatus;
  sortMode: SortMode;
  minLikes: number;
  progress: JobProgress;
  downloadedFiles: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
};
