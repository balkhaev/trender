import prisma from "@trender/db";
import { type Job as BullJob, Queue, Worker } from "bullmq";
import type {
  Job,
  JobProgress,
  JobStatus,
  Reel,
  SortMode,
} from "../instagram/types";
import { redis } from "../redis";
import { registerQueue, registerWorker } from "./manager";
import type {
  ScrapeJobData,
  ScrapeJobProgress,
  ScrapeJobResult,
} from "./types";

// Create scrape queue
export const scrapeQueue = new Queue<ScrapeJobData, ScrapeJobResult>(
  "scrape-reels",
  {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 10_000, // 10s, 20s, 40s
      },
    },
  }
);

registerQueue(scrapeQueue);

// Worker handler will be set via setWorkerHandler
let workerHandler:
  | ((job: BullJob<ScrapeJobData>) => Promise<ScrapeJobResult>)
  | null = null;

// Create scrape worker
export const scrapeWorker = new Worker<ScrapeJobData, ScrapeJobResult>(
  "scrape-reels",
  async (job) => {
    if (workerHandler) {
      return await workerHandler(job);
    }
    throw new Error("Worker handler not set");
  },
  {
    connection: redis,
    concurrency: 1, // One scrape at a time (Instagram rate limits)
  }
);

registerWorker(scrapeWorker);

// Worker events
scrapeWorker.on("failed", async (job, error) => {
  if (job?.id) {
    // Update error in Prisma
    await prisma.scrapeJob.updateMany({
      where: { jobId: job.id },
      data: {
        status: "failed",
        error: error.message,
      },
    });
    console.error(`[ScrapeQueue] Job ${job.id} failed:`, error.message);
  }
});

scrapeWorker.on("completed", async (job) => {
  console.log(`[ScrapeQueue] Job ${job.id} completed`);
  if (job.id) {
    await prisma.scrapeJob.updateMany({
      where: { jobId: job.id },
      data: { status: "completed" },
    });
  }
});

// API for managing scrape jobs
class ScrapeJobQueue {
  /**
   * Create a new scrape job
   */
  async createJob(
    sortMode: SortMode,
    limit: number,
    minLikes: number
  ): Promise<Job> {
    const now = new Date();
    const jobId = `scrape-${crypto.randomUUID()}`;

    const bullJob = await scrapeQueue.add(
      "scrape",
      { sortMode, limit, minLikes },
      { jobId }
    );

    const id = bullJob.id ?? jobId;

    // Create record in Prisma
    await prisma.scrapeJob.create({
      data: {
        jobId: id,
        status: "pending",
        sortMode,
        limit,
        minLikes,
        scanned: 0,
        found: 0,
        downloaded: 0,
      },
    });

    return {
      id,
      status: "pending",
      sortMode,
      limit,
      minLikes,
      progress: {
        scraped: 0,
        downloaded: 0,
        total: limit,
        scanned: 0,
        found: 0,
      },
      reels: [],
      downloadedFiles: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get job by ID
   */
  async getJob(id: string): Promise<Job | undefined> {
    const bullJob = await scrapeQueue.getJob(id);

    // Try to find in Prisma by jobId
    const dbJob = await prisma.scrapeJob.findFirst({
      where: { jobId: id },
    });

    if (!(dbJob || bullJob)) {
      return;
    }

    let status: JobStatus = "pending";
    let sortMode: SortMode = "top";
    let limit = 100;
    let minLikes = 100_000;
    let scanned = 0;
    let found = 0;
    let downloaded = 0;
    let error: string | undefined;
    let createdAt = new Date();
    let updatedAt = new Date();

    if (bullJob) {
      const bullState = await bullJob.getState();
      status = this.mapBullState(bullState);
      sortMode = bullJob.data.sortMode;
      limit = bullJob.data.limit;
      minLikes = bullJob.data.minLikes;
    }

    if (dbJob) {
      // Prefer DB data for progress
      scanned = dbJob.scanned;
      found = dbJob.found;
      downloaded = dbJob.downloaded;
      error = dbJob.error ?? undefined;
      createdAt = dbJob.createdAt;
      updatedAt = dbJob.updatedAt;

      // If bullJob not found but dbJob exists, use DB status
      if (!bullJob) {
        status = dbJob.status as JobStatus;
        sortMode = dbJob.sortMode as SortMode;
        limit = dbJob.limit;
        minLikes = dbJob.minLikes;
      }
    }

    const progress: JobProgress = {
      scraped: found,
      downloaded,
      total: limit,
      scanned,
      found,
    };

    return {
      id,
      status,
      sortMode,
      limit,
      minLikes,
      progress,
      reels: [], // Reels are stored separately in Reel table
      downloadedFiles: [], // Can be retrieved from Reel.localPath if needed
      error,
      createdAt,
      updatedAt,
    };
  }

  /**
   * Get all jobs
   */
  async getAllJobs(): Promise<Job[]> {
    // Get all jobs from Prisma (it's the source of truth now)
    const dbJobs = await prisma.scrapeJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const result: Job[] = [];

    for (const dbJob of dbJobs) {
      const jobId = dbJob.jobId ?? dbJob.id;
      const bullJob = dbJob.jobId
        ? await scrapeQueue.getJob(dbJob.jobId)
        : null;

      let status: JobStatus = dbJob.status as JobStatus;

      // If job is in BullMQ, use its state
      if (bullJob) {
        const bullState = await bullJob.getState();
        status = this.mapBullState(bullState);
      }

      const progress: JobProgress = {
        scraped: dbJob.found,
        downloaded: dbJob.downloaded,
        total: dbJob.limit,
        scanned: dbJob.scanned,
        found: dbJob.found,
      };

      result.push({
        id: jobId,
        status,
        sortMode: dbJob.sortMode as SortMode,
        limit: dbJob.limit,
        minLikes: dbJob.minLikes,
        progress,
        reels: [],
        downloadedFiles: [],
        error: dbJob.error ?? undefined,
        createdAt: dbJob.createdAt,
        updatedAt: dbJob.updatedAt,
      });
    }

    return result;
  }

  /**
   * Update job status
   */
  async updateJobStatus(id: string, status: JobStatus): Promise<void> {
    await prisma.scrapeJob.updateMany({
      where: { jobId: id },
      data: { status },
    });
  }

  /**
   * Update job progress
   * Обновляет Prisma и BullMQ атомарно (насколько возможно)
   */
  async updateJobProgress(
    id: string,
    progressUpdate: Partial<ScrapeJobProgress>
  ): Promise<void> {
    const updateData: Record<string, number> = {};

    if (progressUpdate.scanned !== undefined) {
      updateData.scanned = progressUpdate.scanned;
    }
    if (progressUpdate.found !== undefined) {
      updateData.found = progressUpdate.found;
    }
    if (progressUpdate.downloaded !== undefined) {
      updateData.downloaded = progressUpdate.downloaded;
    }

    if (Object.keys(updateData).length === 0) {
      return;
    }

    // Получаем текущее состояние и BullMQ job до обновления
    const [dbJob, bullJob] = await Promise.all([
      prisma.scrapeJob.findFirst({ where: { jobId: id } }),
      scrapeQueue.getJob(id),
    ]);

    if (!dbJob) {
      console.warn(`[ScrapeQueue] Job ${id} not found in database`);
      return;
    }

    // Вычисляем новые значения
    const newFound = progressUpdate.found ?? dbJob.found;
    const percent =
      dbJob.limit > 0 ? Math.round((newFound / dbJob.limit) * 100) : 0;

    // Обновляем оба хранилища параллельно для минимизации рассинхронизации
    const updatePromises: Promise<unknown>[] = [
      prisma.scrapeJob.update({
        where: { id: dbJob.id },
        data: updateData,
      }),
    ];

    if (bullJob) {
      updatePromises.push(bullJob.updateProgress(percent));
    }

    try {
      await Promise.all(updatePromises);
    } catch (error) {
      console.error(
        `[ScrapeQueue] Error updating progress for job ${id}:`,
        error
      );
      // Не пробрасываем ошибку - прогресс не критичен
    }
  }

  /**
   * Add scraped reels to job
   * Note: Reels are stored directly in Reel table, this just updates count
   */
  async addReels(id: string, reels: Reel[]): Promise<void> {
    const dbJob = await prisma.scrapeJob.findFirst({
      where: { jobId: id },
    });

    if (dbJob) {
      await prisma.scrapeJob.update({
        where: { id: dbJob.id },
        data: {
          found: dbJob.found + reels.length,
        },
      });
    }
  }

  /**
   * Add downloaded file to job
   */
  async addDownloadedFile(id: string, _filename: string): Promise<void> {
    const dbJob = await prisma.scrapeJob.findFirst({
      where: { jobId: id },
    });

    if (dbJob) {
      await prisma.scrapeJob.update({
        where: { id: dbJob.id },
        data: {
          downloaded: dbJob.downloaded + 1,
        },
      });
    }
  }

  /**
   * Set job error
   */
  async setJobError(id: string, error: string): Promise<void> {
    await prisma.scrapeJob.updateMany({
      where: { jobId: id },
      data: {
        error,
        status: "failed",
      },
    });
  }

  /**
   * Mark job as completed
   */
  async completeJob(id: string): Promise<void> {
    await prisma.scrapeJob.updateMany({
      where: { jobId: id },
      data: { status: "completed" },
    });
  }

  /**
   * Delete job
   */
  async deleteJob(id: string): Promise<boolean> {
    const bullJob = await scrapeQueue.getJob(id);
    if (bullJob) {
      await bullJob.remove();
    }

    const result = await prisma.scrapeJob.deleteMany({
      where: { jobId: id },
    });

    return result.count > 0 || !!bullJob;
  }

  /**
   * Set worker handler
   */
  setWorkerHandler(
    handler: (job: BullJob<ScrapeJobData>) => Promise<ScrapeJobResult>
  ): void {
    workerHandler = handler;
  }

  /**
   * Map BullMQ state to JobStatus
   */
  private mapBullState(
    state:
      | "completed"
      | "failed"
      | "active"
      | "delayed"
      | "waiting"
      | "waiting-children"
      | "prioritized"
      | "unknown"
  ): JobStatus {
    switch (state) {
      case "completed":
        return "completed";
      case "failed":
        return "failed";
      case "active":
        return "running";
      default:
        return "pending";
    }
  }
}

export const scrapeJobQueue = new ScrapeJobQueue();

// Export types
export type { ScrapeJobData } from "./types";
