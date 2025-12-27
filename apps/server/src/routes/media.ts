import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import prisma from "@trender/db";
import {
  ErrorResponseSchema,
  ExtendedPersonalMediaQuerySchema,
  ExtendedPersonalMediaResponseSchema,
  MediaUploadResponseSchema,
  NotFoundResponseSchema,
  StockMediaQuerySchema,
  StockMediaResponseSchema,
} from "../schemas";
import { getS3Key, isS3Configured, s3Service } from "../services/s3";
import { getMediaPublicUrl } from "../services/url-builder";
import { validationHook } from "../utils/validation-hook";

const app = new OpenAPIHono({ defaultHook: validationHook });

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

// ============================================
// GET /personal - Get user's media library
// ============================================

const personalMediaRoute = createRoute({
  method: "get",
  path: "/personal",
  summary: "Get personal media library",
  tags: ["Media"],
  description:
    "Returns user's uploaded and generated media files with filtering options.",
  request: {
    query: ExtendedPersonalMediaQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ExtendedPersonalMediaResponseSchema,
        },
      },
      description: "Media list",
    },
  },
});

app.openapi(personalMediaRoute, async (c) => {
  const { type, source, category, limit, offset } = c.req.valid("query");

  // TODO: Get userId from auth session
  const userId = "default-user";

  const where: {
    userId: string;
    type?: string;
    source?: string;
    category?: string;
  } = {
    userId,
  };

  if (type !== "all") {
    where.type = type;
  }
  if (source !== "all") {
    where.source = source;
  }
  if (category) {
    where.category = category;
  }

  const [items, total] = await Promise.all([
    prisma.userMedia.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.userMedia.count({ where }),
  ]);

  return c.json({
    items: items.map((item) => ({
      id: item.id,
      type: item.type as "image" | "video",
      url: item.url,
      thumbnailUrl: item.url, // TODO: Generate thumbnails
      filename: item.filename,
      size: item.size,
      width: item.width,
      height: item.height,
      duration: item.duration,
      mimeType: item.mimeType,
      createdAt: item.createdAt.toISOString(),
      source: (item.source || "upload") as "upload" | "generated",
      category: item.category,
      prompt: item.prompt,
      style: item.style,
    })),
    total,
    limit,
    offset,
  });
});

// ============================================
// POST /upload - Upload media to library
// ============================================

const uploadMediaRoute = createRoute({
  method: "post",
  path: "/upload",
  summary: "Upload media to library",
  tags: ["Media"],
  description: "Upload an image or video to personal media library.",
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.any().openapi({
              type: "string",
              format: "binary",
              description: "Image (max 20MB) or video (max 100MB) file",
            }),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: MediaUploadResponseSchema,
        },
      },
      description: "Media uploaded",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Invalid file",
    },
  },
});

app.openapi(uploadMediaRoute, async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!(file && file instanceof File)) {
      return c.json({ error: "File is required" }, 400);
    }

    const mimeType = file.type;
    const isImage = ALLOWED_IMAGE_TYPES.includes(mimeType);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(mimeType);

    if (!(isImage || isVideo)) {
      return c.json({ error: "Unsupported file type" }, 400);
    }

    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
    if (file.size > maxSize) {
      return c.json(
        { error: `File too large. Max ${maxSize / 1024 / 1024}MB` },
        400
      );
    }

    // TODO: Get userId from auth session
    const userId = "default-user";
    const mediaId = crypto.randomUUID();
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to S3
    if (!isS3Configured()) {
      return c.json({ error: "S3 storage not configured" }, 400);
    }

    const s3Key = getS3Key("media", `${userId}/${mediaId}`);
    await s3Service.uploadFile(s3Key, buffer, mimeType);

    const url = getMediaPublicUrl(s3Key);

    // TODO: Extract dimensions and duration
    const width = null;
    const height = null;
    const duration = null;

    // Save to database
    const media = await prisma.userMedia.create({
      data: {
        id: mediaId,
        userId,
        type: isImage ? "image" : "video",
        filename: file.name,
        s3Key,
        url,
        size: file.size,
        width,
        height,
        duration,
        mimeType,
      },
    });

    return c.json(
      {
        success: true,
        media: {
          id: media.id,
          type: media.type as "image" | "video",
          url: media.url,
          thumbnailUrl: media.url,
          filename: media.filename,
          size: media.size,
          width: media.width,
          height: media.height,
          duration: media.duration,
          mimeType: media.mimeType,
          createdAt: media.createdAt.toISOString(),
        },
      },
      201
    );
  } catch (error) {
    console.error("Media upload error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 400);
  }
});

// ============================================
// DELETE /{id} - Delete media
// ============================================

const deleteMediaRoute = createRoute({
  method: "delete",
  path: "/{id}",
  summary: "Delete media",
  tags: ["Media"],
  description: "Delete a media file from personal library.",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Media ID" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: "Media deleted",
    },
    404: {
      content: {
        "application/json": {
          schema: NotFoundResponseSchema,
        },
      },
      description: "Media not found",
    },
  },
});

app.openapi(deleteMediaRoute, async (c) => {
  const { id } = c.req.valid("param");

  // TODO: Get userId from auth session
  const userId = "default-user";

  const media = await prisma.userMedia.findFirst({
    where: { id, userId },
  });

  if (!media) {
    return c.json({ error: "Media not found" }, 404);
  }

  // Delete from S3
  if (media.s3Key && isS3Configured()) {
    try {
      await s3Service.deleteFile(media.s3Key);
    } catch (error) {
      console.error("Failed to delete from S3:", error);
    }
  }

  // Delete from database
  await prisma.userMedia.delete({ where: { id } });

  return c.json({ success: true }, 200);
});

// ============================================
// GET /stock - Get stock media
// ============================================

const stockMediaRoute = createRoute({
  method: "get",
  path: "/stock",
  summary: "Get stock media",
  tags: ["Media"],
  description: "Search stock images and videos.",
  request: {
    query: StockMediaQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: StockMediaResponseSchema,
        },
      },
      description: "Stock media list",
    },
  },
});

app.openapi(stockMediaRoute, async (c) => {
  // Query params available for future stock media integration
  c.req.valid("query");

  // TODO: Implement stock media integration (Pexels, Unsplash, etc.)
  // For now, return empty list with available categories

  const categories = [
    "nature",
    "people",
    "technology",
    "business",
    "food",
    "travel",
    "animals",
    "abstract",
  ];

  return c.json({
    items: [],
    total: 0,
    categories,
  });
});

export { app as mediaRouter };
