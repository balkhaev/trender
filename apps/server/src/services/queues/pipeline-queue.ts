import prisma from "@trender/db";
import { type Job as BullJob, Queue, Worker } from "bullmq";
import { services } from "../../config";
import { redis } from "../redis";
import { reelPipeline } from "../reel-pipeline";
import { registerQueue, registerWorker } from "./manager";
import type {
  PipelineJobData,
  PipelineJobProgress,
  PipelineJobResult,
} from "./types";

const SCRAPPER_SERVICE_URL = services.scrapper;

// Create pipeline queue
export const pipelineQueue = new Queue<PipelineJobData, PipelineJobResult>(
  "reel-pipeline",
  {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 100,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000, // 5s, 10s, 20s
      },
    },
  }
);

registerQueue(pipelineQueue);

// Pipeline worker
export const pipelineWorker = new Worker<PipelineJobData, PipelineJobResult>(
  "reel-pipeline",
  async (job) => {
    const { reelId, action, options } = job.data;

    console.log(`[PipelineQueue] Processing ${action} for reel ${reelId}`);

    try {
      // Update progress
      await job.updateProgress(10);

      switch (action) {
        case "download": {
          await job.updateProgress(20);
          await updateProgress(job, "download", 20, "Starting download...");

          await reelPipeline.downloadReel(reelId);

          await job.updateProgress(100);
          return { reelId, analysisId: undefined, templateId: undefined };
        }

        case "analyze": {
          await updateProgress(
            job,
            "analyze",
            20,
            "Starting scene-based analysis (PySceneDetect + Gemini)..."
          );

          const analysis = await reelPipeline.analyzeReel(reelId);
          await job.updateProgress(70);

          await updateProgress(job, "template", 80, "Creating template...");
          const template = await reelPipeline.createTemplate(
            reelId,
            analysis.id
          );

          await job.updateProgress(100);
          return { reelId, analysisId: analysis.id, templateId: template.id };
        }

        case "analyze-frames": {
          await updateProgress(
            job,
            "analyze",
            20,
            "Starting frame-by-frame analysis..."
          );

          const analysisFrames = await reelPipeline.analyzeReelByFrames(reelId);
          await job.updateProgress(70);

          await updateProgress(job, "template", 80, "Creating template...");
          const templateFrames = await reelPipeline.createTemplate(
            reelId,
            analysisFrames.id
          );

          await job.updateProgress(100);
          return {
            reelId,
            analysisId: analysisFrames.id,
            templateId: templateFrames.id,
          };
        }

        case "analyze-enchanting": {
          await updateProgress(
            job,
            "analyze",
            20,
            "Starting enchanting analysis (Gemini + ChatGPT)..."
          );

          const analysisEnchanting =
            await reelPipeline.analyzeReelEnchanting(reelId);
          await job.updateProgress(70);

          await updateProgress(job, "template", 80, "Creating template...");
          const templateEnchanting = await reelPipeline.createTemplate(
            reelId,
            analysisEnchanting.id
          );

          await job.updateProgress(100);
          return {
            reelId,
            analysisId: analysisEnchanting.id,
            templateId: templateEnchanting.id,
          };
        }

        case "process": {
          await updateProgress(
            job,
            "download",
            10,
            "Starting full pipeline..."
          );

          const template = await reelPipeline.processReel(reelId, options);

          await job.updateProgress(100);
          return {
            reelId,
            templateId: template.id,
            analysisId: template.analysisId,
          };
        }

        case "analyze-scenes": {
          const { sceneAnalysisService } = await import(
            "../analysis/scene-analysis.service"
          );

          await updateProgress(
            job,
            "analyze",
            20,
            "Starting scene-based analysis (PySceneDetect + Gemini)..."
          );

          const analysisScenes =
            await sceneAnalysisService.analyzeReelWithScenes(
              reelId,
              {
                updateStatus: reelPipeline.updateStatus.bind(reelPipeline),
                updateProgress: reelPipeline.updateProgress.bind(reelPipeline),
              },
              options as { threshold?: number; minSceneLen?: number }
            );

          await job.updateProgress(90);

          await updateProgress(job, "template", 95, "Creating template...");
          const templateScenes = await reelPipeline.createTemplate(
            reelId,
            analysisScenes.id
          );

          await job.updateProgress(100);
          return {
            reelId,
            analysisId: analysisScenes.id,
            templateId: templateScenes.id,
          };
        }

        case "refresh-duration": {
          await job.updateProgress(20);

          const { fetchWithTimeout, FETCH_TIMEOUTS } = await import(
            "../../utils/fetch-with-timeout"
          );

          const metadataResponse = await fetchWithTimeout(
            `${SCRAPPER_SERVICE_URL}/metadata`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ shortcode: reelId }),
            },
            FETCH_TIMEOUTS.metadata
          );

          if (!metadataResponse.ok) {
            throw new Error("Failed to fetch metadata from scrapper");
          }

          const metadata = (await metadataResponse.json()) as {
            success: boolean;
            duration?: number;
            error?: string;
          };

          if (
            !metadata.success ||
            metadata.duration === undefined ||
            metadata.duration === null
          ) {
            throw new Error(metadata.error || "No duration in metadata");
          }

          await job.updateProgress(80);

          await prisma.reel.update({
            where: { id: reelId },
            data: { duration: metadata.duration },
          });

          await job.updateProgress(100);
          console.log(
            `[PipelineQueue] Refreshed duration for reel ${reelId}: ${metadata.duration}s`
          );

          return { reelId };
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[PipelineQueue] Job ${job.id} failed:`, err.message);

      // Update reel status to failed
      await prisma.reel.update({
        where: { id: reelId },
        data: {
          status: "failed",
          errorMessage: err.message,
        },
      });

      throw err;
    }
  },
  {
    connection: redis,
    concurrency: 3, // Process up to 3 reels in parallel (I/O bound)
  }
);

registerWorker(pipelineWorker);

// Helper to update job progress with details
async function updateProgress(
  job: BullJob<PipelineJobData>,
  stage: PipelineJobProgress["stage"],
  percent: number,
  message: string
): Promise<void> {
  await job.updateProgress(percent);
  // Log detailed progress
  console.log(
    `[PipelineQueue] Job ${job.id}: ${stage} - ${message} (${percent}%)`
  );
}

// Worker events
pipelineWorker.on("completed", (job, result) => {
  console.log(
    `[PipelineQueue] Job ${job.id} completed:`,
    `reel=${result.reelId}, template=${result.templateId}`
  );
});

pipelineWorker.on("failed", (job, error) => {
  console.error(`[PipelineQueue] Job ${job?.id} failed:`, error.message);
});

pipelineWorker.on("stalled", (jobId) => {
  console.warn(`[PipelineQueue] Job ${jobId} stalled`);
});

// API for adding pipeline jobs
export const pipelineJobQueue = {
  /**
   * Add a full processing job (download + analyze + template)
   */
  async addProcessJob(
    reelId: string,
    options?: PipelineJobData["options"]
  ): Promise<string> {
    const job = await pipelineQueue.add(
      "process",
      { reelId, action: "process", options },
      { jobId: `process-${reelId}-${Date.now()}` }
    );
    return job.id ?? "";
  },

  /**
   * Add a download-only job
   */
  async addDownloadJob(reelId: string): Promise<string> {
    const jobId = `download-${reelId}-${Date.now()}`;

    // Сначала добавляем job в очередь, потом обновляем статус
    // Если добавление упадёт - статус не изменится
    const job = await pipelineQueue.add(
      "download",
      { reelId, action: "download" },
      { jobId }
    );

    // Обновляем статус только после успешного добавления job
    await prisma.reel.update({
      where: { id: reelId },
      data: { status: "downloading" },
    });

    return job.id ?? jobId;
  },

  /**
   * Add an analyze-only job (requires downloaded video)
   * Uses enchanting analysis (Gemini + ChatGPT) by default
   */
  async addAnalyzeJob(reelId: string): Promise<string> {
    const jobId = `analyze-${reelId}-${Date.now()}`;

    // Сначала добавляем job в очередь, потом обновляем статус
    // По умолчанию используем enchanting (Gemini + ChatGPT)
    const job = await pipelineQueue.add(
      "analyze-enchanting",
      { reelId, action: "analyze-enchanting" },
      { jobId }
    );

    // Обновляем статус только после успешного добавления job
    await prisma.reel.update({
      where: { id: reelId },
      data: { status: "analyzing" },
    });

    return job.id ?? jobId;
  },

  /**
   * Add frame-by-frame analysis job (requires downloaded video + video-frames service)
   */
  async addAnalyzeFramesJob(reelId: string): Promise<string> {
    const jobId = `analyze-frames-${reelId}-${Date.now()}`;

    // Сначала добавляем job в очередь, потом обновляем статус
    const job = await pipelineQueue.add(
      "analyze-frames",
      { reelId, action: "analyze-frames" },
      { jobId }
    );

    // Обновляем статус только после успешного добавления job
    await prisma.reel.update({
      where: { id: reelId },
      data: { status: "analyzing" },
    });

    return job.id ?? jobId;
  },

  /**
   * Add scene-based analysis job (PySceneDetect + Gemini per scene)
   */
  async addAnalyzeScenesJob(
    reelId: string,
    options?: { threshold?: number; minSceneLen?: number }
  ): Promise<string> {
    const jobId = `analyze-scenes-${reelId}-${Date.now()}`;

    const job = await pipelineQueue.add(
      "analyze-scenes",
      { reelId, action: "analyze-scenes", options },
      { jobId }
    );

    await prisma.reel.update({
      where: { id: reelId },
      data: { status: "analyzing" },
    });

    return job.id ?? jobId;
  },

  /**
   * Add a refresh-duration job for single reel
   */
  async addRefreshDurationJob(reelId: string): Promise<string> {
    const job = await pipelineQueue.add(
      "refresh-duration",
      { reelId, action: "refresh-duration" },
      { jobId: `refresh-duration-${reelId}-${Date.now()}` }
    );
    return job.id ?? "";
  },

  /**
   * Add refresh-duration jobs for multiple reels (batch)
   */
  async addBatchRefreshDurationJobs(
    reelIds: string[]
  ): Promise<{ jobIds: string[]; count: number }> {
    const jobs = await pipelineQueue.addBulk(
      reelIds.map((reelId) => ({
        name: "refresh-duration",
        data: { reelId, action: "refresh-duration" as const },
        opts: { jobId: `refresh-duration-${reelId}-${Date.now()}` },
      }))
    );
    return {
      jobIds: jobs.map((j) => j.id ?? ""),
      count: jobs.length,
    };
  },

  /**
   * Get job status
   */
  async getJob(jobId: string) {
    const job = await pipelineQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress;

    return {
      id: job.id ?? jobId,
      reelId: job.data.reelId,
      action: job.data.action,
      state,
      progress,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason ?? null,
      finishedOn: job.finishedOn ?? null,
      processedOn: job.processedOn ?? null,
    };
  },

  /**
   * Get all jobs for a reel
   * Оптимизировано: ищем по паттерну jobId вместо загрузки всех jobs
   */
  async getJobsForReel(reelId: string) {
    // Job IDs содержат reelId, поэтому можем искать по паттерну
    // Форматы: process-{reelId}-*, download-{reelId}-*, analyze-{reelId}-*, etc.
    const jobIdPatterns = [
      `process-${reelId}-`,
      `download-${reelId}-`,
      `analyze-${reelId}-`,
      `analyze-frames-${reelId}-`,
      `analyze-scenes-${reelId}-`,
      `refresh-duration-${reelId}-`,
    ];

    // Получаем только активные и ожидающие jobs (они наиболее релевантны)
    const activeJobs = await pipelineQueue.getJobs(["waiting", "active"]);

    // Фильтруем по паттернам jobId (быстрее, чем проверка data.reelId для каждого)
    const relevantJobs = activeJobs.filter((job) => {
      const jobId = job.id ?? "";
      return jobIdPatterns.some((pattern) => jobId.startsWith(pattern));
    });

    // Если нужны completed/failed - загружаем их отдельно с лимитом
    if (relevantJobs.length === 0) {
      const recentJobs = await pipelineQueue.getJobs(
        ["completed", "failed"],
        0,
        20 // Лимитируем количество для производительности
      );

      return recentJobs.filter((job) => {
        const jobId = job.id ?? "";
        return jobIdPatterns.some((pattern) => jobId.startsWith(pattern));
      });
    }

    return relevantJobs;
  },

  /**
   * Check if reel has pending/active jobs
   */
  async hasPendingJobs(reelId: string): Promise<boolean> {
    const jobs = await pipelineQueue.getJobs(["waiting", "active"]);
    return jobs.some((job) => job.data.reelId === reelId);
  },
};
