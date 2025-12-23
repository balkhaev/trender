/**
 * Reels API routes
 * Modular structure:
 * - auth.ts - Authentication endpoints
 * - scrape.ts - Scraping endpoints and worker handler
 */
import { existsSync } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import prisma from "@trender/db";
import { Hono } from "hono";
import { z } from "zod";
import { services } from "../../config";
import { getDownloadsPath } from "../../services/instagram/downloader";
import { parseReelUrl } from "../../services/instagram/reel-url";
import { pipelineLogger } from "../../services/pipeline-logger";
import { pipelineJobQueue } from "../../services/queues";
import { reelPipeline } from "../../services/reel-pipeline";
import { s3Service } from "../../services/s3";
import { buildReelVideoUrl } from "../../services/url-builder";
import { authRouter } from "./auth";
import { initScrapeWorkerHandler, scrapeRouter } from "./scrape";

// Service URLs from config
const SCRAPPER_SERVICE_URL = services.scrapper;
const VIDEO_FRAMES_SERVICE_URL = services.videoFrames;

declare const Bun: {
  file(path: string): Blob;
};

const MP4_EXTENSION_REGEX = /\.mp4$/;

// Create main router
const reelsRouter = new Hono();

// Mount sub-routers
reelsRouter.route("/auth", authRouter);
reelsRouter.route("/scrape", scrapeRouter);

// Initialize worker handler
initScrapeWorkerHandler();

// ============================================
// JOBS ENDPOINTS
// ============================================

// Get all scrape jobs
reelsRouter.get("/jobs", async (c) => {
  try {
    const { scrapeJobQueue } = await import(
      "../../services/queues/scrape-queue"
    );
    const jobs = await scrapeJobQueue.getAllJobs();

    return c.json(
      jobs.map((job) => ({
        id: job.id,
        status: job.status,
        sortMode: job.sortMode,
        minLikes: job.minLikes,
        progress: job.progress,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      }))
    );
  } catch (error) {
    console.error("Get jobs error:", error);
    return c.json({ error: "Failed to get jobs" }, 500);
  }
});

// ============================================
// DOWNLOADS ENDPOINTS
// ============================================

reelsRouter.get("/downloads", async (c) => {
  try {
    const downloadsPath = getDownloadsPath();
    const entries = await readdir(downloadsPath, { withFileTypes: true });

    const hashtags = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const result: Record<string, string[]> = {};

    for (const hashtag of hashtags) {
      const hashtagPath = join(downloadsPath, hashtag);
      const files = await readdir(hashtagPath);
      result[hashtag] = files.filter((f) => f.endsWith(".mp4"));
    }

    return c.json(result);
  } catch {
    return c.json({});
  }
});

reelsRouter.get("/downloads/:hashtag/:filename", async (c) => {
  const hashtag = c.req.param("hashtag");
  const filename = c.req.param("filename");

  if (!filename.endsWith(".mp4")) {
    return c.json({ error: "Invalid file type" }, 400);
  }

  // Extract reel ID from filename (e.g., "ABC123.mp4" -> "ABC123")
  const reelId = filename.replace(MP4_EXTENSION_REGEX, "");

  // First, try to find the reel in DB and check for S3
  const reel = await prisma.reel.findUnique({
    where: { id: reelId },
    select: { s3Key: true },
  });

  // Try S3 first if reel has s3Key
  if (reel?.s3Key) {
    try {
      const result = await s3Service.getFileStream(reel.s3Key);
      if (result) {
        return new Response(result.stream, {
          headers: {
            "Content-Type": result.metadata.contentType,
            "Content-Length": result.metadata.contentLength.toString(),
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "public, max-age=31536000",
          },
        });
      }
    } catch (s3Error) {
      console.error("S3 download failed, trying local:", s3Error);
    }
  }

  // Fall back to local file
  const filepath = join(getDownloadsPath(hashtag), filename);

  try {
    const fileStat = await stat(filepath);
    if (!fileStat.isFile()) {
      return c.json({ error: "File not found" }, 404);
    }

    const file = Bun.file(filepath);
    return new Response(file, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": fileStat.size.toString(),
      },
    });
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

// ============================================
// SAVED REELS ENDPOINTS
// ============================================

// Get saved reels from database with their analyses
reelsRouter.get("/saved", async (c) => {
  const limit = Number(c.req.query("limit")) || 100;
  const offset = Number(c.req.query("offset")) || 0;
  const minLikes = Number(c.req.query("minLikes")) || 0;
  const hashtag = c.req.query("hashtag");
  const status = c.req.query("status");

  type WhereType = {
    likeCount?: { gte: number };
    hashtag?: string | null;
    status?:
      | "scraped"
      | "downloading"
      | "downloaded"
      | "analyzing"
      | "analyzed"
      | "failed";
  };
  const where: WhereType = {};
  if (minLikes > 0) {
    where.likeCount = { gte: minLikes };
  }
  if (hashtag) {
    where.hashtag = hashtag === "reels" ? null : hashtag;
  }
  if (status) {
    where.status = status as WhereType["status"];
  }

  const [reels, total] = await Promise.all([
    prisma.reel.findMany({
      where,
      orderBy: { likeCount: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.reel.count({ where }),
  ]);

  // Get analyses for these reels
  const reelIds = reels.map((r) => r.id);
  const analyses = await prisma.videoAnalysis.findMany({
    where: {
      sourceType: "reel",
      sourceId: { in: reelIds },
    },
    include: {
      generations: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  // Create a map of reelId -> analysis
  const analysisMap = new Map(analyses.map((a) => [a.sourceId, a]));

  // Merge reels with their analyses
  const reelsWithAnalysis = reels.map((reel) => ({
    ...reel,
    analysis: analysisMap.get(reel.id) || null,
  }));

  return c.json({
    reels: reelsWithAnalysis,
    total,
    limit,
    offset,
  });
});

// Get reel by ID with optional recent logs
reelsRouter.get("/saved/:id", async (c) => {
  const id = c.req.param("id");
  const includeLogs = c.req.query("includeLogs") === "true";

  const reel = await prisma.reel.findUnique({
    where: { id },
    include: includeLogs
      ? {
          logs: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        }
      : undefined,
  });

  if (!reel) {
    return c.json({ error: "Reel not found" }, 404);
  }

  // Если включены логи, добавляем их отдельным полем для удобства
  if (includeLogs && "logs" in reel) {
    return c.json({
      ...reel,
      recentLogs: reel.logs,
    });
  }

  return c.json(reel);
});

// Add reel by direct URL
const addReelSchema = z.object({
  url: z.string().url(),
});

reelsRouter.post("/add", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = addReelSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid request",
          details: parsed.error.flatten().fieldErrors,
        },
        400
      );
    }

    const { url } = parsed.data;

    // Parse shortcode from URL
    const shortcode = parseReelUrl(url);
    if (!shortcode) {
      return c.json(
        {
          error:
            "Invalid Instagram URL. Expected format: instagram.com/reel/SHORTCODE",
        },
        400
      );
    }

    // Check if reel already exists
    const existing = await prisma.reel.findUnique({ where: { id: shortcode } });
    if (existing) {
      return c.json(
        {
          success: true,
          reel: existing,
          message: "Reel already exists",
          isNew: false,
        },
        200
      );
    }

    // Create reel entry
    const reel = await prisma.reel.create({
      data: {
        id: shortcode,
        url: `https://www.instagram.com/reel/${shortcode}/`,
        source: "manual",
        status: "scraped",
      },
    });

    // Start download immediately
    console.log(`[AddReel] Starting download for reel ${shortcode}...`);
    try {
      const jobId = await pipelineJobQueue.addDownloadJob(shortcode);
      console.log(`[AddReel] Download job added: ${jobId}`);
    } catch (queueError) {
      console.error("[AddReel] Failed to add download job:", queueError);
      throw queueError;
    }

    return c.json(
      {
        success: true,
        reel,
        message: "Reel added and download started",
        isNew: true,
      },
      201
    );
  } catch (error) {
    console.error("Failed to add reel:", error);
    return c.json({ error: "Failed to add reel" }, 500);
  }
});

// Stats endpoint for dashboard
reelsRouter.get("/stats", async (c) => {
  try {
    const [
      total,
      scraped,
      downloading,
      downloaded,
      analyzing,
      analyzed,
      failed,
      templates,
      activeGenerations,
    ] = await Promise.all([
      prisma.reel.count(),
      prisma.reel.count({ where: { status: "scraped" } }),
      prisma.reel.count({ where: { status: "downloading" } }),
      prisma.reel.count({ where: { status: "downloaded" } }),
      prisma.reel.count({ where: { status: "analyzing" } }),
      prisma.reel.count({ where: { status: "analyzed" } }),
      prisma.reel.count({ where: { status: "failed" } }),
      prisma.template.count(),
      prisma.videoGeneration.count({
        where: { status: { in: ["pending", "processing"] } },
      }),
    ]);

    return c.json({
      total,
      byStatus: {
        scraped,
        downloading,
        downloaded,
        analyzing,
        analyzed,
        failed,
      },
      templates,
      activeGenerations,
    });
  } catch (error) {
    console.error("Get stats error:", error);
    return c.json({ error: "Failed to get stats" }, 500);
  }
});

// ============================================
// DEBUG ENDPOINTS
// ============================================

// Get reel with full debug information
reelsRouter.get("/:id/debug", async (c) => {
  try {
    const id = c.req.param("id");

    const reel = await reelPipeline.getReelWithDetails(id);

    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    // Получаем статистику по этапам
    const stageStats = await pipelineLogger.getStageStats(id);

    // Получаем последние ошибки
    const recentErrors = await pipelineLogger.getRecentErrors(id);

    // Получаем все логи для таймлайна
    const logs = await pipelineLogger.getReelLogs(id);

    // Собираем таймлайн из логов
    const timeline = logs.map((log) => ({
      stage: log.stage,
      level: log.level,
      message: log.message,
      duration: log.duration,
      timestamp: log.createdAt,
      metadata: log.metadata,
    }));

    // Получаем все анализы для этого рила
    const analyses = await prisma.videoAnalysis.findMany({
      where: {
        sourceId: id,
        sourceType: "reel",
      },
      orderBy: { createdAt: "desc" },
    });

    // Получаем генерации для этого рила (полные данные)
    const generations = await prisma.videoGeneration.findMany({
      where: {
        analysis: { sourceId: id, sourceType: "reel" },
      },
      orderBy: { createdAt: "desc" },
    });
    const generationIds = generations.map((g) => g.id);

    // Получаем AI логи (Kling, OpenAI, Gemini)
    const aiLogs = await prisma.aILog.findMany({
      where: {
        OR: [{ reelId: id }, { generationId: { in: generationIds } }],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Формируем videoUrl из s3Key или localPath
    const videoUrl = buildReelVideoUrl(reel);

    return c.json({
      reel: {
        ...reel,
        videoUrl,
      },
      stageStats,
      recentErrors,
      timeline,
      logs,
      aiLogs,
      // Дополнительные поля для фронтенда
      analyses,
      template: reel.template,
      generations,
      videoUrl,
    });
  } catch (error) {
    console.error("Debug endpoint error:", error);
    return c.json({ error: "Failed to get debug info" }, 500);
  }
});

// Get logs for specific reel
reelsRouter.get("/:id/logs", async (c) => {
  const id = c.req.param("id");
  const stage = c.req.query("stage");
  const limit = Number(c.req.query("limit")) || 100;

  try {
    const logs = stage
      ? await pipelineLogger.getLogsByStage(
          id,
          stage as "scrape" | "download" | "analyze" | "generate"
        )
      : await pipelineLogger.getReelLogs(id, limit);

    return c.json({ logs });
  } catch (error) {
    console.error("Get logs error:", error);
    return c.json({ error: "Failed to get logs" }, 500);
  }
});

// ============================================
// PROCESSING ENDPOINTS
// ============================================

// Process reel (download -> analyze -> template)
reelsRouter.post("/:id/process", async (c) => {
  const reelId = c.req.param("id");

  try {
    const body = await c.req.json().catch(() => ({}));
    const useFrames = body.useFrames === true;
    const forceReprocess = body.force === true;

    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    const jobId = await pipelineJobQueue.addProcessJob(reelId, {
      useFrames,
      forceReprocess,
    });

    return c.json({
      success: true,
      message: "Processing started",
      jobId,
      reelId,
    });
  } catch (error) {
    console.error("Process reel error:", error);
    return c.json({ error: "Failed to start processing" }, 500);
  }
});

// Download reel video
reelsRouter.post("/:id/download", async (c) => {
  const reelId = c.req.param("id");

  try {
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    // Check if already has video
    if (reel.s3Key || reel.localPath) {
      return c.json({
        success: true,
        message: "Video already downloaded",
        reelId,
        hasVideo: true,
      });
    }

    const jobId = await pipelineJobQueue.addDownloadJob(reelId);

    return c.json({
      success: true,
      message: "Download started",
      jobId,
      reelId,
    });
  } catch (error) {
    console.error("Download reel error:", error);
    return c.json({ error: "Failed to start download" }, 500);
  }
});

// Refresh metadata via scrapper
reelsRouter.post("/:id/refresh-metadata", async (c) => {
  const reelId = c.req.param("id");

  try {
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    // Call scrapper service for metadata
    const response = await fetch(`${SCRAPPER_SERVICE_URL}/metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcode: reelId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return c.json({ error: `Scrapper error: ${errorText}` }, 500);
    }

    const metadata = (await response.json()) as {
      success: boolean;
      likeCount?: number;
      viewCount?: number;
      commentCount?: number;
      duration?: number;
      caption?: string;
      author?: string;
      thumbnailUrl?: string;
      error?: string;
    };

    if (!metadata.success) {
      return c.json({ error: metadata.error || "Failed to get metadata" }, 500);
    }

    // Update reel with new metadata
    const updated = await prisma.reel.update({
      where: { id: reelId },
      data: {
        likeCount: metadata.likeCount ?? reel.likeCount,
        viewCount: metadata.viewCount ?? reel.viewCount,
        commentCount: metadata.commentCount ?? reel.commentCount,
        duration: metadata.duration ?? reel.duration,
        caption: metadata.caption ?? reel.caption,
        author: metadata.author ?? reel.author,
        thumbnailUrl: metadata.thumbnailUrl ?? reel.thumbnailUrl,
        scrapedAt: new Date(),
      },
    });

    return c.json({
      success: true,
      message: "Metadata refreshed",
      reel: updated,
    });
  } catch (error) {
    console.error("Refresh metadata error:", error);
    return c.json({ error: "Failed to refresh metadata" }, 500);
  }
});

// Analyze reel
reelsRouter.post("/:id/analyze", async (c) => {
  const reelId = c.req.param("id");

  try {
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    if (!(reel.s3Key || reel.localPath)) {
      return c.json({ error: "Video not downloaded yet" }, 400);
    }

    const jobId = await pipelineJobQueue.addAnalyzeJob(reelId);

    return c.json({
      success: true,
      message: "Analysis started",
      jobId,
      reelId,
    });
  } catch (error) {
    console.error("Analyze reel error:", error);
    return c.json({ error: "Failed to start analysis" }, 500);
  }
});

// Analyze reel by frames
reelsRouter.post("/:id/analyze-frames", async (c) => {
  const reelId = c.req.param("id");

  try {
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    if (!(reel.s3Key || reel.localPath)) {
      return c.json({ error: "Video not downloaded yet" }, 400);
    }

    const jobId = await pipelineJobQueue.addAnalyzeFramesJob(reelId);

    return c.json({
      success: true,
      message: "Frame-by-frame analysis started",
      jobId,
      reelId,
    });
  } catch (error) {
    console.error("Analyze frames error:", error);
    return c.json({ error: "Failed to start frame analysis" }, 500);
  }
});

// Analyze reel with enchanting mode
reelsRouter.post("/:id/analyze-enchanting", async (c) => {
  const reelId = c.req.param("id");

  try {
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    if (!(reel.s3Key || reel.localPath)) {
      return c.json({ error: "Video not downloaded yet" }, 400);
    }

    const jobId = await pipelineJobQueue.addAnalyzeEnchantingJob(reelId);

    return c.json({
      success: true,
      message: "Enchanting analysis started (Gemini + ChatGPT)",
      jobId,
      reelId,
    });
  } catch (error) {
    console.error("Analyze enchanting error:", error);
    return c.json({ error: "Failed to start enchanting analysis" }, 500);
  }
});

// Resize reel video
reelsRouter.post("/:id/resize", async (c) => {
  const reelId = c.req.param("id");

  try {
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    if (!(reel.s3Key || reel.localPath)) {
      return c.json({ error: "Video not downloaded yet" }, 400);
    }

    // Get source video URL
    const sourceUrl = buildReelVideoUrl(reel);
    if (!sourceUrl) {
      return c.json({ error: "Could not build video URL" }, 500);
    }

    // Call video-frames service for resize
    const formData = new FormData();
    formData.append("url", sourceUrl);

    const response = await fetch(`${VIDEO_FRAMES_SERVICE_URL}/resize`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return c.json({ error: `Resize failed: ${errorText}` }, 500);
    }

    // Get resized video
    const resizedBuffer = Buffer.from(await response.arrayBuffer());

    const resized = response.headers.get("X-Resized") === "true";
    const originalWidth = response.headers.get("X-Original-Width");
    const newWidth = response.headers.get("X-New-Width");

    if (resized) {
      // Upload to S3
      const s3Key = `reels/${reelId}.mp4`;
      await s3Service.uploadFile(s3Key, resizedBuffer, "video/mp4");

      // Update reel record
      await prisma.reel.update({
        where: { id: reelId },
        data: { s3Key },
      });

      return c.json({
        success: true,
        message: `Video resized from ${originalWidth}px to ${newWidth}px`,
        resized: true,
        originalWidth: Number(originalWidth),
        newWidth: Number(newWidth),
      });
    }

    return c.json({
      success: true,
      message: "Video already within size limits",
      resized: false,
    });
  } catch (error) {
    console.error("Resize reel error:", error);
    return c.json({ error: "Failed to resize video" }, 500);
  }
});

// ============================================
// BATCH ENDPOINTS
// ============================================

// Batch refresh duration
reelsRouter.post("/batch-refresh-duration", async (c) => {
  try {
    const body = await c.req.json();
    const { reelIds } = body as { reelIds?: string[] };

    if (!(reelIds && Array.isArray(reelIds)) || reelIds.length === 0) {
      return c.json({ error: "reelIds array is required" }, 400);
    }

    const result = await pipelineJobQueue.addBatchRefreshDurationJobs(reelIds);

    return c.json({
      success: true,
      message: `Added ${result.count} refresh-duration jobs`,
      jobIds: result.jobIds,
      count: result.count,
    });
  } catch (error) {
    console.error("Batch refresh duration error:", error);
    return c.json({ error: "Failed to start batch refresh" }, 500);
  }
});

// Batch analyze
reelsRouter.post("/batch-analyze", async (c) => {
  try {
    const body = await c.req.json();
    const { reelIds, mode = "standard" } = body as {
      reelIds?: string[];
      mode?: "standard" | "frames" | "enchanting";
    };

    if (!(reelIds && Array.isArray(reelIds)) || reelIds.length === 0) {
      return c.json({ error: "reelIds array is required" }, 400);
    }

    const jobIds: string[] = [];
    for (const reelId of reelIds) {
      let jobId: string;
      if (mode === "frames") {
        jobId = await pipelineJobQueue.addAnalyzeFramesJob(reelId);
      } else if (mode === "enchanting") {
        jobId = await pipelineJobQueue.addAnalyzeEnchantingJob(reelId);
      } else {
        jobId = await pipelineJobQueue.addAnalyzeJob(reelId);
      }
      jobIds.push(jobId);
    }

    return c.json({
      success: true,
      message: `Added ${jobIds.length} ${mode} analysis jobs`,
      jobIds,
      count: jobIds.length,
    });
  } catch (error) {
    console.error("Batch analyze error:", error);
    return c.json({ error: "Failed to start batch analysis" }, 500);
  }
});

// Batch resize
reelsRouter.post("/batch-resize", async (c) => {
  try {
    const body = await c.req.json();
    const { reelIds } = body as { reelIds?: string[] };

    if (!(reelIds && Array.isArray(reelIds)) || reelIds.length === 0) {
      return c.json({ error: "reelIds array is required" }, 400);
    }

    const results: Array<{
      reelId: string;
      success: boolean;
      resized?: boolean;
      error?: string;
    }> = [];

    for (const reelId of reelIds) {
      try {
        const reel = await prisma.reel.findUnique({ where: { id: reelId } });
        if (!reel) {
          results.push({ reelId, success: false, error: "Not found" });
          continue;
        }

        if (!(reel.s3Key || reel.localPath)) {
          results.push({ reelId, success: false, error: "No video" });
          continue;
        }

        const sourceUrl = buildReelVideoUrl(reel);
        if (!sourceUrl) {
          results.push({ reelId, success: false, error: "No URL" });
          continue;
        }

        const formData = new FormData();
        formData.append("url", sourceUrl);

        const response = await fetch(`${VIDEO_FRAMES_SERVICE_URL}/resize`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          results.push({
            reelId,
            success: false,
            error: await response.text(),
          });
          continue;
        }

        const resized = response.headers.get("X-Resized") === "true";

        if (resized) {
          const resizedBuffer = Buffer.from(await response.arrayBuffer());
          const s3Key = `reels/${reelId}.mp4`;
          await s3Service.uploadFile(s3Key, resizedBuffer, "video/mp4");
          await prisma.reel.update({
            where: { id: reelId },
            data: { s3Key },
          });
        }

        results.push({ reelId, success: true, resized });
      } catch (err) {
        results.push({
          reelId,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const resizedCount = results.filter((r) => r.resized).length;

    return c.json({
      success: true,
      message: `Processed ${results.length} reels, ${resizedCount} resized`,
      results,
    });
  } catch (error) {
    console.error("Batch resize error:", error);
    return c.json({ error: "Failed to batch resize" }, 500);
  }
});

// ============================================
// DELETE ENDPOINTS
// ============================================

// Delete single reel
reelsRouter.delete("/saved/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    // Delete from S3 if exists
    if (reel.s3Key) {
      try {
        await s3Service.deleteFile(reel.s3Key);
      } catch (s3Error) {
        console.error("Failed to delete from S3:", s3Error);
      }
    }

    // Delete local file if exists
    if (reel.localPath && existsSync(reel.localPath)) {
      try {
        await unlink(reel.localPath);
      } catch (fsError) {
        console.error("Failed to delete local file:", fsError);
      }
    }

    // Delete related records
    await prisma.videoAnalysis.deleteMany({
      where: { sourceType: "reel", sourceId: id },
    });

    await prisma.reel.delete({ where: { id } });

    return c.json({ success: true, message: "Reel deleted" });
  } catch (error) {
    console.error("Delete reel error:", error);
    return c.json({ error: "Failed to delete reel" }, 500);
  }
});

// Delete all reels
reelsRouter.delete("/saved", async (c) => {
  try {
    // Get all reels for cleanup
    const reels = await prisma.reel.findMany({
      select: { id: true, s3Key: true, localPath: true },
    });

    // Delete from S3
    for (const reel of reels) {
      if (reel.s3Key) {
        try {
          await s3Service.deleteFile(reel.s3Key);
        } catch (s3Error) {
          console.error(`Failed to delete ${reel.s3Key} from S3:`, s3Error);
        }
      }
    }

    // Delete related records
    await prisma.videoAnalysis.deleteMany({
      where: { sourceType: "reel" },
    });

    const result = await prisma.reel.deleteMany();

    return c.json({
      success: true,
      message: `Deleted ${result.count} reels`,
      count: result.count,
    });
  } catch (error) {
    console.error("Delete all reels error:", error);
    return c.json({ error: "Failed to delete reels" }, 500);
  }
});

export { reelsRouter };
