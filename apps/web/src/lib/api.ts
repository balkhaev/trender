export type VideoAnalysis = {
  action: string;
  subject: string;
  environment: string;
  cameraWork: string;
  lighting: string;
  colorPalette: string;
  style: string;
  pacing: string;
  veo3Prompt: string;
};

export type VideoAnalysisWithId = VideoAnalysis & {
  id: string;
  sourceType: string;
  sourceId?: string;
  fileName?: string;
  createdAt: string;
};

export type VideoProvider = "veo3" | "sora2" | "kling";

export type VideoGeneration = {
  id: string;
  analysisId: string;
  provider: VideoProvider;
  status: "pending" | "processing" | "completed" | "failed";
  prompt: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  // Progress tracking
  progress: number;
  progressStage: string;
  progressMessage: string;
  klingProgress?: number;
  lastActivityAt?: string;
};

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
  hashtag?: string;
  source: string;
  status:
    | "scraped"
    | "downloading"
    | "downloaded"
    | "analyzing"
    | "analyzed"
    | "failed";
  localPath?: string;
  s3Key?: string;
  errorMessage?: string;
  // Progress tracking
  progress: number;
  progressStage: string;
  progressMessage: string;
  lastActivityAt?: string;
  // Optional logs
  recentLogs?: ReelLog[];
  scrapedAt: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Генерирует компактный промпт для Veo3.
 * Только самая важная информация в формате, который Veo3 понимает лучше всего.
 */
export function formatFullVeo3Prompt(analysis: VideoAnalysis): string {
  // Основной промпт уже содержит всё необходимое
  // Добавляем только критичные детали, которые могут быть потеряны
  const parts = [
    analysis.veo3Prompt,
    "",
    "---",
    `Camera: ${analysis.cameraWork}`,
    `Lighting: ${analysis.lighting}`,
    `Color grade: ${analysis.colorPalette}`,
    `Style: ${analysis.style}, ${analysis.pacing}`,
  ];

  return parts.join("\n");
}

type AnalyzeVideoResponse = {
  success: boolean;
  analysis: VideoAnalysis;
  analysisId: string;
};

type AnalyzeVideoError = {
  error: string;
};

type GenerateVideoResponse = {
  success: boolean;
  generationId: string;
};

type GenerationStatusResponse = {
  success: boolean;
  generation: VideoGeneration;
};

type AnalysesListResponse = {
  success: boolean;
  analyses: VideoAnalysisWithId[];
  total: number;
};

type GenerationsListResponse = {
  success: boolean;
  generations: VideoGeneration[];
  total: number;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export type AnalyzeVideoResult = {
  analysis: VideoAnalysis;
  analysisId: string;
};

export async function analyzeVideo(file: File): Promise<AnalyzeVideoResult> {
  const formData = new FormData();
  formData.append("video", file);

  const response = await fetch(`${API_URL}/api/video/analyze`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = (await response.json()) as AnalyzeVideoError;
    throw new Error(errorData.error || "Failed to analyze video");
  }

  const data = (await response.json()) as AnalyzeVideoResponse;
  return {
    analysis: data.analysis,
    analysisId: data.analysisId,
  };
}

export type AnalyzeDownloadedRequest = {
  hashtag: string;
  filename: string;
};

export async function analyzeDownloadedVideo(
  request: AnalyzeDownloadedRequest
): Promise<AnalyzeVideoResult> {
  const response = await fetch(`${API_URL}/api/video/analyze-downloaded`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = (await response.json()) as AnalyzeVideoError;
    throw new Error(errorData.error || "Failed to analyze video");
  }

  const data = (await response.json()) as AnalyzeVideoResponse;
  return {
    analysis: data.analysis,
    analysisId: data.analysisId,
  };
}

export type AnalyzeReelRequest = {
  reelId: string;
  url: string;
};

export async function analyzeReelByUrl(
  request: AnalyzeReelRequest
): Promise<AnalyzeVideoResult> {
  const response = await fetch(`${API_URL}/api/video/analyze-reel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = (await response.json()) as AnalyzeVideoError;
    throw new Error(errorData.error || "Failed to analyze reel");
  }

  const data = (await response.json()) as AnalyzeVideoResponse;
  return {
    analysis: data.analysis,
    analysisId: data.analysisId,
  };
}

// Video Generation API

export type GenerateVideoRequest = {
  analysisId: string;
  provider: VideoProvider;
  prompt: string;
};

export async function generateVideo(
  request: GenerateVideoRequest
): Promise<string> {
  const response = await fetch(`${API_URL}/api/video/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = (await response.json()) as AnalyzeVideoError;
    throw new Error(errorData.error || "Failed to start video generation");
  }

  const data = (await response.json()) as GenerateVideoResponse;
  return data.generationId;
}

export async function getGenerationStatus(
  generationId: string
): Promise<VideoGeneration> {
  const response = await fetch(
    `${API_URL}/api/video/generation/${generationId}`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    const errorData = (await response.json()) as AnalyzeVideoError;
    throw new Error(errorData.error || "Failed to get generation status");
  }

  const data = (await response.json()) as GenerationStatusResponse;
  return data.generation;
}

export async function listAnalyses(
  limit = 50,
  offset = 0
): Promise<{ analyses: VideoAnalysisWithId[]; total: number }> {
  const response = await fetch(
    `${API_URL}/api/video/analyses?limit=${limit}&offset=${offset}`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    const errorData = (await response.json()) as AnalyzeVideoError;
    throw new Error(errorData.error || "Failed to list analyses");
  }

  const data = (await response.json()) as AnalysesListResponse;
  return {
    analyses: data.analyses,
    total: data.total,
  };
}

export async function listGenerations(
  limit = 50,
  offset = 0,
  status?: string
): Promise<{ generations: VideoGeneration[]; total: number }> {
  let url = `${API_URL}/api/video/generations?limit=${limit}&offset=${offset}`;
  if (status) {
    url += `&status=${status}`;
  }

  const response = await fetch(url, {
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = (await response.json()) as AnalyzeVideoError;
    throw new Error(errorData.error || "Failed to list generations");
  }

  const data = (await response.json()) as GenerationsListResponse;
  return {
    generations: data.generations,
    total: data.total,
  };
}

/**
 * Get reel by ID with optional logs
 */
export async function getReel(
  reelId: string,
  includeLogs = false
): Promise<Reel> {
  const params = includeLogs ? "?includeLogs=true" : "";
  const response = await fetch(
    `${API_URL}/api/reels/saved/${reelId}${params}`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    const errorData = (await response.json()) as AnalyzeVideoError;
    throw new Error(errorData.error || "Failed to get reel");
  }

  return response.json();
}

/**
 * Get generation logs
 */
export type GenerationLogsResponse = {
  success: boolean;
  generation: {
    id: string;
    status: string;
    progress: number;
    progressStage: string;
    progressMessage: string;
    klingProgress?: number;
    lastActivityAt?: string;
  };
  logs: ReelLog[];
};

export async function getGenerationLogs(
  generationId: string
): Promise<GenerationLogsResponse> {
  const response = await fetch(
    `${API_URL}/api/video/generation/${generationId}/logs`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    const errorData = (await response.json()) as AnalyzeVideoError;
    throw new Error(errorData.error || "Failed to get generation logs");
  }

  return response.json();
}

// ============================================
// PIPELINE GENERATION API (async with polling)
// ============================================

export type PipelineGenerateResponse = {
  success: boolean;
  reelId: string;
  jobId: string;
  status: string;
  message: string;
};

export type PipelineStatusResponse = {
  reelId: string;
  status: string;
  progress: number;
  progressStage: string;
  progressMessage: string;
  analysis: VideoAnalysisWithId | null;
  template: {
    id: string;
    tags: string[];
    category: string;
    generationCount: number;
  } | null;
  error?: string;
};

/**
 * Start async pipeline processing for a video URL
 * Returns immediately with reelId for polling
 */
export async function startPipelineGeneration(
  url: string,
  forceReprocess = false
): Promise<PipelineGenerateResponse> {
  const response = await fetch(`${API_URL}/api/pipeline/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, forceReprocess }),
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = (await response.json()) as AnalyzeVideoError;
    throw new Error(errorData.error || "Failed to start pipeline generation");
  }

  return response.json();
}

/**
 * Upload a video file for pipeline processing
 * Returns immediately with reelId for polling
 */
export async function uploadPipelineVideo(
  file: File
): Promise<PipelineGenerateResponse> {
  const formData = new FormData();
  formData.append("video", file);

  const response = await fetch(`${API_URL}/api/pipeline/upload`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = (await response.json()) as AnalyzeVideoError;
    throw new Error(errorData.error || "Failed to upload video to pipeline");
  }

  return response.json();
}

/**
 * Get pipeline processing status (for polling)
 * Returns progress, and when complete - full analysis and template
 */
export async function getPipelineStatus(
  reelId: string
): Promise<PipelineStatusResponse> {
  const response = await fetch(`${API_URL}/api/pipeline/status/${reelId}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = (await response.json()) as AnalyzeVideoError;
    throw new Error(errorData.error || "Failed to get pipeline status");
  }

  return response.json();
}

// ============================================
// VIDEO TRIM API
// ============================================

export type TrimVideoRequest = {
  video: File;
  startTime: number;
  endTime: number;
};

/**
 * Trim video between startTime and endTime
 * Returns trimmed video as Blob
 */
export async function trimVideo(request: TrimVideoRequest): Promise<Blob> {
  const formData = new FormData();
  formData.append("video", request.video);
  formData.append("startTime", request.startTime.toString());
  formData.append("endTime", request.endTime.toString());

  const response = await fetch(`${API_URL}/api/trim`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = (await response.json()) as AnalyzeVideoError;
    throw new Error(errorData.error || "Failed to trim video");
  }

  return response.blob();
}

export type TrimVideoByUrlRequest = {
  videoUrl: string;
  startTime: number;
  endTime: number;
};

/**
 * Trim video by URL between startTime and endTime
 * Downloads the video first, then trims it
 * Returns trimmed video as Blob
 */
export async function trimVideoByUrl(
  request: TrimVideoByUrlRequest
): Promise<Blob> {
  // Download the video first
  const videoResponse = await fetch(request.videoUrl, {
    credentials: "include",
  });

  if (!videoResponse.ok) {
    throw new Error("Не удалось скачать видео для обрезки");
  }

  const videoBlob = await videoResponse.blob();
  const videoFile = new File([videoBlob], "video.mp4", { type: "video/mp4" });

  return trimVideo({
    video: videoFile,
    startTime: request.startTime,
    endTime: request.endTime,
  });
}
