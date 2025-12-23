/**
 * Scene-based Video Analysis Service
 * Analyzes video with scene detection using PySceneDetect
 * Each scene is analyzed separately via Gemini
 */
import prisma from "@trender/db";
import type { ReelStatus } from "@trender/db/enums";
import { services } from "../../config";
import { type GeminiProgressCallback, getGeminiService } from "../gemini";
import { getOpenAIService, isOpenAIConfigured } from "../openai";
import { pipelineLogger } from "../pipeline-logger";
import { getS3Key, isS3Configured, s3Service } from "../s3";
import { loadVideoBuffer } from "../video/video-loader";

// Service URLs
const VIDEO_FRAMES_SERVICE_URL = services.videoFrames;

// Prisma types
type Reel = NonNullable<Awaited<ReturnType<typeof prisma.reel.findFirst>>>;
type VideoAnalysis = NonNullable<
  Awaited<ReturnType<typeof prisma.videoAnalysis.findFirst>>
>;

/**
 * Callbacks for progress updates during analysis
 */
export type SceneAnalysisProgressCallbacks = {
  updateStatus: (
    reelId: string,
    status: ReelStatus,
    errorMessage?: string
  ) => Promise<Reel>;
  updateProgress: (
    reelId: string,
    stage: string,
    percent: number,
    message: string
  ) => Promise<void>;
};

/**
 * Scene info from PySceneDetect
 */
export type DetectedScene = {
  index: number;
  start_time: number;
  end_time: number;
  duration: number;
  start_frame: number;
  end_frame: number;
  thumbnail_base64?: string | null;
};

/**
 * Scene detection response from video-frames service
 */
type SceneDetectionResponse = {
  success: boolean;
  scenes: DetectedScene[];
  total_scenes: number;
  video_duration: number | null;
  error?: string;
};

/**
 * Frames extraction response
 */
type FramesResponse = {
  success: boolean;
  frames: string[];
  count: number;
  duration_sec: number | null;
  interval_sec: number;
  error?: string;
};

/**
 * RemixOption type for elements
 */
type RemixOption = {
  id: string;
  label: string;
  icon: string;
  prompt: string;
};

/**
 * Element with options type
 */
type ElementWithOptions = {
  id: string;
  type: "character" | "object" | "background";
  label: string;
  description: string;
  remixOptions: RemixOption[];
};

/**
 * Detect scenes in video using PySceneDetect
 */
async function detectScenes(
  buffer: Buffer,
  reelId: string,
  threshold = 27.0,
  minSceneLen = 1.0
): Promise<SceneDetectionResponse> {
  const formData = new FormData();
  formData.append(
    "video",
    new Blob([new Uint8Array(buffer)], { type: "video/mp4" }),
    `${reelId}.mp4`
  );
  formData.append("threshold", threshold.toString());
  formData.append("min_scene_len", minSceneLen.toString());
  formData.append("extract_thumbnails", "true");

  const response = await fetch(`${VIDEO_FRAMES_SERVICE_URL}/detect-scenes`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to detect scenes: ${errorText}`);
  }

  const data = (await response.json()) as SceneDetectionResponse;

  if (!data.success) {
    throw new Error(data.error || "Scene detection failed");
  }

  return data;
}

/**
 * Extract frames from a specific time range
 */
async function extractFramesInRange(
  buffer: Buffer,
  reelId: string,
  startTime: number,
  endTime: number,
  maxFrames = 5
): Promise<string[]> {
  const formData = new FormData();
  formData.append(
    "video",
    new Blob([new Uint8Array(buffer)], { type: "video/mp4" }),
    `${reelId}.mp4`
  );
  formData.append("start_time", startTime.toString());
  formData.append("end_time", endTime.toString());
  formData.append("max_frames", maxFrames.toString());

  const response = await fetch(
    `${VIDEO_FRAMES_SERVICE_URL}/extract-frames-range`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to extract frames: ${errorText}`);
  }

  const data = (await response.json()) as FramesResponse;

  if (!data.success || data.frames.length === 0) {
    throw new Error(data.error || "No frames extracted from range");
  }

  return data.frames;
}

/**
 * Upload scene thumbnail to S3
 */
async function uploadThumbnail(
  base64Data: string,
  analysisId: string,
  sceneIndex: number
): Promise<{ url: string; s3Key: string } | null> {
  if (!isS3Configured()) {
    return null;
  }

  try {
    const buffer = Buffer.from(base64Data, "base64");
    const s3Key = getS3Key(
      "scene-thumbnails",
      `${analysisId}_scene_${sceneIndex}`
    );
    await s3Service.uploadFile(s3Key, buffer, "image/jpeg");

    const url = await s3Service.getPublicUrl(s3Key);
    return { url, s3Key };
  } catch (error) {
    console.error(`Failed to upload thumbnail for scene ${sceneIndex}:`, error);
    return null;
  }
}

/**
 * Merge elements from Gemini with options from ChatGPT
 */
async function mergeElementsWithOptions(
  elements: Array<{
    id: string;
    type: "character" | "object" | "background";
    label: string;
    description: string;
  }>,
  reelId: string
): Promise<ElementWithOptions[]> {
  let elementsWithOptions: ElementWithOptions[] = elements.map((el) => ({
    ...el,
    remixOptions: [],
  }));

  console.log(
    `[mergeElementsWithOptions] OpenAI configured: ${isOpenAIConfigured()}, elements count: ${elements.length}`
  );

  if (isOpenAIConfigured() && elements.length > 0) {
    try {
      console.log(
        "[mergeElementsWithOptions] Calling OpenAI generateEnchantingOptions..."
      );
      const openaiService = getOpenAIService();
      const enchantingResults =
        await openaiService.generateEnchantingOptions(elements);
      console.log(
        `[mergeElementsWithOptions] OpenAI returned ${enchantingResults.length} results`
      );

      elementsWithOptions = elements.map((element) => {
        const enchantingResult = enchantingResults.find(
          (r) => r.id === element.id
        );
        return {
          id: element.id,
          type: element.type,
          label: element.label,
          description: element.description,
          remixOptions: enchantingResult?.remixOptions || [],
        };
      });
    } catch (openaiError) {
      await pipelineLogger.warn({
        reelId,
        stage: "analyze",
        message: `ChatGPT error: ${openaiError instanceof Error ? openaiError.message : String(openaiError)}`,
      });
    }
  }

  return elementsWithOptions;
}

/**
 * Analyze a single scene using Gemini
 */
async function analyzeScene(
  frames: string[],
  sceneIndex: number,
  onProgress: GeminiProgressCallback
): Promise<{
  elements: Array<{
    id: string;
    type: "character" | "object" | "background";
    label: string;
    description: string;
  }>;
  tags: string[];
}> {
  const geminiService = getGeminiService();

  // Use frames analysis for scene
  const analysis = await geminiService.analyzeFramesElementsOnly(
    frames,
    onProgress
  );

  // Prefix element IDs with scene index to make them unique
  const prefixedElements = analysis.elements.map((el) => ({
    ...el,
    id: `scene${sceneIndex}-${el.id}`,
  }));

  return {
    elements: prefixedElements,
    tags: analysis.tags,
  };
}

/**
 * Analyze video with scene detection
 * Main entry point for scene-based analysis
 */
export async function analyzeReelWithScenes(
  reelId: string,
  callbacks: SceneAnalysisProgressCallbacks,
  options: {
    threshold?: number;
    minSceneLen?: number;
  } = {}
): Promise<VideoAnalysis> {
  const { threshold = 27.0, minSceneLen = 1.0 } = options;

  const reel = await prisma.reel.findUnique({ where: { id: reelId } });
  if (!reel) {
    throw new Error(`Reel ${reelId} not found`);
  }

  if (!(reel.s3Key || reel.localPath)) {
    throw new Error(`Reel ${reelId} has no video file. Download first.`);
  }

  await callbacks.updateStatus(reelId, "analyzing");
  await callbacks.updateProgress(
    reelId,
    "analyze",
    0,
    "Начало анализа по сценам..."
  );

  const timer = pipelineLogger.startTimer(
    reelId,
    "analyze",
    "Analyzing video with scene detection"
  );

  const onProgress: GeminiProgressCallback = async (
    stage,
    percent,
    message
  ) => {
    await callbacks.updateProgress(reelId, stage, percent, message);
  };

  try {
    // 1. Load video buffer
    await onProgress("analyze", 2, "Загрузка видеофайла...");
    const buffer = await loadVideoBuffer(reel);

    // 2. Detect scenes using PySceneDetect
    await onProgress("processing", 5, "Детекция сцен в видео...");
    const sceneDetection = await detectScenes(
      buffer,
      reelId,
      threshold,
      minSceneLen
    );

    const scenesCount = sceneDetection.total_scenes;
    await onProgress(
      "processing",
      15,
      `Обнаружено ${scenesCount} сцен, анализируем...`
    );

    // If no scenes detected, treat entire video as one scene
    const scenesToProcess: DetectedScene[] =
      scenesCount === 0
        ? [
            {
              index: 0,
              start_time: 0,
              end_time: sceneDetection.video_duration || 10,
              duration: sceneDetection.video_duration || 10,
              start_frame: 0,
              end_frame: 0,
              thumbnail_base64: null,
            },
          ]
        : sceneDetection.scenes;

    // 3. Create VideoAnalysis record first
    const savedAnalysis = await prisma.videoAnalysis.create({
      data: {
        sourceType: "reel",
        sourceId: reelId,
        fileName: `${reelId}.mp4`,
        analysisType: "scenes",
        duration: sceneDetection.video_duration
          ? Math.round(sceneDetection.video_duration)
          : null,
        aspectRatio: "9:16", // Will be updated if needed
        tags: [],
        elements: [],
        hasScenes: true,
        scenesCount: scenesToProcess.length,
      },
    });

    // 4. Analyze each scene
    const progressPerScene = 70 / scenesToProcess.length;
    const allTags: string[] = [];

    for (let i = 0; i < scenesToProcess.length; i++) {
      const scene = scenesToProcess[i];
      const baseProgress = 15 + i * progressPerScene;

      await onProgress(
        "processing",
        Math.round(baseProgress),
        `Анализ сцены ${i + 1}/${scenesToProcess.length}...`
      );

      // Extract frames for this scene
      const sceneFrames = await extractFramesInRange(
        buffer,
        reelId,
        scene.start_time,
        scene.end_time,
        5 // 5 frames per scene
      );

      // Analyze scene with Gemini
      const sceneAnalysis = await analyzeScene(sceneFrames, i, async () => {});

      console.log(
        `[SceneAnalysis] Scene ${i}: Gemini found ${sceneAnalysis.elements.length} elements`
      );

      // Generate remix options with ChatGPT
      const elementsWithOptions = await mergeElementsWithOptions(
        sceneAnalysis.elements,
        reelId
      );

      console.log(
        `[SceneAnalysis] Scene ${i}: After ChatGPT, elements with options:`,
        elementsWithOptions.map((e) => ({
          id: e.id,
          label: e.label,
          remixOptionsCount: e.remixOptions?.length || 0,
        }))
      );

      // Collect tags
      allTags.push(...sceneAnalysis.tags);

      // Upload thumbnail if available
      let thumbnailUrl: string | null = null;
      let thumbnailS3Key: string | null = null;

      if (scene.thumbnail_base64) {
        const uploadResult = await uploadThumbnail(
          scene.thumbnail_base64,
          savedAnalysis.id,
          i
        );
        if (uploadResult) {
          thumbnailUrl = uploadResult.url;
          thumbnailS3Key = uploadResult.s3Key;
        }
      }

      // Save scene to database
      await prisma.videoScene.create({
        data: {
          analysisId: savedAnalysis.id,
          index: i,
          startTime: scene.start_time,
          endTime: scene.end_time,
          duration: scene.duration,
          thumbnailUrl,
          thumbnailS3Key,
          elements: elementsWithOptions,
          generationStatus: "none",
        },
      });
    }

    // 5. Update analysis with aggregated tags
    const uniqueTags = [...new Set(allTags)];
    await prisma.videoAnalysis.update({
      where: { id: savedAnalysis.id },
      data: {
        tags: uniqueTags,
      },
    });

    await onProgress("analyze", 95, "Сохранение результатов...");

    // 6. Fetch updated analysis with scenes
    const finalAnalysis = await prisma.videoAnalysis.findUnique({
      where: { id: savedAnalysis.id },
      include: { videoScenes: { orderBy: { index: "asc" } } },
    });

    await onProgress("analyze", 100, "Анализ по сценам завершён");
    await timer.stop("Video analyzed with scene detection", {
      scenesCount: scenesToProcess.length,
      tags: uniqueTags,
    });

    return finalAnalysis!;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    await callbacks.updateProgress(
      reelId,
      "analyze",
      0,
      `Ошибка: ${err.message}`
    );
    await timer.fail(err);
    await callbacks.updateStatus(reelId, "failed", err.message);
    throw err;
  }
}

/**
 * Get scenes for an analysis
 */
export async function getScenesForAnalysis(analysisId: string) {
  return prisma.videoScene.findMany({
    where: { analysisId },
    orderBy: { index: "asc" },
    include: {
      generations: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
}

/**
 * Scene Analysis Service singleton
 */
class SceneAnalysisService {
  async analyzeReelWithScenes(
    reelId: string,
    callbacks: SceneAnalysisProgressCallbacks,
    options?: { threshold?: number; minSceneLen?: number }
  ): Promise<VideoAnalysis> {
    return analyzeReelWithScenes(reelId, callbacks, options);
  }

  async getScenes(analysisId: string) {
    return getScenesForAnalysis(analysisId);
  }

  async detectScenes(
    buffer: Buffer,
    reelId: string,
    threshold?: number,
    minSceneLen?: number
  ) {
    return detectScenes(buffer, reelId, threshold, minSceneLen);
  }
}

export const sceneAnalysisService = new SceneAnalysisService();
