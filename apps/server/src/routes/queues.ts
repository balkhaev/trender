import { Hono } from "hono";
import {
  cleanQueue,
  drainQueue,
  getQueueJobs,
  getQueuesStatus,
  isQueuePaused,
  obliterateQueue,
  pauseQueue,
  removeJob,
  resumeQueue,
  retryJob,
} from "../services/queues";

export const queuesRouter = new Hono();

// Get status of all queues
queuesRouter.get("/status", async (c) => {
  try {
    const status = await getQueuesStatus();
    return c.json({ queues: status });
  } catch (error) {
    console.error("Failed to get queue status:", error);
    return c.json({ error: "Failed to get queue status" }, 500);
  }
});

// Get jobs from a specific queue
queuesRouter.get("/:queueName/jobs", async (c) => {
  try {
    const queueName = c.req.param("queueName");
    const state = (c.req.query("state") || "waiting") as
      | "waiting"
      | "active"
      | "completed"
      | "failed"
      | "delayed";
    const start = Number.parseInt(c.req.query("start") || "0", 10);
    const end = Number.parseInt(c.req.query("end") || "50", 10);

    const jobs = await getQueueJobs(queueName, state, start, end);
    const isPaused = await isQueuePaused(queueName);

    return c.json({ jobs, isPaused });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to get queue jobs: ${message}`);
    return c.json({ error: message }, 500);
  }
});

// Remove a specific job
queuesRouter.delete("/:queueName/jobs/:jobId", async (c) => {
  try {
    const queueName = c.req.param("queueName");
    const jobId = c.req.param("jobId");

    const removed = await removeJob(queueName, jobId);

    if (!removed) {
      return c.json({ error: "Job not found" }, 404);
    }

    return c.json({ success: true, message: `Job ${jobId} removed` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to remove job: ${message}`);
    return c.json({ error: message }, 500);
  }
});

// Retry a failed job
queuesRouter.post("/:queueName/jobs/:jobId/retry", async (c) => {
  try {
    const queueName = c.req.param("queueName");
    const jobId = c.req.param("jobId");

    const retried = await retryJob(queueName, jobId);

    if (!retried) {
      return c.json({ error: "Job not found" }, 404);
    }

    return c.json({ success: true, message: `Job ${jobId} retried` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to retry job: ${message}`);
    return c.json({ error: message }, 500);
  }
});

// Clean queue (remove completed/failed jobs)
queuesRouter.post("/:queueName/clean", async (c) => {
  try {
    const queueName = c.req.param("queueName");
    const body = await c.req.json<{
      state?: "completed" | "failed" | "delayed" | "wait";
      gracePeriodMs?: number;
    }>();

    const state = body.state || "completed";
    const gracePeriodMs = body.gracePeriodMs || 0;

    const count = await cleanQueue(queueName, state, gracePeriodMs);

    return c.json({
      success: true,
      message: `Cleaned ${count} ${state} jobs`,
      count,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to clean queue: ${message}`);
    return c.json({ error: message }, 500);
  }
});

// Drain queue (remove all waiting/delayed jobs)
queuesRouter.post("/:queueName/drain", async (c) => {
  try {
    const queueName = c.req.param("queueName");

    await drainQueue(queueName);

    return c.json({
      success: true,
      message: `Queue ${queueName} drained`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to drain queue: ${message}`);
    return c.json({ error: message }, 500);
  }
});

// Obliterate queue (remove ALL jobs including active)
queuesRouter.post("/:queueName/obliterate", async (c) => {
  try {
    const queueName = c.req.param("queueName");

    await obliterateQueue(queueName);

    return c.json({
      success: true,
      message: `Queue ${queueName} obliterated`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to obliterate queue: ${message}`);
    return c.json({ error: message }, 500);
  }
});

// Pause queue
queuesRouter.post("/:queueName/pause", async (c) => {
  try {
    const queueName = c.req.param("queueName");

    await pauseQueue(queueName);

    return c.json({
      success: true,
      message: `Queue ${queueName} paused`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to pause queue: ${message}`);
    return c.json({ error: message }, 500);
  }
});

// Resume queue
queuesRouter.post("/:queueName/resume", async (c) => {
  try {
    const queueName = c.req.param("queueName");

    await resumeQueue(queueName);

    return c.json({
      success: true,
      message: `Queue ${queueName} resumed`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to resume queue: ${message}`);
    return c.json({ error: message }, 500);
  }
});
