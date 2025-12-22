export type SortMode = "top" | "recent";
export type JobStatus = "pending" | "running" | "completed" | "failed";

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

export type JobListItem = {
  id: string;
  status: JobStatus;
  sortMode: SortMode;
  minLikes: number;
  progress: JobProgress;
  createdAt: string;
  updatedAt: string;
};

export type DownloadsResponse = Record<string, string[]>;

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export async function startScrape(
  request: ScrapeRequest
): Promise<ScrapeResponse> {
  const response = await fetch(`${API_URL}/api/reels/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      limit: request.limit ?? 2,
      sort: request.sort ?? "top",
      minLikes: request.minLikes ?? 50_000,
    }),
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to start scraping");
  }

  return response.json();
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const response = await fetch(`${API_URL}/api/reels/status/${jobId}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get job status");
  }

  return response.json();
}

export async function getJobs(): Promise<JobListItem[]> {
  const response = await fetch(`${API_URL}/api/reels/jobs`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get jobs");
  }

  return response.json();
}

export async function getDownloads(): Promise<DownloadsResponse> {
  const response = await fetch(`${API_URL}/api/reels/downloads`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get downloads");
  }

  return response.json();
}

export function getDownloadUrl(hashtag: string, filename: string): string {
  return `${API_URL}/api/reels/downloads/${hashtag}/${filename}`;
}

export type AuthStatus = {
  hasCookies: boolean;
  hasSession: boolean;
  isConfigured: boolean;
  cookiesPath: string;
  sessionPath: string;
};

export async function getAuthStatus(): Promise<AuthStatus> {
  const response = await fetch(`${API_URL}/api/reels/auth/status`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get auth status");
  }

  return response.json();
}

export async function uploadCookies(
  cookies: object[]
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_URL}/api/reels/auth/cookies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cookies),
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upload cookies");
  }

  return response.json();
}

export async function launchLoginBrowser(): Promise<{
  success: boolean;
  message: string;
}> {
  const response = await fetch(`${API_URL}/api/reels/auth/login`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to launch login browser");
  }

  return response.json();
}

// Saved Reels API
export type ReelAnalysis = {
  id: string;
  sourceType: string;
  sourceId: string | null;
  fileName: string | null;
  action: string;
  subject: string;
  environment: string;
  cameraWork: string;
  lighting: string;
  colorPalette: string;
  style: string;
  pacing: string;
  veo3Prompt: string;
  createdAt: string;
  generations: {
    id: string;
    provider: string;
    status: string;
    videoUrl: string | null;
  }[];
};

export type ReelStatus =
  | "scraped"
  | "downloading"
  | "downloaded"
  | "analyzing"
  | "analyzed"
  | "failed";

export type SavedReel = {
  id: string;
  url: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  author: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  hashtag: string | null;
  source: string;
  duration: number | null;
  status: ReelStatus;
  localPath: string | null;
  s3Key: string | null;
  errorMessage: string | null;
  scrapedAt: string;
  createdAt: string;
  updatedAt: string;
  analysis: ReelAnalysis | null;
};

export type SavedReelsResponse = {
  reels: SavedReel[];
  total: number;
  limit: number;
  offset: number;
};

export type SavedReelsParams = {
  limit?: number;
  offset?: number;
  minLikes?: number;
  status?: ReelStatus;
};

export type ReelStats = {
  total: number;
  byStatus: {
    scraped: number;
    downloading: number;
    downloaded: number;
    analyzing: number;
    analyzed: number;
    failed: number;
  };
  templates: number;
  activeGenerations: number;
};

export async function getReelStats(): Promise<ReelStats> {
  const response = await fetch(`${API_URL}/api/reels/stats`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get reel stats");
  }

  return response.json();
}

export async function getSavedReels(
  params: SavedReelsParams = {}
): Promise<SavedReelsResponse> {
  const searchParams = new URLSearchParams();
  if (params.limit) {
    searchParams.set("limit", params.limit.toString());
  }
  if (params.offset) {
    searchParams.set("offset", params.offset.toString());
  }
  if (params.minLikes) {
    searchParams.set("minLikes", params.minLikes.toString());
  }
  if (params.status) {
    searchParams.set("status", params.status);
  }

  const response = await fetch(
    `${API_URL}/api/reels/saved?${searchParams.toString()}`,
    { credentials: "include" }
  );

  if (!response.ok) {
    throw new Error("Failed to get saved reels");
  }

  return response.json();
}

export async function getSavedReel(id: string): Promise<SavedReel> {
  const response = await fetch(`${API_URL}/api/reels/saved/${id}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get reel");
  }

  return response.json();
}

// Add reel by URL
export type AddReelRequest = {
  url: string;
};

export type AddReelResponse = {
  success: boolean;
  reel: SavedReel;
  message: string;
  isNew: boolean;
};

export async function addReelByUrl(
  request: AddReelRequest
): Promise<AddReelResponse> {
  const response = await fetch(`${API_URL}/api/reels/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to add reel");
  }

  return response.json();
}

/**
 * Upload a video file for pipeline processing
 */
export async function uploadPipelineVideo(file: File): Promise<{
  success: boolean;
  reelId: string;
  jobId: string;
  status: string;
  message: string;
}> {
  const formData = new FormData();
  formData.append("video", file);

  const response = await fetch(`${API_URL}/api/pipeline/upload`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upload video");
  }

  return response.json();
}

/**
 * Refresh metadata for a reel from Instagram
 */
export async function refreshReelMetadata(
  id: string
): Promise<{ success: boolean; reel: SavedReel; message: string }> {
  const response = await fetch(`${API_URL}/api/reels/${id}/refresh-metadata`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to refresh metadata");
  }

  return response.json();
}

/**
 * Check if reel has video available (either in S3 or locally)
 */
export function hasVideo(
  reel: Pick<SavedReel, "s3Key" | "localPath">
): boolean {
  return !!(reel.s3Key || reel.localPath);
}

/**
 * Get video URL for a reel
 * Uses new /api/files/reels/:id endpoint for S3 files
 * Falls back to old /api/reels/downloads/:source/:id.mp4 for local files
 */
export function getReelVideoUrl(
  reel: Pick<SavedReel, "id" | "s3Key" | "localPath" | "source">
): string | null {
  if (reel.s3Key) {
    return `${API_URL}/api/files/reels/${reel.id}`;
  }
  if (reel.localPath) {
    return `${API_URL}/api/reels/downloads/${reel.source}/${reel.id}.mp4`;
  }
  return null;
}

/**
 * Delete a single reel by ID
 */
export async function deleteReel(id: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_URL}/api/reels/saved/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete reel");
  }

  return response.json();
}

/**
 * Delete all reels
 */
export async function deleteAllReels(): Promise<{
  success: boolean;
  deleted: number;
}> {
  const response = await fetch(`${API_URL}/api/reels/saved`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete all reels");
  }

  return response.json();
}
