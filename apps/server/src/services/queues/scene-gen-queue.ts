/**
 * Scene Generation Queue
 * Handles generation of individual scenes and their concatenation
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import prisma from "@trender/db";
import { type Job as BullJob, Queue, Worker } from "bullmq";
import { paths, services } from "../../config";
import { getKlingService } from "../kling";
import { redis } from "../redis";
import { getS3Key, getS3PublicUrl, isS3Configured, s3Service } from "../s3";
import { registerQueue, registerWorker } from "./manager";
import type {
  CompositeGenJobData,
  CompositeGenJobProgress,
  CompositeGenJobResult,
  SceneGenJobData,
  SceneGenJobProgress,
  SceneGenJobResult,
} from "./types";

const VIDEO_FRAMES_SERVICE_URL = services.videoFrames;
const SCENE_GENERATIONS_DIR = join(paths.dataDir, "scene-generations");
const COMPOSITE_GENERATIONS_DIR = join(paths.dataDir, "composite-generations");

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

// ============================================================================
// Scene Generation Queue (single scene)
// ============================================================================

export const sceneGenQueue = new Queue<SceneGenJobData, SceneGenJobResult>(
  "scene-generation",
  {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 30,
      removeOnFail: 50,
      attempts: 2,
      backoff: {
        type: "fixed",
        delay: 60_000,
      },
    },
  }
);

registerQueue(sceneGenQueue);

/**
 * Trim video to specific time range using video-frames service
 */
async function trimVideo(
  sourceVideoUrl: string,
  startTime: number,
  endTime: number
): Promise<Buffer> {
  const { fetchWithTimeout, FETCH_TIMEOUTS } = await import(
    "../../utils/fetch-with-timeout"
  );

  // Download source video first (2 min timeout)
  const sourceResponse = await fetchWithTimeout(
    sourceVideoUrl,
    {},
    FETCH_TIMEOUTS.download
  );
  if (!sourceResponse.ok) {
    throw new Error(
      `Failed to download source video: ${sourceResponse.status}`
    );
  }
  const sourceBuffer = await sourceResponse.arrayBuffer();

  // Trim using video-frames service
  const formData = new FormData();
  formData.append(
    "video",
    new Blob([sourceBuffer], { type: "video/mp4" }),
    "source.mp4"
  );
  formData.append("start_time", startTime.toString());
  formData.append("end_time", endTime.toString());

  // 3 min timeout for trim operation
  const response = await fetchWithTimeout(
    `${VIDEO_FRAMES_SERVICE_URL}/trim`,
    {
      method: "POST",
      body: formData,
    },
    FETCH_TIMEOUTS.trim
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to trim video: ${errorText}`);
  }

  const trimmedBuffer = await response.arrayBuffer();
  return Buffer.from(trimmedBuffer);
}

/**
 * Upload trimmed video to S3 temporarily for Kling
 */
async function uploadTrimmedVideoForKling(
  buffer: Buffer,
  sceneGenerationId: string
): Promise<string> {
  if (!isS3Configured()) {
    throw new Error("S3 is required for scene generation");
  }

  const s3Key = getS3Key("scene-trimmed", sceneGenerationId);
  await s3Service.uploadFile(s3Key, buffer, "video/mp4");
  return getS3PublicUrl(s3Key);
}

export const sceneGenWorker = new Worker<SceneGenJobData, SceneGenJobResult>(
  "scene-generation",
  async (job) => {
    const {
      sceneGenerationId,
      sceneId,
      prompt,
      sourceVideoUrl,
      startTime,
      endTime,
      options,
    } = job.data;

    console.log(`[SceneGenQueue] Processing scene ${sceneGenerationId}`);

    try {
      // Update status
      await prisma.sceneGeneration.update({
        where: { id: sceneGenerationId },
        data: { status: "processing" },
      });

      await prisma.videoScene.update({
        where: { id: sceneId },
        data: { generationStatus: "processing" },
      });

      await updateSceneProgress(job, {
        stage: "analyzing" as any,
        percent: 5,
        message: "Обрезка видео до нужной сцены...",
      });

      // 1. Trim video to scene range
      const trimmedBuffer = await trimVideo(sourceVideoUrl, startTime, endTime);

      await updateSceneProgress(job, {
        stage: "analyzing" as any,
        percent: 15,
        message: "Загрузка обрезанного видео...",
      });

      // 2. Upload trimmed video for Kling
      const trimmedVideoUrl = await uploadTrimmedVideoForKling(
        trimmedBuffer,
        sceneGenerationId
      );

      console.log(
        "[SceneGenQueue] Trimmed video URL for Kling:",
        trimmedVideoUrl
      );

      await updateSceneProgress(job, {
        stage: "generating_character" as any,
        percent: 20,
        message: "Запуск генерации в Kling...",
      });

      // 3. Generate with Kling
      const kling = getKlingService();
      const result = await kling.generateVideoToVideo(trimmedVideoUrl, prompt, {
        duration: options?.duration || 5,
        aspectRatio: options?.aspectRatio || "auto",
        keepAudio: options?.keepAudio,
        imageUrls: options?.imageUrls,
        elements: options?.elements,
        negativePrompt: options?.negativePrompt,
        onProgress: async (status, klingProgress, message) => {
          let percent = 25;
          let stage: any = "generating_character";

          if (status === "processing") {
            percent =
              klingProgress !== undefined
                ? 25 + Math.floor(klingProgress * 0.45)
                : 40;

            if (percent > 60) stage = "applying_style";
            else if (percent > 40) stage = "setting_up_lighting";
          } else if (status === "completed") {
            percent = 70;
            stage = "rendering";
          }

          await updateSceneProgress(job, {
            stage,
            percent,
            message,
            klingProgress,
          });
        },
      });

      if (!(result.success && result.videoUrl)) {
        throw new Error(result.error || "Kling generation failed");
      }

      await updateSceneProgress(job, {
        stage: "rendering" as any,
        percent: 75,
        message: "Скачивание видео с Kling...",
      });

      // 4. Download and store result
      const videoBuffer = await kling.downloadVideo(result.videoUrl);

      await updateSceneProgress(job, {
        stage: "finalizing" as any,
        percent: 85,
        message: "Сохранение результата...",
      });

      // 5. Upload to S3
      let s3Key: string | undefined;
      let finalVideoUrl = result.videoUrl;

      if (isS3Configured()) {
        s3Key = getS3Key("scene-generations", sceneGenerationId);
        await s3Service.uploadFile(s3Key, videoBuffer, "video/mp4");
        finalVideoUrl = await getS3PublicUrl(s3Key);
      } else {
        // Fallback to local
        await ensureDir(SCENE_GENERATIONS_DIR);
        const localPath = join(
          SCENE_GENERATIONS_DIR,
          `${sceneGenerationId}.mp4`
        );
        await writeFile(localPath, videoBuffer);
        finalVideoUrl = `/api/scene-generations/${sceneGenerationId}/video`;
      }

      await updateSceneProgress(job, {
        stage: "finalizing" as any,
        percent: 95,
        message: "Завершение...",
      });

      // 6. Update records
      await prisma.sceneGeneration.update({
        where: { id: sceneGenerationId },
        data: {
          status: "completed",
          videoUrl: finalVideoUrl,
          s3Key,
          klingTaskId: result.taskId,
          progress: 100,
          progressStage: "finalizing",
          progressMessage: "Генерация сцены завершена",
          completedAt: new Date(),
        },
      });

      await prisma.videoScene.update({
        where: { id: sceneId },
        data: { generationStatus: "completed" },
      });

      console.log(`[SceneGenQueue] Scene ${sceneGenerationId} completed`);

      return {
        sceneGenerationId,
        videoUrl: finalVideoUrl,
        s3Key,
        klingTaskId: result.taskId,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[SceneGenQueue] Scene ${sceneGenerationId} failed:`,
        err.message
      );

      await prisma.sceneGeneration.update({
        where: { id: sceneGenerationId },
        data: {
          status: "failed",
          error: err.message,
          progress: 0,
          progressStage: "failed",
          progressMessage: `Ошибка: ${err.message}`,
        },
      });

      await prisma.videoScene.update({
        where: { id: sceneId },
        data: { generationStatus: "none" },
      });

      throw err;
    }
  },
  {
    connection: redis,
    concurrency: 3, // Up to 3 scenes in parallel
  }
);

registerWorker(sceneGenWorker);

async function updateSceneProgress(
  job: BullJob<SceneGenJobData>,
  options: SceneGenJobProgress
): Promise<void> {
  const { stage, percent, message, klingProgress } = options;
  await job.updateProgress(percent);

  await prisma.sceneGeneration.update({
    where: { id: job.data.sceneGenerationId },
    data: {
      progress: percent,
      progressStage: stage,
      progressMessage: message,
      lastActivityAt: new Date(),
    },
  });

  console.log(
    `[SceneGenQueue] Job ${job.id}: ${stage} - ${message} (${percent}%)` +
      (klingProgress !== undefined ? ` [Kling: ${klingProgress}%]` : "")
  );
}

// ============================================================================
// Composite Generation Queue (concatenate scenes)
// ============================================================================

export const compositeGenQueue = new Queue<
  CompositeGenJobData,
  CompositeGenJobResult
>("composite-generation", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 30,
    attempts: 2,
    backoff: {
      type: "fixed",
      delay: 30_000, // 30s между попытками
    },
  },
});

registerQueue(compositeGenQueue);

/**
 * Wait for a scene generation to complete with heartbeat
 * Обновляет lastActivityAt composite generation каждые 30 секунд
 */
async function waitForSceneGeneration(
  generationId: string,
  compositeGenerationId: string,
  timeoutMs: number = 30 * 60 * 1000 // 30 minutes
): Promise<string> {
  const startTime = Date.now();
  const heartbeatIntervalMs = 30_000; // 30 секунд
  let lastHeartbeat = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const generation = await prisma.sceneGeneration.findUnique({
      where: { id: generationId },
    });

    if (!generation) {
      throw new Error(`Scene generation ${generationId} not found`);
    }

    if (generation.status === "completed" && generation.videoUrl) {
      return generation.videoUrl;
    }

    if (generation.status === "failed") {
      throw new Error(`Scene generation failed: ${generation.error}`);
    }

    // Heartbeat: обновляем lastActivityAt и progressMessage
    if (Date.now() - lastHeartbeat >= heartbeatIntervalMs) {
      const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
      await prisma.compositeGeneration.update({
        where: { id: compositeGenerationId },
        data: {
          lastActivityAt: new Date(),
          progressMessage: `Ожидание сцены ${generationId.slice(0, 8)}... (${elapsedSec}s)`,
        },
      });
      lastHeartbeat = Date.now();
    }

    // Wait 5 seconds before next check
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`Scene generation ${generationId} timed out`);
}

/**
 * Concatenate videos using video-frames service
 */
async function concatenateVideos(videoUrls: string[]): Promise<Buffer> {
  const { fetchWithTimeout, FETCH_TIMEOUTS } = await import(
    "../../utils/fetch-with-timeout"
  );

  // Download all videos (2 min timeout per video)
  const videoBuffers: ArrayBuffer[] = [];

  for (const url of videoUrls) {
    const response = await fetchWithTimeout(url, {}, FETCH_TIMEOUTS.download);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${url}`);
    }
    videoBuffers.push(await response.arrayBuffer());
  }

  // Send to concat endpoint
  const formData = new FormData();
  for (let i = 0; i < videoBuffers.length; i++) {
    formData.append(
      "videos",
      new Blob([videoBuffers[i]], { type: "video/mp4" }),
      `video_${i}.mp4`
    );
  }

  // 5 min timeout for concat operation
  const response = await fetchWithTimeout(
    `${VIDEO_FRAMES_SERVICE_URL}/concat`,
    {
      method: "POST",
      body: formData,
    },
    FETCH_TIMEOUTS.concat
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to concatenate videos: ${errorText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export const compositeGenWorker = new Worker<
  CompositeGenJobData,
  CompositeGenJobResult
>(
  "composite-generation",
  async (job) => {
    const { compositeGenerationId, sourceVideoUrl, sceneConfigs } = job.data;

    console.log(
      `[CompositeGenQueue] Processing composite ${compositeGenerationId}`
    );

    try {
      await prisma.compositeGeneration.update({
        where: { id: compositeGenerationId },
        data: { status: "waiting" },
      });

      await updateCompositeProgress(job, {
        stage: "waiting",
        percent: 5,
        message: "Ожидание генерации сцен...",
        totalScenes: sceneConfigs.length,
        completedScenes: 0,
      });

      // 1. Wait for all scene generations to complete
      const videoSegments: { url: string; order: number }[] = [];
      let completedCount = 0;

      for (const config of sceneConfigs) {
        if (config.useOriginal) {
          // Trim original video for this scene
          const trimmedBuffer = await trimVideo(
            sourceVideoUrl,
            config.startTime,
            config.endTime
          );

          // Upload trimmed original
          const s3Key = getS3Key(
            "scene-original-trimmed",
            `${compositeGenerationId}_${config.sceneIndex}`
          );
          await s3Service.uploadFile(s3Key, trimmedBuffer, "video/mp4");
          const trimmedUrl = await getS3PublicUrl(s3Key);

          videoSegments.push({ url: trimmedUrl, order: config.sceneIndex });
        } else if (config.generationId) {
          // Wait for scene generation with heartbeat
          const generatedUrl = await waitForSceneGeneration(
            config.generationId,
            compositeGenerationId
          );
          videoSegments.push({ url: generatedUrl, order: config.sceneIndex });
        }

        completedCount++;
        await updateCompositeProgress(job, {
          stage: "waiting",
          percent: 5 + Math.floor((completedCount / sceneConfigs.length) * 40),
          message: `Подготовка сцен: ${completedCount}/${sceneConfigs.length}`,
          totalScenes: sceneConfigs.length,
          completedScenes: completedCount,
        });
      }

      await updateCompositeProgress(job, {
        stage: "concatenating",
        percent: 50,
        message: "Склейка видео...",
      });

      // 2. Sort by order and get URLs
      videoSegments.sort((a, b) => a.order - b.order);
      const orderedUrls = videoSegments.map((s) => s.url);

      // 3. Concatenate
      const concatenatedBuffer = await concatenateVideos(orderedUrls);

      await updateCompositeProgress(job, {
        stage: "uploading",
        percent: 80,
        message: "Загрузка результата...",
      });

      // 4. Upload final video
      let s3Key: string | undefined;
      let finalVideoUrl: string;

      if (isS3Configured()) {
        s3Key = getS3Key("composite-generations", compositeGenerationId);
        await s3Service.uploadFile(s3Key, concatenatedBuffer, "video/mp4");
        finalVideoUrl = await getS3PublicUrl(s3Key);
      } else {
        await ensureDir(COMPOSITE_GENERATIONS_DIR);
        const localPath = join(
          COMPOSITE_GENERATIONS_DIR,
          `${compositeGenerationId}.mp4`
        );
        await writeFile(localPath, concatenatedBuffer);
        finalVideoUrl = `/api/composite-generations/${compositeGenerationId}/video`;
      }

      await updateCompositeProgress(job, {
        stage: "completed",
        percent: 100,
        message: "Композитное видео готово",
      });

      // 5. Update record
      await prisma.compositeGeneration.update({
        where: { id: compositeGenerationId },
        data: {
          status: "completed",
          videoUrl: finalVideoUrl,
          s3Key,
          progress: 100,
          progressStage: "completed",
          progressMessage: "Композитное видео готово",
          completedAt: new Date(),
        },
      });

      console.log(
        `[CompositeGenQueue] Composite ${compositeGenerationId} completed`
      );

      return { compositeGenerationId, videoUrl: finalVideoUrl, s3Key };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[CompositeGenQueue] Composite ${compositeGenerationId} failed:`,
        err.message
      );

      await prisma.compositeGeneration.update({
        where: { id: compositeGenerationId },
        data: {
          status: "failed",
          error: err.message,
          progress: 0,
          progressStage: "failed",
          progressMessage: `Ошибка: ${err.message}`,
        },
      });

      throw err;
    }
  },
  {
    connection: redis,
    concurrency: 1, // One concat at a time
  }
);

registerWorker(compositeGenWorker);

async function updateCompositeProgress(
  job: BullJob<CompositeGenJobData>,
  options: CompositeGenJobProgress
): Promise<void> {
  const { stage, percent, message, completedScenes, totalScenes } = options;
  await job.updateProgress(percent);

  await prisma.compositeGeneration.update({
    where: { id: job.data.compositeGenerationId },
    data: {
      progress: percent,
      progressStage: stage,
      progressMessage: message,
      lastActivityAt: new Date(),
    },
  });

  console.log(
    `[CompositeGenQueue] Job ${job.id}: ${stage} - ${message} (${percent}%)` +
      (totalScenes ? ` [${completedScenes}/${totalScenes} scenes]` : "")
  );
}

// ============================================================================
// API for adding jobs
// ============================================================================

export const sceneGenJobQueue = {
  /**
   * Start generation for a single scene
   */
  async startSceneGeneration(
    sceneId: string,
    prompt: string,
    sourceVideoUrl: string,
    startTime: number,
    endTime: number,
    options?: SceneGenJobData["options"]
  ): Promise<string> {
    // Create SceneGeneration record
    const generation = await prisma.sceneGeneration.create({
      data: {
        sceneId,
        prompt,
        selectedElements: [],
        status: "pending",
      },
    });

    // Update scene status
    await prisma.videoScene.update({
      where: { id: sceneId },
      data: { generationStatus: "pending" },
    });

    // Get analysisId from scene
    const scene = await prisma.videoScene.findUnique({
      where: { id: sceneId },
    });

    const jobId = `scene-gen-${generation.id}`;

    // Add job to queue
    const job = await sceneGenQueue.add(
      "generate-scene",
      {
        sceneGenerationId: generation.id,
        sceneId,
        analysisId: scene!.analysisId,
        prompt,
        sourceVideoUrl,
        startTime,
        endTime,
        options,
      },
      { jobId }
    );

    // Save job ID
    await prisma.sceneGeneration.update({
      where: { id: generation.id },
      data: { jobId: job.id },
    });

    return generation.id;
  },

  /**
   * Start composite generation (concatenate scenes)
   */
  async startCompositeGeneration(
    analysisId: string,
    sourceVideoUrl: string,
    sceneConfigs: CompositeGenJobData["sceneConfigs"]
  ): Promise<string> {
    const composite = await prisma.compositeGeneration.create({
      data: {
        analysisId,
        sceneConfig: sceneConfigs,
        status: "pending",
      },
    });

    const jobId = `composite-gen-${composite.id}`;

    const job = await compositeGenQueue.add(
      "composite",
      {
        compositeGenerationId: composite.id,
        analysisId,
        sourceVideoUrl,
        sceneConfigs,
      },
      { jobId }
    );

    await prisma.compositeGeneration.update({
      where: { id: composite.id },
      data: { jobId: job.id },
    });

    return composite.id;
  },

  /**
   * Get pending count for scene generation queue
   */
  async getScenePendingCount(): Promise<number> {
    const counts = await sceneGenQueue.getJobCounts("waiting", "active");
    return (counts.waiting ?? 0) + (counts.active ?? 0);
  },

  /**
   * Get pending count for composite generation queue
   */
  async getCompositePendingCount(): Promise<number> {
    const counts = await compositeGenQueue.getJobCounts("waiting", "active");
    return (counts.waiting ?? 0) + (counts.active ?? 0);
  },
};
