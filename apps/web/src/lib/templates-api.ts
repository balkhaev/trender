import { API_URL } from "./api-client";

// Types
export type TemplateReel = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  likeCount: number | null;
  author: string | null;
  source: string;
};

// Remix option for element transformation
export type RemixOption = {
  id: string;
  label: string;
  icon: string;
  prompt: string;
};

// Element appearance in a scene
export type ElementAppearance = {
  sceneIndex: number;
  startTime: number;
  endTime: number;
};

// Video element with scene appearances
export type VideoElement = {
  id: string;
  type: "character" | "object" | "background";
  label: string;
  description: string;
  remixOptions: RemixOption[];
  appearances: ElementAppearance[];
  thumbnailUrl?: string | null;
};

// Scene detected by PySceneDetect
export type VideoScene = {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  thumbnailUrl: string | null;
  thumbnailS3Key: string | null;
  elementIds: string[];
  generationStatus:
    | "none"
    | "pending"
    | "processing"
    | "completed"
    | "original";
};

export type AnalysisType = "standard" | "frames" | "scenes";

// Legacy element format (without appearances)
export type LegacyElement = {
  id: string;
  type: "character" | "object" | "background";
  label: string;
  description: string;
  remixOptions: RemixOption[];
};

// Analysis result with unified elements
export type TemplateAnalysis = {
  id: string;
  analysisType: AnalysisType;
  createdAt?: string;
  duration: number | null;
  aspectRatio: string;
  style?: string;
  klingPrompt?: string;
  tags?: string[];
  // Legacy elements JSON (for standard/frames analysis)
  elements?: LegacyElement[];
  // Unified elements with scene appearances (for scenes analysis)
  videoElements?: VideoElement[];
  // Scene data
  scenesCount?: number;
  videoScenes?: VideoScene[];
};

export type Template = {
  id: string;
  title: string | null;
  tags: string[];
  category: string | null;
  generationCount: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  reel: TemplateReel;
  analysis: TemplateAnalysis;
};

export type TemplateWithGenerations = Template & {
  analysis: TemplateAnalysis & {
    generations: {
      id: string;
      provider: string;
      status: string;
      videoUrl: string | null;
      createdAt: string;
    }[];
  };
};

export type TemplatesListResponse = {
  templates: Template[];
  total: number;
  limit: number;
  offset: number;
};

export type TemplateParams = {
  limit?: number;
  offset?: number;
  category?: string;
  tag?: string;
  published?: boolean;
};

export type VideoGeneration = {
  id: string;
  provider: string;
  status: string;
  prompt: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  /** Image reference URLs used in this generation */
  imageReferences: string[];
  /** ID of the source reel used for remix */
  remixSource: string | null;
  // Progress tracking
  progress: number;
  progressStage: string;
  progressMessage: string;
  klingProgress?: number;
  lastActivityAt?: string;
};

export type SceneGeneration = {
  id: string;
  sceneId: string;
  status: string;
  prompt: string;
  provider: string;
  videoUrl: string | null;
  s3Key: string | null;
  error: string | null;
  progress: number;
  progressStage: string;
  progressMessage: string;
  createdAt: string;
  completedAt: string | null;
  scene?: {
    index: number;
    startTime: number;
    endTime: number;
    duration: number;
    thumbnailUrl: string | null;
  };
};

export type SceneConfig = {
  sceneId: string;
  sceneIndex: number;
  useOriginal: boolean;
  generationId?: string;
  startTime: number;
  endTime: number;
};

export type CompositeGeneration = {
  id: string;
  analysisId: string;
  status: string;
  sceneConfig: SceneConfig[];
  videoUrl: string | null;
  s3Key: string | null;
  error: string | null;
  progress: number;
  progressStage: string;
  progressMessage: string;
  createdAt: string;
  completedAt: string | null;
};

export type CategoryMeta = {
  name: string | null;
  count: number;
};

export type TagMeta = {
  name: string;
  count: number;
};

// API functions
export async function getTemplates(
  params: TemplateParams = {}
): Promise<TemplatesListResponse> {
  const searchParams = new URLSearchParams();
  if (params.limit) {
    searchParams.set("limit", params.limit.toString());
  }
  if (params.offset) {
    searchParams.set("offset", params.offset.toString());
  }
  if (params.category) {
    searchParams.set("category", params.category);
  }
  if (params.tag) {
    searchParams.set("tag", params.tag);
  }
  if (params.published !== undefined) {
    searchParams.set("published", params.published.toString());
  }

  const response = await fetch(
    `${API_URL}/api/templates?${searchParams.toString()}`,
    { credentials: "include" }
  );

  if (!response.ok) {
    throw new Error("Failed to get templates");
  }

  return response.json();
}

export async function getTemplate(
  id: string
): Promise<TemplateWithGenerations> {
  const response = await fetch(`${API_URL}/api/templates/${id}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get template");
  }

  const data = await response.json();
  return data.template;
}

export async function updateTemplate(
  id: string,
  data: {
    title?: string;
    tags?: string[];
    category?: string;
    isPublished?: boolean;
    isFeatured?: boolean;
  }
): Promise<Template> {
  const response = await fetch(`${API_URL}/api/templates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to update template");
  }

  const result = await response.json();
  return result.template;
}

/**
 * Image element for Kling multi-image reference
 */
export type KlingImageElement = {
  referenceImageUrls: string[];
  frontalImageUrl?: string;
};

/**
 * Options for Kling video generation
 */
export type KlingGenerationOptions = {
  duration?: number; // 1-10 seconds
  aspectRatio?: "16:9" | "9:16" | "1:1" | "auto";
  keepAudio?: boolean;
  /** Image URLs for @Image1, @Image2... references */
  imageUrls?: string[];
  /** Elements for @Element1, @Element2... references (subjects/characters) */
  elements?: KlingImageElement[];
};

/**
 * Response from image upload endpoint
 */
export type UploadReferenceResponse = {
  success: boolean;
  url: string;
  s3Key: string;
  imageId: string;
};

export async function generateFromTemplate(
  templateId: string,
  customPrompt?: string,
  options?: KlingGenerationOptions
): Promise<string> {
  const response = await fetch(
    `${API_URL}/api/templates/${templateId}/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customPrompt, options }),
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to start generation");
  }

  const data = await response.json();
  return data.generationId;
}

// Generate video with change prompt (video-to-video)
export async function generateVideo(
  analysisId: string,
  prompt: string,
  sourceVideoUrl: string,
  options?: KlingGenerationOptions
): Promise<string> {
  const response = await fetch(`${API_URL}/api/video/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysisId, prompt, sourceVideoUrl, options }),
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to start generation");
  }

  const data = await response.json();
  return data.generationId;
}

/**
 * Upload an image reference for remix generation
 * Returns the URL that can be used in Kling API
 */
export async function uploadImageReference(
  file: File
): Promise<UploadReferenceResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/api/video/upload-reference`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upload image");
  }

  return response.json();
}

// Update analysis (for Pro mode editing)
export async function updateAnalysis(
  analysisId: string,
  data: Partial<Omit<TemplateAnalysis, "id">>
): Promise<TemplateAnalysis> {
  const response = await fetch(`${API_URL}/api/video/analysis/${analysisId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update analysis");
  }

  const result = await response.json();
  return result.analysis;
}

export async function getTemplateGenerations(
  templateId: string
): Promise<VideoGeneration[]> {
  const response = await fetch(
    `${API_URL}/api/templates/${templateId}/generations`,
    { credentials: "include" }
  );

  if (!response.ok) {
    throw new Error("Failed to get generations");
  }

  const data = await response.json();
  return data.generations;
}

export async function getCategories(): Promise<CategoryMeta[]> {
  const response = await fetch(`${API_URL}/api/templates/meta/categories`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get categories");
  }

  const data = await response.json();
  return data.categories;
}

export async function getTags(): Promise<TagMeta[]> {
  const response = await fetch(`${API_URL}/api/templates/meta/tags`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get tags");
  }

  const data = await response.json();
  return data.tags;
}

// Reel debug API
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];

export type ReelLog = {
  id: string;
  reelId: string;
  level: "debug" | "info" | "warn" | "error";
  stage: string;
  message: string;
  metadata: Record<string, JsonValue> | null;
  duration: number | null;
  createdAt: string;
};

export type StageStats = {
  stage: string;
  count: number;
  totalDuration: number;
  errors: number;
};

export type AILogDetail = {
  id: string;
  reelId: string | null;
  generationId: string | null;
  provider: "gemini" | "openai" | "kling";
  operation: string;
  model: string | null;
  status: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  inputMeta: Record<string, unknown> | null;
  outputMeta: Record<string, unknown> | null;
  createdAt: string;
};

export type ReelDebugInfo = {
  reel: {
    id: string;
    url: string;
    status: string;
    likeCount: number | null;
    viewCount?: number | null;
    commentCount?: number | null;
    duration?: number | null;
    caption?: string | null;
    author?: string | null;
    thumbnailUrl?: string | null;
    videoUrl?: string | null;
    source: string;
    localPath: string | null;
    s3Key: string | null;
    errorMessage: string | null;
    scrapedAt: string;
    updatedAt: string;
  };
  logs: ReelLog[];
  stageStats: StageStats[];
  recentErrors: ReelLog[];
  template: {
    id: string;
    title: string | null;
    tags: string[];
    category: string | null;
    isFeatured: boolean;
    analysis: TemplateAnalysis;
  } | null;
  // All analyses for this reel (for comparison)
  analyses: TemplateAnalysis[];
  // Source video URL for generation
  videoUrl: string | null;
  generations: VideoGeneration[];
  sceneGenerations: SceneGeneration[];
  compositeGenerations: CompositeGeneration[];
  // AI logs for debugging API requests/responses
  aiLogs?: AILogDetail[];
};

export async function getReelDebug(reelId: string): Promise<ReelDebugInfo> {
  const response = await fetch(`${API_URL}/api/reels/${reelId}/debug`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get reel debug info");
  }

  return response.json();
}

export async function getReelLogs(
  reelId: string,
  stage?: string
): Promise<ReelLog[]> {
  const params = stage ? `?stage=${stage}` : "";
  const response = await fetch(`${API_URL}/api/reels/${reelId}/logs${params}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to get reel logs");
  }

  const data = await response.json();
  return data.logs;
}

export async function processReel(
  reelId: string,
  options?: {
    skipDownload?: boolean;
    skipAnalysis?: boolean;
    forceReprocess?: boolean;
  }
): Promise<{ jobId: string }> {
  const response = await fetch(`${API_URL}/api/reels/${reelId}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options ?? {}),
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to start processing");
  }

  return response.json();
}

export async function downloadReel(reelId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/reels/${reelId}/download`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to start download");
  }
}

export type ResizeResult = {
  success: boolean;
  resized: boolean;
  originalWidth: number;
  newWidth?: number;
  message: string;
};

export async function resizeReel(reelId: string): Promise<ResizeResult> {
  const response = await fetch(`${API_URL}/api/reels/${reelId}/resize`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to resize video");
  }

  return response.json();
}

export type BatchResizeResult = {
  success: boolean;
  processed: number;
  resized: number;
  alreadyValid: number;
  failed: number;
  results: Array<{
    id: string;
    success: boolean;
    resized?: boolean;
    error?: string;
  }>;
};

export async function batchResizeReels(
  reelIds: string[]
): Promise<BatchResizeResult> {
  const response = await fetch(`${API_URL}/api/reels/batch-resize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reelIds }),
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to batch resize");
  }

  return response.json();
}

export async function analyzeReel(reelId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/reels/${reelId}/analyze`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to start analysis");
  }
}

export async function analyzeReelByFrames(reelId: string): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/reels/${reelId}/analyze-frames`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error("Failed to start frame analysis");
  }
}

// ===== Feed API =====

export type FeedType = "trends" | "community" | "bookmarks";

export type FeedTemplateItem = {
  id: string;
  title: string | null;
  tags: string[];
  category: string | null;
  thumbnailUrl: string;
  previewVideoUrl?: string;
  generationCount: number;
  isBookmarked?: boolean;
  reel: {
    id: string;
    author: string | null;
    likeCount: number | null;
  };
  elements: {
    id: string;
    type: "character" | "object" | "background";
    label: string;
  }[];
};

export type FeedResponse = {
  items: FeedTemplateItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type FeedParams = {
  type?: FeedType;
  limit?: number;
  cursor?: string;
  category?: string;
  tags?: string;
  sort?: "popular" | "recent" | "trending";
};

export async function getFeed(params: FeedParams = {}): Promise<FeedResponse> {
  const searchParams = new URLSearchParams();
  if (params.type) searchParams.set("type", params.type);
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.category) searchParams.set("category", params.category);
  if (params.tags) searchParams.set("tags", params.tags);
  if (params.sort) searchParams.set("sort", params.sort);

  const response = await fetch(
    `${API_URL}/api/templates/feed?${searchParams.toString()}`,
    { credentials: "include" }
  );

  if (!response.ok) {
    throw new Error("Failed to get feed");
  }

  return response.json();
}

// ===== Search API =====

export type SearchResponse = {
  items: FeedTemplateItem[];
  total: number;
  query: string;
};

export type SearchParams = {
  q: string;
  limit?: number;
  offset?: number;
};

export async function searchTemplates(
  params: SearchParams
): Promise<SearchResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("q", params.q);
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.offset) searchParams.set("offset", params.offset.toString());

  const response = await fetch(
    `${API_URL}/api/templates/search?${searchParams.toString()}`,
    { credentials: "include" }
  );

  if (!response.ok) {
    throw new Error("Failed to search templates");
  }

  return response.json();
}

// ===== Bookmark API =====

export type BookmarkResponse = {
  bookmarked: boolean;
  templateId: string;
};

export async function addBookmark(
  templateId: string
): Promise<BookmarkResponse> {
  const response = await fetch(
    `${API_URL}/api/templates/${templateId}/bookmark`,
    {
      method: "POST",
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error("Failed to add bookmark");
  }

  return response.json();
}

export async function removeBookmark(
  templateId: string
): Promise<BookmarkResponse> {
  const response = await fetch(
    `${API_URL}/api/templates/${templateId}/bookmark`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error("Failed to remove bookmark");
  }

  return response.json();
}

// ===== Scene-based Generation API =====

/**
 * Тип для передачи на бэкенд
 */
export type SceneSelection = {
  sceneId: string;
  useOriginal: boolean;
  elementSelections?: {
    elementId: string;
    selectedOptionId?: string;
    customMediaUrl?: string;
  }[];
};

/**
 * Ответ от POST /api/generate
 */
export type GenerateResponse = {
  success: boolean;
  generationId?: string;
  compositeGenerationId?: string;
  type: "full" | "composite";
  status: "queued";
};

/**
 * Статус composite генерации
 */
export type CompositeStatus = {
  compositeGenerationId: string;
  status:
    | "pending"
    | "waiting"
    | "concatenating"
    | "uploading"
    | "completed"
    | "failed";
  progress: number;
  stage?: string;
  message?: string;
  result?: { videoUrl: string };
  error?: string;
};

/**
 * Запустить scene-based генерацию
 */
export async function generateWithScenes(
  analysisId: string,
  sceneSelections: SceneSelection[],
  options?: KlingGenerationOptions
): Promise<GenerateResponse> {
  const response = await fetch(`${API_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysisId, sceneSelections, options }),
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to start generation");
  }

  return response.json();
}

/**
 * Получить статус composite генерации
 */
export async function getCompositeStatus(
  compositeId: string
): Promise<CompositeStatus> {
  const response = await fetch(
    `${API_URL}/api/generate/${compositeId}/composite-status`,
    { credentials: "include" }
  );

  if (!response.ok) {
    throw new Error("Failed to get composite status");
  }

  return response.json();
}

/**
 * Перегенерировать конкретную сцену
 */
export async function regenerateScene(
  sceneId: string,
  options?: {
    prompt?: string;
    duration?: 5 | 10;
    aspectRatio?: "16:9" | "9:16" | "1:1" | "auto";
    keepAudio?: boolean;
    autoComposite?: boolean;
    useGeneratedAsSource?: boolean;
  }
): Promise<{
  success: boolean;
  sceneGenerationId: string;
  compositeGenerationId?: string;
  status: string;
}> {
  const response = await fetch(
    `${API_URL}/api/generate/scene/${sceneId}/regenerate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options || {}),
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to regenerate scene");
  }

  return response.json();
}

// ===== Delete Generation API =====

/**
 * Удалить VideoGeneration
 */
export async function deleteGeneration(generationId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/generate/${generationId}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete generation");
  }
}

/**
 * Удалить CompositeGeneration и связанные SceneGeneration
 */
export async function deleteCompositeGeneration(
  compositeId: string
): Promise<{ deletedScenes: number }> {
  const response = await fetch(
    `${API_URL}/api/generate/composite/${compositeId}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete composite generation");
  }

  return response.json();
}
