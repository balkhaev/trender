import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import prisma from "@trender/db";
import {
  ContentFromUrlRequestSchema,
  ContentFromUrlResponseSchema,
  ContentStatusResponseSchema,
  ContentUploadResponseSchema,
  ErrorResponseSchema,
  NotFoundResponseSchema,
} from "../schemas";
import { getDownloadsPath } from "../services/instagram/downloader";
import { pipelineJobQueue } from "../services/queues";
import { getS3Key, isS3Configured, s3Service } from "../services/s3";

const INSTAGRAM_URL_REGEX = /\/(?:reel|p)\/([a-zA-Z0-9_-]+)/;

function extractShortcode(url: string): string | null {
  const match = url.match(INSTAGRAM_URL_REGEX);
  return match?.[1] ?? null;
}

const app = new OpenAPIHono();

// ============================================
// POST /from-url - Add content from Instagram URL
// ============================================

const fromUrlRoute = createRoute({
  method: "post",
  path: "/from-url",
  summary: "Add content from URL",
  tags: ["Content"],
  description:
    "Add a video from Instagram URL. Returns immediately with contentId for polling status.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: ContentFromUrlRequestSchema,
        },
      },
    },
  },
  responses: {
    202: {
      content: {
        "application/json": {
          schema: ContentFromUrlResponseSchema,
        },
      },
      description: "Processing started",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Invalid URL",
    },
  },
});

app.openapi(fromUrlRoute, async (c) => {
  const { url, autoProcess } = c.req.valid("json");

  const shortcode = extractShortcode(url);
  if (!shortcode) {
    return c.json({ error: "Invalid Instagram URL format" }, 400);
  }

  try {
    // Check if exists
    const existing = await prisma.reel.findUnique({
      where: { id: shortcode },
      include: {
        template: {
          include: { analysis: true },
        },
      },
    });

    // If already analyzed, return existing
    if (existing?.template?.analysis) {
      return c.json(
        {
          success: true,
          contentId: shortcode,
          status: "existing" as const,
          existingAnalysis: {
            analysisId: existing.template.analysis.id,
            templateId: existing.template.id,
          },
        },
        202
      );
    }

    // Create new or get existing
    if (!existing) {
      await prisma.reel.create({
        data: {
          id: shortcode,
          url,
          source: "direct_link",
          status: "scraped",
          progress: 0,
          progressStage: "pending",
          progressMessage: "Ожидание в очереди",
        },
      });
    }

    // Queue processing if autoProcess
    let jobId: string | undefined;
    if (autoProcess) {
      jobId = await pipelineJobQueue.addProcessJob(shortcode, {});
    }

    return c.json(
      {
        success: true,
        contentId: shortcode,
        status: existing ? ("processing" as const) : ("new" as const),
        jobId,
      },
      202
    );
  } catch (error) {
    console.error("Content from-url error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 400);
  }
});

// ============================================
// POST /upload - Upload video file
// ============================================

const uploadRoute = createRoute({
  method: "post",
  path: "/upload",
  summary: "Upload video file",
  tags: ["Content"],
  description: "Upload a video file and start processing pipeline.",
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            video: z.any().openapi({
              type: "string",
              format: "binary",
              description: "Video file (max 100MB)",
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
          schema: ContentUploadResponseSchema,
        },
      },
      description: "Upload successful, processing started",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Invalid file",
    },
  },
});

app.openapi(uploadRoute, async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("video");

    if (!(file && file instanceof File)) {
      return c.json({ error: "Video file is required" }, 400);
    }

    const contentId = `up-${crypto.randomUUID().slice(0, 8)}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let localPath: string | null = null;
    let s3Key: string | null = null;

    // Save video
    if (isS3Configured()) {
      s3Key = getS3Key("reels", contentId);
      await s3Service.uploadFile(s3Key, buffer, file.type);
    } else {
      const outputDir = getDownloadsPath("uploads");
      const filename = `${contentId}.mp4`;
      localPath = join(outputDir, filename);

      await mkdir(outputDir, { recursive: true });
      await writeFile(localPath, buffer);
    }

    // Create reel record
    await prisma.reel.create({
      data: {
        id: contentId,
        url: `upload://${file.name}`,
        source: "upload",
        status: "downloaded",
        localPath,
        s3Key,
        progress: 100,
        progressStage: "download",
        progressMessage: "Загружено",
      },
    });

    // Queue processing
    const jobId = await pipelineJobQueue.addProcessJob(contentId, {
      skipDownload: true,
    });

    return c.json(
      {
        success: true,
        contentId,
        jobId,
        status: "processing" as const,
      },
      202
    );
  } catch (error) {
    console.error("Content upload error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 400);
  }
});

// ============================================
// GET /{id}/status - Get content processing status
// ============================================

const statusRoute = createRoute({
  method: "get",
  path: "/{contentId}/status",
  summary: "Get content processing status",
  tags: ["Content"],
  description:
    "Returns current processing status, progress, and analysis when ready.",
  request: {
    params: z.object({
      contentId: z.string().openapi({
        example: "ABC123",
        description: "Content ID (reel shortcode or upload ID)",
      }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ContentStatusResponseSchema,
        },
      },
      description: "Current status",
    },
    404: {
      content: {
        "application/json": {
          schema: NotFoundResponseSchema,
        },
      },
      description: "Content not found",
    },
  },
});

app.openapi(statusRoute, async (c) => {
  const { contentId } = c.req.valid("param");

  const reel = await prisma.reel.findUnique({
    where: { id: contentId },
    include: {
      template: {
        include: {
          analysis: {
            include: {
              videoScenes: true,
            },
          },
        },
      },
    },
  });

  if (!reel) {
    return c.json({ error: "Content not found" }, 404);
  }

  // Map reel status to content status
  const statusMap: Record<
    string,
    "pending" | "downloading" | "analyzing" | "ready" | "failed"
  > = {
    scraped: "pending",
    downloading: "downloading",
    downloaded: "analyzing",
    analyzing: "analyzing",
    analyzed: "ready",
    failed: "failed",
  };

  const status = statusMap[reel.status] ?? "pending";
  const analysis = reel.template?.analysis;

  // Parse elements from JSON
  const elements = analysis?.elements
    ? (analysis.elements as Array<{
        id: string;
        type: "character" | "object" | "background";
        label: string;
        description: string;
        remixOptions: Array<{
          id: string;
          label: string;
          icon: string;
          prompt: string;
        }>;
      }>)
    : [];

  // Map scenes
  const scenes = analysis?.videoScenes?.map((scene) => ({
    id: scene.id,
    index: scene.index,
    startTime: scene.startTime,
    endTime: scene.endTime,
    duration: scene.duration,
    thumbnailUrl: scene.thumbnailUrl,
    elements: scene.elements as Array<{
      id: string;
      type: "character" | "object" | "background";
      label: string;
      description: string;
      remixOptions: Array<{
        id: string;
        label: string;
        icon: string;
        prompt: string;
      }>;
    }>,
  }));

  return c.json(
    {
      contentId: reel.id,
      status,
      progress: reel.progress,
      stage: reel.progressStage,
      message: reel.progressMessage,
      ...(analysis && {
        analysis: {
          id: analysis.id,
          duration: analysis.duration,
          aspectRatio: analysis.aspectRatio,
          elements,
          ...(scenes && scenes.length > 0 && { scenes }),
        },
      }),
      ...(reel.template && { templateId: reel.template.id }),
      ...(reel.errorMessage && { error: reel.errorMessage }),
    },
    200
  );
});

export { app as contentRouter };
