import { exec } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import prisma from "@trender/db";
import { getS3Key, isS3Configured, s3Service } from "../s3";
import type { Reel } from "./types";

const execAsync = promisify(exec);

// В Docker используем DATA_DIR, локально - относительный путь
const DATA_DIR = process.env.DATA_DIR || join(import.meta.dir, "../../../data");
const DOWNLOADS_DIR = join(DATA_DIR, "downloads");

// Python instaloader service URL
const INSTALOADER_SERVICE_URL =
  process.env.SCRAPPER_SERVICE_URL ||
  process.env.INSTALOADER_SERVICE_URL ||
  "http://localhost:8001";

// Rate limiting configuration
const DOWNLOAD_DELAY_MS = 5000; // 5 seconds between downloads
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 30_000; // 30 seconds initial retry delay

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get video duration in seconds using ffprobe
 */
async function getVideoDuration(filepath: string): Promise<number | null> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filepath}"`
    );
    const duration = Number.parseFloat(stdout.trim());
    if (!Number.isNaN(duration) && duration > 0) {
      return Math.round(duration);
    }
    return null;
  } catch (error) {
    console.error("  Failed to get video duration:", error);
    return null;
  }
}

function isRateLimitError(error: string): boolean {
  const rateLimitPatterns = [
    "401",
    "429",
    "wait a few minutes",
    "Please wait",
    "rate limit",
    "too many requests",
  ];
  const lowerError = error.toLowerCase();
  return rateLimitPatterns.some((pattern) =>
    lowerError.includes(pattern.toLowerCase())
  );
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

type DownloadResult = {
  success: boolean;
  filename?: string;
  buffer?: Buffer;
  error?: string;
};

type InstaloaderMetadataResponse = {
  success: boolean;
  shortcode: string;
  caption?: string | null;
  commentCount?: number | null;
  likeCount?: number | null;
  viewCount?: number | null;
  author?: string | null;
  thumbnailUrl?: string | null;
  error?: string | null;
};

async function fetchMetadataViaInstaloaderOnce(
  reelId: string
): Promise<InstaloaderMetadataResponse | null> {
  try {
    const response = await fetch(`${INSTALOADER_SERVICE_URL}/metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcode: reelId }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as InstaloaderMetadataResponse;
    return data;
  } catch {
    return null;
  }
}

async function fetchMetadataViaInstaloader(
  reelId: string
): Promise<InstaloaderMetadataResponse | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await fetchMetadataViaInstaloaderOnce(reelId);

    if (result === null) {
      return null;
    }

    if (result.success) {
      return result;
    }

    // Check if this is a rate limit error
    if (result.error && isRateLimitError(result.error)) {
      const retryDelay = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
      console.log(
        `  Rate limit on metadata for ${reelId}, waiting ${retryDelay / 1000}s before retry ${attempt + 1}/${MAX_RETRIES}...`
      );
      await sleep(retryDelay);
      continue;
    }

    // Non-rate-limit error, return as is
    return result;
  }

  return null;
}

async function downloadViaInstaloaderOnce(
  reelId: string,
  outputDir: string
): Promise<DownloadResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000); // 60s timeout

    const response = await fetch(`${INSTALOADER_SERVICE_URL}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcode: reelId }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    console.log(`  Response status: ${response.status}`);

    // Check if response is video bytes or JSON error
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("video/mp4")) {
      // Success - got video bytes
      const videoBuffer = await response.arrayBuffer();
      const filename = `${reelId}.mp4`;
      const filepath = join(outputDir, filename);
      const buffer = Buffer.from(videoBuffer);

      await writeFile(filepath, buffer);

      return { success: true, filename, buffer };
    }

    // Error response (JSON)
    if (response.ok) {
      const data = (await response.json()) as {
        success: boolean;
        error?: string;
      };
      return {
        success: false,
        error: data.error || "Unknown error",
      };
    }

    return {
      success: false,
      error: `Service returned ${response.status}`,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`  Timeout downloading ${reelId}`);
      return { success: false, error: "Download timeout (60s)" };
    }
    console.error(`  Error downloading ${reelId}:`, error);
    return {
      success: false,
      error: `Failed to connect to instaloader service: ${error}`,
    };
  }
}

async function downloadViaInstaloader(
  reelId: string,
  outputDir: string
): Promise<DownloadResult> {
  console.log(`  Downloading ${reelId} via instaloader service...`);

  let lastError = "";

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await downloadViaInstaloaderOnce(reelId, outputDir);

    if (result.success) {
      return result;
    }

    lastError = result.error || "Unknown error";

    // Check if this is a rate limit error
    if (isRateLimitError(lastError)) {
      const retryDelay = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
      console.log(
        `  Rate limit detected for ${reelId}, waiting ${retryDelay / 1000}s before retry ${attempt + 1}/${MAX_RETRIES}...`
      );
      await sleep(retryDelay);
      continue;
    }

    // Non-rate-limit error, don't retry
    break;
  }

  return { success: false, error: lastError };
}

// biome-ignore lint: функция делает best-effort metadata update + download + обновление статуса.
async function downloadSingleVideo(
  reel: Reel,
  outputDir: string
): Promise<string> {
  // Best-effort: fill metadata (views/comments/caption/author/thumb) before download.
  const meta = await fetchMetadataViaInstaloader(reel.id);
  if (meta?.success) {
    const data: {
      caption?: string;
      author?: string;
      thumbnailUrl?: string;
      viewCount?: number;
      likeCount?: number;
      commentCount?: number;
    } = {};

    if (typeof meta.caption === "string" && meta.caption.trim().length > 0) {
      data.caption = meta.caption;
    }
    if (typeof meta.author === "string" && meta.author.trim().length > 0) {
      data.author = meta.author;
    }
    if (
      typeof meta.thumbnailUrl === "string" &&
      meta.thumbnailUrl.trim().length > 0
    ) {
      data.thumbnailUrl = meta.thumbnailUrl;
    }
    if (typeof meta.viewCount === "number") {
      data.viewCount = meta.viewCount;
    }
    if (typeof meta.likeCount === "number") {
      data.likeCount = meta.likeCount;
    }
    if (typeof meta.commentCount === "number") {
      data.commentCount = meta.commentCount;
    }

    if (Object.keys(data).length > 0) {
      await prisma.reel
        .update({
          where: { id: reel.id },
          data,
        })
        .catch(() => {
          // ignore metadata update failures
        });
    }
  }

  const result = await downloadViaInstaloader(reel.id, outputDir);

  if (result.success && result.filename && result.buffer) {
    const filepath = join(outputDir, result.filename);
    const s3Key = getS3Key("reels", reel.id);

    // Get video duration before potentially deleting local file
    const duration = await getVideoDuration(filepath);
    if (duration) {
      console.log(`  ✓ Video duration: ${duration}s`);
    }

    // Upload to S3 if configured
    if (isS3Configured()) {
      try {
        await s3Service.uploadFile(s3Key, result.buffer, "video/mp4");
        console.log(`  ✓ Uploaded to S3: ${s3Key}`);

        // Delete local file after successful S3 upload
        await unlink(filepath).catch(() => {
          // Ignore delete errors
        });
        console.log(`  ✓ Deleted local file: ${filepath}`);

        // Update database with s3Key and duration
        await prisma.reel.update({
          where: { id: reel.id },
          data: {
            s3Key,
            localPath: null, // Clear local path since file is in S3
            status: "downloaded",
            duration,
          },
        });
      } catch (s3Error) {
        console.error(`  ✗ S3 upload failed for ${reel.id}:`, s3Error);
        // Fall back to local storage
        await prisma.reel.update({
          where: { id: reel.id },
          data: {
            localPath: filepath,
            status: "downloaded",
            duration,
          },
        });
      }
    } else {
      // S3 not configured, use local storage
      await prisma.reel.update({
        where: { id: reel.id },
        data: {
          localPath: filepath,
          status: "downloaded",
          duration,
        },
      });
    }

    console.log(`  ✓ Downloaded: ${result.filename}`);
    return result.filename;
  }

  console.error(`  ✗ Failed ${reel.id}: ${result.error}`);
  throw new Error(result.error || "Download failed");
}

export async function downloadVideos(
  reels: Reel[],
  folder: string,
  onProgress?: (downloaded: number, filename: string) => void
): Promise<string[]> {
  const outputDir = join(DOWNLOADS_DIR, folder);
  await ensureDir(outputDir);

  const downloadedFiles: string[] = [];

  // Download sequentially with delay to avoid rate limiting
  for (let i = 0; i < reels.length; i++) {
    const reel = reels[i];
    if (!reel) {
      continue;
    }

    // Add delay between downloads (skip before first one)
    if (i > 0) {
      console.log(
        `  Waiting ${DOWNLOAD_DELAY_MS / 1000}s before next download...`
      );
      await sleep(DOWNLOAD_DELAY_MS);
    }

    try {
      const filename = await downloadSingleVideo(reel, outputDir);
      downloadedFiles.push(filename);
      onProgress?.(downloadedFiles.length, filename);
    } catch {
      // Error already logged in downloadSingleVideo
    }
  }

  return downloadedFiles;
}

export function getDownloadsPath(hashtag?: string): string {
  return hashtag ? join(DOWNLOADS_DIR, hashtag) : DOWNLOADS_DIR;
}
