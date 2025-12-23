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
import { sceneGenJobQueue, videoGenJobQueue } from "../services/queues";
import {
  buildReelVideoUrl,
  getGenerationVideoPublicUrl,
} from "../services/url-builder";
import { buildPromptFromSelections } from "../utils/prompt-builder";

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
    // Get config from DB or build from direct parameters
    let configData: {
      analysisId: string;
      generatedPrompt: string | null;
      prompt: string | null;
      options: {
        duration?: number;
        aspectRatio?: string;
        keepAudio?: boolean;
      } | null;
      referenceImages: string[];
    };

    if (configurationId) {
      const dbConfig = await prisma.generationConfig.findUnique({
        where: { id: configurationId },
      });

      if (!dbConfig) {
        return c.json({ error: "Configuration not found" }, 404);
      }

      configData = {
        analysisId: dbConfig.analysisId,
        generatedPrompt: dbConfig.generatedPrompt,
        prompt: dbConfig.prompt,
        options: dbConfig.options as {
          duration?: number;
          aspectRatio?: string;
          keepAudio?: boolean;
        } | null,
        referenceImages: dbConfig.referenceImages,
      };
    } else if (analysisId && prompt) {
      configData = {
        analysisId,
        generatedPrompt: prompt,
        prompt,
        options: options ?? null,
        referenceImages: [], // Direct mode doesn't have referenceImages
      };
    } else {
      return c.json(
        { error: "Either configurationId or analysisId+prompt required" },
        400
      );
    }

    // Get analysis with reel
    const analysis = await prisma.videoAnalysis.findUnique({
      where: { id: configData.analysisId },
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

    const finalPrompt = configData.generatedPrompt || configData.prompt || "";
    const genOptions = configData.options ?? {};

    // Check for scene-based generation
    type SceneSelection = {
      sceneId: string;
      useOriginal: boolean;
      elementSelections?: Array<{
        elementId: string;
        selectedOptionId?: string;
        customMediaUrl?: string;
      }>;
    };

    let sceneSelections: SceneSelection[] = [];

    if (configurationId) {
      const fullConfig = await prisma.generationConfig.findUnique({
        where: { id: configurationId },
      });
      const rawSelections = fullConfig?.sceneSelections;
      if (Array.isArray(rawSelections)) {
        sceneSelections = rawSelections as SceneSelection[];
      }
    }

    // If scene selections exist - use scene-based generation
    if (sceneSelections.length > 0) {
      // Load scenes and VideoElements from DB
      const [scenes, videoElements] = await Promise.all([
        prisma.videoScene.findMany({
          where: { analysisId: configData.analysisId },
          orderBy: { index: "asc" },
        }),
        prisma.videoElement.findMany({
          where: { analysisId: configData.analysisId },
        }),
      ]);

      // Helper to get elements for a specific scene
      const getElementsForScene = (sceneIndex: number) => {
        if (videoElements.length > 0) {
          // Use new unified VideoElements with appearances
          return videoElements
            .filter((el) => {
              const appearances = el.appearances as Array<{
                sceneIndex: number;
                startTime: number;
                endTime: number;
              }>;
              return appearances.some((a) => a.sceneIndex === sceneIndex);
            })
            .map((el) => ({
              id: el.id,
              type: el.type,
              label: el.label,
              description: el.description,
              remixOptions: el.remixOptions as Array<{
                id: string;
                label: string;
                prompt: string;
              }>,
            }));
        }
        return null; // Fallback to legacy scene.elements
      };

      // Build scene configs and start generation for each modified scene
      const sceneConfigs: Array<{
        sceneId: string;
        sceneIndex: number;
        useOriginal: boolean;
        generationId?: string;
        startTime: number;
        endTime: number;
      }> = [];

      for (const selection of sceneSelections) {
        const scene = scenes.find((s) => s.id === selection.sceneId);
        if (!scene) continue;

        if (selection.useOriginal) {
          sceneConfigs.push({
            sceneId: scene.id,
            sceneIndex: scene.index,
            useOriginal: true,
            startTime: scene.startTime,
            endTime: scene.endTime,
          });
        } else {
          // Build prompt for this specific scene from its elementSelections
          let scenePrompt = finalPrompt;
          let sceneImageUrls = configData.referenceImages;

          // If scene has its own elementSelections, build prompt from them
          if (
            selection.elementSelections &&
            selection.elementSelections.length > 0
          ) {
            // Try to get unified VideoElements for this scene first
            const unifiedElements = getElementsForScene(scene.index);

            // Fallback to legacy scene.elements if no unified elements
            const sceneElements =
              unifiedElements ??
              (scene.elements as Array<{
                id: string;
                type: string;
                label: string;
                description: string;
                remixOptions: Array<{
                  id: string;
                  label: string;
                  prompt: string;
                }>;
              }>);

            const { prompt: builtPrompt, imageUrls } =
              buildPromptFromSelections(
                sceneElements,
                selection.elementSelections
              );

            if (builtPrompt) {
              scenePrompt = builtPrompt;
              sceneImageUrls = imageUrls;
            }
          }

          // Start generation for this scene with its own prompt
          const sceneGenerationId = await sceneGenJobQueue.startSceneGeneration(
            scene.id,
            scenePrompt,
            sourceVideoUrl,
            scene.startTime,
            scene.endTime,
            {
              duration: genOptions.duration as 5 | 10 | undefined,
              aspectRatio: genOptions.aspectRatio as
                | "16:9"
                | "9:16"
                | "1:1"
                | "auto"
                | undefined,
              keepAudio: genOptions.keepAudio,
              imageUrls: sceneImageUrls.length > 0 ? sceneImageUrls : undefined,
            }
          );

          sceneConfigs.push({
            sceneId: scene.id,
            sceneIndex: scene.index,
            useOriginal: false,
            generationId: sceneGenerationId,
            startTime: scene.startTime,
            endTime: scene.endTime,
          });
        }
      }

      // Start composite generation (concatenation)
      const compositeId = await sceneGenJobQueue.startCompositeGeneration(
        configData.analysisId,
        sourceVideoUrl,
        sceneConfigs
      );

      return c.json(
        {
          success: true,
          compositeGenerationId: compositeId,
          type: "composite" as const,
          status: "queued" as const,
        },
        202
      );
    }

    // Otherwise - standard full video generation
    // Pass referenceImages as imageUrls for Kling's image_list parameter
    const generationId = await videoGenJobQueue.startGeneration(
      configData.analysisId,
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
        imageUrls:
          configData.referenceImages.length > 0
            ? configData.referenceImages
            : undefined,
      }
    );

    return c.json(
      {
        success: true,
        generationId,
        type: "full" as const,
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

// ============================================
// GET /{compositeId}/composite-status - Get composite generation status
// ============================================

const compositeStatusRoute = createRoute({
  method: "get",
  path: "/{compositeId}/composite-status",
  summary: "Get composite generation status",
  tags: ["Generate"],
  description: "Returns current composite generation status and progress.",
  request: {
    params: z.object({
      compositeId: z
        .string()
        .openapi({ description: "Composite Generation ID" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            compositeGenerationId: z.string(),
            status: z.enum([
              "pending",
              "waiting",
              "concatenating",
              "uploading",
              "completed",
              "failed",
            ]),
            progress: z.number(),
            stage: z.string().optional(),
            message: z.string().optional(),
            result: z
              .object({
                videoUrl: z.string(),
              })
              .optional(),
            error: z.string().optional(),
          }),
        },
      },
      description: "Composite generation status",
    },
    404: {
      content: {
        "application/json": {
          schema: NotFoundResponseSchema,
        },
      },
      description: "Composite generation not found",
    },
  },
});

app.openapi(compositeStatusRoute, async (c) => {
  const { compositeId } = c.req.valid("param");

  const composite = await prisma.compositeGeneration.findUnique({
    where: { id: compositeId },
  });

  if (!composite) {
    return c.json({ error: "Composite generation not found" }, 404);
  }

  return c.json({
    compositeGenerationId: composite.id,
    status: composite.status as
      | "pending"
      | "waiting"
      | "concatenating"
      | "uploading"
      | "completed"
      | "failed",
    progress: composite.progress,
    stage: composite.progressStage ?? undefined,
    message: composite.progressMessage ?? undefined,
    ...(composite.status === "completed" &&
      composite.videoUrl && {
        result: { videoUrl: composite.videoUrl },
      }),
    error: composite.error ?? undefined,
  });
});

export { app as generateRouter };
