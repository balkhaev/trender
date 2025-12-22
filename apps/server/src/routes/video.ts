import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import prisma from "@trender/db";
import { Hono } from "hono";
import { getGeminiService, type VideoAnalysis } from "../services/gemini";
import { getDownloadsPath } from "../services/instagram/downloader";
import { isKlingConfigured } from "../services/kling";
import { getOpenAIService, isOpenAIConfigured } from "../services/openai";
import { getVideoGenerationsPath, videoGenJobQueue } from "../services/queues";
import { getS3Key, isS3Configured, s3Service } from "../services/s3";

declare const Bun: {
  file(path: string): Blob;
};

const video = new Hono();

const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/mpeg",
  "video/mov",
  "video/avi",
  "video/x-flv",
  "video/mpg",
  "video/webm",
  "video/wmv",
  "video/3gpp",
  "video/quicktime",
];

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB for images

// Helper to save analysis to database with extended fields
function saveAnalysis(
  analysis: VideoAnalysis,
  sourceType: string,
  sourceId?: string,
  fileName?: string
) {
  return prisma.videoAnalysis.create({
    data: {
      sourceType,
      sourceId,
      fileName,
      duration: analysis.duration,
      aspectRatio: analysis.aspectRatio,
      elements: analysis.elements,
    },
  });
}

video.post("/analyze", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("video");

    if (!(file && file instanceof File)) {
      return c.json({ error: "Video file is required" }, 400);
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return c.json(
        {
          error: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
        },
        400
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return c.json(
        {
          error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        400
      );
    }

    const geminiService = getGeminiService();
    const buffer = Buffer.from(await file.arrayBuffer());
    const analysis = await geminiService.processVideo(
      buffer,
      file.type,
      file.name
    );

    // Save to database
    const saved = await saveAnalysis(analysis, "upload", undefined, file.name);

    return c.json({
      success: true,
      analysis,
      analysisId: saved.id,
    });
  } catch (error) {
    console.error("Video analysis error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

// Enchanting анализ: Gemini определяет элементы, ChatGPT генерирует варианты
video.post("/analyze-enchanting", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("video");

    if (!(file && file instanceof File)) {
      return c.json({ error: "Video file is required" }, 400);
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return c.json(
        {
          error: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
        },
        400
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return c.json(
        {
          error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        400
      );
    }

    // Проверяем что OpenAI настроен
    if (!isOpenAIConfigured()) {
      return c.json(
        {
          error:
            "OpenAI API is not configured. Set OPENAI_API_KEY environment variable.",
        },
        500
      );
    }

    const geminiService = getGeminiService();
    const openaiService = getOpenAIService();
    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. Gemini анализирует видео и возвращает только элементы
    const elementsAnalysis = await geminiService.processVideoElementsOnly(
      buffer,
      file.type,
      file.name
    );

    // 2. ChatGPT генерирует варианты для каждого элемента
    const enchantingResults = await openaiService.generateEnchantingOptions(
      elementsAnalysis.elements
    );

    // 3. Объединяем элементы с вариантами
    const elementsWithOptions: Array<{
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
    }> = elementsAnalysis.elements.map((element) => {
      const enchantingResult = enchantingResults.find(
        (r) => r.id === element.id
      );
      return {
        id: element.id,
        type: element.type,
        label: element.label,
        description: element.description,
        remixOptions: enchantingResult?.remixOptions || [],
      };
    });

    const analysis: VideoAnalysis = {
      duration: elementsAnalysis.duration,
      aspectRatio: elementsAnalysis.aspectRatio,
      elements: elementsWithOptions,
    };

    // Save to database with enchanting mode marker
    const saved = await prisma.videoAnalysis.create({
      data: {
        sourceType: "upload",
        analysisType: "enchanting",
        fileName: file.name,
        duration: analysis.duration,
        aspectRatio: analysis.aspectRatio,
        elements: analysis.elements,
      },
    });

    return c.json({
      success: true,
      analysis,
      analysisId: saved.id,
      mode: "enchanting",
    });
  } catch (error) {
    console.error("Enchanting analysis error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

video.post("/analyze-downloaded", async (c) => {
  try {
    const body = await c.req.json();
    const { hashtag, filename } = body as { hashtag: string; filename: string };

    if (!(hashtag && filename)) {
      return c.json({ error: "hashtag and filename are required" }, 400);
    }

    if (!filename.endsWith(".mp4")) {
      return c.json({ error: "Only .mp4 files are supported" }, 400);
    }

    const filepath = join(getDownloadsPath(hashtag), filename);

    try {
      const fileStat = await stat(filepath);
      if (!fileStat.isFile()) {
        return c.json({ error: "File not found" }, 404);
      }

      if (fileStat.size > MAX_FILE_SIZE) {
        return c.json(
          {
            error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          },
          400
        );
      }
    } catch {
      return c.json({ error: "File not found" }, 404);
    }

    const buffer = await readFile(filepath);
    const geminiService = getGeminiService();
    const analysis = await geminiService.processVideo(
      buffer,
      "video/mp4",
      filename
    );

    // Save to database
    const saved = await saveAnalysis(analysis, "download", undefined, filename);

    return c.json({
      success: true,
      analysis,
      analysisId: saved.id,
    });
  } catch (error) {
    console.error("Downloaded video analysis error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

// Analyze reel by URL (fetches video and analyzes)
video.post("/analyze-reel", async (c) => {
  try {
    const body = await c.req.json();
    const { reelId, url } = body as { reelId: string; url: string };

    if (!(reelId && url)) {
      return c.json({ error: "reelId and url are required" }, 400);
    }

    // Get reel from database to check for videoUrl
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });

    if (!reel) {
      return c.json({ error: "Reel not found in database" }, 404);
    }

    // If we have a local video file, use it
    const downloadsDir = getDownloadsPath(reel.source);
    let localFile: string | null = null;

    try {
      const files = await readdir(downloadsDir);
      const matchingFile = files.find(
        (f) => f.includes(reelId) && f.endsWith(".mp4")
      );
      if (matchingFile) {
        localFile = join(downloadsDir, matchingFile);
      }
    } catch {
      // Directory doesn't exist
    }

    let buffer: Buffer;

    if (localFile) {
      // Use local file
      buffer = await readFile(localFile);
    } else if (reel.videoUrl) {
      // Download from videoUrl
      const response = await fetch(reel.videoUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Referer: "https://www.instagram.com/",
        },
      });

      if (!response.ok) {
        return c.json(
          { error: `Failed to fetch video: ${response.status}` },
          400
        );
      }

      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      return c.json(
        {
          error:
            "No video available. Video URL is not saved for this reel. Try scraping again.",
        },
        400
      );
    }

    if (Buffer.byteLength(buffer) > MAX_FILE_SIZE) {
      return c.json(
        {
          error: `Video too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        400
      );
    }

    const geminiService = getGeminiService();
    const analysis = await geminiService.processVideo(
      buffer,
      "video/mp4",
      `${reelId}.mp4`
    );

    // Save to database
    const saved = await saveAnalysis(analysis, "reel", reelId, `${reelId}.mp4`);

    return c.json({
      success: true,
      analysis,
      analysisId: saved.id,
    });
  } catch (error) {
    console.error("Reel analysis error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

// Generation options type
type GenerateRequestBody = {
  analysisId: string;
  prompt: string; // Change prompt - what to modify in the video
  sourceVideoUrl: string; // Source video URL for video-to-video
  options?: {
    duration?: 5 | 10;
    aspectRatio?: "16:9" | "9:16" | "1:1" | "auto";
    keepAudio?: boolean;
  };
};

// Start video generation (Kling video-to-video)
video.post("/generate", async (c) => {
  try {
    const body = (await c.req.json()) as GenerateRequestBody;
    const { analysisId, prompt, sourceVideoUrl, options } = body;

    if (!analysisId) {
      return c.json({ error: "analysisId is required" }, 400);
    }

    if (!prompt) {
      return c.json({ error: "prompt is required" }, 400);
    }

    if (!sourceVideoUrl) {
      return c.json(
        { error: "sourceVideoUrl is required for video-to-video generation" },
        400
      );
    }

    // Check Kling API is configured
    if (!isKlingConfigured()) {
      return c.json(
        {
          error:
            "Kling API is not configured. Set KLING_ACCESS_KEY and KLING_SECRET_KEY.",
        },
        500
      );
    }

    // Check analysis exists
    const analysis = await prisma.videoAnalysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      return c.json({ error: "Analysis not found" }, 404);
    }

    // Add to video generation queue
    const generationId = await videoGenJobQueue.startGeneration(
      analysisId,
      prompt,
      sourceVideoUrl,
      options
    );

    return c.json({
      success: true,
      generationId,
    });
  } catch (error) {
    console.error("Video generation error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

// Update analysis (for Pro mode editing)
video.patch("/analysis/:id", async (c) => {
  try {
    const { id } = c.req.param();
    const body = await c.req.json();

    const analysis = await prisma.videoAnalysis.findUnique({
      where: { id },
    });

    if (!analysis) {
      return c.json({ error: "Analysis not found" }, 404);
    }

    // Allow updating all editable fields
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "subject",
      "action",
      "environment",
      "cameraStyle",
      "mood",
      "colorPalette",
      "style",
      "duration",
      "aspectRatio",
      "scenes",
      "characters",
      "objects",
      "cameraMovements",
      "lighting",
      "transitions",
      "audio",
      "textOverlays",
      "pacing",
      "klingPrompt",
      "tags",
    ];

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    const updated = await prisma.videoAnalysis.update({
      where: { id },
      data: updateData,
    });

    return c.json({
      success: true,
      analysis: updated,
    });
  } catch (error) {
    console.error("Update analysis error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

// Get generation status
video.get("/generation/:id", async (c) => {
  try {
    const { id } = c.req.param();

    const generation = await prisma.videoGeneration.findUnique({
      where: { id },
      include: {
        analysis: true,
      },
    });

    if (!generation) {
      return c.json({ error: "Generation not found" }, 404);
    }

    return c.json({
      success: true,
      generation,
    });
  } catch (error) {
    console.error("Get generation error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

// Get generation logs (from source reel)
video.get("/generation/:id/logs", async (c) => {
  try {
    const { id } = c.req.param();

    const generation = await prisma.videoGeneration.findUnique({
      where: { id },
      include: {
        analysis: {
          select: { sourceId: true },
        },
      },
    });

    if (!generation) {
      return c.json({ error: "Generation not found" }, 404);
    }

    // If we have a source reel, get its logs
    let logs: {
      id: string;
      level: string;
      stage: string;
      message: string;
      createdAt: Date;
    }[] = [];

    if (generation.analysis?.sourceId) {
      logs = await prisma.reelLog.findMany({
        where: { reelId: generation.analysis.sourceId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          level: true,
          stage: true,
          message: true,
          createdAt: true,
        },
      });
    }

    return c.json({
      success: true,
      generation: {
        id: generation.id,
        status: generation.status,
        progress: generation.progress,
        progressStage: generation.progressStage,
        progressMessage: generation.progressMessage,
        klingProgress: generation.klingProgress,
        lastActivityAt: generation.lastActivityAt,
      },
      logs,
    });
  } catch (error) {
    console.error("Get generation logs error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

// Download generated video file
video.get("/generation/:id/download", async (c) => {
  try {
    const { id } = c.req.param();

    const generation = await prisma.videoGeneration.findUnique({
      where: { id },
    });

    if (!generation) {
      return c.json({ error: "Generation not found" }, 404);
    }

    if (generation.status !== "completed") {
      return c.json({ error: "Video not ready yet" }, 400);
    }

    const filename = `${id}.mp4`;

    // Try S3 first if s3Key is set
    if (generation.s3Key) {
      try {
        const result = await s3Service.getFileStream(generation.s3Key);
        if (result) {
          return new Response(result.stream, {
            headers: {
              "Content-Type": result.metadata.contentType,
              "Content-Length": result.metadata.contentLength.toString(),
              "Content-Disposition": `inline; filename="${filename}"`,
              "Cache-Control": "public, max-age=31536000",
            },
          });
        }
      } catch (s3Error) {
        console.error("S3 download failed, trying local:", s3Error);
      }
    }

    // Fall back to local file
    const filepath = getVideoGenerationsPath(filename);

    if (!existsSync(filepath)) {
      // If no local file and we have external videoUrl - redirect
      if (generation.videoUrl && !generation.videoUrl.startsWith("/api/")) {
        return c.redirect(generation.videoUrl);
      }
      return c.json({ error: "Video file not found" }, 404);
    }

    const fileStat = await stat(filepath);
    const file = Bun.file(filepath);

    return new Response(file, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": fileStat.size.toString(),
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error) {
    console.error("Download generation error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

// List all analyses
video.get("/analyses", async (c) => {
  try {
    const limit = Number(c.req.query("limit")) || 50;
    const offset = Number(c.req.query("offset")) || 0;

    const [analyses, total] = await Promise.all([
      prisma.videoAnalysis.findMany({
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: {
          generations: {
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      prisma.videoAnalysis.count(),
    ]);

    return c.json({
      success: true,
      analyses,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("List analyses error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

// List all generations
video.get("/generations", async (c) => {
  try {
    const limit = Number(c.req.query("limit")) || 50;
    const offset = Number(c.req.query("offset")) || 0;
    const status = c.req.query("status");

    const where = status ? { status } : {};

    const [generations, total] = await Promise.all([
      prisma.videoGeneration.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: {
          analysis: true,
        },
      }),
      prisma.videoGeneration.count({ where }),
    ]);

    return c.json({
      success: true,
      generations,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("List generations error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

// Get single analysis
video.get("/analysis/:id", async (c) => {
  try {
    const { id } = c.req.param();

    const analysis = await prisma.videoAnalysis.findUnique({
      where: { id },
      include: {
        generations: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!analysis) {
      return c.json({ error: "Analysis not found" }, 404);
    }

    return c.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error("Get analysis error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

// Upload image reference for remix generation
video.post("/upload-reference", async (c) => {
  try {
    // Check S3 is configured
    if (!isS3Configured()) {
      return c.json(
        {
          error:
            "S3 storage is not configured. Cannot upload image references.",
        },
        500
      );
    }

    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!(file && file instanceof File)) {
      return c.json({ error: "Image file is required" }, 400);
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return c.json(
        {
          error: `Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
        },
        400
      );
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return c.json(
        {
          error: `File too large. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`,
        },
        400
      );
    }

    // Generate unique ID for this reference image
    const imageId = crypto.randomUUID();
    const extension = file.type.split("/")[1] || "jpg";
    const s3Key = getS3Key("references", `${imageId}.${extension}`);

    // Upload to S3
    const buffer = Buffer.from(await file.arrayBuffer());
    await s3Service.uploadFile(s3Key, buffer, file.type);

    // Return the URL that can be used in Kling API
    // For now, we return the internal API path that can serve the file
    const url = `/api/files/references/${imageId}.${extension}`;

    return c.json({
      success: true,
      url,
      s3Key,
      imageId,
    });
  } catch (error) {
    console.error("Upload reference error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json({ error: message }, 500);
  }
});

export { video };
