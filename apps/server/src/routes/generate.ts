import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import prisma from "@trender/db";
import {
  ErrorResponseSchema,
  GenerateRequestSchema,
  GenerateResponseSchema,
  GenerationStatusResponseSchema,
  GenerationsListResponseSchema,
  NotFoundResponseSchema,
  PublishGenerationRequestSchema,
  PublishGenerationResponseSchema,
  SocialShareRequestSchema,
  SocialShareResponseSchema,
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
  const {
    configurationId,
    analysisId,
    prompt,
    options,
    sceneSelections: directSceneSelections,
  } = c.req.valid("json");

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
    } else if (
      analysisId &&
      directSceneSelections &&
      directSceneSelections.length > 0
    ) {
      // Scene-based generation with direct sceneSelections
      configData = {
        analysisId,
        generatedPrompt: null, // Will be built per-scene
        prompt: null,
        options: options ?? null,
        referenceImages: [],
      };
    } else {
      return c.json(
        {
          error:
            "Either configurationId, analysisId+prompt, or analysisId+sceneSelections required",
        },
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

    // Сначала проверяем прямую передачу sceneSelections
    if (directSceneSelections && directSceneSelections.length > 0) {
      sceneSelections = directSceneSelections;
    } else if (configurationId) {
      // Fallback на конфигурацию из БД
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

      // Helper to get VideoElements for a specific scene
      const getElementsForScene = (sceneIndex: number) =>
        videoElements
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

      // Prepare scene tasks - separate original and modified scenes
      type SceneTask = {
        scene: (typeof scenes)[0];
        selection: (typeof sceneSelections)[0];
        scenePrompt: string;
        sceneImageUrls: string[];
        sceneNegativePrompt?: string;
      };

      const originalScenes: Array<{
        sceneId: string;
        sceneIndex: number;
        useOriginal: true;
        startTime: number;
        endTime: number;
      }> = [];

      const scenesToGenerate: SceneTask[] = [];

      // First pass: categorize scenes
      for (const selection of sceneSelections) {
        const scene = scenes.find((s) => s.id === selection.sceneId);
        if (!scene) continue;

        if (selection.useOriginal) {
          originalScenes.push({
            sceneId: scene.id,
            sceneIndex: scene.index,
            useOriginal: true,
            startTime: scene.startTime,
            endTime: scene.endTime,
          });
        } else {
          // Build prompt for this scene
          let scenePrompt = finalPrompt;
          let sceneImageUrls = configData.referenceImages;
          let sceneNegativePrompt: string | undefined;

          if (
            selection.elementSelections &&
            selection.elementSelections.length > 0
          ) {
            const sceneElements = getElementsForScene(scene.index);

            if (sceneElements && sceneElements.length > 0) {
              const {
                prompt: builtPrompt,
                imageUrls,
                negativePrompt: builtNegativePrompt,
              } = buildPromptFromSelections(
                sceneElements,
                selection.elementSelections
              );

              if (builtPrompt) {
                scenePrompt = builtPrompt;
                sceneImageUrls = imageUrls;
                sceneNegativePrompt = builtNegativePrompt;
              }
            }
          }

          scenesToGenerate.push({
            scene,
            selection,
            scenePrompt,
            sceneImageUrls,
            sceneNegativePrompt,
          });
        }
      }

      // Start all scene generations in PARALLEL
      console.log(
        `[Generate] Starting ${scenesToGenerate.length} scene generations in parallel`
      );

      const generationResults = await Promise.all(
        scenesToGenerate.map(async (task) => {
          const sceneGenerationId = await sceneGenJobQueue.startSceneGeneration(
            task.scene.id,
            task.scenePrompt,
            sourceVideoUrl,
            task.scene.startTime,
            task.scene.endTime,
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
                task.sceneImageUrls.length > 0
                  ? task.sceneImageUrls
                  : undefined,
              negativePrompt: task.sceneNegativePrompt,
            }
          );

          return {
            sceneId: task.scene.id,
            sceneIndex: task.scene.index,
            useOriginal: false as const,
            generationId: sceneGenerationId,
            startTime: task.scene.startTime,
            endTime: task.scene.endTime,
          };
        })
      );

      // Combine original and generated scenes, sorted by index
      const sceneConfigs = [...originalScenes, ...generationResults].sort(
        (a, b) => a.sceneIndex - b.sceneIndex
      );

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
  }) as any;
});

// ============================================
// POST /{generationId}/publish - Publish generation
// ============================================

const publishRoute = createRoute({
  method: "post",
  path: "/{generationId}/publish",
  summary: "Publish generation",
  tags: ["Generate"],
  description: "Share the generation with the community and create a template.",
  request: {
    params: z.object({
      generationId: z.string().openapi({ description: "Generation ID" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: PublishGenerationRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: PublishGenerationResponseSchema,
        },
      },
      description: "Generation published",
    },
    404: {
      description: "Generation not found",
    },
  },
});

app.openapi(publishRoute, async (c) => {
  const { generationId } = c.req.valid("param");
  const { isShared, communityConsent, title } = c.req.valid("json");

  const generation = await prisma.videoGeneration.findUnique({
    where: { id: generationId },
    include: { analysis: true },
  });

  if (!generation) {
    return c.json({ error: "Generation not found" }, 404);
  }

  let templateId: string | undefined;

  if (isShared && communityConsent) {
    // Create a new template from this generation
    const template = await prisma.template.create({
      data: {
        title: title || generation.analysis.fileName || "Shared Generation",
        analysisId: generation.analysisId,
        reelId: generation.analysis.sourceId || "", // Assuming sourceId is reelId for now
        isPublished: true,
        isFeatured: false,
        tags: generation.analysis.tags || [],
        generationCount: 1,
      },
    });
    templateId = template.id;
  }

  return c.json({
    success: true,
    templateId,
  });
});

// ============================================
// POST /{generationId}/share - Share generation
// ============================================

const shareRoute = createRoute({
  method: "post",
  path: "/{generationId}/share",
  summary: "Share generation",
  tags: ["Generate"],
  description: "Log a share action for the generation.",
  request: {
    params: z.object({
      generationId: z.string().openapi({ description: "Generation ID" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: SocialShareRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: SocialShareResponseSchema,
        },
      },
      description: "Share action logged",
    },
    404: {
      description: "Generation not found",
    },
  },
});

app.openapi(shareRoute, async (c) => {
  const { generationId } = c.req.valid("param");
  const { platform: _platform } = c.req.valid("json");

  const generation = await prisma.videoGeneration.findUnique({
    where: { id: generationId },
  });

  if (!generation) {
    return c.json({ error: "Generation not found" }, 404);
  }

  // Logic to log share action or generate platform-specific URLs
  // For now just return success
  return c.json({
    success: true,
    shareUrl: generation.videoUrl || undefined,
  });
});

// ============================================
// POST /scene/{sceneId}/regenerate - Regenerate a specific scene
// ============================================

const regenerateSceneRoute = createRoute({
  method: "post",
  path: "/scene/{sceneId}/regenerate",
  summary: "Regenerate a specific scene",
  tags: ["Generate"],
  description:
    "Start regeneration of a specific scene with optional new prompt. Can auto-composite with other scenes.",
  request: {
    params: z.object({
      sceneId: z.string().openapi({ description: "Scene ID" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            prompt: z.string().optional().openapi({
              description:
                "Custom prompt for regeneration. If not provided, uses the last generation prompt.",
            }),
            duration: z.union([z.literal(5), z.literal(10)]).optional(),
            aspectRatio: z.enum(["16:9", "9:16", "1:1", "auto"]).optional(),
            keepAudio: z.boolean().optional(),
            autoComposite: z.boolean().optional().default(true).openapi({
              description:
                "Automatically create composite generation with all scenes after this scene completes. Default: true",
            }),
            useGeneratedAsSource: z
              .boolean()
              .optional()
              .default(false)
              .openapi({
                description:
                  "Use the previously generated video as source instead of the original scene. Default: false (use original)",
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
            sceneGenerationId: z.string(),
            compositeGenerationId: z.string().optional(),
            status: z.string(),
          }),
        },
      },
      description: "Scene regeneration started",
    },
    404: {
      content: {
        "application/json": {
          schema: NotFoundResponseSchema,
        },
      },
      description: "Scene not found",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Bad request",
    },
  },
});

app.openapi(regenerateSceneRoute, async (c) => {
  const { sceneId } = c.req.valid("param");
  const {
    prompt,
    duration,
    aspectRatio,
    keepAudio,
    autoComposite,
    useGeneratedAsSource,
  } = c.req.valid("json");

  // Get the scene with analysis, reel, and all sibling scenes
  const scene = await prisma.videoScene.findUnique({
    where: { id: sceneId },
    include: {
      analysis: {
        include: {
          template: {
            include: {
              reel: true,
            },
          },
          videoScenes: {
            orderBy: { index: "asc" },
            include: {
              generations: {
                where: { status: "completed" },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
      generations: {
        where: { status: "completed" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!scene) {
    return c.json({ error: "Scene not found" }, 404);
  }

  // Get source video URL
  const reel = scene.analysis.template?.reel;
  if (!reel) {
    return c.json({ error: "Source video not found" }, 400);
  }

  const originalVideoUrl = buildReelVideoUrl(reel);
  if (!originalVideoUrl) {
    return c.json({ error: "Source video URL not available" }, 400);
  }

  // Use generated video as source if requested and available
  const lastGeneration = scene.generations[0];
  let sourceVideoUrl = originalVideoUrl;

  if (useGeneratedAsSource && lastGeneration?.videoUrl) {
    sourceVideoUrl = lastGeneration.videoUrl;
  } else if (useGeneratedAsSource && !lastGeneration?.videoUrl) {
    return c.json(
      { error: "No completed generation available to use as source" },
      400
    );
  }

  // Use provided prompt or fallback to last generation's prompt
  const finalPrompt =
    prompt || lastGeneration?.prompt || "Transform this scene";

  // Start scene generation
  const sceneGenerationId = await sceneGenJobQueue.startSceneGeneration(
    sceneId,
    finalPrompt,
    sourceVideoUrl,
    scene.startTime,
    scene.endTime,
    {
      duration: duration || 5,
      aspectRatio: aspectRatio || "auto",
      keepAudio,
    }
  );

  let compositeGenerationId: string | undefined;

  // Auto-composite: create composite generation with all scenes
  if (autoComposite !== false) {
    const allScenes = scene.analysis.videoScenes;

    // Build scene configs for composite
    const sceneConfigs = allScenes.map((s) => {
      const isTargetScene = s.id === sceneId;
      const hasCompletedGeneration = s.generations.length > 0;

      if (isTargetScene) {
        // This scene will use the new generation (wait for it)
        return {
          sceneId: s.id,
          sceneIndex: s.index,
          useOriginal: false,
          generationId: sceneGenerationId, // Will wait for this generation
          startTime: s.startTime,
          endTime: s.endTime,
        };
      }
      if (hasCompletedGeneration) {
        // Use the latest completed generation
        const latestGeneration = s.generations[0]!;
        return {
          sceneId: s.id,
          sceneIndex: s.index,
          useOriginal: false,
          generationId: latestGeneration.id,
          startTime: s.startTime,
          endTime: s.endTime,
        };
      }
      // Use original video for this scene
      return {
        sceneId: s.id,
        sceneIndex: s.index,
        useOriginal: true,
        startTime: s.startTime,
        endTime: s.endTime,
      };
    });

    // Start composite generation
    compositeGenerationId = await sceneGenJobQueue.startCompositeGeneration(
      scene.analysis.id,
      sourceVideoUrl,
      sceneConfigs
    );
  }

  return c.json(
    {
      success: true,
      sceneGenerationId,
      compositeGenerationId,
      status: "queued",
    },
    202
  );
});

export { app as generateRouter };
