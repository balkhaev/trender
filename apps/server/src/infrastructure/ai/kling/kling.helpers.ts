import jwt from "jsonwebtoken";
import type { KlingApiStatus, KlingTaskStatus } from "./kling.types";

export const TRAILING_SLASH_REGEX = /\/+$/;

/**
 * Generate JWT token for Kling API authentication
 * Token expires in 30 minutes
 */
export function generateJwtToken(accessKey: string, secretKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "HS256" as const,
    typ: "JWT",
  };
  const payload = {
    iss: accessKey,
    exp: now + 1800, // 30 minutes
    nbf: now - 5, // Valid 5 seconds before current time
  };
  return jwt.sign(payload, secretKey, { algorithm: "HS256", header });
}

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}м ${secs}с` : `${secs}с`;
}

/**
 * Map API status to internal status
 */
export function normalizeStatus(apiStatus: KlingApiStatus): KlingTaskStatus {
  switch (apiStatus) {
    case "submitted":
      return "pending";
    case "processing":
      return "processing";
    case "succeed":
      return "completed";
    case "failed":
      return "failed";
  }
}

export const STATUS_RU: Record<KlingTaskStatus, string> = {
  pending: "В очереди",
  processing: "Генерация",
  completed: "Завершено",
  failed: "Ошибка",
};

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
