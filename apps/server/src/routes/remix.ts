import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import prisma from "@trender/db";
import {
  ConfigureResponseSchema,
  ExpertConfigureRequestSchema,
  ExpertRemixDataResponseSchema,
  NotFoundResponseSchema,
  SimpleConfigureRequestSchema,
  SimpleRemixDataResponseSchema,
} from "../schemas";
import { buildReelVideoUrl } from "../services/url-builder";
import { buildPromptFromSelections } from "../utils/prompt-builder";

const app = new OpenAPIHono();

// ============================================
// GET /{analysisId}/simple - Get data for Simple Mode
// ============================================

const simpleDataRoute = createRoute({
  method: "get",
  path: "/{analysisId}/simple",
  summary: "Get Simple Mode data",
  tags: ["Remix"],
  description:
    "Returns analysis elements with remix options for Simple Mode selection.",
  request: {
    params: z.object({
      analysisId: z.string().openapi({ description: "Analysis ID" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: SimpleRemixDataResponseSchema,
        },
      },
      description: "Simple mode data",
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

app.openapi(simpleDataRoute, async (c) => {
  const { analysisId } = c.req.valid("param");

  const analysis = await prisma.videoAnalysis.findUnique({
    where: { id: analysisId },
    include: {
      videoScenes: {
        orderBy: { index: "asc" },
      },
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
  const videoUrl = reel ? buildReelVideoUrl(reel) : null;

  // Parse elements - fallback to scene elements if analysis.elements is empty
  let rawElements = analysis.elements as Array<{
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
  }>;

  // If no elements at analysis level, aggregate from scenes
  if (
    (!rawElements || rawElements.length === 0) &&
    analysis.videoScenes.length > 0
  ) {
    const elementMap = new Map<string, (typeof rawElements)[0]>();
    for (const scene of analysis.videoScenes) {
      const sceneElements = scene.elements as typeof rawElements;
      for (const el of sceneElements || []) {
        const key = `${el.type}-${el.label.toLowerCase()}`;
        if (!elementMap.has(key)) {
          elementMap.set(key, el);
        }
      }
    }
    rawElements = Array.from(elementMap.values());
  }

  const elements = rawElements.map((el) => ({
    ...el,
    thumbnailUrl: undefined,
    allowCustomImage: true,
  }));

  // Build scenes if available
  const scenes =
    analysis.videoScenes.length > 0
      ? analysis.videoScenes.map((scene) => ({
          id: scene.id,
          index: scene.index,
          startTime: scene.startTime,
          endTime: scene.endTime,
          thumbnailUrl: scene.thumbnailUrl,
          elements: (
            scene.elements as Array<{
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
            }>
          ).map((el) => ({
            ...el,
            thumbnailUrl: undefined,
            allowCustomImage: true,
          })),
          canKeepOriginal: true,
        }))
      : undefined;

  return c.json({
    analysisId: analysis.id,
    sourceVideo: {
      url: videoUrl ?? "",
      thumbnailUrl: reel?.thumbnailUrl ?? "",
      duration: analysis.duration,
      aspectRatio: analysis.aspectRatio,
    },
    elements,
    scenes,
    isSceneBased: analysis.videoScenes.length > 0,
  });
});

// ============================================
// POST /{analysisId}/simple/configure - Save Simple Mode selection
// ============================================

const simpleConfigureRoute = createRoute({
  method: "post",
  path: "/{analysisId}/simple/configure",
  summary: "Save Simple Mode configuration",
  tags: ["Remix"],
  description:
    "Save element selections and generate configuration for generation.",
  request: {
    params: z.object({
      analysisId: z.string().openapi({ description: "Analysis ID" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: SimpleConfigureRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ConfigureResponseSchema,
        },
      },
      description: "Configuration saved",
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

app.openapi(simpleConfigureRoute, async (c) => {
  const { analysisId } = c.req.valid("param");
  const { selections, sceneSelections } = c.req.valid("json");

  const analysis = await prisma.videoAnalysis.findUnique({
    where: { id: analysisId },
  });

  if (!analysis) {
    return c.json({ error: "Analysis not found" }, 404);
  }

  const elements = analysis.elements as Array<{
    id: string;
    type: string;
    label: string;
    description: string;
    remixOptions: Array<{ id: string; label: string; prompt: string }>;
  }>;

  // Build prompt from selections (returns prompt with <<<image_N>>> refs, imageUrls, and negativePrompt)
  const {
    prompt: generatedPrompt,
    imageUrls,
    negativePrompt,
  } = buildPromptFromSelections(elements, selections);

  // Estimate credits (5 per generation)
  const estimatedCredits = sceneSelections
    ? sceneSelections.filter((s) => !s.useOriginal).length * 5
    : 5;

  // Create configuration with referenceImages for Kling image_list
  const config = await prisma.generationConfig.create({
    data: {
      analysisId,
      mode: "simple",
      selections: selections as object[],
      sceneSelections: sceneSelections as object[] | undefined,
      generatedPrompt,
      referenceImages: imageUrls, // Store for generate.ts to pass to Kling
      estimatedCredits,
    },
  });

  return c.json({
    success: true,
    configurationId: config.id,
    generatedPrompt,
    estimatedCredits,
  });
});

// ============================================
// GET /{analysisId}/expert - Get data for Expert Mode
// ============================================

const expertDataRoute = createRoute({
  method: "get",
  path: "/{analysisId}/expert",
  summary: "Get Expert Mode data",
  tags: ["Remix"],
  description: "Returns analysis data and suggested prompt for Expert Mode.",
  request: {
    params: z.object({
      analysisId: z.string().openapi({ description: "Analysis ID" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ExpertRemixDataResponseSchema,
        },
      },
      description: "Expert mode data",
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

app.openapi(expertDataRoute, async (c) => {
  const { analysisId } = c.req.valid("param");

  const analysis = await prisma.videoAnalysis.findUnique({
    where: { id: analysisId },
    include: {
      videoScenes: {
        orderBy: { index: "asc" },
      },
      template: {
        include: {
          reel: true,
        },
      },
      generations: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!analysis) {
    return c.json({ error: "Analysis not found" }, 404);
  }

  const reel = analysis.template?.reel;
  const videoUrl = reel ? buildReelVideoUrl(reel) : null;

  // Parse elements for reference - fallback to scene elements if analysis.elements is empty
  let rawExpertElements = analysis.elements as Array<{
    id: string;
    type: string;
    label: string;
    description: string;
  }>;

  // If no elements at analysis level, aggregate from scenes
  if (
    (!rawExpertElements || rawExpertElements.length === 0) &&
    analysis.videoScenes.length > 0
  ) {
    const elementMap = new Map<string, (typeof rawExpertElements)[0]>();
    for (const scene of analysis.videoScenes) {
      const sceneElements = scene.elements as typeof rawExpertElements;
      for (const el of sceneElements || []) {
        const key = `${el.type}-${el.label.toLowerCase()}`;
        if (!elementMap.has(key)) {
          elementMap.set(key, el);
        }
      }
    }
    rawExpertElements = Array.from(elementMap.values());
  }

  const elements = rawExpertElements.map((el) => ({
    id: el.id,
    type: el.type,
    label: el.label,
    description: el.description,
  }));

  // Build suggested prompt from analysis
  const suggestedPrompt =
    analysis.klingPrompt ||
    `Transform the video: ${analysis.subject} ${analysis.action} in ${analysis.environment}`;

  // Build scene prompts
  const scenes =
    analysis.videoScenes.length > 0
      ? analysis.videoScenes.map((scene) => ({
          id: scene.id,
          index: scene.index,
          startTime: scene.startTime,
          endTime: scene.endTime,
          suggestedPrompt: `Scene ${scene.index + 1}: Transform this segment`,
        }))
      : undefined;

  // Previous generations for inspiration
  const previousGenerations = analysis.generations.map((gen) => ({
    id: gen.id,
    prompt: gen.prompt,
    thumbnailUrl: gen.thumbnailUrl,
    status: gen.status,
  }));

  // Prompt hints for Kling API syntax
  const promptHints = [
    "Используйте @Video1 для референса на исходное видео",
    "Используйте @Image1, @Image2... для своих изображений (добавьте URLs в referenceImages)",
    "Опишите желаемые изменения конкретно",
    "Укажите настроение и стиль",
  ];

  return c.json({
    analysisId: analysis.id,
    sourceVideo: {
      url: videoUrl ?? "",
      thumbnailUrl: reel?.thumbnailUrl ?? "",
      duration: analysis.duration,
      aspectRatio: analysis.aspectRatio,
    },
    suggestedPrompt,
    elements,
    scenes,
    promptHints,
    previousGenerations:
      previousGenerations.length > 0 ? previousGenerations : undefined,
  });
});

// ============================================
// POST /{analysisId}/expert/configure - Save Expert Mode configuration
// ============================================

const expertConfigureRoute = createRoute({
  method: "post",
  path: "/{analysisId}/expert/configure",
  summary: "Save Expert Mode configuration",
  tags: ["Remix"],
  description: "Save custom prompt and options for generation.",
  request: {
    params: z.object({
      analysisId: z.string().openapi({ description: "Analysis ID" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: ExpertConfigureRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ConfigureResponseSchema,
        },
      },
      description: "Configuration saved",
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

app.openapi(expertConfigureRoute, async (c) => {
  const { analysisId } = c.req.valid("param");
  const { prompt, referenceImages, scenePrompts, options } =
    c.req.valid("json");

  const analysis = await prisma.videoAnalysis.findUnique({
    where: { id: analysisId },
  });

  if (!analysis) {
    return c.json({ error: "Analysis not found" }, 404);
  }

  // Estimate credits
  const estimatedCredits = scenePrompts
    ? scenePrompts.filter((s) => !s.useOriginal).length * 5
    : 5;

  // Create configuration
  const config = await prisma.generationConfig.create({
    data: {
      analysisId,
      mode: "expert",
      prompt,
      selections: [],
      referenceImages: referenceImages ?? [],
      sceneSelections: scenePrompts as object[] | undefined,
      options: options as object | undefined,
      generatedPrompt: prompt,
      estimatedCredits,
    },
  });

  return c.json({
    success: true,
    configurationId: config.id,
    generatedPrompt: prompt,
    estimatedCredits,
  });
});

export { app as remixRouter };
