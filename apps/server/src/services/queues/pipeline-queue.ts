import prisma from "@trender/db";
import { type Job as BullJob, Queue, Worker } from "bullmq";
import { redis } from "../redis";
import { reelPipeline } from "../reel-pipeline";
import { registerQueue, registerWorker } from "./manager";
import type {
  PipelineJobData,
  PipelineJobProgress,
  PipelineJobResult,
} from "./types";

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
          await updateProgress(job, "analyze", 20, "Starting analysis...");

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
    // Сразу обновляем статус на downloading, чтобы UI мог включить polling
    await prisma.reel.update({
      where: { id: reelId },
      data: { status: "downloading" },
    });

    const job = await pipelineQueue.add(
      "download",
      { reelId, action: "download" },
      { jobId: `download-${reelId}-${Date.now()}` }
    );
    return job.id ?? "";
  },

  /**
   * Add an analyze-only job (requires downloaded video)
   */
  async addAnalyzeJob(reelId: string): Promise<string> {
    // Сразу обновляем статус на analyzing, чтобы UI мог включить polling
    await prisma.reel.update({
      where: { id: reelId },
      data: { status: "analyzing" },
    });

    const job = await pipelineQueue.add(
      "analyze",
      { reelId, action: "analyze" },
      { jobId: `analyze-${reelId}-${Date.now()}` }
    );
    return job.id ?? "";
  },

  /**
   * Add frame-by-frame analysis job (requires downloaded video + video-frames service)
   */
  async addAnalyzeFramesJob(reelId: string): Promise<string> {
    // Сразу обновляем статус на analyzing, чтобы UI мог включить polling
    await prisma.reel.update({
      where: { id: reelId },
      data: { status: "analyzing" },
    });

    const job = await pipelineQueue.add(
      "analyze-frames",
      { reelId, action: "analyze-frames" },
      { jobId: `analyze-frames-${reelId}-${Date.now()}` }
    );
    return job.id ?? "";
  },

  /**
   * Add enchanting analysis job (Gemini + ChatGPT for creative variants)
   */
  async addAnalyzeEnchantingJob(reelId: string): Promise<string> {
    // Сразу обновляем статус на analyzing, чтобы UI мог включить polling
    await prisma.reel.update({
      where: { id: reelId },
      data: { status: "analyzing" },
    });

    const job = await pipelineQueue.add(
      "analyze-enchanting",
      { reelId, action: "analyze-enchanting" },
      { jobId: `analyze-enchanting-${reelId}-${Date.now()}` }
    );
    return job.id ?? "";
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
      id: job.id,
      reelId: job.data.reelId,
      action: job.data.action,
      state,
      progress,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
    };
  },

  /**
   * Get all jobs for a reel
   */
  async getJobsForReel(reelId: string) {
    const allJobs = await pipelineQueue.getJobs([
      "waiting",
      "active",
      "completed",
      "failed",
    ]);

    return allJobs.filter((job) => job.data.reelId === reelId);
  },

  /**
   * Check if reel has pending/active jobs
   */
  async hasPendingJobs(reelId: string): Promise<boolean> {
    const jobs = await pipelineQueue.getJobs(["waiting", "active"]);
    return jobs.some((job) => job.data.reelId === reelId);
  },
};
