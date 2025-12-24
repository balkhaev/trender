import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import prisma from "@trender/db";
import {
  AnalyzeDownloadedRequestSchema,
  AnalyzedVideoResponseSchema,
  AnalyzeReelRequestSchema,
  AnalyzeVideoRequestSchema,
  ErrorResponseSchema,
  GenerateVideoRequestSchema,
  NotFoundResponseSchema,
  UpdateAnalysisRequestSchema,
  UploadImageRequestSchema,
  UploadReferenceResponseSchema,
  VideoAnalysisDbSchema,
  VideoAnalysisListQuerySchema,
  VideoGenerationListQuerySchema,
  VideoGenerationSchema,
} from "../schemas";
import { getGeminiService, type VideoAnalysis } from "../services/gemini";
import { getDownloadsPath } from "../services/instagram/downloader";
import { isKlingConfigured } from "../services/kling";
import { getOpenAIService, isOpenAIConfigured } from "../services/openai";
import { getVideoGenerationsPath, videoGenJobQueue } from "../services/queues";
import { getS3Key, isS3Configured, s3Service } from "../services/s3";
import { getReferenceImagePublicUrl } from "../services/url-builder";

declare const Bun: {
  file(path: string): Blob;
};

const video = new OpenAPIHono();

const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/mpeg",
  "video/mov",
  "video/avi",
  "video/x-flv",
  "video/mpg",
  "video/webm",
  "video/wmv",
  "video/3gpp",
  "video/quicktime",
];

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB for images

// Helper to save analysis to database with extended fields
function saveAnalysis(
  analysis: VideoAnalysis,
  sourceType: string,
  sourceId?: string,
  fileName?: string
) {
  return prisma.videoAnalysis.create({
    data: {
      sourceType,
      sourceId,
      fileName,
      duration: analysis.duration,
      aspectRatio: analysis.aspectRatio,
      elements: analysis.elements,
    },
  });
}

// --- Route Definitions ---

const analyzeRoute = createRoute({
  method: "post",
  path: "/analyze",
  summary: "Analyze uploaded video",
  description: "Upload a video file and analyze it using Gemini AI",
  tags: ["Video"],
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: AnalyzeVideoRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AnalyzedVideoResponseSchema,
        },
      },
      description: "Video analyzed successfully",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Bad request - invalid file type or size",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error during analysis",
    },
  },
});

const analyzeDownloadedRoute = createRoute({
  method: "post",
  path: "/analyze-downloaded",
  summary: "Analyze downloaded video file",
  description:
    "Analyze a video file from the downloads folder by hashtag and filename",
  tags: ["Video"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: AnalyzeDownloadedRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            analysis: z.any(),
            analysisId: z.string(),
          }),
        },
      },
      description: "Video analyzed successfully",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Bad request - missing parameters or invalid file",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "File not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error during analysis",
    },
  },
});

const analyzeReelRoute = createRoute({
  method: "post",
  path: "/analyze-reel",
  summary: "Analyze reel by ID",
  description:
    "Analyze a reel from the database, fetching video from local storage or URL",
  tags: ["Video"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: AnalyzeReelRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AnalyzedVideoResponseSchema,
        },
      },
      description: "Reel analyzed successfully",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Bad request - missing parameters or no video available",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Reel not found in database",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error during analysis",
    },
  },
});

const generateRoute = createRoute({
  method: "post",
  path: "/generate",
  summary: "Generate video via Kling AI",
  description:
    "Start video-to-video generation using Kling AI based on analysis",
  tags: ["Video"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: GenerateVideoRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            generationId: z.string(),
          }),
        },
      },
      description: "Generation job started successfully",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Bad request - missing required parameters",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Analysis not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error or Kling API not configured",
    },
  },
});

const updateAnalysisRoute = createRoute({
  method: "patch",
  path: "/analysis/{id}",
  summary: "Update analysis",
  description: "Update analysis fields for Pro mode editing",
  tags: ["Video"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateAnalysisRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            analysis: z.any(),
          }),
        },
      },
      description: "Analysis updated successfully",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Analysis not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error during update",
    },
  },
});

const getGenerationRoute = createRoute({
  method: "get",
  path: "/generation/{id}",
  summary: "Get generation status",
  description: "Get the current status of a video generation job",
  tags: ["Video"],
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
            generation: VideoGenerationSchema.extend({
              analysis: z.any().optional(),
            }),
          }),
        },
      },
      description: "Generation status retrieved",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Generation not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const getGenerationLogsRoute = createRoute({
  method: "get",
  path: "/generation/{id}/logs",
  summary: "Get generation logs",
  description: "Get logs for a video generation job from the source reel",
  tags: ["Video"],
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
            generation: z.object({
              id: z.string(),
              status: z.string(),
              progress: z.number(),
              progressStage: z.string().nullable(),
              progressMessage: z.string().nullable(),
              klingProgress: z.number().nullable(),
              lastActivityAt: z.any().nullable(),
            }),
            logs: z.array(
              z.object({
                id: z.string(),
                level: z.string(),
                stage: z.string(),
                message: z.string(),
                createdAt: z.any(),
              })
            ),
          }),
        },
      },
      description: "Generation logs retrieved",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Generation not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const downloadGenerationRoute = createRoute({
  method: "get",
  path: "/generation/{id}/download",
  summary: "Download generated video",
  description: "Download the generated video file (redirects if external URL)",
  tags: ["Video"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    200: {
      content: {
        "video/mp4": {
          schema: z.any(),
        },
      },
      description: "Video file stream",
    },
    302: {
      description: "Redirect to external video URL",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Video not ready yet",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Generation or video file not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const listAnalysesRoute = createRoute({
  method: "get",
  path: "/analyses",
  summary: "List all analyses",
  description: "Get a paginated list of all video analyses",
  tags: ["Video"],
  request: {
    query: VideoAnalysisListQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            analyses: z.array(VideoAnalysisDbSchema),
            total: z.number(),
            limit: z.number(),
            offset: z.number(),
          }),
        },
      },
      description: "List of analyses",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const listGenerationsRoute = createRoute({
  method: "get",
  path: "/generations",
  summary: "List all generations",
  description: "Get a paginated list of all video generations",
  tags: ["Video"],
  request: {
    query: VideoGenerationListQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            generations: z.array(
              VideoGenerationSchema.extend({ analysis: z.any().optional() })
            ),
            total: z.number(),
            limit: z.number(),
            offset: z.number(),
          }),
        },
      },
      description: "List of generations",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const getAnalysisRoute = createRoute({
  method: "get",
  path: "/analysis/{id}",
  summary: "Get analysis by ID",
  description: "Get a single video analysis with its generations",
  tags: ["Video"],
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
            analysis: VideoAnalysisDbSchema,
          }),
        },
      },
      description: "Analysis retrieved",
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "Analysis not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const uploadReferenceRoute = createRoute({
  method: "post",
  path: "/upload-reference",
  summary: "Upload reference image",
  description: "Upload an image to use as reference for remix generation",
  tags: ["Video"],
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: UploadImageRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: UploadReferenceResponseSchema,
        },
      },
      description: "Image uploaded successfully",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Bad request - invalid file type or size",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error or S3 not configured",
    },
  },
});

// --- Route Handlers ---

video.openapi(analyzeRoute, async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("video");

    if (!(file && file instanceof File)) {
      return c.json({ error: "Video file is required" }, 400);
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return c.json(
        {
          error: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
        },
        400
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return c.json(
        {
          error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        400
      );
    }

    // Default to enchanting mode if OpenAI is configured
    const geminiService = getGeminiService();
    const buffer = Buffer.from(await file.arrayBuffer());
    let analysis: VideoAnalysis;
    let mode = "standard";

    // Check if we can do enchanting analysis (needs OpenAI)
    if (isOpenAIConfigured()) {
      try {
        console.log("Starting enchanting analysis (Gemini + OpenAI)...");
        const openaiService = getOpenAIService();

        const elementsAnalysis = await geminiService.processVideoElementsOnly(
          buffer,
          file.type,
          file.name
        );

        const enchantingResults = await openaiService.generateEnchantingOptions(
          elementsAnalysis.elements
        );

        // Merge results
        const elementsWithOptions = elementsAnalysis.elements.map((element) => {
          const enchantingResult = enchantingResults.find(
            (r) => r.id === element.id
          );
          return {
            id: element.id,
            type: element.type,
            label: element.label,
            description: element.description,
            remixOptions: enchantingResult?.remixOptions || [],
          };
        });

        analysis = {
          duration: elementsAnalysis.duration,
          aspectRatio: elementsAnalysis.aspectRatio,
          tags: elementsAnalysis.tags,
          elements: elementsWithOptions,
        };
        mode = "enchanting";
      } catch (err) {
        console.error(
          "Enchanting analysis failed, falling back to standard:",
          err
        );
        // Fallback to standard full analysis
        analysis = await geminiService.processVideo(
          buffer,
          file.type,
          file.name
        );
      }
    } else {
      console.log("OpenAI not configured, using standard Gemini analysis");
      analysis = await geminiService.processVideo(buffer, file.type, file.name);
    }

    const saved = await prisma.videoAnalysis.create({
      data: {
        sourceType: "upload",
        analysisType: mode,
        fileName: file.name,
        duration: analysis.duration,
        aspectRatio: analysis.aspectRatio,
        tags: analysis.tags,
        elements: analysis.elements,
      },
    });

    return c.json({
      success: true,
      analysis,
      analysisId: saved.id,
      mode,
    });
  } catch (error) {
    console.error("Video analysis error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

video.openapi(analyzeDownloadedRoute, async (c) => {
  try {
    const { hashtag, filename } = c.req.valid("json");

    if (!(hashtag && filename)) {
      return c.json({ error: "hashtag and filename are required" }, 400);
    }

    if (!filename.endsWith(".mp4")) {
      return c.json({ error: "Only .mp4 files are supported" }, 400);
    }

    const filepath = join(getDownloadsPath(hashtag), filename);

    try {
      const fileStat = await stat(filepath);
      if (!fileStat.isFile()) {
        return c.json({ error: "File not found" }, 404);
      }

      if (fileStat.size > MAX_FILE_SIZE) {
        return c.json(
          {
            error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          },
          400
        );
      }
    } catch {
      return c.json({ error: "File not found" }, 404);
    }

    const buffer = await readFile(filepath);
    const geminiService = getGeminiService();
    const analysis = await geminiService.processVideo(
      buffer,
      "video/mp4",
      filename
    );

    const saved = await saveAnalysis(analysis, "download", undefined, filename);

    return c.json({
      success: true,
      analysis,
      analysisId: saved.id,
    });
  } catch (error) {
    console.error("Downloaded video analysis error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

video.openapi(analyzeReelRoute, async (c) => {
  try {
    const { reelId, url } = c.req.valid("json");

    if (!(reelId && url)) {
      return c.json({ error: "reelId and url are required" }, 400);
    }

    const reel = await prisma.reel.findUnique({ where: { id: reelId } });

    if (!reel) {
      return c.json({ error: "Reel not found in database" }, 404);
    }

    const downloadsDir = getDownloadsPath(reel.source);
    let localFile: string | null = null;

    try {
      const files = await readdir(downloadsDir);
      const matchingFile = files.find(
        (f) => f.includes(reelId) && f.endsWith(".mp4")
      );
      if (matchingFile) {
        localFile = join(downloadsDir, matchingFile);
      }
    } catch {
      // Directory doesn't exist
    }

    let buffer: Buffer;

    if (localFile) {
      buffer = await readFile(localFile);
    } else if (reel.videoUrl) {
      const response = await fetch(reel.videoUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Referer: "https://www.instagram.com/",
        },
      });

      if (!response.ok) {
        return c.json(
          { error: `Failed to fetch video: ${response.status}` },
          400
        );
      }

      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      return c.json(
        {
          error:
            "No video available. Video URL is not saved for this reel. Try scraping again.",
        },
        400
      );
    }

    if (Buffer.byteLength(buffer) > MAX_FILE_SIZE) {
      return c.json(
        {
          error: `Video too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        400
      );
    }

    const geminiService = getGeminiService();
    const analysis = await geminiService.processVideo(
      buffer,
      "video/mp4",
      `${reelId}.mp4`
    );

    const saved = await saveAnalysis(analysis, "reel", reelId, `${reelId}.mp4`);

    return c.json({
      success: true,
      analysis,
      analysisId: saved.id,
    });
  } catch (error) {
    console.error("Reel analysis error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

video.openapi(generateRoute, async (c) => {
  try {
    const { analysisId, prompt, sourceVideoUrl, options } = c.req.valid("json");

    if (!analysisId) {
      return c.json({ error: "analysisId is required" }, 400);
    }

    if (!prompt) {
      return c.json({ error: "prompt is required" }, 400);
    }

    if (!sourceVideoUrl) {
      return c.json(
        { error: "sourceVideoUrl is required for video-to-video generation" },
        400
      );
    }

    if (!isKlingConfigured()) {
      return c.json(
        {
          error:
            "Kling API is not configured. Set KLING_ACCESS_KEY and KLING_SECRET_KEY.",
        },
        500
      );
    }

    const analysis = await prisma.videoAnalysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      return c.json({ error: "Analysis not found" }, 404);
    }

    const generationId = await videoGenJobQueue.startGeneration(
      analysisId,
      prompt,
      sourceVideoUrl,
      options
    );

    return c.json({
      success: true,
      generationId,
    });
  } catch (error) {
    console.error("Video generation error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

video.openapi(updateAnalysisRoute, async (c) => {
  try {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const analysis = await prisma.videoAnalysis.findUnique({
      where: { id },
    });

    if (!analysis) {
      return c.json({ error: "Analysis not found" }, 404);
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "subject",
      "action",
      "environment",
      "cameraStyle",
      "mood",
      "colorPalette",
      "style",
      "duration",
      "aspectRatio",
      "scenes",
      "characters",
      "objects",
      "cameraMovements",
      "lighting",
      "transitions",
      "audio",
      "textOverlays",
      "pacing",
      "klingPrompt",
      "tags",
    ];

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field as keyof typeof body];
      }
    }

    const updated = await prisma.videoAnalysis.update({
      where: { id },
      data: updateData,
    });

    return c.json({
      success: true,
      analysis: updated,
    });
  } catch (error) {
    console.error("Update analysis error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

video.openapi(getGenerationRoute, async (c) => {
  try {
    const { id } = c.req.valid("param");

    const generation = await prisma.videoGeneration.findUnique({
      where: { id },
      include: {
        analysis: true,
      },
    });

    if (!generation) {
      return c.json({ error: "Generation not found" }, 404);
    }

    return c.json({
      success: true,
      generation,
    });
  } catch (error) {
    console.error("Get generation error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

video.openapi(getGenerationLogsRoute, async (c) => {
  try {
    const { id } = c.req.valid("param");

    const generation = await prisma.videoGeneration.findUnique({
      where: { id },
      include: {
        analysis: {
          select: { sourceId: true },
        },
      },
    });

    if (!generation) {
      return c.json({ error: "Generation not found" }, 404);
    }

    let logs: {
      id: string;
      level: string;
      stage: string;
      message: string;
      createdAt: Date;
    }[] = [];

    if (generation.analysis?.sourceId) {
      logs = await prisma.reelLog.findMany({
        where: { reelId: generation.analysis.sourceId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          level: true,
          stage: true,
          message: true,
          createdAt: true,
        },
      });
    }

    return c.json({
      success: true,
      generation: {
        id: generation.id,
        status: generation.status,
        progress: generation.progress,
        progressStage: generation.progressStage,
        progressMessage: generation.progressMessage,
        klingProgress: generation.klingProgress,
        lastActivityAt: generation.lastActivityAt,
      },
      logs,
    });
  } catch (error) {
    console.error("Get generation logs error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

video.openapi(downloadGenerationRoute, async (c) => {
  try {
    const { id } = c.req.valid("param");

    const generation = await prisma.videoGeneration.findUnique({
      where: { id },
    });

    if (!generation) {
      return c.json({ error: "Generation not found" }, 404);
    }

    if (generation.status !== "completed") {
      return c.json({ error: "Video not ready yet" }, 400);
    }

    const filename = `${id}.mp4`;

    if (generation.s3Key) {
      try {
        const result = await s3Service.getFileStream(generation.s3Key);
        if (result) {
          return new Response(result.stream, {
            headers: {
              "Content-Type": result.metadata.contentType,
              "Content-Length": result.metadata.contentLength.toString(),
              "Content-Disposition": `inline; filename="${filename}"`,
              "Cache-Control": "public, max-age=31536000",
            },
          });
        }
      } catch (s3Error) {
        console.error("S3 download failed, trying local:", s3Error);
      }
    }

    const filepath = getVideoGenerationsPath(filename);

    if (!existsSync(filepath)) {
      if (generation.videoUrl && !generation.videoUrl.startsWith("/api/")) {
        return c.redirect(generation.videoUrl);
      }
      return c.json({ error: "Video file not found" }, 404);
    }

    const fileStat = await stat(filepath);
    const file = Bun.file(filepath);

    return new Response(file, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": fileStat.size.toString(),
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error) {
    console.error("Download generation error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

video.openapi(listAnalysesRoute, async (c) => {
  try {
    const { limit, offset } = c.req.valid("query");

    const [analyses, total] = await Promise.all([
      prisma.videoAnalysis.findMany({
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: {
          generations: {
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      prisma.videoAnalysis.count(),
    ]);

    return c.json({
      success: true,
      analyses,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("List analyses error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

video.openapi(listGenerationsRoute, async (c) => {
  try {
    const { limit, offset, status } = c.req.valid("query");

    const where = status ? { status } : {};

    const [generations, total] = await Promise.all([
      prisma.videoGeneration.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: {
          analysis: true,
        },
      }),
      prisma.videoGeneration.count({ where }),
    ]);

    return c.json({
      success: true,
      generations,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("List generations error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

video.openapi(getAnalysisRoute, async (c) => {
  try {
    const { id } = c.req.valid("param");

    const analysis = await prisma.videoAnalysis.findUnique({
      where: { id },
      include: {
        generations: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!analysis) {
      return c.json({ error: "Analysis not found" }, 404);
    }

    return c.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error("Get analysis error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

video.openapi(uploadReferenceRoute, async (c) => {
  try {
    if (!isS3Configured()) {
      return c.json(
        {
          error:
            "S3 storage is not configured. Cannot upload image references.",
        },
        500
      );
    }

    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!(file && file instanceof File)) {
      return c.json({ error: "Image file is required" }, 400);
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return c.json(
        {
          error: `Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
        },
        400
      );
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return c.json(
        {
          error: `File too large. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`,
        },
        400
      );
    }

    const imageId = crypto.randomUUID();
    const extension = file.type.split("/")[1] || "jpg";
    const s3Key = getS3Key("references", `${imageId}.${extension}`);

    const buffer = Buffer.from(await file.arrayBuffer());
    await s3Service.uploadFile(s3Key, buffer, file.type);

    const url = getReferenceImagePublicUrl(imageId, extension);

    // Save to UserMedia library for reuse
    const userId = "default-user"; // TODO: Get from auth session
    await prisma.userMedia.create({
      data: {
        id: imageId,
        userId,
        type: "image",
        filename: file.name,
        s3Key,
        url,
        size: file.size,
        mimeType: file.type,
        source: "upload",
        category: "object", // Default category for references
      },
    });

    return c.json({
      success: true,
      url,
      s3Key,
      imageId,
    });
  } catch (error) {
    console.error("Upload reference error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

export { video };
