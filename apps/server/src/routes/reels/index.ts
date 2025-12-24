import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import prisma from "@trender/db";
import { services } from "../../config";
import {
  AddReelRequestSchema,
  AddReelResponseSchema,
  BatchRefreshDurationRequestSchema,
  ErrorResponseSchema,
  NotFoundResponseSchema,
  ProcessReelRequestSchema,
  ProcessReelResponseSchema,
  ReelListQuerySchema,
  ReelStatsResponseSchema,
  RefreshMetadataResponseSchema,
  ResizeReelResponseSchema,
} from "../../schemas";
import { getDownloadsPath } from "../../services/instagram/downloader";
import { pipelineLogger } from "../../services/pipeline-logger";
import { pipelineJobQueue } from "../../services/queues";
import { s3Service } from "../../services/s3";
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
const reelsRouter = new OpenAPIHono();

// Mount sub-routers
reelsRouter.route("/auth", authRouter);
reelsRouter.route("/scrape", scrapeRouter);

// Initialize worker handler
initScrapeWorkerHandler();

// ============================================
// ROUTE DEFINITIONS
// ============================================

const listScrapeJobsRoute = createRoute({
  method: "get",
  path: "/jobs",
  summary: "Get all scrape jobs",
  tags: ["Reels"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(z.any()),
        },
      },
      description: "List of scrape jobs",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const listDownloadsRoute = createRoute({
  method: "get",
  path: "/downloads",
  summary: "List downloaded files",
  tags: ["Reels"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.record(z.string(), z.array(z.string())),
        },
      },
      description: "Map of hashtags to filenames",
    },
  },
});

const downloadFileRoute = createRoute({
  method: "get",
  path: "/downloads/{hashtag}/{filename}",
  summary: "Download specific file",
  tags: ["Reels"],
  request: {
    params: z.object({
      hashtag: z.string().openapi({ param: { name: "hashtag", in: "path" } }),
      filename: z.string().openapi({ param: { name: "filename", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description: "Video stream",
      content: {
        "video/mp4": {
          schema: z.string().openapi({ format: "binary" }),
        },
      },
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid file type",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "File not found",
    },
  },
});

const listSavedReelsRoute = createRoute({
  method: "get",
  path: "/saved",
  summary: "Get saved reels",
  tags: ["Reels"],
  request: {
    query: ReelListQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            reels: z.array(z.any()),
            total: z.number(),
            limit: z.number(),
            offset: z.number(),
          }),
        },
      },
      description: "List of saved reels",
    },
  },
});

const getSavedReelRoute = createRoute({
  method: "get",
  path: "/saved/{id}",
  summary: "Get saved reel by ID",
  tags: ["Reels"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
    query: z.object({
      includeLogs: z
        .enum(["true", "false"])
        .optional()
        .openapi({ param: { name: "includeLogs", in: "query" } }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.any(),
        },
      },
      description: "Reel details",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Reel not found",
    },
  },
});

const deleteSavedReelRoute = createRoute({
  method: "delete",
  path: "/saved/{id}",
  summary: "Delete saved reel by ID",
  tags: ["Reels"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
      description: "Reel deleted successfully",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Reel not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const addReelRoute = createRoute({
  method: "post",
  path: "/add",
  summary: "Add reel by URL",
  tags: ["Reels"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: AddReelRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: AddReelResponseSchema,
        },
      },
      description: "Reel added successfully",
    },
    200: {
      content: {
        "application/json": {
          schema: AddReelResponseSchema,
        },
      },
      description: "Reel already exists",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid URL",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const getReelStatsRoute = createRoute({
  method: "get",
  path: "/stats",
  summary: "Get dashboard stats",
  tags: ["Reels"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ReelStatsResponseSchema,
        },
      },
      description: "Dashboard statistics",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const getReelDebugRoute = createRoute({
  method: "get",
  path: "/{id}/debug",
  summary: "Get full debug info for reel",
  tags: ["Reels"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.any(),
        },
      },
      description: "Debug info",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Reel not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const getReelLogsRoute = createRoute({
  method: "get",
  path: "/{id}/logs",
  summary: "Get reel logs",
  tags: ["Reels"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
    query: z.object({
      stage: z
        .string()
        .optional()
        .openapi({ param: { name: "stage", in: "query" } }),
      limit: z.coerce
        .number()
        .optional()
        .openapi({ param: { name: "limit", in: "query" } }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            logs: z.array(
              z.object({
                id: z.string(),
                level: z.string(),
                stage: z.string(),
                message: z.string(),
                duration: z.number().nullable(),
                createdAt: z.string(),
                metadata: z.unknown(),
              })
            ),
          }),
        },
      },
      description: "Reel logs",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const processReelRoute = createRoute({
  method: "post",
  path: "/{id}/process",
  summary: "Process reel (full flow)",
  tags: ["Reels"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
    body: {
      content: {
        "application/json": {
          schema: ProcessReelRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ProcessReelResponseSchema,
        },
      },
      description: "Processing started",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Reel not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const downloadReelRoute = createRoute({
  method: "post",
  path: "/{id}/download",
  summary: "Start reel download",
  tags: ["Reels"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.any(),
        },
      },
      description: "Download started",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Reel not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const refreshReelMetadataRoute = createRoute({
  method: "post",
  path: "/{id}/refresh-metadata",
  summary: "Refresh reel metadata",
  tags: ["Reels"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: RefreshMetadataResponseSchema,
        },
      },
      description: "Metadata refreshed",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Reel not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const analyzeReelRoute = createRoute({
  method: "post",
  path: "/{id}/analyze",
  summary: "Analyze reel",
  tags: ["Reels"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ProcessReelResponseSchema,
        },
      },
      description: "Analysis started",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Video not downloaded",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Reel not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const analyzeReelFramesRoute = createRoute({
  method: "post",
  path: "/{id}/analyze-frames",
  summary: "Analyze reel frames",
  tags: ["Reels"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ProcessReelResponseSchema,
        },
      },
      description: "Analysis started",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Video not downloaded",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Reel not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const resizeReelRoute = createRoute({
  method: "post",
  path: "/{id}/resize",
  summary: "Resize reel video",
  tags: ["Reels"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ResizeReelResponseSchema,
        },
      },
      description: "Resize result",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Video not downloaded",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Reel not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const batchRefreshDurationRoute = createRoute({
  method: "post",
  path: "/batch-refresh-duration",
  summary: "Batch refresh durations",
  tags: ["Reels"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: BatchRefreshDurationRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.any(),
        },
      },
      description: "Batch refresh result",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Invalid request",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const resetReelStatusRoute = createRoute({
  method: "post",
  path: "/{id}/reset-status",
  summary: "Reset reel status to downloaded",
  tags: ["Reels"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            reel: z.any(),
          }),
        },
      },
      description: "Status reset successfully",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Video not downloaded",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Reel not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

// ============================================
// ROUTE IMPLEMENTATIONS
// ============================================

reelsRouter.openapi(listScrapeJobsRoute, async (c) => {
  try {
    const { scrapeJobQueue } = await import("../../services/queues");
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
      })),
      200
    );
  } catch (error) {
    console.error("Get jobs error:", error);
    return c.json({ error: "Failed to get jobs" }, 500);
  }
});

reelsRouter.openapi(listDownloadsRoute, async (c) => {
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

    return c.json(result, 200);
  } catch {
    return c.json({}, 200);
  }
});

reelsRouter.openapi(downloadFileRoute, async (c) => {
  const { hashtag, filename } = c.req.valid("param");

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

reelsRouter.openapi(listSavedReelsRoute, async (c) => {
  const { limit, offset, minLikes, hashtag, status, search } =
    c.req.valid("query");

  const { listSavedReelsUseCase } = await import("../../application/reels");
  const result = await listSavedReelsUseCase({
    limit,
    offset,
    minLikes,
    hashtag,
    status,
    search,
  });

  return c.json(result, 200);
});

reelsRouter.openapi(getSavedReelRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { includeLogs } = c.req.valid("query");
  const shouldIncludeLogs = includeLogs === "true";

  const reel = await prisma.reel.findUnique({
    where: { id },
    include: shouldIncludeLogs
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
  if (shouldIncludeLogs && "logs" in reel) {
    return c.json(
      {
        ...reel,
        recentLogs: reel.logs,
      },
      200
    );
  }

  return c.json(reel, 200);
});

reelsRouter.openapi(deleteSavedReelRoute, async (c) => {
  const { id } = c.req.valid("param");

  try {
    const { deleteReelUseCase } = await import("../../application/reels");
    const result = await deleteReelUseCase(id);

    if (!result.success) {
      return c.json({ error: result.error }, result.status);
    }

    return c.json({ success: true, message: result.message }, 200);
  } catch (error) {
    console.error("Delete reel error:", error);
    return c.json({ error: "Failed to delete reel" }, 500);
  }
});

reelsRouter.openapi(addReelRoute, async (c) => {
  try {
    const { url } = c.req.valid("json");
    const { addReelUseCase } = await import("../../application/reels");
    const result = await addReelUseCase(url);

    if (!result.success) {
      return c.json({ error: result.error }, result.status);
    }

    return c.json(
      {
        success: true,
        reel: result.reel,
        message: result.message,
        isNew: result.isNew,
      },
      result.isNew ? 201 : 200
    );
  } catch (error) {
    console.error("Failed to add reel:", error);
    return c.json({ error: "Failed to add reel" }, 500);
  }
});

reelsRouter.openapi(getReelStatsRoute, async (c) => {
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

    return c.json(
      {
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
      },
      200
    );
  } catch (error) {
    console.error("Get stats error:", error);
    return c.json({ error: "Failed to get stats" }, 500);
  }
});

reelsRouter.openapi(getReelDebugRoute, async (c) => {
  try {
    const { id } = c.req.valid("param");
    const { getReelDebugUseCase } = await import("../../application/reels");
    const result = await getReelDebugUseCase(id);

    if (!result.success) {
      return c.json({ error: result.error }, result.status);
    }

    return c.json(result.data, 200);
  } catch (error) {
    console.error("Debug endpoint error:", error);
    return c.json({ error: "Failed to get debug info" }, 500);
  }
});

reelsRouter.openapi(getReelLogsRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { stage, limit } = c.req.valid("query");

  try {
    const logs = stage
      ? await pipelineLogger.getLogsByStage(
          id,
          stage as "scrape" | "download" | "analyze" | "generate"
        )
      : await pipelineLogger.getReelLogs(id, limit || 100);

    return c.json(
      {
        logs: logs.map((log) => ({
          id: log.id,
          level: log.level as string,
          stage: log.stage,
          message: log.message,
          duration: log.duration,
          createdAt: log.createdAt.toISOString(),
          metadata: log.metadata as unknown,
        })),
      },
      200
    );
  } catch (error) {
    console.error("Get logs error:", error);
    return c.json({ error: "Failed to get logs" }, 500);
  }
});

reelsRouter.openapi(processReelRoute, async (c) => {
  const { id } = c.req.valid("param");

  try {
    const { useFrames, force } = c.req.valid("json");

    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    const jobId = await pipelineJobQueue.addProcessJob(id, {
      useFrames,
      forceReprocess: force,
    });

    return c.json(
      {
        success: true,
        message: "Processing started",
        jobId,
        reelId: id,
      },
      200
    );
  } catch (error) {
    console.error("Process reel error:", error);
    return c.json({ error: "Failed to start processing" }, 500);
  }
});

reelsRouter.openapi(downloadReelRoute, async (c) => {
  const { id } = c.req.valid("param");

  try {
    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    // Check if already has video
    if (reel.s3Key || reel.localPath) {
      return c.json(
        {
          success: true,
          message: "Video already downloaded",
          reelId: id,
          hasVideo: true,
        },
        200
      );
    }

    const jobId = await pipelineJobQueue.addDownloadJob(id);

    return c.json(
      {
        success: true,
        message: "Download started",
        jobId,
        reelId: id,
      },
      200
    );
  } catch (error) {
    console.error("Download reel error:", error);
    return c.json({ error: "Failed to start download" }, 500);
  }
});

reelsRouter.openapi(refreshReelMetadataRoute, async (c) => {
  const { id } = c.req.valid("param");

  try {
    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    // Call scrapper service for metadata
    const response = await fetch(`${SCRAPPER_SERVICE_URL}/metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcode: id }),
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
      where: { id },
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

    return c.json(
      {
        success: true,
        message: "Metadata refreshed",
        reel: updated,
      },
      200
    );
  } catch (error) {
    console.error("Refresh metadata error:", error);
    return c.json({ error: "Failed to refresh metadata" }, 500);
  }
});

reelsRouter.openapi(analyzeReelRoute, async (c) => {
  const { id } = c.req.valid("param");

  try {
    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    if (!(reel.s3Key || reel.localPath)) {
      return c.json({ error: "Video not downloaded yet" }, 400);
    }

    const jobId = await pipelineJobQueue.addAnalyzeJob(id);

    return c.json(
      {
        success: true,
        message: "Analysis started",
        jobId,
        reelId: id,
      },
      200
    );
  } catch (error) {
    console.error("Analyze reel error:", error);
    return c.json({ error: "Failed to start analysis" }, 500);
  }
});

reelsRouter.openapi(analyzeReelFramesRoute, async (c) => {
  const { id } = c.req.valid("param");

  try {
    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    if (!(reel.s3Key || reel.localPath)) {
      return c.json({ error: "Video not downloaded yet" }, 400);
    }

    const jobId = await pipelineJobQueue.addAnalyzeFramesJob(id);

    return c.json(
      {
        success: true,
        message: "Frame-by-frame analysis started",
        jobId,
        reelId: id,
      },
      200
    );
  } catch (error) {
    console.error("Analyze frames error:", error);
    return c.json({ error: "Failed to start frame analysis" }, 500);
  }
});

reelsRouter.openapi(resizeReelRoute, async (c) => {
  const { id } = c.req.valid("param");

  try {
    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    if (!(reel.s3Key || reel.localPath)) {
      return c.json({ error: "Video not downloaded yet" }, 400);
    }

    // Get video buffer
    let videoBuffer: Buffer;
    if (reel.s3Key) {
      const result = await s3Service.getFileStream(reel.s3Key);
      if (!result) {
        return c.json({ error: "Could not get video from S3" }, 500);
      }
      const arrayBuffer = await new Response(result.stream).arrayBuffer();
      videoBuffer = Buffer.from(arrayBuffer);
    } else if (reel.localPath) {
      const { readFile } = await import("node:fs/promises");
      videoBuffer = await readFile(reel.localPath);
    } else {
      return c.json({ error: "No video source available" }, 500);
    }

    // Call video-frames service for resize
    const formData = new FormData();
    formData.append(
      "video",
      new Blob([videoBuffer], { type: "video/mp4" }),
      "video.mp4"
    );

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
      const s3Key = `reels/${id}.mp4`;
      await s3Service.uploadFile(s3Key, resizedBuffer, "video/mp4");

      // Update reel record
      await prisma.reel.update({
        where: { id },
        data: { s3Key },
      });

      return c.json(
        {
          success: true,
          message: `Video resized from ${originalWidth}px to ${newWidth}px`,
          resized: true,
          originalWidth: Number(originalWidth),
          newWidth: Number(newWidth),
        },
        200
      );
    }

    return c.json(
      {
        success: true,
        message: "Video already within size limits",
        resized: false,
      },
      200
    );
  } catch (error) {
    console.error("Resize reel error:", error);
    return c.json({ error: "Failed to resize video" }, 500);
  }
});

reelsRouter.openapi(batchRefreshDurationRoute, async (c) => {
  try {
    const { reelIds } = c.req.valid("json");

    const reels = await prisma.reel.findMany({
      where: {
        id: { in: reelIds },
        OR: [{ s3Key: { not: null } }, { localPath: { not: null } }],
      },
      select: { id: true, s3Key: true, localPath: true },
    });

    // We start a background task effectively
    (async () => {
      console.log(
        `[BatchRefresh] Starting duration refresh for ${reels.length} reels`
      );
      const { parseBuffer } = await import("music-metadata");

      for (const reel of reels) {
        try {
          const s3Key = reel.s3Key;
          if (s3Key) {
            const stream = await s3Service.getFileStream(s3Key);
            if (stream) {
              const buffer = await new Response(stream.stream).arrayBuffer();
              const metadata = await parseBuffer(
                Buffer.from(buffer),
                "video/mp4"
              );
              if (metadata.format.duration) {
                await prisma.reel.update({
                  where: { id: reel.id },
                  data: { duration: metadata.format.duration },
                });
                console.log(
                  `[BatchRefresh] Updated duration for ${reel.id}: ${metadata.format.duration}`
                );
              }
            }
          }
        } catch (e) {
          console.error(`[BatchRefresh] Failed for ${reel.id}:`, e);
        }
      }
    })();

    return c.json(
      { success: true, message: "Started background refresh" },
      200
    );
  } catch (error) {
    console.error("Batch refresh error:", error);
    return c.json({ error: "Failed to start batch refresh" }, 500);
  }
});

reelsRouter.openapi(resetReelStatusRoute, async (c) => {
  const { id } = c.req.valid("param");

  try {
    const reel = await prisma.reel.findUnique({ where: { id } });
    if (!reel) {
      return c.json({ error: "Reel not found" }, 404);
    }

    // Check if video is available
    if (!(reel.s3Key || reel.localPath)) {
      return c.json(
        { error: "Cannot reset status: video not downloaded yet" },
        400
      );
    }

    // Reset status to downloaded, clear error and progress
    const updated = await prisma.reel.update({
      where: { id },
      data: {
        status: "downloaded",
        errorMessage: null,
        progress: 0,
        progressStage: "",
        progressMessage: "",
        lastActivityAt: new Date(),
      },
    });

    // Log the reset
    await pipelineLogger.info({
      reelId: id,
      stage: "analyze",
      message: "Status reset to downloaded by user",
    });

    return c.json(
      {
        success: true,
        message: "Status reset to downloaded",
        reel: updated,
      },
      200
    );
  } catch (error) {
    console.error("Reset status error:", error);
    return c.json({ error: "Failed to reset status" }, 500);
  }
});

export { reelsRouter };
