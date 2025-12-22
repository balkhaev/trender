import prisma from "@trender/db";
import { Hono } from "hono";
import { aiLogger } from "../services/ai-logger";
import { pipelineLogger } from "../services/pipeline-logger";
import { getQueuesStatus } from "../services/queues";

export const debugRouter = new Hono();

// Get overall debug stats
debugRouter.get("/stats", async (c) => {
  try {
    const fromParam = c.req.query("from");
    const toParam = c.req.query("to");

    // Default: last 24 hours
    const now = new Date();
    const from = fromParam
      ? new Date(fromParam)
      : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const to = toParam ? new Date(toParam) : now;

    // Get ReelLog stats
    const [totalLogs, logsByLevel, logsByStage] = await Promise.all([
      prisma.reelLog.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      prisma.reelLog.groupBy({
        by: ["level"],
        where: { createdAt: { gte: from, lte: to } },
        _count: true,
      }),
      prisma.reelLog.groupBy({
        by: ["stage"],
        where: { createdAt: { gte: from, lte: to } },
        _count: true,
      }),
    ]);

    // Get AI stats
    const aiStats = await aiLogger.getStats(from, to);

    // Get queue stats
    const queuesStatus = await getQueuesStatus();

    const queueStats = {
      totalActive: queuesStatus.reduce((acc, q) => acc + q.active, 0),
      totalPending: queuesStatus.reduce((acc, q) => acc + q.waiting, 0),
      byQueue: Object.fromEntries(
        queuesStatus.map((q) => [
          q.name,
          {
            active: q.active,
            pending: q.waiting,
            failed: q.failed,
          },
        ])
      ),
    };

    return c.json({
      period: { from: from.toISOString(), to: to.toISOString() },
      logs: {
        total: totalLogs,
        byLevel: Object.fromEntries(
          logsByLevel.map((l) => [l.level, l._count])
        ),
        byStage: Object.fromEntries(
          logsByStage.map((s) => [s.stage, s._count])
        ),
      },
      ai: aiStats,
      queues: queueStats,
    });
  } catch (error) {
    console.error("Failed to get debug stats:", error);
    return c.json({ error: "Failed to get debug stats" }, 500);
  }
});

// Get all logs with filtering
debugRouter.get("/logs", async (c) => {
  try {
    const level = c.req.query("level");
    const stage = c.req.query("stage");
    const reelId = c.req.query("reelId");
    const search = c.req.query("search");
    const fromParam = c.req.query("from");
    const toParam = c.req.query("to");
    const limit = Number.parseInt(c.req.query("limit") || "100", 10);
    const offset = Number.parseInt(c.req.query("offset") || "0", 10);

    const where: NonNullable<
      Parameters<typeof prisma.reelLog.findMany>[0]
    >["where"] = {};

    if (level) where.level = level as "debug" | "info" | "warn" | "error";
    if (stage) where.stage = stage;
    if (reelId) where.reelId = reelId;
    if (search) where.message = { contains: search, mode: "insensitive" };
    if (fromParam || toParam) {
      where.createdAt = {};
      if (fromParam) where.createdAt.gte = new Date(fromParam);
      if (toParam) where.createdAt.lte = new Date(toParam);
    }

    const [logs, total] = await Promise.all([
      prisma.reelLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          reel: {
            select: { id: true, status: true },
          },
        },
      }),
      prisma.reelLog.count({ where }),
    ]);

    return c.json({ logs, total, limit, offset });
  } catch (error) {
    console.error("Failed to get debug logs:", error);
    return c.json({ error: "Failed to get debug logs" }, 500);
  }
});

// Get AI logs with filtering
debugRouter.get("/ai-logs", async (c) => {
  try {
    const provider = c.req.query("provider") as
      | "gemini"
      | "openai"
      | "kling"
      | undefined;
    const operation = c.req.query("operation");
    const status = c.req.query("status");
    const reelId = c.req.query("reelId");
    const fromParam = c.req.query("from");
    const toParam = c.req.query("to");
    const limit = Number.parseInt(c.req.query("limit") || "100", 10);
    const offset = Number.parseInt(c.req.query("offset") || "0", 10);

    const logs = await aiLogger.getAILogs({
      provider,
      operation: operation || undefined,
      status: status || undefined,
      reelId: reelId || undefined,
      from: fromParam ? new Date(fromParam) : undefined,
      to: toParam ? new Date(toParam) : undefined,
      limit,
      offset,
    });

    const total = await prisma.aILog.count({
      where: {
        ...(provider && { provider }),
        ...(operation && { operation }),
        ...(status && { status }),
        ...(reelId && { reelId }),
        ...(fromParam || toParam
          ? {
              createdAt: {
                ...(fromParam && { gte: new Date(fromParam) }),
                ...(toParam && { lte: new Date(toParam) }),
              },
            }
          : {}),
      },
    });

    return c.json({ logs, total, limit, offset });
  } catch (error) {
    console.error("Failed to get AI logs:", error);
    return c.json({ error: "Failed to get AI logs" }, 500);
  }
});

// Get AI metrics by provider
debugRouter.get("/ai-metrics", async (c) => {
  try {
    const fromParam = c.req.query("from");
    const toParam = c.req.query("to");

    const from = fromParam ? new Date(fromParam) : undefined;
    const to = toParam ? new Date(toParam) : undefined;

    const metrics = await aiLogger.getAIMetrics(from, to);

    return c.json({ metrics });
  } catch (error) {
    console.error("Failed to get AI metrics:", error);
    return c.json({ error: "Failed to get AI metrics" }, 500);
  }
});

// Get logs for specific reel
debugRouter.get("/reels/:reelId/logs", async (c) => {
  try {
    const reelId = c.req.param("reelId");
    const stage = c.req.query("stage");
    const limit = Number.parseInt(c.req.query("limit") || "100", 10);

    let logs;
    if (stage) {
      logs = await pipelineLogger.getLogsByStage(
        reelId,
        stage as "scrape" | "download" | "analyze" | "generate"
      );
    } else {
      logs = await pipelineLogger.getReelLogs(reelId, limit);
    }

    const stats = await pipelineLogger.getStageStats(reelId);
    const recentErrors = await pipelineLogger.getRecentErrors(reelId, 5);

    return c.json({ logs, stats, recentErrors });
  } catch (error) {
    console.error("Failed to get reel logs:", error);
    return c.json({ error: "Failed to get reel logs" }, 500);
  }
});

// Cleanup old logs
debugRouter.post("/cleanup", async (c) => {
  try {
    const body = await c.req.json();
    const days = body.olderThanDays || 30;

    const [reelLogsDeleted, aiLogsDeleted] = await Promise.all([
      pipelineLogger.cleanupOldLogs(days),
      aiLogger.cleanupOldLogs(days),
    ]);

    return c.json({
      success: true,
      deleted: {
        reelLogs: reelLogsDeleted,
        aiLogs: aiLogsDeleted,
      },
    });
  } catch (error) {
    console.error("Failed to cleanup logs:", error);
    return c.json({ error: "Failed to cleanup logs" }, 500);
  }
});
