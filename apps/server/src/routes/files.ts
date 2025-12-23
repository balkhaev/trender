import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import prisma from "@trender/db";
import {
  ErrorResponseSchema,
  FileStreamSchema,
  NotFoundResponseSchema,
} from "../schemas";
import { getS3Key, s3Service } from "../services/s3";

const filesRouter = new OpenAPIHono();

// ============================================
// ROUTE DEFINITIONS
// ============================================

const streamReelRoute = createRoute({
  method: "get",
  path: "/reels/{id}",
  summary: "Stream reel video",
  tags: ["Files"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description: "Video stream",
      content: {
        "video/mp4": {
          schema: FileStreamSchema,
        },
      },
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "File not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const headReelRoute = createRoute({
  method: "head",
  path: "/reels/{id}",
  summary: "Check reel video existence",
  tags: ["Files"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description: "File metadata",
    },
    404: {
      description: "File not found",
    },
  },
});

const streamGenerationRoute = createRoute({
  method: "get",
  path: "/generations/{id}",
  summary: "Stream generated video",
  tags: ["Files"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description: "Video stream",
      content: {
        "video/mp4": {
          schema: FileStreamSchema,
        },
      },
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "File not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const headGenerationRoute = createRoute({
  method: "head",
  path: "/generations/{id}",
  summary: "Check generated video existence",
  tags: ["Files"],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description: "File metadata",
    },
    404: {
      description: "File not found",
    },
  },
});

const streamReferenceRoute = createRoute({
  method: "get",
  path: "/references/{filename}",
  summary: "Stream reference image",
  tags: ["Files"],
  request: {
    params: z.object({
      filename: z.string().openapi({ param: { name: "filename", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description: "Image stream",
      content: {
        "image/*": {
          schema: FileStreamSchema,
        },
      },
    },
    404: {
      content: { "application/json": { schema: NotFoundResponseSchema } },
      description: "File not found",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "Server error",
    },
  },
});

const headReferenceRoute = createRoute({
  method: "head",
  path: "/references/{filename}",
  summary: "Check reference image existence",
  tags: ["Files"],
  request: {
    params: z.object({
      filename: z.string().openapi({ param: { name: "filename", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description: "File metadata",
    },
    404: {
      description: "File not found",
    },
  },
});

// ============================================
// ROUTE IMPLEMENTATIONS
// ============================================

filesRouter.openapi(streamReelRoute, async (c) => {
  const { id } = c.req.valid("param");

  // Look up reel to get s3Key
  const reel = await prisma.reel.findUnique({
    where: { id },
    select: { s3Key: true },
  });

  if (!reel) {
    return c.json({ error: "Reel not found" }, 404);
  }

  // Use s3Key from database or generate from id
  const s3Key = reel.s3Key || getS3Key("reels", id);

  try {
    const result = await s3Service.getFileStream(s3Key);

    if (!result) {
      return c.json({ error: "Video file not found in storage" }, 404);
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": result.metadata.contentType,
        "Content-Length": result.metadata.contentLength.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${id}.mp4"`,
      },
    });
  } catch (error) {
    console.error(`Error streaming reel ${id}:`, error);
    return c.json({ error: "Failed to stream video" }, 500);
  }
});

filesRouter.openapi(headReelRoute, async (c) => {
  const { id } = c.req.valid("param");

  const reel = await prisma.reel.findUnique({
    where: { id },
    select: { s3Key: true },
  });

  if (!reel) {
    return c.body(null, 404);
  }

  const s3Key = reel.s3Key || getS3Key("reels", id);

  try {
    const metadata = await s3Service.getFileMetadata(s3Key);

    if (!metadata) {
      return c.body(null, 404);
    }

    return c.body(null, 200, {
      "Content-Type": metadata.contentType,
      "Content-Length": metadata.contentLength.toString(),
    });
  } catch {
    return c.body(null, 500);
  }
});

filesRouter.openapi(streamGenerationRoute, async (c) => {
  const { id } = c.req.valid("param");

  // Look up generation to get s3Key
  const generation = await prisma.videoGeneration.findUnique({
    where: { id },
    select: { s3Key: true },
  });

  if (!generation) {
    return c.json({ error: "Generation not found" }, 404);
  }

  // Use s3Key from database or generate from id
  const s3Key = generation.s3Key || getS3Key("generations", id);

  try {
    const result = await s3Service.getFileStream(s3Key);

    if (!result) {
      return c.json({ error: "Video file not found in storage" }, 404);
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": result.metadata.contentType,
        "Content-Length": result.metadata.contentLength.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${id}.mp4"`,
      },
    });
  } catch (error) {
    console.error(`Error streaming generation ${id}:`, error);
    return c.json({ error: "Failed to stream video" }, 500);
  }
});

filesRouter.openapi(headGenerationRoute, async (c) => {
  const { id } = c.req.valid("param");

  const generation = await prisma.videoGeneration.findUnique({
    where: { id },
    select: { s3Key: true },
  });

  if (!generation) {
    return c.body(null, 404);
  }

  const s3Key = generation.s3Key || getS3Key("generations", id);

  try {
    const metadata = await s3Service.getFileMetadata(s3Key);

    if (!metadata) {
      return c.body(null, 404);
    }

    return c.body(null, 200, {
      "Content-Type": metadata.contentType,
      "Content-Length": metadata.contentLength.toString(),
    });
  } catch {
    return c.body(null, 500);
  }
});

filesRouter.openapi(streamReferenceRoute, async (c) => {
  const { filename } = c.req.valid("param");
  const s3Key = `references/${filename}`;

  try {
    const result = await s3Service.getFileStream(s3Key);

    if (!result) {
      return c.json({ error: "Reference image not found" }, 404);
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": result.metadata.contentType,
        "Content-Length": result.metadata.contentLength.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error(`Error streaming reference ${filename}:`, error);
    return c.json({ error: "Failed to stream image" }, 500);
  }
});

filesRouter.openapi(headReferenceRoute, async (c) => {
  const { filename } = c.req.valid("param");
  const s3Key = `references/${filename}`;

  try {
    const metadata = await s3Service.getFileMetadata(s3Key);

    if (!metadata) {
      return c.body(null, 404);
    }

    return c.body(null, 200, {
      "Content-Type": metadata.contentType,
      "Content-Length": metadata.contentLength.toString(),
    });
  } catch {
    return c.body(null, 500);
  }
});

export { filesRouter };
