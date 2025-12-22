import { existsSync } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import prisma from "@trender/db";
import { Hono } from "hono";
import { z } from "zod";
import {
  getCookiesFromDb,
  hasCredentials,
  saveCookies,
} from "../services/instagram/credentials";
import {
  downloadVideos,
  getDownloadsPath,
} from "../services/instagram/downloader";
import { parseReelUrl } from "../services/instagram/reel-url";
import {
  getCookiesPath,
  getSessionPath,
  launchLoginBrowser,
  scrapeReels,
  testConnection,
} from "../services/instagram/scraper";
import type {
  JobStatusResponse,
  ScrapeResponse,
  SortMode,
} from "../services/instagram/types";
import { pipelineLogger } from "../services/pipeline-logger";
import { pipelineJobQueue, scrapeJobQueue } from "../services/queues";
import { reelPipeline } from "../services/reel-pipeline";
import { s3Service } from "../services/s3";

declare const Bun: {
  file(path: string): Blob;
};

const MP4_EXTENSION_REGEX = /\.mp4$/;

const reelsRouter = new Hono();

const scrapeRequestSchema = z.object({
  limit: z.number().int().min(1).max(100).default(2),
  sort: z.enum(["top", "recent"]).default("top"),
  minLikes: z.number().int().min(0).default(50_000),
});

// Инициализация обработчика воркера для BullMQ scrape queue
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: воркер содержит полный pipeline (scrape->save->download) и прогресс-репортинг.
scrapeJobQueue.setWorkerHandler(async (bullJob) => {
  const jobId = bullJob.id ?? "";
  const { sortMode, limit, minLikes } = bullJob.data;

  await scrapeJobQueue.updateJobStatus(jobId, "running");

  try {
    console.log(
      `Starting scrape job ${jobId} for /reels/ (${sortMode}, limit: ${limit}, minLikes: ${minLikes})`
    );

    const reels = await scrapeReels(
      {
        limit,
        sortMode,
        minLikes,
      },
      (update) => {
        scrapeJobQueue.updateJobProgress(jobId, {
          scanned: update.scanned,
          found: update.found,
          scraped: update.found,
          currentReelId: update.currentReelId,
          currentLikes: update.currentLikes,
          lastFoundReel: update.lastFoundReel,
        });
      }
    );

    await scrapeJobQueue.addReels(jobId, reels);
    await scrapeJobQueue.updateJobProgress(jobId, { total: reels.length });

    // Save reels to database
    console.log(`Saving ${reels.length} reels to database...`);
    let savedCount = 0;

    for (const reel of reels) {
      try {
        // Clean URL - remove query params that may contain invalid bytes
        const cleanVideoUrl = reel.videoUrl
          ? reel.videoUrl.split("?")[0]
          : null;

        await prisma.reel.upsert({
          where: { id: reel.id },
          update: {
            url: reel.url,
            videoUrl: cleanVideoUrl,
            likeCount: reel.likeCount ?? null,
            viewCount: reel.viewCount ?? null,
            commentCount: reel.commentCount ?? null,
            caption: reel.caption ?? null,
            author: reel.author ?? null,
            thumbnailUrl: reel.thumbnailUrl ?? null,
            duration: reel.duration ?? null,
            source: "reels",
            scrapedAt: new Date(),
          },
          create: {
            id: reel.id,
            url: reel.url,
            videoUrl: cleanVideoUrl,
            likeCount: reel.likeCount ?? null,
            viewCount: reel.viewCount ?? null,
            commentCount: reel.commentCount ?? null,
            caption: reel.caption ?? null,
            author: reel.author ?? null,
            thumbnailUrl: reel.thumbnailUrl ?? null,
            duration: reel.duration ?? null,
            source: "reels",
          },
        });
        savedCount += 1;
      } catch (dbError) {
        console.error(`Failed to save reel ${reel.id}:`, dbError);
      }
    }
    console.log(`Saved ${savedCount}/${reels.length} reels to database`);

    // Download videos via Python instaloader service
    console.log(
      `Starting downloads for ${reels.length} reels via instaloader...`
    );

    if (reels.length > 0) {
      await downloadVideos(reels, "reels", (_downloaded, filename) => {
        scrapeJobQueue.addDownloadedFile(jobId, filename);
      });
    }

    await scrapeJobQueue.completeJob(jobId);
    console.log(`Job ${jobId} completed successfully`);

    return { reels, downloadedFiles: [] };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Job ${jobId} failed:`, errorMessage);
    await scrapeJobQueue.setJobError(jobId, errorMessage);
    throw error; // Re-throw для BullMQ
  }
});

reelsRouter.post("/scrape", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = scrapeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid request",
          details: parsed.error.flatten().fieldErrors,
        },
        400
      );
    }

    const { limit, sort, minLikes } = parsed.data;

    // BullMQ автоматически обработает задачу через воркер
    const job = await scrapeJobQueue.createJob(
      sort as SortMode,
      limit,
      minLikes
    );

    const response: ScrapeResponse = {
      jobId: job.id,
      status: job.status,
      message: `Scraping job started for /reels/ (min ${minLikes} likes)`,
    };

    return c.json(response, 201);
  } catch (error) {
    console.error("Failed to start scrape job:", error);
    return c.json({ error: "Failed to start scrape job" }, 500);
  }
});

reelsRouter.get("/status/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const job = await scrapeJobQueue.getJob(jobId);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  const response: JobStatusResponse = {
    id: job.id,
    status: job.status,
    sortMode: job.sortMode,
    minLikes: job.minLikes,
    progress: job.progress,
    downloadedFiles: job.downloadedFiles,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };

  return c.json(response);
});

reelsRouter.get("/jobs", async (c) => {
  const jobs = await scrapeJobQueue.getAllJobs();

  const response = jobs.map((job) => ({
    id: job.id,
    status: job.status,
    sortMode: job.sortMode,
    minLikes: job.minLikes,
    progress: job.progress,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  }));

  return c.json(response);
});

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

reelsRouter.get("/test", async (c) => {
  const connected = await testConnection();
  return c.json({
    status: connected ? "ok" : "error",
    message: connected
      ? "Connection to Instagram successful"
      : "Failed to connect to Instagram",
  });
});

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

// Auth status endpoint
reelsRouter.get("/auth/status", async (c) => {
  const hasCookiesFile = existsSync(getCookiesPath());
  const hasSessionFile = existsSync(getSessionPath());
  const hasDbCredentials = await hasCredentials();

  return c.json({
    hasCookies: hasDbCredentials || hasCookiesFile,
    hasSession: hasDbCredentials || hasSessionFile,
    isConfigured: hasDbCredentials || hasCookiesFile || hasSessionFile,
    hasDbCredentials,
  });
});

// Get cookies from database (for scrapper service)
reelsRouter.get("/auth/cookies", async (c) => {
  const cookies = await getCookiesFromDb();

  if (!cookies || cookies.length === 0) {
    return c.json({ error: "No cookies found" }, 404);
  }

  return c.json({ cookies });
});

// Upload cookies endpoint
reelsRouter.post("/auth/cookies", async (c) => {
  try {
    const body = await c.req.json();

    if (!Array.isArray(body)) {
      return c.json({ error: "Cookies must be an array" }, 400);
    }

    // Validate cookie format
    for (const cookie of body) {
      if (!(cookie.name && cookie.value && cookie.domain)) {
        return c.json(
          { error: "Each cookie must have name, value, and domain" },
          400
        );
      }
    }

    // Сохраняем cookies в базу данных
    await saveCookies(body);

    return c.json({
      success: true,
      message: `Saved ${body.length} cookies to database`,
    });
  } catch (error) {
    console.error("Failed to save cookies:", error);
    return c.json({ error: "Failed to save cookies" }, 500);
  }
});

// Launch browser for manual login (only works on local machine with display)
reelsRouter.post("/auth/login", (c) => {
  // This will run in background
  setImmediate(() => {
    launchLoginBrowser().catch((error) => {
      console.error("Login browser error:", error);
    });
  });

  return c.json({
    success: true,
    message:
      "Browser launched for login. Please log in and close the browser when done.",
  });
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

    // Получаем все анализы для этого рила (история анализов)
    const analyses = await prisma.videoAnalysis.findMany({
      where: {
        sourceType: "reel",
        sourceId: id,
      },
      orderBy: { createdAt: "desc" },
    });

    // Получаем генерации для всех анализов
    const analysisIds = analyses.map((a) => a.id);
    const generations = await prisma.videoGeneration.findMany({
      where: { analysisId: { in: analysisIds } },
      orderBy: { createdAt: "desc" },
    });

    // Формируем URL для референса видео (для Kling генерации)
    let videoUrl: string | null = null;
    if (reel.s3Key) {
      videoUrl = `/api/files/reels/${reel.id}`;
    } else if (reel.localPath) {
      const folder = reel.hashtag || reel.source;
      videoUrl = `/api/reels/downloads/${folder}/${reel.id}.mp4`;
    }

    return c.json({
      reel: {
        id: reel.id,
        url: reel.url,
        status: reel.status,
        likeCount: reel.likeCount,
        viewCount: reel.viewCount,
        commentCount: reel.commentCount,
        duration: reel.duration,
        caption: reel.caption,
        author: reel.author,
        thumbnailUrl: reel.thumbnailUrl,
        videoUrl: reel.videoUrl,
        source: reel.source,
        localPath: reel.localPath,
        s3Key: reel.s3Key,
        errorMessage: reel.errorMessage,
        scrapedAt: reel.scrapedAt,
        updatedAt: reel.updatedAt,
      },
      logs: reel.logs,
      stageStats,
      recentErrors,
      template: reel.template,
      analyses, // Массив всех анализов для сравнения
      videoUrl,
      generations,
    });
  } catch (error) {
    console.error("Get reel debug error:", error);
    return c.json({ error: "Failed to get reel debug info" }, 500);
  }
});

// Get logs for a reel
reelsRouter.get("/:id/logs", async (c) => {
  try {
    const id = c.req.param("id");
    const stage = c.req.query("stage");
    const limit = Number(c.req.query("limit")) || 100;

    const logs = stage
      ? await pipelineLogger.getLogsByStage(
          id,
          stage as "scrape" | "download" | "analyze" | "generate"
        )
      : await pipelineLogger.getReelLogs(id, limit);

    return c.json({ logs });
  } catch (error) {
    console.error("Get reel logs error:", error);
    return c.json({ error: "Failed to get reel logs" }, 500);
  }
});

// Start full pipeline processing for a reel
reelsRouter.post("/:id/process", async (c) => {
  try {
    const id = c.req.param("id");

    const body = await c.req.json().catch(() => ({}));
    const processSchema = z.object({
      skipDownload: z.boolean().optional(),
      skipAnalysis: z.boolean().optional(),
      forceReprocess: z.boolean().optional(),
    });

    const parsed = processSchema.safeParse(body);
    const options = parsed.success ? parsed.data : {};

    // Проверяем существование рила
    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    // Запускаем обработку через очередь
    const jobId = await pipelineJobQueue.addProcessJob(id, options);

    return c.json({
      success: true,
      jobId,
      reelId: id,
      message: "Pipeline processing started",
    });
  } catch (error) {
    console.error("Start pipeline error:", error);
    return c.json({ error: "Failed to start pipeline" }, 500);
  }
});

// Download a specific reel
reelsRouter.post("/:id/download", async (c) => {
  try {
    const id = c.req.param("id");

    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    // Запускаем загрузку через очередь
    const jobId = await pipelineJobQueue.addDownloadJob(id);

    return c.json({
      success: true,
      jobId,
      reelId: id,
      message: "Download started",
    });
  } catch (error) {
    console.error("Start download error:", error);
    return c.json({ error: "Failed to start download" }, 500);
  }
});

// Refresh metadata for a reel
const SCRAPPER_SERVICE_URL =
  process.env.SCRAPPER_SERVICE_URL ||
  process.env.INSTALOADER_SERVICE_URL ||
  "http://localhost:8001";

reelsRouter.post("/:id/refresh-metadata", async (c) => {
  try {
    const id = c.req.param("id");

    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    // Получаем метаданные через scrapper сервис
    const metadataResponse = await fetch(`${SCRAPPER_SERVICE_URL}/metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcode: id }),
    });

    if (!metadataResponse.ok) {
      return c.json({ error: "Failed to fetch metadata from Instagram" }, 502);
    }

    const metadata = (await metadataResponse.json()) as {
      success: boolean;
      caption?: string;
      commentCount?: number;
      likeCount?: number;
      viewCount?: number;
      author?: string;
      thumbnailUrl?: string;
      duration?: number;
      error?: string;
    };

    if (!metadata.success) {
      return c.json({ error: metadata.error || "Failed to get metadata" }, 400);
    }

    // Обновляем рил в БД
    const updatedReel = await prisma.reel.update({
      where: { id },
      data: {
        caption: metadata.caption ?? reel.caption,
        commentCount: metadata.commentCount ?? reel.commentCount,
        likeCount: metadata.likeCount ?? reel.likeCount,
        viewCount: metadata.viewCount ?? reel.viewCount,
        author: metadata.author ?? reel.author,
        thumbnailUrl: metadata.thumbnailUrl ?? reel.thumbnailUrl,
        duration: metadata.duration ?? reel.duration,
      },
    });

    return c.json({
      success: true,
      reel: updatedReel,
      message: "Metadata refreshed",
    });
  } catch (error) {
    console.error("Refresh metadata error:", error);
    return c.json({ error: "Failed to refresh metadata" }, 500);
  }
});

// Batch refresh duration for reels without duration
reelsRouter.post("/batch-refresh-duration", async (c) => {
  try {
    // Находим все рилы без duration
    const reelsWithoutDuration = await prisma.reel.findMany({
      where: { duration: null },
      select: { id: true },
      take: 100, // Лимит чтобы не перегрузить
    });

    if (reelsWithoutDuration.length === 0) {
      return c.json({
        success: true,
        message: "No reels without duration found",
        updated: 0,
        failed: 0,
        total: 0,
      });
    }

    let updated = 0;
    let failed = 0;
    const errors: { id: string; error: string }[] = [];

    // Обновляем по очереди с небольшой задержкой
    for (const reel of reelsWithoutDuration) {
      try {
        const metadataResponse = await fetch(
          `${SCRAPPER_SERVICE_URL}/metadata`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shortcode: reel.id }),
          }
        );

        if (!metadataResponse.ok) {
          failed++;
          errors.push({ id: reel.id, error: "Failed to fetch metadata" });
          continue;
        }

        const metadata = (await metadataResponse.json()) as {
          success: boolean;
          duration?: number;
          error?: string;
        };

        if (!(metadata.success && metadata.duration)) {
          failed++;
          errors.push({
            id: reel.id,
            error: metadata.error || "No duration in metadata",
          });
          continue;
        }

        await prisma.reel.update({
          where: { id: reel.id },
          data: { duration: metadata.duration },
        });

        updated++;

        // Небольшая задержка между запросами
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        failed++;
        errors.push({
          id: reel.id,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return c.json({
      success: true,
      message: `Updated ${updated} reels, ${failed} failed`,
      updated,
      failed,
      total: reelsWithoutDuration.length,
      errors: errors.slice(0, 10), // Первые 10 ошибок
    });
  } catch (error) {
    console.error("Batch refresh duration error:", error);
    return c.json({ error: "Failed to batch refresh duration" }, 500);
  }
});

// Batch analyze multiple reels
const batchAnalyzeSchema = z.object({
  reelIds: z.array(z.string()).min(1).max(100),
  analysisType: z.enum(["standard", "frames"]).default("standard"),
});

reelsRouter.post("/batch-analyze", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = batchAnalyzeSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid request",
          details: parsed.error.flatten().fieldErrors,
        },
        400
      );
    }

    const { reelIds, analysisType } = parsed.data;

    // Проверяем существование рилов и наличие видео
    const reels = await prisma.reel.findMany({
      where: { id: { in: reelIds } },
      select: { id: true, localPath: true, s3Key: true, status: true },
    });

    const foundIds = new Set(reels.map((r) => r.id));
    const notFound = reelIds.filter((id) => !foundIds.has(id));
    const withoutVideo = reels.filter((r) => !(r.localPath || r.s3Key));
    const validReels = reels.filter((r) => r.localPath || r.s3Key);

    if (validReels.length === 0) {
      return c.json(
        {
          error: "No valid reels to analyze",
          notFound,
          withoutVideo: withoutVideo.map((r) => r.id),
        },
        400
      );
    }

    // Добавляем задачи в очередь
    const jobIds: string[] = [];
    for (const reel of validReels) {
      const jobId =
        analysisType === "frames"
          ? await pipelineJobQueue.addAnalyzeFramesJob(reel.id)
          : await pipelineJobQueue.addAnalyzeJob(reel.id);
      jobIds.push(jobId);
    }

    console.log(
      `[BatchAnalyze] Started ${jobIds.length} ${analysisType} analysis jobs`
    );

    return c.json({
      success: true,
      queued: validReels.length,
      jobIds,
      skipped: {
        notFound,
        withoutVideo: withoutVideo.map((r) => r.id),
      },
      message: `Queued ${validReels.length} reels for ${analysisType} analysis`,
    });
  } catch (error) {
    console.error("Batch analyze error:", error);
    return c.json({ error: "Failed to start batch analysis" }, 500);
  }
});

// Analyze a specific reel
reelsRouter.post("/:id/analyze", async (c) => {
  try {
    const id = c.req.param("id");

    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    if (!(reel.localPath || reel.s3Key)) {
      return c.json({ error: "Reel has no video. Download first." }, 400);
    }

    // Запускаем анализ через очередь
    const jobId = await pipelineJobQueue.addAnalyzeJob(id);

    return c.json({
      success: true,
      jobId,
      reelId: id,
      message: "Analysis started",
    });
  } catch (error) {
    console.error("Start analysis error:", error);
    return c.json({ error: "Failed to start analysis" }, 500);
  }
});

// Analyze a specific reel by frames (using video-frames service)
reelsRouter.post("/:id/analyze-frames", async (c) => {
  try {
    const id = c.req.param("id");

    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    if (!(reel.localPath || reel.s3Key)) {
      return c.json({ error: "Reel has no video. Download first." }, 400);
    }

    // Запускаем анализ по кадрам через очередь
    const jobId = await pipelineJobQueue.addAnalyzeFramesJob(id);

    return c.json({
      success: true,
      jobId,
      reelId: id,
      message: "Frame-by-frame analysis started",
    });
  } catch (error) {
    console.error("Start frame analysis error:", error);
    return c.json({ error: "Failed to start frame analysis" }, 500);
  }
});

// Analyze a specific reel using enchanting mode (Gemini + ChatGPT)
reelsRouter.post("/:id/analyze-enchanting", async (c) => {
  try {
    const id = c.req.param("id");

    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    if (!(reel.localPath || reel.s3Key)) {
      return c.json({ error: "Reel has no video. Download first." }, 400);
    }

    // Запускаем enchanting анализ через очередь
    const jobId = await pipelineJobQueue.addAnalyzeEnchantingJob(id);

    return c.json({
      success: true,
      jobId,
      reelId: id,
      message: "Enchanting analysis started (Gemini + ChatGPT)",
    });
  } catch (error) {
    console.error("Start enchanting analysis error:", error);
    return c.json({ error: "Failed to start enchanting analysis" }, 500);
  }
});

// ============================================
// DELETE ENDPOINTS
// ============================================

// Delete a single reel by ID
reelsRouter.delete("/saved/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    // 1. Удалить файл из S3
    if (reel.s3Key) {
      try {
        await s3Service.deleteFile(reel.s3Key);
      } catch (s3Error) {
        console.error(`Failed to delete S3 file ${reel.s3Key}:`, s3Error);
      }
    }

    // 2. Удалить локальный файл
    if (reel.localPath) {
      try {
        await unlink(reel.localPath);
      } catch {
        // Файл может не существовать, это нормально
      }
    }

    // 3. Удалить связанные VideoAnalysis (нет cascade в схеме)
    await prisma.videoAnalysis.deleteMany({
      where: { sourceType: "reel", sourceId: id },
    });

    // 4. Удалить рил (Template и ReelLog удалятся каскадно)
    await prisma.reel.delete({ where: { id } });

    console.log(`Reel ${id} deleted successfully`);
    return c.json({ success: true });
  } catch (error) {
    console.error("Delete reel error:", error);
    return c.json({ error: "Failed to delete reel" }, 500);
  }
});

// Delete all reels
reelsRouter.delete("/saved", async (c) => {
  try {
    // Получить все рилы с файлами
    const reels = await prisma.reel.findMany({
      select: { id: true, s3Key: true, localPath: true },
    });

    console.log(`Deleting ${reels.length} reels...`);

    // Удалить файлы из S3 и локально
    for (const reel of reels) {
      if (reel.s3Key) {
        try {
          await s3Service.deleteFile(reel.s3Key);
        } catch {
          // Продолжаем даже если не удалось удалить файл
        }
      }
      if (reel.localPath) {
        try {
          await unlink(reel.localPath);
        } catch {
          // Файл может не существовать
        }
      }
    }

    // Удалить все VideoAnalysis для рилов
    await prisma.videoAnalysis.deleteMany({
      where: { sourceType: "reel" },
    });

    // Удалить все рилы (Template и ReelLog удалятся каскадно)
    const result = await prisma.reel.deleteMany();

    console.log(`Deleted ${result.count} reels`);
    return c.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error("Delete all reels error:", error);
    return c.json({ error: "Failed to delete all reels" }, 500);
  }
});

export { reelsRouter };
