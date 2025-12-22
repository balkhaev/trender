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

// Redis keys for storing job state that survives restarts
const REDIS_KEY_PREFIX = "scrape:state:";

function getRedisKey(jobId: string): string {
  return `${REDIS_KEY_PREFIX}${jobId}`;
}

// Create scrape queue
export const scrapeQueue = new Queue<ScrapeJobData, ScrapeJobResult>(
  "scrape-reels",
  {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 1,
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
    // Store error in Redis
    const stateKey = getRedisKey(job.id);
    await redis.hset(stateKey, "error", error.message);
    console.error(`[ScrapeQueue] Job ${job.id} failed:`, error.message);
  }
});

scrapeWorker.on("completed", async (job, result) => {
  console.log(`[ScrapeQueue] Job ${job.id} completed`);
  // Store result in Redis for retrieval
  if (job.id && result) {
    const stateKey = getRedisKey(job.id);
    await redis.hset(stateKey, {
      reels: JSON.stringify(result.reels),
      downloadedFiles: JSON.stringify(result.downloadedFiles),
    });
    // Set TTL for completed jobs (24 hours)
    await redis.expire(stateKey, 86_400);
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
    const jobId = crypto.randomUUID();

    const bullJob = await scrapeQueue.add(
      "scrape",
      { sortMode, limit, minLikes },
      { jobId }
    );

    const id = bullJob.id ?? jobId;

    // Initialize state in Redis (survives restarts)
    const stateKey = getRedisKey(id);
    const initialProgress: ScrapeJobProgress = {
      scraped: 0,
      downloaded: 0,
      total: limit,
      scanned: 0,
      found: 0,
      reels: [],
      downloadedFiles: [],
    };

    await redis.hset(stateKey, {
      progress: JSON.stringify(initialProgress),
      reels: JSON.stringify([]),
      downloadedFiles: JSON.stringify([]),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    // Set TTL (7 days for pending jobs)
    await redis.expire(stateKey, 604_800);

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
    if (!bullJob) {
      return;
    }

    const stateKey = getRedisKey(id);
    const state = await redis.hgetall(stateKey);

    if (!state || Object.keys(state).length === 0) {
      return;
    }

    const bullState = await bullJob.getState();
    const status = this.mapBullState(bullState);

    // Parse stored data
    let progress: JobProgress = {
      scraped: 0,
      downloaded: 0,
      total: bullJob.data.limit,
      scanned: 0,
      found: 0,
    };
    let reels: Reel[] = [];
    let downloadedFiles: string[] = [];

    try {
      if (state.progress) {
        const parsed = JSON.parse(state.progress) as ScrapeJobProgress;
        progress = {
          scraped: parsed.scraped,
          downloaded: parsed.downloaded,
          total: parsed.total,
          scanned: parsed.scanned,
          found: parsed.found,
          currentReelId: parsed.currentReelId,
          currentLikes: parsed.currentLikes,
          lastFoundReel: parsed.lastFoundReel,
        };
      }
      if (state.reels) {
        reels = JSON.parse(state.reels) as Reel[];
      }
      if (state.downloadedFiles) {
        downloadedFiles = JSON.parse(state.downloadedFiles) as string[];
      }
    } catch {
      // Keep defaults on parse error
    }

    return {
      id,
      status,
      sortMode: bullJob.data.sortMode,
      limit: bullJob.data.limit,
      minLikes: bullJob.data.minLikes,
      progress,
      reels,
      downloadedFiles,
      error: state.error,
      createdAt: new Date(state.createdAt ?? Date.now()),
      updatedAt: new Date(state.updatedAt ?? Date.now()),
    };
  }

  /**
   * Get all jobs
   */
  async getAllJobs(): Promise<Job[]> {
    const jobs = await scrapeQueue.getJobs([
      "waiting",
      "active",
      "completed",
      "failed",
    ]);

    const result: Job[] = [];
    for (const bullJob of jobs) {
      if (bullJob.id) {
        const job = await this.getJob(bullJob.id);
        if (job) {
          result.push(job);
        }
      }
    }

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Update job status
   */
  async updateJobStatus(id: string, _status: JobStatus): Promise<void> {
    const stateKey = getRedisKey(id);
    await redis.hset(stateKey, "updatedAt", new Date().toISOString());
  }

  /**
   * Update job progress (stored in Redis)
   */
  async updateJobProgress(
    id: string,
    progressUpdate: Partial<ScrapeJobProgress>
  ): Promise<void> {
    const stateKey = getRedisKey(id);
    const state = await redis.hgetall(stateKey);

    if (!state) {
      return;
    }

    let currentProgress: ScrapeJobProgress = {
      scraped: 0,
      downloaded: 0,
      total: 0,
      scanned: 0,
      found: 0,
      reels: [],
      downloadedFiles: [],
    };

    try {
      if (state.progress) {
        currentProgress = JSON.parse(state.progress) as ScrapeJobProgress;
      }
    } catch {
      // Keep defaults
    }

    const newProgress = { ...currentProgress, ...progressUpdate };

    await redis.hset(stateKey, {
      progress: JSON.stringify(newProgress),
      updatedAt: new Date().toISOString(),
    });

    // Also update BullMQ job progress (percentage)
    const bullJob = await scrapeQueue.getJob(id);
    if (bullJob) {
      const percent =
        newProgress.total > 0
          ? Math.round((newProgress.found / newProgress.total) * 100)
          : 0;
      await bullJob.updateProgress(percent);
    }
  }

  /**
   * Add scraped reels to job
   */
  async addReels(id: string, reels: Reel[]): Promise<void> {
    const stateKey = getRedisKey(id);
    const state = await redis.hgetall(stateKey);

    if (!state) {
      return;
    }

    let existingReels: Reel[] = [];
    let progress: ScrapeJobProgress = {
      scraped: 0,
      downloaded: 0,
      total: 0,
      scanned: 0,
      found: 0,
      reels: [],
      downloadedFiles: [],
    };

    try {
      if (state.reels) {
        existingReels = JSON.parse(state.reels) as Reel[];
      }
      if (state.progress) {
        progress = JSON.parse(state.progress) as ScrapeJobProgress;
      }
    } catch {
      // Keep defaults
    }

    existingReels.push(...reels);
    progress.scraped = existingReels.length;
    progress.reels = existingReels;

    await redis.hset(stateKey, {
      reels: JSON.stringify(existingReels),
      progress: JSON.stringify(progress),
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Add downloaded file to job
   */
  async addDownloadedFile(id: string, filename: string): Promise<void> {
    const stateKey = getRedisKey(id);
    const state = await redis.hgetall(stateKey);

    if (!state) {
      return;
    }

    let downloadedFiles: string[] = [];
    let progress: ScrapeJobProgress = {
      scraped: 0,
      downloaded: 0,
      total: 0,
      scanned: 0,
      found: 0,
      reels: [],
      downloadedFiles: [],
    };

    try {
      if (state.downloadedFiles) {
        downloadedFiles = JSON.parse(state.downloadedFiles) as string[];
      }
      if (state.progress) {
        progress = JSON.parse(state.progress) as ScrapeJobProgress;
      }
    } catch {
      // Keep defaults
    }

    downloadedFiles.push(filename);
    progress.downloaded = downloadedFiles.length;
    progress.downloadedFiles = downloadedFiles;

    await redis.hset(stateKey, {
      downloadedFiles: JSON.stringify(downloadedFiles),
      progress: JSON.stringify(progress),
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Set job error
   */
  async setJobError(id: string, error: string): Promise<void> {
    const stateKey = getRedisKey(id);
    await redis.hset(stateKey, {
      error,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Mark job as completed
   */
  async completeJob(id: string): Promise<void> {
    const stateKey = getRedisKey(id);
    await redis.hset(stateKey, "updatedAt", new Date().toISOString());
    // Reduce TTL for completed jobs (24 hours)
    await redis.expire(stateKey, 86_400);
  }

  /**
   * Delete job
   */
  async deleteJob(id: string): Promise<boolean> {
    const bullJob = await scrapeQueue.getJob(id);
    if (bullJob) {
      await bullJob.remove();
      await redis.del(getRedisKey(id));
      return true;
    }
    return false;
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
