import type { Queue, Worker } from "bullmq";
import { redis } from "../redis";

// Registry for all queues and workers
const queues: Queue[] = [];
const workers: Worker[] = [];

/**
 * Register a queue for management
 */
export function registerQueue(queue: Queue): void {
  queues.push(queue);
}

/**
 * Register a worker for management
 */
export function registerWorker(worker: Worker): void {
  workers.push(worker);
}

/**
 * Initialize all workers (call on server startup)
 * Queue modules must be imported before calling this function
 * (this is done in index.ts)
 */
export function initAllWorkers(): void {
  console.log(`[Queues] Initializing ${workers.length} workers...`);

  // Workers are already created and listening, just log
  for (const worker of workers) {
    console.log(`[Queues] Worker "${worker.name}" is ready`);
  }

  console.log("[Queues] All workers initialized");
}

/**
 * Gracefully close all queues and workers (call on shutdown)
 */
export async function closeAllQueues(): Promise<void> {
  console.log("[Queues] Shutting down queues and workers...");

  // Close workers first (stop processing new jobs)
  for (const worker of workers) {
    try {
      console.log(`[Queues] Closing worker "${worker.name}"...`);
      await worker.close();
    } catch (error) {
      console.error(`[Queues] Error closing worker "${worker.name}":`, error);
    }
  }

  // Then close queues
  for (const queue of queues) {
    try {
      console.log(`[Queues] Closing queue "${queue.name}"...`);
      await queue.close();
    } catch (error) {
      console.error(`[Queues] Error closing queue "${queue.name}":`, error);
    }
  }

  // Close Redis connection
  try {
    await redis.quit();
    console.log("[Queues] Redis connection closed");
  } catch (error) {
    console.error("[Queues] Error closing Redis:", error);
  }

  console.log("[Queues] All queues and workers shut down");
}

/**
 * Get status of all queues
 */
export async function getQueuesStatus(): Promise<
  {
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }[]
> {
  const status: {
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }[] = [];

  for (const queue of queues) {
    const counts = await queue.getJobCounts();
    status.push({
      name: queue.name,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
    });
  }

  return status;
}

/**
 * Pause all queues
 */
export async function pauseAllQueues(): Promise<void> {
  for (const queue of queues) {
    await queue.pause();
    console.log(`[Queues] Queue "${queue.name}" paused`);
  }
}

/**
 * Resume all queues
 */
export async function resumeAllQueues(): Promise<void> {
  for (const queue of queues) {
    await queue.resume();
    console.log(`[Queues] Queue "${queue.name}" resumed`);
  }
}

/**
 * Get queue by name
 */
export function getQueueByName(name: string): Queue | undefined {
  return queues.find((q) => q.name === name);
}

/**
 * Get all registered queues
 */
export function getAllQueues(): Queue[] {
  return queues;
}

type JobState = "waiting" | "active" | "completed" | "failed" | "delayed";

/**
 * Get jobs from a specific queue
 */
export async function getQueueJobs(
  queueName: string,
  state: JobState = "waiting",
  start = 0,
  end = 50
): Promise<
  {
    id: string;
    name: string;
    data: Record<string, unknown>;
    progress: number | object;
    state: string;
    attemptsMade: number;
    failedReason?: string;
    timestamp: number;
    processedOn?: number;
    finishedOn?: number;
  }[]
> {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found`);
  }

  const jobs = await queue.getJobs([state], start, end);

  return jobs.map((job) => ({
    id: job.id ?? "",
    name: job.name,
    data: job.data as Record<string, unknown>,
    progress: job.progress,
    state,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
  }));
}

/**
 * Remove a specific job from queue
 */
export async function removeJob(
  queueName: string,
  jobId: string
): Promise<boolean> {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found`);
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    return false;
  }

  // Check if job is active - need to handle differently
  const state = await job.getState();
  if (state === "active") {
    // For active jobs, we need to move to failed first
    await job.moveToFailed(new Error("Manually cancelled"), "0");
  }

  await job.remove();
  console.log(`[Queues] Job ${jobId} removed from "${queueName}"`);
  return true;
}

/**
 * Retry a failed job
 */
export async function retryJob(
  queueName: string,
  jobId: string
): Promise<boolean> {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found`);
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    return false;
  }

  await job.retry();
  console.log(`[Queues] Job ${jobId} retried in "${queueName}"`);
  return true;
}

/**
 * Clean jobs from queue by state
 */
export async function cleanQueue(
  queueName: string,
  state: "completed" | "failed" | "delayed" | "wait" = "completed",
  gracePeriodMs = 0
): Promise<number> {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found`);
  }

  const removed = await queue.clean(gracePeriodMs, 1000, state);
  console.log(
    `[Queues] Cleaned ${removed.length} ${state} jobs from "${queueName}"`
  );
  return removed.length;
}

/**
 * Drain queue - remove all waiting and delayed jobs
 */
export async function drainQueue(queueName: string): Promise<void> {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found`);
  }

  await queue.drain();
  console.log(`[Queues] Queue "${queueName}" drained`);
}

/**
 * Obliterate queue - remove ALL jobs including active ones
 * WARNING: This is destructive and may interrupt running jobs
 */
export async function obliterateQueue(queueName: string): Promise<void> {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found`);
  }

  await queue.obliterate({ force: true });
  console.log(`[Queues] Queue "${queueName}" obliterated`);
}

/**
 * Pause a specific queue
 */
export async function pauseQueue(queueName: string): Promise<void> {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found`);
  }

  await queue.pause();
  console.log(`[Queues] Queue "${queueName}" paused`);
}

/**
 * Resume a specific queue
 */
export async function resumeQueue(queueName: string): Promise<void> {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found`);
  }

  await queue.resume();
  console.log(`[Queues] Queue "${queueName}" resumed`);
}

/**
 * Check if queue is paused
 */
export async function isQueuePaused(queueName: string): Promise<boolean> {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Queue "${queueName}" not found`);
  }

  return await queue.isPaused();
}
