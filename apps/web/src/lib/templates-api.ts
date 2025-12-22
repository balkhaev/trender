const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// Types
export type TemplateReel = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  likeCount: number | null;
  author: string | null;
  source: string;
};

// Scene in the video
export type VideoScene = {
  timestamp: string;
  description: string;
  action: string;
};

// Character in the video
export type VideoCharacter = {
  id: string;
  age: string;
  gender: string;
  appearance: string;
  clothing: string;
  actions: string;
};

// Object in the video
export type VideoObject = {
  name: string;
  role: string;
  position: string;
  description: string;
};

// Camera movement
export type CameraMovement = {
  type: string;
  direction: string;
  speed: string;
  startTime: string;
  endTime: string;
};

// Audio description
export type VideoAudio = {
  music: string;
  speech: string;
  effects: string;
  mood: string;
};

export type AnalysisType = "standard" | "frames";

export type TemplateAnalysis = {
  id: string;
  analysisType: AnalysisType;
  createdAt?: string;
  // Quick mode fields
  subject: string;
  action: string;
  environment: string;
  cameraStyle: string;
  mood: string;
  colorPalette: string;
  style: string;
  duration: number | null;
  aspectRatio: string;
  // Pro mode fields
  scenes: VideoScene[];
  characters: VideoCharacter[];
  objects: VideoObject[];
  cameraMovements: CameraMovement[];
  lighting: string;
  transitions: { type: string; timestamp: string }[];
  audio: VideoAudio;
  textOverlays: {
    text: string;
    timestamp: string;
    position: string;
    style: string;
  }[];
  // Prompts
  klingPrompt: string;
  veo3Prompt: string;
  tags: string[];
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
    analysis: TemplateAnalysis;
  } | null;
  // All analyses for this reel (for comparison)
  analyses: TemplateAnalysis[];
  // Source video URL for generation
  videoUrl: string | null;
  generations: VideoGeneration[];
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
