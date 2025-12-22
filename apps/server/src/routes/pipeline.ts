import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import prisma from "@trender/db";
import {
  AnalysisSchema,
  ErrorResponseSchema,
  NotFoundResponseSchema,
  TemplateSchema,
} from "../schemas/openapi";
import { getDownloadsPath } from "../services/instagram/downloader";
import { pipelineJobQueue } from "../services/queues";
import { getS3Key, isS3Configured, s3Service } from "../services/s3";

const INSTAGRAM_URL_REGEX = /\/(?:reel|p)\/([a-zA-Z0-9_-]+)/;

/**
 * Extract shortcode from Instagram URL
 */
function extractShortcode(url: string): string | null {
  const match = url.match(INSTAGRAM_URL_REGEX);
  return match?.[1] ?? null;
}

const app = new OpenAPIHono();

// ============================================
// UPLOAD ENDPOINT
// ============================================

const uploadRoute = createRoute({
  method: "post",
  path: "/upload",
  summary: "Upload a video file for processing",
  tags: ["Pipeline"],
  description:
    "Uploads a video file, saves it, and starts the analysis pipeline. Returns a reelId for polling status.",
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            video: z.any().openapi({
              type: "string",
              format: "binary",
              description: "The video file to upload",
            }),
          }),
        },
      },
    },
  },
  responses: {
    202: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            reelId: z.string(),
            jobId: z.string(),
            status: z.string(),
            message: z.string(),
          }),
        },
      },
      description: "Upload successful and processing queued",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Invalid input or file type",
    },
    500: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Internal server error during upload or storage",
    },
  },
  security: [{ BearerAuth: [] }],
});

app.openapi(uploadRoute, async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("video");

    if (!(file && file instanceof File)) {
      return c.json({ error: "Video file is required" }, 400);
    }

    const reelId = `up-${crypto.randomUUID().slice(0, 8)}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let localPath: string | null = null;
    let s3Key: string | null = null;

    // Save video
    if (isS3Configured()) {
      s3Key = getS3Key("reels", reelId);
      await s3Service.uploadFile(s3Key, buffer, file.type);
    } else {
      const outputDir = getDownloadsPath("uploads");
      const filename = `${reelId}.mp4`;
      localPath = join(outputDir, filename);

      await mkdir(outputDir, { recursive: true });
      await writeFile(localPath, buffer);
    }

    // Create reel record
    await prisma.reel.create({
      data: {
        id: reelId,
        url: `upload://${file.name}`,
        source: "upload",
        status: "downloaded",
        localPath,
        s3Key,
        progress: 100,
        progressStage: "download",
        progressMessage: "Загружено пользователем",
      },
    });

    // Queue the processing job (skip download)
    const jobId = await pipelineJobQueue.addProcessJob(reelId, {
      skipDownload: true,
    });

    return c.json(
      {
        success: true,
        reelId,
        jobId,
        status: "pending",
        message: "Upload successful. Processing queued.",
      },
      202
    );
  } catch (error) {
    console.error("Pipeline upload error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 400);
  }
});

// ============================================
// ASYNC GENERATE ENDPOINT
// ============================================

const generateRoute = createRoute({
  method: "post",
  path: "/generate",
  summary: "Start async video processing pipeline",
  tags: ["Pipeline"],
  description:
    "Queues a video URL for processing (download → analyze → template). Returns immediately with reelId for polling.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            url: z.string().url().openapi({
              example: "https://www.instagram.com/reel/C8.../",
              description: "The URL of the video/reel to process",
            }),
            forceReprocess: z
              .boolean()
              .optional()
              .openapi({ description: "Force reprocessing if already exists" }),
          }),
        },
      },
    },
  },
  responses: {
    202: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            reelId: z.string(),
            jobId: z.string(),
            status: z.string(),
            message: z.string(),
          }),
        },
      },
      description: "Processing queued successfully",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Invalid URL or malformed request",
    },
  },
  security: [{ BearerAuth: [] }],
});

app.openapi(generateRoute, async (c) => {
  const { url, forceReprocess } = c.req.valid("json");

  const shortcode = extractShortcode(url);
  if (!shortcode) {
    return c.json({ error: "Invalid Instagram URL format" }, 400);
  }

  try {
    // Create or find reel
    let reel = await prisma.reel.findUnique({
      where: { id: shortcode },
      include: { template: true },
    });

    if (!reel) {
      reel = await prisma.reel.create({
        data: {
          id: shortcode,
          url,
          source: "direct_link",
          status: "scraped",
          progress: 0,
          progressStage: "pending",
          progressMessage: "Ожидание в очереди",
        },
        include: { template: true },
      });
    }

    // If already processed and not forcing reprocess, return existing
    if (reel.template && !forceReprocess) {
      return c.json(
        {
          success: true,
          reelId: shortcode,
          jobId: "",
          status: reel.status,
          message: "Reel already processed",
        },
        202
      );
    }

    // Queue the processing job
    const jobId = await pipelineJobQueue.addProcessJob(shortcode, {
      forceReprocess,
    });

    return c.json(
      {
        success: true,
        reelId: shortcode,
        jobId,
        status: "pending",
        message:
          "Processing queued. Poll /api/pipeline/status/:reelId for updates.",
      },
      202
    );
  } catch (error) {
    console.error("Pipeline generate error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 400);
  }
});

// Schemas moved to centralized location

// ============================================
// STATUS ENDPOINT (for polling)
// ============================================

const statusRoute = createRoute({
  method: "get",
  path: "/status/{reelId}",
  summary: "Get pipeline processing status",
  tags: ["Pipeline"],
  description:
    "Returns current processing status, progress, and when complete - analysis and template.",
  request: {
    params: z.object({
      reelId: z.string().openapi({
        example: "ABC123",
        description: "The reel shortcode/ID",
      }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            reelId: z.string(),
            status: z.string(),
            progress: z.number(),
            progressStage: z.string(),
            progressMessage: z.string(),
            analysis: AnalysisSchema.nullable(),
            template: TemplateSchema.nullable(),
            error: z.string().optional(),
          }),
        },
      },
      description: "Current status of the pipeline job",
    },
    404: {
      content: {
        "application/json": {
          schema: NotFoundResponseSchema,
        },
      },
      description: "Reel with provided shortcode not found",
    },
  },
});

app.openapi(statusRoute, async (c) => {
  const { reelId } = c.req.valid("param");

  const reel = await prisma.reel.findUnique({
    where: { id: reelId },
    include: {
      template: {
        include: {
          analysis: true,
        },
      },
    },
  });

  if (!reel) {
    return c.json({ error: "Reel not found" }, 404);
  }

  return c.json({
    reelId: reel.id,
    status: reel.status,
    progress: reel.progress,
    progressStage: reel.progressStage,
    progressMessage: reel.progressMessage,
    analysis: reel.template?.analysis ?? null,
    template: reel.template
      ? {
          id: reel.template.id,
          tags: reel.template.tags,
          category: reel.template.category,
          generationCount: reel.template.generationCount,
        }
      : null,
    error: reel.errorMessage ?? undefined,
  });
});

// ============================================
// JOB STATUS ENDPOINT (by jobId)
// ============================================

const jobStatusRoute = createRoute({
  method: "get",
  path: "/job/{jobId}",
  summary: "Get job status by jobId",
  tags: ["Pipeline"],
  description:
    "Returns current job status, progress, and metadata. Use this to track a specific job.",
  request: {
    params: z.object({
      jobId: z.string().openapi({
        example: "process-ABC123-1234567890",
        description: "The job ID returned from generate/upload endpoints",
      }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            reelId: z.string(),
            action: z.string(),
            state: z.string(),
            progress: z.union([z.number(), z.object({})]),
            attemptsMade: z.number(),
            failedReason: z.string().nullable(),
            finishedOn: z.number().nullable(),
            processedOn: z.number().nullable(),
          }),
        },
      },
      description: "Current job status",
    },
    404: {
      content: {
        "application/json": {
          schema: NotFoundResponseSchema,
        },
      },
      description: "Job not found",
    },
  },
});

app.openapi(jobStatusRoute, async (c) => {
  const { jobId } = c.req.valid("param");

  const job = await pipelineJobQueue.getJob(jobId);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return c.json(job);
});

export { app as pipelineRouter };
