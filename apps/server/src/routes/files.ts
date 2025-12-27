import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import prisma from "@trender/db";
import {
  ErrorResponseSchema,
  FileStreamSchema,
  NotFoundResponseSchema,
} from "../schemas";
import { getGenerationsPath } from "../services/queues/video-gen-queue";
import { getS3Key, type RangeStreamResult, s3Service } from "../services/s3";

/**
 * Helper to create video response with Range support (required for iOS)
 */
function createVideoResponse(
  result: RangeStreamResult,
  filename: string,
  rangeHeader?: string
): Response {
  const headers: Record<string, string> = {
    "Content-Type": result.metadata.contentType,
    "Content-Length": result.metadata.contentLength.toString(),
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Disposition": `inline; filename="${filename}"`,
  };

  // If Range was requested, return 206 Partial Content
  if (rangeHeader) {
    headers["Content-Range"] =
      `bytes ${result.range.start}-${result.range.end}/${result.range.total}`;
    return new Response(result.stream, { status: 206, headers });
  }

  return new Response(result.stream, { headers });
}

/**
 * Helper to create video response from local file with Range support
 */
async function createLocalVideoResponse(
  filePath: string,
  filename: string,
  rangeHeader?: string
): Promise<Response> {
  const fileStat = await stat(filePath);
  const totalSize = fileStat.size;

  let start = 0;
  let end = totalSize - 1;

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      start = match[1] ? Number.parseInt(match[1], 10) : 0;
      end = match[2] ? Number.parseInt(match[2], 10) : totalSize - 1;
      end = Math.min(end, totalSize - 1);
    }
  }

  const chunkSize = end - start + 1;
  const fileStream = createReadStream(filePath, { start, end });
  const webStream = Readable.toWeb(fileStream) as unknown as ReadableStream;

  const headers: Record<string, string> = {
    "Content-Type": "video/mp4",
    "Content-Length": chunkSize.toString(),
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Disposition": `inline; filename="${filename}"`,
  };

  if (rangeHeader) {
    headers["Content-Range"] = `bytes ${start}-${end}/${totalSize}`;
    return new Response(webStream, { status: 206, headers });
  }

  return new Response(webStream, { headers });
}

const filesRouter = new OpenAPIHono();

// ============================================
// ROUTE DEFINITIONS
// ============================================

const streamReelRoute = createRoute({
  method: "get",
  path: "/reels/{filename}",
  summary: "Stream reel video",
  tags: ["Files"],
  request: {
    params: z.object({
      filename: z.string().openapi({ param: { name: "filename", in: "path" } }),
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
  path: "/reels/{filename}",
  summary: "Check reel video existence",
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

const streamGenerationRoute = createRoute({
  method: "get",
  path: "/generations/{filename}",
  summary: "Stream generated video",
  tags: ["Files"],
  request: {
    params: z.object({
      filename: z.string().openapi({ param: { name: "filename", in: "path" } }),
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
  path: "/generations/{filename}",
  summary: "Check generated video existence",
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

const streamMediaRoute = createRoute({
  method: "get",
  path: "/media/*",
  summary: "Stream media file by S3 key",
  tags: ["Files"],
  request: {},
  responses: {
    200: {
      description: "Media stream",
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

// ============================================
// ROUTE IMPLEMENTATIONS
// ============================================

/**
 * Извлекает id из filename, убирая расширение
 * "abc123.mp4" -> "abc123"
 * "abc123" -> "abc123"
 */
function extractIdFromFilename(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
}

filesRouter.openapi(streamReelRoute, async (c) => {
  const { filename } = c.req.valid("param");
  const id = extractIdFromFilename(filename);
  const rangeHeader = c.req.header("Range");

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
    const result = await s3Service.getFileStreamWithRange(s3Key, rangeHeader);

    if (!result) {
      return c.json({ error: "Video file not found in storage" }, 404);
    }

    return createVideoResponse(result, `${id}.mp4`, rangeHeader);
  } catch (error) {
    console.error(`Error streaming reel ${id}:`, error);
    return c.json({ error: "Failed to stream video" }, 500);
  }
});

filesRouter.openapi(headReelRoute, async (c) => {
  const { filename } = c.req.valid("param");
  const id = extractIdFromFilename(filename);

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
      "Accept-Ranges": "bytes",
    });
  } catch {
    return c.body(null, 500);
  }
});

filesRouter.openapi(streamGenerationRoute, async (c) => {
  const { filename } = c.req.valid("param");
  const id = extractIdFromFilename(filename);
  const rangeHeader = c.req.header("Range");

  // Look up generation to get s3Key
  const generation = await prisma.videoGeneration.findUnique({
    where: { id },
    select: { s3Key: true, status: true, videoUrl: true },
  });

  if (!generation) {
    console.log(`[Files] Generation ${id} not found in DB`);
    return c.json({ error: "Generation not found" }, 404);
  }

  console.log(
    `[Files] Generation ${id}: status=${generation.status}, s3Key=${generation.s3Key}, videoUrl=${generation.videoUrl}`
  );

  // Try S3 first if s3Key exists
  if (generation.s3Key) {
    try {
      const result = await s3Service.getFileStreamWithRange(
        generation.s3Key,
        rangeHeader
      );
      if (result) {
        return createVideoResponse(result, `${id}.mp4`, rangeHeader);
      }
      console.log(`[Files] S3 file not found: ${generation.s3Key}`);
    } catch (s3Error) {
      console.error(`[Files] S3 error for ${id}:`, s3Error);
    }
  }

  // Fallback to local file
  const localPath = getGenerationsPath(`${id}.mp4`);
  if (existsSync(localPath)) {
    console.log(`[Files] Serving from local: ${localPath}`);
    try {
      return await createLocalVideoResponse(
        localPath,
        `${id}.mp4`,
        rangeHeader
      );
    } catch (localError) {
      console.error(`[Files] Local file error for ${id}:`, localError);
    }
  }

  // Fallback to redirect if videoUrl is external
  if (
    generation.videoUrl &&
    (generation.videoUrl.startsWith("http://") ||
      generation.videoUrl.startsWith("https://"))
  ) {
    console.log(`[Files] Redirecting to external URL: ${generation.videoUrl}`);
    return c.redirect(generation.videoUrl, 302);
  }

  return c.json({ error: "Video file not found" }, 404);
});

filesRouter.openapi(headGenerationRoute, async (c) => {
  const { filename } = c.req.valid("param");
  const id = extractIdFromFilename(filename);

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
      "Accept-Ranges": "bytes",
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

filesRouter.openapi(streamMediaRoute, async (c) => {
  // Extract s3Key from wildcard path: /api/files/media/* 
  // e.g., /api/files/media/media/default-user/file.jpg -> media/default-user/file.jpg
  const fullPath = c.req.path;
  const s3Key = decodeURIComponent(fullPath.replace(/^\/api\/files\/media\//, ''));

  try {
    const result = await s3Service.getFileStream(s3Key);

    if (!result) {
      return c.json({ error: "Media file not found" }, 404);
    }
    
    return new Response(result.stream, {
      headers: {
        "Content-Type": result.metadata.contentType,
        "Content-Length": result.metadata.contentLength.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error(`Error streaming media ${s3Key}:`, error);
    return c.json({ error: "Failed to stream media" }, 500);
  }
});

export { filesRouter };
