/**
 * Типы для видео анализа и генерации
 */

export type VideoProvider = "veo3" | "sora2" | "kling";

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

export type VideoGenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type VideoGeneration = {
  id: string;
  analysisId: string;
  provider: VideoProvider;
  status: VideoGenerationStatus;
  prompt: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  progress: number;
  progressStage: string;
  progressMessage: string;
  klingProgress?: number;
  lastActivityAt?: string;
  imageReferences?: string[];
  remixSource?: string | null;
};

export type SceneGenerationStatus =
  | "none"
  | "pending"
  | "processing"
  | "completed"
  | "original";

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

/**
 * Форматирует полный промпт для Veo3
 */
export function formatFullVeo3Prompt(analysis: VideoAnalysis): string {
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
