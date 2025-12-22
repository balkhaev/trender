import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// S3/MinIO configuration
const S3_ENDPOINT = process.env.S3_ENDPOINT || "http://localhost:9000";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "";
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "";
const S3_BUCKET = process.env.S3_BUCKET || "trender";
const S3_REGION = process.env.S3_REGION || "us-east-1";

// Check if S3 is configured
export function isS3Configured(): boolean {
  return !!(S3_ACCESS_KEY && S3_SECRET_KEY && S3_ENDPOINT);
}

// Create S3 client (lazy initialization)
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }
  return s3Client;
}

// File types for S3 storage
export type S3FileType = "reels" | "generations" | "thumbnails" | "references";

/**
 * Generate S3 key for a file
 * @param type - File type category
 * @param id - File identifier (can include extension like "abc.jpg")
 * @param extension - Extension to append if not already in id (default: mp4)
 */
export function getS3Key(
  type: S3FileType,
  id: string,
  extension = "mp4"
): string {
  // If id already has an extension, use it directly
  if (id.includes(".")) {
    return `${type}/${id}`;
  }
  return `${type}/${id}.${extension}`;
}

const S3_KEY_REGEX = /^(reels|generations|thumbnails|references)\/(.+)\.\w+$/;

/**
 * Parse S3 key to extract type and id
 */
export function parseS3Key(
  key: string
): { type: S3FileType; id: string } | null {
  const match = key.match(S3_KEY_REGEX);
  if (!(match?.[1] && match[2])) {
    return null;
  }
  return { type: match[1] as S3FileType, id: match[2] };
}

export type FileMetadata = {
  contentLength: number;
  contentType: string;
  lastModified: Date | undefined;
};

class S3Service {
  /**
   * Upload a file to S3
   */
  async uploadFile(
    key: string,
    body: Buffer | Uint8Array,
    contentType = "video/mp4"
  ): Promise<void> {
    const client = getS3Client();

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await client.send(command);
    console.log(`[S3] Uploaded: ${key} (${body.length} bytes)`);
  }

  /**
   * Download a file from S3
   */
  async downloadFile(key: string): Promise<Buffer | null> {
    const client = getS3Client();

    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      });

      const response = await client.send(command);

      if (!response.Body) {
        return null;
      }

      const bytes = await response.Body.transformToByteArray();
      console.log(`[S3] Downloaded: ${key} (${bytes.length} bytes)`);
      return Buffer.from(bytes);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        console.log(`[S3] File not found: ${key}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(key: string): Promise<void> {
    const client = getS3Client();

    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    await client.send(command);
    console.log(`[S3] Deleted: ${key}`);
  }

  /**
   * Check if a file exists in S3
   */
  async fileExists(key: string): Promise<boolean> {
    const client = getS3Client();

    try {
      const command = new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      });

      await client.send(command);
      return true;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata from S3
   */
  async getFileMetadata(key: string): Promise<FileMetadata | null> {
    const client = getS3Client();

    try {
      const command = new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      });

      const response = await client.send(command);

      return {
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType ?? "application/octet-stream",
        lastModified: response.LastModified,
      };
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Stream a file from S3 (returns readable stream)
   */
  async getFileStream(
    key: string
  ): Promise<{ stream: ReadableStream; metadata: FileMetadata } | null> {
    const client = getS3Client();

    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      });

      const response = await client.send(command);

      if (!response.Body) {
        return null;
      }

      // AWS SDK returns a web ReadableStream
      const stream = response.Body.transformToWebStream();

      return {
        stream,
        metadata: {
          contentLength: response.ContentLength ?? 0,
          contentType: response.ContentType ?? "application/octet-stream",
          lastModified: response.LastModified,
        },
      };
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  private isNotFoundError(error: unknown): boolean {
    if (error && typeof error === "object" && "name" in error) {
      const name = (error as { name: string }).name;
      return name === "NoSuchKey" || name === "NotFound";
    }
    return false;
  }
}

// Singleton instance
export const s3Service = new S3Service();

/**
 * Get video URL for a reel
 * Returns S3 URL if available, otherwise falls back to videoUrl field
 */
export function getReelVideoUrl(reel: {
  id: string;
  s3Key?: string | null;
  videoUrl?: string | null;
}): string | null {
  // If S3 key is available, construct the S3 URL
  if (reel.s3Key && isS3Configured()) {
    // Return the API endpoint that serves the video
    return `/api/files/reels/${reel.id}`;
  }

  // Fall back to direct video URL
  if (reel.videoUrl) {
    return reel.videoUrl;
  }

  return null;
}

/**
 * Get public URL for S3 file (for Kling API which needs direct access)
 */
export function getS3PublicUrl(key: string): string {
  // For MinIO/S3, construct direct URL
  return `${S3_ENDPOINT}/${S3_BUCKET}/${key}`;
}
