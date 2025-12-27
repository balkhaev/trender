/**
 * Video Download Service
 * Handles downloading videos from Instagram and storing them
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import prisma from "@trender/db";
import type { ReelStatus } from "@trender/db/enums";
import { services } from "../../config";
import { getDownloadsPath } from "../instagram/downloader";
import { pipelineLogger } from "../pipeline-logger";
import { getS3Key, isS3Configured, s3Service } from "../s3";

// Service URLs
const INSTALOADER_SERVICE_URL = services.scrapper;
const VIDEO_FRAMES_SERVICE_URL = services.videoFrames;

// Prisma types
type Reel = NonNullable<Awaited<ReturnType<typeof prisma.reel.findFirst>>>;

/**
 * Callbacks for progress updates during download
 */
export type DownloadProgressCallbacks = {
  updateStatus: (
    reelId: string,
    status: ReelStatus,
    errorMessage?: string
  ) => Promise<Reel>;
  updateProgress: (
    reelId: string,
    stage: string,
    percent: number,
    message: string
  ) => Promise<void>;
};

/**
 * Result of a video download operation
 */
export type DownloadResult = {
  /** S3 key if uploaded to S3, or local file path */
  path: string;
  /** Whether the video was uploaded to S3 */
  isS3: boolean;
  /** Size of the video in bytes */
  size: number;
};

/**
 * Result of normalize operation
 */
export type NormalizeResult = {
  buffer: Buffer;
  duration: number | null;
  wasResized: boolean;
  wasParNormalized: boolean;
};

/**
 * Normalize video for Kling API compatibility:
 * - Fix PAR to 1:1 (square pixels)
 * - Resize if needed (requires 720-2160px width)
 * Uses video-frames service /normalize endpoint
 */
export async function normalizeVideoIfNeeded(
  buffer: Buffer,
  reelId: string,
  callbacks?: Pick<DownloadProgressCallbacks, "updateProgress">
): Promise<NormalizeResult> {
  try {
    const formData = new FormData();
    formData.append(
      "video",
      new Blob([new Uint8Array(buffer)], { type: "video/mp4" }),
      "video.mp4"
    );
    formData.append("min_width", "720");
    formData.append("target_width", "1080");

    const response = await fetch(`${VIDEO_FRAMES_SERVICE_URL}/normalize`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[normalizeVideoIfNeeded] Failed: ${errorText}`);
      return {
        buffer,
        duration: null,
        wasResized: false,
        wasParNormalized: false,
      };
    }

    const wasResized = response.headers.get("X-Was-Resized") === "true";
    const wasParNormalized =
      response.headers.get("X-Was-PAR-Normalized") === "true";
    const originalWidth = response.headers.get("X-Original-Width");
    const newWidth = response.headers.get("X-New-Width");
    const originalPar = response.headers.get("X-Original-PAR");
    const durationHeader = response.headers.get("X-Video-Duration");
    const duration = durationHeader
      ? Math.round(Number.parseFloat(durationHeader))
      : null;

    if (callbacks?.updateProgress) {
      const changes: string[] = [];
      if (wasParNormalized) {
        changes.push(`PAR ${originalPar} → 1:1`);
      }
      if (wasResized) {
        changes.push(`${originalWidth}px → ${newWidth}px`);
      }
      if (changes.length > 0) {
        await callbacks.updateProgress(
          reelId,
          "download",
          60,
          `Видео нормализовано: ${changes.join(", ")}`
        );
      }
    }

    const normalizedBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(normalizedBuffer),
      duration,
      wasResized,
      wasParNormalized,
    };
  } catch (error) {
    console.error("[normalizeVideoIfNeeded] Error:", error);
    return {
      buffer,
      duration: null,
      wasResized: false,
      wasParNormalized: false,
    };
  }
}

/**
 * @deprecated Use normalizeVideoIfNeeded instead
 * Kept for backward compatibility
 */
export async function resizeVideoIfNeeded(
  buffer: Buffer,
  reelId: string,
  callbacks?: Pick<DownloadProgressCallbacks, "updateProgress">
): Promise<{ buffer: Buffer; duration: number | null }> {
  const result = await normalizeVideoIfNeeded(buffer, reelId, callbacks);
  return { buffer: result.buffer, duration: result.duration };
}

/**
 * Fetch metadata for a reel from Instagram
 */
async function fetchReelMetadata(reelId: string): Promise<{
  caption?: string;
  commentCount?: number;
  likeCount?: number;
  viewCount?: number;
  author?: string;
  thumbnailUrl?: string;
  duration?: number;
} | null> {
  try {
    const response = await fetch(`${INSTALOADER_SERVICE_URL}/metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcode: reelId }),
    });

    if (!response.ok) {
      return null;
    }

    const metadata = (await response.json()) as {
      success: boolean;
      caption?: string;
      commentCount?: number;
      likeCount?: number;
      viewCount?: number;
      author?: string;
      thumbnailUrl?: string;
      duration?: number;
    };

    return metadata.success ? metadata : null;
  } catch {
    return null;
  }
}

/**
 * Download video file from Instagram
 */
async function downloadVideoFromInstagram(reelId: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000); // 2min timeout

  try {
    const response = await fetch(`${INSTALOADER_SERVICE_URL}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcode: reelId }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("video/mp4")) {
      const errorData = (await response.json()) as { error?: string };
      throw new Error(errorData.error || `Download failed: ${response.status}`);
    }

    const videoBuffer = await response.arrayBuffer();
    return Buffer.from(videoBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Download a reel video
 * Handles metadata fetching, video downloading, resizing, and storage (S3 or local)
 */
export async function downloadReel(
  reelId: string,
  callbacks: DownloadProgressCallbacks
): Promise<DownloadResult> {
  const reel = await prisma.reel.findUnique({ where: { id: reelId } });
  if (!reel) {
    throw new Error(`Reel ${reelId} not found`);
  }

  // Update status and progress
  await callbacks.updateStatus(reelId, "downloading");
  await callbacks.updateProgress(
    reelId,
    "download",
    0,
    "Начало загрузки видео..."
  );

  const timer = pipelineLogger.startTimer(
    reelId,
    "download",
    "Downloading video"
  );

  try {
    // Get output directory
    const folder = reel.hashtag || reel.source;
    const outputDir = getDownloadsPath(folder);
    const filename = `${reelId}.mp4`;
    const filepath = join(outputDir, filename);

    // Fetch metadata
    await callbacks.updateProgress(
      reelId,
      "download",
      5,
      "Получение метаданных..."
    );
    const metadata = await fetchReelMetadata(reelId);
    let metadataDuration: number | null = null;

    if (metadata) {
      if (typeof metadata.duration === "number" && metadata.duration > 0) {
        metadataDuration = metadata.duration;
      }
      await prisma.reel.update({
        where: { id: reelId },
        data: {
          caption: metadata.caption ?? null,
          commentCount: metadata.commentCount ?? null,
          likeCount: metadata.likeCount ?? null,
          viewCount: metadata.viewCount ?? null,
          author: metadata.author ?? null,
          thumbnailUrl: metadata.thumbnailUrl ?? null,
          ...(metadataDuration && { duration: metadataDuration }),
        },
      });
    }

    // Download video
    await callbacks.updateProgress(
      reelId,
      "download",
      15,
      "Скачивание видео..."
    );
    let buffer = await downloadVideoFromInstagram(reelId);

    await callbacks.updateProgress(
      reelId,
      "download",
      50,
      "Получение видео..."
    );

    // Normalize video (PAR fix + resize) for Kling API
    await callbacks.updateProgress(
      reelId,
      "download",
      55,
      "Нормализация видео..."
    );
    const normalizeResult = await normalizeVideoIfNeeded(
      buffer,
      reelId,
      callbacks
    );
    buffer = normalizeResult.buffer;

    // Use duration from metadata, fallback to duration from normalize (ffprobe)
    const duration = metadataDuration || normalizeResult.duration;
    if (duration) {
      console.log(
        `  ✓ Video duration: ${duration}s (source: ${metadataDuration ? "metadata" : "ffprobe"})`
      );
    }

    const s3Key = getS3Key("reels", reelId);
    const videoSize = buffer.length;

    await callbacks.updateProgress(
      reelId,
      "download",
      70,
      `Видео загружено (${(videoSize / 1024 / 1024).toFixed(1)} MB)`
    );

    // Try S3 upload first
    if (isS3Configured()) {
      try {
        await callbacks.updateProgress(
          reelId,
          "uploading",
          80,
          "Загрузка в облачное хранилище..."
        );

        await s3Service.uploadFile(s3Key, buffer, "video/mp4");

        await prisma.reel.update({
          where: { id: reelId },
          data: {
            status: "downloaded",
            s3Key,
            localPath: null,
            progress: 100,
            progressStage: "download",
            progressMessage: "Загрузка завершена",
            lastActivityAt: new Date(),
            ...(duration && { duration }),
          },
        });

        await timer.stop("Video downloaded and uploaded to S3", {
          fileSize: videoSize,
          s3Key,
          duration,
        });

        return { path: s3Key, isS3: true, size: videoSize };
      } catch {
        // Fall through to local storage
      }
    }

    // Fall back to local storage
    await callbacks.updateProgress(
      reelId,
      "download",
      90,
      "Сохранение на диск..."
    );

    await mkdir(outputDir, { recursive: true });
    await writeFile(filepath, buffer);

    await prisma.reel.update({
      where: { id: reelId },
      data: {
        status: "downloaded",
        localPath: filepath,
        progress: 100,
        progressStage: "download",
        progressMessage: "Загрузка завершена",
        lastActivityAt: new Date(),
        ...(duration && { duration }),
      },
    });

    await timer.stop("Video downloaded successfully", {
      fileSize: videoSize,
      filePath: filepath,
      duration,
    });

    return { path: filepath, isS3: false, size: videoSize };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    await callbacks.updateProgress(
      reelId,
      "download",
      0,
      `Ошибка: ${err.message}`
    );
    await timer.fail(err);
    await callbacks.updateStatus(reelId, "failed", err.message);
    throw err;
  }
}

/**
 * Video Download Service singleton
 */
class VideoDownloadService {
  async downloadReel(
    reelId: string,
    callbacks: DownloadProgressCallbacks
  ): Promise<DownloadResult> {
    return downloadReel(reelId, callbacks);
  }

  async normalizeVideoIfNeeded(
    buffer: Buffer,
    reelId: string,
    callbacks?: Pick<DownloadProgressCallbacks, "updateProgress">
  ): Promise<NormalizeResult> {
    return normalizeVideoIfNeeded(buffer, reelId, callbacks);
  }

  /**
   * @deprecated Use normalizeVideoIfNeeded instead
   */
  async resizeVideoIfNeeded(
    buffer: Buffer,
    reelId: string,
    callbacks?: Pick<DownloadProgressCallbacks, "updateProgress">
  ): Promise<{ buffer: Buffer; duration: number | null }> {
    return resizeVideoIfNeeded(buffer, reelId, callbacks);
  }
}

export const videoDownloadService = new VideoDownloadService();
