import prisma from "@trender/db";
import { Hono } from "hono";
import { getS3Key, s3Service } from "../services/s3";

const filesRouter = new Hono();

/**
 * Proxy reel video from S3
 * GET /api/files/reels/:id
 */
filesRouter.get("/reels/:id", async (c) => {
  const id = c.req.param("id");

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

/**
 * Proxy generated video from S3
 * GET /api/files/generations/:id
 */
filesRouter.get("/generations/:id", async (c) => {
  const id = c.req.param("id");

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

/**
 * Check if a file exists in S3
 * HEAD /api/files/reels/:id
 */
filesRouter.on("HEAD", "/reels/:id", async (c) => {
  const id = c.req.param("id");

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

/**
 * Check if a generation file exists in S3
 * HEAD /api/files/generations/:id
 */
filesRouter.on("HEAD", "/generations/:id", async (c) => {
  const id = c.req.param("id");

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

/**
 * Serve image reference from S3
 * GET /api/files/references/:filename
 *
 * Used for remix feature - images uploaded as references for Kling generation
 */
filesRouter.get("/references/:filename", async (c) => {
  const filename = c.req.param("filename");
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

/**
 * Check if a reference image exists in S3
 * HEAD /api/files/references/:filename
 */
filesRouter.on("HEAD", "/references/:filename", async (c) => {
  const filename = c.req.param("filename");
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
