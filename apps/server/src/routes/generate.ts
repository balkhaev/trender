import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import prisma from "@trender/db";
import {
  ErrorResponseSchema,
  GenerateRequestSchema,
  GenerateResponseSchema,
  GenerationStatusResponseSchema,
  GenerationsListResponseSchema,
  NotFoundResponseSchema,
  VideoGenerationListQuerySchema,
} from "../schemas";
import { videoGenJobQueue } from "../services/queues";
import {
  buildReelVideoUrl,
  getGenerationVideoPublicUrl,
} from "../services/url-builder";

const app = new OpenAPIHono();

// ============================================
// POST / - Start generation
// ============================================

const generateRoute = createRoute({
  method: "post",
  path: "/",
  summary: "Start video generation",
  tags: ["Generate"],
  description:
    "Start video generation from configuration or direct parameters.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: GenerateRequestSchema,
        },
      },
    },
  },
  responses: {
    202: {
      content: {
        "application/json": {
          schema: GenerateResponseSchema,
        },
      },
      description: "Generation queued",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Invalid request",
    },
    404: {
      content: {
        "application/json": {
          schema: NotFoundResponseSchema,
        },
      },
      description: "Configuration or analysis not found",
    },
  },
});

app.openapi(generateRoute, async (c) => {
  const { configurationId, analysisId, prompt, options } = c.req.valid("json");

  try {
    let config: {
      analysisId: string;
      generatedPrompt: string | null;
      prompt: string | null;
      options: object | null;
    } | null = null;

    // Get config or use direct parameters
    if (configurationId) {
      config = await prisma.generationConfig.findUnique({
        where: { id: configurationId },
      });

      if (!config) {
        return c.json({ error: "Configuration not found" }, 404);
      }
    } else if (analysisId && prompt) {
      config = {
        analysisId,
        generatedPrompt: prompt,
        prompt,
        options: options ?? null,
      };
    } else {
      return c.json(
        { error: "Either configurationId or analysisId+prompt required" },
        400
      );
    }

    // Get analysis with reel
    const analysis = await prisma.videoAnalysis.findUnique({
      where: { id: config.analysisId },
      include: {
        template: {
          include: {
            reel: true,
          },
        },
      },
    });

    if (!analysis) {
      return c.json({ error: "Analysis not found" }, 404);
    }

    const reel = analysis.template?.reel;
    const sourceVideoUrl = reel ? buildReelVideoUrl(reel) : null;

    if (!sourceVideoUrl) {
      return c.json({ error: "Source video not found" }, 400);
    }

    const finalPrompt = config.generatedPrompt || config.prompt || "";
    const genOptions =
      (config.options as {
        duration?: number;
        aspectRatio?: string;
        keepAudio?: boolean;
      }) ?? {};

    // Start generation via queue (this creates the generation record internally)
    const generationId = await videoGenJobQueue.startGeneration(
      config.analysisId,
      finalPrompt,
      sourceVideoUrl,
      {
        duration: genOptions.duration as 5 | 10 | undefined,
        aspectRatio: genOptions.aspectRatio as
          | "16:9"
          | "9:16"
          | "1:1"
          | "auto"
          | undefined,
        keepAudio: genOptions.keepAudio,
      }
    );

    return c.json(
      {
        success: true,
        generationId,
        status: "queued" as const,
      },
      202
    );
  } catch (error) {
    console.error("Generate error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 400);
  }
});

// ============================================
// GET /{generationId}/status - Get generation status
// ============================================

const statusRoute = createRoute({
  method: "get",
  path: "/{generationId}/status",
  summary: "Get generation status",
  tags: ["Generate"],
  description: "Returns current generation status and progress.",
  request: {
    params: z.object({
      generationId: z.string().openapi({ description: "Generation ID" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: GenerationStatusResponseSchema,
        },
      },
      description: "Generation status",
    },
    404: {
      content: {
        "application/json": {
          schema: NotFoundResponseSchema,
        },
      },
      description: "Generation not found",
    },
  },
});

app.openapi(statusRoute, async (c) => {
  const { generationId } = c.req.valid("param");

  const generation = await prisma.videoGeneration.findUnique({
    where: { id: generationId },
  });

  if (!generation) {
    return c.json({ error: "Generation not found" }, 404);
  }

  // Map status
  const statusMap: Record<
    string,
    "queued" | "processing" | "completed" | "failed"
  > = {
    pending: "queued",
    processing: "processing",
    completed: "completed",
    failed: "failed",
  };

  const status = statusMap[generation.status] ?? "queued";

  return c.json({
    generationId: generation.id,
    status,
    progress: generation.progress,
    stage: generation.progressStage,
    message: generation.progressMessage,
    providerProgress: generation.klingProgress ?? undefined,
    ...(generation.status === "completed" &&
      generation.videoUrl && {
        result: {
          videoUrl: getGenerationVideoPublicUrl(generation.id),
          thumbnailUrl: generation.thumbnailUrl,
          duration: generation.durationSec,
        },
      }),
    error: generation.error ?? undefined,
    createdAt: generation.createdAt.toISOString(),
    startedAt: generation.lastActivityAt?.toISOString() ?? undefined,
    completedAt: generation.completedAt?.toISOString() ?? undefined,
  });
});

// ============================================
// GET / - List generations
// ============================================

const listRoute = createRoute({
  method: "get",
  path: "/",
  summary: "List generations",
  tags: ["Generate"],
  description: "Returns list of video generations with pagination.",
  request: {
    query: VideoGenerationListQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: GenerationsListResponseSchema,
        },
      },
      description: "Generations list",
    },
  },
});

app.openapi(listRoute, async (c) => {
  const { limit, offset, status } = c.req.valid("query");

  const where = {
    ...(status && { status }),
  };

  const [generations, total] = await Promise.all([
    prisma.videoGeneration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        analysis: {
          include: {
            template: true,
          },
        },
      },
    }),
    prisma.videoGeneration.count({ where }),
  ]);

  return c.json({
    generations: generations.map((gen) => ({
      id: gen.id,
      status: gen.status,
      progress: gen.progress,
      prompt: gen.prompt,
      thumbnailUrl: gen.thumbnailUrl,
      videoUrl: gen.videoUrl ? getGenerationVideoPublicUrl(gen.id) : null,
      createdAt: gen.createdAt.toISOString(),
      completedAt: gen.completedAt?.toISOString() ?? null,
      source: {
        type: (gen.analysis.sourceType === "upload"
          ? "upload"
          : gen.analysis.template
            ? "template"
            : "url") as "template" | "upload" | "url",
        templateId: gen.analysis.template?.id,
        templateTitle: gen.analysis.template?.title ?? undefined,
      },
    })),
    total,
  });
});

export { app as generateRouter };
