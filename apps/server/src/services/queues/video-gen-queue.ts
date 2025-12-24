import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import prisma from "@trender/db";
import { type Job as BullJob, Queue, Worker } from "bullmq";
import { paths } from "../../config";
import { getKlingService } from "../kling";
import { getOpenAIService, isOpenAIConfigured } from "../openai";
import { redis } from "../redis";
import { getS3Key, isS3Configured, s3Service } from "../s3";
import {
  getGenerationLocalVideoPublicUrl,
  getGenerationVideoPublicUrl,
} from "../url-builder";
import { registerQueue, registerWorker } from "./manager";
import type {
  KlingImageElement,
  VideoGenJobData,
  VideoGenJobProgress,
  VideoGenJobResult,
} from "./types";

// Video generation output directory
const GENERATIONS_DIR = join(paths.dataDir, "generations");

async function ensureGenerationsDir(): Promise<void> {
  await mkdir(GENERATIONS_DIR, { recursive: true });
}

export function getGenerationsPath(filename?: string): string {
  return filename ? join(GENERATIONS_DIR, filename) : GENERATIONS_DIR;
}

// Create video generation queue
export const videoGenQueue = new Queue<VideoGenJobData, VideoGenJobResult>(
  "video-generation",
  {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 20,
      removeOnFail: 50,
      attempts: 2, // API is expensive, limit retries
      backoff: {
        type: "fixed",
        delay: 60_000, // 1 minute between retries
      },
    },
  }
);

registerQueue(videoGenQueue);

// Video generation worker (Kling video-to-video)
export const videoGenWorker = new Worker<VideoGenJobData, VideoGenJobResult>(
  "video-generation",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex job workflow with multiple status updates
  async (job) => {
    const { generationId, prompt, sourceVideoUrl, options } = job.data;

    console.log(`[VideoGenQueue] Processing Kling generation ${generationId}`);

    try {
      // Update status to processing
      await prisma.videoGeneration.update({
        where: { id: generationId },
        data: { status: "processing" },
      });

      await updateProgress(job, {
        stage: "processing",
        percent: 10,
        message: "Starting Kling video-to-video generation...",
      });

      // Check source video URL
      if (!sourceVideoUrl) {
        throw new Error(
          "Source video URL is required for video-to-video generation"
        );
      }

      // URL should already be a full public URL (from buildReelVideoUrl)
      // Validate that it's not a relative path
      if (sourceVideoUrl.startsWith("/api/")) {
        throw new Error(
          "Source video URL must be a full public URL, not a relative path. " +
            "Check that PUBLIC_URL is configured and buildReelVideoUrl is used."
        );
      }
      const publicVideoUrl = sourceVideoUrl;
      console.log(`[VideoGenQueue] Using video URL: ${publicVideoUrl}`);

      // Enhance prompt for Kling using ChatGPT
      let enhancedPrompt = prompt;
      if (isOpenAIConfigured()) {
        await updateProgress(job, {
          stage: "enhancing",
          percent: 12,
          message: "Enhancing prompt for Kling AI...",
        });
        const openai = getOpenAIService();
        enhancedPrompt = await openai.enhancePromptForKling(
          prompt,
          generationId
        );
        console.log(`[VideoGenQueue] Enhanced prompt: ${enhancedPrompt}`);
      }

      const startTime = Date.now();
      const kling = getKlingService();

      // Generate video using Kling OmniVideo with progress callback
      const result = await kling.generateVideoToVideo(
        publicVideoUrl,
        enhancedPrompt,
        {
          duration: options?.duration || 5,
          aspectRatio: options?.aspectRatio || "auto",
          keepAudio: options?.keepAudio,
          imageUrls: options?.imageUrls,
          elements: options?.elements,
          negativePrompt: options?.negativePrompt,
          onProgress: async (status, klingProgress, message) => {
            // Map Kling status to our progress percentage (10-60%)
            let percent = 15;
            if (status === "processing") {
              percent =
                klingProgress !== undefined
                  ? 15 + Math.floor(klingProgress * 0.45)
                  : 30;
            } else if (status === "completed") {
              percent = 60;
            }
            await updateProgress(job, {
              stage: "processing",
              percent,
              message,
              klingProgress,
            });
          },
        }
      );

      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`[VideoGenQueue] Kling API returned after ${duration}s:`, {
        success: result.success,
        hasVideoUrl: !!result.videoUrl,
        taskId: result.taskId,
        error: result.error,
      });

      await updateProgress(job, {
        stage: "processing",
        percent: 60,
        message: "API call completed",
      });

      if (result.success && result.videoUrl) {
        await updateProgress(job, {
          stage: "downloading",
          percent: 70,
          message: "Downloading video from Kling...",
        });

        // Download and store the video
        const downloadResult = await downloadKlingVideo(
          generationId,
          result.videoUrl
        );

        let s3Key: string | undefined;
        let videoUrl = result.videoUrl;

        if (downloadResult) {
          // Проверяем, была ли ошибка загрузки
          if (downloadResult.error) {
            console.warn(
              "[VideoGenQueue] Download failed but generation succeeded, using original URL"
            );
            // Используем оригинальный URL от Kling (временный, истечёт)
          } else {
            await updateProgress(job, {
              stage: "uploading",
              percent: 85,
              message: "Uploading to storage...",
            });

            if (downloadResult.s3Key) {
              s3Key = downloadResult.s3Key;
              videoUrl = getGenerationVideoPublicUrl(generationId);
            } else if (downloadResult.localPath) {
              videoUrl = getGenerationLocalVideoPublicUrl(generationId);
            }
          }
        }

        await updateProgress(job, {
          stage: "uploading",
          percent: 95,
          message: "Сохранение результата...",
        });

        // Update generation record
        await prisma.videoGeneration.update({
          where: { id: generationId },
          data: {
            status: "completed",
            videoUrl,
            s3Key,
            klingTaskId: result.taskId,
            completedAt: new Date(),
            progress: 100,
            progressStage: "completed",
            progressMessage: "Генерация завершена успешно",
            lastActivityAt: new Date(),
          },
        });

        console.log(
          `[VideoGenQueue] Generation ${generationId} completed successfully`
        );

        return { generationId, videoUrl, s3Key, klingTaskId: result.taskId };
      }

      // Generation failed
      await prisma.videoGeneration.update({
        where: { id: generationId },
        data: {
          status: "failed",
          error: result.error || "Unknown error",
          klingTaskId: result.taskId,
          progress: 0,
          progressStage: "failed",
          progressMessage: `Ошибка: ${result.error || "Неизвестная ошибка"}`,
          lastActivityAt: new Date(),
        },
      });

      console.log(
        `[VideoGenQueue] Generation ${generationId} failed: ${result.error}`
      );

      return { generationId, error: result.error, klingTaskId: result.taskId };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[VideoGenQueue] Job ${job.id} threw error:`, err.message);

      // Update generation status to failed
      await prisma.videoGeneration.update({
        where: { id: generationId },
        data: {
          status: "failed",
          error: err.message,
          progress: 0,
          progressStage: "failed",
          progressMessage: `Ошибка: ${err.message}`,
          lastActivityAt: new Date(),
        },
      });

      throw err;
    }
  },
  {
    connection: redis,
    concurrency: 2, // Process up to 2 generations in parallel (API rate limits)
  }
);

registerWorker(videoGenWorker);

// Helper to update job progress with details and persist to DB
type UpdateProgressOptions = {
  stage: VideoGenJobProgress["stage"];
  percent: number;
  message: string;
  klingProgress?: number;
};

async function updateProgress(
  job: BullJob<VideoGenJobData>,
  options: UpdateProgressOptions
): Promise<void> {
  const { stage, percent, message, klingProgress } = options;
  await job.updateProgress(percent);

  // Сохраняем прогресс в БД для polling с фронта
  await prisma.videoGeneration.update({
    where: { id: job.data.generationId },
    data: {
      progress: percent,
      progressStage: stage,
      progressMessage: message,
      klingProgress: klingProgress ?? undefined,
      lastActivityAt: new Date(),
    },
  });

  console.log(
    `[VideoGenQueue] Job ${job.id}: ${stage} - ${message} (${percent}%)${klingProgress !== undefined ? ` [Kling: ${klingProgress}%]` : ""}`
  );
}

// Download Kling video and upload to S3 (or save locally)
async function downloadKlingVideo(
  generationId: string,
  videoUrl: string
): Promise<{ s3Key?: string; localPath?: string; error?: string } | undefined> {
  try {
    console.log("[VideoGenQueue] Downloading Kling video...");

    const kling = getKlingService();
    const videoBuffer = await kling.downloadVideo(videoUrl);

    const s3Key = getS3Key("generations", generationId);

    // Try S3 first
    if (isS3Configured()) {
      try {
        await s3Service.uploadFile(s3Key, videoBuffer, "video/mp4");
        console.log(`[VideoGenQueue] Video uploaded to S3: ${s3Key}`);
        return { s3Key };
      } catch (s3Error) {
        const s3ErrorMsg =
          s3Error instanceof Error ? s3Error.message : String(s3Error);
        console.error(
          `[VideoGenQueue] S3 upload failed for ${generationId}: ${s3ErrorMsg}, falling back to local`
        );
      }
    }

    // Fallback to local storage
    await ensureGenerationsDir();
    const filename = `${generationId}.mp4`;
    const localPath = getGenerationsPath(filename);
    await writeFile(localPath, videoBuffer);

    console.log(`[VideoGenQueue] Video saved to ${localPath}`);
    return { localPath };
  } catch (downloadError) {
    const errorMsg =
      downloadError instanceof Error
        ? downloadError.message
        : String(downloadError);
    console.error(
      `[VideoGenQueue] Failed to download video for generation ${generationId}: ${errorMsg}`
    );

    // Сохраняем информацию об ошибке в БД
    await prisma.videoGeneration.update({
      where: { id: generationId },
      data: {
        progressMessage: `Ошибка загрузки видео: ${errorMsg}`,
        lastActivityAt: new Date(),
      },
    });

    return { error: errorMsg };
  }
}

// Worker events
videoGenWorker.on("completed", (job, result) => {
  console.log(
    `[VideoGenQueue] Job ${job.id} completed:`,
    `generation=${result.generationId}, url=${result.videoUrl}`
  );
});

videoGenWorker.on("failed", (job, error) => {
  console.error(`[VideoGenQueue] Job ${job?.id} failed:`, error.message);
});

videoGenWorker.on("stalled", (jobId) => {
  console.warn(`[VideoGenQueue] Job ${jobId} stalled`);
});

// Generation options for Kling
export type KlingGenerationOptions = {
  duration?: number; // 1-10 seconds
  aspectRatio?: "16:9" | "9:16" | "1:1" | "auto";
  keepAudio?: boolean;
  /** Image URLs for @Image1, @Image2... references */
  imageUrls?: string[];
  /** Elements for @Element1, @Element2... references */
  elements?: KlingImageElement[];
  /** Remix source reel ID */
  remixSource?: string;
};

// API for adding video generation jobs
export const videoGenJobQueue = {
  /**
   * Start a new Kling video-to-video generation
   * Creates DB record and adds job to queue
   */
  async startGeneration(
    analysisId: string,
    prompt: string,
    sourceVideoUrl: string,
    options?: KlingGenerationOptions
  ): Promise<string> {
    console.log(
      `[VideoGenQueue] Starting Kling generation for analysis ${analysisId}`
    );

    // Collect all image references for storage
    const imageReferences: string[] = [
      ...(options?.imageUrls || []),
      ...(options?.elements?.flatMap((el) => el.referenceImageUrls) || []),
    ];

    // Create generation record in pending state
    const generation = await prisma.videoGeneration.create({
      data: {
        analysisId,
        provider: "kling",
        prompt,
        status: "pending",
        sourceVideoUrl,
        outputDuration: options?.duration || 5,
        outputAspectRatio: options?.aspectRatio || "auto",
        keepAudio: options?.keepAudio,
        imageReferences,
        remixSource: options?.remixSource,
      },
    });

    const jobId = `video-gen-${generation.id}`;
    console.log(`[VideoGenQueue] Created generation record ${generation.id}`);

    // Add job to queue
    const job = await videoGenQueue.add(
      "generate",
      {
        generationId: generation.id,
        analysisId,
        provider: "kling",
        prompt,
        sourceVideoUrl,
        options,
      },
      { jobId }
    );

    // Save jobId in generation record
    await prisma.videoGeneration.update({
      where: { id: generation.id },
      data: { jobId: job.id },
    });

    console.log(`[VideoGenQueue] Added job ${job.id} to queue`);

    return generation.id;
  },

  /**
   * Get job status
   */
  async getJob(jobId: string) {
    const job = await videoGenQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress;

    return {
      id: job.id,
      generationId: job.data.generationId,
      provider: job.data.provider,
      state,
      progress,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
    };
  },

  /**
   * Get pending/active generations count
   */
  async getPendingCount(): Promise<number> {
    const counts = await videoGenQueue.getJobCounts("waiting", "active");
    return (counts.waiting ?? 0) + (counts.active ?? 0);
  },

  /**
   * Retry a failed generation
   */
  async retryGeneration(generationId: string): Promise<boolean> {
    // Try new format first
    let job = await videoGenQueue.getJob(`video-gen-${generationId}`);

    // Fallback to old format for backwards compatibility
    if (!job) {
      job = await videoGenQueue.getJob(`gen-${generationId}`);
    }

    if (job) {
      await job.retry();
      return true;
    }
    return false;
  },
};

// Re-export getGenerationsPath for compatibility
export { getGenerationsPath as getVideoGenerationsPath };
