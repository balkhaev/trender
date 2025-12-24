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
    "Упрощённый API для генерации видео. Параметры duration и aspectRatio берутся из анализа автоматически.",
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
      description: "Analysis not found",
    },
  },
});

app.openapi(generateRoute, async (c) => {
  const { analysisId, selections, keepAudio } = c.req.valid("json");

  try {
    // 1. Загружаем анализ с элементами, сценами и reel
    const analysis = await prisma.videoAnalysis.findUnique({
      where: { id: analysisId },
      include: {
        template: {
          include: {
            reel: true,
          },
        },
        videoElements: true,
        videoScenes: {
          orderBy: { index: "asc" },
        },
      },
    });

    if (!analysis) {
      return c.json({ error: "Analysis not found" }, 404);
    }

    // 2. Получаем source video URL
    const reel = analysis.template?.reel;
    const sourceVideoUrl = reel ? buildReelVideoUrl(reel) : null;

    if (!sourceVideoUrl) {
      return c.json({ error: "Source video not found" }, 400);
    }

    // 3. Собираем все элементы из relation И JSON поля
    type ElementType = {
      id: string;
      type: string;
      label: string;
      description: string | null;
      remixOptions: Array<{ id: string; label: string; prompt: string }>;
    };

    const elementsFromRelation: ElementType[] = analysis.videoElements.map(
      (el) => ({
        id: el.id,
        type: el.type,
        label: el.label,
        description: el.description,
        remixOptions:
          (el.remixOptions as Array<{
            id: string;
            label: string;
            prompt: string;
          }>) || [],
      })
    );

    const elementsFromJson: ElementType[] = Array.isArray(analysis.elements)
      ? (analysis.elements as ElementType[])
      : [];

    // Объединяем элементы, relation имеет приоритет
    const elementMap = new Map<string, ElementType>();
    for (const el of elementsFromJson) {
      elementMap.set(el.id, el);
    }
    for (const el of elementsFromRelation) {
      elementMap.set(el.id, el);
    }
    const elements = Array.from(elementMap.values());

    // 4. Валидация selections
    if (selections && selections.length > 0) {
      const elementIds = new Set(elements.map((e) => e.id));

      for (const sel of selections) {
        if (!elementIds.has(sel.elementId)) {
          return c.json({ error: `Element not found: ${sel.elementId}` }, 400);
        }

        // "custom" - специальное значение для кастомного изображения
        if (sel.optionId && sel.optionId !== "custom") {
          const element = elements.find((e) => e.id === sel.elementId);
          const remixOptions = element?.remixOptions || [];
          if (!remixOptions.some((opt) => opt.id === sel.optionId)) {
            return c.json(
              {
                error: `Option not found: ${sel.optionId} for element ${sel.elementId}`,
              },
              400
            );
          }
        }

        // Если optionId === "custom", должен быть customImageUrl
        if (sel.optionId === "custom" && !sel.customImageUrl) {
          return c.json(
            {
              error: `customImageUrl is required when optionId is "custom" for element ${sel.elementId}`,
            },
            400
          );
        }
      }
    }

    // 5. Параметры из анализа
    const duration = (
      analysis.duration && analysis.duration <= 10 ? analysis.duration : 5
    ) as 5 | 10;
    const aspectRatio =
      (analysis.aspectRatio as "16:9" | "9:16" | "1:1" | "auto") || "auto";

    // Преобразуем selections в формат для buildPromptFromSelections
    const elementSelections = (selections || []).map((sel) => ({
      elementId: sel.elementId,
      selectedOptionId: sel.optionId,
      customMediaUrl: sel.customImageUrl,
    }));

    // 6. Строим промпт из selections
    const { prompt, imageUrls, negativePrompt } = buildPromptFromSelections(
      elements,
      elementSelections
    );

    // 7. Определяем тип генерации
    const hasScenes = analysis.hasScenes && analysis.videoScenes.length > 1;

    if (hasScenes && elementSelections.length > 0) {
      // Composite generation - генерируем по сценам
      const scenes = analysis.videoScenes;

      // Собираем appearances из relation для фильтрации по сценам
      const elementAppearances = new Map<
        string,
        Array<{ sceneIndex: number }>
      >();
      for (const el of analysis.videoElements) {
        const appearances = el.appearances as Array<{ sceneIndex: number }>;
        if (appearances) {
          elementAppearances.set(el.id, appearances);
        }
      }

      // Helper: получить элементы для конкретной сцены
      const getElementsForScene = (sceneIndex: number) =>
        elements.filter((el) => {
          const appearances = elementAppearances.get(el.id);
          // Если нет appearances, элемент доступен во всех сценах
          if (!appearances || appearances.length === 0) return true;
          return appearances.some((a) => a.sceneIndex === sceneIndex);
        });

      // Определяем какие сцены нужно генерировать
      const sceneConfigs: Array<{
        sceneId: string;
        sceneIndex: number;
        useOriginal: boolean;
        generationId?: string;
        startTime: number;
        endTime: number;
      }> = [];

      for (const scene of scenes) {
        const sceneElements = getElementsForScene(scene.index);
        const sceneElementIds = new Set(sceneElements.map((e) => e.id));

        // Проверяем есть ли selections для элементов этой сцены
        const sceneSelections = elementSelections.filter((sel) =>
          sceneElementIds.has(sel.elementId)
        );

        if (sceneSelections.length === 0) {
          // Нет изменений для этой сцены - используем оригинал
          sceneConfigs.push({
            sceneId: scene.id,
            sceneIndex: scene.index,
            useOriginal: true,
            startTime: scene.startTime,
            endTime: scene.endTime,
          });
        } else {
          // Есть изменения - генерируем
          const {
            prompt: scenePrompt,
            imageUrls: sceneImageUrls,
            negativePrompt: sceneNegativePrompt,
          } = buildPromptFromSelections(sceneElements, sceneSelections);

          const sceneGenerationId = await sceneGenJobQueue.startSceneGeneration(
            scene.id,
            scenePrompt || "Transform this scene",
            sourceVideoUrl,
            scene.startTime,
            scene.endTime,
            {
              duration,
              aspectRatio,
              keepAudio,
              imageUrls: sceneImageUrls.length > 0 ? sceneImageUrls : undefined,
              negativePrompt: sceneNegativePrompt,
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

      // Запускаем composite generation
      const compositeId = await sceneGenJobQueue.startCompositeGeneration(
        analysisId,
        sourceVideoUrl,
        sceneConfigs
      );

      return c.json(
        {
          generationId: compositeId,
          status: "queued" as const,
          statusUrl: `/api/generate/${compositeId}/composite-status`,
          type: "composite" as const,
        },
        202
      );
    }

    // 8. Full video generation
    const generationId = await videoGenJobQueue.startGeneration(
      analysisId,
      prompt || "Transform this video",
      sourceVideoUrl,
      {
        duration,
        aspectRatio,
        keepAudio,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        negativePrompt,
      }
    );

    return c.json(
      {
        generationId,
        status: "queued" as const,
        statusUrl: `/api/generate/${generationId}/status`,
        type: "full" as const,
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
            duration: z
              .preprocess(
                (val) => (typeof val === "string" ? Number(val) : val),
                z.union([z.literal(5), z.literal(10)])
              )
              .optional(),
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
            imageUrls: z.array(z.string()).optional().openapi({
              description:
                "Reference image URLs for Kling imageList. If not provided, tries to use images from previous generation.",
            }),
            sourceVideoUrl: z.string().optional().openapi({
              description:
                "Explicit source video URL. Use this when the scene doesn't have a saved video (e.g., upload-based analyses).",
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
    imageUrls,
    sourceVideoUrl: providedSourceVideoUrl,
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

  // Get source video URL - try multiple sources in order of preference
  let originalVideoUrl: string | null = null;

  // 1. Try template->reel (for reel-based analyses)
  const reel = scene.analysis.template?.reel;
  if (reel) {
    originalVideoUrl = buildReelVideoUrl(reel);
  }

  // 2. Fallback to scene's pre-trimmed video (for upload-based analyses with scene splitting)
  if (!originalVideoUrl && scene.videoUrl) {
    originalVideoUrl = scene.videoUrl;
  }

  // 3. Fallback to explicitly provided sourceVideoUrl
  if (!originalVideoUrl && providedSourceVideoUrl) {
    originalVideoUrl = providedSourceVideoUrl;
  }

  if (!originalVideoUrl) {
    console.error(
      `[Regenerate] No source video for scene ${sceneId}:`,
      `sourceType=${scene.analysis.sourceType}`,
      `hasTemplate=${!!scene.analysis.template}`,
      `hasReel=${!!reel}`,
      `sceneVideoUrl=${scene.videoUrl || "none"}`,
      `providedSourceVideoUrl=${providedSourceVideoUrl || "none"}`
    );
    return c.json(
      {
        error:
          "Source video not found. Please provide sourceVideoUrl in the request body. " +
          `(sourceType: ${scene.analysis.sourceType}, hasTemplate: ${!!scene.analysis.template}, sceneVideoUrl: ${!!scene.videoUrl})`,
      },
      400
    );
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

  // Get imageUrls: from request, or try to extract from previous generation's selectedElements
  let finalImageUrls = imageUrls;
  if (!finalImageUrls && lastGeneration?.selectedElements) {
    try {
      const elements = lastGeneration.selectedElements as Array<{
        customMediaUrl?: string;
      }>;
      const urls = elements
        .filter((e) => e.customMediaUrl)
        .map((e) => e.customMediaUrl as string);
      if (urls.length > 0) {
        finalImageUrls = urls;
      }
    } catch {
      // Ignore parsing errors
    }
  }

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
      imageUrls: finalImageUrls,
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

// ============================================
// DELETE /{generationId} - Delete VideoGeneration
// ============================================

const deleteGenerationRoute = createRoute({
  method: "delete",
  path: "/{generationId}",
  summary: "Delete video generation",
  tags: ["Generate"],
  description: "Delete a video generation and its S3 file.",
  request: {
    params: z.object({
      generationId: z.string().openapi({ description: "Generation ID" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
          }),
        },
      },
      description: "Generation deleted",
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

app.openapi(deleteGenerationRoute, async (c) => {
  const { generationId } = c.req.valid("param");

  const generation = await prisma.videoGeneration.findUnique({
    where: { id: generationId },
  });

  if (!generation) {
    return c.json({ error: "Generation not found" }, 404);
  }

  // Delete S3 file if exists
  if (generation.s3Key) {
    try {
      const { s3Service: s3 } = await import("../services/s3");
      await s3.deleteFile(generation.s3Key);
      console.log(`[Delete] Deleted S3 file: ${generation.s3Key}`);
    } catch (error) {
      console.error(
        `[Delete] Failed to delete S3 file: ${generation.s3Key}`,
        error
      );
    }
  }

  // Delete DB record
  await prisma.videoGeneration.delete({
    where: { id: generationId },
  });

  console.log(`[Delete] Deleted VideoGeneration: ${generationId}`);

  return c.json({ success: true }, 200);
});

// ============================================
// DELETE /composite/{compositeId} - Delete CompositeGeneration
// ============================================

const deleteCompositeRoute = createRoute({
  method: "delete",
  path: "/composite/{compositeId}",
  summary: "Delete composite generation",
  tags: ["Generate"],
  description:
    "Delete a composite generation and all related scene generations with their S3 files.",
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
            success: z.boolean(),
            deletedScenes: z.number(),
          }),
        },
      },
      description: "Composite generation deleted",
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

app.openapi(deleteCompositeRoute, async (c) => {
  const { compositeId } = c.req.valid("param");

  const composite = await prisma.compositeGeneration.findUnique({
    where: { id: compositeId },
  });

  if (!composite) {
    return c.json({ error: "Composite generation not found" }, 404);
  }

  // Get scene generation IDs from sceneConfig
  const sceneConfig =
    (composite.sceneConfig as Array<{
      sceneId: string;
      generationId?: string;
      useOriginal: boolean;
    }>) || [];

  const sceneGenerationIds = sceneConfig
    .filter((s) => !s.useOriginal && s.generationId)
    .map((s) => s.generationId as string);

  // Get scene generations to delete their S3 files
  const sceneGenerations = await prisma.sceneGeneration.findMany({
    where: { id: { in: sceneGenerationIds } },
  });

  const { s3Service: s3 } = await import("../services/s3");

  // Delete S3 files for scene generations
  for (const sceneGen of sceneGenerations) {
    if (sceneGen.s3Key) {
      try {
        await s3.deleteFile(sceneGen.s3Key);
        console.log(`[Delete] Deleted scene S3 file: ${sceneGen.s3Key}`);
      } catch (error) {
        console.error(
          `[Delete] Failed to delete scene S3 file: ${sceneGen.s3Key}`,
          error
        );
      }
    }
  }

  // Delete S3 file for composite
  if (composite.s3Key) {
    try {
      await s3.deleteFile(composite.s3Key);
      console.log(`[Delete] Deleted composite S3 file: ${composite.s3Key}`);
    } catch (error) {
      console.error(
        `[Delete] Failed to delete composite S3 file: ${composite.s3Key}`,
        error
      );
    }
  }

  // Delete scene generations from DB
  if (sceneGenerationIds.length > 0) {
    await prisma.sceneGeneration.deleteMany({
      where: { id: { in: sceneGenerationIds } },
    });
  }

  // Delete composite generation from DB
  await prisma.compositeGeneration.delete({
    where: { id: compositeId },
  });

  console.log(
    `[Delete] Deleted CompositeGeneration: ${compositeId} with ${sceneGenerationIds.length} scene generations`
  );

  return c.json(
    { success: true, deletedScenes: sceneGenerationIds.length },
    200
  );
});

export { app as generateRouter };
