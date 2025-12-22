import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import prisma from "@trender/db";
import { computeTagTrends } from "../lib/tag-trends";
import {
  ErrorResponseSchema,
  UnauthorizedResponseSchema,
} from "../schemas/openapi";

const tagsQuerySchema = z.object({
  hours: z.coerce
    .number()
    .int()
    .min(1)
    .max(168)
    .default(24)
    .openapi({ param: { name: "hours", in: "query" } }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .openapi({ param: { name: "limit", in: "query" } }),
});

const getTagTrendsRoute = createRoute({
  method: "get",
  path: "/tags",
  summary: "Get trending tags",
  tags: ["Analytics"],
  request: {
    query: tagsQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            windowHours: z.number(),
            videosAnalyzed: z.number(),
            tags: z.array(
              z.object({
                tag: z.string(),
                count: z.number(),
                percentage: z.number(),
              })
            ),
          }),
        },
      },
      description: "Trending tags data retrieved successfully",
    },
    401: {
      content: {
        "application/json": {
          schema: UnauthorizedResponseSchema,
        },
      },
      description: "Unauthorized access",
    },
    500: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Internal server error occurred while calculating trends",
    },
  },
  security: [{ BearerAuth: [] }],
});

export const trendsRouter = new OpenAPIHono();

trendsRouter.openapi(getTagTrendsRoute, async (c) => {
  const query = c.req.valid("query");
  const windowStart = new Date(Date.now() - query.hours * 60 * 60 * 1000);

  const analyses = await prisma.videoAnalysis.findMany({
    where: {
      sourceType: "reel",
      createdAt: { gte: windowStart },
    },
    select: { tags: true },
  });

  const trends = computeTagTrends(analyses).slice(0, query.limit);

  return c.json(
    {
      windowHours: query.hours,
      videosAnalyzed: analyses.length,
      tags: trends,
    },
    200
  );
});
