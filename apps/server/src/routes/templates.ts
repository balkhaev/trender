import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import prisma from "@trender/db";
import {
  BookmarkResponseSchema,
  ErrorResponseSchema,
  FeedQuerySchema,
  FeedResponseSchema,
  ListQuerySchema,
  NotFoundResponseSchema,
  SearchQuerySchema,
  SearchResponseSchema,
  TemplateSchema,
  UnauthorizedResponseSchema,
} from "../schemas";
import { isKlingConfigured } from "../services/kling";
import { videoGenJobQueue } from "../services/queues";
import { getExternalReelVideoUrl } from "../services/s3";
import { buildReelVideoUrl } from "../services/url-builder";

// TODO: Get userId from auth session
const getUserId = () => "default-user";

// Schemas moved to centralized location

// --- Routes ---

// Feed route for infinite scroll
const feedRoute = createRoute({
  method: "get",
  path: "/feed",
  summary: "Get templates feed",
  tags: ["Templates"],
  description:
    "Returns templates feed with cursor-based pagination for infinite scroll.",
  request: {
    query: FeedQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: FeedResponseSchema,
        },
      },
      description: "Templates feed",
    },
  },
});

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
            isFeatured: z.boolean().optional(),
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
                duration: z
                  .preprocess(
                    (val) => (typeof val === "string" ? Number(val) : val),
                    z.number().min(3).max(10)
                  )
                  .optional(),
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

// Search route
const searchRoute = createRoute({
  method: "get",
  path: "/search",
  summary: "Search templates",
  tags: ["Templates"],
  description: "Search templates by title, tags, or category",
  request: {
    query: SearchQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: SearchResponseSchema,
        },
      },
      description: "Search results",
    },
  },
});

// Bookmark routes
const addBookmarkRoute = createRoute({
  method: "post",
  path: "/{id}/bookmark",
  summary: "Add template to bookmarks",
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
          schema: BookmarkResponseSchema,
        },
      },
      description: "Template bookmarked",
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
});

const removeBookmarkRoute = createRoute({
  method: "delete",
  path: "/{id}/bookmark",
  summary: "Remove template from bookmarks",
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
          schema: BookmarkResponseSchema,
        },
      },
      description: "Bookmark removed",
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
});

import { validationHook } from "../utils/validation-hook";

export const templatesRouter = new OpenAPIHono({ defaultHook: validationHook });

// Feed handler
templatesRouter.openapi(feedRoute, async (c) => {
  const { type, limit, cursor, category, tags, sort } = c.req.valid("query");
  const userId = getUserId();

  // Build where clause based on feed type
  const where: Record<string, unknown> = {};

  switch (type) {
    case "trends":
      // Только отобранные в админке (isFeatured)
      where.isPublished = true;
      where.isFeatured = true;
      break;
    case "bookmarks": {
      // Только закладки пользователя
      const bookmarks = await prisma.templateBookmark.findMany({
        where: { userId },
        select: { templateId: true },
      });
      const bookmarkedIds = bookmarks.map((b) => b.templateId);
      where.id = { in: bookmarkedIds };
      where.isPublished = true;
      break;
    }
    case "community":
    default:
      // Все опубликованные
      where.isPublished = true;
      break;
  }

  if (category) {
    where.category = category;
  }

  if (tags) {
    const tagList = tags.split(",").map((t) => t.trim());
    where.tags = { hasSome: tagList };
  }

  // Cursor-based pagination
  if (cursor) {
    where.id =
      typeof where.id === "object"
        ? { ...where.id, lt: cursor }
        : { lt: cursor };
  }

  // Build orderBy based on sort
  let orderBy: Record<string, string>[];
  switch (sort) {
    case "popular":
      orderBy = [{ generationCount: "desc" }, { id: "desc" }];
      break;
    case "trending":
      orderBy = [
        { generationCount: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ];
      break;
    case "recent":
    default:
      orderBy = [{ createdAt: "desc" }, { id: "desc" }];
  }

  const templates = await prisma.template.findMany({
    where,
    take: limit + 1, // Fetch one extra to check hasMore
    orderBy,
    include: {
      reel: {
        select: {
          id: true,
          author: true,
          likeCount: true,
          thumbnailUrl: true,
          s3Key: true,
          localPath: true,
          hashtag: true,
          source: true,
        },
      },
      analysis: {
        select: {
          id: true,
          elements: true,
        },
      },
      bookmarks: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  const hasMore = templates.length > limit;
  const items = hasMore ? templates.slice(0, limit) : templates;
  const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

  return c.json({
    items: items.map((t) => {
      const elements =
        (t.analysis?.elements as Array<{
          id: string;
          type: "character" | "object" | "background";
          label: string;
        }>) ?? [];

      return {
        id: t.id,
        title: t.title,
        tags: t.tags,
        category: t.category,
        thumbnailUrl: t.reel?.thumbnailUrl ?? "",
        previewVideoUrl: t.reel
          ? (buildReelVideoUrl(t.reel) ?? undefined)
          : undefined,
        generationCount: t.generationCount,
        isBookmarked: t.bookmarks.length > 0,
        reel: {
          id: t.reel?.id ?? "",
          author: t.reel?.author ?? null,
          likeCount: t.reel?.likeCount ?? null,
        },
        elements: elements.slice(0, 5).map((el) => ({
          id: el.id,
          type: el.type,
          label: el.label,
        })),
      };
    }),
    nextCursor,
    hasMore,
  });
});

templatesRouter.openapi(listTemplatesRoute, async (c) => {
  const query = c.req.valid("query");
  // biome-ignore lint/suspicious/noExplicitAny: Prisma where clause dynamic building
  const where: Record<string, unknown> = {};

  if (query.category) {
    where.category = query.category;
  }
  if (query.tag) {
    where.tags = { has: query.tag };
  }
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
            tags: true,
            scenesCount: true,
            hasScenes: true,
            _count: {
              select: { videoElements: true },
            },
          },
        },
      },
    }),
    prisma.template.count({ where }),
  ]);

  // Transform to match schema
  const transformed = templates.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    analysis: t.analysis
      ? {
          id: t.analysis.id,
          tags: t.analysis.tags,
          elementsCount: t.analysis._count.videoElements,
        }
      : undefined,
  }));

  return c.json(
    { templates: transformed, total, limit: query.limit, offset: query.offset },
    200
  );
});

templatesRouter.openapi(getTemplateRoute, async (c) => {
  const { id } = c.req.valid("param");
  const template = await prisma.template.findUnique({
    where: { id },
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
        include: {
          generations: { orderBy: { createdAt: "desc" }, take: 10 },
          _count: {
            select: { videoElements: true },
          },
        },
      },
    },
  });

  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }

  // Transform to match schema
  const transformed = {
    ...template,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    analysis: template.analysis
      ? {
          id: template.analysis.id,
          tags: template.analysis.tags,
          elementsCount: template.analysis._count.videoElements,
        }
      : undefined,
  };

  return c.json({ template: transformed }, 200);
});

templatesRouter.openapi(updateTemplateRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { isPublished, isFeatured, ...rest } = c.req.valid("json");

  // Direct use of camelCase
  const data = {
    ...rest,
    ...(isPublished !== undefined && { isPublished }),
    ...(isFeatured !== undefined && { isFeatured }),
  };

  try {
    const template = await prisma.template.update({
      where: { id },
      data,
    });
    return c.json({ template }, 200);
  } catch (_e) {
    return c.json({ error: "Failed to update template" }, 404);
  }
});

templatesRouter.openapi(generateFromTemplateRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { customPrompt, options } = c.req.valid("json");

  // Direct use of camelCase options
  const mappedOptions = options
    ? {
        duration: options.duration,
        aspectRatio: options.aspectRatio,
        keepAudio: options.keepAudio,
      }
    : undefined;

  if (!isKlingConfigured()) {
    return c.json({ error: "Kling API is not configured" }, 400);
  }

  const template = await prisma.template.findUnique({
    where: { id },
    include: { analysis: true, reel: true },
  });

  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }

  // Use external S3 URL for Kling API (needs direct access to video file)
  const sourceVideoUrl = getExternalReelVideoUrl(template.reel);
  if (!sourceVideoUrl) {
    return c.json({ error: "No source video available" }, 400);
  }

  const prompt = customPrompt || "Based on @Video1, recreate this video.";
  const generationId = await videoGenJobQueue.startGeneration(
    template.analysisId,
    prompt,
    sourceVideoUrl,
    mappedOptions
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

  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }

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

// Search handler
templatesRouter.openapi(searchRoute, async (c) => {
  const { q, limit, offset } = c.req.valid("query");
  const userId = getUserId();

  // Search by title, tags, category, related reel fields and analysis tags
  const where = {
    isPublished: true,
    OR: [
      { title: { contains: q, mode: "insensitive" as const } },
      { tags: { hasSome: [q] } },
      { category: { contains: q, mode: "insensitive" as const } },
      { reel: { caption: { contains: q, mode: "insensitive" as const } } },
      { reel: { author: { contains: q, mode: "insensitive" as const } } },
      { reel: { hashtag: { contains: q, mode: "insensitive" as const } } },
      { analysis: { tags: { hasSome: [q] } } },
    ],
  };

  const [templates, total] = await Promise.all([
    prisma.template.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
      include: {
        reel: {
          select: {
            id: true,
            author: true,
            likeCount: true,
            thumbnailUrl: true,
            s3Key: true,
            localPath: true,
            hashtag: true,
            source: true,
          },
        },
        analysis: {
          select: {
            id: true,
            elements: true,
          },
        },
        bookmarks: {
          where: { userId },
          select: { id: true },
        },
      },
    }),
    prisma.template.count({ where }),
  ]);

  return c.json({
    items: templates.map((t) => {
      const elements =
        (t.analysis?.elements as Array<{
          id: string;
          type: "character" | "object" | "background";
          label: string;
        }>) ?? [];

      return {
        id: t.id,
        title: t.title,
        tags: t.tags,
        category: t.category,
        thumbnailUrl: t.reel?.thumbnailUrl ?? "",
        previewVideoUrl: t.reel
          ? (buildReelVideoUrl(t.reel) ?? undefined)
          : undefined,
        generationCount: t.generationCount,
        isBookmarked: t.bookmarks.length > 0,
        reel: {
          id: t.reel?.id ?? "",
          author: t.reel?.author ?? null,
          likeCount: t.reel?.likeCount ?? null,
        },
        elements: elements.slice(0, 5).map((el) => ({
          id: el.id,
          type: el.type,
          label: el.label,
        })),
      };
    }),
    total,
    query: q,
  });
});

// Bookmark handlers
templatesRouter.openapi(addBookmarkRoute, async (c) => {
  const { id } = c.req.valid("param");
  const userId = getUserId();

  // Check if template exists
  const template = await prisma.template.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }

  // Upsert bookmark (idempotent)
  await prisma.templateBookmark.upsert({
    where: {
      userId_templateId: { userId, templateId: id },
    },
    create: { userId, templateId: id },
    update: {},
  });

  return c.json({ bookmarked: true, templateId: id }, 200);
});

templatesRouter.openapi(removeBookmarkRoute, async (c) => {
  const { id } = c.req.valid("param");
  const userId = getUserId();

  // Check if template exists
  const template = await prisma.template.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }

  // Delete bookmark (if exists)
  await prisma.templateBookmark.deleteMany({
    where: { userId, templateId: id },
  });

  return c.json({ bookmarked: false, templateId: id }, 200);
});
