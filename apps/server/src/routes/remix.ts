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

const app = new OpenAPIHono();

// Helper to build prompt from selections
function buildPromptFromSelections(
  elements: Array<{
    id: string;
    type: string;
    label: string;
    description: string;
    remixOptions: Array<{ id: string; label: string; prompt: string }>;
  }>,
  selections: Array<{
    elementId: string;
    selectedOptionId?: string;
    customMediaUrl?: string;
  }>
): string {
  const parts: string[] = [];

  for (const selection of selections) {
    const element = elements.find((e) => e.id === selection.elementId);
    if (!element) continue;

    if (selection.selectedOptionId) {
      const option = element.remixOptions.find(
        (o) => o.id === selection.selectedOptionId
      );
      if (option) {
        parts.push(option.prompt);
      }
    } else if (selection.customMediaUrl) {
      parts.push(`Replace ${element.label} with custom image reference`);
    }
  }

  return parts.join(". ");
}

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

  // Parse elements
  const elements = (
    analysis.elements as Array<{
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

  // Build prompt from selections
  const generatedPrompt = buildPromptFromSelections(elements, selections);

  // Estimate credits (5 per generation)
  const estimatedCredits = sceneSelections
    ? sceneSelections.filter((s) => !s.useOriginal).length * 5
    : 5;

  // Create configuration
  const config = await prisma.generationConfig.create({
    data: {
      analysisId,
      mode: "simple",
      selections: selections as object[],
      sceneSelections: sceneSelections as object[] | undefined,
      generatedPrompt,
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

  // Parse elements for reference
  const elements = (
    analysis.elements as Array<{
      id: string;
      type: string;
      label: string;
      description: string;
    }>
  ).map((el) => ({
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

  // Prompt hints
  const promptHints = [
    "Use @Video1 to reference the source video",
    "Be specific about what to change",
    "Describe the desired mood and style",
    "Mention camera movements if needed",
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
