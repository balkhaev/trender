import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import prisma from "@trender/db";
import {
  ErrorResponseSchema,
  ListQuerySchema,
  NotFoundResponseSchema,
  TemplateSchema,
  UnauthorizedResponseSchema,
} from "../schemas/openapi";
import { isKlingConfigured } from "../services/kling";
import { videoGenJobQueue } from "../services/queues";
import { getReelVideoUrl } from "../services/s3";

// Schemas moved to centralized location

// --- Routes ---

const listTemplatesRoute = createRoute({
  method: "get",
  path: "/",
  summary: "List templates",
  tags: ["Templates"],
  request: {
    query: ListQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            templates: z.array(TemplateSchema),
            total: z.number(),
            limit: z.number(),
            offset: z.number(),
          }),
        },
      },
      description: "List of templates retrieved successfully",
    },
    500: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Internal server error occurred while fetching templates",
    },
  },
});

const getTemplateRoute = createRoute({
  method: "get",
  path: "/{id}",
  summary: "Get template by ID",
  tags: ["Templates"],
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
            template: TemplateSchema,
          }),
        },
      },
      description: "Detailed template information provided",
    },
    404: {
      content: {
        "application/json": {
          schema: NotFoundResponseSchema,
        },
      },
      description: "Template with the specified ID not found",
    },
  },
});

const updateTemplateRoute = createRoute({
  method: "patch",
  path: "/{id}",
  summary: "Update template",
  tags: ["Templates"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            title: z.string().optional(),
            tags: z.array(z.string()).optional(),
            category: z.string().optional(),
            isPublished: z.boolean().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            template: TemplateSchema,
          }),
        },
      },
      description: "Template successfully updated",
    },
    401: {
      content: {
        "application/json": {
          schema: UnauthorizedResponseSchema,
        },
      },
      description: "Unauthorized access",
    },
    404: {
      content: {
        "application/json": {
          schema: NotFoundResponseSchema,
        },
      },
      description: "Template not found",
    },
  },
  security: [{ BearerAuth: [] }],
});

const generateFromTemplateRoute = createRoute({
  method: "post",
  path: "/{id}/generate",
  summary: "Generate video from template",
  tags: ["Templates"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            customPrompt: z.string().optional(),
            options: z
              .object({
                duration: z.union([z.literal(5), z.literal(10)]).optional(),
                aspectRatio: z.enum(["16:9", "9:16", "1:1", "auto"]).optional(),
                keepAudio: z.boolean().optional(),
              })
              .optional(),
          }),
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
            templateId: z.string(),
          }),
        },
      },
      description: "Video generation job initiated",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description:
        "Bad request - possibly Kling not configured or no source video",
    },
    401: {
      content: {
        "application/json": {
          schema: UnauthorizedResponseSchema,
        },
      },
      description: "Unauthorized - Bearer token required",
    },
    404: {
      content: {
        "application/json": {
          schema: NotFoundResponseSchema,
        },
      },
      description: "Template not found",
    },
  },
  security: [{ BearerAuth: [] }],
});

const getGenerationsRoute = createRoute({
  method: "get",
  path: "/{id}/generations",
  summary: "Get template generations",
  tags: ["Templates"],
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
            generations: z.array(z.any()),
          }),
        },
      },
      description: "List of generations",
    },
    404: {
      description: "Template not found",
    },
  },
});

const getCategoriesRoute = createRoute({
  method: "get",
  path: "/meta/categories",
  summary: "Get template categories",
  tags: ["Templates"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            categories: z.array(
              z.object({
                name: z.string(),
                count: z.number(),
              })
            ),
          }),
        },
      },
      description: "List of categories",
    },
  },
});

const getTagsRoute = createRoute({
  method: "get",
  path: "/meta/tags",
  summary: "Get template tags",
  tags: ["Templates"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            tags: z.array(
              z.object({
                name: z.string(),
                count: z.number(),
              })
            ),
          }),
        },
      },
      description: "List of tags",
    },
  },
});

export const templatesRouter = new OpenAPIHono();

templatesRouter.openapi(listTemplatesRoute, async (c) => {
  const query = c.req.valid("query");
  const where: any = {};

  if (query.category) where.category = query.category;
  if (query.tag) where.tags = { has: query.tag };
  if (query.published !== undefined) {
    where.isPublished = query.published;
  } else {
    where.isPublished = true;
  }

  const [templates, total] = await Promise.all([
    prisma.template.findMany({
      where,
      take: query.limit,
      skip: query.offset,
      orderBy: { createdAt: "desc" },
      include: {
        reel: {
          select: {
            id: true,
            url: true,
            thumbnailUrl: true,
            likeCount: true,
            author: true,
            source: true,
          },
        },
        analysis: {
          select: {
            id: true,
            subject: true,
            action: true,
            style: true,
            klingPrompt: true,
            veo3Prompt: true,
          },
        },
      },
    }),
    prisma.template.count({ where }),
  ]);

  return c.json(
    { templates, total, limit: query.limit, offset: query.offset },
    200
  );
});

templatesRouter.openapi(getTemplateRoute, async (c) => {
  const { id } = c.req.valid("param");
  const template = await prisma.template.findUnique({
    where: { id },
    include: {
      reel: true,
      analysis: {
        include: {
          generations: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      },
    },
  });

  if (!template) return c.json({ error: "Template not found" }, 404);
  return c.json({ template }, 200);
});

templatesRouter.openapi(updateTemplateRoute, async (c) => {
  const { id } = c.req.valid("param");
  const data = c.req.valid("json");

  try {
    const template = await prisma.template.update({
      where: { id },
      data,
    });
    return c.json({ template }, 200);
  } catch (e) {
    return c.json({ error: "Failed to update template" }, 404);
  }
});

templatesRouter.openapi(generateFromTemplateRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { customPrompt, options } = c.req.valid("json");

  if (!isKlingConfigured()) {
    return c.json({ error: "Kling API is not configured" }, 400);
  }

  const template = await prisma.template.findUnique({
    where: { id },
    include: { analysis: true, reel: true },
  });

  if (!template) return c.json({ error: "Template not found" }, 404);

  const sourceVideoUrl = await getReelVideoUrl(template.reel);
  if (!sourceVideoUrl) {
    return c.json({ error: "No source video available" }, 400);
  }

  const prompt =
    customPrompt ||
    template.analysis.klingPrompt ||
    "Based on @Video1, recreate this video.";
  const generationId = await videoGenJobQueue.startGeneration(
    template.analysisId,
    prompt,
    sourceVideoUrl,
    options
  );

  await prisma.template.update({
    where: { id },
    data: { generationCount: { increment: 1 } },
  });

  return c.json({ success: true, generationId, templateId: id }, 200);
});

templatesRouter.openapi(getGenerationsRoute, async (c) => {
  const { id } = c.req.valid("param");
  const template = await prisma.template.findUnique({
    where: { id },
    select: { analysisId: true },
  });

  if (!template) return c.json({ error: "Template not found" }, 404);

  const generations = await prisma.videoGeneration.findMany({
    where: { analysisId: template.analysisId },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ generations }, 200);
});

templatesRouter.openapi(getCategoriesRoute, async (c) => {
  const categories = await prisma.template.groupBy({
    by: ["category"],
    where: { isPublished: true },
    _count: { id: true },
  });

  return c.json(
    {
      categories: categories.map((cat) => ({
        name: cat.category ?? "Uncategorized",
        count: cat._count.id,
      })),
    },
    200
  );
});

templatesRouter.openapi(getTagsRoute, async (c) => {
  const templates = await prisma.template.findMany({
    where: { isPublished: true },
    select: { tags: true },
  });

  const tagCount = new Map<string, number>();
  for (const t of templates) {
    for (const tag of t.tags) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
  }

  const tags = Array.from(tagCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return c.json({ tags }, 200);
});
